'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireActionAuth, getOwnPersonnelId } from '@/lib/auth/action-guard';
import { hasPermission } from '@/lib/auth/roles';
import { revalidatePath } from 'next/cache';
import { partialRecalculate } from '@/lib/scheduler';
import { resolveLeaveOverlap, isFreeDayRequest } from '@/lib/leaves/leave-overlap';
import { parseISO, format, addDays, subDays } from 'date-fns';

function safeRevalidateLeavesPaths() {
  if (process.env.ROSTER_ISOLATED_TEST === 'true') return;
  revalidatePath('/leaves');
  revalidatePath('/shifts/assignments');
  revalidatePath('/shifts/roster');
  revalidatePath('/shifts/daily');
  revalidatePath('/dashboard');
  revalidatePath('/worker');
}

export async function previewLeaveApprovalImpact(
  leaveId: string,
  testHooks?: { supabase?: any; authOk?: boolean }
) {
  const isIsolatedTest = process.env.ROSTER_ISOLATED_TEST === 'true' && Boolean(testHooks?.supabase);
  if (!isIsolatedTest) {
    const auth = await requireActionAuth({ permission: 'approveLeaves' });
    if (!auth.ok) return { success: false, error: auth.error };
  } else if (testHooks?.authOk === false) {
    return { success: false, error: 'No autorizado.' };
  }

  const supabaseAdmin: any = isIsolatedTest ? testHooks!.supabase : createAdminClient();
  const { data: leave, error: leaveErr } = await supabaseAdmin
    .from('leaves')
    .select('*, personnel:personnel(id, first_name, last_name_father)')
    .eq('id', leaveId)
    .single();

  if (leaveErr || !leave) {
    return { success: false, error: 'Solicitud no encontrada.' };
  }

  const [{ data: allAffectedShifts }, { data: transportRequests }] = await Promise.all([
    supabaseAdmin
      .from('shift_assignments')
      .select('id, date, shift_id, is_published, status, shift:shifts(name, start_time, end_time), area:areas(name), position:positions(name)')
      .eq('personnel_id', leave.personnel_id)
      .gte('date', leave.start_date)
      .lte('date', leave.end_date)
      .neq('status', 'cancelled')
      .order('date', { ascending: true }),
    supabaseAdmin
      .from('transport_requests')
      .select('id, date, transport_type, status')
      .eq('personnel_id', leave.personnel_id)
      .gte('date', leave.start_date)
      .lte('date', leave.end_date)
      .order('date', { ascending: true }),
  ]);

  const affectedShifts = (allAffectedShifts || []).map((s: any) => ({
    ...s,
    signature: `${s.id}|${s.date}|${s.shift_id}|${Boolean(s.is_published)}|${s.shift?.start_time || ''}|${s.shift?.end_time || ''}`,
  }));
  const publishedShifts = affectedShifts.filter((s: any) => s.is_published === true);
  const draftShifts = affectedShifts.filter((s: any) => !s.is_published);

  const transports = (transportRequests || []).map((t: any) => ({
    ...t,
    signature: `${t.id}|${t.date}|${t.transport_type || ''}|${t.status || ''}`,
  }));

  const dates: string[] = [];
  let cursor = parseISO(leave.start_date);
  const end = parseISO(leave.end_date);
  while (cursor <= end) {
    dates.push(format(cursor, 'yyyy-MM-dd'));
    cursor = addDays(cursor, 1);
  }

  return {
    success: true,
    leave,
    dates,
    affectedShifts,
    publishedShifts,
    draftShifts,
    shiftSignatures: affectedShifts.map((s: any) => s.signature),
    transportRequests: transports,
    transportSignatures: transports.map((t: any) => t.signature),
  };
}

export async function requestLeave(formData: FormData) {
  const auth = await requireActionAuth();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const canManageLeaves = hasPermission(auth.role, 'manageLeaves');
  const canApproveLeaves = hasPermission(auth.role, 'approveLeaves');
  const personnelId = formData.get('personnel_id') as string;
  if (!canManageLeaves && !canApproveLeaves) {
    const ownPersonnelId = await getOwnPersonnelId(auth.userId, auth.email);
    if (!ownPersonnelId || personnelId !== ownPersonnelId) {
      return { success: false, error: 'Solo puedes solicitar licencias para tu propio perfil.' };
    }
  }

  const supabaseAdmin = createAdminClient();

  const type = formData.get('type') as string;
  const rawStartDate = formData.get('start_date') as string;
  const rawEndDate = formData.get('end_date') as string;
  const reason = (formData.get('reason') as string) || null;
  const status = canManageLeaves ? ((formData.get('status') as string) || 'pending') : 'pending';

  // Automatically resolve overlaps: if continues an existing leave, shift start_date to prevent day superposition.
  // Las Vacaciones y Licencias Médicas tienen mayor prioridad que los días solicitados (días libres).
  const overlapCheck = await resolveLeaveOverlap(
    supabaseAdmin,
    personnelId,
    rawStartDate,
    rawEndDate,
    undefined,
    type,
    reason
  );

  if (overlapCheck.error) {
    return { success: false, error: overlapCheck.error };
  }

  const startDate = overlapCheck.adjustedStartDate;
  const endDate = overlapCheck.adjustedEndDate;

  const { error } = await supabaseAdmin.from('leaves').insert({
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
    // Update conflicting shift assignments to cancelled
    const { error: asgErr } = await supabaseAdmin
      .from('shift_assignments')
      .update({ status: 'cancelled' })
      .eq('personnel_id', personnelId)
      .gte('date', startDate)
      .lte('date', endDate);

    if (asgErr) {
      console.error('[LEAVE-APPROVAL] Error cancelling shift assignments:', asgErr);
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
  revalidatePath('/shifts/daily');
  revalidatePath('/dashboard');
  return { 
    success: true, 
    error: null, 
    adjusted: overlapCheck.wasAdjusted, 
    message: overlapCheck.adjustmentReason 
  };
}

export async function approveLeave(
  leaveId: string,
  expectedImpact?: {
    expectedDates?: string[];
    expectedShiftIds?: string[];
    expectedTransportIds?: string[];
    expectedShiftSignatures?: string[];
    expectedTransportSignatures?: string[];
  },
  testHooks?: { supabase?: any; authOk?: boolean; userId?: string }
) {
  const isIsolatedTest = process.env.ROSTER_ISOLATED_TEST === 'true' && Boolean(testHooks?.supabase);
  let approvedBy = 'admin';
  if (!isIsolatedTest) {
    const auth = await requireActionAuth({ permission: 'approveLeaves' });
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    approvedBy = auth.userId;
  } else {
    if (testHooks?.authOk === false) return { success: false, error: 'No autorizado.' };
    approvedBy = testHooks?.userId || 'admin';
  }

  const supabaseAdmin: any = isIsolatedTest ? testHooks!.supabase : createAdminClient();

  const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('approve_leave_with_impact_tx', {
    p_leave_id: leaveId,
    p_approved_by: approvedBy,
    p_expected_dates: expectedImpact?.expectedDates ?? null,
    p_expected_shift_ids: expectedImpact?.expectedShiftIds ?? null,
    p_expected_transport_ids: expectedImpact?.expectedTransportIds ?? null,
    p_expected_shift_signatures: expectedImpact?.expectedShiftSignatures ?? null,
    p_expected_transport_signatures: expectedImpact?.expectedTransportSignatures ?? null,
  });

  if (rpcErr) {
    return { success: false, error: rpcErr.message };
  }

  if (!rpcRes?.ok) {
    return {
      success: false,
      code: rpcRes?.code,
      error: rpcRes?.error || 'No se pudo aprobar la solicitud.',
    };
  }

  // Trigger partial recalculation for sick leave
  if (rpcRes.leave_type === 'sick') {
    try {
      await partialRecalculate({
        date_range: [rpcRes.start_date, rpcRes.end_date],
        affected_personnel_id: rpcRes.personnel_id,
        reason: 'sick_leave',
        override_freeze: true, // Sick leave can override freeze
      });
    } catch (e) {
      console.error('Partial recalculation failed after sick leave approval:', e);
    }
  }

  safeRevalidateLeavesPaths();
  return { success: true, error: null };
}

export async function updateLeave(id: string, formData: FormData) {
  const auth = await requireActionAuth({ permission: 'manageLeaves' });
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const supabaseAdmin = createAdminClient();

  // Get current leave details to know the personnel_id before update
  const { data: oldLeave } = await supabaseAdmin
    .from('leaves')
    .select('personnel_id')
    .eq('id', id)
    .single();

  if (!oldLeave) {
    return { success: false, error: 'Ausencia no encontrada.' };
  }

  const rawStartDate = formData.get('start_date') as string;
  const rawEndDate = formData.get('end_date') as string;
  const type = formData.get('type') as string;
  const reason = (formData.get('reason') as string) || null;

  // Resolve overlaps with other leaves (excluding current leave)
  // Las Vacaciones y Licencias Médicas tienen mayor prioridad que los días solicitados
  const overlapCheck = await resolveLeaveOverlap(
    supabaseAdmin,
    oldLeave.personnel_id,
    rawStartDate,
    rawEndDate,
    id,
    type,
    reason
  );

  if (overlapCheck.error) {
    return { success: false, error: overlapCheck.error };
  }

  const updateData = {
    type: formData.get('type') as string,
    start_date: overlapCheck.adjustedStartDate,
    end_date: overlapCheck.adjustedEndDate,
    reason: (formData.get('reason') as string) || null,
    status: (formData.get('status') as string) || 'pending',
  };

  const { error } = await supabaseAdmin
    .from('leaves')
    .update(updateData)
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  if (updateData.status === 'approved' && oldLeave) {
    // Update conflicting shift assignments to cancelled
    const { error: asgErr } = await supabaseAdmin
      .from('shift_assignments')
      .update({ status: 'cancelled' })
      .eq('personnel_id', oldLeave.personnel_id)
      .gte('date', updateData.start_date)
      .lte('date', updateData.end_date);

    if (asgErr) {
      console.error('[LEAVE-UPDATE] Error cancelling shift assignments:', asgErr);
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
      const { data: leave } = await supabaseAdmin.from('leaves').select('personnel_id').eq('id', id).single();
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
  revalidatePath('/shifts/daily');
  revalidatePath('/dashboard');
  return { 
    success: true, 
    error: null,
    adjusted: overlapCheck.wasAdjusted,
    message: overlapCheck.adjustmentReason
  };
}

export async function rejectLeave(
  leaveId: string,
  testHooks?: { supabase?: any; authOk?: boolean; userId?: string }
) {
  const isIsolatedTest = process.env.ROSTER_ISOLATED_TEST === 'true' && Boolean(testHooks?.supabase);
  let rejectedBy = 'admin';
  if (!isIsolatedTest) {
    const auth = await requireActionAuth({ permission: 'approveLeaves' });
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    rejectedBy = auth.userId;
  } else {
    if (testHooks?.authOk === false) return { success: false, error: 'No autorizado.' };
    rejectedBy = testHooks?.userId || 'admin';
  }

  const supabaseAdmin: any = isIsolatedTest ? testHooks!.supabase : createAdminClient();

  const { error } = await supabaseAdmin
    .from('leaves')
    .update({
      status: 'rejected',
      approved_by: rejectedBy,
      approved_at: new Date().toISOString(),
    })
    .eq('id', leaveId);

  if (error) return { success: false, error: error.message };
  safeRevalidateLeavesPaths();
  return { success: true, error: null };
}

export async function deleteLeave(id: string) {
  const auth = await requireActionAuth({ permission: 'manageLeaves' });
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin.from('leaves').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/leaves');
  revalidatePath('/dashboard');
  revalidatePath('/shifts/roster');
  revalidatePath('/shifts/daily');
  return { success: true, error: null };
}

export async function listLeaves(status?: string) {
  const auth = await requireActionAuth();
  if (!auth.ok) {
    return { data: [], error: auth.error };
  }

  const supabase = await createClient();
  let query = supabase
    .from('leaves')
    .select('*, personnel:personnel(first_name, last_name_father, rut)')
    .order('created_at', { ascending: false });

  if (!hasPermission(auth.role, 'approveLeaves') && !hasPermission(auth.role, 'manageLeaves')) {
    const ownPersonnelId = await getOwnPersonnelId(auth.userId, auth.email);
    if (!ownPersonnelId) {
      return { data: [], error: null };
    }
    query = query.eq('personnel_id', ownPersonnelId);
  }

  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  return { data: data || [], error: error?.message || null };
}
