'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function globalLogout() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Clear cookies
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  
  // Names of specific cookies to clear
  const toClear = [
    'supervisor_id', 'supervisor_email', 
    'worker_id', 'worker_email',
    'hrm_role_preference'
  ];
  
  toClear.forEach(name => {
    cookieStore.delete(name);
  });

  // Also try to clear Supabase cookies (usually start with sb-)
  allCookies.forEach(c => {
    if (c.name.startsWith('sb-')) {
      cookieStore.delete(c.name);
    }
  });

  redirect('/login');
}
