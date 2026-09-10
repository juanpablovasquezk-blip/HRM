import { addDays, parseISO, format } from 'date-fns';
import { SupabaseClient } from '@supabase/supabase-js';

export interface OverlapResult {
  adjustedStartDate: string;
  adjustedEndDate: string;
  wasAdjusted: boolean;
  adjustmentReason?: string;
  error?: string;
}

/**
 * Checks and adjusts a leave date range to avoid overlaps with existing leaves for a worker.
 * If the new leave starts on or before an existing overlapping leave's end date,
 * but terminates AFTER it, its start_date is shifted to the day immediately following
 * the existing leave's end date (existing_end_date + 1 day), keeping the new leave's end date intact.
 */
export async function resolveLeaveOverlap(
  supabase: SupabaseClient,
  personnelId: string,
  startDate: string,
  endDate: string,
  excludeLeaveId?: string
): Promise<OverlapResult> {
  // 1. Basic validation
  if (startDate > endDate) {
    return {
      adjustedStartDate: startDate,
      adjustedEndDate: endDate,
      wasAdjusted: false,
      error: 'La fecha de inicio no puede ser posterior a la fecha de término.',
    };
  }

  // 2. Fetch existing approved or pending leaves for this personnel
  let query = supabase
    .from('leaves')
    .select('id, start_date, end_date, type, status')
    .eq('personnel_id', personnelId)
    .neq('status', 'rejected')
    .order('start_date', { ascending: true });

  if (excludeLeaveId) {
    query = query.neq('id', excludeLeaveId);
  }

  const { data: existingLeaves, error } = await query;
  if (error) {
    console.error('[LEAVE-OVERLAP] Error querying existing leaves:', error);
    return { adjustedStartDate: startDate, adjustedEndDate: endDate, wasAdjusted: false };
  }

  if (!existingLeaves || existingLeaves.length === 0) {
    return { adjustedStartDate: startDate, adjustedEndDate: endDate, wasAdjusted: false };
  }

  let currentStart = startDate;
  let currentEnd = endDate;
  let wasAdjusted = false;
  let previousEndFormatted = '';

  for (const existing of existingLeaves) {
    // Check overlap with current proposed range
    if (existing.start_date <= currentEnd && existing.end_date >= currentStart) {
      if (currentStart <= existing.end_date) {
        if (currentEnd > existing.end_date) {
          // Shift start date to next day after existing ends
          const nextDay = addDays(parseISO(existing.end_date), 1);
          const nextDayStr = format(nextDay, 'yyyy-MM-dd');
          
          if (nextDayStr > currentStart) {
            currentStart = nextDayStr;
            wasAdjusted = true;
            previousEndFormatted = existing.end_date;
          }
        } else {
          // Fully engulfed inside an existing leave
          return {
            adjustedStartDate: currentStart,
            adjustedEndDate: currentEnd,
            wasAdjusted: false,
            error: `El periodo ingresado (${startDate} al ${endDate}) ya se encuentra cubierto por una ausencia existente (hasta el ${existing.end_date}).`,
          };
        }
      }
    }
  }

  if (currentStart > currentEnd) {
    return {
      adjustedStartDate: currentStart,
      adjustedEndDate: currentEnd,
      wasAdjusted: false,
      error: `El periodo ingresado ya se encuentra completamente cubierto por una licencia previa que finaliza el ${previousEndFormatted}.`,
    };
  }

  return {
    adjustedStartDate: currentStart,
    adjustedEndDate: currentEnd,
    wasAdjusted,
    adjustmentReason: wasAdjusted
      ? `Fecha de inicio ajustada automáticamente al ${currentStart} para dar continuidad a la licencia previa que finaliza el ${previousEndFormatted}.`
      : undefined,
  };
}

/**
 * Reconciles and fixes all overlapping leaves in the database for all personnel.
 */
export async function reconcileAllOverlappingLeaves(supabaseAdmin: SupabaseClient) {
  const { data: allLeaves, error } = await supabaseAdmin
    .from('leaves')
    .select('id, personnel_id, start_date, end_date, type, status, created_at')
    .neq('status', 'rejected')
    .order('personnel_id')
    .order('start_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error || !allLeaves) {
    console.error('[LEAVE-RECONCILE] Error fetching leaves:', error);
    return { updatedCount: 0, error: error?.message };
  }

  // Group by personnel_id
  const byPerson = new Map<string, typeof allLeaves>();
  for (const leave of allLeaves) {
    const list = byPerson.get(leave.personnel_id) || [];
    list.push(leave);
    byPerson.set(leave.personnel_id, list);
  }

  let updatedCount = 0;

  for (const [personnelId, leaves] of byPerson.entries()) {
    let lastEndDate: string | null = null;

    for (const leave of leaves) {
      if (lastEndDate && leave.start_date <= lastEndDate) {
        if (leave.end_date > lastEndDate) {
          const nextDay = format(addDays(parseISO(lastEndDate), 1), 'yyyy-MM-dd');
          if (nextDay !== leave.start_date && nextDay <= leave.end_date) {
            console.log(`[LEAVE-RECONCILE] Adjusting leave ${leave.id} for person ${personnelId}: start ${leave.start_date} -> ${nextDay}`);
            await supabaseAdmin
              .from('leaves')
              .update({ start_date: nextDay })
              .eq('id', leave.id);
            
            leave.start_date = nextDay;
            updatedCount++;
          }
        }
      }

      if (!lastEndDate || leave.end_date > lastEndDate) {
        lastEndDate = leave.end_date;
      }
    }
  }

  return { updatedCount, error: null };
}
