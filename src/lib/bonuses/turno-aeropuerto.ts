export const TURNO_AEROPUERTO_CODE = 'TURNO_AEROPUERTO';
export const TURNO_AEROPUERTO_AMOUNT = 5000;

export interface TurnoAeropuertoSyncResult {
  action:
    | 'created'
    | 'already_exists'
    | 'voided'
    | 'paid_difference_review'
    | 'not_eligible'
    | 'noop';
  bonusId?: string;
  paidMonth?: string;
  warning?: string;
}

export function normalizeCatalogLabel(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isConductorCamionBlueExpress(
  positionName: string | null | undefined,
  areaName: string | null | undefined
): boolean {
  const pos = normalizeCatalogLabel(positionName);
  const areaCompact = normalizeCatalogLabel(areaName).replace(/\s+/g, '');
  const isConductorCamion = pos.includes('CONDUCTOR') && pos.includes('CAMION');
  const isBlueExpress = areaCompact.includes('BLUEEXPRESS');
  return isConductorCamion && isBlueExpress;
}

export function isEligibleTurnoAeropuertoAssignment(
  positionName: string | null | undefined,
  areaName: string | null | undefined
): boolean {
  const pos = normalizeCatalogLabel(positionName);
  const area = normalizeCatalogLabel(areaName);

  if (pos === 'OPERADOR AEROPUERTO') {
    return !area || area === 'AEROPUERTO';
  }

  if (pos === 'OPERADOR FEDEX') {
    return !area || area === 'BODEGAS' || area === 'FEDEX';
  }

  if (pos === 'OPERADOR DHL') {
    return !area || area === 'BODEGAS' || area === 'DHL';
  }

  return false;
}

export function buildTurnoAeropuertoExternalRef(personnelId: string, date: string): string {
  return `${TURNO_AEROPUERTO_CODE}:${personnelId}:${date}`;
}

function isUniqueViolationError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code ?? '');
  const msg = String(error.message ?? '').toLowerCase();
  return code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint');
}

export async function syncTurnoAeropuertoBonus(
  supabase: any,
  assignmentId: string
): Promise<TurnoAeropuertoSyncResult> {
  // 1. Obtener la asignación editada
  const { data: targetAssignment, error: targetErr } = await supabase
    .from('shift_assignments')
    .select('id, date, personnel_id')
    .eq('id', assignmentId)
    .maybeSingle();

  if (targetErr || !targetAssignment?.personnel_id || !targetAssignment?.date) {
    return { action: 'noop' };
  }

  const personnelId: string = targetAssignment.personnel_id;
  const date: string = targetAssignment.date;

  // 2. Obtener tipo de bono TURNO_AEROPUERTO
  const { data: bonusType, error: btErr } = await supabase
    .from('bonus_types')
    .select('id, default_amount, active')
    .eq('code', TURNO_AEROPUERTO_CODE)
    .eq('active', true)
    .maybeSingle();

  if (btErr || !bonusType?.id) {
    return { action: 'noop' };
  }

  // 3. Verificar cargo principal y área de la ficha desde el catálogo
  const { data: worker, error: workerErr } = await supabase
    .from('personnel')
    .select('id, main_position')
    .eq('id', personnelId)
    .maybeSingle();

  if (workerErr || !worker) {
    return { action: 'noop' };
  }

  let isConductorBlue = false;
  if (worker.main_position) {
    const { data: mainPos } = await supabase
      .from('positions')
      .select('id, name, area_id')
      .eq('id', worker.main_position)
      .maybeSingle();

    let mainAreaName: string | null = null;
    if (mainPos?.area_id) {
      const { data: mainArea } = await supabase
        .from('areas')
        .select('id, name')
        .eq('id', mainPos.area_id)
        .maybeSingle();
      mainAreaName = mainArea?.name ?? null;
    }

    isConductorBlue = isConductorCamionBlueExpress(mainPos?.name, mainAreaName);
  }

  // 4. Evaluar todas las asignaciones activas del trabajador en esa fecha
  const { data: dayAssignments, error: dayErr } = await supabase
    .from('shift_assignments')
    .select('id, status, attendance_status, position_id, area_id')
    .eq('personnel_id', personnelId)
    .eq('date', date)
    .neq('status', 'cancelled');

  if (dayErr) {
    return { action: 'noop' };
  }

  const presentAssignments = (dayAssignments ?? []).filter(
    (a: any) => a.attendance_status === 'present'
  );

  let eligiblePresent: { id: string; posName: string; areaName: string } | null = null;

  if (isConductorBlue && presentAssignments.length > 0) {
    const posIds = Array.from(
      new Set(presentAssignments.map((a: any) => a.position_id).filter(Boolean))
    );
    const areaIds = Array.from(
      new Set(presentAssignments.map((a: any) => a.area_id).filter(Boolean))
    );

    const [{ data: posRows }, { data: areaRows }] = await Promise.all([
      posIds.length > 0
        ? supabase.from('positions').select('id, name, area_id').in('id', posIds)
        : Promise.resolve({ data: [] }),
      areaIds.length > 0
        ? supabase.from('areas').select('id, name').in('id', areaIds)
        : Promise.resolve({ data: [] }),
    ]);

    const posMap = new Map<string, any>((posRows ?? []).map((p: any) => [p.id, p]));
    const areaMap = new Map<string, any>((areaRows ?? []).map((a: any) => [a.id, a]));

    // Si alguna asignación no tiene area_id explícito pero su cargo tiene area_id en catálogo, resolverla también
    const missingAreaIds = (posRows ?? [])
      .map((p: any) => p.area_id)
      .filter((id: string | null) => id && !areaMap.has(id));
    if (missingAreaIds.length > 0) {
      const { data: extraAreas } = await supabase
        .from('areas')
        .select('id, name')
        .in('id', missingAreaIds);
      for (const a of extraAreas ?? []) {
        areaMap.set(a.id, a);
      }
    }

    for (const a of presentAssignments) {
      const pos = a.position_id ? posMap.get(a.position_id) : null;
      const effectiveAreaId = a.area_id ?? pos?.area_id ?? null;
      const area = effectiveAreaId ? areaMap.get(effectiveAreaId) : null;

      if (isEligibleTurnoAeropuertoAssignment(pos?.name, area?.name)) {
        eligiblePresent = {
          id: a.id,
          posName: pos?.name ?? 'Operador',
          areaName: area?.name ?? '',
        };
        break;
      }
    }
  }

  // 5. Buscar bono activo existente para (personnel_id, bonus_type_id, date)
  const { data: existingActive, error: existingErr } = await supabase
    .from('bonus_records')
    .select('id, paid_month')
    .eq('personnel_id', personnelId)
    .eq('bonus_type_id', bonusType.id)
    .eq('date', date)
    .eq('status', 'active')
    .maybeSingle();

  if (existingErr) {
    return { action: 'noop' };
  }

  // 6. Caso elegible y presente -> crear 1 solo bono automático si no existe
  if (eligiblePresent) {
    if (existingActive) {
      return { action: 'already_exists', bonusId: existingActive.id };
    }

    const amount = Number(bonusType.default_amount) || TURNO_AEROPUERTO_AMOUNT;
    const areaSuffix = eligiblePresent.areaName ? ` (${eligiblePresent.areaName})` : '';
    const externalRef = buildTurnoAeropuertoExternalRef(personnelId, date);

    const { data: inserted, error: insertErr } = await supabase
      .from('bonus_records')
      .insert({
        personnel_id: personnelId,
        bonus_type_id: bonusType.id,
        date,
        amount,
        ot_number: null,
        observations: `Bono automático: ${eligiblePresent.posName}${areaSuffix}`,
        status: 'active',
        source: 'manual',
        external_ref: externalRef,
      })
      .select('id')
      .single();

    if (insertErr) {
      if (isUniqueViolationError(insertErr)) {
        return { action: 'already_exists' };
      }
      throw insertErr;
    }

    return { action: 'created', bonusId: inserted?.id };
  }

  // 7. Caso sin turno elegible presente -> revertir si no está liquidado, o informar diferencia si ya fue liquidado
  if (!existingActive) {
    return { action: 'not_eligible' };
  }

  if (existingActive.paid_month) {
    return {
      action: 'paid_difference_review',
      bonusId: existingActive.id,
      paidMonth: existingActive.paid_month,
      warning: `Diferencia para revisión: el Bono Turno Aeropuerto del ${date} ya fue liquidado en ${existingActive.paid_month} y no se revirtió automáticamente.`,
    };
  }

  const { error: voidErr } = await supabase
    .from('bonus_records')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      void_reason: 'Asistencia corregida: sin turno elegible presente en la fecha',
    })
    .eq('id', existingActive.id)
    .eq('status', 'active')
    .is('paid_month', null);

  if (voidErr) {
    throw voidErr;
  }

  return { action: 'voided', bonusId: existingActive.id };
}
