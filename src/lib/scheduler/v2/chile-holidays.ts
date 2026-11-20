export interface ChileNationalHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  irrenunciable?: boolean;
}

export interface VerifiedHolidayYearCalendar {
  year: number;
  source: string;
  reviewed_at: string; // YYYY-MM-DD
  holidays: ChileNationalHoliday[];
}

/**
 * Verified Chilean NATIONAL legal holidays by year.
 * Explicitly excludes regional and communal holidays (e.g. Jun 7 Arica, Aug 20 Chillán).
 */
export const CHILE_NATIONAL_HOLIDAYS_BY_YEAR: Record<number, VerifiedHolidayYearCalendar> = {
  2026: {
    year: 2026,
    source: 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.973 y modificaciones vigentes)',
    reviewed_at: '2026-11-20',
    holidays: [
      { date: '2026-01-01', name: 'Año Nuevo', irrenunciable: true },
      { date: '2026-04-03', name: 'Viernes Santo' },
      { date: '2026-04-04', name: 'Sábado Santo' },
      { date: '2026-05-01', name: 'Día Nacional del Trabajo', irrenunciable: true },
      { date: '2026-05-21', name: 'Día de las Glorias Navales' },
      { date: '2026-06-21', name: 'Día Nacional de los Pueblos Indígenas' },
      { date: '2026-06-29', name: 'San Pedro y San Pablo' },
      { date: '2026-07-16', name: 'Día de la Virgen del Carmen' },
      { date: '2026-08-15', name: 'Asunción de la Virgen' },
      { date: '2026-09-18', name: 'Independencia Nacional', irrenunciable: true },
      { date: '2026-09-19', name: 'Día de las Glorias del Ejército', irrenunciable: true },
      { date: '2026-10-12', name: 'Encuentro de Dos Mundos' },
      { date: '2026-10-31', name: 'Día de las Iglesias Evangélicas y Protestantes' },
      { date: '2026-11-01', name: 'Día de Todos los Santos' },
      { date: '2026-12-08', name: 'Inmaculada Concepción' },
      { date: '2026-12-25', name: 'Navidad', irrenunciable: true },
    ],
  },
  2027: {
    year: 2027,
    source: 'Gob.cl / LeyChile BCN (Ley 2.977, Ley 19.668, Ley 19.973, Ley 20.148, Ley 20.299, Ley 20.629, Ley 20.983, Ley 21.357)',
    reviewed_at: '2026-11-20',
    holidays: [
      { date: '2027-01-01', name: 'Año Nuevo', irrenunciable: true },
      { date: '2027-03-26', name: 'Viernes Santo' },
      { date: '2027-03-27', name: 'Sábado Santo' },
      { date: '2027-05-01', name: 'Día Nacional del Trabajo', irrenunciable: true },
      { date: '2027-05-21', name: 'Día de las Glorias Navales' },
      { date: '2027-06-21', name: 'Día Nacional de los Pueblos Indígenas' },
      { date: '2027-06-28', name: 'San Pedro y San Pablo' },
      { date: '2027-07-16', name: 'Día de la Virgen del Carmen' },
      { date: '2027-08-15', name: 'Asunción de la Virgen' },
      { date: '2027-09-17', name: 'Feriado adicional de Fiestas Patrias' },
      { date: '2027-09-18', name: 'Independencia Nacional', irrenunciable: true },
      { date: '2027-09-19', name: 'Día de las Glorias del Ejército', irrenunciable: true },
      { date: '2027-10-11', name: 'Encuentro de Dos Mundos' },
      { date: '2027-10-31', name: 'Día Nacional de las Iglesias Evangélicas y Protestantes' },
      { date: '2027-11-01', name: 'Día de Todos los Santos' },
      { date: '2027-12-08', name: 'Inmaculada Concepción' },
      { date: '2027-12-25', name: 'Navidad', irrenunciable: true },
    ],
  },
};

function normLabel(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim();
}

const ATREX_EXACT_AREA_NAMES = new Set(['ATREX']);
const BASE_EXACT_AREA_NAMES = new Set(['BASE', 'BASE MINERQUIM']);

const CRANE_OPERATOR_EXACT_NAMES = new Set([
  'OPERADOR DE GRUA',
  'OPERADOR GRUA',
  'OPERADOR GRUA HORQUILLA',
  'OPERADOR DE GRUA HORQUILLA',
]);

const SUPERVISOR_EXACT_NAMES = new Set(['SUPERVISOR', 'SUPERVISOR BASE']);

/**
 * Returns true ONLY for the three exact normalized pairs whose ordinary staffing
 * requirement becomes 0 on Chilean national holidays:
 * - Atrex — Operador de grúa / Operador Grúa Horquilla
 * - Base / Base Minerquim — Operador de grúa / Operador Grúa Horquilla
 * - Base / Base Minerquim — Supervisor / Supervisor Base
 *
 * Uses exact normalized full names (and explicit optional ID pairs) to avoid
 * false positives on similar names like "Bodega Base — Supervisor de Bodega".
 */
export function isHolidayZeroStaffingPair(
  areaName?: string | null,
  positionName?: string | null,
  options?: {
    areaId?: string | null;
    positionId?: string | null;
    explicitPairKeys?: Set<string>;
  }
): boolean {
  if (
    options?.explicitPairKeys &&
    options.areaId &&
    options.positionId &&
    options.explicitPairKeys.has(`${options.areaId}|${options.positionId}`)
  ) {
    return true;
  }

  const area = normLabel(areaName);
  const pos = normLabel(positionName);
  if (!area || !pos) return false;

  if (ATREX_EXACT_AREA_NAMES.has(area) && CRANE_OPERATOR_EXACT_NAMES.has(pos)) return true;
  if (BASE_EXACT_AREA_NAMES.has(area) && (CRANE_OPERATOR_EXACT_NAMES.has(pos) || SUPERVISOR_EXACT_NAMES.has(pos))) {
    return true;
  }

  return false;
}

export interface HolidayRangeLookup {
  holidaysByDate: Map<string, ChileNationalHoliday>;
  missingYears: number[];
  warnings: string[];
}

/**
 * Looks up verified national legal holidays for all years touched by [startDate, endDate].
 * Emits an explicit warning if any selected year lacks a verified calendar.
 */
export function getChileNationalHolidaysForRange(
  startDate: string,
  endDate: string,
  calendarRegistry: Record<number, VerifiedHolidayYearCalendar> = CHILE_NATIONAL_HOLIDAYS_BY_YEAR
): HolidayRangeLookup {
  const holidaysByDate = new Map<string, ChileNationalHoliday>();
  const missingYears: number[] = [];
  const warnings: string[] = [];

  if (!startDate || !endDate || startDate > endDate) {
    return { holidaysByDate, missingYears, warnings };
  }

  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  if (isNaN(startYear) || isNaN(endYear)) {
    return { holidaysByDate, missingYears, warnings };
  }

  for (let year = startYear; year <= endYear; year++) {
    const cal = calendarRegistry[year];
    if (!cal) {
      missingYears.push(year);
      warnings.push(
        `Falta el calendario verificado de feriados legales nacionales de Chile para el año ${year}.`
      );
      continue;
    }

    for (const h of cal.holidays) {
      if (h.date >= startDate && h.date <= endDate) {
        holidaysByDate.set(h.date, h);
      }
    }
  }

  return { holidaysByDate, missingYears, warnings };
}

/**
 * Identifica los IDs de requerimientos ordinarios (`is_extra === false`) en una fecha
 * de feriado nacional verificado que corresponden únicamente a los 3 pares excluidos.
 * Conserva Blue Express, demás cargos y requerimientos extra.
 */
export function findHolidayZeroStaffingRequirementIds(
  rows: Array<{
    id: string;
    date: string;
    is_extra?: boolean | null;
    area?: { name?: string | null } | null;
    position?: { name?: string | null } | null;
  }>,
  targetDate: string,
  calendarRegistry: Record<number, VerifiedHolidayYearCalendar> = CHILE_NATIONAL_HOLIDAYS_BY_YEAR
): { isNationalHoliday: boolean; holidayName: string | null; matchedIds: string[] } {
  const lookup = getChileNationalHolidaysForRange(targetDate, targetDate, calendarRegistry);
  const holiday = lookup.holidaysByDate.get(targetDate);
  if (!holiday) {
    return { isNationalHoliday: false, holidayName: null, matchedIds: [] };
  }

  const matchedIds = rows
    .filter((r) => {
      if (Boolean(r.is_extra)) return false;
      const d = String(r.date).split('T')[0];
      if (d !== targetDate) return false;
      return isHolidayZeroStaffingPair(r.area?.name, r.position?.name);
    })
    .map((r) => r.id);

  return {
    isNationalHoliday: true,
    holidayName: holiday.name,
    matchedIds,
  };
}

export interface HolidayZeroStaffingFixItem {
  id: string;
  date: string;
  area_name: string;
  position_name: string;
  shift_name: string;
  required_count: number;
}

export interface GenerateMonthHolidayPreview {
  start_date: string;
  end_date: string;
  holidays: ChileNationalHoliday[];
  missing_years: number[];
  warnings: string[];
  has_unverified_years: boolean;
  existing_zero_staffing_to_fix: HolidayZeroStaffingFixItem[];
}

/**
 * Construye la vista previa de feriados nacionales al inicio de "Generar Mes":
 * - Verifica todos los años cubiertos por [startDate, endDate] (incluido cruce a enero).
 * - Advierte y bloquea el tratamiento automático como día normal si falta algún año.
 * - Identifica cupos ordinarios ya generados en feriados para los 3 pares excluidos.
 */
export function buildGenerateMonthHolidayPreview(params: {
  startDate: string;
  endDate: string;
  existingOrdinaryRows?: Array<{
    id: string;
    date: string;
    required_count: number;
    is_extra?: boolean | null;
    area?: { name?: string | null } | null;
    position?: { name?: string | null } | null;
    shift?: { name?: string | null } | null;
  }>;
  calendarRegistry?: Record<number, VerifiedHolidayYearCalendar>;
}): GenerateMonthHolidayPreview {
  const { startDate, endDate, existingOrdinaryRows = [], calendarRegistry = CHILE_NATIONAL_HOLIDAYS_BY_YEAR } = params;
  const lookup = getChileNationalHolidaysForRange(startDate, endDate, calendarRegistry);
  const holidays = Array.from(lookup.holidaysByDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const hasUnverifiedYears = lookup.missingYears.length > 0;
  const warnings = [...lookup.warnings];
  if (hasUnverifiedYears) {
    warnings.push(
      'No se guardará automáticamente el rango mientras falte un calendario verificado, para evitar tratar feriados como días normales.'
    );
  }

  const existingToFix: HolidayZeroStaffingFixItem[] = [];
  for (const r of existingOrdinaryRows) {
    if (Boolean(r.is_extra)) continue;
    const d = String(r.date).split('T')[0];
    if (!lookup.holidaysByDate.has(d)) continue;
    if (isHolidayZeroStaffingPair(r.area?.name, r.position?.name)) {
      existingToFix.push({
        id: r.id,
        date: d,
        area_name: r.area?.name || '—',
        position_name: r.position?.name || '—',
        shift_name: r.shift?.name || '—',
        required_count: r.required_count,
      });
    }
  }

  return {
    start_date: startDate,
    end_date: endDate,
    holidays,
    missing_years: lookup.missingYears,
    warnings,
    has_unverified_years: hasUnverifiedYears,
    existing_zero_staffing_to_fix: existingToFix,
  };
}
