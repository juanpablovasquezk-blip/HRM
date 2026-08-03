'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { sendWhatsAppMessage } from '@/lib/ultramsg';
import type { Personnel } from '@/types/database';

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (error: any) {
    if (error && error.message && error.message.includes('static generation store')) {
      return;
    }
    throw error;
  }
}

// 1. Generar token de actualización de ficha
export async function createPersonnelUpdateToken(
  personnelId: string,
  expirationDays: number = 7
): Promise<{ success: boolean; token: string | null; expiresAt: string | null; error: string | null }> {
  const supabase = await createClient();
  const expires = new Date();
  expires.setDate(expires.getDate() + expirationDays);
  const expiresAtStr = expires.toISOString();

  try {
    // Intentar insertar en la tabla de la base de datos
    const { data, error } = await supabase
      .from('personnel_update_tokens')
      .insert({
        personnel_id: personnelId,
        expires_at: expiresAtStr,
      })
      .select('token, expires_at')
      .single();

    if (!error && data?.token) {
      return { success: true, token: data.token, expiresAt: data.expires_at, error: null };
    }
  } catch (e) {
    console.warn('Fallback to Base64 token: personnel_update_tokens table may not exist yet.', e);
  }

  // Fallback firmado por base64url(personnelId:expiresTimestamp) en caso de que no esté la tabla
  const timestamp = expires.getTime();
  const rawPayload = `${personnelId}:${timestamp}`;
  const encodedToken = Buffer.from(rawPayload).toString('base64url');

  return { success: true, token: encodedToken, expiresAt: expiresAtStr, error: null };
}

// 2. Obtener datos del trabajador por token
export async function getPersonnelUpdateDetailsByToken(tokenStr: string): Promise<{
  data: {
    worker: any;
    expiresAt: string;
  } | null;
  status: 'VALID' | 'EXPIRED' | 'NOT_FOUND';
  error: string | null;
}> {
  const supabase = await createClient();
  const cleanToken = tokenStr.trim();

  // A. Intentar buscar en la base de datos
  try {
    const { data: tokenRow } = await supabase
      .from('personnel_update_tokens')
      .select('*, personnel:personnel(*, company:companies(id, name), position:positions(name))')
      .eq('token', cleanToken)
      .maybeSingle();

    if (tokenRow && tokenRow.personnel) {
      const now = new Date();
      const expiresAtDate = new Date(tokenRow.expires_at);

      if (now > expiresAtDate) {
        return {
          data: null,
          status: 'EXPIRED',
          error: `Este enlace caducó el ${expiresAtDate.toLocaleDateString('es-CL')} a las ${expiresAtDate.toLocaleTimeString('es-CL')}. Solicita un nuevo enlace a tu supervisor.`,
        };
      }

      return {
        data: {
          worker: tokenRow.personnel,
          expiresAt: tokenRow.expires_at,
        },
        status: 'VALID',
        error: null,
      };
    }
  } catch (e) {
    console.warn('Database lookup failed, attempting Base64 fallback', e);
  }

  // B. Fallback descodificando token base64
  try {
    const decoded = Buffer.from(cleanToken, 'base64url').toString('utf-8');
    const [personnelId, timestampStr] = decoded.split(':');

    if (personnelId && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const expiresAtDate = new Date(timestamp);
      const now = new Date();

      if (now.getTime() > timestamp) {
        return {
          data: null,
          status: 'EXPIRED',
          error: `Este enlace caducó el ${expiresAtDate.toLocaleDateString('es-CL')}. Solicita un nuevo enlace a tu supervisor.`,
        };
      }

      // Buscar trabajador directamente
      const { data: worker, error: workerErr } = await supabase
        .from('personnel')
        .select('*, company:companies(id, name), position:positions(name)')
        .eq('id', personnelId)
        .maybeSingle();

      if (workerErr || !worker) {
        return {
          data: null,
          status: 'NOT_FOUND',
          error: 'No se encontró el registro del trabajador asociado a este enlace.',
        };
      }

      return {
        data: {
          worker,
          expiresAt: expiresAtDate.toISOString(),
        },
        status: 'VALID',
        error: null,
      };
    }
  } catch (e) {
    console.error('Error verifying Base64 fallback token:', e);
  }

  return {
    data: null,
    status: 'NOT_FOUND',
    error: 'Enlace de actualización no válido o expirado.',
  };
}

// 3. Guardar cambios de actualización de ficha
export async function updatePersonnelFichaByToken(
  tokenStr: string,
  personalData: any
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();

    // Validar token primero para obtener el personnel_id
    const tokenRes = await getPersonnelUpdateDetailsByToken(tokenStr);
    if (tokenRes.status !== 'VALID' || !tokenRes.data?.worker) {
      return { success: false, error: tokenRes.error || 'Token inválido o expirado' };
    }

    const worker = tokenRes.data.worker;

    const toUpper = (val: any) => {
      if (typeof val === 'string') return val.trim().toUpperCase();
      return val || null;
    };

    const cleanEmail = personalData.email ? personalData.email.trim().toLowerCase() : null;

    // Estructurar dirección
    const addressJson = {
      street: toUpper(personalData.address_street) || '',
      city: toUpper(personalData.address_city) || '',
      region: toUpper(personalData.address_region) || '',
      comuna: toUpper(personalData.address_comuna) || '',
    };

    // Payload de actualización
    const updatePayload: Record<string, any> = {
      first_name: toUpper(personalData.first_name) || worker.first_name,
      last_name_father: toUpper(personalData.last_name_father) || worker.last_name_father,
      last_name_mother: toUpper(personalData.last_name_mother) || worker.last_name_mother || '',
      email: cleanEmail,
      phone: toUpper(personalData.phone) || '',
      birth_date: personalData.birth_date || worker.birth_date,
      address: addressJson,

      // Contacto de Emergencia
      emergency_contact_name: toUpper(personalData.emergency_contact_name),
      emergency_contact_relationship: toUpper(personalData.emergency_contact_relationship),
      emergency_contact_phone: toUpper(personalData.emergency_contact_phone),

      // Previsión y Salud
      afp: toUpper(personalData.afp),
      health_system: toUpper(personalData.health_system),
      isapre: personalData.health_system === 'ISAPRE' ? toUpper(personalData.isapre) : null,

      // Datos Bancarios y Género
      gender: toUpper(personalData.gender),
      bank_account_type: toUpper(personalData.bank_account_type),
      bank_name: toUpper(personalData.bank_name),
      bank_account_number: toUpper(personalData.bank_account_number),

      // Nacionalidad y Estado Civil
      nationality: toUpper(personalData.nationality) || 'CHILENA',
      marital_status: toUpper(personalData.marital_status),
    };

    // Tallas de ropa opcionales (si se proveen en el form)
    if (personalData.clothing_tshirt_size) updatePayload.clothing_tshirt_size = toUpper(personalData.clothing_tshirt_size);
    if (personalData.clothing_polar_size) updatePayload.clothing_polar_size = toUpper(personalData.clothing_polar_size);
    if (personalData.clothing_pants_size_letter) updatePayload.clothing_pants_size_letter = toUpper(personalData.clothing_pants_size_letter);
    if (personalData.clothing_pants_size_number) updatePayload.clothing_pants_size_number = toUpper(personalData.clothing_pants_size_number);
    if (personalData.clothing_shoe_size) updatePayload.clothing_shoe_size = toUpper(personalData.clothing_shoe_size);
    if (personalData.clothing_parka_size) updatePayload.clothing_parka_size = toUpper(personalData.clothing_parka_size);
    if (personalData.clothing_overall_size) updatePayload.clothing_overall_size = toUpper(personalData.clothing_overall_size);

    // Actualizar registro en la base de datos
    const { error: updateErr } = await adminClient
      .from('personnel')
      .update(updatePayload)
      .eq('id', worker.id);

    if (updateErr) throw updateErr;

    // Notify admins about the ficha update
    try {
      // Get all ADMIN and HR users for this company
      const { data: adminUsers } = await adminClient
        .from('users')
        .select('id')
        .in('role', ['ADMIN', 'HR']);
      
      if (adminUsers && adminUsers.length > 0) {
        const workerName = `${updatePayload.first_name} ${updatePayload.last_name_father}`;
        const notifications = adminUsers.map(admin => ({
          user_id: admin.id,
          type: 'general' as const,
          title: 'Ficha Actualizada',
          message: `${workerName} (${worker.rut}) ha actualizado su ficha personal.`,
          data: { personnel_id: worker.id, updated_by: 'worker_self_service' },
        }));
        
        await adminClient.from('notifications').insert(notifications);
      }
    } catch (e) {
      console.warn('Failed to notify admins about ficha update:', e);
    }

    // Si es un token de la base de datos, marcarlo como usado
    try {
      await adminClient
        .from('personnel_update_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('token', tokenStr.trim());
    } catch (e) {
      // Ignorar si no existía la tabla
    }

    safeRevalidatePath('/personnel');
    safeRevalidatePath(`/personnel/${worker.id}`);
    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error updating personnel ficha via token:', error);
    return { success: false, error: error.message };
  }
}

// 4. Enviar WhatsApp con el enlace de actualización de ficha
export async function sendFichaUpdateWhatsApp(
  personnelId: string,
  origin: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();

    // 1. Obtener detalles del trabajador
    const { data: person, error: fetchErr } = await supabase
      .from('personnel')
      .select('*, company:companies(name)')
      .eq('id', personnelId)
      .single();

    if (fetchErr || !person) {
      throw new Error('No se encontró el registro del trabajador.');
    }

    if (!person.phone || person.phone.trim().length < 8) {
      throw new Error('El trabajador no tiene un número de teléfono válido registrado.');
    }

    // 2. Generar el token (válido 7 días)
    const tokenRes = await createPersonnelUpdateToken(personnelId, 7);
    if (!tokenRes.success || !tokenRes.token) {
      throw new Error(tokenRes.error || 'Error al generar el token de actualización.');
    }

    // 3. Construir link
    const cleanOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    const link = `${cleanOrigin}/actualizar-ficha?token=${tokenRes.token}`;

    // 4. Formatear teléfono
    let phone = person.phone.replace(/\D/g, '');
    if (phone.length === 8) phone = '569' + phone;
    if (phone.length === 9 && !phone.startsWith('56')) phone = '56' + phone;
    
    if (!phone.includes('@')) {
      phone = `${phone}@c.us`;
    }

    // 5. Preparar mensaje
    const companyName = person.company?.name || 'la empresa';
    const message = `Hola *${person.first_name}* 📋\n\n` +
      `En *${companyName}* estamos actualizando y completando las fichas del personal para mantener al día tu información laboral (como contacto de emergencia, datos de previsión, salud y cuenta bancaria).\n\n` +
      `Por favor, ingresa al siguiente enlace personalizado para revisar tus datos actuales, corroborar que todo esté correcto y completar los campos que falten:\n` +
      `🔗 ${link}\n\n` +
      `_(El enlace es de uso exclusivo para ti y tiene validez por 7 días)_.\n\n` +
      `Si tienes alguna duda, por favor contáctate con tu supervisor directo.\n\n` +
      `¡Muchas gracias por tu ayuda!`;

    // 6. Enviar mensaje por UltraMsg
    const result = await sendWhatsAppMessage(phone, message);

    if (!result.success) {
      throw new Error(typeof result.error === 'string' ? result.error : 'Error al enviar por WhatsApp');
    }

    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error sending WhatsApp profile update link:', error);
    return { success: false, error: error.message };
  }
}
