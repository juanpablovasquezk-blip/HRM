'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Personnel } from '@/types/database';

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
    address: {
      street: (formData.get('address_street') as string) || '',
      city: (formData.get('address_city') as string) || '',
      region: (formData.get('address_region') as string) || '',
    },
  };

  const { error } = await supabase.from('personnel').insert(personnelData);

  if (error) return { success: false, error: error.message };

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
    address: {
      street: (formData.get('address_street') as string) || '',
      city: (formData.get('address_city') as string) || '',
      region: (formData.get('address_region') as string) || '',
    },
  };

  const { error } = await supabase
    .from('personnel')
    .update(updateData)
    .eq('id', id);

  if (error) return { success: false, error: error.message };

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
