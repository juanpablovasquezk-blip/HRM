'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { calculateExpiration } from '@/lib/documents/expiration-engine';
import { syncDependentDocumentsExpiration } from '@/lib/documents/sync-expiry';
import { validateAntecedentesPDF } from '@/lib/documents/validation';
import { calculateDynamicExpiration } from '@/lib/utils/document-calc';

export async function uploadDocument(
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const file = formData.get('file') as File;
  const personnelId = formData.get('personnel_id') as string;
  const type = formData.get('type') as string;
  const number = (formData.get('number') as string) || '';
  const definitionId = (formData.get('definition_id') as string) || null;
  const issueDate = formData.get('issue_date') as string;
  // Allow either tica_date or pcp_date as the reference anchor depending on doc type
  const ticaDateStr = (formData.get('tica_date') || formData.get('pcp_date')) as string;
  const explicitExpirationDateStr = formData.get('explicit_expiration_date') as string;

  if (!file || !personnelId || !type) {
    return { success: false, error: 'Missing required fields' };
  }

  const isAntecedentes = type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('antecedentes');
  if (isAntecedentes && file && file.type === 'application/pdf') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const valRes = await validateAntecedentesPDF(buffer);
      if (!valRes.valid) {
        return { success: false, error: valRes.error };
      }
    } catch (e: any) {
      console.error('Error validating admin uploaded PDF:', e);
    }
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

  // Look up definition to know if this document type requires expiration
  let requiresExpiration = true; // default: calculate expiration for legacy uploads
  let defName = type || '';
  let dependsOnDefinitionId: string | null = null;
  let cycleMonths = 6;
  let anchorDaysOffset = 30;

  if (definitionId) {
    const { data: defRow } = await adminClient
      .from('document_definitions')
      .select('requires_expiration, name, depends_on_definition_id, cycle_months, anchor_days_offset')
      .eq('id', definitionId)
      .single();
    if (defRow) {
      requiresExpiration = defRow.requires_expiration;
      defName = defRow.name;
      dependsOnDefinitionId = defRow.depends_on_definition_id;
      cycleMonths = defRow.cycle_months || 6;
      anchorDaysOffset = defRow.anchor_days_offset || 30;
    }
  }

  const isTicaOrPcp = defName.toLowerCase().includes('tica') || defName.toLowerCase().includes('pcp');
  if (isTicaOrPcp && (!number || number.trim() === '')) {
    return { success: false, error: 'El número de credencial es obligatorio para TICA y PCP' };
  }

  // Calculate expiration only when the definition requires it
  let expirationDateStr: string | null = null;
  if (requiresExpiration) {
    let calculated = false;

    // If it depends on an anchor document and we have no input ticaDateStr, try to use existing anchor document expiration
    if (dependsOnDefinitionId && !ticaDateStr) {
      const { data: anchorDoc } = await adminClient
        .from('documents')
        .select('expiration_date')
        .eq('personnel_id', personnelId)
        .eq('definition_id', dependsOnDefinitionId)
        .maybeSingle();

      if (anchorDoc?.expiration_date) {
        const calcDate = calculateDynamicExpiration(
          new Date(anchorDoc.expiration_date + 'T12:00:00'),
          cycleMonths,
          anchorDaysOffset
        );
        expirationDateStr = calcDate.toISOString().split('T')[0];
        calculated = true;
      }
    }

    if (!calculated) {
      const baseDate = issueDate ? new Date(issueDate) : new Date();
      const ticaDate = ticaDateStr ? new Date(ticaDateStr) : null;
      const explicitExpirationDate = explicitExpirationDateStr ? new Date(explicitExpirationDateStr) : null;
      
      const expResult = calculateExpiration(baseDate, ticaDate, explicitExpirationDate);
      expirationDateStr = expResult.expiration_date.toISOString().split('T')[0];
    }
  }

  // ── Upsert logic: delete previous document of same type/definition ────────
  // Find existing doc(s) of the same type for this person
  const dupQuery = adminClient
    .from('documents')
    .select('id, file_url')
    .eq('personnel_id', personnelId);

  const dupFilter = definitionId
    ? dupQuery.eq('definition_id', definitionId)
    : dupQuery.eq('type', type);

  const { data: existingDocs } = await dupFilter;

  if (existingDocs && existingDocs.length > 0) {
    // Delete storage files for old documents
    const oldPaths = existingDocs
      .map((d: any) => {
        const url = d.file_url as string;
        // Extract storage path from public URL
        const marker = '/documents/';
        const idx = url.lastIndexOf(marker);
        return idx !== -1 ? url.substring(idx + marker.length) : null;
      })
      .filter(Boolean) as string[];

    if (oldPaths.length > 0) {
      await adminClient.storage.from('documents').remove(oldPaths);
    }

    // Delete old DB records
    const oldIds = existingDocs.map((d: any) => d.id);
    await adminClient.from('documents').delete().in('id', oldIds);
  }

  // Save document record
  const { error: insertError } = await adminClient.from('documents').insert({
    personnel_id: personnelId,
    definition_id: definitionId,
    type,
    number,
    file_url: urlData.publicUrl,
    issue_date: issueDate || null,
    expiration_date: expirationDateStr,
    tica_date: ticaDateStr || null,
    uploaded_by: user.id,
  });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  // Sync dependent documents in case this is the anchor or vice versa
  await syncDependentDocumentsExpiration(personnelId, adminClient);

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
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // First fetch the record to get the file URL
  const { data: doc } = await adminClient
    .from('documents')
    .select('id, file_url, personnel_id')
    .eq('id', id)
    .single();

  if (doc?.file_url) {
    // Extract storage path from public URL
    const marker = '/documents/';
    const idx = doc.file_url.lastIndexOf(marker);
    if (idx !== -1) {
      const storagePath = doc.file_url.substring(idx + marker.length);
      await adminClient.storage.from('documents').remove([storagePath]);
    }
  }

  const { error } = await adminClient.from('documents').delete().eq('id', id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/documents');
  if (doc?.personnel_id) revalidatePath(`/personnel/${doc.personnel_id}`);
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
