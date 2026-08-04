'use server';

import { createClient } from '@/lib/supabase/server';
import { sendWhatsAppMessage } from '@/lib/ultramsg';

export async function sendIndividualComplianceReminder({
  workerId,
  phone,
  customMessage,
}: {
  workerId: string;
  phone: string;
  customMessage: string;
}): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!phone || phone.trim().length < 8) {
      throw new Error('Sin teléfono registrado');
    }

    // 1. Format phone to Chilean standard (+569 / 569)
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 8) cleanPhone = '569' + cleanPhone;
    if (cleanPhone.length === 9 && !cleanPhone.startsWith('56')) cleanPhone = '56' + cleanPhone;
    
    if (!cleanPhone.includes('@')) {
      cleanPhone = `${cleanPhone}@c.us`;
    }

    // 2. Send via UltraMsg
    const result = await sendWhatsAppMessage(cleanPhone, customMessage);

    if (!result.success) {
      throw new Error(typeof result.error === 'string' ? result.error : 'Error al enviar por WhatsApp');
    }

    return { success: true, error: null };
  } catch (error: any) {
    console.error(`[Reminder] Failed for worker ${workerId}:`, error);
    return { success: false, error: error.message };
  }
}
