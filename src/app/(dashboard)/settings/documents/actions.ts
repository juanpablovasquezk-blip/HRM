'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { DocumentDefinition } from '@/types/database';

// Admin Supabase client (bypasses RLS — safe for server-only use)
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
  try {
    // Verify the caller is authenticated
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    // Use admin client to bypass RLS for this admin-only operation
    const admin = getAdminClient();

    // Get company_id for this user
    const { data: userData } = await admin
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single();

    // Build clean data — omit undefined fields to avoid Supabase serialization issues
    const definitionData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(definition)) {
      if (v !== undefined) definitionData[k] = v;
    }
    if (userData?.company_id) {
      definitionData.company_id = userData.company_id;
    }

    const { error } = await admin
      .from('document_definitions')
      .upsert(definitionData);

    if (error) {
      console.error('[saveDocumentDefinition] Supabase error:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/settings/documents');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[saveDocumentDefinition] Unexpected error:', message);
    return { success: false, error: message };
  }
}

export async function deleteDocumentDefinition(id: string) {
  try {
    // Verify the caller is authenticated
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Usuario no autenticado' };
    }

    const admin = getAdminClient();
    const { error } = await admin
      .from('document_definitions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[deleteDocumentDefinition] Supabase error:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/settings/documents');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[deleteDocumentDefinition] Unexpected error:', message);
    return { success: false, error: message };
  }
}
