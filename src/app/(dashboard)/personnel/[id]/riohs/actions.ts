'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRole } from '@/app/role-actions';

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

export async function getRiohsRecord(personnelId: string): Promise<{ success: boolean; data?: RiohsRecordData | null; error?: string }> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('riohs_records')
      .select('*')
      .eq('personnel_id', personnelId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('riohs_records query warning:', error.message);
      return { success: true, data: null };
    }

    return { success: true, data: data as RiohsRecordData | null };
  } catch (err: any) {
    console.error('Error fetching RIOHS record:', err);
    return { success: true, data: null };
  }
}

export async function markAuthGenerated(personnelId: string, companyId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const adminSupabase = createAdminClient();

    const { data: existing } = await adminSupabase
      .from('riohs_records')
      .select('id, status')
      .eq('personnel_id', personnelId)
      .maybeSingle();

    if (existing) {
      // Only advance status if it's currently PENDING
      const newStatus = existing.status === 'PENDING' ? 'AUTH_GENERATED' : existing.status;
      await adminSupabase
        .from('riohs_records')
        .update({
          status: newStatus,
          auth_generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await adminSupabase.from('riohs_records').insert({
        personnel_id: personnelId,
        company_id: companyId,
        status: 'AUTH_GENERATED',
        auth_generated_at: new Date().toISOString(),
      });
    }

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
          company_id: companyId,
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
          company_id: companyId,
          status: nextStatus,
          reception_signed_file_url: publicUrl,
          reception_uploaded_at: nowIso,
        });
      }
    }

    return { success: true, fileUrl: publicUrl };
  } catch (err: any) {
    console.error('Error uploading RIOHS signed file:', err);
    return { success: false, error: err.message || 'Error al procesar archivo.' };
  }
}
