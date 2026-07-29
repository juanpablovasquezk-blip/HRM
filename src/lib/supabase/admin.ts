import { createClient } from '@supabase/supabase-js';

// Admin client with service role key — bypasses RLS
// Use only in server-side code for admin operations
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('[FATAL-DB] Missing Supabase Admin credentials:', { url: !!url, key: !!key });
    throw new Error('Supabase Admin credentials are missing. Check environment variables.');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (url, options) => {
        return fetch(url, {
          ...options,
          cache: 'no-store',
        });
      },
    },
  });
}
