'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRole } from '@/app/role-actions';
import { revalidatePath } from 'next/cache';

export interface RiohsDashboardWorker {
  id: string;
  first_name: string;
  last_name_father: string;
  last_name_mother?: string | null;
  fullName: string;
  rut: string;
  email: string | null;
  company_id: string;
  company_name: string;
  company_rut: string;
  position_id: string;
  position_name: string;
  riohs_status: 'PENDING' | 'AUTH_GENERATED' | 'AUTH_UPLOADED' | 'RIOHS_SENT' | 'COMPLETED';
  auth_generated_at?: string | null;
  auth_signed_file_url?: string | null;
  auth_uploaded_at?: string | null;
  riohs_sent_at?: string | null;
  riohs_sent_to_email?: string | null;
  reception_signed_file_url?: string | null;
  reception_uploaded_at?: string | null;
  updated_at?: string | null;
}

export interface RiohsDashboardData {
  workers: RiohsDashboardWorker[];
  companies: { id: string; name: string; rut?: string }[];
  positions: { id: string; name: string }[];
}

export async function getRiohsDashboardData(): Promise<{ success: boolean; data?: RiohsDashboardData; error?: string }> {
  try {
    const supabase = createAdminClient();

    const [
      { data: personnel, error: pErr },
      { data: riohsRecords, error: rErr },
      { data: fallbackDocs },
      { data: companies, error: cErr },
      { data: positions, error: posErr }
    ] = await Promise.all([
      supabase
        .from('personnel')
        .select(`
          id,
          first_name,
          last_name_father,
          last_name_mother,
          rut,
          email,
          company_id,
          main_position,
          company:companies!personnel_company_id_fkey(id, name, rut),
          position:positions!personnel_main_position_fkey(id, name)
        `)
        .eq('is_active', true)
        .or('onboarding_status.is.null,onboarding_status.eq.approved')
        .order('last_name_father', { ascending: true }),
      supabase
        .from('riohs_records')
        .select('*'),
      supabase
        .from('documents')
        .select('personnel_id, type, file_url, uploaded_at, number')
        .ilike('type', 'RIOHS%'),
      supabase
        .from('companies')
        .select('id, name, rut')
        .order('name', { ascending: true }),
      supabase
        .from('positions')
        .select('id, name')
        .order('name', { ascending: true })
    ]);

    if (pErr) throw pErr;

    const riohsMap = new Map<string, any>();
    if (riohsRecords) {
      for (const rec of riohsRecords) {
        riohsMap.set(rec.personnel_id, rec);
      }
    }

    // Fallback map from documents table
    const fallbackMap = new Map<string, { status: string; auth_generated_at?: string; auth_signed_file_url?: string; riohs_sent_at?: string; reception_signed_file_url?: string }>();
    if (fallbackDocs && fallbackDocs.length > 0) {
      for (const doc of fallbackDocs) {
        let entry = fallbackMap.get(doc.personnel_id);
        if (!entry) {
          entry = { status: 'PENDING' };
          fallbackMap.set(doc.personnel_id, entry);
        }
        if (doc.type === 'RIOHS Autorización Digital') {
          entry.auth_generated_at = doc.uploaded_at;
          if (entry.status === 'PENDING') entry.status = 'AUTH_GENERATED';
        } else if (doc.type === 'RIOHS Autorización Firmada') {
          entry.auth_signed_file_url = doc.file_url;
          if (['PENDING', 'AUTH_GENERATED'].includes(entry.status)) entry.status = 'AUTH_UPLOADED';
        } else if (doc.type === 'RIOHS Email Enviado') {
          entry.riohs_sent_at = doc.uploaded_at;
          if (['PENDING', 'AUTH_GENERATED', 'AUTH_UPLOADED'].includes(entry.status)) entry.status = 'RIOHS_SENT';
        } else if (doc.type === 'RIOHS Recepción Firmada') {
          entry.reception_signed_file_url = doc.file_url;
          entry.status = 'COMPLETED';
        }
      }
    }

    const workers: RiohsDashboardWorker[] = (personnel || []).map((w: any) => {
      const comp = w.company || {};
      const pos = w.position || {};
      const rec = riohsMap.get(w.id);
      const fallback = fallbackMap.get(w.id);

      const status = rec?.status || fallback?.status || 'PENDING';
      const fullName = `${w.first_name || ''} ${w.last_name_father || ''} ${w.last_name_mother || ''}`.trim().replace(/\s+/g, ' ');

      return {
        id: w.id,
        first_name: w.first_name || '',
        last_name_father: w.last_name_father || '',
        last_name_mother: w.last_name_mother || null,
        fullName,
        rut: w.rut || '',
        email: w.email || null,
        company_id: w.company_id || '',
        company_name: comp.name || 'Sin Empresa',
        company_rut: comp.rut || '76.135.448-5',
        position_id: w.main_position || '',
        position_name: pos.name || 'Sin Cargo',
        riohs_status: status,
        auth_generated_at: rec?.auth_generated_at || fallback?.auth_generated_at || null,
        auth_signed_file_url: rec?.auth_signed_file_url || fallback?.auth_signed_file_url || null,
        auth_uploaded_at: rec?.auth_uploaded_at || null,
        riohs_sent_at: rec?.riohs_sent_at || fallback?.riohs_sent_at || null,
        riohs_sent_to_email: rec?.riohs_sent_to_email || null,
        reception_signed_file_url: rec?.reception_signed_file_url || fallback?.reception_signed_file_url || null,
        reception_uploaded_at: rec?.reception_uploaded_at || null,
        updated_at: rec?.updated_at || null,
      };
    });

    return {
      success: true,
      data: {
        workers,
        companies: (companies || []).map((c: any) => ({ id: c.id, name: c.name, rut: c.rut })),
        positions: (positions || []).map((p: any) => ({ id: p.id, name: p.name })),
      },
    };
  } catch (err: any) {
    console.error('Error fetching RIOHS dashboard data:', err);
    return { success: false, error: err.message || 'Error al cargar datos' };
  }
}

export async function markBatchAuthGenerated(
  items: { personnelId: string; companyId: string }[]
): Promise<{ success: boolean; updatedCount: number; error?: string }> {
  try {
    const role = await getUserRole();
    if (role !== 'ADMIN' && role !== 'HR' && role !== 'SAFETY_OFFICER') {
      return { success: false, updatedCount: 0, error: 'No tiene permisos para realizar esta acción.' };
    }

    if (!items || items.length === 0) {
      return { success: true, updatedCount: 0 };
    }

    const adminSupabase = createAdminClient();
    const nowIso = new Date().toISOString();

    let updatedCount = 0;

    for (const item of items) {
      const { personnelId, companyId } = item;

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
            company_id: companyId,
            status: 'AUTH_GENERATED',
            auth_generated_at: nowIso,
          });
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

        updatedCount++;
      } catch (e) {
        console.warn(`Error updating RIOHS record for personnel ${personnelId}:`, e);
      }
    }

    revalidatePath('/prevencion-riesgos');
    revalidatePath('/personnel');
    return { success: true, updatedCount };
  } catch (err: any) {
    console.error('Error batch marking auth generated:', err);
    return { success: false, updatedCount: 0, error: err.message || 'Error al actualizar base de datos.' };
  }
}
