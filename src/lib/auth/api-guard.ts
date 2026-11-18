import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Role } from '@/types/database';

export function isRoleAuthorized(
  role: string | null | undefined,
  allowedRoles?: Role[]
): boolean {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (!role) return false;
  return allowedRoles.includes(role.toUpperCase().trim() as Role);
}

export async function evaluateApiAuth(params: {
  getSessionUser: () => Promise<{ id: string } | null>;
  getAuthoritativeRole: (userId: string) => Promise<string | null>;
  allowedRoles?: Role[];
}): Promise<
  | { ok: true; userId: string; role: string }
  | { ok: false; response: NextResponse }
> {
  const user = await params.getSessionUser();
  if (!user?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'No autenticado.' },
        { status: 401 }
      ),
    };
  }

  const role = await params.getAuthoritativeRole(user.id);
  if (!isRoleAuthorized(role, params.allowedRoles)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'No autorizado para ejecutar esta operación.' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: user.id, role: (role || '').toUpperCase().trim() };
}

/**
 * Authoritative API route guard:
 * 1. Validates active Supabase Auth session via supabase.auth.getUser().
 * 2. Reads role strictly from public.users.role (ignoring user_metadata.role, cookies, and client inputs).
 */
export async function requireApiAuth(allowedRoles?: Role[]): Promise<
  | { ok: true; userId: string; role: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();

  return evaluateApiAuth({
    getSessionUser: async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user) return null;
      return { id: user.id };
    },
    getAuthoritativeRole: async (userId: string) => {
      // RLS on public.users ("Users can read own record": auth.uid() = id) allows this query
      // using the caller's verified JWT without trusting user_metadata or client cookies.
      const { data: dbUser, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (error || !dbUser?.role) return null;
      return String(dbUser.role).toUpperCase().trim();
    },
    allowedRoles,
  });
}
