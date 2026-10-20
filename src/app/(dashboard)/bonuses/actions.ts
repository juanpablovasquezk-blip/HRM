'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { BonusRecord, BonusType } from '@/types/database';

export interface BonusFilters {
  startDate?: string;
  endDate?: string;
  companyId?: string;
  bonusTypeId?: string;
  status?: 'active' | 'voided' | 'all';
  paidStatus?: 'all' | 'paid' | 'pending';
  otNumber?: string;
  searchPersonnel?: string;
}

/**
 * Obtener listado de bonos con filtros completos
 */
export async function getBonusRecords(filters: BonusFilters = {}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    let query = admin
      .from('bonus_records')
      .select(`
        *,
        bonus_type:bonus_types (
          id, code, name, default_amount, amount_is_editable, requires_ot, active
        ),
        personnel:personnel_id (
          id, first_name, last_name_father, last_name_mother, rut, company_id,
          company:companies!personnel_company_id_fkey(id, name)
        )
      `)
      .order('date', { ascending: false });

    if (filters.startDate) {
      query = query.gte('date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('date', filters.endDate);
    }
    if (filters.bonusTypeId && filters.bonusTypeId !== 'ALL') {
      query = query.eq('bonus_type_id', filters.bonusTypeId);
    }
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.paidStatus === 'paid') {
      query = query.not('paid_month', 'is', null);
    } else if (filters.paidStatus === 'pending') {
      query = query.is('paid_month', null);
    }
    if (filters.otNumber && filters.otNumber.trim() !== '') {
      query = query.ilike('ot_number', `%${filters.otNumber.trim()}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[getBonusRecords] Error:', error);
      return { success: false, error: error.message, data: [] };
    }

    let records = (data as any[]) || [];

    // Filtros en memoria para joins anidados (Company y SearchPersonnel)
    if (filters.companyId && filters.companyId !== 'ALL') {
      records = records.filter((r) => r.personnel?.company_id === filters.companyId);
    }

    if (filters.searchPersonnel && filters.searchPersonnel.trim() !== '') {
      const q = filters.searchPersonnel.trim().toLowerCase();
      records = records.filter((r) => {
        const p = r.personnel;
        if (!p) return false;
        const fullName = `${p.first_name || ''} ${p.last_name_father || ''} ${p.last_name_mother || ''}`.toLowerCase();
        const rut = (p.rut || '').toLowerCase();
        return fullName.includes(q) || rut.includes(q);
      });
    }

    return { success: true, data: records as BonusRecord[] };
  } catch (err: any) {
    console.error('[getBonusRecords] Unexpected:', err);
    return { success: false, error: err.message, data: [] };
  }
}

/**
 * Crear un bono individual
 */
export async function createBonusRecord(payload: {
  personnel_id: string;
  bonus_type_id: string;
  date: string;
  amount: number;
  ot_number?: string | null;
  observations?: string | null;
}) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    const admin = createAdminClient();

    // 1. Obtener el tipo de bono para validar requerimientos
    const { data: bonusType, error: typeError } = await admin
      .from('bonus_types')
      .select('*')
      .eq('id', payload.bonus_type_id)
      .single();

    if (typeError || !bonusType) {
      return { success: false, error: 'Tipo de bono no encontrado' };
    }

    if (!bonusType.active) {
      return { success: false, error: 'Este tipo de bono está actualmente desactivado.' };
    }

    // 2. Validar requerimiento de OT
    const cleanOt = payload.ot_number?.trim() || null;
    if (bonusType.requires_ot && !cleanOt) {
      return { success: false, error: 'El N° de Orden de Trabajo (OT) es obligatorio para este tipo de bono.' };
    }

    // 3. Validar duplicidad de OT para el mismo trabajador y tipo
    if (cleanOt) {
      const { data: duplicate } = await admin
        .from('bonus_records')
        .select('id')
        .eq('personnel_id', payload.personnel_id)
        .eq('bonus_type_id', payload.bonus_type_id)
        .eq('ot_number', cleanOt)
        .eq('status', 'active')
        .maybeSingle();

      if (duplicate) {
        return { 
          success: false, 
          error: `Este colaborador ya tiene un bono activo registrado para la OT "${cleanOt}".` 
        };
      }
    }

    // 4. Determinar monto a guardar
    const finalAmount = bonusType.amount_is_editable ? payload.amount : bonusType.default_amount;
    if (finalAmount <= 0) {
      return { success: false, error: 'El monto del bono debe ser mayor a $0.' };
    }

    const { data, error } = await admin
      .from('bonus_records')
      .insert({
        personnel_id: payload.personnel_id,
        bonus_type_id: payload.bonus_type_id,
        date: payload.date,
        amount: finalAmount,
        ot_number: cleanOt,
        observations: payload.observations?.trim() || null,
        status: 'active',
        source: 'manual',
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[createBonusRecord] Error:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/bonuses');
    revalidatePath('/reports/bonos');
    return { success: true, data };
  } catch (err: any) {
    console.error('[createBonusRecord] Unexpected:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Creación masiva de bonos para múltiples colaboradores asociados a una misma OT
 */
export async function createBatchBonusRecord(payload: {
  personnel_ids: string[];
  bonus_type_id: string;
  date: string;
  ot_number: string;
  observations?: string | null;
}) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    if (!payload.personnel_ids || payload.personnel_ids.length === 0) {
      return { success: false, error: 'Debes seleccionar al menos un colaborador.' };
    }

    const cleanOt = payload.ot_number.trim();
    if (!cleanOt) {
      return { success: false, error: 'El N° de OT es obligatorio para el ingreso grupal.' };
    }

    const admin = createAdminClient();

    const { data: bonusType, error: typeError } = await admin
      .from('bonus_types')
      .select('*')
      .eq('id', payload.bonus_type_id)
      .single();

    if (typeError || !bonusType) {
      return { success: false, error: 'Tipo de bono no encontrado' };
    }

    const finalAmount = bonusType.default_amount;
    if (finalAmount <= 0) {
      return { success: false, error: 'El monto del bono debe ser mayor a 0 para emisión en lote.' };
    }

    // Verificar quiénes ya tienen bono para esa OT para advertir y omitir duplicados
    const { data: existingRecords } = await admin
      .from('bonus_records')
      .select('personnel_id')
      .eq('bonus_type_id', payload.bonus_type_id)
      .eq('ot_number', cleanOt)
      .eq('status', 'active')
      .in('personnel_id', payload.personnel_ids);

    const alreadyRegisteredIds = new Set((existingRecords || []).map((r) => r.personnel_id));
    const toInsertIds = payload.personnel_ids.filter((id) => !alreadyRegisteredIds.has(id));

    if (toInsertIds.length === 0) {
      return {
        success: false,
        error: 'Todos los colaboradores seleccionados ya tenían registrado este bono para la OT ingresada.',
      };
    }

    const rowsToInsert = toInsertIds.map((pId) => ({
      personnel_id: pId,
      bonus_type_id: payload.bonus_type_id,
      date: payload.date,
      amount: finalAmount,
      ot_number: cleanOt,
      observations: payload.observations?.trim() || null,
      status: 'active',
      source: 'manual',
      created_by: user.id,
    }));

    const { error: insertError } = await admin.from('bonus_records').insert(rowsToInsert);

    if (insertError) {
      console.error('[createBatchBonusRecord] Error:', insertError);
      return { success: false, error: insertError.message };
    }

    revalidatePath('/bonuses');
    revalidatePath('/reports/bonos');

    return {
      success: true,
      insertedCount: toInsertIds.length,
      skippedCount: alreadyRegisteredIds.size,
    };
  } catch (err: any) {
    console.error('[createBatchBonusRecord] Unexpected:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Anular un bono (con registro de motivo, fecha y usuario auditor)
 */
export async function voidBonusRecord(id: string, reason: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    if (!reason || reason.trim().length < 4) {
      return { success: false, error: 'Debes indicar un motivo de anulación detallado.' };
    }

    const admin = createAdminClient();

    // Verificar si ya está liquidado
    const { data: existing, error: findError } = await admin
      .from('bonus_records')
      .select('paid_month, status')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      return { success: false, error: 'Bono no encontrado' };
    }

    if (existing.paid_month) {
      return { success: false, error: 'No se puede anular un bono que ya fue liquidado en nómina.' };
    }

    if (existing.status === 'voided') {
      return { success: false, error: 'Este bono ya se encuentra anulado.' };
    }

    const { error } = await admin
      .from('bonus_records')
      .update({
        status: 'voided',
        voided_at: new Date().toISOString(),
        voided_by: user.id,
        void_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('[voidBonusRecord] Error:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/bonuses');
    revalidatePath('/reports/bonos');
    return { success: true };
  } catch (err: any) {
    console.error('[voidBonusRecord] Unexpected:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Actualizar datos de un bono activo no liquidado
 */
export async function updateBonusRecord(
  id: string,
  payload: {
    date?: string;
    amount?: number;
    ot_number?: string | null;
    observations?: string | null;
  }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from('bonus_records')
      .select('paid_month, status, bonus_type:bonus_types(amount_is_editable, requires_ot)')
      .eq('id', id)
      .single();

    if (existing?.paid_month) {
      return { success: false, error: 'No se puede editar un bono ya liquidado.' };
    }

    if (existing?.status === 'voided') {
      return { success: false, error: 'No se puede editar un bono anulado.' };
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    const rawBonusType = existing?.bonus_type;
    const bonusType = Array.isArray(rawBonusType) ? rawBonusType[0] : rawBonusType;

    if (payload.date) updatePayload.date = payload.date;
    if (payload.amount !== undefined && (bonusType as any)?.amount_is_editable) {
      updatePayload.amount = Math.max(1, payload.amount);
    }
    if (payload.ot_number !== undefined) {
      updatePayload.ot_number = payload.ot_number?.trim() || null;
    }
    if (payload.observations !== undefined) {
      updatePayload.observations = payload.observations?.trim() || null;
    }

    const { error } = await admin.from('bonus_records').update(updatePayload).eq('id', id);
    if (error) {
      console.error('[updateBonusRecord] Error:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/bonuses');
    revalidatePath('/reports/bonos');
    return { success: true };
  } catch (err: any) {
    console.error('[updateBonusRecord] Unexpected:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Actualizar estado de liquidación (paid_month) en bloque
 */
export async function bulkUpdateBonusPaidMonth(ids: string[], paidMonth: string | null) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    if (!ids || ids.length === 0) {
      return { success: false, error: 'No se seleccionaron registros' };
    }

    const admin = createAdminClient();

    const { error } = await admin
      .from('bonus_records')
      .update({
        paid_month: paidMonth || null,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
      .neq('status', 'voided'); // Jamás liquidar bonos anulados

    if (error) {
      console.error('[bulkUpdateBonusPaidMonth] Error:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/bonuses');
    revalidatePath('/reports/bonos');
    return { success: true };
  } catch (err: any) {
    console.error('[bulkUpdateBonusPaidMonth] Unexpected:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Eliminar físicamente un bono (habilitado temporalmente para pruebas)
 */
export async function deleteBonusRecord(id: string) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from('bonus_records')
      .select('paid_month')
      .eq('id', id)
      .single();

    if (existing?.paid_month) {
      return { success: false, error: 'No se puede eliminar un bono ya liquidado.' };
    }

    const { error } = await admin.from('bonus_records').delete().eq('id', id);
    if (error) {
      console.error('[deleteBonusRecord] Error:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/bonuses');
    revalidatePath('/reports/bonos');
    return { success: true };
  } catch (err: any) {
    console.error('[deleteBonusRecord] Unexpected:', err);
    return { success: false, error: err.message };
  }
}

