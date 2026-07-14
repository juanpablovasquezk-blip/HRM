'use server';

import { createClient } from '@/lib/supabase/server';
import { startOfDay, endOfDay, eachDayOfInterval, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { sendWhatsAppMedia } from '@/lib/ultramsg';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export async function getIndividualRoster(personnelId: string, startDate: string, endDate: string) {
  const supabase = await createClient();

  // 1. Fetch Personnel Info
  const { data: personnel, error: pErr } = await supabase
    .from('personnel')
    .select('*, company:companies(name)')
    .eq('id', personnelId)
    .single();

  if (pErr || !personnel) return { error: 'Trabajador no encontrado' };

  // 1b. Fetch Position Name manually since no DB relation is defined for select
  let positionName = 'TRABAJADOR';
  if (personnel.main_position) {
    const { data: pos } = await supabase
      .from('positions')
      .select('name')
      .eq('id', personnel.main_position)
      .single();
    if (pos) positionName = pos.name;
  }
  
  // Attach position name to personnel object
  (personnel as any).position = { name: positionName };

  // 2. Fetch Assignments (Scheduled shifts)
  const { data: assignments, error: aErr } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts!shift_assignments_shift_id_fkey(*), area:areas(name), position:positions(name), is_manual')
    .eq('personnel_id', personnelId)
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('is_extra', false)
    .order('date', { ascending: true });

  if (aErr) return { error: aErr.message };

  // 3. Fetch Leaves/Absences
  const { data: leaves } = await supabase
    .from('leaves')
    .select('*, created_at')
    .eq('personnel_id', personnelId)
    .lte('start_date', endDate)
    .gte('end_date', startDate);


  return {
    personnel,
    assignments: assignments || [],
    leaves: leaves || [],
    startDate,
    endDate
  };
}

export async function sendRosterWhatsApp(
  personnelId: string,
  base64Image: string,
  startDate: string,
  endDate: string
) {
  try {
    const adminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Fetch Personnel Info (to get name and phone)
    const { data: personnel, error: pErr } = await adminClient
      .from('personnel')
      .select('first_name, last_name_father, phone')
      .eq('id', personnelId)
      .single();

    if (pErr || !personnel) {
      return { success: false, error: 'Trabajador no encontrado' };
    }

    if (!personnel.phone) {
      return { success: false, error: `El trabajador ${personnel.first_name} ${personnel.last_name_father} no tiene un teléfono registrado.` };
    }

    // 2. Clean base64 header and convert to Buffer
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // 2b. Find which bucket exists: 'media' or 'documents'
    const { data: buckets } = await adminClient.storage.listBuckets();
    const bucketNames = (buckets || []).map(b => b.name);
    const bucketName = bucketNames.includes('media') 
      ? 'media' 
      : bucketNames.includes('documents') 
        ? 'documents' 
        : null;

    if (!bucketName) {
      return { success: false, error: 'No se encontró un bucket de almacenamiento válido (se requiere "media" o "documents" en Supabase)' };
    }

    // 3. Upload file to selected bucket under roster_shares/
    const fileName = `roster_shares/roster_${personnelId}_${Date.now()}.png`;

    const { error: uploadError } = await adminClient.storage
      .from(bucketName)
      .upload(fileName, buffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      return { success: false, error: `Error de subida a Storage: ${uploadError.message}` };
    }

    // 4. Create a signed URL for public access with 1 hour expiration
    const { data: signedData, error: signError } = await adminClient.storage
      .from(bucketName)
      .createSignedUrl(fileName, 3600);

    if (signError || !signedData?.signedUrl) {
      // Clean up file if signing failed
      await adminClient.storage.from(bucketName).remove([fileName]);
      return { success: false, error: `Error al generar URL firmada: ${signError?.message || 'URL vacía'}` };
    }

    // 5. Send message via WhatsApp
    const phone = personnel.phone;
    let cleanPhone = phone.replace(/[^\d+]/g, '');
    if (!cleanPhone.startsWith('+') && cleanPhone.startsWith('56')) {
      cleanPhone = '+' + cleanPhone;
    }

    const platformUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const message = `Su rol está disponible en la plataforma\n\nAcceda aquí: ${platformUrl}\n\n*Este es un mensaje automático. No lo responda. Si tiene alguna duda comuníquese con su supervisor.*`;

    const res = await sendWhatsAppMedia(cleanPhone, signedData.signedUrl, message);

    // 6. Delete file from storage asynchronously after 2 minutes
    setTimeout(async () => {
      try {
        const cleanupClient = createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { error: delError } = await cleanupClient.storage
          .from(bucketName)
          .remove([fileName]);
        if (delError) {
          console.error(`[ULTRAMSG-CLEANUP] Failed to delete temporary file ${fileName} from ${bucketName}:`, delError.message);
        } else {
          console.log(`[ULTRAMSG-CLEANUP] Successfully deleted temporary file ${fileName} from ${bucketName}`);
        }
      } catch (e) {
        console.error(`[ULTRAMSG-CLEANUP] Exception deleting temporary file ${fileName} from ${bucketName}:`, e);
      }
    }, 120000);

    if (!res.success) {
      return { success: false, error: `Error de WhatsApp: ${res.error}` };
    }

    return { success: true };
  } catch (error: any) {
    console.error('[sendRosterWhatsApp] Error:', error);
    return { success: false, error: error.message || 'Error interno del servidor' };
  }
}
