'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function globalLogout() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Clear legacy cookies for complete cleanup
  const cookieStore = await cookies();
  cookieStore.delete('supervisor_id');
  cookieStore.delete('supervisor_email');
  cookieStore.delete('worker_id');
  cookieStore.delete('worker_email');

  redirect('/login');
}
