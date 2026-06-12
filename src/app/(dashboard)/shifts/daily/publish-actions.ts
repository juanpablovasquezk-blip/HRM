'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMedia } from '@/lib/ultramsg';

export async function sendDailyPlanScreenshotAction(base64Image: string, date: string) {
  try {
    if (!base64Image) {
      return { success: false, error: 'Imagen base64 vacía' };
    }

    // 1. Strip base64 header if present
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const adminClient = createAdminClient();
    const fileName = `roster_shares/daily_plan_${date.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`;

    // 2. Upload file to Supabase Storage
    const { error: uploadError } = await adminClient.storage
      .from('documents')
      .upload(fileName, buffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Error al subir captura de pantalla: ${uploadError.message}`);
    }

    // 3. Get public URL
    const { data: urlData } = adminClient.storage
      .from('documents')
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // 4. Fetch all settings (including custom and legacy groups)
    const { data: settingsData, error: settingsError } = await adminClient
      .from('system_settings')
      .select('key, value');

    if (settingsError) throw settingsError;

    const settings: Record<string, string> = {};
    settingsData?.forEach(item => {
      settings[item.key] = item.value;
    });

    // Parse dynamic groups list
    let groupsList: Array<{ name: string; id: string }> = [];
    if (settings.ultramsg_groups) {
      try {
        groupsList = JSON.parse(settings.ultramsg_groups);
      } catch (e) {
        console.error('Error parsing groups JSON in publish-actions:', e);
      }
    }

    // Fallback: If no groups list in JSON, compile from legacy keys
    if (groupsList.length === 0) {
      if (settings.ultramsg_group_blue) groupsList.push({ name: 'BlueExpress', id: settings.ultramsg_group_blue });
      if (settings.ultramsg_group_fedex) groupsList.push({ name: 'FedEx', id: settings.ultramsg_group_fedex });
      if (settings.ultramsg_group_dhl) groupsList.push({ name: 'DHL', id: settings.ultramsg_group_dhl });
      if (settings.ultramsg_group_others) groupsList.push({ name: 'Otros', id: settings.ultramsg_group_others });
    }

    if (groupsList.length === 0) {
      return { success: false, error: 'No hay grupos de WhatsApp configurados en ajustes.' };
    }

    // 5. Send media to all groups in parallel
    const caption = `Planificación diaria publicada para el día: ${date}`;
    const sendPromises = groupsList
      .filter(group => group.id)
      .map(async (group) => {
        console.log(`[DAILY-PUBLISH] Sending media to group: ${group.name} (${group.id})`);
        try {
          const res = await sendWhatsAppMedia(group.id, publicUrl, caption, settings);
          return {
            groupName: group.name,
            success: res.success,
            error: res.error || null
          };
        } catch (e: any) {
          return {
            groupName: group.name,
            success: false,
            error: e.message || 'Error de envío'
          };
        }
      });

    const results = await Promise.all(sendPromises);

    // 6. Schedule cleanup in 2 minutes (non-blocking)
    setTimeout(async () => {
      try {
        const client = createAdminClient();
        await client.storage.from('documents').remove([fileName]);
        console.log(`[DAILY-PUBLISH-CLEANUP] Deleted temporary file ${fileName}`);
      } catch (e: any) {
        console.error(`[DAILY-PUBLISH-CLEANUP] Failed to delete file ${fileName}:`, e.message);
      }
    }, 120000);

    return { 
      success: true, 
      results,
      publicUrl
    };
  } catch (error: any) {
    console.error('Exception in sendDailyPlanScreenshotAction:', error);
    return { success: false, error: error.message || 'Error inesperado al enviar captura' };
  }
}
