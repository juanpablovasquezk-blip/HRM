'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { partialRecalculate } from '@/lib/scheduler';

export async function requestLeave(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.from('leaves').insert({
    personnel_id: formData.get('personnel_id') as string,
    type: formData.get('type') as string,
    start_date: formData.get('start_date') as string,
    end_date: formData.get('end_date') as string,
    reason: (formData.get('reason') as string) || null,
    status: (formData.get('status') as string) || 'pending',
  });

  if (error) return { success: false, error: error.message };
  revalidatePath('/leaves');
  return { success: true, error: null };
}

export async function approveLeave(leaveId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: leave, error: fetchError } = await supabase
    .from('leaves')
    .select('*')
    .eq('id', leaveId)
    .single();

  if (fetchError || !leave) return { success: false, error: 'Leave not found' };

  const { error } = await supabase
    .from('leaves')
    .update({
      status: 'approved',
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', leaveId);

  if (error) return { success: false, error: error.message };

  // Trigger partial recalculation for sick leave
  if (leave.type === 'sick') {
    try {
      await partialRecalculate({
        date_range: [leave.start_date, leave.end_date],
        affected_personnel_id: leave.personnel_id,
        reason: 'sick_leave',
        override_freeze: true, // Sick leave can override freeze
      });
    } catch (e) {
      console.error('Partial recalculation failed after sick leave approval:', e);
    }
  }

  revalidatePath('/leaves');
  revalidatePath('/shifts/assignments');
  revalidatePath('/dashboard');
  return { success: true, error: null };
}

export async function updateLeave(id: string, formData: FormData) {
  const supabase = await createClient();

  const updateData = {
    type: formData.get('type') as string,
    start_date: formData.get('start_date') as string,
    end_date: formData.get('end_date') as string,
    reason: (formData.get('reason') as string) || null,
    status: (formData.get('status') as string) || 'pending',
  };

  const { error } = await supabase
    .from('leaves')
    .update(updateData)
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  if (updateData.type === 'sick' && updateData.status === 'approved') {
    try {
      // Re-trigger recalculation
      const { data: leave } = await supabase.from('leaves').select('personnel_id').eq('id', id).single();
      if (leave) {
        await partialRecalculate({
          date_range: [updateData.start_date, updateData.end_date],
          affected_personnel_id: leave.personnel_id,
          reason: 'sick_leave',
          override_freeze: true,
        });
      }
    } catch (e) {
      console.error('Partial recalculation failed after leave update:', e);
    }
  }

  revalidatePath('/leaves');
  revalidatePath('/shifts/roster');
  revalidatePath('/dashboard');
  return { success: true, error: null };
}

export async function rejectLeave(leaveId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('leaves')
    .update({
      status: 'rejected',
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', leaveId);

  if (error) return { success: false, error: error.message };
  revalidatePath('/leaves');
  return { success: true, error: null };
}

export async function deleteLeave(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('leaves').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/leaves');
  revalidatePath('/dashboard');
  revalidatePath('/shifts/roster');
  return { success: true, error: null };
}

export async function listLeaves(status?: string) {
  const supabase = await createClient();
  let query = supabase
    .from('leaves')
    .select('*, personnel:personnel(first_name, last_name_father, rut)')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  return { data: data || [], error: error?.message || null };
}
