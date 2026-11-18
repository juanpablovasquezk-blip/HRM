'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function getUserRole() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

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

  const metaRole = (user.user_metadata?.role || '').toUpperCase().trim();
  const dbRole = (dbUser?.role || '').toUpperCase().trim();
  let finalRole = (metaRole && metaRole !== 'USER' ? metaRole : dbRole || metaRole || 'USER');
  
  if (finalRole === 'ASSISTANT') {
    finalRole = 'AIRPORT_ASSISTANT';
  }

  // Emergency override for Marcela (Management access)
  if (user.email?.toUpperCase().includes('MARCELA') && finalRole !== 'ADMIN' && finalRole !== 'HR') {
    finalRole = 'AIRPORT_ASSISTANT';
  }

  console.log(`[AUTH] getUserRole for ${user.email}: ${finalRole} (Metadata: ${user.user_metadata?.role}, DB: ${dbUser?.role})`);
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
