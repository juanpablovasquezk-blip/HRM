import { type Role } from '@/types/database';

// ---------------------------------------------------------------------------
// Permission definitions
// ---------------------------------------------------------------------------

export const ROLE_HIERARCHY: Record<Role, number> = {
  ADMIN: 4,
  HR: 3,
  SUPERVISOR: 2,
  USER: 1,
};

export interface Permission {
  managePersonnel: boolean;
  manageDocuments: boolean;
  manageShifts: boolean;
  manageLeaves: boolean;
  approveLeaves: boolean;
  viewReports: boolean;
  manageTransport: boolean;
  overrideFreeze: boolean;
  manageUsers: boolean;
  manageAreas: boolean;
  runScheduler: boolean;
}

const ROLE_PERMISSIONS: Record<Role, Permission> = {
  ADMIN: {
    managePersonnel: true,
    manageDocuments: true,
    manageShifts: true,
    manageLeaves: true,
    approveLeaves: true,
    viewReports: true,
    manageTransport: true,
    overrideFreeze: true,
    manageUsers: true,
    manageAreas: true,
    runScheduler: true,
  },
  HR: {
    managePersonnel: true,
    manageDocuments: true,
    manageShifts: true,
    manageLeaves: true,
    approveLeaves: true,
    viewReports: true,
    manageTransport: false,
    overrideFreeze: false,
    manageUsers: false,
    manageAreas: true,
    runScheduler: true,
  },
  SUPERVISOR: {
    managePersonnel: false,
    manageDocuments: false,
    manageShifts: true,
    manageLeaves: false,
    approveLeaves: true,
    viewReports: true,
    manageTransport: true,
    overrideFreeze: true,
    manageUsers: false,
    manageAreas: false,
    runScheduler: false,
  },
  USER: {
    managePersonnel: false,
    manageDocuments: false,
    manageShifts: false,
    manageLeaves: false,
    approveLeaves: false,
    viewReports: false,
    manageTransport: false,
    overrideFreeze: false,
    manageUsers: false,
    manageAreas: false,
    runScheduler: false,
  },
};

// ---------------------------------------------------------------------------
// Guard utilities
// ---------------------------------------------------------------------------

export function getPermissions(role: Role): Permission {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role, permission: keyof Permission): boolean {
  return ROLE_PERMISSIONS[role][permission];
}

export function canAccess(role: Role, minRole: Role): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minRole];
}

export function canOverrideFreeze(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPERVISOR';
}

export function getRoleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    ADMIN: 'Administrator',
    HR: 'Human Resources',
    SUPERVISOR: 'Supervisor',
    USER: 'Employee',
  };
  return labels[role];
}

export function getRoleBadgeColor(role: Role): string {
  const colors: Record<Role, string> = {
    ADMIN: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    HR: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    SUPERVISOR: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    USER: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  };
  return colors[role];
}
