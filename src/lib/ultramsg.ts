import { createAdminClient } from './supabase/admin';

export async function getSystemSettings() {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.from('system_settings').select('*');
  
  if (error) {
    console.error('DATABASE ERROR fetching settings:', error);
    // HARD FALLBACK for the notification engine
    return { 
      ultramsg_instance_id: 'instance162661',
      ultramsg_token: '2o3l34eyd77o0jx6',
      ultramsg_group_blue: '120363040079533362@g.us',
      ultramsg_group_fedex: '120363230294334341@g.us',
      ultramsg_group_dhl: '120363409791287644@g.us',
      ultramsg_group_others: '56978543774-1535638424@g.us',
      _is_fallback: 'true'
    };
  }
  
  const settings: Record<string, string> = {};
  data?.forEach(item => {
    settings[item.key] = item.value;
  });
  
  if (Object.keys(settings).length === 0) {
    console.warn('SYSTEM SETTINGS TABLE IS EMPTY - Using Fallback');
    return { 
      ultramsg_instance_id: 'instance162661',
      ultramsg_token: '2o3l34eyd77o0jx6',
      ultramsg_group_blue: '120363040079533362@g.us',
      ultramsg_group_fedex: '120363230294334341@g.us',
      ultramsg_group_dhl: '120363409791287644@g.us',
      ultramsg_group_others: '56978543774-1535638424@g.us',
      _is_fallback: 'true'
    };
  }
  
  return settings;
}

export async function sendWhatsAppMessage(to: string, message: string, existingSettings?: any) {
  // 1. Use existing settings or fetch from DB
  const dbSettings = existingSettings || await getSystemSettings();
  
  let instanceId: string | undefined = dbSettings.ultramsg_instance_id;
  let token: string | undefined = dbSettings.ultramsg_token;
  let source = 'DATABASE';

  if (!instanceId || !token) {
    instanceId = process.env.ULTRAMSG_INSTANCE_ID;
    token = process.env.ULTRAMSG_TOKEN;
    source = 'ENVIRONMENT';
  }

  if (instanceId && !instanceId.startsWith('instance')) {
    instanceId = `instance${instanceId}`;
  }

  if (!instanceId || !token) {
    console.error('UltraMsg credentials not found in DB or Environment');
    return { 
      success: false, 
      error: 'Configuración faltante',
      debug: { dbKeys: Object.keys(dbSettings) }
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;

  try {
    console.log(`[ULTRAMSG] Sending to ${to} via ${instanceId} (${source})...`);
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
      console.error(`[ULTRAMSG] HTTP Error ${response.status} at ${url}:`, errText);
      return { 
        success: false, 
        error: `Error HTTP ${response.status} (URL: ${url})`,
        debug: { url, status: response.status, response: errText }
      };
    }

    const data = await response.json();
    console.log('[ULTRAMSG] API Response:', data);
    
    // UltraMsg returns { "sent": "true", ... } on success
    if (data.sent === 'true' || data.sent === true || data.id) {
      return { success: true, data, debug: { source } };
    } else {
      console.error('[ULTRAMSG] API Error:', data);
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
      debug: { url, error: errorMsg, source }
    };
  }
}

export async function sendWhatsAppMedia(to: string, mediaUrl: string, caption?: string, existingSettings?: any) {
  const dbSettings = existingSettings || await getSystemSettings();
  
  let instanceId: string | undefined = dbSettings.ultramsg_instance_id;
  let token: string | undefined = dbSettings.ultramsg_token;
  let source = 'DATABASE';

  if (!instanceId || !token) {
    instanceId = process.env.ULTRAMSG_INSTANCE_ID;
    token = process.env.ULTRAMSG_TOKEN;
    source = 'ENVIRONMENT';
  }

  if (instanceId && !instanceId.startsWith('instance')) {
    instanceId = `instance${instanceId}`;
  }

  if (!instanceId || !token) {
    console.error('UltraMsg credentials not found in DB or Environment');
    return { 
      success: false, 
      error: 'Configuración faltante'
    };
  }

  const isVideo = mediaUrl.toLowerCase().endsWith('.mp4');
  const isImage = mediaUrl.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/i);
  const endpoint = isVideo ? 'messages/video' : isImage ? 'messages/image' : 'messages/document';

  const url = `https://api.ultramsg.com/${instanceId}/${endpoint}`;

  const controller = new AbortController();
  // Uploading video can take longer, increase timeout to 30s
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    console.log(`[ULTRAMSG] Sending Media to ${to} via ${endpoint}...`);
    
    const params: Record<string, string> = {
      token: token,
      to: to
    };

    if (isVideo) {
      params.video = mediaUrl;
    } else if (isImage) {
      params.image = mediaUrl;
    } else {
      params.document = mediaUrl;
    }

    if (caption) {
      params.caption = caption;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(params),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errText}` };
    }

    const data = await response.json();
    if (data.sent === 'true' || data.sent === true || data.id) {
      return { success: true, data };
    } else {
      return { success: false, error: data.error || data.message || 'API Error' };
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    const errorMsg = error.name === 'AbortError' ? 'Timeout' : error.message;
    return { success: false, error: `Exception: ${errorMsg}` };
  }
}
