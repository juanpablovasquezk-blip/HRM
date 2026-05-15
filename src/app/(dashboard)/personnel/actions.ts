'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Personnel } from '@/types/database';
import { createAdminClient } from '@/lib/supabase/admin';

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

export async function createPersonnel(
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const secondaryPositions = formData.get('secondary_positions') as string;
  const driverLicenses = formData.get('driver_licenses') as string;

  const personnelData = {
    company_id: formData.get('company_id') as string,
    first_name: formData.get('first_name') as string,
    last_name_father: formData.get('last_name_father') as string,
    last_name_mother: (formData.get('last_name_mother') as string) || '',
    rut: formData.get('rut') as string,
    email: (formData.get('email') as string) || null,
    birth_date: formData.get('birth_date') as string,
    phone: (formData.get('phone') as string) || '',
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
    requires_transport: formData.get('requires_transport') === 'true',
    is_active: formData.get('is_active') === 'true',
    address: {
      street: (formData.get('address_street') as string) || '',
      city: (formData.get('address_city') as string) || '',
      region: (formData.get('address_region') as string) || '',
    },
  };

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

  revalidatePath('/personnel');
  return { success: true, error: null };
}

export async function updatePersonnel(
  id: string,
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const secondaryPositions = formData.get('secondary_positions') as string;
  const driverLicenses = formData.get('driver_licenses') as string;

  const updateData = {
    first_name: formData.get('first_name') as string,
    last_name_father: formData.get('last_name_father') as string,
    last_name_mother: (formData.get('last_name_mother') as string) || '',
    rut: formData.get('rut') as string,
    email: (formData.get('email') as string) || null,
    birth_date: formData.get('birth_date') as string,
    phone: (formData.get('phone') as string) || '',
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
    requires_transport: formData.get('requires_transport') === 'true',
    is_active: formData.get('is_active') === 'true',
    address: {
      street: (formData.get('address_street') as string) || '',
      city: (formData.get('address_city') as string) || '',
      region: (formData.get('address_region') as string) || '',
    },
  };

  // Check previous state for user ban logic
  const { data: previousPerson } = await supabase.from('personnel').select('user_id, is_active').eq('id', id).single();

  const { error } = await supabase
    .from('personnel')
    .update(updateData)
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  const adminClient = createAdminClient();

  // Handle banning/unbanning user if active status changed
  if (previousPerson?.user_id && previousPerson.is_active !== updateData.is_active) {
    try {
      if (!updateData.is_active) {
        // Ban user for 10 years
        await adminClient.auth.admin.updateUserById(previousPerson.user_id, { ban_duration: '87600h' });
      } else {
        // Lift the ban
        await adminClient.auth.admin.updateUserById(previousPerson.user_id, { ban_duration: 'none' });
      }
    } catch (banError) {
      console.error('Error updating ban status:', banError);
    }
  }

  // Handle system access if requested and not already enabled
  const enableRequested = formData.get('enable_access') === 'true';
  if (enableRequested && updateData.email) {
    // Check if user already linked
    const { data: existing } = await supabase.from('personnel').select('user_id').eq('id', id).single();
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
  }

  revalidatePath('/personnel');
  revalidatePath(`/personnel/${id}`);
  return { success: true, error: null };
}

export async function deletePersonnel(
  id: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  // Soft delete — mark as inactive
  const { error } = await supabase
    .from('personnel')
    .update({ is_active: false })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  // 1. Get user_id if exists
  const { data: person } = await supabase.from('personnel').select('user_id').eq('id', id).single();
  
  if (person?.user_id) {
    try {
      const adminClient = createAdminClient();
      await adminClient.auth.admin.updateUserById(person.user_id, { ban_duration: '87600h' });
    } catch (err) {
      console.error('Error banning user during deletion:', err);
    }
  }

  revalidatePath('/personnel');
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

  revalidatePath('/personnel');
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

  revalidatePath('/personnel');
  // We don't have the personnel ID here easily to revalidate specific path, 
  // but revalidatePath with a layout or the whole folder works.
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

    revalidatePath('/personnel');
    revalidatePath(`/personnel/${personnelId}`);
    return { success: true, error: null };
  } catch (error: any) {
    console.error('Error enabling access:', error);
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
