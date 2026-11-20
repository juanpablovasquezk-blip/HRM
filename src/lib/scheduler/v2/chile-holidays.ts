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
};

function normLabel(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim();
}

const CRANE_OPERATOR_EXACT_NAMES = new Set([
  'OPERADOR DE GRUA',
  'OPERADOR GRUA',
]);

const SUPERVISOR_EXACT_NAMES = new Set(['SUPERVISOR']);

/**
 * Returns true ONLY for the three exact normalized pairs whose ordinary staffing
 * requirement becomes 0 on Chilean national holidays:
 * - Atrex — Operador de grúa
 * - Base — Operador de grúa
 * - Base — Supervisor
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

  if (area === 'ATREX' && CRANE_OPERATOR_EXACT_NAMES.has(pos)) return true;
  if (area === 'BASE' && (CRANE_OPERATOR_EXACT_NAMES.has(pos) || SUPERVISOR_EXACT_NAMES.has(pos))) {
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
