'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function globalLogout() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Clear cookies
  const cookieStore = await cookies();
  
  // Get all cookies and delete any that look like Supabase or session cookies
  const allCookies = cookieStore.getAll();

  // Also try to clear Supabase cookies (usually start with sb-)
  allCookies.forEach(c => {
    if (c.name.startsWith('sb-')) {
      cookieStore.delete(c.name);
    }
  });

  redirect('/login');
}
