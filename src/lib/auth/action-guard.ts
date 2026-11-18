import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasPermission, type Permission } from '@/lib/auth/roles';
import type { Role } from '@/types/database';

export interface ActionAuthRequirement {
  roles?: Role[];
  permission?: keyof Permission;
}

export type ActionAuthResult =
  | {
      ok: true;
      userId: string;
      email: string | null;
      role: Role;
    }
  | {
      ok: false;
      status: 401 | 403;
      error: string;
    };

export async function evaluateActionAuth(params: {
  getSessionUser: () => Promise<{ id: string; email?: string | null } | null>;
  getAuthoritativeRole: (userId: string) => Promise<string | null>;
  requirement?: ActionAuthRequirement;
}): Promise<ActionAuthResult> {
  const user = await params.getSessionUser();
  if (!user?.id) {
    return {
      ok: false,
      status: 401,
      error: 'Usuario no autenticado.',
    };
  }

  const rawRole = await params.getAuthoritativeRole(user.id);
  const normalizedRole = (rawRole || '').toUpperCase().trim() as Role;

  if (!normalizedRole) {
    return {
      ok: false,
      status: 403,
      error: 'Usuario sin rol asignado.',
    };
  }

  const req = params.requirement;
  if (req?.roles && req.roles.length > 0) {
    if (!req.roles.includes(normalizedRole)) {
      return {
        ok: false,
        status: 403,
        error: 'No autorizado para realizar esta operación.',
      };
    }
  }

  if (req?.permission) {
    if (!hasPermission(normalizedRole, req.permission)) {
      return {
        ok: false,
        status: 403,
        error: 'No autorizado para realizar esta operación.',
      };
    }
  }

  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    role: normalizedRole,
  };
}

/**
 * Authoritative Server Action guard:
 * - Validates active Supabase Auth session via supabase.auth.getUser().
 * - Reads role strictly from public.users.role (ignoring user_metadata.role, cookies, and client inputs).
 * - Denies by default if session, user record, or permission is missing.
 */
export async function requireActionAuth(
  requirement?: ActionAuthRequirement
): Promise<ActionAuthResult> {
  const supabase = await createClient();

  return evaluateActionAuth({
    getSessionUser: async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user) return null;
      return { id: user.id, email: user.email ?? null };
    },
    getAuthoritativeRole: async (userId: string) => {
      const { data: dbUser, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (error || !dbUser?.role) return null;
      return String(dbUser.role);
    },
    requirement,
  });
}

/**
 * Resolves the authenticated user's own personnel.id (for self-service actions like requestLeave).
 * Never trusts client cookies.
 */
export async function getOwnPersonnelId(
  userId: string,
  email: string | null
): Promise<string | null> {
  const admin = createAdminClient();
  const { data: byUserId } = await admin
    .from('personnel')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (byUserId?.id) return byUserId.id;

  if (email) {
    const { data: byEmail } = await admin
      .from('personnel')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();
    if (byEmail?.id) return byEmail.id;
  }

  return null;
}
