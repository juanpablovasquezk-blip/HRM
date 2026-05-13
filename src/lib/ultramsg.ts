import { createAdminClient } from './supabase/admin';

export async function getSystemSettings() {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.from('system_settings').select('*');
  
  if (error) {
    console.error('DATABASE ERROR fetching settings:', error);
    return { _error: error.message };
  }
  
  const settings: Record<string, string> = {};
  data?.forEach(item => {
    settings[item.key] = item.value;
  });
  
  if (Object.keys(settings).length === 0) {
    console.warn('SYSTEM SETTINGS TABLE IS EMPTY');
    return { _warn: 'table_empty' };
  }
  
  return settings;
}

export async function sendWhatsAppMessage(to: string, message: string) {
  // 1. Try to get settings from Database first
  const dbSettings = await getSystemSettings();
  
  let instanceId = dbSettings.ultramsg_instance_id || process.env.ULTRAMSG_INSTANCE_ID;
  const token = dbSettings.ultramsg_token || process.env.ULTRAMSG_TOKEN;

  if (instanceId && !instanceId.startsWith('instance')) {
    instanceId = `instance${instanceId}`;
  }

  if (!instanceId || !token) {
    console.error('UltraMsg credentials not found in DB or Environment');
    return { success: false, error: 'Configuración faltante' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;

  try {
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
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(`UltraMsg HTTP Error ${response.status} at ${url}:`, errText);
      return { 
        success: false, 
        error: `Error HTTP ${response.status} (URL: ${url})`,
        debug: { url, status: response.status, response: errText }
      };
    }

    const data = await response.json();
    
    // UltraMsg returns { "sent": "true", ... } on success
    if (data.sent === 'true' || data.sent === true || data.id) {
      return { success: true, data };
    } else {
      console.error('UltraMsg API Error:', data);
      return { 
        success: false, 
        error: data.error || data.message || 'Error desconocido en API',
        debug: { url, data }
      };
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    const errorMsg = error.name === 'AbortError' ? 'Timeout' : error.message;
    console.error('UltraMsg Exception:', errorMsg);
    return { 
      success: false, 
      error: `Error de conexión: ${errorMsg} (URL: ${url})`,
      debug: { url, error: errorMsg }
    };
  }
}
