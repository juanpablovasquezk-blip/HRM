import {
  buildWeeklyMatrix,
  groupDailyCountsToTemplates,
  MATRIX_DAYS_ORDER,
  type MatrixPositionGroup,
  type TemplateLike,
} from '../dotacion/matrix-utils';
import { resolveShiftDurationHours } from '../shift-duration';

export type WorkRegime = '5x2' | '4x4' | '7x7';

export interface ShiftCatalogItem {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
}

export interface StaffingCalculatorConfig {
  /** 42h current Chilean transitional limit, 40h from April 2028 */
  maxWeeklyHours: number;
  regime: WorkRegime;
  /** Art. 38 Código del Trabajo: at least 2 free Sundays per month (max 50% Sundays worked) */
  enforceTwoFreeSundaysPerMonth: boolean;
  /** Minimum rest hours between consecutive shifts (default 11h) */
  minRestHours: number;
  /** Annual vacation replacement percentage (e.g. 6.0 for ~15 business days/year) */
  vacationPct: number;
  /** Absenteeism / sick leave replacement percentage (e.g. 5.0) */
  absenteeismPct: number;
}

export const DEFAULT_STAFFING_CONFIG: StaffingCalculatorConfig = {
  maxWeeklyHours: 42,
  regime: '5x2',
  enforceTwoFreeSundaysPerMonth: true,
  minRestHours: 11,
  vacationPct: 6,
  absenteeismPct: 5,
};

export interface IncompleteShiftAlert {
  shiftId: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  durationHours: number;
}

export interface LowerBoundsResult {
  peakDaily: number;
  hoursCapacity: number;
  regimeDays: number;
  sundayRule: number;
  maxLowerBound: number;
  dominantConstraint: 'peak_daily' | 'hours_capacity' | 'regime_days' | 'sunday_rule' | 'none';
}

export interface FeasibilityResult {
  checked: boolean;
  isLowerBoundFeasible: boolean;
  minimumFeasibleStaff: number | null;
  limitingReason: string;
}

export interface GroupStaffingResult {
  groupKey: string;
  areaId: string;
  areaName: string;
  positionId: string;
  positionName: string;
  status: 'OK' | 'BLOCKED_INVALID_SHIFT_HOURS';
  incompleteShifts: IncompleteShiftAlert[];
  derivedShifts: string[];
  weeklyShifts: number;
  dailyTotals: [number, number, number, number, number, number, number];
  weeklyHoursRequired: number | null;
  monthlyHoursEstimated: number | null;
  lowerBounds: LowerBoundsResult;
  feasibility: FeasibilityResult;
  theoreticalMinStaff: number | null;
  adjustedStaffing: number | null;
  recommendedStaffing: number | null;
  replacementAdditionalStaff: number | null;
  weeklyCapacityHours: number | null;
  utilizationPct: number | null;
  legalRestrictions: string[];
  explanation: string[];
}

export interface OverallStaffingSummary {
  totalGroups: number;
  okGroups: number;
  blockedGroups: number;
  isComplete: boolean;
  totalWeeklyShifts: number;
  knownWeeklyHoursRequired: number;
  knownMonthlyHoursEstimated: number;
  totalTheoreticalMinStaff: number;
  totalAdjustedStaffing: number;
  totalRecommendedStaffing: number;
  totalReplacementAdditionalStaff: number;
  totalWeeklyCapacityHours: number;
  blockedGroupNames: string[];
  incompleteShiftNames: string[];
  derivedShiftNames: string[];
  legalRestrictions: string[];
}

export interface StaffingCalculationReport {
  config: StaffingCalculatorConfig;
  groups: GroupStaffingResult[];
  overall: OverallStaffingSummary;
}

interface ShiftDemandInstance {
  dayIdx: number; // 0=Mon .. 6=Sun
  shiftId: string;
  shiftName: string;
  startMinutes: number;
  endMinutes: number;
  durationHours: number;
}

function parseTimeToMinutes(timeStr: string): number {
  const parts = (timeStr || '00:00:00').split(':').map(Number);
  const h = Number.isFinite(parts[0]) ? parts[0] : 0;
  const m = Number.isFinite(parts[1]) ? parts[1] : 0;
  return h * 60 + m;
}

function computeRestHoursBetween(
  prevDayIdx: number,
  prevStartMin: number,
  prevEndMin: number,
  currDayIdx: number,
  currStartMin: number
): number {
  const prevCrossesMidnight = prevEndMin <= prevStartMin;
  const prevEndAbsolute = prevDayIdx * 1440 + prevEndMin + (prevCrossesMidnight ? 1440 : 0);
  const currStartAbsolute = currDayIdx * 1440 + currStartMin;
  return (currStartAbsolute - prevEndAbsolute) / 60;
}

/**
 * Checks if N workers can feasibly cover all weekly shift instances in 5x2,
 * respecting: 1 shift/day/worker, <= 5 work days/week, <= maxWeeklyHours,
 * >= minRestHours between consecutive days, and Sunday rotation cap.
 */
function canCover5x2WithWorkers(
  instances: ShiftDemandInstance[],
  workerCount: number,
  sundayDemand: number,
  config: StaffingCalculatorConfig
): { feasible: boolean; reason: string } {
  if (instances.length === 0) {
    return { feasible: true, reason: 'Sin demanda semanal.' };
  }
  if (workerCount <= 0) {
    return { feasible: false, reason: 'Dotación debe ser mayor a 0.' };
  }

  // Sunday rule: 2 free Sundays per month => at most 50% of workers on Sunday
  if (config.enforceTwoFreeSundaysPerMonth && sundayDemand > 0) {
    const maxSundayWorkers = Math.floor(workerCount / 2);
    if (sundayDemand > maxSundayWorkers) {
      return {
        feasible: false,
        reason: `Descanso dominical (máx. 50% domingos trabajados): ${sundayDemand} puesto(s) el domingo requiere al menos ${sundayDemand * 2} trabajadores.`,
      };
    }
  }

  // Sort instances by day, then longest duration first (harder to pack into maxWeeklyHours)
  const sorted = [...instances].sort((a, b) => {
    if (a.dayIdx !== b.dayIdx) return a.dayIdx - b.dayIdx;
    if (b.durationHours !== a.durationHours) return b.durationHours - a.durationHours;
    return a.startMinutes - b.startMinutes;
  });

  // Worker state
  const workedDays = Array.from({ length: workerCount }, () => new Array<boolean>(7).fill(false));
  const dayShiftInfo = Array.from({ length: workerCount }, () =>
    new Array<{ startMin: number; endMin: number } | null>(7).fill(null)
  );
  const daysCount = new Array<number>(workerCount).fill(0);
  const hoursUsed = new Array<number>(workerCount).fill(0);

  // Bounded backtracking with symmetry breaking on identical idle workers
  let steps = 0;
  const MAX_STEPS = 40000;

  function backtrack(idx: number): boolean {
    if (idx === sorted.length) return true;
    if (++steps > MAX_STEPS) return false;

    const inst = sorted[idx];
    const seenSignatures = new Set<string>();

    // Order candidate workers: prefer workers with fewer hours used (balanced packing)
    const workerOrder = Array.from({ length: workerCount }, (_, w) => w).sort((a, b) => {
      if (hoursUsed[a] !== hoursUsed[b]) return hoursUsed[a] - hoursUsed[b];
      return daysCount[a] - daysCount[b];
    });

    for (const w of workerOrder) {
      if (workedDays[w][inst.dayIdx]) continue;
      if (daysCount[w] >= 5) continue;
      if (hoursUsed[w] + inst.durationHours > config.maxWeeklyHours + 1e-6) continue;

      // Check rest from previous day (dayIdx - 1)
      if (inst.dayIdx > 0 && dayShiftInfo[w][inst.dayIdx - 1]) {
        const prev = dayShiftInfo[w][inst.dayIdx - 1]!;
        const rest = computeRestHoursBetween(
          inst.dayIdx - 1,
          prev.startMin,
          prev.endMin,
          inst.dayIdx,
          inst.startMinutes
        );
        if (rest < config.minRestHours) continue;
      }

      // Symmetry breaking across identical worker states
      const prevInfo = inst.dayIdx > 0 ? dayShiftInfo[w][inst.dayIdx - 1] : null;
      const sig = `${daysCount[w]}|${hoursUsed[w].toFixed(2)}|${prevInfo ? `${prevInfo.startMin}-${prevInfo.endMin}` : 'none'}`;
      if (seenSignatures.has(sig)) continue;
      seenSignatures.add(sig);

      workedDays[w][inst.dayIdx] = true;
      dayShiftInfo[w][inst.dayIdx] = { startMin: inst.startMinutes, endMin: inst.endMinutes };
      daysCount[w] += 1;
      hoursUsed[w] += inst.durationHours;

      if (backtrack(idx + 1)) return true;

      workedDays[w][inst.dayIdx] = false;
      dayShiftInfo[w][inst.dayIdx] = null;
      daysCount[w] -= 1;
      hoursUsed[w] -= inst.durationHours;
    }

    return false;
  }

  const ok = backtrack(0);
  if (ok) {
    return {
      feasible: true,
      reason: `Factible distribuir ${instances.length} turnos entre ${workerCount} trabajador(es) cumpliendo 5x2, ≤ ${config.maxWeeklyHours}h/sem y descanso mínimo de ${config.minRestHours}h.`,
    };
  }

  return {
    feasible: false,
    reason: `No es posible empaquetar los turnos discretos en ${workerCount} trabajador(es) respetando ≤ 5 días/sem, ≤ ${config.maxWeeklyHours}h/sem y ≥ ${config.minRestHours}h de descanso.`,
  };
}

/**
 * Verifies discrete coverage feasibility for a group under the configured regime.
 */
function verifyCoverageFeasibility(
  instances: ShiftDemandInstance[],
  lowerBounds: LowerBoundsResult,
  sundayDemand: number,
  config: StaffingCalculatorConfig
): FeasibilityResult {
  if (instances.length === 0) {
    return {
      checked: true,
      isLowerBoundFeasible: true,
      minimumFeasibleStaff: 0,
      limitingReason: 'Sin turnos requeridos en la semana.',
    };
  }

  const initialN = Math.max(1, Math.ceil(lowerBounds.maxLowerBound));

  if (config.regime === '4x4' || config.regime === '7x7') {
    // Exceptional continuous-cycle regimes operate in 2 rotating teams (A/B) of equal size
    // Each team covers peak daily demand while the other rests (average 3.5 days/week per worker).
    const minTwoTeams = Math.max(initialN, lowerBounds.peakDaily * 2);
    const evenStaff = minTwoTeams % 2 === 0 ? minTwoTeams : minTwoTeams + 1;
    const isLbOk = initialN >= evenStaff;
    return {
      checked: true,
      isLowerBoundFeasible: isLbOk,
      minimumFeasibleStaff: evenStaff,
      limitingReason: isLbOk
        ? `Régimen ${config.regime} cubierto con 2 cuadrillas alternadas (${evenStaff / 2} por grupo).`
        : `Régimen ${config.regime} requiere 2 cuadrillas alternadas para cobertura continua (${evenStaff / 2} por grupo = ${evenStaff} trabajadores).`,
    };
  }

  // 5x2 discrete feasibility search starting at ceil(maxLowerBound)
  const firstCheck = canCover5x2WithWorkers(instances, initialN, sundayDemand, config);
  if (firstCheck.feasible) {
    return {
      checked: true,
      isLowerBoundFeasible: true,
      minimumFeasibleStaff: initialN,
      limitingReason: firstCheck.reason,
    };
  }

  const maxSearch = initialN + 15;
  for (let n = initialN + 1; n <= maxSearch; n++) {
    const check = canCover5x2WithWorkers(instances, n, sundayDemand, config);
    if (check.feasible) {
      return {
        checked: true,
        isLowerBoundFeasible: false,
        minimumFeasibleStaff: n,
        limitingReason: `${firstCheck.reason} Dotación mínima factible encontrada: ${n}.`,
      };
    }
  }

  return {
    checked: false,
    isLowerBoundFeasible: false,
    minimumFeasibleStaff: null,
    limitingReason: firstCheck.reason,
  };
}

function getDominantConstraint(
  peakDaily: number,
  hoursCapacity: number,
  regimeDays: number,
  sundayRule: number
): LowerBoundsResult['dominantConstraint'] {
  const maxVal = Math.max(peakDaily, hoursCapacity, regimeDays, sundayRule);
  if (maxVal === 0) return 'none';
  if (sundayRule === maxVal) return 'sunday_rule';
  if (hoursCapacity === maxVal) return 'hours_capacity';
  if (regimeDays === maxVal) return 'regime_days';
  return 'peak_daily';
}

function computeReplacementFactor(vacationPct: number, absenteeismPct: number): number {
  const totalUnavailability = Math.max(0, Math.min(90, vacationPct + absenteeismPct));
  return 1 / (1 - totalUnavailability / 100);
}

/**
 * Pure staffing calculator consuming existing public.shifts and requirement_templates
 * via buildWeeklyMatrix. Does not modify DB or scheduler.
 */
export function calculateOperationalStaffing(
  templates: TemplateLike[],
  shiftsCatalog: ShiftCatalogItem[],
  partialConfig: Partial<StaffingCalculatorConfig> = {}
): StaffingCalculationReport {
  const config: StaffingCalculatorConfig = {
    ...DEFAULT_STAFFING_CONFIG,
    ...partialConfig,
  };

  const shiftById = new Map(shiftsCatalog.map((s) => [s.id, s]));
  const enrichedTemplates: TemplateLike[] = templates.map((t) => {
    const sh = shiftById.get(t.shift_id);
    return {
      ...t,
      shift: sh
        ? { name: sh.name, start_time: sh.start_time }
        : t.shift,
    };
  });

  const matrixGroups: MatrixPositionGroup[] = buildWeeklyMatrix(enrichedTemplates);
  const replacementFactor = computeReplacementFactor(config.vacationPct, config.absenteeismPct);
  const daysPerWorkerPerWeek = config.regime === '5x2' ? 5 : 3.5;

  const groupResults: GroupStaffingResult[] = [];
  const allIncompleteShiftNames = new Set<string>();
  const allDerivedShiftNames = new Set<string>();
  const blockedGroupNames: string[] = [];

  for (const group of matrixGroups) {
    const incompleteMap = new Map<string, IncompleteShiftAlert>();
    const derivedShiftSet = new Set<string>();
    const instances: ShiftDemandInstance[] = [];
    let weeklyHoursRequired = 0;

    for (const shiftRow of group.shifts) {
      const shiftMeta = shiftById.get(shiftRow.shiftId);
      const resolved = resolveShiftDurationHours(shiftMeta);
      const durationHours = resolved.hours;
      const hasDemand = shiftRow.weeklyTotal > 0;

      if (hasDemand && resolved.source === 'invalid') {
        incompleteMap.set(shiftRow.shiftId, {
          shiftId: shiftRow.shiftId,
          shiftName: shiftMeta?.name || shiftRow.shiftName,
          startTime: shiftMeta?.start_time || shiftRow.startTime,
          endTime: shiftMeta?.end_time || '',
          durationHours,
        });
        allIncompleteShiftNames.add(shiftMeta?.name || shiftRow.shiftName);
        continue;
      }

      if (hasDemand && resolved.source === 'derived') {
        const label = `${shiftMeta?.name || shiftRow.shiftName} (${durationHours}h)`;
        derivedShiftSet.add(label);
        allDerivedShiftNames.add(label);
      }

      const startMinutes = parseTimeToMinutes(shiftMeta?.start_time || '08:00:00');
      const endMinutes = parseTimeToMinutes(shiftMeta?.end_time || '17:00:00');

      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const count = shiftRow.counts[dayIdx] || 0;
        if (count <= 0) continue;
        weeklyHoursRequired += count * durationHours;
        for (let k = 0; k < count; k++) {
          instances.push({
            dayIdx,
            shiftId: shiftRow.shiftId,
            shiftName: shiftMeta?.name || shiftRow.shiftName,
            startMinutes,
            endMinutes,
            durationHours,
          });
        }
      }
    }

    const incompleteShifts = Array.from(incompleteMap.values());
    const peakDaily = Math.max(...group.dailyTotals, 0);
    const sundayDemand = group.dailyTotals[6] || 0;
    const regimeDays = Number((group.weeklyTotal / daysPerWorkerPerWeek).toFixed(2));
    const sundayRule =
      config.regime === '5x2' && config.enforceTwoFreeSundaysPerMonth && sundayDemand > 0
        ? sundayDemand * 2
        : 0;

    const legalRestrictions: string[] = [];
    if (config.regime === '5x2') {
      legalRestrictions.push(`Jornada ordinaria máx. ${config.maxWeeklyHours}h/semana (5 días máx.).`);
      if (config.enforceTwoFreeSundaysPerMonth && sundayDemand > 0) {
        legalRestrictions.push('Art. 38 Código del Trabajo: mínimo 2 domingos libres al mes.');
      }
    } else {
      legalRestrictions.push(
        `Régimen ${config.regime}: sujeto a autorización de jornada excepcional ante la Dirección del Trabajo (Art. 38).`
      );
    }
    legalRestrictions.push(`Descanso mínimo entre turnos: ${config.minRestHours}h.`);

    if (incompleteShifts.length > 0) {
      const groupLabel = `${group.areaName} — ${group.positionName}`;
      blockedGroupNames.push(groupLabel);

      const partialLowerMax = Math.max(peakDaily, regimeDays, sundayRule);
      groupResults.push({
        groupKey: group.groupKey,
        areaId: group.areaId,
        areaName: group.areaName,
        positionId: group.positionId,
        positionName: group.positionName,
        status: 'BLOCKED_INVALID_SHIFT_HOURS',
        incompleteShifts,
        derivedShifts: Array.from(derivedShiftSet),
        weeklyShifts: group.weeklyTotal,
        dailyTotals: group.dailyTotals,
        weeklyHoursRequired: null,
        monthlyHoursEstimated: null,
        lowerBounds: {
          peakDaily,
          hoursCapacity: 0,
          regimeDays,
          sundayRule,
          maxLowerBound: partialLowerMax,
          dominantConstraint: getDominantConstraint(peakDaily, 0, regimeDays, sundayRule),
        },
        feasibility: {
          checked: false,
          isLowerBoundFeasible: false,
          minimumFeasibleStaff: null,
          limitingReason: `Cálculo bloqueado: turno(s) con horas efectivas = 0 (${incompleteShifts.map((s) => s.shiftName).join(', ')}).`,
        },
        theoreticalMinStaff: null,
        adjustedStaffing: null,
        recommendedStaffing: null,
        replacementAdditionalStaff: null,
        weeklyCapacityHours: null,
        utilizationPct: null,
        legalRestrictions,
        explanation: [
          `Se detectaron ${group.weeklyTotal} turnos/semana (${group.shifts.map((s) => s.shiftName).join(', ')}).`,
          `Bloqueado: el/los turno(s) ${incompleteShifts.map((s) => `${s.shiftName} (${s.startTime}-${s.endTime})`).join(', ')} registran duration_hours = 0 en public.shifts.`,
          'Valida y completa las horas efectivas del turno antes de emitir una dotación recomendada definitiva.',
        ],
      });
      continue;
    }

    const hoursCapacity = Number((weeklyHoursRequired / config.maxWeeklyHours).toFixed(2));
    const maxLowerBound = Math.max(peakDaily, hoursCapacity, regimeDays, sundayRule);
    const dominantConstraint = getDominantConstraint(
      peakDaily,
      hoursCapacity,
      regimeDays,
      sundayRule
    );

    const lowerBounds: LowerBoundsResult = {
      peakDaily,
      hoursCapacity,
      regimeDays,
      sundayRule,
      maxLowerBound,
      dominantConstraint,
    };

    const feasibility = verifyCoverageFeasibility(instances, lowerBounds, sundayDemand, config);
    const theoreticalMinStaff = feasibility.minimumFeasibleStaff;
    const adjustedStaffing =
      theoreticalMinStaff !== null
        ? Number((theoreticalMinStaff * replacementFactor).toFixed(2))
        : null;

    let recommendedStaffing =
      adjustedStaffing !== null ? Math.ceil(adjustedStaffing) : null;
    if (
      recommendedStaffing !== null &&
      (config.regime === '4x4' || config.regime === '7x7') &&
      recommendedStaffing % 2 !== 0
    ) {
      recommendedStaffing += 1;
    }

    const weeklyCapacityHours =
      recommendedStaffing !== null
        ? Number((recommendedStaffing * config.maxWeeklyHours).toFixed(2))
        : null;
    const replacementAdditionalStaff =
      recommendedStaffing !== null && theoreticalMinStaff !== null
        ? Math.max(0, recommendedStaffing - theoreticalMinStaff)
        : null;
    const monthlyHoursEstimated = Number(((weeklyHoursRequired * 52) / 12).toFixed(1));
    const utilizationPct =
      weeklyCapacityHours && weeklyCapacityHours > 0
        ? Number(((weeklyHoursRequired / weeklyCapacityHours) * 100).toFixed(1))
        : null;

    const derivedShifts = Array.from(derivedShiftSet);
    const explanation: string[] = [
      `Demanda semanal: ${group.weeklyTotal} turnos (${weeklyHoursRequired}h efectivas/semana).`,
      ...(derivedShifts.length > 0
        ? [
            `Nota: ${derivedShifts.join(', ')} tiene duration_hours = 0 en BD; se usó la duración efectiva calculada desde su horario (entrada/salida - 1h colación).`,
          ]
        : []),
      `Cotas inferiores → Pico diario: ${peakDaily} | Horas (${weeklyHoursRequired}h / ${config.maxWeeklyHours}h): ${hoursCapacity} | Régimen ${config.regime}: ${regimeDays}${sundayRule > 0 ? ` | Dominical (2 dom. libres/mes): ${sundayRule}` : ''}.`,
      `Verificación de factibilidad: ${feasibility.limitingReason}`,
      theoreticalMinStaff !== null && adjustedStaffing !== null && recommendedStaffing !== null
        ? `Reemplazo (vacaciones ${config.vacationPct}% + ausentismo ${config.absenteeismPct}%, factor ${replacementFactor.toFixed(3)}): ${theoreticalMinStaff} × ${replacementFactor.toFixed(3)} = ${adjustedStaffing} → ${recommendedStaffing} trabajador(es) recomendados.`
        : 'No se pudo determinar una dotación factible dentro del límite de búsqueda.',
    ];

    groupResults.push({
      groupKey: group.groupKey,
      areaId: group.areaId,
      areaName: group.areaName,
      positionId: group.positionId,
      positionName: group.positionName,
      status: 'OK',
      incompleteShifts: [],
      derivedShifts,
      weeklyShifts: group.weeklyTotal,
      dailyTotals: group.dailyTotals,
      weeklyHoursRequired,
      monthlyHoursEstimated,
      lowerBounds,
      feasibility,
      theoreticalMinStaff,
      adjustedStaffing,
      recommendedStaffing,
      replacementAdditionalStaff,
      weeklyCapacityHours,
      utilizationPct,
      legalRestrictions,
      explanation,
    });
  }

  const okGroups = groupResults.filter((g) => g.status === 'OK');
  const blockedGroups = groupResults.filter((g) => g.status === 'BLOCKED_INVALID_SHIFT_HOURS');

  const overallLegal = [
    `Jornada evaluada: ${config.maxWeeklyHours}h semanales (Ley 40 Horas: 42h vigente hasta abril 2028, 40h desde abril 2028).`,
    config.regime === '5x2'
      ? config.enforceTwoFreeSundaysPerMonth
        ? 'Régimen 5x2 con garantía de al menos 2 domingos libres al mes (Art. 38 Código del Trabajo).'
        : 'Régimen 5x2 sin restricción de domingos libres (sujeto a excepción legal aplicable).'
      : `Régimen excepcional ${config.regime}: requiere resolución vigente de la Dirección del Trabajo.`,
  ];

  return {
    config,
    groups: groupResults,
    overall: {
      totalGroups: groupResults.length,
      okGroups: okGroups.length,
      blockedGroups: blockedGroups.length,
      isComplete: blockedGroups.length === 0,
      totalWeeklyShifts: groupResults.reduce((s, g) => s + g.weeklyShifts, 0),
      knownWeeklyHoursRequired: okGroups.reduce((s, g) => s + (g.weeklyHoursRequired || 0), 0),
      knownMonthlyHoursEstimated: Number(
        okGroups.reduce((s, g) => s + (g.monthlyHoursEstimated || 0), 0).toFixed(1)
      ),
      totalTheoreticalMinStaff: okGroups.reduce((s, g) => s + (g.theoreticalMinStaff || 0), 0),
      totalAdjustedStaffing: Number(
        okGroups.reduce((s, g) => s + (g.adjustedStaffing || 0), 0).toFixed(2)
      ),
      totalRecommendedStaffing: okGroups.reduce((s, g) => s + (g.recommendedStaffing || 0), 0),
      totalReplacementAdditionalStaff: okGroups.reduce(
        (s, g) => s + (g.replacementAdditionalStaff || 0),
        0
      ),
      totalWeeklyCapacityHours: Number(
        okGroups.reduce((s, g) => s + (g.weeklyCapacityHours || 0), 0).toFixed(2)
      ),
      blockedGroupNames,
      incompleteShiftNames: Array.from(allIncompleteShiftNames),
      derivedShiftNames: Array.from(allDerivedShiftNames),
      legalRestrictions: overallLegal,
    },
  };
}

export interface ManualServiceShiftRow {
  rowId: string;
  shiftId: string;
  /** 7 integer counts >= 0 ordered Monday (0) .. Sunday (6) */
  counts: [number, number, number, number, number, number, number];
}

export interface ManualServicePositionInput {
  positionId: string;
  positionName: string;
  shifts: ManualServiceShiftRow[];
}

export interface ManualServiceCalculationReport extends StaffingCalculationReport {
  projectName: string;
  /** Future commercial quoting / labor-cost integration metadata */
  quoteSummary: {
    projectName: string;
    totalMonthlyHoursEstimated: number;
    totalBaseStaff: number;
    totalReplacementStaff: number;
    totalRecommendedStaff: number;
  };
}

/**
 * Adapts manual service demand (L..D counts per position and shift) into TemplateLike[]
 * so the exact same calculateOperationalStaffing engine evaluates both modes.
 */
export function buildManualSimulationTemplates(
  positions: ManualServicePositionInput[],
  projectName = 'Nuevo Servicio'
): TemplateLike[] {
  const areaLabel = projectName.trim() || 'Nuevo Servicio';
  const templates: TemplateLike[] = [];

  for (const pos of positions) {
    const posName = pos.positionName.trim() || 'Cargo sin nombre';
    for (const row of pos.shifts) {
      if (!row.shiftId) continue;
      const sanitized = row.counts.map((n) =>
        typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : 0
      );
      const specs = groupDailyCountsToTemplates(sanitized);
      for (const spec of specs) {
        templates.push({
          area_id: 'manual-service',
          position_id: pos.positionId,
          shift_id: row.shiftId,
          required_count: spec.required_count,
          days_of_week: spec.days_of_week,
          area: { name: areaLabel },
          position: { name: posName },
        });
      }
    }
  }

  return templates;
}

export function calculateManualServiceStaffing(
  projectName: string,
  positions: ManualServicePositionInput[],
  shiftsCatalog: ShiftCatalogItem[],
  partialConfig: Partial<StaffingCalculatorConfig> = {}
): ManualServiceCalculationReport {
  const cleanName = projectName.trim() || 'Nuevo Servicio';
  const templates = buildManualSimulationTemplates(positions, cleanName);
  const report = calculateOperationalStaffing(templates, shiftsCatalog, partialConfig);

  return {
    ...report,
    projectName: cleanName,
    quoteSummary: {
      projectName: cleanName,
      totalMonthlyHoursEstimated: report.overall.knownMonthlyHoursEstimated,
      totalBaseStaff: report.overall.totalTheoreticalMinStaff,
      totalReplacementStaff: report.overall.totalReplacementAdditionalStaff,
      totalRecommendedStaff: report.overall.totalRecommendedStaffing,
    },
  };
}
