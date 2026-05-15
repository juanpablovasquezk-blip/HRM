'use server';

import { createClient } from '@/lib/supabase/server';
import { sendWhatsAppMedia, sendWhatsAppMessage } from '@/lib/ultramsg';
import { hasPermission } from '@/lib/auth/roles';
import { getUserRole } from '@/app/role-actions';

export async function sendFilteredMassMessage(
  message: string, 
  mediaUrl: string | undefined, 
  filters: { search?: string; company_id?: string; position_id?: string; status?: 'active' | 'inactive' | 'all' }
) {
  try {
    const role = await getUserRole();
    if (!hasPermission(role as any, 'managePersonnel')) {
      return { success: false, error: 'No tienes permiso para enviar comunicados masivos.' };
    }

    const supabase = await createClient();
    
    // 1. Build Query (Exact same logic as the table)
    let positionIds: string[] = [];
    if (filters.position_id) {
      const { data: posData } = await supabase
        .from('positions')
        .select('name')
        .eq('id', filters.position_id)
        .single();

      if (posData) {
        const { data: shared } = await supabase
          .from('positions')
          .select('id')
          .eq('name', posData.name);
        positionIds = shared?.map(p => p.id) || [];
      }
    }

    let query = supabase.from('personnel').select('phone, first_name, last_name_father, rut, email');

    const status = filters.status || 'active';
    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'inactive') {
      query = query.eq('is_active', false);
    }

    if (positionIds.length > 0) {
      query = query.in('main_position', positionIds);
    }
    
    if (filters.company_id) {
      query = query.eq('company_id', filters.company_id);
    }

    if (filters.search) {
      query = query.or(
        `first_name.ilike.%${filters.search}%,last_name_father.ilike.%${filters.search}%,rut.ilike.%${filters.search}%`
      );
    }
    
    const { data: personnel, error } = await query;

    if (error) throw error;
    if (!personnel || personnel.length === 0) {
      return { success: false, error: 'No se encontraron destinatarios con los filtros aplicados.' };
    }

    // Filter valid phones
    const validRecipients = personnel.filter(p => p.phone && p.phone.trim().length >= 8);
    
    if (validRecipients.length === 0) {
      return { success: false, error: 'Ninguno de los trabajadores seleccionados tiene un número de teléfono registrado.' };
    }

    let successCount = 0;
    let failCount = 0;
    let failedDetails: string[] = [];

    // Send messages in sequence to avoid rate limits
    for (const person of validRecipients) {
      let phone = person.phone!.replace(/\D/g, '');
      if (phone.length === 8) phone = '569' + phone;
      if (phone.length === 9 && !phone.startsWith('56')) phone = '56' + phone;
      
      if (!phone.includes('@')) {
        phone = `${phone}@c.us`;
      }

      const cleanRut = person.rut ? person.rut.replace(/[.-]/g, '').toUpperCase() : '';

      // We can customize the message per person
      const personalizedMessage = message
          .replace(/{nombre}/g, person.first_name)
          .replace(/{apellido}/g, person.last_name_father || '')
          .replace(/{email}/g, person.email || 'SIN_CORREO')
          .replace(/{password}/g, cleanRut);

      let result;
      if (mediaUrl && mediaUrl.trim() !== '') {
        if (personalizedMessage.length > 1000) {
          // Send media without caption to avoid WhatsApp's 1024 char limit
          result = await sendWhatsAppMedia(phone, mediaUrl.trim(), '');
          if (result.success) {
             await new Promise(resolve => setTimeout(resolve, 500));
             result = await sendWhatsAppMessage(phone, personalizedMessage);
          }
        } else {
          result = await sendWhatsAppMedia(phone, mediaUrl.trim(), personalizedMessage);
        }
      } else {
        result = await sendWhatsAppMessage(phone, personalizedMessage);
      }

      if (result.success) {
        successCount++;
      } else {
        failCount++;
        const errorMsg = typeof result.error === 'object' ? JSON.stringify(result.error) : result.error;
        failedDetails.push(`${person.first_name} ${person.last_name_father || ''}: ${errorMsg}`);
        console.error(`Failed to send to ${phone}:`, result.error);
      }
      
      // Delay to avoid hitting API rate limits
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    return { 
      success: true, 
      sent: successCount, 
      failed: failCount,
      errors: failedDetails,
      total: validRecipients.length 
    };
  } catch (error: any) {
    console.error('Mass message error:', error);
    return { success: false, error: error.message || 'Ocurrió un error inesperado al procesar el envío masivo.' };
  }
}
