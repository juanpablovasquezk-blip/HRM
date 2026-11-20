import { addDays, isBefore, parseISO, startOfDay } from 'date-fns';
import {
  normalizePriority,
  PRIORITY_RANK,
} from '../../../app/(dashboard)/shifts/dotacion/matrix-utils';
import {
  CHILE_NATIONAL_HOLIDAYS_BY_YEAR,
  getChileNationalHolidaysForRange,
  isHolidayZeroStaffingPair,
  type ChileNationalHoliday,
  type VerifiedHolidayYearCalendar,
} from './chile-holidays';
import type {
  DotacionCoverageSummary,
  DotacionGroupCoverage,
  DotacionSlot,
  GeneratedAssignmentRef,
  RawExistingAssignment,
  RawShiftRequirement,
  SlotCoverageDetail,
} from './types';

const FREEZE_WINDOW_DAYS = 3;

export function normalizeIsoDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const clean = raw.split('T')[0].trim();
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 2 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return clean;
}

export function buildDotacionSlotKey(parts: {
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
}): string {
  return `${normalizeIsoDate(parts.date)}|${parts.area_id}|${parts.position_id}|${parts.shift_id}`;
}

/**
 * Determines whether an existing assignment is protected against automatic overwrite.
 * Cancelled assignments are never treated as protected coverage.
 */
export function isAssignmentProtected(
  assignment: RawExistingAssignment,
  referenceDate: Date = new Date()
): boolean {
  if (assignment.status === 'cancelled') return false;
  if (
    assignment.is_locked ||
    assignment.is_manual ||
    assignment.frozen_by_rule ||
    assignment.is_validated ||
    assignment.is_published
  ) {
    return true;
  }

  const normalized = normalizeIsoDate(assignment.date);
  if (!normalized) return false;
  const parsed = parseISO(normalized);
  if (isNaN(parsed.getTime())) return false;

  const freezeThreshold = addDays(startOfDay(referenceDate), FREEZE_WINDOW_DAYS);
  return isBefore(startOfDay(parsed), freezeThreshold);
}

function sortSlotsByPriorityAndDate(slots: DotacionSlot[]): DotacionSlot[] {
  return [...slots].sort((a, b) => {
    if (a.priority_rank !== b.priority_rank) {
      return b.priority_rank - a.priority_rank;
    }
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    const areaCmp = a.area_id.localeCompare(b.area_id);
    if (areaCmp !== 0) return areaCmp;
    const posCmp = a.position_id.localeCompare(b.position_id);
    if (posCmp !== 0) return posCmp;
    return a.shift_id.localeCompare(b.shift_id);
  });
}

function consolidateRequirements(
  rawRequirements: RawShiftRequirement[],
  isExtra: boolean,
  holidayContext?: {
    holidaysByDate: Map<string, ChileNationalHoliday>;
    areaNameById?: Map<string, string>;
    positionNameById?: Map<string, string>;
  }
): { grouped: Map<string, DotacionSlot>; excludedHolidayCount: number } {
  const grouped = new Map<string, DotacionSlot>();
  let excludedHolidayCount = 0;

  for (const req of rawRequirements) {
    const reqIsExtra = Boolean(req.is_extra);
    if (reqIsExtra !== isExtra) continue;

    const count = Number(req.required_count) || 0;
    if (count <= 0) continue;

    const date = normalizeIsoDate(req.date);
    if (!date) continue;

    const areaName = req.area?.name ?? holidayContext?.areaNameById?.get(req.area_id) ?? undefined;
    const positionName =
      req.position?.name ??
      req.positions?.name ??
      holidayContext?.positionNameById?.get(req.position_id) ??
      undefined;

    // On Chilean national holidays, ordinary demand is 0 for Atrex Crane, Base Crane, Base Supervisor
    if (!isExtra && holidayContext?.holidaysByDate.has(date)) {
      if (isHolidayZeroStaffingPair(areaName, positionName)) {
        excludedHolidayCount++;
        continue;
      }
    }

    const slotKey = buildDotacionSlotKey({
      date,
      area_id: req.area_id,
      position_id: req.position_id,
      shift_id: req.shift_id,
    });

    const priority = normalizePriority(req.priority);
    const priorityRank = PRIORITY_RANK[priority];
    const existing = grouped.get(slotKey);

    if (existing) {
      existing.requirement_ids.push(req.id);
      existing.required_count += count;
      if (priorityRank > existing.priority_rank) {
        existing.priority = priority;
        existing.priority_rank = priorityRank;
      }
      continue;
    }

    const shift = req.shift ?? null;
    grouped.set(slotKey, {
      slot_key: slotKey,
      requirement_ids: [req.id],
      date,
      area_id: req.area_id,
      position_id: req.position_id,
      shift_id: req.shift_id,
      is_extra: isExtra,
      priority,
      priority_rank: priorityRank,
      required_count: count,
      protected_filled_count: 0,
      remaining_count: count,
      shift_start: shift?.start_time || '00:00',
      shift_end: shift?.end_time || '00:00',
      shift_duration_hours: Number(shift?.duration_hours) || 8,
      requires_transport: Boolean(shift?.requires_transport),
      area_name: areaName,
      position_name: positionName,
      shift_name: shift?.name ?? undefined,
    });
  }

  return { grouped, excludedHolidayCount };
}

function applyProtectedCounts(
  slotMap: Map<string, DotacionSlot>,
  protectedAssignments: RawExistingAssignment[],
  isExtra: boolean
): number {
  let unmatched = 0;

  for (const assignment of protectedAssignments) {
    if (Boolean(assignment.is_extra) !== isExtra) continue;

    const key = buildDotacionSlotKey({
      date: assignment.date,
      area_id: assignment.area_id,
      position_id: assignment.position_id,
      shift_id: assignment.shift_id,
    });

    const slot = slotMap.get(key);
    if (!slot) {
      unmatched++;
      continue;
    }

    slot.protected_filled_count += 1;
    slot.remaining_count = Math.max(0, slot.required_count - slot.protected_filled_count);
  }

  return unmatched;
}

export interface PreparedDotacion {
  ordinarySlots: DotacionSlot[];
  extraSlots: DotacionSlot[];
  protectedOrdinaryAssignments: RawExistingAssignment[];
  protectedExtraAssignments: RawExistingAssignment[];
  unmatchedProtectedOrdinary: number;
  unmatchedProtectedExtra: number;
  holidayWarnings: string[];
  excludedHolidaySlotsCount: number;
}

/**
 * Prepares dated Dotación slots, preserving day-level priorities,
 * applying Chilean national holiday exclusions for the 3 operational pairs,
 * separating ordinary vs extra requirements, and counting protected
 * assignments strictly in their exact (date, area, position, shift, is_extra) slot.
 */
export function prepareDotacionSlots(
  rawRequirements: RawShiftRequirement[],
  existingAssignments: RawExistingAssignment[],
  options?: {
    referenceDate?: Date;
    areaNameById?: Map<string, string>;
    positionNameById?: Map<string, string>;
    calendarRegistry?: Record<number, VerifiedHolidayYearCalendar>;
  }
): PreparedDotacion {
  const referenceDate = options?.referenceDate ?? new Date();
  const protectedAll = existingAssignments.filter((a) =>
    isAssignmentProtected(a, referenceDate)
  );
  const protectedOrdinaryAssignments = protectedAll.filter((a) => !a.is_extra);
  const protectedExtraAssignments = protectedAll.filter((a) => Boolean(a.is_extra));

  const dates = rawRequirements
    .map((r) => normalizeIsoDate(r.date))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const holidayLookup =
    dates.length > 0
      ? getChileNationalHolidaysForRange(
          dates[0],
          dates[dates.length - 1],
          options?.calendarRegistry ?? CHILE_NATIONAL_HOLIDAYS_BY_YEAR
        )
      : { holidaysByDate: new Map<string, ChileNationalHoliday>(), missingYears: [], warnings: [] };

  const { grouped: ordinaryMap, excludedHolidayCount } = consolidateRequirements(
    rawRequirements,
    false,
    {
      holidaysByDate: holidayLookup.holidaysByDate,
      areaNameById: options?.areaNameById,
      positionNameById: options?.positionNameById,
    }
  );
  const { grouped: extraMap } = consolidateRequirements(rawRequirements, true);

  const unmatchedProtectedOrdinary = applyProtectedCounts(
    ordinaryMap,
    protectedOrdinaryAssignments,
    false
  );
  const unmatchedProtectedExtra = applyProtectedCounts(
    extraMap,
    protectedExtraAssignments,
    true
  );

  return {
    ordinarySlots: sortSlotsByPriorityAndDate(Array.from(ordinaryMap.values())),
    extraSlots: sortSlotsByPriorityAndDate(Array.from(extraMap.values())),
    protectedOrdinaryAssignments,
    protectedExtraAssignments,
    unmatchedProtectedOrdinary,
    unmatchedProtectedExtra,
    holidayWarnings: holidayLookup.warnings,
    excludedHolidaySlotsCount: excludedHolidayCount,
  };
}

function measureGroupCoverage(
  slots: DotacionSlot[],
  generatedAssignments: GeneratedAssignmentRef[],
  isExtra: boolean
): DotacionGroupCoverage {
  const generatedByKey = new Map<string, number>();

  for (const assignment of generatedAssignments) {
    if (Boolean(assignment.is_extra) !== isExtra) continue;
    const key = buildDotacionSlotKey({
      date: assignment.date,
      area_id: assignment.area_id,
      position_id: assignment.position_id,
      shift_id: assignment.shift_id,
    });
    generatedByKey.set(key, (generatedByKey.get(key) || 0) + 1);
  }

  let totalRequired = 0;
  let totalCovered = 0;
  let totalVacancies = 0;

  const details: SlotCoverageDetail[] = slots.map((slot) => {
    const assignedCount = generatedByKey.get(slot.slot_key) || 0;
    const totalPlaced = slot.protected_filled_count + assignedCount;
    const coveredCount = Math.min(slot.required_count, totalPlaced);
    const vacancyCount = Math.max(0, slot.required_count - coveredCount);
    const overAllocatedCount = Math.max(0, totalPlaced - slot.required_count);

    totalRequired += slot.required_count;
    totalCovered += coveredCount;
    totalVacancies += vacancyCount;

    return {
      slot_key: slot.slot_key,
      date: slot.date,
      area_id: slot.area_id,
      position_id: slot.position_id,
      shift_id: slot.shift_id,
      is_extra: slot.is_extra,
      priority: slot.priority,
      priority_rank: slot.priority_rank,
      required_count: slot.required_count,
      protected_filled_count: slot.protected_filled_count,
      assigned_count: assignedCount,
      covered_count: coveredCount,
      vacancy_count: vacancyCount,
      over_allocated_count: overAllocatedCount,
      area_name: slot.area_name,
      position_name: slot.position_name,
      shift_name: slot.shift_name,
    };
  });

  const coveragePercent =
    totalRequired > 0 ? Math.round((totalCovered / totalRequired) * 100) : 100;

  return {
    total_required: totalRequired,
    total_covered: totalCovered,
    total_vacancies: totalVacancies,
    coverage_percent: coveragePercent,
    slots: details,
  };
}

/**
 * Measures coverage and vacancies by (date, area, position, shift),
 * keeping ordinary and extra dotación strictly separate.
 */
export function measureDotacionCoverage(
  prepared: PreparedDotacion,
  generatedAssignments: GeneratedAssignmentRef[] = []
): DotacionCoverageSummary {
  return {
    ordinary: measureGroupCoverage(prepared.ordinarySlots, generatedAssignments, false),
    extra: measureGroupCoverage(prepared.extraSlots, generatedAssignments, true),
    unmatched_protected_ordinary: prepared.unmatchedProtectedOrdinary,
    unmatched_protected_extra: prepared.unmatchedProtectedExtra,
  };
}
