import { addMonths, subDays, isBefore, isAfter, format } from 'date-fns';

/**
 * Calculates the next expiration date for a document that depends on another document's expiration.
 * Rule: TICA_Expiry - AnchorDays - (N * CycleMonths)
 * We find the smallest N such that the date is in the future.
 */
export function calculateDynamicExpiration(
  anchorExpiry: Date,
  cycleMonths: number = 6,
  anchorDaysOffset: number = 30
): Date {
  // Start date: TICA Expiry minus the initial buffer (e.g., 30 days)
  let baseDate = subDays(anchorExpiry, anchorDaysOffset);
  const now = new Date();

  // If the base date itself is in the past, we need to go forward? 
  // No, the requirement is "restar 6 meses".
  // Actually, if the TICA expires in 2 years, the milestones are:
  // TICA - 30d
  // TICA - 30d - 6m
  // TICA - 30d - 12m
  // TICA - 30d - 18m
  
  // We want the closest milestone that is in the FUTURE.
  let currentMilestone = baseDate;
  
  // If the baseDate is already past, we can't subtract more to find a future date.
  // This would mean the TICA is already too close to expiring or expired.
  
  // However, usually we start from the furthest point and go backwards or start from now and find next.
  // Let's iterate:
  while (isAfter(currentMilestone, now)) {
    let nextMilestone = addMonths(currentMilestone, -cycleMonths);
    if (isBefore(nextMilestone, now)) {
      break; // currentMilestone is the next future one
    }
    currentMilestone = nextMilestone;
  }
  
  return currentMilestone;
}

/**
 * Calculates expiration based on a fixed interval from a starting date (e.g., last upload + 6 months)
 */
export function calculateIntervalExpiration(
  startDate: Date,
  intervalMonths: number = 6
): Date {
  return addMonths(startDate, intervalMonths);
}
