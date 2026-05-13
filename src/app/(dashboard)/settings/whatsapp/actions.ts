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
