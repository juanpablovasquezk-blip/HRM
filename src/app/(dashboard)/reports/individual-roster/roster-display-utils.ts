import { getChileNationalHolidaysForRange, type ChileNationalHoliday } from '@/lib/scheduler/v2/chile-holidays';

export type RosterDestinationKey = 'dhl' | 'fedex' | 'blue_express' | 'minerquim' | 'other';

export interface RosterCellColorStyle {
  backgroundColor: string;
  color: string;
}

export interface ResolvedAssignmentDisplay {
  label: string;
  destinationKey: RosterDestinationKey;
  style: RosterCellColorStyle;
}

export const SUNDAY_OR_HOLIDAY_HEADER_STYLE: RosterCellColorStyle = {
  backgroundColor: '#E2E8F0',
  color: '#0F172A',
};

export const SUNDAY_OR_HOLIDAY_CELL_STYLE: RosterCellColorStyle = {
  backgroundColor: '#F1F5F9',
  color: '#0F172A',
};

export const LIBRE_CELL_STYLE: RosterCellColorStyle = {
  backgroundColor: '#F1F5F9',
  color: '#475569',
};

const DESTINATION_STYLES: Record<Exclude<RosterDestinationKey, 'other'>, RosterCellColorStyle> = {
  dhl: {
    backgroundColor: '#FACC15',
    color: '#111827',
  },
  fedex: {
    backgroundColor: '#7E22CE',
    color: '#FFFFFF',
  },
  blue_express: {
    backgroundColor: '#1D4ED8',
    color: '#FFFFFF',
  },
  minerquim: {
    backgroundColor: '#F97316',
    color: '#111827',
  },
};

export function normalizeRosterDestination(rawLabel: string): {
  label: string;
  destinationKey: RosterDestinationKey;
} {
  const trimmed = (rawLabel || '').trim();
  const compact = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ');
  const noSpaces = compact.replace(/\s+/g, '');

  if (noSpaces.includes('BLUEEXPRESS')) {
    return {
      label: noSpaces === 'BLUEEXPRESS' ? 'BLUE EXPRESS' : compact.replace(/BLUEEXPRESS/g, 'BLUE EXPRESS'),
      destinationKey: 'blue_express',
    };
  }
  if (compact.includes('DHL')) {
    return { label: compact, destinationKey: 'dhl' };
  }
  if (compact.includes('FEDEX')) {
    return { label: compact, destinationKey: 'fedex' };
  }
  if (
    compact.includes('AEROPUERTO') ||
    compact.includes('ATREX') ||
    compact.includes('MINERQUIM') ||
    compact.includes('CANES')
  ) {
    return { label: compact, destinationKey: 'minerquim' };
  }

  return { label: compact, destinationKey: 'other' };
}

export function resolveRosterAssignmentDisplay(params: {
  assignment?: { area?: { name?: string | null } | null; position?: { name?: string | null } | null } | null;
  leave?: { type?: string | null } | null;
  isSundayOrHoliday: boolean;
}): ResolvedAssignmentDisplay {
  const { assignment, leave, isSundayOrHoliday } = params;

  if (leave) {
    const label =
      leave.type === 'vacation'
        ? 'VACACIONES'
        : leave.type === 'sick'
        ? 'LICENCIA'
        : 'PERMISO';
    return {
      label,
      destinationKey: 'other',
      style: isSundayOrHoliday
        ? SUNDAY_OR_HOLIDAY_CELL_STYLE
        : { backgroundColor: '#FFFFFF', color: '#0F172A' },
    };
  }

  if (!assignment) {
    return {
      label: 'LIBRE',
      destinationKey: 'other',
      style: LIBRE_CELL_STYLE,
    };
  }

  const areaName = assignment.area?.name || '';
  const posName = assignment.position?.name || '';
  const rawLabel = areaName.toLowerCase().includes('bodega')
    ? posName.replace(/operador\s+/gi, '').trim()
    : areaName.trim();

  const { label, destinationKey } = normalizeRosterDestination(rawLabel);

  if (destinationKey !== 'other') {
    return {
      label,
      destinationKey,
      style: DESTINATION_STYLES[destinationKey],
    };
  }

  return {
    label: label || 'ASIGNADO',
    destinationKey: 'other',
    style: isSundayOrHoliday
      ? SUNDAY_OR_HOLIDAY_CELL_STYLE
      : { backgroundColor: '#FFFFFF', color: '#0F172A' },
  };
}

export function getRosterDisplayHolidays(
  displayStartDate: string,
  displayEndDate: string
): Map<string, ChileNationalHoliday> {
  return getChileNationalHolidaysForRange(displayStartDate, displayEndDate).holidaysByDate;
}
