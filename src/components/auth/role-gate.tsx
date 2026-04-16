'use client';

import { type Role } from '@/types/database';
import { hasPermission, type Permission, canAccess } from '@/lib/auth/roles';
import { useUser } from '@/hooks/use-user';

interface RoleGateProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
  requiredPermission?: keyof Permission;
  minRole?: Role;
  fallback?: React.ReactNode;
}

export function RoleGate({
  children,
  allowedRoles,
  requiredPermission,
  minRole,
  fallback = null,
}: RoleGateProps) {
  const { role, loading } = useUser();

  if (loading) return null;
  if (!role) return <>{fallback}</>;

  // Check by allowed roles list
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <>{fallback}</>;
  }

  // Check by required permission
  if (requiredPermission && !hasPermission(role, requiredPermission)) {
    return <>{fallback}</>;
  }

  // Check by minimum role level
  if (minRole && !canAccess(role, minRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
