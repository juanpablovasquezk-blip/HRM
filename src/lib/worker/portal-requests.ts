import { addDays, addMonths, format, parseISO, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { calculateDynamicExpiration } from '@/lib/utils/document-calc';

export const FREE_DAY_REQUEST_REASON = 'Solicitud mensual de días libres';
export const VACATION_REQUEST_REASON = 'Solicitud de vacaciones';

export const VACATION_SUCCESS_MESSAGE =
  'Recibimos tu solicitud de vacaciones. Recursos Humanos revisará tu saldo de días y las fechas solicitadas. Te daremos una respuesta lo antes posible. Puedes consultar el estado en Mis solicitudes.';

export type WorkerPendingDocStatus = 'MISSING' | 'EXPIRED' | 'REJECTED' | 'IN_REVIEW';

export interface WorkerPendingDocItem {
  definitionId: string;
  name: string;
  status: WorkerPendingDocStatus;
  label: string;
  detail: string;
  expirationDate: string | null;
}

export interface WorkerMonthOption {
  yearMonth: string; // YYYY-MM
  label: string;
  isOpen: boolean;
  deadlineDate: string; // YYYY-MM-20 of previous month
}

/**
 * Returns YYYY-MM-DD in America/Santiago timezone.
 */
export function getSantiagoDateString(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Requests for `targetYearMonth` (`YYYY-MM`) close at the end of day 20
 * of the previous month in America/Santiago timezone.
 */
export function getMonthDeadlineDateString(targetYearMonth: string): string {
  const monthStart = parseISO(`${targetYearMonth}-01`);
  const prevMonthStart = addMonths(monthStart, -1);
  return `${format(prevMonthStart, 'yyyy-MM')}-20`;
}

export function isMonthOpenForWorkerRequest(
  targetYearMonth: string,
  now: Date = new Date()
): boolean {
  const todaySantiago = getSantiagoDateString(now);
  const deadline = getMonthDeadlineDateString(targetYearMonth);
  return todaySantiago <= deadline;
}

/**
 * Builds selectable months for the worker free-day selector:
 * current Santiago month + next 3 months (with open/closed status).
 */
export function buildWorkerMonthSelectorOptions(now: Date = new Date()): WorkerMonthOption[] {
  const todaySantiago = getSantiagoDateString(now);
  const baseMonth = startOfMonth(parseISO(`${todaySantiago.slice(0, 7)}-01`));
  const options: WorkerMonthOption[] = [];

  for (let offset = 0; offset <= 3; offset++) {
    const m = addMonths(baseMonth, offset);
    const yearMonth = format(m, 'yyyy-MM');
    const rawLabel = format(m, 'MMMM yyyy', { locale: es });
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    const deadlineDate = getMonthDeadlineDateString(yearMonth);
    options.push({
      yearMonth,
      label,
      isOpen: todaySantiago <= deadlineDate,
      deadlineDate,
    });
  }

  return options;
}

export function isFiveByTwoRegime(rotationPattern?: string | null): boolean {
  return appliesFiveDayTwoOffWeeklyRule({ rotationPattern });
}

/**
 * Matches HRM v2 scheduler (`jornada.ts`): every operational worker follows the
 * 5-day / 2-days-off weekly rule unless explicitly excluded (4x4_noche titulares,
 * 7x7, or non-shift administrative staff). Patterns like `5X2`, `BLUE_DIA-3`,
 * `BLUE_NOCHE-*`, and `L-V` all follow the 5-day / 2-days-off rule.
 */
export function appliesFiveDayTwoOffWeeklyRule(params: {
  rotationPattern?: string | null;
  ns22AnchorDate?: string | null;
  requiresShifts?: boolean | null;
}): boolean {
  if (params.requiresShifts === false) return false;
  if (params.ns22AnchorDate) return false;
  const norm = (params.rotationPattern || '').toUpperCase().replace(/×/g, 'X');
  if (norm.includes('4X4') || norm.includes('7X7')) return false;
  return true;
}

export function validateWeeklyFreeDayQuota(params: {
  rotationPattern?: string | null;
  ns22AnchorDate?: string | null;
  requiresShifts?: boolean | null;
  birthDate?: string | null;
  existingFreeRequests: any[];
  selectedDates: string[];
}): { valid: boolean; message: string | null; exceededDates: string[] } {
  const {
    rotationPattern,
    ns22AnchorDate,
    requiresShifts,
    birthDate,
    existingFreeRequests,
    selectedDates,
  } = params;
  if (
    !appliesFiveDayTwoOffWeeklyRule({ rotationPattern, ns22AnchorDate, requiresShifts }) ||
    !selectedDates ||
    selectedDates.length === 0
  ) {
    return { valid: true, message: null, exceededDates: [] };
  }

  const birthMonthDay = birthDate && birthDate.length >= 10 ? birthDate.slice(5, 10) : null;

  // Group selected dates by Monday-to-Sunday week
  const weeks = new Map<string, string[]>();
  for (const d of selectedDates) {
    const dt = parseISO(d);
    const dayOfWeek = dt.getDay(); // 0=Sun, 1=Mon..6=Sat
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = addDays(dt, diffToMon);
    const weekKey = format(monday, 'yyyy-MM-dd');
    const list = weeks.get(weekKey) || [];
    list.push(d);
    weeks.set(weekKey, list);
  }

  const dayNameEs = (iso: string) =>
    format(parseISO(iso), 'EEEE', { locale: es }).toLowerCase();

  for (const [weekStartStr, selectedInWeek] of weeks.entries()) {
    const monday = parseISO(weekStartStr);
    const sundayStr = format(addDays(monday, 6), 'yyyy-MM-dd');

    const birthdayDates: string[] = [];
    if (birthMonthDay) {
      for (let i = 0; i < 7; i++) {
        const dStr = format(addDays(monday, i), 'yyyy-MM-dd');
        if (dStr.slice(5, 10) === birthMonthDay) {
          birthdayDates.push(dStr);
        }
      }
    }

    const existingDates = new Set<string>();
    for (const req of existingFreeRequests || []) {
      if (req.status !== 'pending' && req.status !== 'approved') continue;
      if (req.type !== 'other' || req.reason !== FREE_DAY_REQUEST_REASON) continue;
      for (const d of expandDateRange(req.start_date, req.end_date)) {
        if (d >= weekStartStr && d <= sundayStr) {
          existingDates.add(d);
        }
      }
    }

    const union = new Set<string>([
      ...birthdayDates,
      ...existingDates,
      ...selectedInWeek,
    ]);

    if (union.size > 2) {
      const bdayList = birthdayDates.sort();
      const existingList = Array.from(existingDates).sort();
      let message: string;
      if (bdayList.length > 0 && existingList.length > 0) {
        const bName = dayNameEs(bdayList[0]);
        const eName = dayNameEs(existingList[0]);
        message = `El ${bName} ya tienes libre por tu cumpleaños. Con el ${eName} completas tus dos días libres de esta semana.`;
      } else if (bdayList.length > 0) {
        const bName = dayNameEs(bdayList[0]);
        message = `El ${bName} ya tienes libre por tu cumpleaños. Solo puedes elegir un día libre adicional esta semana (elige uno).`;
      } else {
        message = 'Ya completas tus dos días libres permitidos para esta semana (lunes a domingo). Elige otra fecha.';
      }
      return { valid: false, message, exceededDates: selectedInWeek };
    }
  }

  return { valid: true, message: null, exceededDates: [] };
}

export function expandDateRange(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || startDate > endDate) return [];
  const dates: string[] = [];
  let cursor = parseISO(startDate);
  const end = parseISO(endDate);
  while (cursor <= end) {
    dates.push(format(cursor, 'yyyy-MM-dd'));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/**
 * Evaluates applicable documents for a worker's profile and returns those that
 * require action or are waiting validation: MISSING, EXPIRED, REJECTED, IN_REVIEW.
 */
export function evaluateWorkerPendingDocuments(params: {
  definitions: any[];
  existingDocuments: any[];
  todayStr: string;
}): WorkerPendingDocItem[] {
  const { definitions, existingDocuments, todayStr } = params;
  if (!definitions || definitions.length === 0) return [];

  const pcpDef = definitions.find((d: any) => (d.name || '').toLowerCase().includes('pcp'));
  const ticaDef = definitions.find((d: any) => (d.name || '').toLowerCase().includes('tica'));
  const items: WorkerPendingDocItem[] = [];

  for (const def of definitions) {
    const doc = existingDocuments.find(
      (d) =>
        d.definition_id === def.id ||
        (d.type || '').toLowerCase().trim() === (def.name || '').toLowerCase().trim()
    );

    if (!doc) {
      if (def.is_mandatory !== false) {
        items.push({
          definitionId: def.id,
          name: def.name,
          status: 'MISSING',
          label: 'Faltante',
          detail: 'Debes subir este documento obligatorio.',
          expirationDate: null,
        });
      }
      continue;
    }

    if (doc.status === 'REJECTED') {
      items.push({
        definitionId: def.id,
        name: def.name,
        status: 'REJECTED',
        label: 'Rechazado',
        detail: doc.rejection_reason
          ? `Rechazado: ${doc.rejection_reason}. Súbelo corregido.`
          : 'Documento rechazado. Debes corregirlo y volver a subirlo.',
        expirationDate: doc.expiration_date || null,
      });
      continue;
    }

    let expirationDate: string | null = doc.expiration_date || null;
    const defNameLower = (def.name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    let targetAnchorDefId = def.depends_on_definition_id;
    if (defNameLower.includes('hoja de vida') && pcpDef) {
      targetAnchorDefId = pcpDef.id;
    } else if (defNameLower.includes('antecedentes') && ticaDef) {
      targetAnchorDefId = ticaDef.id;
    }

    if (targetAnchorDefId) {
      const anchorDef = definitions.find((d) => d.id === targetAnchorDefId);
      const anchorDoc = existingDocuments.find(
        (d) =>
          d.definition_id === targetAnchorDefId ||
          (anchorDef && (d.type || '').toLowerCase().trim() === (anchorDef.name || '').toLowerCase().trim())
      );
      if (anchorDoc?.expiration_date) {
        const calcDate = calculateDynamicExpiration(
          new Date(`${anchorDoc.expiration_date}T12:00:00`),
          def.cycle_months || 6,
          def.anchor_days_offset || 30
        );
        expirationDate = calcDate.toISOString().split('T')[0];
      }
    }

    if (expirationDate && expirationDate < todayStr) {
      items.push({
        definitionId: def.id,
        name: def.name,
        status: 'EXPIRED',
        label: 'Vencido',
        detail: `Venció el ${format(parseISO(expirationDate), 'dd-MM-yyyy')}. Debes renovarlo.`,
        expirationDate,
      });
      continue;
    }

    if (doc.status !== 'APPROVED') {
      items.push({
        definitionId: def.id,
        name: def.name,
        status: 'IN_REVIEW',
        label: 'En revisión',
        detail: 'Documento enviado, esperando validación de RR. HH.',
        expirationDate,
      });
    }
  }

  return items;
}
