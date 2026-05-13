'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export async function saveWhatsAppSettings(settings: Record<string, string>) {
  try {
    const supabase = await createAdminClient();
    
    const updates = Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('system_settings')
      .upsert(updates, { onConflict: 'key' });

    if (error) {
      console.error('Error saving WhatsApp settings:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/(dashboard)/settings/whatsapp');
    return { success: true };
  } catch (error: any) {
    console.error('Exception saving WhatsApp settings:', error);
    return { success: false, error: error.message };
  }
}

export async function getWhatsAppSettings() {
  try {
    const supabase = await createAdminClient();
    const { data, error } = await supabase.from('system_settings').select('*');
    
    if (error) throw error;
    
    const settings: Record<string, string> = {};
    data?.forEach(item => {
      settings[item.key] = item.value;
    });
    
    return { success: true, data: settings };
  } catch (error: any) {
    console.error('Error fetching settings via action:', error);
    return { success: false, error: error.message };
  }
}
