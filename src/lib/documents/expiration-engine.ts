/**
 * Document Expiration Logic Engine
 *
 * Rules from plan_maestro.md:
 * - If TICA exists: expiration = TICA_date - 25 days; previous cycle = -180 days
 * - If no TICA: expiration = upload_date + 180 days
 */

import { addDays, subDays, differenceInDays } from 'date-fns';

const TICA_OFFSET_DAYS = 25;
const DEFAULT_VALIDITY_DAYS = 180;

export interface ExpirationResult {
  expiration_date: Date;
  previous_cycle_start?: Date;
  source: 'tica' | 'default' | 'explicit';
  days_remaining: number;
  status: 'valid' | 'expiring_soon' | 'expired';
}

/**
 * Calculate document expiration based on TICA date or upload date.
 */
export function calculateExpiration(
  uploadDate: Date,
  ticaDate?: Date | null,
  explicitExpirationDate?: Date | null
): ExpirationResult {
  const now = new Date();

  if (explicitExpirationDate) {
    const daysRemaining = differenceInDays(explicitExpirationDate, now);
    return {
      expiration_date: explicitExpirationDate,
      source: 'explicit',
      days_remaining: daysRemaining,
      status: getStatus(daysRemaining),
    };
  }

  if (ticaDate) {
    const expirationDate = subDays(ticaDate, TICA_OFFSET_DAYS);
    const previousCycleStart = subDays(expirationDate, DEFAULT_VALIDITY_DAYS);
    const daysRemaining = differenceInDays(expirationDate, now);

    return {
      expiration_date: expirationDate,
      previous_cycle_start: previousCycleStart,
      source: 'tica',
      days_remaining: daysRemaining,
      status: getStatus(daysRemaining),
    };
  }

  const expirationDate = addDays(uploadDate, DEFAULT_VALIDITY_DAYS);
  const daysRemaining = differenceInDays(expirationDate, now);

  return {
    expiration_date: expirationDate,
    source: 'default',
    days_remaining: daysRemaining,
    status: getStatus(daysRemaining),
  };
}

function getStatus(daysRemaining: number): ExpirationResult['status'] {
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining <= 30) return 'expiring_soon';
  return 'valid';
}

/**
 * Get badge color for document status
 */
export function getStatusColor(status: ExpirationResult['status']): string {
  switch (status) {
    case 'expired':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'expiring_soon':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'valid':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
  }
}

/**
 * Get status label
 */
export function getStatusLabel(status: ExpirationResult['status'], daysRemaining: number): string {
  switch (status) {
    case 'expired':
      return `Expired ${Math.abs(daysRemaining)}d ago`;
    case 'expiring_soon':
      return `${daysRemaining}d remaining`;
    case 'valid':
      return 'Valid';
  }
}
