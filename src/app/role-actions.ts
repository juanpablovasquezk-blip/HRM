'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function getUserRole() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return null;

  const adminSupabase = createAdminClient();
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
