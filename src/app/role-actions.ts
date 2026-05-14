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
    const workerId = cookieStore.get('worker_id')?.value;
    
    if (workerId) {
      const { data: p } = await adminSupabase
        .from('personnel')
        .select('id, main_position:positions(name)')
        .eq('id', workerId)
        .single();
      
      const posName = ((p?.main_position as any)?.name || '').toUpperCase();
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

  return dbUser?.role || user.user_metadata?.role || 'USER';
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
