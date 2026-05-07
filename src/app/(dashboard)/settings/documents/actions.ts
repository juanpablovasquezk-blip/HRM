'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { DocumentDefinition } from '@/types/database';

export async function getDocumentDefinitions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('document_definitions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching document definitions:', error);
    return [];
  }

  return data as DocumentDefinition[];
}

export async function getPositions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('positions')
    .select('*, area:areas(name)')
    .order('name');
  
  if (error) {
    console.error('Error fetching positions:', error);
    return [];
  }
  
  return data;
}

export async function saveDocumentDefinition(definition: Partial<DocumentDefinition>) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No authenticated user' };

  // Get user's company
  const { data: userData } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single();

  const definitionData = {
    ...definition,
    company_id: userData?.company_id,
  };

  const { error } = await supabase
    .from('document_definitions')
    .upsert(definitionData);

  if (error) {
    console.error('Error saving document definition:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/settings/documents');
  return { success: true };
}

export async function deleteDocumentDefinition(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('document_definitions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting document definition:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/settings/documents');
  return { success: true };
}
