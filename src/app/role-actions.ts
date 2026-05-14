'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function getUserRole() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminSupabase = createAdminClient();
  
  if (!user) {
    // Fallback for workers logged in via cookies
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    let userId = cookieStore.get('worker_id')?.value;

    if (!userId) {
      const { data: { user } } = await adminSupabase.auth.getUser();
      if (user?.email) {
        const { data: personnel } = await adminSupabase.from('personnel').select('id').eq('email', user.email.trim().toLowerCase()).single();
        if (personnel) userId = personnel.id;
      }
    }
    
    if (userId) {
      const { data: p } = await adminSupabase
        .from('personnel')
        .select('main_position')
        .eq('id', userId)
        .single();
      
      const posId = p?.main_position;
      const ASSISTANT_UUID = '62575116-4546-44a7-bb06-d0e3a8ad4df9';
      const SUPERVISOR_UUID = '17153543-abd7-43d1-9d0d-93b2353967d0';

      if (posId === ASSISTANT_UUID) return 'ASSISTANT';
      if (posId === SUPERVISOR_UUID) return 'SUPERVISOR';

      // Fallback: check names
      const { data: posData } = await adminSupabase.from('positions').select('name').eq('id', posId).single();
      const posName = (posData?.name || '').toUpperCase();
      if (posName.includes('ASISTENTE') || posName.includes('ASSISTANT')) return 'ASSISTANT';
      if (posName.includes('SUPERVISOR')) return 'SUPERVISOR';
    }
    return 'USER';
  }

  let { data: dbUser } = await adminSupabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  // Fallback to email if ID match fails
  if (!dbUser && user.email) {
    const { data: emailUser } = await adminSupabase
      .from('users')
      .select('role')
      .eq('email', user.email)
      .single();
    dbUser = emailUser;
  }

  let finalRole = dbUser?.role || user.user_metadata?.role || 'USER';
  
  // Emergency override for Marcela (Management access)
  if (user.email?.toUpperCase().includes('MARCELA')) {
    finalRole = 'AIRPORT_ASSISTANT';
  }

  return finalRole;
}

export async function syncUserMetadata() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return { success: false };

  const adminSupabase = createAdminClient();
  let { data: dbUser } = await adminSupabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!dbUser && user.email) {
    const { data: emailUser } = await adminSupabase.from('users').select('role').eq('email', user.email).single();
    dbUser = emailUser;
  }

  if (dbUser?.role) {
    const { error } = await adminSupabase.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, role: dbUser.role }
    });
    if (error) console.error('Error syncing metadata:', error);
    return { success: !error };
  }

  return { success: true };
}
