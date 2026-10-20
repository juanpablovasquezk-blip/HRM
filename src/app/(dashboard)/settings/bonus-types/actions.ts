'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { BonusType } from '@/types/database';

/**
 * Obtener todos los tipos de bonos (ordenados por nombre o fecha)
 */
export async function getBonusTypes(onlyActive: boolean = false) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from('bonus_types')
      .select('*')
      .order('created_at', { ascending: true });

    if (onlyActive) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[getBonusTypes] Error:', error);
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: (data as BonusType[]) || [] };
  } catch (err: any) {
    console.error('[getBonusTypes] Unexpected:', err);
    return { success: false, error: err.message, data: [] };
  }
}

/**
 * Crear un nuevo tipo de bono
 */
export async function createBonusType(formData: {
  code: string;
  name: string;
  description?: string;
  default_amount: number;
  amount_is_editable: boolean;
  requires_ot: boolean;
  active?: boolean;
}) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    const admin = createAdminClient();

    // Validar código único
    const cleanCode = formData.code.trim().toUpperCase().replace(/\s+/g, '_');
    const { data: existing } = await admin
      .from('bonus_types')
      .select('id')
      .eq('code', cleanCode)
      .maybeSingle();

    if (existing) {
      return { success: false, error: 'Ya existe un tipo de bono con este código único.' };
    }

    const { data, error } = await admin
      .from('bonus_types')
      .insert({
        code: cleanCode,
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        default_amount: Math.max(0, formData.default_amount || 0),
        amount_is_editable: Boolean(formData.amount_is_editable),
        requires_ot: Boolean(formData.requires_ot),
        active: formData.active ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error('[createBonusType] Error:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/settings/bonus-types');
    revalidatePath('/bonuses');
    return { success: true, data };
  } catch (err: any) {
    console.error('[createBonusType] Unexpected:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Actualizar tipo de bono existente
 */
export async function updateBonusType(
  id: string,
  formData: {
    name?: string;
    description?: string;
    default_amount?: number;
    amount_is_editable?: boolean;
    requires_ot?: boolean;
    active?: boolean;
  }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    const admin = createAdminClient();

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (formData.name !== undefined) updatePayload.name = formData.name.trim();
    if (formData.description !== undefined) updatePayload.description = formData.description?.trim() || null;
    if (formData.default_amount !== undefined) updatePayload.default_amount = Math.max(0, formData.default_amount);
    if (formData.amount_is_editable !== undefined) updatePayload.amount_is_editable = Boolean(formData.amount_is_editable);
    if (formData.requires_ot !== undefined) updatePayload.requires_ot = Boolean(formData.requires_ot);
    if (formData.active !== undefined) updatePayload.active = Boolean(formData.active);

    const { error } = await admin
      .from('bonus_types')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      console.error('[updateBonusType] Error:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/settings/bonus-types');
    revalidatePath('/bonuses');
    return { success: true };
  } catch (err: any) {
    console.error('[updateBonusType] Unexpected:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Cambiar estado de activación de un tipo de bono
 */
export async function toggleBonusTypeActive(id: string, active: boolean) {
  return updateBonusType(id, { active });
}
