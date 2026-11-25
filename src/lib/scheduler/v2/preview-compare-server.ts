import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';
import { deriveNs22AnchorFromHistory } from './aeropuerto-ns22';
import { fetchAllPaginated } from './pagination';
import type { CompareEnginesPreviewParams } from './preview-compare';
import { resolveShiftDurationHours } from '../../../app/(dashboard)/shifts/shift-duration';

export function normalizeCatalogLabel(v?: string | null): string {
  return (v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Resolves the "Operador Aeropuerto" position unequivocally.
 * Never falls back to generic Aeropuerto matching (which could pick Supervisor Aeropuerto).
 */
export function resolveOperadorAeropuertoPosition<T extends { id: string; name?: string | null }>(
  positions: T[]
): T | undefined {
  return positions.find((p) => normalizeCatalogLabel(p.name) === 'OPERADOR AEROPUERTO');
}

export const PRIORITY_QUOTA_BATCH_SIZE = 100;

export async function fetchPriorityQuotasInBatches(
  supabase: any,
  reqIds: string[],
  batchSize: number = PRIORITY_QUOTA_BATCH_SIZE
): Promise<
  | { ok: true; quotasByReqId: Map<string, Array<{ priority: string; required_count: number }>> }
  | { ok: false; error: string }
> {
  const uniqueIds = Array.from(new Set(reqIds.filter(Boolean)));
  const quotasByReqId = new Map<string, Array<{ priority: string; required_count: number }>>();
  if (uniqueIds.length === 0) {
    return { ok: true, quotasByReqId };
  }

  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('shift_requirement_priority_quotas')
      .select('shift_requirement_id, priority, required_count')
      .in('shift_requirement_id', batch);

    if (error) {
      const msg = typeof error === 'string' ? error : error.message || JSON.stringify(error);
      return {
        ok: false,
        error: `Error al cargar desglose de prioridades por lote (${Math.floor(i / batchSize) + 1}): ${msg}`,
      };
    }

    for (const q of data || []) {
      const list = quotasByReqId.get(q.shift_requirement_id) || [];
      list.push({ priority: q.priority, required_count: q.required_count });
      quotasByReqId.set(q.shift_requirement_id, list);
    }
  }

  return { ok: true, quotasByReqId };
}

export interface LoadPreviewCompareParams {
  startDate: string;
  endDate: string;
  areaId?: string;
  personnelIds?: string[];
  positionFilter?: string | string[];
}

export async function loadPreviewCompareInputs(
  supabase: any,
  params: LoadPreviewCompareParams
): Promise<
  | { ok: true; compareParams: CompareEnginesPreviewParams }
  | { ok: false; error: string }
> {
  const { startDate, endDate, areaId, personnelIds, positionFilter } = params;
  const sDate = parseISO(startDate);
  const eDate = parseISO(endDate);

  // Load full calendar month(s) + 14d lookback / 7d lookahead for weeks, Sundays, streaks, and 12h rests
  const monthBoundStart = format(startOfMonth(sDate), 'yyyy-MM-dd');
  const weekLookbackStart = format(startOfWeek(subDays(sDate, 14), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const extendedStart = monthBoundStart < weekLookbackStart ? monthBoundStart : weekLookbackStart;

  const monthBoundEnd = format(endOfMonth(eDate), 'yyyy-MM-dd');
  const weekLookaheadEnd = format(endOfWeek(addDays(eDate, 7), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const extendedEnd = monthBoundEnd > weekLookaheadEnd ? monthBoundEnd : weekLookaheadEnd;

  const [
    reqRes,
    persRes,
    posRes,
    shiftRes,
    areaRes,
    assRes,
    leaveRes,
  ] = await Promise.all([
    fetchAllPaginated<any>(async (from, to) =>
      await supabase
        .from('shift_requirements')
        .select('*, shift:shifts(name, start_time, end_time, duration_hours, requires_transport), area:areas(name), positions(name)')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    supabase.from('personnel').select('*').eq('is_active', true),
    supabase.from('positions').select('*'),
    supabase.from('shifts').select('*'),
    supabase.from('areas').select('id, name'),
    fetchAllPaginated<any>(async (from, to) =>
      await supabase
        .from('shift_assignments')
        .select('*, shift:shifts!shift_id(name, start_time, end_time, duration_hours)')
        .gte('date', extendedStart)
        .lte('date', extendedEnd)
        .order('date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPaginated<any>(async (from, to) =>
      await supabase
        .from('leaves')
        .select('*')
        .eq('status', 'approved')
        .lte('start_date', extendedEnd)
        .gte('end_date', extendedStart)
        .order('start_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);

  const queryErrors = [
    reqRes.error && `shift_requirements: ${reqRes.error}`,
    persRes.error && `personnel: ${persRes.error.message}`,
    posRes.error && `positions: ${posRes.error.message}`,
    shiftRes.error && `shifts: ${shiftRes.error.message}`,
    areaRes.error && `areas: ${areaRes.error.message}`,
    assRes.error && `shift_assignments: ${assRes.error}`,
    leaveRes.error && `leaves: ${leaveRes.error}`,
  ].filter(Boolean);

  if (queryErrors.length > 0) {
    return {
      ok: false,
      error: `Error al cargar datos para vista previa (${queryErrors.join(' | ')})`,
    };
  }

  const rawRequirementsRaw = reqRes.data || [];
  let rawRequirements = rawRequirementsRaw;
  if (rawRequirementsRaw.length > 0) {
    const reqIds = rawRequirementsRaw.map((r: any) => r.id).filter(Boolean);
    const quotaResult = await fetchPriorityQuotasInBatches(supabase, reqIds);
    if (!quotaResult.ok) {
      return { ok: false, error: quotaResult.error };
    }
    rawRequirements = rawRequirementsRaw.map((r: any) => ({
      ...r,
      priority_quotas: quotaResult.quotasByReqId.get(r.id) || null,
    }));
  }
  const personnelRaw = persRes.data || [];
  const positions = posRes.data || [];
  const allShifts = shiftRes.data || [];
  const areas = areaRes.data || [];
  const existingAssignments = assRes.data || [];
  const leaves = leaveRes.data || [];

  const unconfirmedRules: string[] = [];
  const areaNameById = new Map<string, string>(areas.map((a: any) => [a.id, a.name]));
  const positionNameById = new Map<string, string>(positions.map((p: any) => [p.id, p.name]));
  const blueAreaId = areas.find((a: any) => (a.name || '').toLowerCase().includes('blue'))?.id || '';

  const rawPosFilters = Array.isArray(positionFilter)
    ? positionFilter
    : positionFilter && positionFilter !== 'none'
      ? [positionFilter]
      : [];
  const targetPositionIds =
    rawPosFilters.length > 0
      ? positions
          .filter((pos: any) =>
            rawPosFilters.some((f) => (pos.name || '').toLowerCase().includes(f.trim().toLowerCase()))
          )
          .map((pos: any) => pos.id)
      : null;

  const activePersonnel = personnelRaw.filter((p: any) => {
    if (p.requires_shifts === false) return false;
    const mainPos = positions.find((pos: any) => pos.id === p.main_position);
    if (mainPos && mainPos.requires_shifts === false) return false;
    if (personnelIds && personnelIds.length > 0 && !personnelIds.includes(p.id)) return false;
    return true;
  });

  const personnelProfiles = activePersonnel.map((p: any) => {
    const mainPos = positions.find((pos: any) => pos.id === p.main_position);
    return {
      personnel_id: p.id,
      first_name: p.first_name,
      full_name: [p.first_name, p.last_name_father].filter(Boolean).join(' '),
      birth_date: p.birth_date || null,
      main_position: p.main_position,
      main_position_name: mainPos?.name,
      secondary_positions: p.secondary_positions || [],
      rotation_pattern: p.rotation_pattern,
      has_special_contract: Boolean(p.has_special_contract),
      fixed_shift_id: p.fixed_shift_id,
      area_id: mainPos?.area_id || '',
      prefers_night: Boolean(p.prefers_night),
      avoids_night: Boolean(p.avoids_night),
      requires_transport: Boolean(p.requires_transport),
    };
  });

  const norm = normalizeCatalogLabel;
  const aeroArea = areas.find((a: any) => norm(a.name) === 'AEROPUERTO');
  const aeroPos = resolveOperadorAeropuertoPosition(positions);
  const ns22Shift = allShifts.find(
    (s: any) => norm(s.name).includes('NS 22') || (s.start_time || '').startsWith('22:00')
  );

  const aero4x4Workers = activePersonnel.filter((p: any) => {
    if (!aeroPos) return false;
    return norm(p.rotation_pattern).includes('4X4') && p.main_position === aeroPos.id;
  });

  let ns22Config: CompareEnginesPreviewParams['ns22Config'] = null;

  if (aeroArea && aeroPos && ns22Shift && aero4x4Workers.length === 2) {
    const preStartDt = subDays(sDate, 1);
    const extStartDt = parseISO(extendedStart);
    const observedWindowDates =
      extStartDt <= preStartDt
        ? eachDayOfInterval({ start: extStartDt, end: preStartDt }).map((d) =>
            format(d, 'yyyy-MM-dd')
          )
        : [];

    const titulares = aero4x4Workers.map((w: any) => {
      const pastNs22 = existingAssignments
        .filter(
          (a: any) =>
            a.personnel_id === w.id &&
            a.shift_id === ns22Shift.id &&
            a.status !== 'cancelled' &&
            String(a.date).split('T')[0] < startDate
        )
        .map((a: any) => String(a.date).split('T')[0]);

      const personLeaveDates = new Set<string>();
      for (const l of leaves as any[]) {
        if (l.personnel_id !== w.id || l.status !== 'approved') continue;
        const ls = parseISO(String(l.start_date).split('T')[0]);
        const le = parseISO(String(l.end_date).split('T')[0]);
        if (!isNaN(ls.getTime()) && !isNaN(le.getTime()) && ls <= le) {
          for (const d of eachDayOfInterval({ start: ls, end: le })) {
            personLeaveDates.add(format(d, 'yyyy-MM-dd'));
          }
        }
      }

      const resolved = deriveNs22AnchorFromHistory({
        personnelId: w.id,
        firstName: w.first_name,
        confirmedAnchorDate: (w as any).ns22_anchor_date ?? null,
        observedNs22Dates: pastNs22,
        observedWindowDates,
        leaveDates: personLeaveDates,
      });

      if (resolved.notice) {
        unconfirmedRules.push(resolved.notice);
      }

      return {
        personnel_id: w.id,
        first_name: w.first_name,
        birth_date: (w as any).birth_date || null,
        anchor_date: resolved.anchor_date,
        cycle_offset: resolved.cycle_offset,
        confirmed_4x4_regime: false,
      };
    });

    ns22Config = {
      titulares,
      shiftDef: {
        shift_id: ns22Shift.id,
        area_id: aeroArea.id,
        position_id: aeroPos.id,
        shift_start: ns22Shift.start_time,
        shift_end: ns22Shift.end_time,
        duration_hours: resolveShiftDurationHours(ns22Shift).hours,
      },
    };
  } else {
    unconfirmedRules.push(
      `Regla NS22 4x4 sin evaluar completamente en vista previa (área=${aeroArea ? 'OK' : 'faltante'}, cargo=${aeroPos ? 'OK' : 'faltante'}, turno NS22=${ns22Shift ? 'OK' : 'faltante'}, titulares 4x4=${aero4x4Workers.length}).`
    );
  }

  const reinforcementConfig: Record<string, any> = {};
  const am07Shift = allShifts.find(
    (s: any) => norm(s.name).includes('AM 07') || (s.start_time || '').startsWith('07:00')
  );
  const am04Shift = allShifts.find(
    (s: any) => norm(s.name).includes('AM 04') || (s.start_time || '').startsWith('04:00')
  );

  if (aeroPos && aeroArea && am07Shift) {
    reinforcementConfig[aeroPos.id] = {
      shift_id: am07Shift.id,
      shift_start: am07Shift.start_time,
      shift_end: am07Shift.end_time,
      duration_hours: Number(am07Shift.duration_hours) || 8,
      area_id: aeroArea.id,
      position_id: aeroPos.id,
      days_of_week: [1, 2, 3, 4, 5],
    };
  } else {
    unconfirmedRules.push('Refuerzo Aeropuerto AM07 (L-V) sin evaluar: falta turno AM07 o catálogo de Aeropuerto.');
  }

  const bodegaPositions = positions.filter((p: any) => {
    const pn = norm(p.name);
    return pn.includes('BODEGA') || pn.includes('FEDEX') || pn.includes('DHL');
  });
  if (am04Shift && bodegaPositions.length > 0) {
    for (const bp of bodegaPositions) {
      if (!bp.area_id) continue;
      reinforcementConfig[bp.id] = {
        shift_id: am04Shift.id,
        shift_start: am04Shift.start_time,
        shift_end: am04Shift.end_time,
        duration_hours: Number(am04Shift.duration_hours) || 8,
        area_id: bp.area_id,
        position_id: bp.id,
      };
    }
  } else {
    unconfirmedRules.push('Refuerzo Bodegas AM04 sin evaluar: falta turno AM04 o cargos de Bodega.');
  }

  const baseCalendarByPerson = new Map<string, Set<string>>();
  for (const a of existingAssignments as any[]) {
    if (a.status === 'cancelled' || a.is_extra) continue;
    const d = String(a.date).split('T')[0];
    if (!baseCalendarByPerson.has(a.personnel_id)) {
      baseCalendarByPerson.set(a.personnel_id, new Set<string>());
    }
    baseCalendarByPerson.get(a.personnel_id)!.add(d);
  }

  let baselineRangeHash: string | null = null;
  if (typeof supabase.rpc === 'function') {
    const { data: hashData, error: hashErr } = await supabase.rpc('compute_roster_range_hash', {
      p_start_date: startDate,
      p_end_date: endDate,
    });
    if (!hashErr && typeof hashData === 'string' && hashData.trim()) {
      baselineRangeHash = hashData.trim();
    }
  }

  return {
    ok: true,
    compareParams: {
      startDate,
      endDate,
      rawRequirements: rawRequirements as any,
      existingAssignments: existingAssignments.map((a: any) => ({
        ...a,
        shift_start: a.shift?.start_time,
        shift_end: a.shift?.end_time,
        duration_hours: a.shift?.duration_hours,
      })),
      personnel: personnelProfiles,
      approvedLeaves: leaves as any,
      allShifts: allShifts as any,
      blueAreaId,
      areaFilter: areaId && areaId !== 'all' ? areaId : null,
      positionFilter: targetPositionIds,
      ns22Config,
      excludeUnconfiguredNs22: true,
      reinforcementConfig,
      areaNameById,
      positionNameById,
      baseCalendarByPerson,
      unconfirmedRules,
      baselineRangeHash,
    },
  };
}
