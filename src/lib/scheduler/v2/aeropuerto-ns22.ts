import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  parseISO,
} from 'date-fns';
import { buildDotacionSlotKey, normalizeIsoDate } from './dotacion';
import { resolveShiftDurationHours } from '../../../app/(dashboard)/shifts/shift-duration';
import {
  canPersonTakeShiftInterval,
  checkMinRestBetweenShifts,
  expandApprovedLeaves,
  getShiftOccupiedDates,
  hasMandatoryJornadaViolation,
  isBirthdayOnDate,
  validateJornadaConstraints,
} from './jornada';
import type {
  DotacionSlot,
  Ns22Assignment,
  Ns22PreservedProtected,
  Ns22ScheduleResult,
  Ns22ShiftDefinition,
  Ns22TitularConfig,
  Ns22TitularConflict,
  Ns22TitularCycleSummary,
  Ns22Vacancy,
  PersonnelScheduleProfile,
  RawExistingAssignment,
  RawLeaveRecord,
  ScheduledShiftInterval,
} from './types';

export const NS22_START_TIME = '22:00';
export const NS22_END_TIME = '07:00';

export interface Ns22AnchorResolution {
  status: 'confirmed' | 'provisional' | 'unverified';
  anchor_date: string;
  cycle_offset: number;
  notice: string | null;
}

/**
 * Resolves a titular's 4x4 anchor:
 * 1. Uses `confirmedAnchor` if available.
 * 2. Otherwise estimates the 8-day phase from observed NS22 dates (and observed
 *    off-dates without leave, if known) without restarting the cycle mid-block.
 * 3. Marks estimated anchors as `provisional`, or `unverified` if the history
 *    cannot uniquely determine the 4x4 phase.
 */
export function deriveNs22AnchorFromHistory(params: {
  personnelId: string;
  firstName?: string;
  confirmedAnchorDate?: string | null;
  confirmedCycleOffset?: number;
  observedNs22Dates: string[];
  observedWindowDates?: string[];
  leaveDates?: Set<string>;
}): Ns22AnchorResolution {
  const label = params.firstName || params.personnelId;

  if (params.confirmedAnchorDate) {
    return {
      status: 'confirmed',
      anchor_date: normalizeIsoDate(params.confirmedAnchorDate),
      cycle_offset: params.confirmedCycleOffset ?? 0,
      notice: null,
    };
  }

  const workedSet = new Set(
    params.observedNs22Dates.map((d) => normalizeIsoDate(d)).filter(Boolean)
  );
  if (workedSet.size === 0) {
    return {
      status: 'unverified',
      anchor_date: '2026-04-01',
      cycle_offset: 0,
      notice: `Titular NS22 ${label}: sin historial NS22; no se pudo verificar la fase del ciclo 4x4.`,
    };
  }

  const baseEpoch = '2026-01-01';
  const baseEpochDt = parseISO(baseEpoch);
  const matchingOffsets: number[] = [];

  for (let offset = 0; offset < 8; offset++) {
    let valid = true;

    // Every observed NS22 work date must fall in ON (0..3)
    for (const dStr of workedSet) {
      if (!isNs22TitularWorkNight(dStr, baseEpoch, offset)) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;

    // If observedWindowDates are provided, non-worked dates without leave must fall in OFF (4..7)
    if (params.observedWindowDates && params.observedWindowDates.length > 0) {
      for (const wd of params.observedWindowDates) {
        const normWd = normalizeIsoDate(wd);
        if (workedSet.has(normWd)) continue;
        if (params.leaveDates?.has(normWd)) continue;
        if (isNs22TitularWorkNight(normWd, baseEpoch, offset)) {
          valid = false;
          break;
        }
      }
    }

    if (valid) matchingOffsets.push(offset);
  }

  if (matchingOffsets.length === 1) {
    const offset = matchingOffsets[0];
    // Compute the exact day-0 anchor date >= baseEpoch for cycle_offset=0
    const shiftDays = (8 - offset) % 8;
    const anchorDate = format(addDays(baseEpochDt, shiftDays), 'yyyy-MM-dd');
    return {
      status: 'provisional',
      anchor_date: anchorDate,
      cycle_offset: 0,
      notice: `Titular NS22 ${label}: ancla provisional estimada desde historial (${anchorDate}); confirmar ancla real antes del uso operativo.`,
    };
  }

  if (matchingOffsets.length === 0) {
    return {
      status: 'unverified',
      anchor_date: '2026-04-01',
      cycle_offset: 0,
      notice: `Titular NS22 ${label}: historial inconsistente con ciclo 4x4; no se pudo verificar la fase del ciclo.`,
    };
  }

  // Multiple offsets still consistent -> phase is ambiguous
  const fallbackShift = (8 - matchingOffsets[0]) % 8;
  const fallbackAnchor = format(addDays(baseEpochDt, fallbackShift), 'yyyy-MM-dd');
  return {
    status: 'unverified',
    anchor_date: fallbackAnchor,
    cycle_offset: 0,
    notice: `Titular NS22 ${label}: historial insuficiente (${matchingOffsets.length} fases posibles); no se pudo verificar la fase del ciclo 4x4.`,
  };
}

/**
 * Determines whether a titular works on `dateStr` under a continuous 4x4 cycle
 * anchored at `anchorDate` with optional phase `cycleOffset` (in days).
 * Cycle length = 8 days: positions 0..3 ON, 4..7 OFF.
 */
export function isNs22TitularWorkNight(
  dateStr: string,
  anchorDate: string,
  cycleOffset: number = 0
): boolean {
  const target = parseISO(normalizeIsoDate(dateStr));
  const anchor = parseISO(normalizeIsoDate(anchorDate));
  const diff = differenceInCalendarDays(target, anchor);
  const cyclePos = (((diff + cycleOffset) % 8) + 8) % 8;
  return cyclePos < 4;
}

function isQualifiedForAirportNs22(
  candidate: PersonnelScheduleProfile,
  positionId: string
): { qualified: boolean; isPrimary: boolean } {
  if (candidate.main_position === positionId) {
    return { qualified: true, isPrimary: true };
  }
  if ((candidate.secondary_positions || []).includes(positionId)) {
    return { qualified: true, isPrimary: false };
  }
  return { qualified: false, isPrimary: false };
}

function groupContiguousNights(
  vacantNights: Array<{ date: string; titularId: string }>
): Array<{ titularId: string; dates: string[] }> {
  const byTitular = new Map<string, string[]>();
  for (const item of vacantNights) {
    if (!byTitular.has(item.titularId)) byTitular.set(item.titularId, []);
    byTitular.get(item.titularId)!.push(item.date);
  }

  const runs: Array<{ titularId: string; dates: string[] }> = [];

  for (const [titularId, dates] of byTitular.entries()) {
    const sorted = [...dates].sort((a, b) => a.localeCompare(b));
    let currentRun: string[] = [];

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
        runs.push({ titularId, dates: currentRun });
        currentRun = [d];
      }
    }

    if (currentRun.length > 0) {
      runs.push({ titularId, dates: currentRun });
    }
  }

  return runs;
}

/**
 * Schedules Airport NS22 (22:00 - 07:00 next day) for the two 4x4 titulares
 * and allocates replacements from enabled Airport operators on absences.
 *
 * - Cross-references real NS22 `ns22Slots` and `protectedAssignments` by
 *   (date, area, position, shift) before generating titular or replacement assignments.
 * - Nights without an ordinary requirement generate neither assignments nor vacancies.
 * - Preserves protected titular or replacement assignments and only fills remaining vacancies.
 * - If a titular has a conflicting protected shift, preserves it, reports the conflict,
 *   and keeps the 4x4 anchor immutable.
 */
export function scheduleAirportNs22(params: {
  startDate: string;
  endDate: string;
  titulares: Ns22TitularConfig[];
  shiftDef: Ns22ShiftDefinition;
  replacementCandidates: PersonnelScheduleProfile[];
  ns22Slots?: DotacionSlot[];
  protectedAssignments?: RawExistingAssignment[];
  existingShiftsByPerson?: Map<string, ScheduledShiftInterval[]>;
  approvedLeaves?: RawLeaveRecord[];
  includeReplacements?: boolean;
}): Ns22ScheduleResult {
  const {
    startDate,
    endDate,
    titulares,
    shiftDef,
    replacementCandidates,
    ns22Slots,
    protectedAssignments = [],
    existingShiftsByPerson = new Map(),
    approvedLeaves = [],
    includeReplacements = true,
  } = params;

  const verificationNotices: string[] = [];

  if (titulares.length !== 2) {
    verificationNotices.push(
      `Se esperaban 2 titulares NS22 y se recibieron ${titulares.length}; verificar configuración real de titulares.`
    );
  }

  const startTime = (shiftDef.shift_start || NS22_START_TIME).slice(0, 5);
  const endTime = (shiftDef.shift_end || NS22_END_TIME).slice(0, 5);
  if (startTime !== NS22_START_TIME || endTime !== NS22_END_TIME) {
    verificationNotices.push(
      `Horario NS22 recibido (${startTime}-${endTime}) difiere de 22:00-07:00; se aplica 22:00-07:00 según regla acordada (verificar en DB).`
    );
  }

  for (const t of titulares) {
    if (!t.confirmed_4x4_regime) {
      verificationNotices.push(
        `Titular ${t.first_name || t.personnel_id}: confirmar régimen aplicable 4x4 para exención de cuota mensual de domingos antes de habilitar en producción.`
      );
    }
  }

  const durationHours = resolveShiftDurationHours({
    duration_hours: shiftDef.duration_hours,
    start_time: shiftDef.shift_start || NS22_START_TIME,
    end_time: shiftDef.shift_end || NS22_END_TIME,
  }).hours;
  const days = eachDayOfInterval({
    start: parseISO(normalizeIsoDate(startDate)),
    end: parseISO(normalizeIsoDate(endDate)),
  }).map((d) => format(d, 'yyyy-MM-dd'));

  const assignments: Ns22Assignment[] = [];
  const preservedProtected: Ns22PreservedProtected[] = [];
  const titularConflicts: Ns22TitularConflict[] = [];
  const vacancies: Ns22Vacancy[] = [];
  const vacantNights: Array<{ date: string; titularId: string }> = [];
  const titularSet = new Set(titulares.map((t) => t.personnel_id));

  // Index real NS22 slots by date if provided
  const slotByDate = new Map<string, DotacionSlot>();
  if (ns22Slots) {
    for (const slot of ns22Slots) {
      if (slot.is_extra) continue;
      if (
        slot.area_id === shiftDef.area_id &&
        slot.position_id === shiftDef.position_id &&
        slot.shift_id === shiftDef.shift_id
      ) {
        slotByDate.set(normalizeIsoDate(slot.date), slot);
      }
    }
  }

  // Index protected ordinary assignments matching the NS22 slot, plus all protected assignments per person
  const protectedOnSlotByDate = new Map<string, RawExistingAssignment[]>();
  const protectedByPerson = new Map<string, RawExistingAssignment[]>();

  for (const pa of protectedAssignments) {
    if (pa.status === 'cancelled') continue;
    const dStr = normalizeIsoDate(pa.date);
    if (!protectedByPerson.has(pa.personnel_id)) {
      protectedByPerson.set(pa.personnel_id, []);
    }
    protectedByPerson.get(pa.personnel_id)!.push(pa);

    if (
      !pa.is_extra &&
      pa.area_id === shiftDef.area_id &&
      pa.position_id === shiftDef.position_id &&
      pa.shift_id === shiftDef.shift_id
    ) {
      if (!protectedOnSlotByDate.has(dStr)) protectedOnSlotByDate.set(dStr, []);
      protectedOnSlotByDate.get(dStr)!.push(pa);
    }
  }

  const cycleSummaries = new Map<string, Ns22TitularCycleSummary>();
  for (const t of titulares) {
    cycleSummaries.set(t.personnel_id, {
      personnel_id: t.personnel_id,
      anchor_date: normalizeIsoDate(t.anchor_date),
      cycle_offset: t.cycle_offset ?? 0,
      scheduled_nights: [],
      absent_nights: [],
      conflict_nights: [],
    });
  }

  // 1. Cross-reference real NS22 slots, protected assignments, and immutable 4x4 titular cycles
  for (const dateStr of days) {
    const slot = ns22Slots ? slotByDate.get(dateStr) : undefined;
    if (ns22Slots && (!slot || slot.required_count <= 0)) {
      // No ordinary requirement for this night -> neither assignment nor vacancy
      continue;
    }

    const slotProtected = protectedOnSlotByDate.get(dateStr) || [];
    const hasSlotInList = Boolean(slot);
    const requiredCount = hasSlotInList ? slot!.required_count : 1;
    // Use protected_filled_count from DotacionSlot when available, or counted protectedOnSlotByDate
    const protectedFilledCount = hasSlotInList
      ? Math.max(slot!.protected_filled_count, slotProtected.length)
      : slotProtected.length;

    for (const pa of slotProtected) {
      preservedProtected.push({
        date: dateStr,
        personnel_id: pa.personnel_id,
        role: titularSet.has(pa.personnel_id) ? 'titular' : 'replacement',
        shift_id: pa.shift_id,
        area_id: pa.area_id,
        position_id: pa.position_id,
      });
    }

    let remainingNeeded = Math.max(0, requiredCount - protectedFilledCount);

    for (const titular of titulares) {
      const offset = titular.cycle_offset ?? 0;
      if (!isNs22TitularWorkNight(dateStr, titular.anchor_date, offset)) {
        continue;
      }

      const summary = cycleSummaries.get(titular.personnel_id)!;
      summary.scheduled_nights.push(dateStr);

      const shiftInterval: ScheduledShiftInterval = {
        date: dateStr,
        shift_start: NS22_START_TIME,
        shift_end: NS22_END_TIME,
        duration_hours: durationHours,
        shift_id: shiftDef.shift_id,
        area_id: shiftDef.area_id,
        position_id: shiftDef.position_id,
      };
      const occupiedDates = getShiftOccupiedDates(shiftInterval);

      // Case 1: Titular already has this NS22 shift protected -> keep it, do not regenerate;
      // if it coincides with their mandatory birthday, flag conflict for review.
      const titularAlreadyProtectedHere = slotProtected.some(
        (pa) => pa.personnel_id === titular.personnel_id
      );
      if (titularAlreadyProtectedHere) {
        const birthdayHit = occupiedDates.find((d) => isBirthdayOnDate(titular.birth_date, d));
        if (birthdayHit) {
          summary.conflict_nights.push(dateStr);
          titularConflicts.push({
            date: dateStr,
            personnel_id: titular.personnel_id,
            message: `Titular ${titular.first_name || titular.personnel_id} tiene turno protegido NS22 el ${dateStr} que coincide con su cumpleaños obligatorio (${birthdayHit}); se conserva el turno protegido para revisión sin mover el ancla 4x4.`,
          });
        }
        continue;
      }

      // Case 2: Titular has an approved leave or mandatory birthday invading this NS22 interval
      const { allLeaveDates } = expandApprovedLeaves(approvedLeaves, titular.personnel_id);
      const hasLeaveOrBirthdayConflict = occupiedDates.some(
        (d) => allLeaveDates.has(d) || isBirthdayOnDate(titular.birth_date, d)
      );

      if (hasLeaveOrBirthdayConflict) {
        summary.absent_nights.push(dateStr);
        if (remainingNeeded > 0) {
          vacantNights.push({ date: dateStr, titularId: titular.personnel_id });
          remainingNeeded--;
        }
        continue;
      }

      // Case 3: Titular has another protected shift conflicting with this NS22
      const personProtected = (protectedByPerson.get(titular.personnel_id) || []).filter(
        (pa) =>
          !(
            !pa.is_extra &&
            normalizeIsoDate(pa.date) === dateStr &&
            pa.area_id === shiftDef.area_id &&
            pa.position_id === shiftDef.position_id &&
            pa.shift_id === shiftDef.shift_id
          )
      );

      let conflictMessage: string | null = null;
      const sameDayProtected = personProtected.find(
        (pa) => normalizeIsoDate(pa.date) === dateStr
      );
      if (sameDayProtected) {
        conflictMessage = `Titular ${titular.first_name || titular.personnel_id} tiene turno protegido el ${dateStr} que entra en conflicto con NS22; se conserva el turno protegido sin mover el ancla 4x4.`;
      } else {
        const protectedIntervals: ScheduledShiftInterval[] = personProtected
          .filter((pa) => pa.shift_start && pa.shift_end)
          .map((pa) => ({
            date: normalizeIsoDate(pa.date),
            shift_start: pa.shift_start!,
            shift_end: pa.shift_end!,
            duration_hours: Number(pa.duration_hours) || 8,
          }));

        if (protectedIntervals.length > 0) {
          const restV = checkMinRestBetweenShifts(
            {
              personnel_id: titular.personnel_id,
              main_position: shiftDef.position_id,
            },
            shiftInterval,
            protectedIntervals
          );
          if (restV) {
            conflictMessage = `Titular ${titular.first_name || titular.personnel_id} tiene turno protegido incompatible con NS22 el ${dateStr} (${restV.message}); se conserva el turno protegido sin mover el ancla 4x4.`;
          }
        }
      }

      if (conflictMessage) {
        summary.conflict_nights.push(dateStr);
        titularConflicts.push({
          date: dateStr,
          personnel_id: titular.personnel_id,
          message: conflictMessage,
        });
        if (remainingNeeded > 0) {
          vacantNights.push({ date: dateStr, titularId: titular.personnel_id });
          remainingNeeded--;
        }
        continue;
      }

      // Assign titular only if there is remaining uncovered slot
      if (remainingNeeded > 0) {
        assignments.push({
          date: dateStr,
          personnel_id: titular.personnel_id,
          role: 'titular',
          replaces_titular_id: null,
          shift_id: shiftDef.shift_id,
          area_id: shiftDef.area_id,
          position_id: shiftDef.position_id,
          shift_start: NS22_START_TIME,
          shift_end: NS22_END_TIME,
          duration_hours: durationHours,
          occupied_dates: occupiedDates,
          is_locked: true,
          frozen_by_rule: true,
        });
        remainingNeeded--;
      }
    }
  }

  if (!includeReplacements) {
    return {
      assignments,
      preserved_protected: preservedProtected,
      titular_conflicts: titularConflicts,
      vacancies: [],
      vacant_nights: vacantNights.map((v) => ({
        date: v.date,
        missing_titular_id: v.titularId,
      })),
      titular_cycles: Array.from(cycleSummaries.values()),
      verification_notices: verificationNotices,
    };
  }

  // 2. Prepare mutable shift history for replacement candidates (excluding titulares and exclusive non-NS22 workers)
  const qualifiedCandidates = replacementCandidates
    .filter(
      (c) =>
        !titularSet.has(c.personnel_id) &&
        canPersonTakeShiftInterval(c, {
          shift_id: shiftDef.shift_id,
          shift_start: NS22_START_TIME,
          shift_name: 'NS 22',
        })
    )
    .map((c) => ({
      profile: c,
      ...isQualifiedForAirportNs22(c, shiftDef.position_id),
    }))
    .filter((item) => item.qualified)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  const candidateShifts = new Map<string, ScheduledShiftInterval[]>();
  for (const c of qualifiedCandidates) {
    const base = existingShiftsByPerson.get(c.profile.personnel_id) || [];
    candidateShifts.set(c.profile.personnel_id, [...base]);
  }

  // 3. Cover remaining vacant nights, preferring blocks of 4 when 4 contiguous nights need coverage
  const runs = groupContiguousNights(vacantNights);

  for (const run of runs) {
    let coveredAsBlock = false;

    if (run.dates.length === 4) {
      let bestBlockCandidate: {
        personnelId: string;
        intervals: ScheduledShiftInterval[];
        warningCount: number;
      } | null = null;

      for (const cand of qualifiedCandidates) {
        const pid = cand.profile.personnel_id;
        const simShifts = [...(candidateShifts.get(pid) || [])];
        const blockIntervals: ScheduledShiftInterval[] = [];
        let blockValid = true;
        let warningCount = 0;

        for (const dStr of run.dates) {
          const interval: ScheduledShiftInterval = {
            date: dStr,
            shift_start: NS22_START_TIME,
            shift_end: NS22_END_TIME,
            duration_hours: durationHours,
            shift_id: shiftDef.shift_id,
            area_id: shiftDef.area_id,
            position_id: shiftDef.position_id,
            slot_key: buildDotacionSlotKey({
              date: dStr,
              area_id: shiftDef.area_id,
              position_id: shiftDef.position_id,
              shift_id: shiftDef.shift_id,
            }),
          };
          const violations = validateJornadaConstraints(
            cand.profile,
            interval,
            simShifts,
            approvedLeaves
          );
          if (hasMandatoryJornadaViolation(violations)) {
            blockValid = false;
            break;
          }
          warningCount += violations.filter((v) => v.severity === 'warning').length;
          simShifts.push(interval);
          blockIntervals.push(interval);
        }

        if (blockValid) {
          const scoreBoost = cand.isPrimary ? 0 : 100;
          const totalPenalty = warningCount + scoreBoost;
          if (!bestBlockCandidate || totalPenalty < bestBlockCandidate.warningCount) {
            bestBlockCandidate = {
              personnelId: pid,
              intervals: blockIntervals,
              warningCount: totalPenalty,
            };
          }
        }
      }

      if (bestBlockCandidate) {
        const currentList = candidateShifts.get(bestBlockCandidate.personnelId)!;
        for (const interval of bestBlockCandidate.intervals) {
          currentList.push(interval);
          assignments.push({
            date: interval.date,
            personnel_id: bestBlockCandidate.personnelId,
            role: 'replacement',
            replaces_titular_id: run.titularId,
            shift_id: shiftDef.shift_id,
            area_id: shiftDef.area_id,
            position_id: shiftDef.position_id,
            shift_start: NS22_START_TIME,
            shift_end: NS22_END_TIME,
            duration_hours: durationHours,
            occupied_dates: getShiftOccupiedDates(interval),
            is_locked: false,
            frozen_by_rule: false,
          });
        }
        coveredAsBlock = true;
      }
    }

    if (coveredAsBlock) continue;

    for (const dStr of run.dates) {
      const interval: ScheduledShiftInterval = {
        date: dStr,
        shift_start: NS22_START_TIME,
        shift_end: NS22_END_TIME,
        duration_hours: durationHours,
        shift_id: shiftDef.shift_id,
        area_id: shiftDef.area_id,
        position_id: shiftDef.position_id,
      };

      let bestSingle: { personnelId: string; penalty: number } | null = null;
      const rejected: Array<{ personnel_id: string; reasons: string[] }> = [];

      for (const cand of qualifiedCandidates) {
        const pid = cand.profile.personnel_id;
        const simShifts = candidateShifts.get(pid) || [];
        const violations = validateJornadaConstraints(
          cand.profile,
          interval,
          simShifts,
          approvedLeaves
        );

        if (hasMandatoryJornadaViolation(violations)) {
          rejected.push({
            personnel_id: pid,
            reasons: violations.filter((v) => v.severity === 'error').map((v) => v.message),
          });
          continue;
        }

        const warningCount = violations.filter((v) => v.severity === 'warning').length;
        const penalty = warningCount + (cand.isPrimary ? 0 : 100);
        if (!bestSingle || penalty < bestSingle.penalty) {
          bestSingle = { personnelId: pid, penalty };
        }
      }

      if (bestSingle) {
        candidateShifts.get(bestSingle.personnelId)!.push(interval);
        assignments.push({
          date: dStr,
          personnel_id: bestSingle.personnelId,
          role: 'replacement',
          replaces_titular_id: run.titularId,
          shift_id: shiftDef.shift_id,
          area_id: shiftDef.area_id,
          position_id: shiftDef.position_id,
          shift_start: NS22_START_TIME,
          shift_end: NS22_END_TIME,
          duration_hours: durationHours,
          occupied_dates: getShiftOccupiedDates(interval),
          is_locked: false,
          frozen_by_rule: false,
        });
      } else {
        vacancies.push({
          date: dStr,
          shift_id: shiftDef.shift_id,
          area_id: shiftDef.area_id,
          position_id: shiftDef.position_id,
          missing_titular_id: run.titularId,
          reason:
            qualifiedCandidates.length === 0
              ? 'No hay operadores de Aeropuerto habilitados para cubrir NS22.'
              : 'Ningún operador habilitado cumple las restricciones obligatorias (descanso/jornada/permisos).',
          rejected_candidates: rejected,
        });
      }
    }
  }

  assignments.sort((a, b) => a.date.localeCompare(b.date));

  return {
    assignments,
    preserved_protected: preservedProtected,
    titular_conflicts: titularConflicts,
    vacancies,
    titular_cycles: Array.from(cycleSummaries.values()),
    verification_notices: verificationNotices,
  };
}
