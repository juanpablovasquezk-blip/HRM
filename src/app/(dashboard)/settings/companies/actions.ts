'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export interface CompanyDetailsInput {
  name: string;
  legal_name?: string | null;
  rut?: string | null;
  giro?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  phone?: string | null;
  email?: string | null;
  legal_representative?: string | null;
}

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

export async function updateCompanyDetails(id: string, details: CompanyDetailsInput) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('companies')
    .update({
      name: details.name,
      legal_name: details.legal_name || null,
      rut: details.rut || null,
      giro: details.giro || null,
      address: details.address || null,
      city: details.city || null,
      region: details.region || null,
      phone: details.phone || null,
      email: details.email || null,
      legal_representative: details.legal_representative || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  
  revalidatePath('/settings/companies');
  revalidatePath('/personnel');
  return { data, error: null };
}

export async function updateCompany(id: string, name: string) {
  return updateCompanyDetails(id, { name });
}

export async function deleteCompany(id: string) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  
  revalidatePath('/settings/companies');
  revalidatePath('/personnel');
  return { error: null };
}

// ---------------------------------------------------------------------------
// Company Documents Actions
// ---------------------------------------------------------------------------

export async function uploadCompanyDocument(formData: FormData) {
  try {
    const companyId = formData.get('companyId') as string;
    const category = (formData.get('category') as string) || 'GENERAL';
    const title = formData.get('title') as string;
    const file = formData.get('file') as File;

    if (!companyId || !title || !file) {
      return { success: false, error: 'Compañía, título y archivo son requeridos.' };
    }

    const adminSupabase = createAdminClient();
    const fileExt = file.name.split('.').pop() || 'pdf';
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_');
    const storagePath = `company-documents/${companyId}/${category}_${sanitizedTitle}_${Date.now()}.${fileExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadErr } = await adminSupabase.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      console.error('[CompanyDocs] Upload error:', uploadErr);
      return { success: false, error: `Error subiendo archivo: ${uploadErr.message}` };
    }

    const { data: publicUrlData } = adminSupabase.storage
      .from('documents')
      .getPublicUrl(storagePath);

    const fileUrl = publicUrlData.publicUrl;

    // If RIOHS, delete previous RIOHS documents for this company to maintain single active RIOHS
    if (category === 'RIOHS') {
      await adminSupabase
        .from('company_documents')
        .delete()
        .eq('company_id', companyId)
        .eq('category', 'RIOHS');
    }

    const { data: docRecord, error: dbErr } = await adminSupabase
      .from('company_documents')
      .insert({
        company_id: companyId,
        category,
        title,
        file_url: fileUrl,
        file_name: file.name,
      })
      .select()
      .single();

    if (dbErr) {
      console.error('[CompanyDocs] DB insert error:', dbErr);
      return { success: false, error: `Error guardando en BD: ${dbErr.message}` };
    }

    revalidatePath('/settings/companies');
    revalidatePath('/personnel');
    return { success: true, data: docRecord };
  } catch (err: any) {
    console.error('[CompanyDocs] Unexpected error:', err);
    return { success: false, error: err.message || 'Error inesperado.' };
  }
}

export async function deleteCompanyDocument(documentId: string, companyId: string) {
  try {
    const adminSupabase = createAdminClient();
    
    const { error } = await adminSupabase
      .from('company_documents')
      .delete()
      .eq('id', documentId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/settings/companies');
    revalidatePath('/personnel');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
