import { eachDayOfInterval, format, getDay, parseISO } from 'date-fns';
import {
  CHILE_NATIONAL_HOLIDAYS_BY_YEAR,
  getChileNationalHolidaysForRange,
  isHolidayZeroStaffingPair,
  type VerifiedHolidayYearCalendar,
} from '../../../../lib/scheduler/v2/chile-holidays';
import {
  normalizePriority,
  normalizePriorityOverrides,
  normalizePriorityQuotaItems,
  PRIORITY_RANK,
  resolveDayPriority,
  sumPriorityQuotas,
  type OperationalPriority,
  type PriorityQuotaItem,
  type TemplatePriorityQuotaRow,
} from './matrix-utils';

export interface RequirementTemplateRow {
  area_id: string;
  position_id: string;
  shift_id: string;
  required_count: number;
  days_of_week: number[];
  priority?: string | null;
  priority_overrides?: Record<string, string> | null;
  is_active?: boolean;
}

export interface MaterializedRequirementInsert {
  area_id: string;
  position_id: string;
  shift_id: string;
  required_count: number;
  priority: OperationalPriority;
  priority_quotas?: PriorityQuotaItem[];
  date: string;
  is_extra: false;
}

export interface ExistingRequirementKeyRow {
  area_id: string;
  position_id: string;
  shift_id: string;
  date: string;
  is_extra?: boolean | null;
}

export function buildRequirementSlotKey(row: {
  area_id: string;
  position_id: string;
  shift_id: string;
  date: string;
}): string {
  return `${row.area_id}|${row.position_id}|${row.shift_id}|${row.date}`;
}

export interface MaterializeHolidayOptions {
  areaNameById?: Map<string, string>;
  positionNameById?: Map<string, string>;
  calendarRegistry?: Record<number, VerifiedHolidayYearCalendar>;
  warningsOut?: string[];
  templateQuotas?: TemplatePriorityQuotaRow[];
}

/**
 * Consolidates active templates into daily requirement rows for [startDate, endDate].
 * Sums required_count when multiple templates match the same (area, position, shift, date).
 * On verified Chilean national holidays, leaves ordinary staffing at 0 for
 * Atrex—Operador de grúa, Base—Operador de grúa, and Base—Supervisor.
 */
export function buildConsolidatedRequirements(
  templates: RequirementTemplateRow[],
  startDate: string,
  endDate: string,
  holidayOptions?: MaterializeHolidayOptions
): MaterializedRequirementInsert[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return [];
  }

  const holidayLookup = getChileNationalHolidaysForRange(
    startDate,
    endDate,
    holidayOptions?.calendarRegistry ?? CHILE_NATIONAL_HOLIDAYS_BY_YEAR
  );
  if (holidayOptions?.warningsOut && holidayLookup.warnings.length > 0) {
    holidayOptions.warningsOut.push(...holidayLookup.warnings);
  }

  const days = eachDayOfInterval({ start, end });
  const groupedInserts = new Map<string, MaterializedRequirementInsert>();

  const quotasByRowDay = new Map<string, PriorityQuotaItem[]>();
  if (Array.isArray(holidayOptions?.templateQuotas)) {
    for (const q of holidayOptions.templateQuotas) {
      const cnt = Number(q.required_count) || 0;
      if (cnt <= 0) continue;
      const qKey = `${q.area_id}|${q.position_id}|${q.shift_id}|${q.day_of_week}`;
      const list = quotasByRowDay.get(qKey) || [];
      list.push({ priority: normalizePriority(q.priority), required_count: cnt });
      quotasByRowDay.set(qKey, list);
    }
  }

  for (const day of days) {
    const dayOfWeek = getDay(day); // 0=Dom, 1=Lun ... 6=Sab
    const dateStr = format(day, 'yyyy-MM-dd');
    const isNationalHoliday = holidayLookup.holidaysByDate.has(dateStr);

    for (const template of templates) {
      if (template.is_active === false) continue;
      if (!Array.isArray(template.days_of_week) || !template.days_of_week.includes(dayOfWeek)) {
        continue;
      }

      if (isNationalHoliday && holidayOptions?.areaNameById && holidayOptions?.positionNameById) {
        const areaName = holidayOptions.areaNameById.get(template.area_id);
        const positionName = holidayOptions.positionNameById.get(template.position_id);
        if (isHolidayZeroStaffingPair(areaName, positionName)) {
          continue;
        }
      }

      const key = buildRequirementSlotKey({
        area_id: template.area_id,
        position_id: template.position_id,
        shift_id: template.shift_id,
        date: dateStr,
      });

      const generalPriority = normalizePriority(template.priority);
      const overrides = normalizePriorityOverrides(template.priority_overrides, generalPriority);
      const effectivePriority = resolveDayPriority(generalPriority, overrides, dayOfWeek);

      const existing = groupedInserts.get(key);
      if (existing) {
        existing.required_count += Number(template.required_count) || 0;
        if (PRIORITY_RANK[effectivePriority] > PRIORITY_RANK[existing.priority]) {
          existing.priority = effectivePriority;
        }
      } else {
        groupedInserts.set(key, {
          area_id: template.area_id,
          position_id: template.position_id,
          shift_id: template.shift_id,
          required_count: Number(template.required_count) || 0,
          priority: effectivePriority,
          date: dateStr,
          is_extra: false,
        });
      }
    }
  }

  const results = Array.from(groupedInserts.values());
  if (quotasByRowDay.size > 0) {
    for (const item of results) {
      const dow = getDay(parseISO(item.date));
      const qKey = `${item.area_id}|${item.position_id}|${item.shift_id}|${dow}`;
      const explicit = normalizePriorityQuotaItems(quotasByRowDay.get(qKey));
      if (explicit.length > 0) {
        item.priority_quotas = explicit;
        item.required_count = sumPriorityQuotas(explicit);
        item.priority = explicit[0].priority; // sorted by PRIORITY_RANK DESC
      }
    }
  }
  return results;
}

/**
 * Filters out requirements that already exist in DB (ordinary, is_extra = false),
 * returning only missing rows to insert and the count of skipped rows.
 */
export function filterMissingRequirements(
  candidateInserts: MaterializedRequirementInsert[],
  existingRows: ExistingRequirementKeyRow[]
): {
  missingInserts: MaterializedRequirementInsert[];
  skippedCount: number;
} {
  const existingKeys = new Set<string>();
  for (const row of existingRows) {
    if (row.is_extra === true) continue;
    existingKeys.add(buildRequirementSlotKey(row));
  }

  const missingInserts: MaterializedRequirementInsert[] = [];
  let skippedCount = 0;

  for (const item of candidateInserts) {
    if (existingKeys.has(buildRequirementSlotKey(item))) {
      skippedCount++;
    } else {
      missingInserts.push(item);
    }
  }

  return { missingInserts, skippedCount };
}
