'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export async function saveWhatsAppSettings(settings: Record<string, string>) {
  try {
    const supabase = await createAdminClient();

    // Parse groups to maintain legacy keys for backward compatibility
    const groupsJson = settings.ultramsg_groups;
    let groupsList: Array<{ name: string; id: string }> = [];
    if (groupsJson) {
      try {
        groupsList = JSON.parse(groupsJson);
      } catch (e) {
        console.error('Error parsing ultramsg_groups JSON:', e);
      }
    }

    // Initialize legacy keys to empty in the updates payload to clear them if deleted
    settings.ultramsg_group_blue = '';
    settings.ultramsg_group_fedex = '';
    settings.ultramsg_group_dhl = '';
    settings.ultramsg_group_others = '';

    // Map custom groups to legacy keys case-insensitively
    groupsList.forEach(g => {
      const nameLower = g.name.toLowerCase();
      if (nameLower.includes('blue')) {
        settings.ultramsg_group_blue = g.id;
      } else if (nameLower.includes('fedex')) {
        settings.ultramsg_group_fedex = g.id;
      } else if (nameLower.includes('dhl')) {
        settings.ultramsg_group_dhl = g.id;
      } else if (nameLower.includes('otro') || settings.ultramsg_group_others === '') {
        settings.ultramsg_group_others = g.id;
      }
    });

    // If still empty and there are groups, assign the first one to others
    if (settings.ultramsg_group_others === '' && groupsList.length > 0) {
      const unusedGroup = groupsList.find(g => 
        !g.name.toLowerCase().includes('blue') && 
        !g.name.toLowerCase().includes('fedex') && 
        !g.name.toLowerCase().includes('dhl')
      );
      if (unusedGroup) {
        settings.ultramsg_group_others = unusedGroup.id;
      } else {
        settings.ultramsg_group_others = groupsList[0].id;
      }
    }

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
    
    if (error) {
      console.error('[DEBUG-WHATSAPP] DB Error:', error.message);
      return { 
        success: true, 
        is_fallback: true,
        data: {
          ultramsg_instance_id: 'instance162661',
          ultramsg_token: '2o3l34eyd77o0jx6',
          email_recipients: '',
          ultramsg_groups: JSON.stringify([
            { name: 'BlueExpress', id: '120363040079533362@g.us' },
            { name: 'FedEx', id: '120363230294334341@g.us' },
            { name: 'DHL', id: '120363409791287644@g.us' },
            { name: 'Otros', id: '56978543774-1535638424@g.us' }
          ])
        }
      };
    }
    
    const settings: Record<string, string> = {};
    data?.forEach(item => {
      settings[item.key] = item.value;
    });

    // Build ultramsg_groups list if not present
    if (!settings.ultramsg_groups) {
      const groupsList = [];
      if (settings.ultramsg_group_blue) groupsList.push({ name: 'BlueExpress', id: settings.ultramsg_group_blue });
      if (settings.ultramsg_group_fedex) groupsList.push({ name: 'FedEx', id: settings.ultramsg_group_fedex });
      if (settings.ultramsg_group_dhl) groupsList.push({ name: 'DHL', id: settings.ultramsg_group_dhl });
      if (settings.ultramsg_group_others) groupsList.push({ name: 'Otros', id: settings.ultramsg_group_others });
      
      settings.ultramsg_groups = JSON.stringify(groupsList);
    }
    
    return { success: true, data: settings };
  } catch (error: any) {
    console.error('[DEBUG-WHATSAPP] Exception:', error.message);
    return { success: false, error: error.message };
  }
}
