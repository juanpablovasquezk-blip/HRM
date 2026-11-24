import {
  CHILE_NATIONAL_HOLIDAYS_BY_YEAR,
  getChileNationalHolidaysForRange,
  isHolidayZeroStaffingPair,
  type VerifiedHolidayYearCalendar,
} from './chile-holidays';
import { buildDotacionSlotKey, normalizeIsoDate } from './dotacion';
import type {
  CrossAreaScheduleResult,
  DailyPlanningAssignmentRef,
  DailyPlanningVacancySummary,
  DailyVacancyStatus,
  ExtraRequirementState,
  RawShiftRequirement,
  ReconcileExtraResult,
  SlotCoverageDetail,
} from './types';

function isSlotInReconcileScope(
  slot: { date: string; area_id: string; position_id: string },
  normStart: string,
  normEnd: string,
  areaFilter?: string | null,
  positionFilter?: string[] | null
): boolean {
  const d = normalizeIsoDate(slot.date);
  if (d < normStart || d > normEnd) return false;
  if (areaFilter && slot.area_id !== areaFilter) return false;
  if (
    positionFilter &&
    positionFilter.length > 0 &&
    !positionFilter.includes(slot.position_id)
  ) {
    return false;
  }
  return true;
}

/**
 * Reconciles `v2` ordinary vacancies with the Dotación Extra flow when saving a v2 roster:
 * - Links each uncovered ordinary slot by (date, area_id, position_id, shift_id).
 * - Updates existing auto-linked extras on regeneration without creating duplicates.
 * - Always preserves manually created extra requirements (`manual_count`).
 * - Excludes slots suppressed by ROSTER-02A national holidays (they are not in `remaining_vacancies`).
 */
export function reconcileVacancyExtraRequirements(params: {
  v2Result: CrossAreaScheduleResult;
  existingExtraRequirements: Array<
    Omit<Partial<ExtraRequirementState>, 'is_extra'> & {
      id?: string;
      date: string;
      area_id: string;
      position_id: string;
      shift_id: string;
      required_count: number;
      is_extra?: boolean | null;
    }
  >;
  rangeStart: string;
  rangeEnd: string;
  areaFilter?: string | null;
  positionFilter?: string[] | null;
}): ReconcileExtraResult {
  const {
    v2Result,
    existingExtraRequirements,
    rangeStart,
    rangeEnd,
    areaFilter,
    positionFilter,
  } = params;

  const normStart = normalizeIsoDate(rangeStart);
  const normEnd = normalizeIsoDate(rangeEnd);

  // Build map of existing extra requirements keyed by canonical slot_key
  const stateByKey = new Map<string, ExtraRequirementState>();

  for (const row of existingExtraRequirements) {
    if (row.is_extra === false) continue;
    const date = normalizeIsoDate(row.date);
    const slotKey = buildDotacionSlotKey({
      date,
      area_id: row.area_id,
      position_id: row.position_id,
      shift_id: row.shift_id,
    });

    const prevAuto = Number(row.auto_vacancy_count) || 0;
    const inferredManual =
      typeof row.manual_count === 'number'
        ? Math.max(0, row.manual_count)
        : Math.max(0, (Number(row.required_count) || 0) - prevAuto);

    const existing = stateByKey.get(slotKey);
    if (existing) {
      existing.manual_count += inferredManual;
      existing.auto_vacancy_count += prevAuto;
      existing.required_count = existing.manual_count + existing.auto_vacancy_count;
    } else {
      stateByKey.set(slotKey, {
        id: row.id,
        slot_key: slotKey,
        date,
        area_id: row.area_id,
        position_id: row.position_id,
        shift_id: row.shift_id,
        is_extra: true,
        manual_count: inferredManual,
        auto_vacancy_count: prevAuto,
        required_count: inferredManual + prevAuto,
        linked_ordinary_slot_key: slotKey,
      });
    }
  }

  // Zero out previous auto_vacancy_count ONLY inside the regenerated scope
  for (const state of stateByKey.values()) {
    if (
      isSlotInReconcileScope(
        state,
        normStart,
        normEnd,
        areaFilter,
        positionFilter
      )
    ) {
      state.auto_vacancy_count = 0;
      state.required_count = state.manual_count;
    }
  }

  // Aggregate current v2 remaining_vacancies by canonical slot_key (supporting multiple priority groups per slot)
  const aggregatedVacancies = new Map<string, SlotCoverageDetail>();
  for (const vac of v2Result.remaining_vacancies) {
    if (vac.vacancy_count <= 0) continue;
    if (
      !isSlotInReconcileScope(
        vac,
        normStart,
        normEnd,
        areaFilter,
        positionFilter
      )
    ) {
      continue;
    }

    const prev = aggregatedVacancies.get(vac.slot_key);
    if (prev) {
      prev.vacancy_count += vac.vacancy_count;
    } else {
      aggregatedVacancies.set(vac.slot_key, { ...vac });
    }
  }

  for (const vac of aggregatedVacancies.values()) {
    const existing = stateByKey.get(vac.slot_key);
    if (existing) {
      existing.auto_vacancy_count = vac.vacancy_count;
      existing.required_count = existing.manual_count + vac.vacancy_count;
    } else {
      stateByKey.set(vac.slot_key, {
        slot_key: vac.slot_key,
        date: vac.date,
        area_id: vac.area_id,
        position_id: vac.position_id,
        shift_id: vac.shift_id,
        is_extra: true,
        manual_count: 0,
        auto_vacancy_count: vac.vacancy_count,
        required_count: vac.vacancy_count,
        linked_ordinary_slot_key: vac.slot_key,
      });
    }
  }

  const extraRequirements: ExtraRequirementState[] = [];
  const upserts: ExtraRequirementState[] = [];
  const deletedSlotKeys: string[] = [];

  for (const state of stateByKey.values()) {
    if (state.required_count <= 0) {
      deletedSlotKeys.push(state.slot_key);
    } else {
      extraRequirements.push(state);
      if (
        isSlotInReconcileScope(
          state,
          normStart,
          normEnd,
          areaFilter,
          positionFilter
        )
      ) {
        upserts.push(state);
      }
    }
  }

  extraRequirements.sort((a, b) => a.slot_key.localeCompare(b.slot_key));

  return {
    extra_requirements: extraRequirements,
    upserts,
    deleted_slot_keys: deletedSlotKeys,
  };
}

/**
 * Evaluates Daily Planning faltas and Dotación Extra pendings for a given date:
 * - Applies ROSTER-02A national holiday suppression on already-generated months
 *   (suppressed slots never appear as faltas or extra pendings).
 * - Links each ordinary deficit 1-to-1 with its associated extra slot so covering
 *   via either ordinary assignment OR Dotación Extra closes the pending and
 *   counts a single coverage.
 * - Keeps manual extra slots independent of the ordinary deficit.
 */
export function evaluateDailyPlanningVacancies(params: {
  date: string;
  ordinaryRequirements: RawShiftRequirement[];
  extraRequirements: Array<
    Omit<Partial<ExtraRequirementState>, 'is_extra'> & {
      date: string;
      area_id: string;
      position_id: string;
      shift_id: string;
      required_count: number;
      is_extra?: boolean | null;
      area?: { name?: string | null } | null;
      position?: { name?: string | null } | null;
      positions?: { name?: string | null } | null;
    }
  >;
  assignments: DailyPlanningAssignmentRef[];
  areaNameById?: Map<string, string>;
  positionNameById?: Map<string, string>;
  calendarRegistry?: Record<number, VerifiedHolidayYearCalendar>;
}): DailyPlanningVacancySummary {
  const {
    date,
    ordinaryRequirements,
    extraRequirements,
    assignments,
    areaNameById,
    positionNameById,
    calendarRegistry = CHILE_NATIONAL_HOLIDAYS_BY_YEAR,
  } = params;

  const normDate = normalizeIsoDate(date);
  const holidayLookup = getChileNationalHolidaysForRange(
    normDate,
    normDate,
    calendarRegistry
  );
  const isNationalHoliday = holidayLookup.holidaysByDate.has(normDate);

  // 1. Aggregate active (non-cancelled, non-on-leave) ordinary and extra assignments,
  // strictly separating vacancy-linked extra assignments from manual extra assignments.
  const ordinaryFilledByKey = new Map<string, number>();
  const linkedExtraFilledByKey = new Map<string, number>();
  const manualExtraFilledByKey = new Map<string, number>();

  // 2. Collect ordinary requirement metadata first so linked_requirement_id can be matched
  const ordinaryReqByKey = new Map<
    string,
    {
      id?: string | null;
      area_id: string;
      position_id: string;
      shift_id: string;
      required: number;
      suppressed: boolean;
    }
  >();

  for (const req of ordinaryRequirements) {
    if (req.is_extra) continue;
    if (normalizeIsoDate(req.date) !== normDate) continue;
    const key = buildDotacionSlotKey({
      date: normDate,
      area_id: req.area_id,
      position_id: req.position_id,
      shift_id: req.shift_id,
    });

    const areaName = req.area?.name ?? areaNameById?.get(req.area_id);
    const posName =
      req.position?.name ?? req.positions?.name ?? positionNameById?.get(req.position_id);
    const suppressed =
      isNationalHoliday && isHolidayZeroStaffingPair(areaName, posName);

    const prev = ordinaryReqByKey.get(key);
    const addCount = suppressed ? 0 : Number(req.required_count) || 0;
    if (prev) {
      prev.required += addCount;
      prev.suppressed = prev.suppressed || suppressed;
      if (!prev.id && req.id) prev.id = req.id;
    } else {
      ordinaryReqByKey.set(key, {
        id: req.id ?? null,
        area_id: req.area_id,
        position_id: req.position_id,
        shift_id: req.shift_id,
        required: addCount,
        suppressed,
      });
    }
  }

  for (const a of assignments) {
    if (normalizeIsoDate(a.date) !== normDate) continue;
    if (a.status === 'cancelled' || a.is_on_leave) continue;

    const key = buildDotacionSlotKey({
      date: normDate,
      area_id: a.area_id,
      position_id: a.position_id,
      shift_id: a.shift_id,
    });

    if (a.is_extra) {
      const ordId = ordinaryReqByKey.get(key)?.id;
      const isLinkedVacancyExtra =
        a.extra_target === 'v2_vacancy' ||
        (Boolean(ordId) && a.linked_requirement_id === ordId && a.extra_target !== 'manual');

      if (isLinkedVacancyExtra) {
        linkedExtraFilledByKey.set(key, (linkedExtraFilledByKey.get(key) || 0) + 1);
      } else {
        manualExtraFilledByKey.set(key, (manualExtraFilledByKey.get(key) || 0) + 1);
      }
    } else {
      ordinaryFilledByKey.set(key, (ordinaryFilledByKey.get(key) || 0) + 1);
    }
  }

  const extraReqByKey = new Map<
    string,
    {
      area_id: string;
      position_id: string;
      shift_id: string;
      linkedSlots: number;
      manualSlots: number;
      suppressed: boolean;
    }
  >();

  for (const er of extraRequirements) {
    if (normalizeIsoDate(er.date) !== normDate) continue;
    const key = buildDotacionSlotKey({
      date: normDate,
      area_id: er.area_id,
      position_id: er.position_id,
      shift_id: er.shift_id,
    });

    const areaName = er.area?.name ?? areaNameById?.get(er.area_id);
    const posName =
      er.position?.name ?? er.positions?.name ?? positionNameById?.get(er.position_id);
    const suppressedHoliday =
      isNationalHoliday && isHolidayZeroStaffingPair(areaName, posName);

    const autoCount = suppressedHoliday ? 0 : Number(er.auto_vacancy_count) || 0;
    const manualCount =
      typeof er.manual_count === 'number'
        ? Math.max(0, er.manual_count)
        : Math.max(0, (Number(er.required_count) || 0) - (Number(er.auto_vacancy_count) || 0));

    const prev = extraReqByKey.get(key);
    if (prev) {
      prev.linkedSlots += autoCount;
      prev.manualSlots += manualCount;
      prev.suppressed = prev.suppressed || suppressedHoliday;
    } else {
      extraReqByKey.set(key, {
        area_id: er.area_id,
        position_id: er.position_id,
        shift_id: er.shift_id,
        linkedSlots: autoCount,
        manualSlots: manualCount,
        suppressed: suppressedHoliday,
      });
    }
  }

  const allKeys = Array.from(
    new Set([...ordinaryReqByKey.keys(), ...extraReqByKey.keys()])
  ).sort();

  const slots: DailyVacancyStatus[] = [];
  let totalOpenFaltas = 0;
  let totalOpenLinkedExtras = 0;
  let totalOpenManualExtras = 0;

  for (const key of allKeys) {
    const ord = ordinaryReqByKey.get(key);
    const ext = extraReqByKey.get(key);

    const areaId = ord?.area_id ?? ext!.area_id;
    const positionId = ord?.position_id ?? ext!.position_id;
    const shiftId = ord?.shift_id ?? ext!.shift_id;

    const ordinaryRequired = ord?.required ?? 0;
    const ordinaryFilled = ordinaryFilledByKey.get(key) ?? 0;
    const rawOrdinaryDeficit = Math.max(0, ordinaryRequired - ordinaryFilled);

    const linkedExtraSlots = ord?.suppressed ? 0 : Math.min(rawOrdinaryDeficit, ext?.linkedSlots ?? 0);
    const manualExtraSlots = ext?.manualSlots ?? 0;
    const extraFilledLinked = linkedExtraFilledByKey.get(key) ?? 0;
    const extraFilledManual = manualExtraFilledByKey.get(key) ?? 0;

    // ONLY assignments targeted to v2_vacancy close the linked ordinary falta
    const coveredViaExtraForVacancy = Math.min(rawOrdinaryDeficit, extraFilledLinked);

    const effectiveOrdinaryCoverage = Math.min(
      ordinaryRequired,
      ordinaryFilled + coveredViaExtraForVacancy
    );
    const openFaltaCount = Math.max(0, ordinaryRequired - effectiveOrdinaryCoverage);
    const openLinkedExtraCount = Math.min(linkedExtraSlots, openFaltaCount);
    const openManualExtraCount = Math.max(0, manualExtraSlots - extraFilledManual);

    totalOpenFaltas += openFaltaCount;
    totalOpenLinkedExtras += openLinkedExtraCount;
    totalOpenManualExtras += openManualExtraCount;

    slots.push({
      slot_key: key,
      date: normDate,
      area_id: areaId,
      position_id: positionId,
      shift_id: shiftId,
      ordinary_requirement_id: ord?.id ?? null,
      ordinary_required: ordinaryRequired,
      ordinary_filled: ordinaryFilled,
      linked_extra_slots: linkedExtraSlots,
      manual_extra_slots: manualExtraSlots,
      extra_filled_linked: extraFilledLinked,
      extra_filled_manual: extraFilledManual,
      covered_via_extra_for_vacancy: coveredViaExtraForVacancy,
      effective_ordinary_coverage: effectiveOrdinaryCoverage,
      open_falta_count: openFaltaCount,
      open_linked_extra_count: openLinkedExtraCount,
      open_manual_extra_count: openManualExtraCount,
      suppressed_by_holiday: Boolean(ord?.suppressed || ext?.suppressed),
    });
  }

  return {
    date: normDate,
    slots,
    total_open_faltas: totalOpenFaltas,
    total_open_linked_extras: totalOpenLinkedExtras,
    total_open_manual_extras: totalOpenManualExtras,
    holiday_warnings: holidayLookup.warnings,
  };
}

export interface ExtraSelectorItem {
  key: string;
  requirement_id: string;
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  extra_target: 'manual' | 'v2_vacancy';
  linked_requirement_id: string | null;
  open_count: number;
}

/**
 * Builds the single, deduplicated list of Dotación Extra selector items
 * for the habitual UI selector, separating `v2_vacancy` vs `manual` targets
 * so the summary panel and the habitual list never offer the same pending twice.
 */
export function buildExtraSelectorItems(params: {
  date: string;
  ordinaryRequirements: RawShiftRequirement[];
  extraRequirements: Array<
    Omit<Partial<ExtraRequirementState>, 'is_extra'> & {
      id?: string;
      date: string;
      area_id: string;
      position_id: string;
      shift_id: string;
      required_count: number;
      is_extra?: boolean | null;
      area?: { name?: string | null } | null;
      position?: { name?: string | null } | null;
      positions?: { name?: string | null } | null;
    }
  >;
  assignments: DailyPlanningAssignmentRef[];
  areaNameById?: Map<string, string>;
  positionNameById?: Map<string, string>;
}): ExtraSelectorItem[] {
  const summary = evaluateDailyPlanningVacancies(params);
  const items: ExtraSelectorItem[] = [];

  for (const slot of summary.slots) {
    const matchingExtraReq = params.extraRequirements.find(
      (er) =>
        normalizeIsoDate(er.date) === slot.date &&
        er.area_id === slot.area_id &&
        er.position_id === slot.position_id &&
        er.shift_id === slot.shift_id
    );
    const reqId = matchingExtraReq?.id || slot.slot_key;

    if (slot.open_linked_extra_count > 0) {
      items.push({
        key: `${slot.slot_key}|v2_vacancy`,
        requirement_id: reqId,
        date: slot.date,
        area_id: slot.area_id,
        position_id: slot.position_id,
        shift_id: slot.shift_id,
        extra_target: 'v2_vacancy',
        linked_requirement_id:
          matchingExtraReq?.linked_requirement_id ?? slot.ordinary_requirement_id ?? null,
        open_count: slot.open_linked_extra_count,
      });
    }

    if (slot.open_manual_extra_count > 0) {
      items.push({
        key: `${slot.slot_key}|manual`,
        requirement_id: reqId,
        date: slot.date,
        area_id: slot.area_id,
        position_id: slot.position_id,
        shift_id: slot.shift_id,
        extra_target: 'manual',
        linked_requirement_id: null,
        open_count: slot.open_manual_extra_count,
      });
    }
  }

  return items;
}

/**
 * Produces the assignment payload when an operator is chosen from the habitual
 * Dotación Extra selector, preserving `extra_target` and `linked_requirement_id`.
 */
export function createExtraAssignmentFromSelector(
  item: ExtraSelectorItem,
  personnelId: string
): DailyPlanningAssignmentRef {
  return {
    personnel_id: personnelId,
    date: item.date,
    area_id: item.area_id,
    position_id: item.position_id,
    shift_id: item.shift_id,
    is_extra: true,
    extra_target: item.extra_target,
    linked_requirement_id: item.linked_requirement_id,
    status: 'scheduled',
  };
}
