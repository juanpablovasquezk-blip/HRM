import type { SupabaseClient } from '@supabase/supabase-js';

function toTitleCaseWord(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function formatPersonShortName(firstName?: string | null, lastName?: string | null): string {
  const first = (firstName || '').trim().split(/\s+/)[0] || '';
  const last = (lastName || '').trim().split(/\s+/)[0] || '';
  return [toTitleCaseWord(first), toTitleCaseWord(last)].filter(Boolean).join(' ');
}

/**
 * Sincroniza automáticamente el bono "Turno sin Peoneta" (SIN_PEONETA) cuando un
 * ayudante de Blue Express es marcado como ausente o corregido a presente.
 */
export async function syncBlueExpressSinPeonetaBonus(
  supabase: SupabaseClient,
  assignmentId: string,
  status: 'present' | 'absent'
): Promise<{ action: 'created' | 'voided' | 'skipped'; reason?: string }> {
  if (status === 'present') {
    const { data: voided } = await supabase
      .from('bonus_records')
      .update({
        status: 'voided',
        voided_at: new Date().toISOString(),
        void_reason: 'Asistencia del ayudante corregida a presente',
      })
      .eq('external_ref', assignmentId)
      .eq('status', 'active')
      .is('paid_month', null)
      .select('id');

    return { action: voided && voided.length > 0 ? 'voided' : 'skipped' };
  }

  // 1. Obtener datos de la asignación marcada como ausente
  const { data: assignment, error: asgError } = await supabase
    .from('shift_assignments')
    .select(`
      id, date, shift_id, area_id, position_id, personnel_id, status,
      area:areas!shift_assignments_area_id_fkey(id, name),
      position:positions!shift_assignments_position_id_fkey(id, name),
      personnel:personnel!shift_assignments_personnel_id_fkey(id, first_name, last_name_father)
    `)
    .eq('id', assignmentId)
    .single();

  if (asgError || !assignment || assignment.status === 'cancelled') {
    return { action: 'skipped', reason: 'assignment_not_found_or_cancelled' };
  }

  const areaName = ((assignment.area as any)?.name || '').toUpperCase();
  const posName = ((assignment.position as any)?.name || '').toUpperCase();

  if (!areaName.includes('BLUE') || !posName.includes('AYUDANTE')) {
    return { action: 'skipped', reason: 'not_blue_express_ayudante' };
  }

  // 2. Buscar el conductor emparejado en el mismo turno y área (misma lógica que pairBlueExpress)
  const { data: shiftGroup, error: groupError } = await supabase
    .from('shift_assignments')
    .select(`
      id, personnel_id, attendance_status, status,
      position:positions!shift_assignments_position_id_fkey(id, name)
    `)
    .eq('date', assignment.date)
    .eq('area_id', assignment.area_id)
    .eq('shift_id', assignment.shift_id)
    .neq('status', 'cancelled');

  if (groupError || !shiftGroup || shiftGroup.length === 0) {
    return { action: 'skipped', reason: 'no_shift_group' };
  }

  const conductors = shiftGroup.filter((a: any) =>
    ((a.position as any)?.name || '').toUpperCase().includes('CONDUCTOR')
  );
  const ayudantes = shiftGroup.filter((a: any) =>
    ((a.position as any)?.name || '').toUpperCase().includes('AYUDANTE')
  );

  const ayudanteIndex = ayudantes.findIndex((a: any) => a.id === assignmentId);
  const pairedConductor =
    (ayudanteIndex >= 0 ? conductors[ayudanteIndex] : undefined) ||
    (conductors.length === 1 ? conductors[0] : undefined);

  if (!pairedConductor || pairedConductor.attendance_status === 'absent') {
    return { action: 'skipped', reason: 'no_active_conductor_paired' };
  }

  // 3. Buscar el tipo de bono SIN_PEONETA activo
  const { data: bonusType } = await supabase
    .from('bonus_types')
    .select('id, default_amount, active')
    .eq('code', 'SIN_PEONETA')
    .eq('active', true)
    .maybeSingle();

  if (!bonusType || bonusType.default_amount <= 0) {
    return { action: 'skipped', reason: 'bonus_type_not_found_or_inactive' };
  }

  // 4. Evitar duplicados para el mismo conductor y fecha
  const { data: existing } = await supabase
    .from('bonus_records')
    .select('id')
    .eq('personnel_id', pairedConductor.personnel_id)
    .eq('bonus_type_id', bonusType.id)
    .eq('date', assignment.date)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { action: 'skipped', reason: 'already_exists' };
  }

  // 5. Insertar el bono con observación "Ausencia de <Nombre Apellido>"
  const absentPerson = assignment.personnel as any;
  const shortName = formatPersonShortName(absentPerson?.first_name, absentPerson?.last_name_father);
  const observations = shortName ? `Ausencia de ${shortName}` : 'Ausencia de ayudante';

  const { error: insertError } = await supabase.from('bonus_records').insert({
    personnel_id: pairedConductor.personnel_id,
    bonus_type_id: bonusType.id,
    date: assignment.date,
    amount: bonusType.default_amount,
    ot_number: null,
    observations,
    status: 'active',
    source: 'manual',
    external_ref: assignmentId,
    created_by: null,
  });

  if (insertError) {
    console.error('[syncBlueExpressSinPeonetaBonus] Error inserting bonus:', insertError);
    return { action: 'skipped', reason: insertError.message };
  }

  return { action: 'created' };
}
