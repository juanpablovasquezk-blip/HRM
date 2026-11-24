import {
  addDays,
  eachDayOfInterval,
  format,
  getDay,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { scheduleAirportNs22 } from './aeropuerto-ns22';
import {
  getChileNationalHolidaysForRange,
  type VerifiedHolidayYearCalendar,
} from './chile-holidays';
import {
  buildDotacionSlotKey,
  isAssignmentProtected,
  measureDotacionCoverage,
  normalizeIsoDate,
  prepareDotacionSlots,
} from './dotacion';
import {
  canPersonTakeShiftInterval,
  evaluatePermissionsForWeek,
  getApplicableWeeklyHoursLimit,
  getShiftOccupiedDates,
  hasMandatoryJornadaViolation,
  isBirthdayOnDate,
  synthesizeBirthdayLeavesForRange,
  validateJornadaConstraints,
} from './jornada';
import type {
  CrossAreaAssignment,
  CrossAreaScheduleResult,
  DotacionSlot,
  GeneratedAssignmentRef,
  JornadaViolation,
  Ns22ScheduleResult,
  Ns22ShiftDefinition,
  Ns22TitularConfig,
  PermissionRelocationCase,
  PersonnelScheduleProfile,
  RawExistingAssignment,
  RawLeaveRecord,
  RawShiftRequirement,
  ReinforcementShiftConfig,
  ScheduledShiftInterval,
} from './types';

function slotToInterval(slot: DotacionSlot): ScheduledShiftInterval {
  return {
    date: slot.date,
    shift_start: slot.shift_start,
    shift_end: slot.shift_end,
    duration_hours: slot.shift_duration_hours,
    shift_id: slot.shift_id,
    area_id: slot.area_id,
    position_id: slot.position_id,
    slot_key: slot.slot_key,
  };
}

function normalizeCatalogText(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function isForkliftOperatorPositionName(posName?: string | null): boolean {
  const n = normalizeCatalogText(posName);
  return n === 'OPERADOR GRUA HORQUILLA' || n === 'OPERADOR DE GRUA HORQUILLA';
}

/**
 * Limits qualification equivalence strictly to the two catalog entries for
 * "Operador Grúa Horquilla" in Atrex and Base Minerquim.
 */
function buildGruaHorquillaEquivalence(
  rawRequirements: RawShiftRequirement[],
  personnel: PersonnelScheduleProfile[],
  areaNameById?: Map<string, string>,
  positionNameById?: Map<string, string>
): Map<string, Set<string>> {
  const atrexPosIds = new Set<string>();
  const baseMinerquimPosIds = new Set<string>();

  const registerPair = (areaId?: string | null, posId?: string | null, areaLabel?: string | null, posLabel?: string | null) => {
    if (!posId) return;
    const pName = posLabel || positionNameById?.get(posId) || '';
    if (!isForkliftOperatorPositionName(pName)) return;
    const aName = normalizeCatalogText(areaLabel || (areaId ? areaNameById?.get(areaId) : ''));
    if (aName === 'ATREX') atrexPosIds.add(posId);
    if (aName === 'BASE MINERQUIM') baseMinerquimPosIds.add(posId);
  };

  for (const r of rawRequirements) {
    registerPair(r.area_id, r.position_id, r.area?.name, r.position?.name);
  }
  for (const p of personnel) {
    registerPair(p.area_id, p.main_position, undefined, p.main_position_name);
  }

  const eqMap = new Map<string, Set<string>>();
  if (atrexPosIds.size === 0 || baseMinerquimPosIds.size === 0) {
    return eqMap;
  }

  for (const aId of atrexPosIds) {
    const set = eqMap.get(aId) || new Set<string>();
    for (const bId of baseMinerquimPosIds) set.add(bId);
    eqMap.set(aId, set);
  }
  for (const bId of baseMinerquimPosIds) {
    const set = eqMap.get(bId) || new Set<string>();
    for (const aId of atrexPosIds) set.add(aId);
    eqMap.set(bId, set);
  }
  return eqMap;
}

function getGruaAreaPreferenceScore(
  person: PersonnelScheduleProfile,
  slot: Pick<DotacionSlot, 'area_id' | 'area_name' | 'position_id' | 'position_name'>,
  areaNameById?: Map<string, string>,
  positionNameById?: Map<string, string>
): number {
  const posName = slot.position_name || positionNameById?.get(slot.position_id);
  if (!isForkliftOperatorPositionName(posName)) return 0;

  const areaName = normalizeCatalogText(slot.area_name || areaNameById?.get(slot.area_id));
  const personName = normalizeCatalogText(person.full_name || person.first_name);
  if (areaName === 'ATREX' && personName.includes('ELOY') && (personName.includes('PONCE') || !person.full_name)) {
    return 1;
  }
  if (
    areaName === 'BASE MINERQUIM' &&
    personName.includes('LIZARDO') &&
    (personName.includes('PAILAPICHUN') || !person.full_name)
  ) {
    return 1;
  }
  return 0;
}

function getPositionMatch(
  person: PersonnelScheduleProfile,
  positionId: string,
  equivalentPositionIds?: Map<string, Set<string>>
): 'primary' | 'secondary' | null {
  const eqSet = equivalentPositionIds?.get(positionId);
  if (person.main_position === positionId) return 'primary';
  if (person.main_position && eqSet?.has(person.main_position)) return 'primary';
  if ((person.secondary_positions || []).includes(positionId)) return 'secondary';
  if ((person.secondary_positions || []).some((sec) => eqSet?.has(sec))) return 'secondary';
  return null;
}

function isWeekendDate(dateStr: string): boolean {
  const day = parseISO(normalizeIsoDate(dateStr)).getDay();
  return day === 0 || day === 6;
}

function countWeekendShifts(shifts: ScheduledShiftInterval[]): number {
  let count = 0;
  for (const s of shifts) {
    if (isWeekendDate(s.date)) count++;
  }
  return count;
}

function getShiftTimeTag(shiftStart?: string | null, shiftName?: string | null): 'AM11' | 'AM08' | null {
  const start = (shiftStart || '').trim();
  const name = normalizeCatalogText(shiftName);
  if (start.startsWith('11:') || name === 'AM 11' || name === 'AM11') return 'AM11';
  if (start.startsWith('08:00') || name === 'AM 08' || name === 'AM08') return 'AM08';
  return null;
}

function computeSoftPreferenceCost(
  shifts: ScheduledShiftInterval[],
  shiftNameById?: Map<string, string>
): number {
  let cost = 0;
  const tagByDate = new Map<string, 'AM11' | 'AM08'>();
  const occupied = new Set<string>();
  const weeks = new Set<string>();

  for (const s of shifts) {
    const dNorm = normalizeIsoDate(s.date);
    const tag = getShiftTimeTag(s.shift_start, s.shift_id ? shiftNameById?.get(s.shift_id) : undefined);
    if (tag) tagByDate.set(dNorm, tag);
    for (const occ of getShiftOccupiedDates(s)) {
      occupied.add(occ);
      weeks.add(format(startOfWeek(parseISO(occ), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
    }
  }

  for (const [dStr, tag] of tagByDate.entries()) {
    const nextStr = format(addDays(parseISO(dStr), 1), 'yyyy-MM-dd');
    const nextTag = tagByDate.get(nextStr);
    if (tag === 'AM11' && nextTag === 'AM11') cost -= 2;
    if (tag === 'AM11' && nextTag === 'AM08') cost += 3;
  }

  for (const weekKey of weeks) {
    const weekStart = parseISO(weekKey);
    const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
    const freeIdx: number[] = [];
    weekDays.forEach((d, idx) => {
      if (!occupied.has(format(d, 'yyyy-MM-dd'))) freeIdx.push(idx);
    });
    if (freeIdx.length >= 2) {
      const hasConsecutivePair = freeIdx.some((dayIdx, i) => i > 0 && dayIdx - freeIdx[i - 1] === 1);
      if (!hasConsecutivePair) cost += 4;
    }
  }

  return cost;
}

function getTotalHours(shifts: ScheduledShiftInterval[]): number {
  return shifts.reduce((sum, s) => sum + (Number(s.duration_hours) || 0), 0);
}

function removeShiftInstance(
  list: ScheduledShiftInterval[],
  target: {
    date: string;
    shift_id: string;
    area_id: string;
    position_id: string;
  }
): ScheduledShiftInterval[] {
  const idx = list.findIndex(
    (s) =>
      normalizeIsoDate(s.date) === target.date &&
      s.shift_id === target.shift_id &&
      s.area_id === target.area_id &&
      s.position_id === target.position_id
  );
  if (idx === -1) return [...list];
  return [...list.slice(0, idx), ...list.slice(idx + 1)];
}

function getTouchedSundayMonths(
  shift: Pick<
    ScheduledShiftInterval,
    'date' | 'shift_start' | 'shift_end' | 'duration_hours'
  >
): Set<string> {
  const occupied = getShiftOccupiedDates(shift);
  const months = new Set<string>();
  for (const d of occupied) {
    if (new Date(`${d}T00:00:00Z`).getUTCDay() === 0) {
      months.add(d.slice(0, 7));
    }
  }
  return months;
}

function shiftsShareSundayMonth(
  a: Pick<
    ScheduledShiftInterval,
    'date' | 'shift_start' | 'shift_end' | 'duration_hours'
  >,
  b: Pick<
    ScheduledShiftInterval,
    'date' | 'shift_start' | 'shift_end' | 'duration_hours'
  >
): boolean {
  const monthsA = getTouchedSundayMonths(a);
  if (monthsA.size === 0) return false;
  const monthsB = getTouchedSundayMonths(b);
  for (const m of monthsA) {
    if (monthsB.has(m)) return true;
  }
  return false;
}

/**
 * Determines whether an existing assignment must be preserved as a fixed commitment
 * vs. treated as a replaceable draft within the current generation range and filter.
 */
function isPreservedCommitment(
  assignment: RawExistingAssignment,
  normStart: string,
  normEnd: string,
  areaFilter: string | null | undefined,
  positionFilter: string[] | null | undefined,
  referenceDate: Date
): boolean {
  if (isAssignmentProtected(assignment, referenceDate)) return true;
  if (assignment.is_extra) return true;

  const dStr = normalizeIsoDate(assignment.date);
  if (dStr < normStart || dStr > normEnd) return true;
  if (areaFilter && assignment.area_id !== areaFilter) return true;
  if (
    positionFilter &&
    positionFilter.length > 0 &&
    !positionFilter.includes(assignment.position_id)
  ) {
    return true;
  }

  return false;
}

function groupVacantNs22Runs(
  vacantNights: Array<{ date: string; missing_titular_id: string }>
): Map<string, string> {
  const runByNight = new Map<string, string>();
  const byTitular = new Map<string, string[]>();

  for (const v of vacantNights) {
    if (!byTitular.has(v.missing_titular_id)) byTitular.set(v.missing_titular_id, []);
    byTitular.get(v.missing_titular_id)!.push(v.date);
  }

  let runSeq = 0;
  for (const [titularId, dates] of byTitular.entries()) {
    const sorted = [...dates].sort((a, b) => a.localeCompare(b));
    let currentRun: string[] = [];

    const flush = () => {
      if (currentRun.length === 0) return;
      const runId = `ns22-run-${++runSeq}-${currentRun.length}`;
      for (const d of currentRun) {
        runByNight.set(`${d}|${titularId}`, runId);
      }
      currentRun = [];
    };

    for (const d of sorted) {
      if (currentRun.length === 0) {
        currentRun.push(d);
        continue;
      }
      const prev = currentRun[currentRun.length - 1];
      const expectedNext = format(addDays(parseISO(prev), 1), 'yyyy-MM-dd');
      if (d === expectedNext && currentRun.length < 4) {
        currentRun.push(d);
      } else {
        flush();
        currentRun.push(d);
      }
    }
    flush();
  }

  return runByNight;
}

function isSlotInScope(
  slot: DotacionSlot,
  normStart: string,
  normEnd: string,
  areaFilter: string | null | undefined,
  positionFilter: string[] | null | undefined
): boolean {
  if (slot.date < normStart || slot.date > normEnd) return false;
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
 * Minerquim 5-stage parallel roster engine (ROSTER-05):
 * 1. Prepare calendar: load approved leaves, preserve protected & out-of-scope
 *    commitments, release replaceable drafts inside scope.
 * 2. Cover Airport NS22 first: keep 4x4 titulares & protected shifts; treat pending
 *    ordinary NS22 slots as critical (priority 4) with preference over other critical
 *    slots when competing, seeking alternatives to cover both and preferring 4-night blocks.
 * 3. Cover remaining dotación by priority and primary/secondary qualifications.
 * 4. Review & adjust full roster: re-verify jornada/leaves/protected and attempt
 *    permitted reassignments to cover remaining vacancies; report unresolved vacancies.
 * 5. Assign reinforcements at the end (e.g. AM07 Mon-Fri in Airport, AM04 in enabled
 *    Bodegas), respecting scope, jornada, and rests, kept separate from ordinary coverage.
 */
export interface ScheduleCrossAreaParams {
  startDate: string;
  endDate: string;
  rawRequirements: RawShiftRequirement[];
  existingAssignments: RawExistingAssignment[];
  personnel: PersonnelScheduleProfile[];
  approvedLeaves?: RawLeaveRecord[];
  areaFilter?: string | null;
  positionFilter?: string[] | null;
  ns22Config?: {
    titulares: Ns22TitularConfig[];
    shiftDef: Ns22ShiftDefinition;
  } | null;
  excludeUnconfiguredNs22?: boolean;
  disableSoftPreferences?: boolean;
  disableSupervisorWeekendBalance?: boolean;
  reinforcementConfig?: Record<
    string,
    ReinforcementShiftConfig | ReinforcementShiftConfig[]
  > | null;
  baseCalendarByPerson?: Map<string, Set<string>> | null;
  referenceDate?: Date;
  areaNameById?: Map<string, string>;
  positionNameById?: Map<string, string>;
  holidayCalendarRegistry?: Record<number, VerifiedHolidayYearCalendar>;
  disableWeeklyChainReview?: boolean;
  disableTransportPreference?: boolean;
  deadlineAt?: number;
  signal?: AbortSignal;
}

function* scheduleCrossAreaGen(
  params: ScheduleCrossAreaParams
): Generator<void, CrossAreaScheduleResult, void> {
  const v2TotalStart = performance.now();
  let candidateSelectionMs = 0;
  let relocationsMs = 0;
  let finalAuditMs = 0;

  const {
    startDate,
    endDate,
    rawRequirements,
    existingAssignments,
    personnel,
    approvedLeaves = [],
    areaFilter,
    positionFilter,
    ns22Config,
    excludeUnconfiguredNs22 = false,
    disableSoftPreferences = false,
    disableSupervisorWeekendBalance = false,
    disableWeeklyChainReview = false,
    disableTransportPreference = false,
    reinforcementConfig,
    baseCalendarByPerson,
    referenceDate = new Date(),
    areaNameById,
    positionNameById,
    holidayCalendarRegistry,
    deadlineAt,
    signal,
  } = params;

  const checkDeadline = () => {
    if (signal?.aborted) {
      throw new Error('Cálculo de v2 cancelado por el usuario o por desconexión.');
    }
    if (deadlineAt !== undefined && Date.now() > deadlineAt) {
      throw new Error('Límite de ejecución excedido durante el cálculo de v2.');
    }
  };

  const normStart = normalizeIsoDate(startDate);
  const normEnd = normalizeIsoDate(endDate);

  // Stage 1: Prepare calendar & scoped dotación
  const prepared = prepareDotacionSlots(rawRequirements, existingAssignments, {
    referenceDate,
    areaNameById,
    positionNameById,
    calendarRegistry: holidayCalendarRegistry,
  });
  const rangeHolidayLookup = getChileNationalHolidaysForRange(
    normStart,
    normEnd,
    holidayCalendarRegistry
  );
  const holidayWarnings = Array.from(
    new Set([...rangeHolidayLookup.warnings, ...prepared.holidayWarnings])
  );

  const scopedOrdinarySlots = prepared.ordinarySlots.filter((slot) =>
    isSlotInScope(slot, normStart, normEnd, areaFilter, positionFilter)
  );
  const scopedExtraSlots = prepared.extraSlots.filter((slot) =>
    isSlotInScope(slot, normStart, normEnd, areaFilter, positionFilter)
  );

  // Keep protected, extra, and out-of-scope commitments in shiftsByPerson;
  // release replaceable drafts within [normStart, normEnd] & filter.
  const shiftsByPerson = new Map<string, ScheduledShiftInterval[]>();
  for (const p of personnel) {
    shiftsByPerson.set(p.personnel_id, []);
  }
  for (const a of existingAssignments) {
    if (a.status === 'cancelled') continue;
    if (
      !isPreservedCommitment(
        a,
        normStart,
        normEnd,
        areaFilter,
        positionFilter,
        referenceDate
      )
    ) {
      continue;
    }

    if (!shiftsByPerson.has(a.personnel_id)) {
      shiftsByPerson.set(a.personnel_id, []);
    }
    shiftsByPerson.get(a.personnel_id)!.push({
      date: normalizeIsoDate(a.date),
      shift_start: a.shift_start || '08:00',
      shift_end: a.shift_end || '16:00',
      duration_hours: Number(a.duration_hours) || 8,
      shift_id: a.shift_id,
      area_id: a.area_id,
      position_id: a.position_id,
      slot_key: buildDotacionSlotKey({
        date: a.date,
        area_id: a.area_id,
        position_id: a.position_id,
        shift_id: a.shift_id,
      }),
    });
  }

  const titularIds = new Set(
    (ns22Config?.titulares || []).map((t) => t.personnel_id)
  );
  const nonTitularPersonnel = personnel.filter(
    (p) => !titularIds.has(p.personnel_id)
  );

  const ordinaryAssignments: CrossAreaAssignment[] = [];
  let ns22Result: Ns22ScheduleResult | null = null;
  let ns22SlotKeyPrefix: string | null = null;

  interface OpenSlotUnit {
    slot: DotacionSlot;
    effectivePriorityRank: number;
    unitId: string;
    filled: boolean;
    isNs22Replacement: boolean;
    ns22TitularId?: string | null;
    ns22RunId?: string | null;
  }

  const openUnits: OpenSlotUnit[] = [];

  // Stage 2: Airport NS22 titulares & protected first; pending NS22 slots enter as Critical (4)
  if (ns22Config) {
    const { titulares, shiftDef } = ns22Config;
    ns22SlotKeyPrefix = `${shiftDef.area_id}|${shiftDef.position_id}|${shiftDef.shift_id}`;

    const ns22MatchesFilter =
      (!areaFilter || areaFilter === shiftDef.area_id) &&
      (!positionFilter ||
        positionFilter.length === 0 ||
        positionFilter.includes(shiftDef.position_id));

    if (ns22MatchesFilter) {
      const enrichedTitulares = titulares.map((t) => ({
        ...t,
        birth_date:
          t.birth_date ??
          personnel.find((p) => p.personnel_id === t.personnel_id)?.birth_date ??
          null,
      }));
      ns22Result = scheduleAirportNs22({
        startDate,
        endDate,
        titulares: enrichedTitulares,
        shiftDef,
        replacementCandidates: [],
        ns22Slots: scopedOrdinarySlots,
        protectedAssignments: prepared.protectedOrdinaryAssignments,
        existingShiftsByPerson: shiftsByPerson,
        approvedLeaves,
        includeReplacements: false,
      });

      for (const a of ns22Result.assignments) {
        const slotKey = buildDotacionSlotKey({
          date: a.date,
          area_id: a.area_id,
          position_id: a.position_id,
          shift_id: a.shift_id,
        });
        const slotObj = scopedOrdinarySlots.find((s) => s.slot_key === slotKey);

        ordinaryAssignments.push({
          date: a.date,
          personnel_id: a.personnel_id,
          shift_id: a.shift_id,
          area_id: a.area_id,
          position_id: a.position_id,
          shift_start: a.shift_start,
          shift_end: a.shift_end,
          duration_hours: a.duration_hours,
          slot_key: slotKey,
          priority_slot_key: slotObj?.priority_slot_key,
          priority: slotObj?.priority,
          assignment_kind: 'ns22_titular',
          match_type: 'primary',
          priority_rank: slotObj?.priority_rank ?? 4,
          is_extra: false,
          is_locked: a.is_locked,
          frozen_by_rule: a.frozen_by_rule,
        });

        if (!shiftsByPerson.has(a.personnel_id)) {
          shiftsByPerson.set(a.personnel_id, []);
        }
        shiftsByPerson.get(a.personnel_id)!.push({
          date: a.date,
          shift_start: a.shift_start,
          shift_end: a.shift_end,
          duration_hours: a.duration_hours,
          shift_id: a.shift_id,
          area_id: a.area_id,
          position_id: a.position_id,
          slot_key: slotKey,
        });
      }

      const vacantNights = ns22Result.vacant_nights || [];
      const runByNight = groupVacantNs22Runs(vacantNights);

      vacantNights.forEach((vn, idx) => {
        const slotKey = buildDotacionSlotKey({
          date: vn.date,
          area_id: shiftDef.area_id,
          position_id: shiftDef.position_id,
          shift_id: shiftDef.shift_id,
        });
        const slotObj = scopedOrdinarySlots.find((s) => s.slot_key === slotKey);
        if (slotObj) {
          openUnits.push({
            slot: slotObj,
            // Treat pending ordinary NS22 slots as Critical (4)
            effectivePriorityRank: Math.max(4, slotObj.priority_rank),
            unitId: `${slotObj.slot_key}#ns22-${idx}`,
            filled: false,
            isNs22Replacement: true,
            ns22TitularId: vn.missing_titular_id,
            ns22RunId: runByNight.get(`${vn.date}|${vn.missing_titular_id}`) ?? null,
          });
        }
      });
    }
  }

  // Stage 3: Remaining ordinary slots in scope
  const targetNonNs22Slots = scopedOrdinarySlots.filter((slot) => {
    if (
      ns22Result &&
      ns22SlotKeyPrefix === `${slot.area_id}|${slot.position_id}|${slot.shift_id}`
    ) {
      return false;
    }
    if (!ns22Config && excludeUnconfiguredNs22) {
      const areaName = (areaNameById?.get(slot.area_id) || slot.area_name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
      const shiftStart = (slot.shift_start || '').trim();
      const shiftName = (slot.shift_name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
      if (
        areaName === 'AEROPUERTO' &&
        (shiftStart.startsWith('22:00') || shiftName.includes('NS 22') || shiftName === 'NS22')
      ) {
        return false;
      }
    }
    return slot.remaining_count > 0;
  });

  for (const slot of targetNonNs22Slots) {
    for (let i = 0; i < slot.remaining_count; i++) {
      openUnits.push({
        slot,
        effectivePriorityRank: slot.priority_rank,
        unitId: `${slot.priority_slot_key || slot.slot_key}#${i}`,
        filled: false,
        isNs22Replacement: false,
      });
    }
  }

  const leavesByPerson = new Map<string, RawLeaveRecord[]>();
  for (const l of approvedLeaves) {
    if (l.status !== 'approved') continue;
    if (!leavesByPerson.has(l.personnel_id)) {
      leavesByPerson.set(l.personnel_id, []);
    }
    leavesByPerson.get(l.personnel_id)!.push(l);
  }

  const equivalentPositionIds = buildGruaHorquillaEquivalence(
    rawRequirements,
    personnel,
    areaNameById,
    positionNameById
  );

  const personnelByPosition = new Map<
    string,
    Array<{ person: PersonnelScheduleProfile; matchType: 'primary' | 'secondary' }>
  >();
  const registerPosCandidate = (
    posId: string,
    person: PersonnelScheduleProfile,
    matchType: 'primary' | 'secondary'
  ) => {
    if (!personnelByPosition.has(posId)) {
      personnelByPosition.set(posId, []);
    }
    const list = personnelByPosition.get(posId)!;
    const existing = list.find((item) => item.person.personnel_id === person.personnel_id);
    if (existing) {
      if (matchType === 'primary') existing.matchType = 'primary';
      return;
    }
    list.push({ person, matchType });
  };
  for (const p of nonTitularPersonnel) {
    if (p.main_position) {
      registerPosCandidate(p.main_position, p, 'primary');
      for (const eqPosId of equivalentPositionIds.get(p.main_position) || []) {
        registerPosCandidate(eqPosId, p, 'primary');
      }
    }
    for (const sec of p.secondary_positions || []) {
      if (sec === p.main_position) continue;
      registerPosCandidate(sec, p, 'secondary');
      for (const eqPosId of equivalentPositionIds.get(sec) || []) {
        registerPosCandidate(eqPosId, p, 'secondary');
      }
    }
  }

  const validateSingleCandidateForSlot = (
    p: PersonnelScheduleProfile,
    matchType: 'primary' | 'secondary',
    slot: DotacionSlot
  ) => {
    if (
      !canPersonTakeShiftInterval(p, {
        shift_id: slot.shift_id,
        shift_start: slot.shift_start,
        shift_name: slot.shift_name,
      })
    ) {
      return null;
    }
    const pShifts = shiftsByPerson.get(p.personnel_id) || [];
    const pLeaves = leavesByPerson.get(p.personnel_id) || [];
    const violations = validateJornadaConstraints(
      p,
      slotToInterval(slot),
      pShifts,
      pLeaves
    );
    if (hasMandatoryJornadaViolation(violations)) return null;
    const softPenalty = disableSoftPreferences
      ? 0
      : computeSoftPreferenceCost([...pShifts, slotToInterval(slot)]) -
        computeSoftPreferenceCost(pShifts);
    return {
      person: p,
      matchType,
      softPenalty,
      weekendCount: countWeekendShifts(pShifts),
      warningCount: violations.filter((v) => v.severity === 'warning').length,
      totalHours: getTotalHours(pShifts),
    };
  };

  const getValidCandidatesForSlot = (
    slot: DotacionSlot,
    excludePersonId?: string
  ): Array<{
    person: PersonnelScheduleProfile;
    matchType: 'primary' | 'secondary';
    softPenalty: number;
    weekendCount: number;
    warningCount: number;
    totalHours: number;
  }> => {
    const posCands = personnelByPosition.get(slot.position_id) || [];
    const result: Array<{
      person: PersonnelScheduleProfile;
      matchType: 'primary' | 'secondary';
      softPenalty: number;
      weekendCount: number;
      warningCount: number;
      totalHours: number;
    }> = [];

    for (const { person: p, matchType } of posCands) {
      if (p.personnel_id === excludePersonId) continue;
      const valid = validateSingleCandidateForSlot(p, matchType, slot);
      if (valid) result.push(valid);
    }

    return result;
  };

  const ns22RunOwner = new Map<string, string>();

  const canCoverWholeNs22Run = (
    person: PersonnelScheduleProfile,
    runId: string
  ): boolean => {
    const runUnits = openUnits.filter(
      (u) => !u.filled && u.ns22RunId === runId
    );
    if (runUnits.length <= 1) return true;
    const simShifts = [...(shiftsByPerson.get(person.personnel_id) || [])];
    for (const u of runUnits) {
      const interval = slotToInterval(u.slot);
      const v = validateJornadaConstraints(
        person,
        interval,
        simShifts,
        approvedLeaves
      );
      if (hasMandatoryJornadaViolation(v)) return false;
      simShifts.push(interval);
    }
    return true;
  };

  const nonTitularById = new Map(
    nonTitularPersonnel.map((p) => [p.personnel_id, p])
  );
  const getSlotPrioKey = (s: Pick<DotacionSlot, 'slot_key' | 'priority_slot_key'>) =>
    s.priority_slot_key || s.slot_key;
  const getAssPrioKey = (a: Pick<CrossAreaAssignment, 'slot_key' | 'priority_slot_key'>) =>
    a.priority_slot_key || a.slot_key;

  const scopedSlotByKey = new Map(
    scopedOrdinarySlots.map((s) => [getSlotPrioKey(s), s])
  );
  const emptyReplacementSlots = new Set<string>();
  const cachedReplacementsBySlotKey = new Map<
    string,
    ReturnType<typeof getValidCandidatesForSlot>
  >();
  let rosterMutationVersion = 0;
  const lastFailedRelocVersion = new Map<string, number>();

  function* tryAugmentOrDisplaceUnit(
    unit: OpenSlotUnit
  ): Generator<void, boolean, void> {
    if (lastFailedRelocVersion.get(unit.unitId) === rosterMutationVersion) {
      return false;
    }
    const slot = unit.slot;
    const slotInterval = slotToInterval(slot);

    for (let i = 0; i < ordinaryAssignments.length; i++) {
      if ((i & 15) === 0) {
        checkDeadline();
        yield;
      }
      const existingAss = ordinaryAssignments[i];
      if (
        existingAss.is_locked ||
        existingAss.assignment_kind === 'ns22_titular'
      ) {
        continue;
      }

      const existingSlot = scopedSlotByKey.get(getAssPrioKey(existingAss));
      if (!existingSlot) continue;

      const existingIsNs22 = existingAss.assignment_kind === 'ns22_replacement';
      const existingEffPrio = existingIsNs22
        ? Math.max(4, existingAss.priority_rank)
        : existingAss.priority_rank;

      // Case A: Strictly higher priority (or NS22 over non-NS22 critical) displaces lower priority
      const targetStrictlyOutranks =
        unit.effectivePriorityRank > existingEffPrio ||
        (unit.isNs22Replacement && !existingIsNs22 && unit.effectivePriorityRank === existingEffPrio);
      const canAugmentEqual = unit.effectivePriorityRank === existingEffPrio;

      if (!targetStrictlyOutranks && !canAugmentEqual) {
        continue;
      }
      if (!targetStrictlyOutranks && emptyReplacementSlots.has(getSlotPrioKey(existingSlot))) {
        continue;
      }

      // Removing a shift >8 days away (unless both touch a Sunday in the same month via occupied dates, e.g. Saturday NS22 -> Sunday 07:00) cannot resolve local rest/week/streak constraints on `slot`
      const dayDiffMs = Math.abs(
        Date.parse(`${existingAss.date}T00:00:00Z`) - Date.parse(`${slot.date}T00:00:00Z`)
      );
      if (dayDiffMs > 8 * 86_400_000) {
        if (!shiftsShareSundayMonth(slotToInterval(existingSlot), slotInterval)) {
          continue;
        }
      }

      const person = nonTitularById.get(existingAss.personnel_id);
      if (!person) continue;

      const matchForTarget = getPositionMatch(person, slot.position_id, equivalentPositionIds);
      if (
        !matchForTarget ||
        !canPersonTakeShiftInterval(person, {
          shift_id: slot.shift_id,
          shift_start: slot.shift_start,
          shift_name: slot.shift_name,
        })
      ) {
        continue;
      }

      const shiftsWithoutExisting = removeShiftInstance(
        shiftsByPerson.get(person.personnel_id) || [],
        existingAss
      );
      const targetViolations = validateJornadaConstraints(
        person,
        slotInterval,
        shiftsWithoutExisting,
        leavesByPerson.get(person.personnel_id) || []
      );
      if (hasMandatoryJornadaViolation(targetViolations)) continue;

      if (targetStrictlyOutranks) {
        shiftsByPerson.set(person.personnel_id, [
          ...shiftsWithoutExisting,
          slotInterval,
        ]);
        ordinaryAssignments[i] = {
          date: slot.date,
          personnel_id: person.personnel_id,
          shift_id: slot.shift_id,
          area_id: slot.area_id,
          position_id: slot.position_id,
          shift_start: slot.shift_start,
          shift_end: slot.shift_end,
          duration_hours: slot.shift_duration_hours,
          slot_key: slot.slot_key,
          priority_slot_key: slot.priority_slot_key,
          priority: slot.priority,
          assignment_kind: unit.isNs22Replacement
            ? 'ns22_replacement'
            : 'ordinary',
          match_type: matchForTarget,
          priority_rank: unit.effectivePriorityRank,
          is_extra: false,
          is_locked: false,
          frozen_by_rule: false,
        };
        unit.filled = true;

        const displacedUnit = openUnits.find(
          (u) => u.filled && getSlotPrioKey(u.slot) === getAssPrioKey(existingAss)
        );
        if (displacedUnit) displacedUnit.filled = false;
        emptyReplacementSlots.clear();
        cachedReplacementsBySlotKey.clear();
        rosterMutationVersion++;
        return true;
      }

      // Case B: Equal priority augmenting swap — move `person` to `slot` and fill `existingSlot` with another free candidate
      if (unit.effectivePriorityRank === existingEffPrio) {
        const exPrioKey = getSlotPrioKey(existingSlot);
        if (emptyReplacementSlots.has(exPrioKey)) continue;
        let baseReplacements = cachedReplacementsBySlotKey.get(exPrioKey);
        if (!baseReplacements) {
          baseReplacements = getValidCandidatesForSlot(existingSlot);
          cachedReplacementsBySlotKey.set(exPrioKey, baseReplacements);
        }
        const replacementsForExisting = baseReplacements.filter(
          (c) => c.person.personnel_id !== person.personnel_id
        );
        if (baseReplacements.length === 0) {
          emptyReplacementSlots.add(exPrioKey);
        }
        if (replacementsForExisting.length > 0) {
          emptyReplacementSlots.clear();
          cachedReplacementsBySlotKey.clear();
          rosterMutationVersion++;
          replacementsForExisting.sort((a, b) => {
            if (a.matchType !== b.matchType) {
              return a.matchType === 'primary' ? -1 : 1;
            }
            const prefA = getGruaAreaPreferenceScore(a.person, existingSlot, areaNameById, positionNameById);
            const prefB = getGruaAreaPreferenceScore(b.person, existingSlot, areaNameById, positionNameById);
            if (prefA !== prefB) return prefB - prefA;
            return a.warningCount - b.warningCount;
          });
          const rep = replacementsForExisting[0];

          shiftsByPerson.set(person.personnel_id, [
            ...shiftsWithoutExisting,
            slotInterval,
          ]);
          shiftsByPerson
            .get(rep.person.personnel_id)!
            .push(slotToInterval(existingSlot));

          ordinaryAssignments[i] = {
            date: existingSlot.date,
            personnel_id: rep.person.personnel_id,
            shift_id: existingSlot.shift_id,
            area_id: existingSlot.area_id,
            position_id: existingSlot.position_id,
            shift_start: existingSlot.shift_start,
            shift_end: existingSlot.shift_end,
            duration_hours: existingSlot.shift_duration_hours,
            slot_key: existingSlot.slot_key,
            priority_slot_key: existingSlot.priority_slot_key,
            priority: existingSlot.priority,
            assignment_kind: existingAss.assignment_kind,
            match_type: rep.matchType,
            priority_rank: existingAss.priority_rank,
            is_extra: false,
            is_locked: false,
            frozen_by_rule: false,
          };

          ordinaryAssignments.push({
            date: slot.date,
            personnel_id: person.personnel_id,
            shift_id: slot.shift_id,
            area_id: slot.area_id,
            position_id: slot.position_id,
            shift_start: slot.shift_start,
            shift_end: slot.shift_end,
            duration_hours: slot.shift_duration_hours,
            slot_key: slot.slot_key,
            priority_slot_key: slot.priority_slot_key,
            priority: slot.priority,
            assignment_kind: unit.isNs22Replacement
              ? 'ns22_replacement'
              : 'ordinary',
            match_type: matchForTarget,
            priority_rank: unit.effectivePriorityRank,
            is_extra: false,
            is_locked: false,
            frozen_by_rule: false,
          });
          unit.filled = true;
          return true;
        }
      }
    }

    lastFailedRelocVersion.set(unit.unitId, rosterMutationVersion);
    return false;
  };

  const priorityLevels = [4, 3, 2, 1];

  for (const prio of priorityLevels) {
    const tierUnits = openUnits.filter(
      (u) => !u.filled && u.effectivePriorityRank === prio
    );

    const candidatesBySlotKey = new Map<
      string,
      ReturnType<typeof getValidCandidatesForSlot>
    >();

    const tCandStart = performance.now();
    while (true) {
      checkDeadline();
      yield;
      const remainingTier = tierUnits.filter((u) => !u.filled);
      if (remainingTier.length === 0) break;

      // NS22 replacements go first within tier 4 (preferring NS22 when competing with other criticals)
      const ns22Remaining = remainingTier.filter((u) => u.isNs22Replacement);
      const poolToPick = ns22Remaining.length > 0 ? ns22Remaining : remainingTier;

      let chosenUnit: OpenSlotUnit | null = null;
      let chosenCandidates: ReturnType<typeof getValidCandidatesForSlot> = [];

      for (let uIdx = 0; uIdx < poolToPick.length; uIdx++) {
        if ((uIdx & 7) === 0) {
          checkDeadline();
          yield;
        }
        const unit = poolToPick[uIdx];
        const unitPrioKey = getSlotPrioKey(unit.slot);
        let cands = candidatesBySlotKey.get(unitPrioKey);
        if (!cands) {
          cands = getValidCandidatesForSlot(unit.slot);
          candidatesBySlotKey.set(unitPrioKey, cands);
        }
        if (cands.length === 0) continue;
        if (
          !chosenUnit ||
          cands.length < chosenCandidates.length ||
          (cands.length === chosenCandidates.length &&
            unit.slot.date.localeCompare(chosenUnit.slot.date) < 0)
        ) {
          chosenUnit = unit;
          chosenCandidates = cands;
        }
      }

      if (!chosenUnit) break;

      const flexibilityMap = new Map<string, number>();
      for (const c of chosenCandidates) {
        let flex = 0;
        for (const other of remainingTier) {
          if (other.unitId === chosenUnit.unitId) continue;
          if (getPositionMatch(c.person, other.slot.position_id, equivalentPositionIds)) flex++;
        }
        flexibilityMap.set(c.person.personnel_id, flex);
      }

      const runId = chosenUnit.ns22RunId;
      const existingRunOwner = runId ? ns22RunOwner.get(runId) : undefined;

      chosenCandidates.sort((a, b) => {
        if (chosenUnit!.isNs22Replacement && runId) {
          const aOwner = a.person.personnel_id === existingRunOwner ? 1 : 0;
          const bOwner = b.person.personnel_id === existingRunOwner ? 1 : 0;
          if (aOwner !== bOwner) return bOwner - aOwner;

          if (runId.endsWith('-4') && !existingRunOwner) {
            const aFull = canCoverWholeNs22Run(a.person, runId) ? 1 : 0;
            const bFull = canCoverWholeNs22Run(b.person, runId) ? 1 : 0;
            if (aFull !== bFull) return bFull - aFull;
          }
        }
        if (a.matchType !== b.matchType) {
          return a.matchType === 'primary' ? -1 : 1;
        }
        const flexA = flexibilityMap.get(a.person.personnel_id) || 0;
        const flexB = flexibilityMap.get(b.person.personnel_id) || 0;
        if (flexA !== flexB) return flexA - flexB;
        const prefA = getGruaAreaPreferenceScore(a.person, chosenUnit!.slot, areaNameById, positionNameById);
        const prefB = getGruaAreaPreferenceScore(b.person, chosenUnit!.slot, areaNameById, positionNameById);
        if (prefA !== prefB) return prefB - prefA;
        if (a.softPenalty !== b.softPenalty) {
          return a.softPenalty - b.softPenalty;
        }
        if (!disableTransportPreference && chosenUnit!.slot.requires_transport) {
          const trA = a.person.requires_transport ? 1 : 0;
          const trB = b.person.requires_transport ? 1 : 0;
          if (trA !== trB) return trB - trA;
        }
        const chosenPosName = normalizeCatalogText(
          chosenUnit!.slot.position_name || positionNameById?.get(chosenUnit!.slot.position_id)
        );
        if (
          !disableSoftPreferences &&
          !disableSupervisorWeekendBalance &&
          chosenPosName.includes('SUPERVISOR') &&
          isWeekendDate(chosenUnit!.slot.date) &&
          a.weekendCount !== b.weekendCount
        ) {
          return a.weekendCount - b.weekendCount;
        }
        if (a.warningCount !== b.warningCount) {
          return a.warningCount - b.warningCount;
        }
        return a.totalHours - b.totalHours;
      });

      const winner = chosenCandidates[0];
      const slot = chosenUnit.slot;

      ordinaryAssignments.push({
        date: slot.date,
        personnel_id: winner.person.personnel_id,
        shift_id: slot.shift_id,
        area_id: slot.area_id,
        position_id: slot.position_id,
        shift_start: slot.shift_start,
        shift_end: slot.shift_end,
        duration_hours: slot.shift_duration_hours,
        slot_key: slot.slot_key,
        priority_slot_key: slot.priority_slot_key,
        priority: slot.priority,
        assignment_kind: chosenUnit.isNs22Replacement
          ? 'ns22_replacement'
          : 'ordinary',
        match_type: winner.matchType,
        priority_rank: chosenUnit.effectivePriorityRank,
        is_extra: false,
        is_locked: false,
        frozen_by_rule: false,
      });

      shiftsByPerson.get(winner.person.personnel_id)!.push(slotToInterval(slot));
      chosenUnit.filled = true;
      rosterMutationVersion++;
      emptyReplacementSlots.clear();
      cachedReplacementsBySlotKey.clear();
      if (chosenUnit.isNs22Replacement && runId && !existingRunOwner) {
        ns22RunOwner.set(runId, winner.person.personnel_id);
      }

      // Incrementally refresh only winner.person in cached slot candidates within ±8d (or sharing a Sunday month via occupied dates)
      const winnerId = winner.person.personnel_id;
      const winnerInterval = slotToInterval(slot);
      const slotUtcMs = Date.parse(`${slot.date}T00:00:00Z`);
      const seenRefreshKeys = new Set<string>();
      for (const remUnit of remainingTier) {
        if (remUnit.filled) continue;
        const sk = getSlotPrioKey(remUnit.slot);
        if (seenRefreshKeys.has(sk)) continue;
        seenRefreshKeys.add(sk);
        const remUtcMs = Date.parse(`${remUnit.slot.date}T00:00:00Z`);
        if (Math.abs(remUtcMs - slotUtcMs) > 8 * 86_400_000) {
          if (!shiftsShareSundayMonth(winnerInterval, slotToInterval(remUnit.slot))) {
            continue;
          }
        }
        const cached = candidatesBySlotKey.get(sk);
        if (!cached) continue;
        const matchForRem = getPositionMatch(winner.person, remUnit.slot.position_id, equivalentPositionIds);
        if (!matchForRem) continue;
        const updatedWinnerEntry = validateSingleCandidateForSlot(
          winner.person,
          matchForRem,
          remUnit.slot
        );
        const filtered = cached.filter((c) => c.person.personnel_id !== winnerId);
        if (updatedWinnerEntry) filtered.push(updatedWinnerEntry);
        candidatesBySlotKey.set(sk, filtered);
      }
    }
    candidateSelectionMs += performance.now() - tCandStart;

    const tRelocStart = performance.now();
    const unfilledInTier = tierUnits.filter((u) => !u.filled);
    for (const unit of unfilledInTier) {
      checkDeadline();
      yield;
      yield* tryAugmentOrDisplaceUnit(unit);
    }
    relocationsMs += performance.now() - tRelocStart;
  }

  // Stage 4: Review and adjust complete ordinary roster
  // Retry any remaining open units via augmenting swaps after all tiers settled
  const tStage4RelocStart = performance.now();
  for (const unit of openUnits.filter((u) => !u.filled)) {
    checkDeadline();
    yield;
    const directCands = getValidCandidatesForSlot(unit.slot);
    if (directCands.length > 0) {
      directCands.sort((a, b) => {
        if (a.matchType !== b.matchType) {
          return a.matchType === 'primary' ? -1 : 1;
        }
        const prefA = getGruaAreaPreferenceScore(a.person, unit.slot, areaNameById, positionNameById);
        const prefB = getGruaAreaPreferenceScore(b.person, unit.slot, areaNameById, positionNameById);
        if (prefA !== prefB) return prefB - prefA;
        if (a.softPenalty !== b.softPenalty) {
          return a.softPenalty - b.softPenalty;
        }
        if (!disableTransportPreference && unit.slot.requires_transport) {
          const trA = a.person.requires_transport ? 1 : 0;
          const trB = b.person.requires_transport ? 1 : 0;
          if (trA !== trB) return trB - trA;
        }
        const unitPosName = normalizeCatalogText(
          unit.slot.position_name || positionNameById?.get(unit.slot.position_id)
        );
        if (
          !disableSoftPreferences &&
          !disableSupervisorWeekendBalance &&
          unitPosName.includes('SUPERVISOR') &&
          isWeekendDate(unit.slot.date) &&
          a.weekendCount !== b.weekendCount
        ) {
          return a.weekendCount - b.weekendCount;
        }
        return a.warningCount - b.warningCount;
      });
      const winner = directCands[0];
      ordinaryAssignments.push({
        date: unit.slot.date,
        personnel_id: winner.person.personnel_id,
        shift_id: unit.slot.shift_id,
        area_id: unit.slot.area_id,
        position_id: unit.slot.position_id,
        shift_start: unit.slot.shift_start,
        shift_end: unit.slot.shift_end,
        duration_hours: unit.slot.shift_duration_hours,
        slot_key: unit.slot.slot_key,
        priority_slot_key: unit.slot.priority_slot_key,
        priority: unit.slot.priority,
        assignment_kind: unit.isNs22Replacement ? 'ns22_replacement' : 'ordinary',
        match_type: winner.matchType,
        priority_rank: unit.effectivePriorityRank,
        is_extra: false,
        is_locked: false,
        frozen_by_rule: false,
      });
      shiftsByPerson.get(winner.person.personnel_id)!.push(slotToInterval(unit.slot));
      unit.filled = true;
      rosterMutationVersion++;
      emptyReplacementSlots.clear();
      cachedReplacementsBySlotKey.clear();
    } else {
      yield* tryAugmentOrDisplaceUnit(unit);
    }
  }
  relocationsMs += performance.now() - tStage4RelocStart;

  // Stage 4B: Flexible soft-preference swap pass (AM 11 continuity, 2 consecutive free days,
  // supervisor weekend balance & transport requirement match)
  // Strictly preserves all ordinary coverage, priorities, protected shifts, and 4x4 cycles.
  const slotRequiresTransportByKey = new Map<string, boolean>();
  for (const u of openUnits) {
    slotRequiresTransportByKey.set(u.slot.slot_key, Boolean(u.slot.requires_transport));
  }
  const getTransportScore = (person: PersonnelScheduleProfile, slotKey?: string): number => {
    if (disableTransportPreference || !slotKey) return 0;
    const reqTr = slotRequiresTransportByKey.get(slotKey) ?? false;
    if (!reqTr) return 0;
    return person.requires_transport ? 1 : 0;
  };

  const canSwapOrdinaryPair = (idxA: number, idxB: number): boolean => {
    const a = ordinaryAssignments[idxA];
    const b = ordinaryAssignments[idxB];
    if (
      a.is_locked ||
      b.is_locked ||
      a.frozen_by_rule ||
      b.frozen_by_rule ||
      a.assignment_kind !== 'ordinary' ||
      b.assignment_kind !== 'ordinary' ||
      a.personnel_id === b.personnel_id
    ) {
      return false;
    }
    const pA = nonTitularById.get(a.personnel_id);
    const pB = nonTitularById.get(b.personnel_id);
    if (!pA || !pB) return false;
    const matchAForB = getPositionMatch(pA, b.position_id, equivalentPositionIds);
    const matchBForA = getPositionMatch(pB, a.position_id, equivalentPositionIds);
    if (!matchAForB || !matchBForA) return false;
    if (
      !canPersonTakeShiftInterval(pA, { shift_id: b.shift_id, shift_start: b.shift_start }) ||
      !canPersonTakeShiftInterval(pB, { shift_id: a.shift_id, shift_start: a.shift_start })
    ) {
      return false;
    }

    const shiftsA = shiftsByPerson.get(pA.personnel_id) || [];
    const shiftsB = shiftsByPerson.get(pB.personnel_id) || [];
    const aWithout = removeShiftInstance(shiftsA, a);
    const bWithout = removeShiftInstance(shiftsB, b);
    const intForA: ScheduledShiftInterval = {
      date: b.date,
      shift_start: b.shift_start,
      shift_end: b.shift_end,
      duration_hours: b.duration_hours,
      shift_id: b.shift_id,
      area_id: b.area_id,
      position_id: b.position_id,
      slot_key: b.slot_key,
    };
    const intForB: ScheduledShiftInterval = {
      date: a.date,
      shift_start: a.shift_start,
      shift_end: a.shift_end,
      duration_hours: a.duration_hours,
      shift_id: a.shift_id,
      area_id: a.area_id,
      position_id: a.position_id,
      slot_key: a.slot_key,
    };

    if (
      hasMandatoryJornadaViolation(
        validateJornadaConstraints(pA, intForA, aWithout, leavesByPerson.get(pA.personnel_id) || [])
      ) ||
      hasMandatoryJornadaViolation(
        validateJornadaConstraints(pB, intForB, bWithout, leavesByPerson.get(pB.personnel_id) || [])
      )
    ) {
      return false;
    }

    const aNew = [...aWithout, intForA];
    const bNew = [...bWithout, intForB];
    const beforeCost = computeSoftPreferenceCost(shiftsA) + computeSoftPreferenceCost(shiftsB);
    const afterCost = computeSoftPreferenceCost(aNew) + computeSoftPreferenceCost(bNew);
    const isSupWeekend =
      (normalizeCatalogText(positionNameById?.get(a.position_id)).includes('SUPERVISOR') ||
        normalizeCatalogText(positionNameById?.get(b.position_id)).includes('SUPERVISOR')) &&
      (isWeekendDate(a.date) || isWeekendDate(b.date));
    const wkImbBefore = Math.abs(countWeekendShifts(shiftsA) - countWeekendShifts(shiftsB));
    const wkImbAfter = Math.abs(countWeekendShifts(aNew) - countWeekendShifts(bNew));
    const transportBefore =
      getTransportScore(pA, a.slot_key) + getTransportScore(pB, b.slot_key);
    const transportAfter =
      getTransportScore(pB, a.slot_key) + getTransportScore(pA, b.slot_key);
    const improvedCost = afterCost < beforeCost;
    const improvedSupervisorWeekend =
      !disableSupervisorWeekendBalance &&
      isSupWeekend &&
      afterCost <= beforeCost &&
      wkImbAfter < wkImbBefore;
    const improvedTransport =
      !disableTransportPreference &&
      afterCost <= beforeCost &&
      transportAfter > transportBefore;
    if (!improvedCost && !improvedSupervisorWeekend && !improvedTransport) return false;

    shiftsByPerson.set(pA.personnel_id, aNew);
    shiftsByPerson.set(pB.personnel_id, bNew);
    ordinaryAssignments[idxA] = {
      ...a,
      personnel_id: pB.personnel_id,
      match_type: matchBForA,
    };
    ordinaryAssignments[idxB] = {
      ...b,
      personnel_id: pA.personnel_id,
      match_type: matchAForB,
    };
    return true;
  };

  for (let pass = 0; pass < (disableSoftPreferences ? 0 : 2); pass++) {
    let improved = false;
    for (let i = 0; i < ordinaryAssignments.length; i++) {
      const a = ordinaryAssignments[i];
      if (a.is_locked || a.frozen_by_rule || a.assignment_kind !== 'ordinary') continue;
      for (let j = i + 1; j < ordinaryAssignments.length; j++) {
        const b = ordinaryAssignments[j];
        if (b.is_locked || b.frozen_by_rule || b.assignment_kind !== 'ordinary') continue;
        const sameDateCompatible =
          a.date === b.date && a.area_id === b.area_id && a.position_id === b.position_id;
        const sameSlotInWeek =
          a.date !== b.date &&
          a.slot_key &&
          a.slot_key.slice(10) === b.slot_key.slice(10) &&
          a.priority_rank === b.priority_rank &&
          format(startOfWeek(parseISO(a.date), { weekStartsOn: 1 }), 'yyyy-MM-dd') ===
            format(startOfWeek(parseISO(b.date), { weekStartsOn: 1 }), 'yyyy-MM-dd');
        if (!sameDateCompatible && !sameSlotInWeek) continue;
        if (canSwapOrdinaryPair(i, j)) {
          improved = true;
          break;
        }
      }
    }
    if (!improved) break;
  }

  // Stage 4C: Weekly (Mon-Sun) review of open vacancies by priority (CRITICAL -> HIGH -> NORMAL)
  // Evaluates direct fill and 2-person chain reassignments (move B from origin -> vacancy, cover origin with C),
  // favoring C below expected weekly shifts (5) while preserving priority coverage and all jornada rules.
  const weekOfDate = (dateStr: string): string =>
    format(startOfWeek(parseISO(normalizeIsoDate(dateStr)), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const countPersonWeekShifts = (personId: string, wkStart: string): number =>
    (shiftsByPerson.get(personId) || []).filter((s) => weekOfDate(s.date) === wkStart).length;

  const getExpectedWeeklyShifts = (person: PersonnelScheduleProfile): number | null => {
    if (
      person.confirmed_regime?.exempt_five_day_week ||
      titularIds.has(person.personnel_id) ||
      (person.rotation_pattern || '').toLowerCase().includes('4x4')
    ) {
      return null;
    }
    return 5;
  };

  const isUnderExpectedWeeklyShifts = (person: PersonnelScheduleProfile, wkStart: string): boolean => {
    const expected = getExpectedWeeklyShifts(person);
    if (expected === null) return false;
    return countPersonWeekShifts(person.personnel_id, wkStart) < expected;
  };

  const slotByPriorityKey = new Map<string, DotacionSlot>();
  const slotBySlotKey = new Map<string, DotacionSlot>();
  for (const u of openUnits) {
    if (u.slot.priority_slot_key) {
      slotByPriorityKey.set(u.slot.priority_slot_key, u.slot);
    }
    if (!slotBySlotKey.has(u.slot.slot_key)) {
      slotBySlotKey.set(u.slot.slot_key, u.slot);
    }
  }

  const unfilledForWeeklyReview = disableWeeklyChainReview
    ? []
    : openUnits
    .filter((u) => !u.filled)
    .sort((a, b) => {
      const wkCmp = weekOfDate(a.slot.date).localeCompare(weekOfDate(b.slot.date));
      if (wkCmp !== 0) return wkCmp;
      if (a.effectivePriorityRank !== b.effectivePriorityRank) {
        return a.effectivePriorityRank - b.effectivePriorityRank;
      }
      return a.slot.date.localeCompare(b.slot.date);
    });

  for (const unit of unfilledForWeeklyReview) {
    if (unit.filled) continue;
    checkDeadline();
    yield;

    const slot = unit.slot;
    const wkStart = weekOfDate(slot.date);
    const slotInterval = slotToInterval(slot);

    // 4C.1: Direct available & qualified candidate (favoring < 5 shifts in week)
    const directCandidates = getValidCandidatesForSlot(slot);
    if (directCandidates.length > 0) {
      directCandidates.sort((a, b) => {
        const aUnder = isUnderExpectedWeeklyShifts(a.person, wkStart) ? 0 : 1;
        const bUnder = isUnderExpectedWeeklyShifts(b.person, wkStart) ? 0 : 1;
        if (aUnder !== bUnder) return aUnder - bUnder;
        if (a.matchType !== b.matchType) return a.matchType === 'primary' ? -1 : 1;
        const prefA = getGruaAreaPreferenceScore(a.person, slot, areaNameById, positionNameById);
        const prefB = getGruaAreaPreferenceScore(b.person, slot, areaNameById, positionNameById);
        if (prefA !== prefB) return prefB - prefA;
        return a.warningCount - b.warningCount;
      });
      const chosen = directCandidates[0];
      const pShifts = shiftsByPerson.get(chosen.person.personnel_id) || [];
      pShifts.push(slotInterval);
      shiftsByPerson.set(chosen.person.personnel_id, pShifts);
      ordinaryAssignments.push({
        date: slot.date,
        personnel_id: chosen.person.personnel_id,
        shift_id: slot.shift_id,
        area_id: slot.area_id,
        position_id: slot.position_id,
        shift_start: slot.shift_start,
        shift_end: slot.shift_end,
        duration_hours: slot.shift_duration_hours,
        slot_key: slot.slot_key,
        priority_slot_key: slot.priority_slot_key,
        priority: slot.priority,
        assignment_kind: unit.isNs22Replacement ? 'ns22_replacement' : 'ordinary',
        match_type: chosen.matchType,
        priority_rank: unit.effectivePriorityRank,
        is_extra: false,
        is_locked: false,
        frozen_by_rule: false,
      });
      unit.filled = true;
      continue;
    }

    // 4C.2: 2-person chain reassignment within the same week (B: origin -> vacancy, C: -> origin)
    const eligibleForVacancy = personnelByPosition.get(slot.position_id) || [];
    const eligibleMatchByPerson = new Map<string, 'primary' | 'secondary'>();
    for (const e of eligibleForVacancy) {
      eligibleMatchByPerson.set(e.person.personnel_id, e.matchType);
    }

    let chainApplied = false;
    for (let i = 0; i < ordinaryAssignments.length; i++) {
      if (i % 40 === 0) {
        checkDeadline();
        yield;
      }
      const existingAss = ordinaryAssignments[i];
      if (
        existingAss.is_locked ||
        existingAss.frozen_by_rule ||
        existingAss.is_extra ||
        existingAss.assignment_kind === 'ns22_titular'
      ) {
        continue;
      }
      if (weekOfDate(existingAss.date) !== wkStart) continue;

      const matchB = eligibleMatchByPerson.get(existingAss.personnel_id);
      if (!matchB) continue;

      const personB = personnel.find((p) => p.personnel_id === existingAss.personnel_id);
      if (!personB) continue;
      if (titularIds.has(personB.personnel_id)) continue;

      if (
        !canPersonTakeShiftInterval(personB, {
          shift_id: slot.shift_id,
          shift_start: slot.shift_start,
          shift_name: slot.shift_name,
        })
      ) {
        continue;
      }

      const existingSlot =
        (existingAss.priority_slot_key ? slotByPriorityKey.get(existingAss.priority_slot_key) : undefined) ||
        slotBySlotKey.get(existingAss.slot_key);
      if (!existingSlot) continue;

      // Validate B moving from existingAss -> slot on B's resulting calendar (incl. adjacent weeks)
      const shiftsBWithout = removeShiftInstance(
        shiftsByPerson.get(personB.personnel_id) || [],
        existingAss
      );
      const bViolations = validateJornadaConstraints(
        personB,
        slotInterval,
        shiftsBWithout,
        leavesByPerson.get(personB.personnel_id) || []
      );
      if (hasMandatoryJornadaViolation(bViolations)) continue;

      // Find valid replacement C for existingSlot (preserving origin coverage)
      const replacementsForOrigin = getValidCandidatesForSlot(existingSlot).filter(
        (c) => c.person.personnel_id !== personB.personnel_id
      );
      if (replacementsForOrigin.length === 0) continue;

      replacementsForOrigin.sort((a, b) => {
        const aUnder = isUnderExpectedWeeklyShifts(a.person, wkStart) ? 0 : 1;
        const bUnder = isUnderExpectedWeeklyShifts(b.person, wkStart) ? 0 : 1;
        if (aUnder !== bUnder) return aUnder - bUnder;
        if (a.matchType !== b.matchType) return a.matchType === 'primary' ? -1 : 1;
        const prefA = getGruaAreaPreferenceScore(a.person, existingSlot, areaNameById, positionNameById);
        const prefB = getGruaAreaPreferenceScore(b.person, existingSlot, areaNameById, positionNameById);
        if (prefA !== prefB) return prefB - prefA;
        return a.warningCount - b.warningCount;
      });

      const repC = replacementsForOrigin[0];

      // Apply both moves together
      shiftsByPerson.set(personB.personnel_id, [...shiftsBWithout, slotInterval]);
      const shiftsC = shiftsByPerson.get(repC.person.personnel_id) || [];
      shiftsC.push(slotToInterval(existingSlot));
      shiftsByPerson.set(repC.person.personnel_id, shiftsC);

      ordinaryAssignments[i] = {
        date: existingSlot.date,
        personnel_id: repC.person.personnel_id,
        shift_id: existingSlot.shift_id,
        area_id: existingSlot.area_id,
        position_id: existingSlot.position_id,
        shift_start: existingSlot.shift_start,
        shift_end: existingAss.shift_end,
        duration_hours: existingAss.duration_hours,
        slot_key: existingAss.slot_key,
        priority_slot_key: existingAss.priority_slot_key,
        priority: existingAss.priority,
        assignment_kind: existingAss.assignment_kind,
        match_type: repC.matchType,
        priority_rank: existingAss.priority_rank,
        is_extra: false,
        is_locked: false,
        frozen_by_rule: false,
      };

      ordinaryAssignments.push({
        date: slot.date,
        personnel_id: personB.personnel_id,
        shift_id: slot.shift_id,
        area_id: slot.area_id,
        position_id: slot.position_id,
        shift_start: slot.shift_start,
        shift_end: slot.shift_end,
        duration_hours: slot.shift_duration_hours,
        slot_key: slot.slot_key,
        priority_slot_key: slot.priority_slot_key,
        priority: slot.priority,
        assignment_kind: unit.isNs22Replacement ? 'ns22_replacement' : 'ordinary',
        match_type: matchB,
        priority_rank: unit.effectivePriorityRank,
        is_extra: false,
        is_locked: false,
        frozen_by_rule: false,
      });

      unit.filled = true;
      chainApplied = true;
      break;
    }

    if (chainApplied) {
      cachedReplacementsBySlotKey.clear();
      emptyReplacementSlots.clear();
    }
  }

  // Full-roster post-audit: verify hours, 12h rest, days off, Sundays, and approved leaves
  const tAuditStart = performance.now();
  const auditViolations: JornadaViolation[] = [];
  for (const ass of ordinaryAssignments) {
    checkDeadline();
    yield;
    if (ass.assignment_kind === 'ns22_titular') continue;
    const person = personnel.find((p) => p.personnel_id === ass.personnel_id);
    if (!person) continue;
    const otherShifts = removeShiftInstance(
      shiftsByPerson.get(ass.personnel_id) || [],
      ass
    );
    const v = validateJornadaConstraints(
      person,
      {
        date: ass.date,
        shift_start: ass.shift_start,
        shift_end: ass.shift_end,
        duration_hours: ass.duration_hours,
        shift_id: ass.shift_id,
        area_id: ass.area_id,
        position_id: ass.position_id,
        slot_key: ass.slot_key,
      },
      otherShifts,
      approvedLeaves
    );
    for (const err of v.filter((item) => item.severity === 'error')) {
      auditViolations.push(err);
    }
  }

  // Flag protected assignments (ordinary or extra) in scope that coincide with a mandatory birthday
  const ns22ConflictKeys = new Set(
    (ns22Result?.titular_conflicts || []).map((c) => `${c.personnel_id}|${normalizeIsoDate(c.date)}`)
  );
  for (const pa of [...prepared.protectedOrdinaryAssignments, ...prepared.protectedExtraAssignments]) {
    const paDate = normalizeIsoDate(pa.date);
    if (paDate < normStart || paDate > normEnd) continue;
    if (areaFilter && pa.area_id !== areaFilter) continue;
    if (positionFilter && positionFilter.length > 0 && !positionFilter.includes(pa.position_id)) {
      continue;
    }
    const person = personnel.find((p) => p.personnel_id === pa.personnel_id);
    if (!person?.birth_date) continue;
    if (ns22ConflictKeys.has(`${pa.personnel_id}|${paDate}`)) continue;

    const occDates = getShiftOccupiedDates({
      date: paDate,
      shift_start: pa.shift_start || '08:00',
      shift_end: pa.shift_end || '16:00',
      duration_hours: Number(pa.duration_hours) || 8,
    });
    const birthdayHit = occDates.find((d) => isBirthdayOnDate(person.birth_date, d));
    if (birthdayHit) {
      auditViolations.push({
        type: 'leave_conflict',
        severity: 'error',
        personnel_id: pa.personnel_id,
        date: paDate,
        message: `Turno protegido el ${paDate} coincide con el cumpleaños obligatorio (${birthdayHit}) de ${person.first_name || pa.personnel_id}; requiere revisión.`,
      });
    }
  }
  finalAuditMs = performance.now() - tAuditStart;

  // Sync NS22 result summary
  if (ns22Result) {
    const ns22ReplAssignments = ordinaryAssignments.filter(
      (a) => a.assignment_kind === 'ns22_replacement'
    );
    for (const r of ns22ReplAssignments) {
      ns22Result.assignments.push({
        date: r.date,
        personnel_id: r.personnel_id,
        role: 'replacement',
        replaces_titular_id: null,
        shift_id: r.shift_id,
        area_id: r.area_id,
        position_id: r.position_id,
        shift_start: r.shift_start,
        shift_end: r.shift_end,
        duration_hours: r.duration_hours,
        occupied_dates: [r.date],
        is_locked: false,
        frozen_by_rule: false,
      });
    }
    const unfilledNs22 = openUnits.filter(
      (u) => u.isNs22Replacement && !u.filled
    );
    ns22Result.vacancies = unfilledNs22.map((u) => ({
      date: u.slot.date,
      shift_id: u.slot.shift_id,
      area_id: u.slot.area_id,
      position_id: u.slot.position_id,
      missing_titular_id: u.ns22TitularId || '',
      reason: 'Sin reemplazante compatible disponible tras optimización conjunta.',
      rejected_candidates: [],
    }));
  }

  // Stage 5: Reinforcements strictly AFTER ordinary coverage & review
  // (e.g. AM07 Mon-Fri in Airport, AM04 in any enabled Bodega, respecting scope)
  const reinforcements: CrossAreaAssignment[] = [];
  if (reinforcementConfig) {
    const rangeDays = eachDayOfInterval({
      start: parseISO(normStart),
      end: parseISO(normEnd),
    }).map((d) => format(d, 'yyyy-MM-dd'));

    const weekStarts = Array.from(
      new Set(
        rangeDays.map((d) =>
          format(startOfWeek(parseISO(d), { weekStartsOn: 1 }), 'yyyy-MM-dd')
        )
      )
    );

    const resolvePersonReinforcementOptions = (
      person: PersonnelScheduleProfile
    ): Array<{ cfg: ReinforcementShiftConfig; positionId: string }> => {
      const options: Array<{ cfg: ReinforcementShiftConfig; positionId: string }> = [];
      const candidatePositions = [
        ...(person.main_position ? [person.main_position] : []),
        ...(person.secondary_positions || []),
      ];

      for (const posId of candidatePositions) {
        const entry = reinforcementConfig[posId];
        if (!entry) continue;
        const list = Array.isArray(entry) ? entry : [entry];
        for (const cfg of list) {
          options.push({ cfg, positionId: cfg.position_id || posId });
        }
      }

      if (options.length === 0 && person.main_position_name) {
        const entry = reinforcementConfig[person.main_position_name];
        if (entry) {
          const list = Array.isArray(entry) ? entry : [entry];
          for (const cfg of list) {
            options.push({
              cfg,
              positionId: cfg.position_id || person.main_position || '',
            });
          }
        }
      }

      return options
        .filter(({ cfg, positionId }) => {
          const areaId = cfg.area_id || person.area_id || '';
          if (!areaId || !positionId) return false;
          if (areaFilter && areaId !== areaFilter) return false;
          if (
            positionFilter &&
            positionFilter.length > 0 &&
            !positionFilter.includes(positionId)
          ) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          const aArea = normalizeCatalogText(areaNameById?.get(a.cfg.area_id || person.area_id || '') || '');
          const bArea = normalizeCatalogText(areaNameById?.get(b.cfg.area_id || person.area_id || '') || '');
          const aAero = aArea.includes('AEROPUERTO') ? 0 : 1;
          const bAero = bArea.includes('AEROPUERTO') ? 0 : 1;
          return aAero - bAero;
        });
    };

    const isBodegaBackupOption = (areaId: string, positionId: string): boolean => {
      const aName = normalizeCatalogText(areaNameById?.get(areaId) || '');
      const pName = normalizeCatalogText(positionNameById?.get(positionId) || '');
      return aName.includes('BODEGA') || pName.includes('DHL') || pName.includes('FEDEX');
    };

    const bodegaBackupCountByDate = new Map<string, number>();
    for (const pa of prepared.protectedExtraAssignments) {
      const d = normalizeIsoDate(pa.date);
      if (isBodegaBackupOption(pa.area_id, pa.position_id)) {
        bodegaBackupCountByDate.set(d, (bodegaBackupCountByDate.get(d) || 0) + 1);
      }
    }

    for (const maxBodegaBackupsPerDate of [1, 2]) {
      for (const p of nonTitularPersonnel) {
        const expectedShifts = getExpectedWeeklyShifts(p);
        if (expectedShifts === null) continue;
        const reinfOptions = resolvePersonReinforcementOptions(p);
        if (reinfOptions.length === 0) continue;

        const weeklyLimit = getApplicableWeeklyHoursLimit(p);

        for (const wkStart of weekStarts) {
          const wkStartDt = parseISO(wkStart);
          const wkDays = eachDayOfInterval({
            start: wkStartDt,
            end: addDays(wkStartDt, 6),
          })
            .map((d) => format(d, 'yyyy-MM-dd'))
            .filter((d) => d >= normStart && d <= normEnd);

          for (const dStr of wkDays) {
            const currentShifts = shiftsByPerson.get(p.personnel_id) || [];
            const weekShifts = currentShifts.filter((s) => {
              const sWk = format(
                startOfWeek(parseISO(normalizeIsoDate(s.date)), { weekStartsOn: 1 }),
                'yyyy-MM-dd'
              );
              return sWk === wkStart;
            });
            if (weekShifts.length >= expectedShifts) break;

            const dayOfWeek = getDay(parseISO(dStr));
            let assignedToday = false;

            for (const { cfg, positionId } of reinfOptions) {
              if (assignedToday) break;
              if (
                Array.isArray(cfg.days_of_week) &&
                !cfg.days_of_week.includes(dayOfWeek)
              ) {
                continue;
              }
              const areaId = cfg.area_id || p.area_id || '';
              const isBodegaBackup = isBodegaBackupOption(areaId, positionId);
              if (
                isBodegaBackup &&
                (bodegaBackupCountByDate.get(dStr) || 0) >= maxBodegaBackupsPerDate
              ) {
                continue;
              }
              if (
                !canPersonTakeShiftInterval(p, {
                  shift_id: cfg.shift_id,
                  shift_start: cfg.shift_start,
                })
              ) {
                continue;
              }
              if (getTotalHours(weekShifts) + cfg.duration_hours > weeklyLimit) {
                continue;
              }

              const candidateInterval: ScheduledShiftInterval = {
                date: dStr,
                shift_start: cfg.shift_start,
                shift_end: cfg.shift_end,
                duration_hours: cfg.duration_hours,
                shift_id: cfg.shift_id,
                area_id: areaId,
                position_id: positionId,
              };

              const violations = validateJornadaConstraints(
                p,
                candidateInterval,
                currentShifts,
                approvedLeaves
              );
              if (hasMandatoryJornadaViolation(violations)) continue;

              currentShifts.push(candidateInterval);
              if (isBodegaBackup) {
                bodegaBackupCountByDate.set(
                  dStr,
                  (bodegaBackupCountByDate.get(dStr) || 0) + 1
                );
              }
              reinforcements.push({
                date: dStr,
                personnel_id: p.personnel_id,
                shift_id: cfg.shift_id,
                area_id: areaId,
                position_id: positionId,
                shift_start: cfg.shift_start,
                shift_end: cfg.shift_end,
                duration_hours: cfg.duration_hours,
                slot_key: buildDotacionSlotKey({
                  date: dStr,
                  area_id: areaId,
                  position_id: positionId,
                  shift_id: cfg.shift_id,
                }),
                assignment_kind: 'reinforcement',
                match_type: 'reinforcement',
                priority_rank: 0,
                is_extra: false,
                is_locked: false,
                frozen_by_rule: false,
              });
              assignedToday = true;
            }
          }
        }
      }
    }
  }

  // Confirm monthly free-choice permission relocations (1-to-1 assignment consumption)
  const permissionCases: PermissionRelocationCase[] = [];
  const weekStartsInRange = Array.from(
    new Set(
      eachDayOfInterval({
        start: parseISO(normStart),
        end: parseISO(normEnd),
      }).map((d) =>
        format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      )
    )
  );

  for (const p of personnel) {
    const personLeaves = approvedLeaves.filter(
      (l) => l.personnel_id === p.personnel_id && l.status === 'approved'
    );
    const syntheticBirthdays = synthesizeBirthdayLeavesForRange(p, normStart, normEnd);
    const effectivePersonLeaves = [...personLeaves, ...syntheticBirthdays];
    if (effectivePersonLeaves.length === 0) continue;

    const baseCal = baseCalendarByPerson?.get(p.personnel_id) ?? null;
    const personGeneratedAll = [...ordinaryAssignments, ...reinforcements]
      .filter((a) => a.personnel_id === p.personnel_id)
      .map((a) => ({
        date: a.date,
        shift_start: a.shift_start,
        shift_end: a.shift_end,
        duration_hours: a.duration_hours,
        shift_id: a.shift_id,
        area_id: a.area_id,
        position_id: a.position_id,
        slot_key: a.slot_key,
      }));

    const consumedIndices = new Set<number>();

    for (const wkStart of weekStartsInRange) {
      const availableConfirmed = personGeneratedAll.filter(
        (_, idx) => !consumedIndices.has(idx)
      );
      const compatibleForPerson = availableConfirmed.filter(
        (s) => !baseCal || !baseCal.has(s.date)
      );

      const wkCases = evaluatePermissionsForWeek({
        personnel: p,
        weekStartStr: wkStart,
        baseCalendarDates: baseCal,
        compatibleSlots: compatibleForPerson,
        existingShifts: [],
        confirmedRosterAssignments: availableConfirmed,
        approvedLeaves: effectivePersonLeaves,
      });

      for (const c of wkCases) {
        if (c.status === 'relocated' && c.assigned_shift) {
          const matchIdx = personGeneratedAll.findIndex(
            (s, idx) =>
              !consumedIndices.has(idx) &&
              s.date === c.assigned_shift!.date &&
              s.shift_id === c.assigned_shift!.shift_id
          );
          if (matchIdx !== -1) {
            consumedIndices.add(matchIdx);
          }
        }
        permissionCases.push(c);
      }
    }
  }

  // Final coverage measurement strictly for the attempted scope (each slot counted once)
  const generatedRefs: GeneratedAssignmentRef[] = ordinaryAssignments.map((a) => ({
    personnel_id: a.personnel_id,
    date: a.date,
    area_id: a.area_id,
    position_id: a.position_id,
    shift_id: a.shift_id,
    is_extra: false,
    priority: a.priority,
    priority_slot_key: a.priority_slot_key,
  }));

  const scopedPrepared = {
    ...prepared,
    ordinarySlots: scopedOrdinarySlots,
    extraSlots: scopedExtraSlots,
  };
  const coverage = measureDotacionCoverage(scopedPrepared, generatedRefs);
  const remainingVacancies = coverage.ordinary.slots.filter(
    (s) => s.vacancy_count > 0
  );
  const allAssignments = [...ordinaryAssignments, ...reinforcements];
  const v2TotalMs = performance.now() - v2TotalStart;

  return {
    assignments: allAssignments,
    ordinary_assignments: ordinaryAssignments,
    reinforcements,
    coverage,
    remaining_vacancies: remainingVacancies,
    audit_violations: auditViolations,
    holiday_warnings: holidayWarnings,
    ns22_result: ns22Result,
    permission_cases: permissionCases,
    stats: {
      total_required: coverage.ordinary.total_required,
      total_covered: coverage.ordinary.total_covered,
      total_vacancies: coverage.ordinary.total_vacancies,
      coverage_percent: coverage.ordinary.coverage_percent,
      covered_primary_count: ordinaryAssignments.filter(
        (a) => a.match_type === 'primary'
      ).length,
      covered_secondary_count: ordinaryAssignments.filter(
        (a) => a.match_type === 'secondary'
      ).length,
      reinforcement_count: reinforcements.length,
    },
    timings: {
      candidate_selection_ms: Math.round(candidateSelectionMs * 100) / 100,
      relocations_ms: Math.round(relocationsMs * 100) / 100,
      final_audit_ms: Math.round(finalAuditMs * 100) / 100,
      total_ms: Math.round(v2TotalMs * 100) / 100,
    },
  };
}

export function scheduleCrossArea(
  params: ScheduleCrossAreaParams
): CrossAreaScheduleResult {
  const gen = scheduleCrossAreaGen(params);
  let step = gen.next();
  while (!step.done) {
    step = gen.next();
  }
  return step.value;
}

export async function scheduleCrossAreaAsync(
  params: ScheduleCrossAreaParams
): Promise<CrossAreaScheduleResult> {
  const gen = scheduleCrossAreaGen(params);
  let lastYieldAt = Date.now();
  let step = gen.next();
  while (!step.done) {
    if (Date.now() - lastYieldAt >= 20) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      lastYieldAt = Date.now();
    }
    step = gen.next();
  }
  return step.value;
}
