'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { getUserRole } from '@/app/role-actions';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (error: any) {
    if (error && error.message && error.message.includes('static generation store')) {
      return;
    }
    throw error;
  }
}

export async function uploadLetter(formData: FormData) {
  try {
    // 1. Authorization check
    const role = await getUserRole();
    const isAuthorized = ['ADMIN', 'AIRPORT_ASSISTANT', 'ASSISTANT'].includes(role);
    if (!isAuthorized) {
      return { success: false, error: 'Acceso denegado: Permisos insuficientes' };
    }

    const personnelId = formData.get('personnel_id') as string;
    const type = formData.get('type') as 'FELICITACION' | 'AMONESTACION';
    const date = formData.get('date') as string;
    const reason = formData.get('reason') as string;
    const file = formData.get('file') as File | null;

    if (!personnelId || !type || !date || !reason) {
      return { success: false, error: 'Faltan campos obligatorios' };
    }

    const adminClient = createAdminClient();
    let fileUrl: string | null = null;

    // 2. Upload file if provided
    if (file && file.size > 0) {
      const fileExt = file.name.split('.').pop();
      const sanitizedType = type.toLowerCase();
      const fileName = `letters/${personnelId}/${sanitizedType}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await adminClient.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(`Error de subida de archivo: ${uploadError.message}`);
      }

      const { data: urlData } = adminClient.storage
        .from('documents')
        .getPublicUrl(fileName);

      fileUrl = urlData.publicUrl;
    }

    // 3. Save database record
    const { data: letter, error: insertError } = await adminClient
      .from('personnel_letters')
      .insert({
        personnel_id: personnelId,
        type,
        date,
        reason,
        file_url: fileUrl
      })
      .select()
      .single();

    if (insertError) {
      // Clean up uploaded file if DB insert fails
      if (fileUrl) {
        const marker = '/documents/';
        const idx = fileUrl.lastIndexOf(marker);
        if (idx !== -1) {
          const storagePath = fileUrl.substring(idx + marker.length);
          await adminClient.storage.from('documents').remove([storagePath]);
        }
      }
      throw new Error(`Error al registrar en BD: ${insertError.message}`);
    }

    // 4. Revalidate pages
    safeRevalidatePath(`/personnel/${personnelId}`);
    safeRevalidatePath('/reports/warnings');

    return { success: true, data: letter };
  } catch (error: any) {
    console.error('Error uploading personnel letter:', error);
    return { success: false, error: error.message || 'Error inesperado' };
  }
}

export async function deleteLetter(id: string) {
  try {
    // 1. Authorization check
    const role = await getUserRole();
    const isAuthorized = ['ADMIN', 'AIRPORT_ASSISTANT', 'ASSISTANT'].includes(role);
    if (!isAuthorized) {
      return { success: false, error: 'Acceso denegado: Permisos insuficientes' };
    }

    const adminClient = createAdminClient();

    // 2. Get the letter record to check for files and to revalidate correct path
    const { data: letter, error: fetchError } = await adminClient
      .from('personnel_letters')
      .select('personnel_id, file_url')
      .eq('id', id)
      .single();

    if (fetchError || !letter) {
      throw new Error('La carta no existe o no pudo ser recuperada');
    }

    // 3. Remove storage file if it exists
    if (letter.file_url) {
      const marker = '/documents/';
      const idx = letter.file_url.lastIndexOf(marker);
      if (idx !== -1) {
        const storagePath = letter.file_url.substring(idx + marker.length);
        await adminClient.storage.from('documents').remove([storagePath]);
      }
    }

    // 4. Delete the database record
    const { error: deleteError } = await adminClient
      .from('personnel_letters')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw new Error(`Error al eliminar registro: ${deleteError.message}`);
    }

    // 5. Revalidate pages
    safeRevalidatePath(`/personnel/${letter.personnel_id}`);
    safeRevalidatePath('/reports/warnings');

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting personnel letter:', error);
    return { success: false, error: error.message || 'Error inesperado' };
  }
}

export async function getLetters(personnelId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('personnel_letters')
      .select('*')
      .eq('personnel_id', personnelId)
      .order('date', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching personnel letters:', error);
    return { success: false, error: error.message || 'Error al obtener cartas', data: [] };
  }
}
