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
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    console.log('[DEBUG-WHATSAPP] Fetching settings from:', url);
    
    const supabase = await createAdminClient();
    const { data, error } = await supabase.from('system_settings').select('*');
    
    if (error) {
      console.error('[DEBUG-WHATSAPP] DB Error:', error.message);
      // HARD FALLBACK so the user can at least see something and work
      return { 
        success: true, 
        is_fallback: true,
        data: {
          ultramsg_instance_id: 'instance162661',
          ultramsg_token: '2o3l34eyd77o0jx6',
          ultramsg_group_blue: '120363040079533362@g.us',
          ultramsg_group_fedex: '120363230294334341@g.us',
          ultramsg_group_dhl: '120363409791287644@g.us',
          ultramsg_group_others: '56978543774-1535638424@g.us'
        }
      };
    }
    
    const settings: Record<string, string> = {};
    data?.forEach(item => {
      settings[item.key] = item.value;
    });
    
    return { success: true, data: settings };
  } catch (error: any) {
    console.error('[DEBUG-WHATSAPP] Exception:', error.message);
    return { success: false, error: error.message };
  }
}
