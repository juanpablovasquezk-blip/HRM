'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRole } from '@/app/role-actions';
import { revalidatePath } from 'next/cache';

export interface RiohsRecordData {
  id?: string;
  personnel_id: string;
  company_id: string;
  status: 'PENDING' | 'AUTH_GENERATED' | 'AUTH_UPLOADED' | 'RIOHS_SENT' | 'COMPLETED';
  auth_generated_at?: string | null;
  auth_signed_file_url?: string | null;
  auth_uploaded_at?: string | null;
  riohs_sent_at?: string | null;
  riohs_sent_to_email?: string | null;
  reception_signed_file_url?: string | null;
  reception_uploaded_at?: string | null;
}

async function resolveCompanyId(adminSupabase: any, personnelId: string, companyId?: string): Promise<string> {
  if (companyId && companyId.trim() !== '' && companyId !== 'undefined' && companyId !== 'null') {
    return companyId;
  }
  const { data: worker } = await adminSupabase
    .from('personnel')
    .select('company_id')
    .eq('id', personnelId)
    .single();

  if (worker?.company_id) return worker.company_id;

  const { data: firstCompany } = await adminSupabase
    .from('companies')
    .select('id')
    .limit(1)
    .single();

  return firstCompany?.id || '';
}

export async function getRiohsRecord(personnelId: string): Promise<{ success: boolean; data?: RiohsRecordData | null; error?: string }> {
  try {
    const supabase = createAdminClient();

    // 1. Try fetching from riohs_records table
    const { data: riohsData, error: riohsErr } = await supabase
      .from('riohs_records')
      .select('*')
      .eq('personnel_id', personnelId)
      .maybeSingle();

    if (!riohsErr && riohsData) {
      return { success: true, data: riohsData as RiohsRecordData };
    }

    // 2. Fallback to documents table if riohs_records table does not exist or has no row
    const { data: docs } = await supabase
      .from('documents')
      .select('*')
      .eq('personnel_id', personnelId)
      .ilike('type', 'RIOHS%');

    if (!docs || docs.length === 0) {
      return { success: true, data: null };
    }

    const authGenDoc = docs.find(d => d.type === 'RIOHS Autorización Digital');
    const authSignedDoc = docs.find(d => d.type === 'RIOHS Autorización Firmada');
    const emailSentDoc = docs.find(d => d.type === 'RIOHS Email Enviado');
    const receptionDoc = docs.find(d => d.type === 'RIOHS Recepción Firmada');

    let status: RiohsRecordData['status'] = 'PENDING';
    if (receptionDoc) status = 'COMPLETED';
    else if (emailSentDoc) status = 'RIOHS_SENT';
    else if (authSignedDoc) status = 'AUTH_UPLOADED';
    else if (authGenDoc) status = 'AUTH_GENERATED';

    const fallbackRecord: RiohsRecordData = {
      personnel_id: personnelId,
      company_id: '',
      status,
      auth_generated_at: authGenDoc?.uploaded_at || null,
      auth_signed_file_url: authSignedDoc?.file_url || null,
      auth_uploaded_at: authSignedDoc?.uploaded_at || null,
      riohs_sent_at: emailSentDoc?.uploaded_at || null,
      riohs_sent_to_email: emailSentDoc?.number || null,
      reception_signed_file_url: receptionDoc?.file_url || null,
      reception_uploaded_at: receptionDoc?.uploaded_at || null,
    };

    return { success: true, data: fallbackRecord };
  } catch (err: any) {
    console.error('Error fetching RIOHS record:', err);
    return { success: true, data: null };
  }
}

export async function markAuthGenerated(personnelId: string, companyId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const adminSupabase = createAdminClient();
    const validCompanyId = await resolveCompanyId(adminSupabase, personnelId, companyId);
    const nowIso = new Date().toISOString();

    // Primary: riohs_records table
    try {
      const { data: existing } = await adminSupabase
        .from('riohs_records')
        .select('id, status')
        .eq('personnel_id', personnelId)
        .maybeSingle();

      if (existing) {
        const newStatus = existing.status === 'PENDING' ? 'AUTH_GENERATED' : existing.status;
        await adminSupabase
          .from('riohs_records')
          .update({
            status: newStatus,
            auth_generated_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', existing.id);
      } else {
        await adminSupabase.from('riohs_records').insert({
          personnel_id: personnelId,
          company_id: validCompanyId,
          status: 'AUTH_GENERATED',
          auth_generated_at: nowIso,
        });
      }
    } catch (e) {
      console.warn('riohs_records primary insert warning:', e);
    }

    // Fallback: documents table
    const { data: existingDoc } = await adminSupabase
      .from('documents')
      .select('id')
      .eq('personnel_id', personnelId)
      .eq('type', 'RIOHS Autorización Digital')
      .maybeSingle();

    if (!existingDoc) {
      await adminSupabase.from('documents').insert({
        personnel_id: personnelId,
        type: 'RIOHS Autorización Digital',
        file_url: '',
        uploaded_at: nowIso,
        status: 'APPROVED',
      });
    }

    revalidatePath(`/personnel/${personnelId}`);
    return { success: true };
  } catch (err: any) {
    console.error('Error marking auth generated:', err);
    return { success: false, error: err.message };
  }
}

export async function uploadSignedRiohsFile(
  personnelId: string,
  companyId: string,
  docType: 'auth' | 'reception',
  formData: FormData
): Promise<{ success: boolean; fileUrl?: string; error?: string }> {
  try {
    const role = await getUserRole();
    if (role !== 'ADMIN' && role !== 'HR' && role !== 'SAFETY_OFFICER') {
      return { success: false, error: 'No tiene permisos para realizar esta acción.' };
    }

    const file = formData.get('file') as File;
    if (!file || file.size === 0) {
      return { success: false, error: 'Por favor selecciona un archivo válido.' };
    }

    const adminSupabase = createAdminClient();
    const validCompanyId = await resolveCompanyId(adminSupabase, personnelId, companyId);

    const fileExt = file.name.split('.').pop() || 'pdf';
    const fileName = `riohs_${docType}_${personnelId}_${Date.now()}.${fileExt}`;
    const filePath = `riohs/${personnelId}/${fileName}`;

    // Upload file to Supabase storage bucket 'documents'
    const { data: uploadData, error: uploadError } = await adminSupabase.storage
      .from('documents')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return { success: false, error: `Error al subir archivo: ${uploadError.message}` };
    }

    const { data: publicUrlData } = adminSupabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;
    const nowIso = new Date().toISOString();

    // Primary: riohs_records table
    try {
      const { data: existing } = await adminSupabase
        .from('riohs_records')
        .select('id, status')
        .eq('personnel_id', personnelId)
        .maybeSingle();

      if (docType === 'auth') {
        const nextStatus = 'AUTH_UPLOADED';
        if (existing) {
          await adminSupabase
            .from('riohs_records')
            .update({
              status: nextStatus,
              auth_signed_file_url: publicUrl,
              auth_uploaded_at: nowIso,
              updated_at: nowIso,
            })
            .eq('id', existing.id);
        } else {
          await adminSupabase.from('riohs_records').insert({
            personnel_id: personnelId,
            company_id: validCompanyId,
            status: nextStatus,
            auth_signed_file_url: publicUrl,
            auth_uploaded_at: nowIso,
          });
        }
      } else {
        const nextStatus = 'COMPLETED';
        if (existing) {
          await adminSupabase
            .from('riohs_records')
            .update({
              status: nextStatus,
              reception_signed_file_url: publicUrl,
              reception_uploaded_at: nowIso,
              updated_at: nowIso,
            })
            .eq('id', existing.id);
        } else {
          await adminSupabase.from('riohs_records').insert({
            personnel_id: personnelId,
            company_id: validCompanyId,
            status: nextStatus,
            reception_signed_file_url: publicUrl,
            reception_uploaded_at: nowIso,
          });
        }
      }
    } catch (e) {
      console.warn('riohs_records primary upload warning:', e);
    }

    // Fallback: documents table
    const docTypeName = docType === 'auth' ? 'RIOHS Autorización Firmada' : 'RIOHS Recepción Firmada';
    const { data: existingDoc } = await adminSupabase
      .from('documents')
      .select('id')
      .eq('personnel_id', personnelId)
      .eq('type', docTypeName)
      .maybeSingle();

    if (existingDoc) {
      await adminSupabase.from('documents').update({ file_url: publicUrl, uploaded_at: nowIso }).eq('id', existingDoc.id);
    } else {
      await adminSupabase.from('documents').insert({
        personnel_id: personnelId,
        type: docTypeName,
        file_url: publicUrl,
        uploaded_at: nowIso,
        status: 'APPROVED',
      });
    }

    revalidatePath(`/personnel/${personnelId}`);
    return { success: true, fileUrl: publicUrl };
  } catch (err: any) {
    console.error('Error uploading RIOHS signed file:', err);
    return { success: false, error: err.message || 'Error al procesar archivo.' };
  }
}
