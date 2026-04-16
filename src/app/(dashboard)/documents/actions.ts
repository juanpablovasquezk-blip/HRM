'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { calculateExpiration } from '@/lib/documents/expiration-engine';

export async function uploadDocument(
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const file = formData.get('file') as File;
  const personnelId = formData.get('personnel_id') as string;
  const type = formData.get('type') as string;
  const number = (formData.get('number') as string) || '';
  const issueDate = formData.get('issue_date') as string;
  // Allow either tica_date or pcp_date as the reference anchor depending on doc type
  const ticaDateStr = (formData.get('tica_date') || formData.get('pcp_date')) as string;
  const explicitExpirationDateStr = formData.get('explicit_expiration_date') as string;

  if (!file || !personnelId || !type) {
    return { success: false, error: 'Missing required fields' };
  }

  // Get current user for audit via the normal client to verify identity
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Use service role client to bypass RLS for creating documents securely
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Upload file to Supabase Storage
  const fileExt = file.name.split('.').pop();
  const sanitizedType = type
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, '_')
    .toLowerCase();
  const fileName = `${personnelId}/${sanitizedType}_${Date.now()}.${fileExt}`;

  const { error: uploadError } = await adminClient.storage
    .from('documents')
    .upload(fileName, file);

  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError.message}` };
  }

  // Get public URL
  const { data: urlData } = adminClient.storage
    .from('documents')
    .getPublicUrl(fileName);

  // Calculate expiration
  // If issueDate is provided, use it as the base uploadDate for 180-day calculations
  const baseDate = issueDate ? new Date(issueDate) : new Date();
  const ticaDate = ticaDateStr ? new Date(ticaDateStr) : null;
  const explicitExpirationDate = explicitExpirationDateStr ? new Date(explicitExpirationDateStr) : null;
  const expResult = calculateExpiration(baseDate, ticaDate, explicitExpirationDate);

  // Save document record
  const { error: insertError } = await adminClient.from('documents').insert({
    personnel_id: personnelId,
    type,
    number,
    file_url: urlData.publicUrl,
    issue_date: issueDate || null,
    expiration_date: expResult.expiration_date.toISOString().split('T')[0],
    tica_date: ticaDateStr || null,
    uploaded_by: user.id,
  });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  revalidatePath('/documents');
  revalidatePath(`/personnel/${personnelId}`);
  return { success: true, error: null };
}

export async function listDocuments(filters?: {
  personnelId?: string;
  type?: string;
  status?: 'valid' | 'expiring_soon' | 'expired';
}) {
  const supabase = await createClient();

  let query = supabase
    .from('documents')
    .select('*, personnel:personnel(first_name, last_name_father, rut)')
    .order('expiration_date', { ascending: true });

  if (filters?.personnelId) {
    query = query.eq('personnel_id', filters.personnelId);
  }
  if (filters?.type) {
    query = query.eq('type', filters.type);
  }

  const { data, error } = await query;

  if (error) return { data: [], error: error.message };
  return { data: data || [], error: null };
}

export async function deleteDocument(
  id: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase.from('documents').delete().eq('id', id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/documents');
  return { success: true, error: null };
}

export async function checkExpirations(): Promise<{
  expiring: number;
  expired: number;
}> {
  const supabase = await createClient();
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const { count: expiredCount } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .lt('expiration_date', today);

  const { count: expiringCount } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .gte('expiration_date', today)
    .lte('expiration_date', thirtyDaysFromNow);

  return {
    expiring: expiringCount || 0,
    expired: expiredCount || 0,
  };
}
