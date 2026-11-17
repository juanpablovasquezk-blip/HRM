/**
 * Shared shift effective duration helpers for HRM Shifts module.
 *
 * Preserves the existing system rule (subtracts 1 hour for colación and rounds to 1 decimal).
 * Limitation: Assumes a 1-hour break when deriving duration from start_time/end_time;
 * shifts with different break rules should store their explicit duration_hours > 0 in public.shifts.
 */

export function calcEffectiveShiftDuration(
  startTime?: string | null,
  endTime?: string | null
): number | null {
  if (!startTime || !endTime || !startTime.includes(':') || !endTime.includes(':')) {
    return null;
  }
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) {
    return null;
  }

  const startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins <= startMins) {
    endMins += 24 * 60; // crosses midnight
  }

  const rawHours = (endMins - startMins) / 60;
  return Math.round((rawHours - 1) * 10) / 10;
}

export function resolveShiftDurationHours(shift?: {
  duration_hours?: number | null;
  start_time?: string | null;
  end_time?: string | null;
} | null): { hours: number; source: 'db' | 'derived' | 'invalid' } {
  if (!shift) return { hours: 0, source: 'invalid' };

  const stored = Number(shift.duration_hours ?? 0);
  if (Number.isFinite(stored) && stored > 0) {
    return { hours: stored, source: 'db' };
  }

  const derived = calcEffectiveShiftDuration(shift.start_time, shift.end_time);
  if (derived !== null && Number.isFinite(derived) && derived > 0) {
    return { hours: derived, source: 'derived' };
  }

  return { hours: 0, source: 'invalid' };
}
