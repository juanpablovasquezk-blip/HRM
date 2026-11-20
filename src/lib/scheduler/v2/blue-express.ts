import { addDays, eachDayOfInterval, endOfMonth, format, getISODay, parseISO, startOfMonth, subDays, subMonths } from 'date-fns';
import { normalizeIsoDate } from './dotacion';

export interface BlueExpressIdentifiers {
  areaId: string;
  areaName: string;
  shiftId: string;
  shiftName: string;
  conductorPositionId: string;
  conductorPositionName: string;
  ayudantePositionId: string;
  ayudantePositionName: string;
}

export interface BlueExpressHistoryAssignment {
  id: string;
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  personnel_id: string;
  status: string;
  is_extra?: boolean | null;
  attendance_status?: string | null;
}

export interface BlueExpressHistoryRequirement {
  id: string;
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  required_count: number;
  is_extra?: boolean | null;
}

export interface BlueExpressNightObservation {
  date: string;
  isoWeekday: number; // 1 = Lunes .. 7 = Domingo
  state: 'with_data' | 'zero_confirmed' | 'no_data';
  valid_conductores: number;
  valid_ayudantes: number;
  duplas_completas: number;
  active_extras_count: number;
  cancellations: number;
  absences: number;
  incomplete_duplas: number;
  unconfirmed_attendance: number;
}

export type BlueExpressTrendMethod =
  | 'last_three_match'
  | 'two_month_mode_min_tie'
  | 'no_history_default_min';

export interface BlueExpressWeekdaySummary {
  isoWeekday: number;
  label: string;
  elapsed_nights_total: number;
  nights_with_data: number;
  nights_without_data: number;
  nights_zero_confirmed: number;
  history_duplas: number[];
  last_three_duplas: number[];
  cancellations_total: number;
  absences_total: number;
  incomplete_duplas_total: number;
  unconfirmed_attendance_total: number;
  trend_method: BlueExpressTrendMethod;
  raw_recommended: number;
  recommended_trucks: number; // 1..3
  proposed_conductores: number;
  proposed_ayudantes: number;
}

export interface BlueExpressRequirementDiff {
  date: string;
  weekdayLabel: string;
  position_id: string;
  position_name: string;
  existing_requirement_id: string | null;
  current_required_count: number | null;
  proposed_required_count: number;
  action: 'update' | 'create' | 'unchanged';
}

export interface BlueExpressApplyUpsertRow {
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  required_count: number;
  is_extra: false;
}

export function validateApprovedTrucksByWeekday(
  approvedByWeekday?: Record<number, number> | null
): { ok: true; normalized: Record<number, number> } | { ok: false; error: string } {
  if (!approvedByWeekday) {
    return { ok: false, error: 'Falta la pauta aprobada de camiones por día de la semana.' };
  }
  const normalized: Record<number, number> = {};
  for (let w = 1; w <= 7; w++) {
    const raw = Number(approvedByWeekday[w]);
    if (!Number.isInteger(raw) || raw < 1 || raw > 3) {
      return {
        ok: false,
        error: `Cantidad aprobada inválida para ${WEEKDAY_LABELS[w]} (${approvedByWeekday[w]}). Debe ser un entero entre 1 y 3 camiones.`,
      };
    }
    normalized[w] = raw;
  }
  return { ok: true, normalized };
}

/**
 * Construye los registros ordinarios (`is_extra = false`) a actualizar o crear para
 * Blue Express AM 00 (Conductor Camion y Ayudante) usando las cantidades aprobadas,
 * sin tocar turnos diurnos ni extras.
 */
export function buildBlueExpressApplyPlan(
  proposal: BlueExpressNightProposal,
  approvedByWeekday?: Record<number, number> | null
): BlueExpressApplyUpsertRow[] {
  const recByWeekday = new Map<number, number>(
    proposal.weekdays.map((w) => [w.isoWeekday, w.recommended_trucks])
  );
  if (approvedByWeekday) {
    const check = validateApprovedTrucksByWeekday(approvedByWeekday);
    if (!check.ok) throw new Error(check.error);
    for (let w = 1; w <= 7; w++) {
      recByWeekday.set(w, check.normalized[w]);
    }
  }
  const days = eachDayOfInterval({
    start: parseISO(proposal.target_start_date),
    end: parseISO(proposal.target_end_date),
  });
  const rows: BlueExpressApplyUpsertRow[] = [];
  for (const d of days) {
    const dateStr = format(d, 'yyyy-MM-dd');
    const trucks = recByWeekday.get(getISODay(d)) ?? 1;
    rows.push(
      {
        date: dateStr,
        area_id: proposal.identifiers.areaId,
        position_id: proposal.identifiers.conductorPositionId,
        shift_id: proposal.identifiers.shiftId,
        required_count: trucks,
        is_extra: false,
      },
      {
        date: dateStr,
        area_id: proposal.identifiers.areaId,
        position_id: proposal.identifiers.ayudantePositionId,
        shift_id: proposal.identifiers.shiftId,
        required_count: trucks,
        is_extra: false,
      }
    );
  }
  return rows;
}

export interface BlueExpressNightProposal {
  read_only: true;
  identifiers: BlueExpressIdentifiers;
  target_start_date: string;
  target_end_date: string;
  history_start_date: string;
  history_end_date: string;
  reference_date: string;
  source_mode: 'roster_duplas_estimate' | 'attendance_confirmed_duplas';
  estimate_notice: string | null;
  weekdays: BlueExpressWeekdaySummary[];
  daily_nights: BlueExpressNightObservation[];
  target_range_updates: BlueExpressRequirementDiff[];
  target_range_already_generated: boolean;
  totals: {
    elapsed_nights_evaluated: number;
    nights_with_data: number;
    nights_without_data: number;
    nights_zero_confirmed: number;
    cancellations: number;
    absences: number;
    incomplete_duplas: number;
    unconfirmed_attendance: number;
    active_extras_included: number;
    proposed_truck_nights: number;
    proposed_conductor_slots: number;
    proposed_ayudante_slots: number;
  };
}

const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

/**
 * Calcula la ventana de los 2 meses calendarios anteriores al mes de inicio planificado,
 * acotada estrictamente a noches ya transcurridas (< referenceDate).
 */
export function getTwoMonthHistoryWindow(
  targetStartDate: string,
  referenceDate: string
): {
  historyStartDate: string;
  historyEndDate: string;
  elapsedEndDate: string;
} {
  const targetStart = parseISO(normalizeIsoDate(targetStartDate));
  const twoMonthsBefore = startOfMonth(subMonths(targetStart, 2));
  const prevMonthEnd = endOfMonth(subMonths(targetStart, 1));
  const historyStartDate = format(twoMonthsBefore, 'yyyy-MM-dd');
  const historyEndDate = format(prevMonthEnd, 'yyyy-MM-dd');
  const yesterdayStr = format(subDays(parseISO(normalizeIsoDate(referenceDate)), 1), 'yyyy-MM-dd');
  const elapsedEndDate = yesterdayStr < historyEndDate ? yesterdayStr : historyEndDate;

  return { historyStartDate, historyEndDate, elapsedEndDate };
}

function clampTrucks(value: number): number {
  return Math.min(3, Math.max(1, value));
}

function pickTrendRecommendation(duplasChronological: number[]): {
  method: BlueExpressTrendMethod;
  rawRecommended: number;
  lastThree: number[];
} {
  if (duplasChronological.length === 0) {
    return { method: 'no_history_default_min', rawRecommended: 1, lastThree: [] };
  }

  const lastThree = duplasChronological.slice(-3);
  if (
    lastThree.length === 3 &&
    lastThree[0] === lastThree[1] &&
    lastThree[1] === lastThree[2]
  ) {
    return {
      method: 'last_three_match',
      rawRecommended: lastThree[0],
      lastThree,
    };
  }

  // Moda de los dos meses; en empate, elige la menor cantidad para reducir cancelaciones
  const freq = new Map<number, number>();
  for (const d of duplasChronological) {
    freq.set(d, (freq.get(d) || 0) + 1);
  }
  let bestCount = duplasChronological[0];
  let bestFreq = -1;
  for (const [val, count] of freq.entries()) {
    if (count > bestFreq || (count === bestFreq && val < bestCount)) {
      bestFreq = count;
      bestCount = val;
    }
  }

  return {
    method: 'two_month_mode_min_tie',
    rawRecommended: bestCount,
    lastThree,
  };
}

/**
 * Calcula en modo solo lectura la propuesta de dotación nocturna (AM 00) de Blue Express
 * para el rango objetivo, usando las noches transcurridas de los 2 meses previos.
 */
export function calculateBlueExpressNightStaffingProposal(params: {
  identifiers: BlueExpressIdentifiers;
  targetStartDate: string;
  targetEndDate: string;
  referenceDate: string;
  historyAssignments: BlueExpressHistoryAssignment[];
  historyRequirements: BlueExpressHistoryRequirement[];
  targetExistingRequirements: BlueExpressHistoryRequirement[];
}): BlueExpressNightProposal {
  const {
    identifiers,
    targetStartDate,
    targetEndDate,
    referenceDate,
    historyAssignments,
    historyRequirements,
    targetExistingRequirements,
  } = params;

  const normTargetStart = normalizeIsoDate(targetStartDate);
  const normTargetEnd = normalizeIsoDate(targetEndDate);
  const normRef = normalizeIsoDate(referenceDate);
  const { historyStartDate, historyEndDate, elapsedEndDate } = getTwoMonthHistoryWindow(
    normTargetStart,
    normRef
  );

  const relevantAssignsByDate = new Map<string, BlueExpressHistoryAssignment[]>();
  for (const a of historyAssignments) {
    if (a.area_id !== identifiers.areaId || a.shift_id !== identifiers.shiftId) continue;
    if (
      a.position_id !== identifiers.conductorPositionId &&
      a.position_id !== identifiers.ayudantePositionId
    ) {
      continue;
    }
    const d = normalizeIsoDate(a.date);
    const list = relevantAssignsByDate.get(d) || [];
    list.push(a);
    relevantAssignsByDate.set(d, list);
  }

  const relevantReqsByDate = new Map<string, BlueExpressHistoryRequirement[]>();
  for (const r of historyRequirements) {
    if (r.area_id !== identifiers.areaId || r.shift_id !== identifiers.shiftId) continue;
    if (
      r.position_id !== identifiers.conductorPositionId &&
      r.position_id !== identifiers.ayudantePositionId
    ) {
      continue;
    }
    const d = normalizeIsoDate(r.date);
    const list = relevantReqsByDate.get(d) || [];
    list.push(r);
    relevantReqsByDate.set(d, list);
  }

  const dailyNights: BlueExpressNightObservation[] = [];
  let totalConfirmedAttendanceRows = 0;
  let totalValidRows = 0;
  let activeExtrasIncluded = 0;

  if (historyStartDate <= elapsedEndDate) {
    const elapsedDays = eachDayOfInterval({
      start: parseISO(historyStartDate),
      end: parseISO(elapsedEndDate),
    });

    for (const dayDate of elapsedDays) {
      const dateStr = format(dayDate, 'yyyy-MM-dd');
      const isoWeekday = getISODay(dayDate);
      const dayAssigns = relevantAssignsByDate.get(dateStr) || [];
      const dayReqs = (relevantReqsByDate.get(dateStr) || []).filter((r) => !r.is_extra);

      if (dayAssigns.length === 0 && dayReqs.length === 0) {
        dailyNights.push({
          date: dateStr,
          isoWeekday,
          state: 'no_data',
          valid_conductores: 0,
          valid_ayudantes: 0,
          duplas_completas: 0,
          active_extras_count: 0,
          cancellations: 0,
          absences: 0,
          incomplete_duplas: 0,
          unconfirmed_attendance: 0,
        });
        continue;
      }

      let validConductores = 0;
      let validAyudantes = 0;
      let cancellations = 0;
      let absences = 0;
      let unconfirmedAttendance = 0;
      let dayExtras = 0;

      for (const a of dayAssigns) {
        if (a.status === 'cancelled') {
          cancellations++;
          continue;
        }
        if (a.attendance_status === 'absent') {
          absences++;
          continue;
        }
        totalValidRows++;
        if (a.attendance_status && a.attendance_status !== '') {
          totalConfirmedAttendanceRows++;
        } else {
          unconfirmedAttendance++;
        }
        if (a.is_extra) {
          dayExtras++;
          activeExtrasIncluded++;
        }
        if (a.position_id === identifiers.conductorPositionId) {
          validConductores++;
        } else if (a.position_id === identifiers.ayudantePositionId) {
          validAyudantes++;
        }
      }

      const duplas = Math.min(validConductores, validAyudantes);
      const incompleteDuplas = Math.abs(validConductores - validAyudantes);
      const state = duplas === 0 ? 'zero_confirmed' : 'with_data';

      dailyNights.push({
        date: dateStr,
        isoWeekday,
        state,
        valid_conductores: validConductores,
        valid_ayudantes: validAyudantes,
        duplas_completas: duplas,
        active_extras_count: dayExtras,
        cancellations,
        absences,
        incomplete_duplas: incompleteDuplas,
        unconfirmed_attendance: unconfirmedAttendance,
      });
    }
  }

  const weekdays: BlueExpressWeekdaySummary[] = [];
  const recommendedByWeekday = new Map<number, number>();

  for (let w = 1; w <= 7; w++) {
    const nightsForDay = dailyNights.filter((n) => n.isoWeekday === w);
    const nightsWithAnyData = nightsForDay.filter((n) => n.state !== 'no_data');
    const historyDuplas = nightsWithAnyData.map((n) => n.duplas_completas);
    const { method, rawRecommended, lastThree } = pickTrendRecommendation(historyDuplas);
    const recommendedTrucks = clampTrucks(rawRecommended);
    recommendedByWeekday.set(w, recommendedTrucks);

    weekdays.push({
      isoWeekday: w,
      label: WEEKDAY_LABELS[w],
      elapsed_nights_total: nightsForDay.length,
      nights_with_data: nightsForDay.filter((n) => n.state === 'with_data').length,
      nights_without_data: nightsForDay.filter((n) => n.state === 'no_data').length,
      nights_zero_confirmed: nightsForDay.filter((n) => n.state === 'zero_confirmed').length,
      history_duplas: historyDuplas,
      last_three_duplas: lastThree,
      cancellations_total: nightsForDay.reduce((s, n) => s + n.cancellations, 0),
      absences_total: nightsForDay.reduce((s, n) => s + n.absences, 0),
      incomplete_duplas_total: nightsForDay.reduce((s, n) => s + n.incomplete_duplas, 0),
      unconfirmed_attendance_total: nightsForDay.reduce((s, n) => s + n.unconfirmed_attendance, 0),
      trend_method: method,
      raw_recommended: rawRecommended,
      recommended_trucks: recommendedTrucks,
      proposed_conductores: recommendedTrucks,
      proposed_ayudantes: recommendedTrucks,
    });
  }

  const targetOrdinaryReqs = targetExistingRequirements.filter(
    (r) =>
      !r.is_extra &&
      r.area_id === identifiers.areaId &&
      r.shift_id === identifiers.shiftId &&
      (r.position_id === identifiers.conductorPositionId ||
        r.position_id === identifiers.ayudantePositionId)
  );
  const existingByKey = new Map<string, BlueExpressHistoryRequirement>();
  for (const r of targetOrdinaryReqs) {
    existingByKey.set(`${normalizeIsoDate(r.date)}|${r.position_id}`, r);
  }
  const targetRangeAlreadyGenerated = targetOrdinaryReqs.length > 0;

  const targetDays = eachDayOfInterval({
    start: parseISO(normTargetStart),
    end: parseISO(normTargetEnd),
  });
  const targetRangeUpdates: BlueExpressRequirementDiff[] = [];
  let proposedTruckNights = 0;

  for (const d of targetDays) {
    const dateStr = format(d, 'yyyy-MM-dd');
    const isoW = getISODay(d);
    const trucks = recommendedByWeekday.get(isoW) ?? 1;
    proposedTruckNights += trucks;

    if (targetRangeAlreadyGenerated) {
      for (const pos of [
        { id: identifiers.conductorPositionId, name: identifiers.conductorPositionName },
        { id: identifiers.ayudantePositionId, name: identifiers.ayudantePositionName },
      ]) {
        const existing = existingByKey.get(`${dateStr}|${pos.id}`) || null;
        const currentCount = existing ? existing.required_count : null;
        const action: BlueExpressRequirementDiff['action'] =
          existing === null ? 'create' : currentCount !== trucks ? 'update' : 'unchanged';
        if (action !== 'unchanged') {
          targetRangeUpdates.push({
            date: dateStr,
            weekdayLabel: WEEKDAY_LABELS[isoW],
            position_id: pos.id,
            position_name: pos.name,
            existing_requirement_id: existing ? existing.id : null,
            current_required_count: currentCount,
            proposed_required_count: trucks,
            action,
          });
        }
      }
    }
  }

  const isEstimate = totalValidRows === 0 || totalConfirmedAttendanceRows === 0;
  return {
    read_only: true,
    identifiers,
    target_start_date: normTargetStart,
    target_end_date: normTargetEnd,
    history_start_date: historyStartDate,
    history_end_date: elapsedEndDate,
    reference_date: normRef,
    source_mode: isEstimate ? 'roster_duplas_estimate' : 'attendance_confirmed_duplas',
    estimate_notice: isEstimate
      ? 'Estimación por duplas del roster: los registros disponibles no tienen asistencia confirmada ni tabla de camiones despachados.'
      : null,
    weekdays,
    daily_nights: dailyNights,
    target_range_updates: targetRangeUpdates,
    target_range_already_generated: targetRangeAlreadyGenerated,
    totals: {
      elapsed_nights_evaluated: dailyNights.length,
      nights_with_data: dailyNights.filter((n) => n.state === 'with_data').length,
      nights_without_data: dailyNights.filter((n) => n.state === 'no_data').length,
      nights_zero_confirmed: dailyNights.filter((n) => n.state === 'zero_confirmed').length,
      cancellations: dailyNights.reduce((s, n) => s + n.cancellations, 0),
      absences: dailyNights.reduce((s, n) => s + n.absences, 0),
      incomplete_duplas: dailyNights.reduce((s, n) => s + n.incomplete_duplas, 0),
      unconfirmed_attendance: dailyNights.reduce((s, n) => s + n.unconfirmed_attendance, 0),
      active_extras_included: activeExtrasIncluded,
      proposed_truck_nights: proposedTruckNights,
      proposed_conductor_slots: proposedTruckNights,
      proposed_ayudante_slots: proposedTruckNights,
    },
  };
}
