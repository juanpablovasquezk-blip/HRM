'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Personnel } from '@/types/database';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/ultramsg';

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

export async function listPersonnel(
  search?: string,
  companyId?: string,
  positionId?: string,
  activeOnly: boolean = true
): Promise<{ data: Personnel[]; error: string | null }> {
  const supabase = await createClient();

  let query = supabase
    .from('personnel')
    .select('*, company:companies(name)')
    .order('last_name_father', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }
  if (companyId) {
    query = query.eq('company_id', companyId);
  }
  if (positionId) {
    // 1. Find the name of the position for this ID
    const { data: posData } = await supabase
      .from('positions')
      .select('name')
      .eq('id', positionId)
      .single();

    if (posData) {
      // 2. Find ALL position IDs that share this same name (across all areas)
      const { data: sharedPositions } = await supabase
        .from('positions')
        .select('id')
        .eq('name', posData.name);

      if (sharedPositions) {
        const ids = sharedPositions.map(p => p.id);
        query = query.in('main_position', ids);
      }
    }
  }
  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name_father.ilike.%${search}%,rut.ilike.%${search}%`
    );
  }

  const { data, error } = await query;

  if (error) return { data: [], error: error.message };
  return { data: data as Personnel[], error: null };
}

export async function getPersonnel(
  id: string
): Promise<{ data: Personnel | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('personnel')
    .select('*, company:companies(name), documents(*)')
    .eq('id', id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Personnel, error: null };
}

function toUpper(val: any): any {
  if (typeof val === 'string') return val.trim().toUpperCase();
  return val;
}

export async function createPersonnel(
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const secondaryPositions = formData.get('secondary_positions') as string;
  const driverLicenses = formData.get('driver_licenses') as string;

  const personnelData = {
    company_id: formData.get('company_id') as string,
    first_name: toUpper(formData.get('first_name')),
    last_name_father: toUpper(formData.get('last_name_father')),
    last_name_mother: toUpper(formData.get('last_name_mother')) || '',
    rut: toUpper(formData.get('rut')),
    email: (formData.get('email') as string)?.trim().toLowerCase() || null,
    birth_date: formData.get('birth_date') as string,
    phone: toUpper(formData.get('phone')) || '',
    main_position: formData.get('main_position') as string,
    secondary_positions: secondaryPositions ? secondaryPositions.split(',').map(s => s.trim()).filter(Boolean) : [],
    driver_licenses: driverLicenses ? driverLicenses.split(',').map(s => s.trim()).filter(Boolean) : [],
    prefers_night: formData.get('prefers_night') === 'true',
    avoids_night: formData.get('avoids_night') === 'true',
    fixed_shift_id: (formData.get('fixed_shift_id') as string) || null,
    rotation_pattern: (formData.get('rotation_pattern') as string) || '5x2',
    hire_date: (formData.get('hire_date') as string) || null,
    termination_date: (formData.get('termination_date') as string) || null,
    has_special_contract: formData.get('has_special_contract') === 'true',
    is_active: formData.get('is_active') === 'true',
    address: {
      street: toUpper(formData.get('address_street')) || '',
      city: toUpper(formData.get('address_city')) || '',
      region: toUpper(formData.get('address_region')) || '',
      comuna: toUpper(formData.get('address_comuna')) || '',
    },
    // Emergency Contact
    emergency_contact_name: toUpper(formData.get('emergency_contact_name')) || null,
    emergency_contact_relationship: toUpper(formData.get('emergency_contact_relationship')) || null,
    emergency_contact_phone: toUpper(formData.get('emergency_contact_phone')) || null,
    // Clothing Sizes
    clothing_tshirt_size: toUpper(formData.get('clothing_tshirt_size')) || null,
    clothing_polar_size: toUpper(formData.get('clothing_polar_size')) || null,
    clothing_pants_size_letter: toUpper(formData.get('clothing_pants_size_letter')) || null,
    clothing_pants_size_number: toUpper(formData.get('clothing_pants_size_number')) || null,
    clothing_shoe_size: toUpper(formData.get('clothing_shoe_size')) || null,
    clothing_parka_size: toUpper(formData.get('clothing_parka_size')) || null,
    clothing_overall_size: toUpper(formData.get('clothing_overall_size')) || null,
    custom_clothing_sizes: (() => {
      const custom: Record<string, string> = {};
      for (const [key, val] of formData.entries()) {
        if (key.startsWith('clothing_custom_') && typeof val === 'string' && val.trim()) {
          custom[key] = val.trim().toUpperCase();
        }
      }
      return custom;
    })(),

    // Social Security (AFP & Health)
    afp: toUpper(formData.get('afp')) || null,
    health_system: toUpper(formData.get('health_system')) || null,
    isapre: (formData.get('health_system') as string)?.toUpperCase() === 'ISAPRE' ? toUpper(formData.get('isapre')) : null,

    // Gender & Bank Details
    gender: toUpper(formData.get('gender')) || null,
    bank_account_type: toUpper(formData.get('bank_account_type')) || null,
    bank_name: toUpper(formData.get('bank_name')) || null,
    bank_account_number: toUpper(formData.get('bank_account_number')) || null,

    // Contract fields
    nationality: toUpper(formData.get('nationality')) || 'CHILENA',
    marital_status: toUpper(formData.get('marital_status')) || null,
  };



  const todayStr = new Date().toLocaleDateString('sv');
  if (personnelData.termination_date && personnelData.termination_date <= todayStr) {
    personnelData.is_active = false;
  }

  const { data: person, error: insertError } = await supabase.from('personnel').insert(personnelData).select('id').single();
  if (insertError) return { success: false, error: insertError.message };

  // Handle system access if requested
  if (formData.get('enable_access') === 'true' && personnelData.email) {
    // Determine role based on position
    let role: 'SUPERVISOR' | 'USER' = 'USER';
    if (personnelData.main_position) {
      const { data: pos } = await supabase.from('positions').select('name').eq('id', personnelData.main_position).single();
      if (pos?.name.toUpperCase().includes('SUPERVISOR')) {
        role = 'SUPERVISOR';
      }
    }
    await enablePersonnelAccess(person.id, personnelData.email, role);
  }

  safeRevalidatePath('/personnel');
  safeRevalidatePath('/shifts/daily');
  return { success: true, error: null };
}

export async function updatePersonnel(
  id: string,
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const secondaryPositions = formData.get('secondary_positions') as string;
  const driverLicenses = formData.get('driver_licenses') as string;

  const updateData: Partial<Personnel> & Record<string, any> = {
    company_id: formData.get('company_id') as string,
    first_name: toUpper(formData.get('first_name')),
    last_name_father: toUpper(formData.get('last_name_father')),
    last_name_mother: toUpper(formData.get('last_name_mother')) || '',
    rut: toUpper(formData.get('rut')),
    email: (formData.get('email') as string)?.trim().toLowerCase() || null,
    birth_date: formData.get('birth_date') as string,
    phone: toUpper(formData.get('phone')) || '',
    main_position: formData.get('main_position') as string,
    secondary_positions: secondaryPositions ? secondaryPositions.split(',').map(s => s.trim()).filter(Boolean) : [],
    driver_licenses: driverLicenses ? driverLicenses.split(',').map(s => s.trim()).filter(Boolean) : [],
    prefers_night: formData.get('prefers_night') === 'true',
    avoids_night: formData.get('avoids_night') === 'true',
    fixed_shift_id: (formData.get('fixed_shift_id') as string) || null,
    rotation_pattern: (formData.get('rotation_pattern') as string) || '5x2',
    parent_personnel_id: formData.get('parent_personnel_id') || undefined,
    hire_date: (formData.get('hire_date') as string) || null,
    termination_date: (formData.get('termination_date') as string) || null,
    has_special_contract: formData.get('has_special_contract') === 'true',
    is_active: formData.get('is_active') === 'true',
    address: {
      street: toUpper(formData.get('address_street')) || '',
      city: toUpper(formData.get('address_city')) || '',
      region: toUpper(formData.get('address_region')) || '',
      comuna: toUpper(formData.get('address_comuna')) || '',
    },
    // Emergency Contact
    emergency_contact_name: toUpper(formData.get('emergency_contact_name')) || null,
    emergency_contact_relationship: toUpper(formData.get('emergency_contact_relationship')) || null,
    emergency_contact_phone: toUpper(formData.get('emergency_contact_phone')) || null,
    // Clothing Sizes
    clothing_tshirt_size: toUpper(formData.get('clothing_tshirt_size')) || null,
    clothing_polar_size: toUpper(formData.get('clothing_polar_size')) || null,
    clothing_pants_size_letter: toUpper(formData.get('clothing_pants_size_letter')) || null,
    clothing_pants_size_number: toUpper(formData.get('clothing_pants_size_number')) || null,
    clothing_shoe_size: toUpper(formData.get('clothing_shoe_size')) || null,
    clothing_parka_size: toUpper(formData.get('clothing_parka_size')) || null,
    clothing_overall_size: toUpper(formData.get('clothing_overall_size')) || null,
    custom_clothing_sizes: (() => {
      const custom: Record<string, string> = {};
      for (const [key, val] of formData.entries()) {
        if (key.startsWith('clothing_custom_') && typeof val === 'string' && val.trim()) {
          custom[key] = val.trim().toUpperCase();
        }
      }
      return custom;
    })(),

    // Social Security (AFP & Health)
    afp: toUpper(formData.get('afp')) || null,
    health_system: toUpper(formData.get('health_system')) || null,
    isapre: (formData.get('health_system') as string)?.toUpperCase() === 'ISAPRE' ? toUpper(formData.get('isapre')) : null,

    // Gender & Bank Details
    gender: toUpper(formData.get('gender')) || null,
    bank_account_type: toUpper(formData.get('bank_account_type')) || null,
    bank_name: toUpper(formData.get('bank_name')) || null,
    bank_account_number: toUpper(formData.get('bank_account_number')) || null,

    // Contract fields
    nationality: toUpper(formData.get('nationality')) || 'CHILENA',
    marital_status: toUpper(formData.get('marital_status')) || null,
  };



  const todayStr = new Date().toLocaleDateString('sv');
  if (updateData.termination_date && updateData.termination_date <= todayStr) {
    updateData.is_active = false;
  }


  // Check previous state for user revocation logic
  const { data: previousPerson } = await supabase.from('personnel').select('user_id, is_active').eq('id', id).single();

  const wasActive = previousPerson?.is_active ?? true;
  const isNowActive = updateData.is_active;

  if (wasActive && !isNowActive) {
    // Transitioning from active to inactive (dar de baja)
    updateData.inactive_reason = (formData.get('inactive_reason') as string) || null;
  } else if (!wasActive && isNowActive) {
    // Transitioning from inactive to active: clear reasons
    updateData.inactive_reason = null;
    updateData.rejection_reason = null;
  }

  const shouldRevoke = previousPerson?.user_id && previousPerson.is_active !== updateData.is_active && !updateData.is_active;
  const updatePayload = shouldRevoke ? { ...updateData, user_id: null } : updateData;

  // Use adminClient for the update to bypass RLS on is_active column
  let updateError: any = null;
  try {
    const adminForUpdate = createAdminClient();
    const { error } = await adminForUpdate
      .from('personnel')
      .update(updatePayload)
      .eq('id', id);
    updateError = error;
  } catch (adminErr) {
    // Fallback to regular client if admin client unavailable
    console.warn('[updatePersonnel] Admin client unavailable, falling back to regular client:', adminErr);
    const { error } = await supabase
      .from('personnel')
      .update(updatePayload)
      .eq('id', id);
    updateError = error;
  }

  if (updateError) return { success: false, error: updateError.message };

  // If transitioning to inactive, delete documents to free up space
  if (wasActive && !isNowActive) {
    try {
      const adminClient = createAdminClient();
      await deletePersonnelDocumentsAndLetters(id, adminClient);
    } catch (cleanErr) {
      console.error('Error during automatic document deletion for inactive personnel:', cleanErr);
    }
  }

  // Handle deleting/revoking user account if deactivated
  if (shouldRevoke && previousPerson?.user_id) {
    try {
      const userId = previousPerson.user_id;
      // Delete from custom 'users' table
      await supabase.from('users').delete().eq('id', userId);

      // Delete from Supabase Auth
      const adminClient = createAdminClient();
      await adminClient.auth.admin.deleteUser(userId);
    } catch (revokeError) {
      console.error('Error revoking user auth on deactivation:', revokeError);
    }
  }

  // Handle system access
  const enableRequested = formData.get('enable_access') === 'true';
  const { data: existing } = await supabase.from('personnel').select('user_id').eq('id', id).single();
  
  if (enableRequested && updateData.email) {
    if (!existing?.user_id) {
      let role: 'SUPERVISOR' | 'USER' = 'USER';
      if (updateData.main_position) {
        const { data: pos } = await supabase.from('positions').select('name').eq('id', updateData.main_position).single();
        if (pos?.name.toUpperCase().includes('SUPERVISOR')) {
          role = 'SUPERVISOR';
        }
      }
      await enablePersonnelAccess(id, updateData.email, role);
    }
  } else if (!enableRequested && existing?.user_id) {
    // If access was previously enabled but now requested to be disabled, revoke access!
    await disablePersonnelAccess(id);
  }

  // Clean up shift assignments and transport requests if deactivated or terminated
  if (!updateData.is_active || updateData.termination_date) {
    try {
      const adminClient = createAdminClient();
      let shiftQuery = adminClient.from('shift_assignments').update({ status: 'cancelled' }).eq('personnel_id', id);
      let transportQuery = adminClient.from('transport_requests').delete().eq('personnel_id', id);

      if (updateData.termination_date) {
        // Terminated: cancel starting strictly after termination date
        shiftQuery = shiftQuery.gt('date', updateData.termination_date);
        transportQuery = transportQuery.gt('date', updateData.termination_date);
      } else if (!updateData.is_active) {
        // Deactivated: cancel starting from today (local time YYYY-MM-DD)
        const todayStr = new Date().toLocaleDateString('sv');
        shiftQuery = shiftQuery.gte('date', todayStr);
        transportQuery = transportQuery.gte('date', todayStr);
      }

      await Promise.all([shiftQuery, transportQuery]);
    } catch (cleanError) {
      console.error('[PERSONNEL-UPDATE] Error cleaning up assignments/transport:', cleanError);
    }
  }

  safeRevalidatePath('/personnel');
  safeRevalidatePath(`/personnel/${id}`);
  safeRevalidatePath('/shifts/assignments');
  safeRevalidatePath('/shifts/roster');
  safeRevalidatePath('/shifts/daily');
  safeRevalidatePath('/dashboard');
  return { success: true, error: null };
}

export async function deletePersonnel(
  id: string,
  reason?: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  // Soft delete — mark as inactive
  const { error } = await adminClient
    .from('personnel')
    .update({ 
      is_active: false,
      inactive_reason: reason || null
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  // Clean up future shift assignments and transport requests starting from today
  try {
    const todayStr = new Date().toLocaleDateString('sv');
    await Promise.all([
      adminClient.from('shift_assignments').update({ status: 'cancelled' }).eq('personnel_id', id).gte('date', todayStr),
      adminClient.from('transport_requests').delete().eq('personnel_id', id).gte('date', todayStr)
    ]);
  } catch (cleanError) {
    console.error('[PERSONNEL-DELETE] Error cleaning up assignments/transport:', cleanError);
  }

  // 1. Get user_id if exists
  const { data: person } = await supabase.from('personnel').select('user_id').eq('id', id).single();
  
  if (person?.user_id) {
    try {
      await adminClient.auth.admin.updateUserById(person.user_id, { ban_duration: '87600h' });
    } catch (err) {
      console.error('Error banning user during deletion:', err);
    }
  }

  // Clean up uploaded documents and warning letters to free up space
  await deletePersonnelDocumentsAndLetters(id, adminClient);

  safeRevalidatePath('/personnel');
  safeRevalidatePath('/shifts/assignments');
  safeRevalidatePath('/shifts/roster');
  safeRevalidatePath('/shifts/daily');
  safeRevalidatePath('/dashboard');
  return { success: true, error: null };
}

export async function bulkImportPersonnel(
  rawData: any[]
): Promise<{ imported: number; error: string | null }> {
  const supabase = await createClient();

  // 1. Fetch lookup maps
  const [{ data: companies }, { data: positions }] = await Promise.all([
    supabase.from('companies').select('id, name'),
    supabase.from('positions').select('id, name'),
  ]);

  const companyMap = Object.fromEntries(companies?.map(c => [c.name.toLowerCase().trim(), c.id]) || []);
  const positionMap = Object.fromEntries(positions?.map(p => [p.name.toLowerCase().trim(), p.id]) || []);

  // 2. Map and Validate
  const personnelToInsert = rawData.map((row, index) => {
    const compName = (row.empresa || '').toLowerCase().trim();
    const posName = (row.cargo_principal || '').toLowerCase().trim();
    
    const companyId = companyMap[compName];
    const positionId = posName ? positionMap[posName] : null;

    if (!companyId) throw new Error(`Fila ${index + 2}: Empresa '${row.empresa}' no encontrada. Crea la empresa primero.`);
    if (posName && !positionId) throw new Error(`Fila ${index + 2}: Cargo '${row.cargo_principal}' no encontrado. Crea el cargo primero.`);

    return {
      company_id: companyId,
      first_name: row.nombre,
      last_name_father: row.apellido_paterno,
      last_name_mother: row.apellido_materno || '',
      rut: row.rut,
      email: row.email || null,
      birth_date: row.fecha_nacimiento, // Espera YYYY-MM-DD
      phone: row.telefono || '',
      main_position: positionId,
      is_active: true
    };
  });

  // 3. Upsert (Insert or Update on Conflict RUT)
  const { error } = await supabase
    .from('personnel')
    .upsert(personnelToInsert, { onConflict: 'rut' });

  if (error) return { imported: 0, error: error.message };

  safeRevalidatePath('/personnel');
  return { imported: personnelToInsert.length, error: null };
}

export async function updateDocumentStatus(
  documentId: string,
  status: 'APPROVED' | 'REJECTED' | 'PENDING',
  rejectionReason?: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('documents')
    .update({ 
      status, 
      rejection_reason: rejectionReason || null,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', documentId);

  if (error) return { success: false, error: error.message };

  safeRevalidatePath('/personnel');

  if (status === 'REJECTED') {
    try {
      // 1. Fetch document info
      const { data: docData, error: docFetchError } = await supabase
        .from('documents')
        .select('type, definition_id, personnel_id')
        .eq('id', documentId)
        .single();

      if (!docFetchError && docData) {
        // 2. Fetch definition name if available
        let docName = docData.type || 'Documento';
        if (docData.definition_id) {
          const { data: defData } = await supabase
            .from('document_definitions')
            .select('name')
            .eq('id', docData.definition_id)
            .single();
          if (defData?.name) {
            docName = defData.name;
          }
        }

        // 3. Fetch personnel info (with emergency contact to make sure we load what's needed, but phone is the goal)
        const { data: workerData } = await supabase
          .from('personnel')
          .select('first_name, phone')
          .eq('id', docData.personnel_id)
          .single();

        if (workerData && workerData.phone) {
          const cleanPhone = workerData.phone.replace(/\D/g, '');
          if (cleanPhone.length >= 8) {
            let formattedPhone = cleanPhone;
            if (formattedPhone.length === 8) formattedPhone = '569' + formattedPhone;
            if (formattedPhone.length === 9 && !formattedPhone.startsWith('56')) formattedPhone = '56' + formattedPhone;
            
            if (!formattedPhone.includes('@')) {
              formattedPhone = `${formattedPhone}@c.us`;
            }

            const platformUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hrm-roster-manager.vercel.app';
            
            const message = `Hola *${workerData.first_name || 'Trabajador'}* ⚠️\n\n` +
              `Te informamos que tu documento *${docName}* ha sido rechazado.\n\n` +
              `*Motivo del rechazo:*\n${rejectionReason || 'No especificado'}\n\n` +
              `Por favor, ingresa a la plataforma para volver a subir el documento corregido:\n` +
              `🔗 ${platformUrl}/worker/documents\n\n` +
              `¡Muchas gracias!`;

            const whatsAppResult = await sendWhatsAppMessage(formattedPhone, message);
            if (!whatsAppResult.success) {
              console.error('Error sending WhatsApp rejection message:', whatsAppResult.error);
            }
          }
        }
      }
    } catch (whatsAppErr) {
      console.error('WhatsApp notification error on document rejection:', whatsAppErr);
    }
  }

  return { success: true, error: null };
}

export async function enablePersonnelAccess(
  personnelId: string,
  email: string,
  role: 'SUPERVISOR' | 'USER'
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  try {
    // 1. Get personnel info for the password (RUT)
    const { data: person, error: fetchError } = await supabase
      .from('personnel')
      .select('rut, first_name, last_name_father')
      .eq('id', personnelId)
      .single();

    if (fetchError || !person) throw new Error('No se encontró la ficha del trabajador');

    const cleanRut = person.rut.replace(/[.-]/g, '').toUpperCase();
    const fullName = `${person.first_name} ${person.last_name_father}`;

    // 2. Create user in Supabase Auth
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password: cleanRut,
      email_confirm: true,
      user_metadata: { 
        full_name: fullName,
        role: role
      }
    });

    if (authError) throw new Error(`Error Auth: ${authError.message}`);
    if (!authUser.user) throw new Error('No se pudo crear el usuario en Auth');

    const userId = authUser.user.id;

    // 3. Link to Personnel record
    const { error: linkError } = await supabase
      .from('personnel')
      .update({ user_id: userId, email })
      .eq('id', personnelId);

    if (linkError) throw new Error(`Error vinculación: ${linkError.message}`);

    // 4. Create record in custom 'users' table
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        full_name: fullName,
        role: role,
        created_at: new Date().toISOString()
      });

    if (profileError) {
      console.warn('Warning: Profile record not created, but Auth user exists:', profileError.message);
    }

    safeRevalidatePath('/personnel');
    safeRevalidatePath(`/personnel/${personnelId}`);
    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error enabling access:', error);
    return { success: false, error: error.message };
  }
}

export async function disablePersonnelAccess(
  personnelId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  try {
    // 1. Get personnel record to find the user_id
    const { data: person, error: fetchError } = await supabase
      .from('personnel')
      .select('user_id')
      .eq('id', personnelId)
      .single();

    if (fetchError || !person) throw new Error('No se encontró la ficha del trabajador');
    if (!person.user_id) return { success: true, error: null }; // Already no access

    const userId = person.user_id;

    // 2. Unlink from Personnel record (set user_id to null)
    const { error: unlinkError } = await supabase
      .from('personnel')
      .update({ user_id: null })
      .eq('id', personnelId);

    if (unlinkError) throw new Error(`Error desvinculación: ${unlinkError.message}`);

    // 3. Delete from custom 'users' table
    await supabase.from('users').delete().eq('id', userId);

    // 4. Delete from Supabase Auth
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.warn('Warning: Auth user not deleted, but unlinked in database:', authDeleteError.message);
    }

    safeRevalidatePath('/personnel');
    safeRevalidatePath(`/personnel/${personnelId}`);
    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error disabling access:', error);
    return { success: false, error: error.message };
  }
}


export async function resetPasswordToRut(
  personnelId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  try {
    const { data: person, error: fetchError } = await supabase
      .from('personnel')
      .select('rut, email, user_id')
      .eq('id', personnelId)
      .single();

    if (fetchError || !person) throw new Error('No se encontró la ficha del trabajador');
    if (!person.user_id) throw new Error('El trabajador no tiene acceso al sistema activado');

    const cleanRut = person.rut.replace(/[.-]/g, '').toUpperCase();

    const { error: authError } = await adminClient.auth.admin.updateUserById(
      person.user_id,
      { password: cleanRut }
    );

    if (authError) throw new Error(`Error Auth: ${authError.message}`);

    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error resetting password:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteDocumentAction(
  id: string
): Promise<{ success: boolean; error: string | null }> {
  const adminClient = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch record first to get file URL and personnel_id for revalidation
  const { data: doc } = await adminClient
    .from('documents')
    .select('id, file_url, personnel_id')
    .eq('id', id)
    .single();

  // Remove storage file
  if (doc?.file_url) {
    const marker = '/documents/';
    const idx = doc.file_url.lastIndexOf(marker);
    if (idx !== -1) {
      const storagePath = doc.file_url.substring(idx + marker.length);
      await adminClient.storage.from('documents').remove([storagePath]);
    }
  }

  const { error } = await adminClient.from('documents').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  safeRevalidatePath('/documents');
  if (doc?.personnel_id) safeRevalidatePath(`/personnel/${doc.personnel_id}`);
  return { success: true, error: null };
}

// Generar token de invitación
export async function createOnboardingToken(
  companyId: string
): Promise<{ success: boolean; token: string | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expiración en 7 días

    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('onboarding_tokens')
      .insert({
        company_id: companyId,
        expires_at: expiresAt.toISOString(),
        created_by: user?.id || null
      })
      .select('token')
      .single();

    if (error) throw error;
    return { success: true, token: data.token, error: null };
  } catch (error: any) {
    console.error('Error creating onboarding token:', error);
    return { success: false, token: null, error: error.message };
  }
}

// Listar postulaciones pendientes
export async function listPendingOnboarding(
  companyId?: string
): Promise<{ data: Personnel[]; error: string | null }> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from('personnel')
      .select('*')
      .eq('onboarding_status', 'pending');

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error: any) {
    console.error('Error listing pending onboarding:', error);
    return { data: [], error: error.message };
  }
}

// Aprobar postulación asignando cargo y rotación
export async function approveOnboarding(
  personnelId: string,
  mainPositionId: string,
  rotationPattern: string,
  fixedShiftId?: string | null,
  enableAccess?: boolean
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    // 1. Fetch postulation details
    const { data: personnel, error: fetchErr } = await supabase
      .from('personnel')
      .select('*')
      .eq('id', personnelId)
      .single();

    if (fetchErr || !personnel) throw new Error('No se encontró la ficha de postulación');

    // 2. Update status and configure roster fields
    const { error: updateErr } = await admin
      .from('personnel')
      .update({
        onboarding_status: 'approved',
        is_active: true,
        main_position: mainPositionId,
        rotation_pattern: rotationPattern,
        fixed_shift_id: fixedShiftId || null,
        hire_date: new Date().toISOString().split('T')[0], // Set hire date to today
        rejection_reason: null,
        inactive_reason: null
      })
      .eq('id', personnelId);

    if (updateErr) throw updateErr;

    // 3. Create system access if email is present and requested
    if (enableAccess && personnel.email) {
      let role: 'SUPERVISOR' | 'USER' = 'USER';
      const { data: pos } = await supabase
        .from('positions')
        .select('name')
        .eq('id', mainPositionId)
        .single();
      
      if (pos?.name.toUpperCase().includes('SUPERVISOR')) {
        role = 'SUPERVISOR';
      }
      
      await enablePersonnelAccess(personnelId, personnel.email, role);
    }

    safeRevalidatePath('/personnel');
    safeRevalidatePath('/dashboard');
    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error approving onboarding:', error);
    return { success: false, error: error.message };
  }
}

// Helper to delete all documents and letters of a worker to free up space
async function deletePersonnelDocumentsAndLetters(
  personnelId: string,
  adminClient: any
): Promise<void> {
  try {
    // 1. Delete files from storage and rows from 'documents' table
    const { data: docs } = await adminClient
      .from('documents')
      .select('file_url')
      .eq('personnel_id', personnelId);

    if (docs && docs.length > 0) {
      const paths = docs
        .map((d: any) => {
          if (!d.file_url) return null;
          const marker = '/documents/';
          const idx = d.file_url.lastIndexOf(marker);
          return idx !== -1 ? d.file_url.substring(idx + marker.length) : null;
        })
        .filter(Boolean) as string[];

      if (paths.length > 0) {
        await adminClient.storage.from('documents').remove(paths);
      }
    }
    await adminClient.from('documents').delete().eq('personnel_id', personnelId);

    // 2. Delete files from storage and rows from 'personnel_letters' table
    const { data: letters } = await adminClient
      .from('personnel_letters')
      .select('file_url')
      .eq('personnel_id', personnelId);

    if (letters && letters.length > 0) {
      const paths = letters
        .map((l: any) => {
          if (!l.file_url) return null;
          const marker = '/documents/';
          const idx = l.file_url.lastIndexOf(marker);
          return idx !== -1 ? l.file_url.substring(idx + marker.length) : null;
        })
        .filter(Boolean) as string[];

      if (paths.length > 0) {
        await adminClient.storage.from('documents').remove(paths);
      }
    }
    await adminClient.from('personnel_letters').delete().eq('personnel_id', personnelId);

    console.log(`[CLEANUP] Successfully deleted documents and letters for personnel ${personnelId}`);
  } catch (err) {
    console.error(`[CLEANUP] Error in deletePersonnelDocumentsAndLetters for ${personnelId}:`, err);
  }
}

// Rechazar postulación
export async function rejectOnboarding(
  personnelId: string,
  reason: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from('personnel')
      .update({
        onboarding_status: 'rejected',
        is_active: false,
        rejection_reason: reason
      })
      .eq('id', personnelId);

    if (error) throw error;

    // Clean up uploaded documents to free up space
    await deletePersonnelDocumentsAndLetters(personnelId, admin);

    safeRevalidatePath('/personnel');
    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error rejecting onboarding:', error);
    return { success: false, error: error.message };
  }
}
