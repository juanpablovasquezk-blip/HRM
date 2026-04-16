'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createTransportLog(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('transport_logs').insert({
    personnel_id: formData.get('personnel_id') as string,
    date: formData.get('date') as string,
    used_company_transport: formData.get('used_company_transport') === 'true',
    reservation_number: (formData.get('reservation_number') as string) || null,
    issues: (formData.get('issues') as string) || null,
    logged_by: user?.id,
  });

  if (error) return { success: false, error: error.message };
  revalidatePath('/transport');
  return { success: true, error: null };
}

export async function listTransportLogs(date?: string) {
  const supabase = await createClient();
  let query = supabase
    .from('transport_logs')
    .select('*, personnel:personnel(first_name, last_name_father)')
    .order('date', { ascending: false });

  if (date) query = query.eq('date', date);
  const { data, error } = await query;
  return { data: data || [], error: error?.message || null };
}
