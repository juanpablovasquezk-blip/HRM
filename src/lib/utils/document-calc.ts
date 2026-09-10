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
  const baseDate = subDays(anchorExpiry, anchorDaysOffset);
  const now = new Date();

  let currentMilestone = baseDate;

  if (isAfter(currentMilestone, now)) {
    // If baseDate is in the future, step backwards to find the closest milestone that is still in the future
    while (isAfter(currentMilestone, now)) {
      const prevMilestone = addMonths(currentMilestone, -cycleMonths);
      if (isBefore(prevMilestone, now)) {
        break; // currentMilestone is the closest future milestone
      }
      currentMilestone = prevMilestone;
    }
  } else {
    // If baseDate is already past (e.g. TICA is expiring in < 30 days or has passed),
    // a newly uploaded document covers the forward cycle from the anchor milestone.
    while (!isAfter(currentMilestone, now)) {
      currentMilestone = addMonths(currentMilestone, cycleMonths);
    }
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
