import { addDays, subDays, parseISO, format } from 'date-fns';
import { SupabaseClient } from '@supabase/supabase-js';

export interface OverlapResult {
  adjustedStartDate: string;
  adjustedEndDate: string;
  wasAdjusted: boolean;
  adjustmentReason?: string;
  error?: string;
}

/**
 * Identifica si una ausencia corresponde a una solicitud mensual de días libres del trabajador.
 */
export function isFreeDayRequest(leave: { type?: string | null; reason?: string | null }): boolean {
  if (leave.type === 'free_request') return true;
  if (!leave.reason) return false;
  const r = leave.reason.toLowerCase();
  return (
    r.includes('solicitud mensual de días libres') ||
    r.includes('solicitud mensual de dias libres') ||
    r.includes('solicitud de libre') ||
    r.includes('solicitud de días libres') ||
    r.includes('solicitud de dias libres') ||
    r.includes('días solicitados') ||
    r.includes('dias solicitados')
  );
}

/**
 * Checks and adjusts a leave date range to avoid overlaps with existing leaves for a worker.
 * Las VACACIONES y LICENCIAS MÉDICAS tienen MAYOR PRIORIDAD que los días solicitados (días libres).
 * Si hay días solicitados que se solapan con las vacaciones, las vacaciones los sobrescriben / reemplazan.
 */
export async function resolveLeaveOverlap(
  supabase: SupabaseClient,
  personnelId: string,
  startDate: string,
  endDate: string,
  excludeLeaveId?: string,
  newLeaveType?: string,
  newLeaveReason?: string | null
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
    .select('id, start_date, end_date, type, status, reason')
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

  // Las VACACIONES y LICENCIAS MÉDICAS tienen mayor prioridad sobre los días solicitados.
  const isHighPriority = newLeaveType === 'vacation' || newLeaveType === 'sick';
  const isNewFreeDay = isFreeDayRequest({ type: newLeaveType, reason: newLeaveReason });

  // Si se está solicitando un día libre y ya hay vacaciones o licencia en esa fecha:
  if (isNewFreeDay) {
    for (const existing of existingLeaves) {
      if (existing.start_date <= endDate && existing.end_date >= startDate) {
        if (existing.type === 'vacation' || existing.type === 'sick') {
          return {
            adjustedStartDate: startDate,
            adjustedEndDate: endDate,
            wasAdjusted: false,
            error: `La fecha ingresada se encuentra cubierta por ${existing.type === 'vacation' ? 'vacaciones' : 'licencia médica'}. Las vacaciones tienen mayor prioridad que los días solicitados.`,
          };
        }
      }
    }
  }

  const nonOverriddenLeaves: typeof existingLeaves = [];

  for (const existing of existingLeaves) {
    // Verificar si se solapa con el rango solicitado [startDate, endDate]
    const overlaps = existing.start_date <= endDate && existing.end_date >= startDate;

    if (overlaps && isHighPriority && isFreeDayRequest(existing)) {
      // Las Vacaciones o Licencias tienen mayor prioridad:
      // Se sobreescribe o ajusta la solicitud de días libres existente
      console.log(`[LEAVE-OVERLAP] Priorizando ${newLeaveType} sobre solicitud de libre ${existing.id} (${existing.start_date} al ${existing.end_date})`);

      if (existing.start_date >= startDate && existing.end_date <= endDate) {
        // Si el día solicitado está completamente dentro del rango de vacaciones, se elimina
        await supabase.from('leaves').delete().eq('id', existing.id);
      } else if (existing.start_date < startDate && existing.end_date <= endDate) {
        // Empieza antes y termina dentro de las vacaciones: se acorta el fin al día anterior
        const prevDay = format(subDays(parseISO(startDate), 1), 'yyyy-MM-dd');
        await supabase.from('leaves').update({ end_date: prevDay }).eq('id', existing.id);
      } else if (existing.start_date >= startDate && existing.end_date > endDate) {
        // Empieza dentro de las vacaciones y termina después: se retrasa el inicio al día posterior
        const nextDay = format(addDays(parseISO(endDate), 1), 'yyyy-MM-dd');
        await supabase.from('leaves').update({ start_date: nextDay }).eq('id', existing.id);
      } else if (existing.start_date < startDate && existing.end_date > endDate) {
        // El día solicitado abarca todo el periodo: se divide en dos tramos
        const prevDay = format(subDays(parseISO(startDate), 1), 'yyyy-MM-dd');
        const nextDay = format(addDays(parseISO(endDate), 1), 'yyyy-MM-dd');
        await supabase.from('leaves').update({ end_date: prevDay }).eq('id', existing.id);
        await supabase.from('leaves').insert({
          personnel_id: personnelId,
          type: existing.type,
          status: existing.status,
          reason: existing.reason,
          start_date: nextDay,
          end_date: existing.end_date,
        });
      }
      // No se agrega a nonOverriddenLeaves, evitando que bloquee o desplace las vacaciones
    } else {
      nonOverriddenLeaves.push(existing);
    }
  }

  let currentStart = startDate;
  let currentEnd = endDate;
  let wasAdjusted = false;
  let previousEndFormatted = '';

  for (const existing of nonOverriddenLeaves) {
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
          const typeLabel = existing.type === 'vacation' 
            ? 'vacaciones' 
            : existing.type === 'sick' 
            ? 'licencia médica' 
            : (existing.type === 'other' && isFreeDayRequest(existing))
            ? 'solicitud de días libres'
            : 'ausencia';

          return {
            adjustedStartDate: currentStart,
            adjustedEndDate: currentEnd,
            wasAdjusted: false,
            error: `El periodo ingresado (${startDate} al ${endDate}) ya se encuentra cubierto por ${typeLabel === 'ausencia' || typeLabel === 'solicitud de días libres' ? 'una' : ''} ${typeLabel} existente (hasta el ${existing.end_date}).`,
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
      error: `El periodo ingresado ya se encuentra completamente cubierto por una ausencia previa que finaliza el ${previousEndFormatted}.`,
    };
  }

  return {
    adjustedStartDate: currentStart,
    adjustedEndDate: currentEnd,
    wasAdjusted,
    adjustmentReason: wasAdjusted
      ? `Fecha de inicio ajustada automáticamente al ${currentStart} para dar continuidad a la ausencia previa que finaliza el ${previousEndFormatted}.`
      : undefined,
  };
}

/**
 * Reconciles and fixes all overlapping leaves in the database for all personnel.
 * Elimina automáticamente días solicitados que hayan quedado solapados con vacaciones o licencias médicas.
 */
export async function reconcileAllOverlappingLeaves(supabaseAdmin: SupabaseClient) {
  const { data: allLeaves, error } = await supabaseAdmin
    .from('leaves')
    .select('id, personnel_id, start_date, end_date, type, status, reason, created_at')
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
    // 1. Eliminar solicitudes de días libres que estén cubiertas por vacaciones o licencias
    const highPriorityLeaves = leaves.filter(l => l.type === 'vacation' || l.type === 'sick');
    const freeRequests = leaves.filter(l => isFreeDayRequest(l));

    for (const free of freeRequests) {
      const isEngulfed = highPriorityLeaves.some(hp => hp.start_date <= free.start_date && hp.end_date >= free.end_date);
      if (isEngulfed) {
        console.log(`[LEAVE-RECONCILE] Eliminando día solicitado ${free.id} solapado por vacaciones/licencia de ${personnelId}`);
        await supabaseAdmin.from('leaves').delete().eq('id', free.id);
        updatedCount++;
      }
    }

    // 2. Dar continuidad a licencias que continúan inmediatamente
    let lastEndDate: string | null = null;
    const remainingLeaves = leaves.filter(l => !(isFreeDayRequest(l) && highPriorityLeaves.some(hp => hp.start_date <= l.start_date && hp.end_date >= l.end_date)));

    for (const leave of remainingLeaves) {
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
