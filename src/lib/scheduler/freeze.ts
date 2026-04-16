/**
 * Freeze Window Logic
 *
 * Rule: No changes allowed if date < today + 3 days
 * Override: Allowed for ADMIN and SUPERVISOR only
 */

import { addDays, isBefore, parseISO, startOfDay } from 'date-fns';
import type { Role } from '@/types/database';

const FREEZE_WINDOW_DAYS = 3;

/**
 * Check if a shift assignment date falls within the freeze window
 */
export function isShiftFrozen(assignmentDate: string | Date): boolean {
  const date = typeof assignmentDate === 'string'
    ? parseISO(assignmentDate)
    : assignmentDate;

  const freezeThreshold = addDays(startOfDay(new Date()), FREEZE_WINDOW_DAYS);

  return isBefore(startOfDay(date), freezeThreshold);
}

/**
 * Check if the given role can override the freeze window
 */
export function canOverrideFreeze(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPERVISOR';
}

/**
 * Determine the protection level of an assignment
 * Priority: 1. Frozen  2. Locked  3. Manual  4. Regular
 */
export function getProtectionLevel(assignment: {
  frozen_by_rule: boolean;
  is_locked: boolean;
  is_manual: boolean;
}): 'frozen' | 'locked' | 'manual' | 'regular' {
  if (assignment.frozen_by_rule) return 'frozen';
  if (assignment.is_locked) return 'locked';
  if (assignment.is_manual) return 'manual';
  return 'regular';
}

/**
 * Check if an assignment can be modified given the freeze rules
 */
export function canModifyAssignment(
  assignment: {
    date: string;
    frozen_by_rule: boolean;
    is_locked: boolean;
    is_manual: boolean;
  },
  userRole: Role,
  overrideFreeze: boolean = false
): { allowed: boolean; reason?: string } {
  // Check frozen by rule
  if (assignment.frozen_by_rule || isShiftFrozen(assignment.date)) {
    if (!overrideFreeze || !canOverrideFreeze(userRole)) {
      return {
        allowed: false,
        reason: `Shift is frozen (within ${FREEZE_WINDOW_DAYS}-day window). Only ADMIN/SUPERVISOR can override.`,
      };
    }
  }

  // Locked shifts require admin
  if (assignment.is_locked) {
    if (userRole !== 'ADMIN') {
      return {
        allowed: false,
        reason: 'Shift is locked. Only ADMIN can modify.',
      };
    }
  }

  return { allowed: true };
}

/**
 * Get freeze window status label and color
 */
export function getFreezeStatus(date: string): {
  label: string;
  color: string;
  frozen: boolean;
} {
  if (isShiftFrozen(date)) {
    return {
      label: 'Frozen',
      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      frozen: true,
    };
  }
  return {
    label: 'Editable',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    frozen: false,
  };
}
