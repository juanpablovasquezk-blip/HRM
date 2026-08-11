'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { deletePersonnelDocumentsAndLetters } from './actions';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (error: any) {
    if (error && error.message && error.message.includes('static generation store')) {
      return;
    }
    throw error;
  }
}

export async function getDismissalRecords(personnelId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('dismissal_records')
    .select('*')
    .eq('personnel_id', personnelId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DISMISSAL-ACTIONS] Error fetching dismissal records:', error);
    return { data: [], error: error.message };
  }
  return { data: data || [], error: null };
}

export async function uploadDismissalReceipt(
  recordId: string,
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  const file = formData.get('file') as File;
  if (!file) {
    return { success: false, error: 'No se ha seleccionado ningún archivo' };
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  // 1. Get record and check ownership/existence
  const { data: record, error: recError } = await adminClient
    .from('dismissal_records')
    .select('*, personnel:personnel(first_name, last_name_father)')
    .eq('id', recordId)
    .single();

  if (recError || !record) {
    return { success: false, error: 'Registro de baja no encontrado' };
  }

  // 2. Upload to Supabase Storage under bucket 'documents'
  const fileExt = file.name.split('.').pop() || 'pdf';
  const workerSuffix = `${record.personnel?.first_name}_${record.personnel?.last_name_father}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, '_')
    .toLowerCase();
  const fileName = `dismissal_receipts/${record.personnel_id}/${record.credential_type.toLowerCase()}_receipt_${Date.now()}.${fileExt}`;

  const { error: uploadError } = await adminClient.storage
    .from('documents')
    .upload(fileName, file);

  if (uploadError) {
    console.error('[DISMISSAL-ACTIONS] Storage upload failed:', uploadError);
    return { success: false, error: `Error al subir archivo: ${uploadError.message}` };
  }

  // 3. Get public URL
  const { data: urlData } = adminClient.storage
    .from('documents')
    .getPublicUrl(fileName);

  const receiptUrl = urlData.publicUrl;

  // 4. Update the dismissal record
  const { error: updateError } = await adminClient
    .from('dismissal_records')
    .update({
      receipt_file_url: receiptUrl,
      status: 'completed',
      completed_at: new Date().toISOString(),
      created_by: user.id
    })
    .eq('id', recordId);

  if (updateError) {
    console.error('[DISMISSAL-ACTIONS] Error updating dismissal record:', updateError);
    return { success: false, error: updateError.message };
  }

  // 5. Check if all other credentials for this worker are also completed
  await checkAndCompleteDismissal(record.personnel_id, adminClient);

  safeRevalidatePath(`/personnel/${record.personnel_id}`);
  safeRevalidatePath('/personnel');
  return { success: true, error: null };
}

export async function markRefusedToReturn(
  recordId: string,
  refused: boolean
): Promise<{ success: boolean; error: string | null }> {
  const adminClient = createAdminClient();
  const { data: record, error: recError } = await adminClient
    .from('dismissal_records')
    .select('personnel_id')
    .eq('id', recordId)
    .single();

  if (recError || !record) {
    return { success: false, error: 'Registro de baja no encontrado' };
  }

  const { error: updateError } = await adminClient
    .from('dismissal_records')
    .update({ refused_to_return: refused })
    .eq('id', recordId);

  if (updateError) {
    console.error('[DISMISSAL-ACTIONS] Error marking refusal:', updateError);
    return { success: false, error: updateError.message };
  }

  safeRevalidatePath(`/personnel/${record.personnel_id}`);
  return { success: true, error: null };
}

export async function executeDirectCloseDismissal(
  personnelId: string
): Promise<{ success: boolean; error: string | null }> {
  const adminClient = createAdminClient();
  const { error } = await checkAndCompleteDismissal(personnelId, adminClient);
  if (error) return { success: false, error };
  return { success: true, error: null };
}

async function checkAndCompleteDismissal(personnelId: string, adminClient: any) {
  try {
    // Check if there are any remaining pending records for this worker
    const { data: pending } = await adminClient
      .from('dismissal_records')
      .select('id')
      .eq('personnel_id', personnelId)
      .eq('status', 'pending');

    if (!pending || pending.length === 0) {
      // All credentials completed! Let's close the dismissal
      const { error: pError } = await adminClient
        .from('personnel')
        .update({ dismissal_status: 'completed' })
        .eq('id', personnelId);

      if (pError) throw pError;

      // Now run document cleanup to free up standard documents space,
      // but keeping dismissal records intact.
      await deletePersonnelDocumentsAndLetters(personnelId, adminClient);
      
      console.log(`[DISMISSAL-CLOSE] Successfully completed dismissal flow for worker ${personnelId}`);
    }
    return { error: null };
  } catch (err: any) {
    console.error('[DISMISSAL-CLOSE] Error completing dismissal flow:', err);
    return { error: err.message || 'Error al completar proceso de baja' };
  }
}
