'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createCompany(name: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('companies')
    .insert({ name })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  
  revalidatePath('/settings/companies');
  revalidatePath('/personnel');
  return { data, error: null };
}

export async function updateCompany(id: string, name: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('companies')
    .update({ name })
    .eq('id', id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  
  revalidatePath('/settings/companies');
  revalidatePath('/personnel');
  return { data, error: null };
}

export async function deleteCompany(id: string) {
  const supabase = await createClient();
  
  // Checking for dependent personnel is usually handled by DB FK constraints (on delete cascade or restrict)
  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  
  revalidatePath('/settings/companies');
  revalidatePath('/personnel');
  return { error: null };
}
