'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRole } from '@/app/role-actions';
import { Role } from '@/types/database';

export interface SystemUserItem {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  created_at: string;
  is_worker: boolean;
  worker_id?: string;
  worker_rut?: string;
}

export async function getSystemUsers(): Promise<{ success: boolean; data?: SystemUserItem[]; error?: string }> {
  try {
    const role = await getUserRole();
    if (role !== 'ADMIN' && role !== 'HR') {
      return { success: false, error: 'No tiene permisos para gestionar usuarios.' };
    }

    const adminClient = createAdminClient();

    // 1. Fetch users from public.users
    const { data: users, error: usersError } = await adminClient
      .from('users')
      .select('id, email, full_name, role, created_at')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return { success: false, error: usersError.message };
    }

    // 2. Fetch linked personnel records
    const { data: personnelList } = await adminClient
      .from('personnel')
      .select('id, user_id, rut')
      .not('user_id', 'is', null);

    const workerMap = new Map<string, { id: string; rut: string }>();
    if (personnelList) {
      personnelList.forEach((p) => {
        if (p.user_id) {
          workerMap.set(p.user_id, { id: p.id, rut: p.rut });
        }
      });
    }

    const items: SystemUserItem[] = (users || []).map((u) => {
      const worker = workerMap.get(u.id);
      return {
        id: u.id,
        email: u.email,
        full_name: u.full_name || 'Sin Nombre',
        role: (u.role as Role) || 'USER',
        created_at: u.created_at,
        is_worker: !!worker,
        worker_id: worker?.id,
        worker_rut: worker?.rut,
      };
    });

    return { success: true, data: items };
  } catch (err: any) {
    console.error('Error in getSystemUsers:', err);
    return { success: false, error: err.message || 'Error de servidor' };
  }
}

export async function createSystemUser(data: {
  full_name: string;
  email: string;
  password: string;
  role: Role;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const currentRole = await getUserRole();
    if (currentRole !== 'ADMIN' && currentRole !== 'HR') {
      return { success: false, error: 'No tiene permisos para crear usuarios.' };
    }

    const cleanEmail = data.email.trim().toLowerCase();
    const cleanName = (data.full_name || '').trim();

    if (!cleanEmail || !data.password || !cleanName) {
      return { success: false, error: 'Todos los campos son obligatorios.' };
    }

    if (data.password.length < 6) {
      return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    const adminClient = createAdminClient();

    // 1. Create user in Supabase Auth
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email: cleanEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: cleanName,
        role: data.role,
      },
    });

    if (authError) {
      return { success: false, error: `Error Auth: ${authError.message}` };
    }

    if (!authUser.user) {
      return { success: false, error: 'No se pudo crear el usuario en Auth.' };
    }

    const userId = authUser.user.id;

    // 2. Insert into public.users table if trigger didn't handle it
    const { data: existingUser } = await adminClient
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!existingUser) {
      const { error: insertError } = await adminClient.from('users').insert({
        id: userId,
        email: cleanEmail,
        full_name: cleanName,
        role: data.role,
        created_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error('Error inserting into public.users:', insertError);
        return { success: false, error: `Error al crear perfil de usuario: ${insertError.message}` };
      }
    } else {
      // Ensure role & name match
      await adminClient
        .from('users')
        .update({ role: data.role, full_name: cleanName })
        .eq('id', userId);
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error in createSystemUser:', err);
    return { success: false, error: err.message || 'Error inesperado al crear usuario.' };
  }
}

export async function updateSystemUserRole(
  userId: string,
  newRole: Role
): Promise<{ success: boolean; error?: string }> {
  try {
    const currentRole = await getUserRole();
    if (currentRole !== 'ADMIN' && currentRole !== 'HR') {
      return { success: false, error: 'No tiene permisos para modificar roles.' };
    }

    const adminClient = createAdminClient();

    // 1. Update in public.users
    const { error: dbError } = await adminClient
      .from('users')
      .update({ role: newRole })
      .eq('id', userId);

    if (dbError) {
      return { success: false, error: dbError.message };
    }

    // 2. Update metadata in Auth
    await adminClient.auth.admin.updateUserById(userId, {
      user_metadata: { role: newRole },
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error in updateSystemUserRole:', err);
    return { success: false, error: err.message || 'Error al actualizar rol.' };
  }
}
