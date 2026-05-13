import { createAdminClient } from './supabase/admin';

export async function getSystemSettings() {
  const supabase = await createAdminClient();
  const { data } = await supabase.from('system_settings').select('*');
  
  const settings: Record<string, string> = {};
  data?.forEach(item => {
    settings[item.key] = item.value;
  });
  
  return settings;
}

export async function sendWhatsAppMessage(to: string, message: string) {
  // 1. Try to get settings from Database first
  const dbSettings = await getSystemSettings();
  
  const instanceId = dbSettings.ultramsg_instance_id || process.env.ULTRAMSG_INSTANCE_ID;
  const token = dbSettings.ultramsg_token || process.env.ULTRAMSG_TOKEN;

  if (!instanceId || !token) {
    console.error('UltraMsg credentials not found in DB or Environment');
    return { success: false, error: 'Configuración faltante' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        token: token,
        to: to,
        body: message
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await response.json();
    return { success: true, data };
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('UltraMsg Error:', error.name === 'AbortError' ? 'Timeout' : error.message);
    return { 
      success: false, 
      error: error.name === 'AbortError' ? 'Error: El servicio de WhatsApp no responde (Timeout)' : error.message 
    };
  }
}
