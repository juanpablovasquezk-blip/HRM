'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { partialRecalculate } from '@/lib/scheduler';

export async function requestLeave(formData: FormData) {
  const supabase = await createClient();

  const personnelId = formData.get('personnel_id') as string;
  const type = formData.get('type') as string;
  const startDate = formData.get('start_date') as string;
  const endDate = formData.get('end_date') as string;
  const reason = (formData.get('reason') as string) || null;
  const status = (formData.get('status') as string) || 'pending';

  const { error } = await supabase.from('leaves').insert({
    personnel_id: personnelId,
    type,
    start_date: startDate,
    end_date: endDate,
    reason,
    status,
  });

  if (error) return { success: false, error: error.message };

  if (status === 'approved') {
    const supabaseAdmin = createAdminClient();
    // Delete conflicting shift assignments
    const { error: asgErr } = await supabaseAdmin
      .from('shift_assignments')
      .delete()
      .eq('personnel_id', personnelId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (asgErr) {
      console.error('[LEAVE-APPROVAL] Error deleting shift assignments:', asgErr);
    }

    // Delete conflicting transport requests
    const { error: trErr } = await supabaseAdmin
      .from('transport_requests')
      .delete()
      .eq('personnel_id', personnelId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (trErr) {
      console.error('[LEAVE-APPROVAL] Error deleting transport requests:', trErr);
    }
  }

  revalidatePath('/leaves');
  revalidatePath('/shifts/assignments');
  revalidatePath('/shifts/roster');
  revalidatePath('/dashboard');
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

  const supabaseAdmin = createAdminClient();
  // Delete conflicting shift assignments
  const { error: asgErr } = await supabaseAdmin
    .from('shift_assignments')
    .delete()
    .eq('personnel_id', leave.personnel_id)
    .gte('date', leave.start_date)
    .lte('date', leave.end_date);

  if (asgErr) {
    console.error('[LEAVE-APPROVAL] Error deleting shift assignments:', asgErr);
  }

  // Delete conflicting transport requests
  const { error: trErr } = await supabaseAdmin
    .from('transport_requests')
    .delete()
    .eq('personnel_id', leave.personnel_id)
    .gte('date', leave.start_date)
    .lte('date', leave.end_date);

  if (trErr) {
    console.error('[LEAVE-APPROVAL] Error deleting transport requests:', trErr);
  }

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
  revalidatePath('/shifts/roster');
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

  // Get current leave details to know the personnel_id before update
  const { data: oldLeave } = await supabase
    .from('leaves')
    .select('personnel_id')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('leaves')
    .update(updateData)
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  if (updateData.status === 'approved' && oldLeave) {
    const supabaseAdmin = createAdminClient();
    // Delete conflicting shift assignments
    const { error: asgErr } = await supabaseAdmin
      .from('shift_assignments')
      .delete()
      .eq('personnel_id', oldLeave.personnel_id)
      .gte('date', updateData.start_date)
      .lte('date', updateData.end_date);

    if (asgErr) {
      console.error('[LEAVE-UPDATE] Error deleting shift assignments:', asgErr);
    }

    // Delete conflicting transport requests
    const { error: trErr } = await supabaseAdmin
      .from('transport_requests')
      .delete()
      .eq('personnel_id', oldLeave.personnel_id)
      .gte('date', updateData.start_date)
      .lte('date', updateData.end_date);

    if (trErr) {
      console.error('[LEAVE-UPDATE] Error deleting transport requests:', trErr);
    }
  }

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
  revalidatePath('/shifts/assignments');
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
