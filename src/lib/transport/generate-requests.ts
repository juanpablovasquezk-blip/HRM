import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export function isWithinTransportWindow(timeStr: string | null | undefined): boolean {
  if (!timeStr) return false;
  const [h, m] = timeStr.split(':').map(Number);
  const val = h * 100 + m;
  return (val >= 2300 || val <= 630);
}

/**
 * Internal server-only helper to generate transport requests for confirmed shifts on a date.
 * Must NOT have 'use server' so it is never exposed as a public Server Action.
 * Invoked by authorized daily planning actions (ADMIN/SUPERVISOR) and transport action (manageTransport).
 */
export async function generateTransportRequestsForDate(date: string) {
  try {
    const supabase = createAdminClient();

    // Clean up obsolete pending requests for this date (e.g., cancelled assignments or shifts changed to daytime)
    const { data: currentPending } = await supabase
      .from('transport_requests')
      .select('id, type, assignment:shift_assignments(status, shift:shifts(start_time, end_time, requires_transport))')
      .eq('date', date)
      .eq('status', 'ABIERTO');

    const toDeleteIds: string[] = [];
    for (const req of currentPending || []) {
      const asg = (req as any).assignment;
      if (!asg || asg.status === 'cancelled') {
        toDeleteIds.push(req.id);
      } else if (asg.shift) {
        if (asg.shift.requires_transport === false) {
          toDeleteIds.push(req.id);
        } else {
          const time = req.type === 'SALIDA' ? asg.shift.end_time : asg.shift.start_time;
          if (!isWithinTransportWindow(time)) {
            toDeleteIds.push(req.id);
          }
        }
      }
    }

    if (toDeleteIds.length > 0) {
      await supabase.from('transport_requests').delete().in('id', toDeleteIds);
    }

    // 1. Get all confirmed assignments for that date
    const { data: assignments, error: assErr } = await supabase
      .from('shift_assignments')
      .select(`
        *,
        personnel:personnel(*),
        area:areas(*),
        position:positions(*),
        shift:shifts!shift_assignments_shift_id_fkey(*)
      `)
      .eq('date', date)
      .eq('is_confirmed', true)
      .neq('status', 'cancelled');

    if (assErr) throw assErr;
    if (!assignments || assignments.length === 0) return { success: true, message: 'No hay asignaciones confirmadas.' };

    // Filter out assignments for inactive or terminated personnel
    const activeAssignments = assignments.filter(ass => {
      const p = ass.personnel;
      if (!p) return false;
      if (p.termination_date && date > p.termination_date) return false;
      const todayStr = new Date().toLocaleDateString('sv');
      if (!p.is_active && date >= todayStr) return false;
      return true;
    });

    if (activeAssignments.length === 0) return { success: true, message: 'No hay asignaciones de personal activo.' };

    // 2. Get existing requests to avoid duplicates
    const { data: existingReqs } = await supabase
      .from('transport_requests')
      .select('assignment_id')
      .eq('date', date);

    const existingIds = new Set(existingReqs?.map(r => r.assignment_id) || []);

    const newRequests: any[] = [];

    for (const ass of activeAssignments) {
      if (existingIds.has(ass.id)) continue;
      if (!ass.personnel || !ass.shift) continue;
      if (ass.shift.requires_transport === false) continue;

      const personnel = ass.personnel;
      const shift = ass.shift;
      const area = (ass as any).area;
      const areaName = (area?.name || '').toUpperCase();

      // Better Address Parsing
      let homeAddress = "DIRECCIÓN NO INFORMADA EN FICHA";
      const addr = personnel.address;
      if (addr) {
        if (typeof addr === 'string') {
          homeAddress = addr.replace(/[\r\n]+/g, ' ').trim();
        } else if (typeof addr === 'object') {
          const a = addr as any;
          const parts = [
            String(a.street || '').replace(/[\r\n]+/g, ' ').trim(),
            String(a.city || '').replace(/[\r\n]+/g, ' ').trim(),
            String(a.commune || a.region || '').replace(/[\r\n]+/g, ' ').trim()
          ].filter(Boolean);
          homeAddress = parts.length > 0 ? parts.join(', ') : (a.full_address || JSON.stringify(a));
        }
      }

      // Smart Plant Mapping
      let plantAddress = "MINERQUIM PLANTA";
      if (areaName.includes('BLUE')) plantAddress = "Los Maitenes Sur 9800, Pudahuel";
      else if (areaName.includes('BODEGA') || areaName.includes('DHL') || areaName.includes('FEDEX')) plantAddress = "Osvaldo Croquevielle 2207, Pudahuel";
      else if (areaName.includes('AEROPUERTO')) plantAddress = "Armando Cortinez Oriente 1704";

      const isSupervisor = ((ass as any).position?.name || '').toUpperCase().includes('SUPERVISOR');
      const defaultTransportType = isSupervisor ? 'PROPIO' : 'PENDIENTE';

      // ENTRADA
      if (isWithinTransportWindow(shift.start_time)) {
        newRequests.push({
          personnel_id: ass.personnel_id,
          assignment_id: ass.id,
          date: ass.date,
          type: 'ENTRADA',
          status: 'ABIERTO',
          transport_type: defaultTransportType,
          pickup_address: homeAddress,
          destination_address: plantAddress
        });
      }

      // SALIDA
      if (isWithinTransportWindow(shift.end_time)) {
        newRequests.push({
          personnel_id: ass.personnel_id,
          assignment_id: ass.id,
          date: ass.date,
          type: 'SALIDA',
          status: 'ABIERTO',
          transport_type: defaultTransportType,
          pickup_address: plantAddress,
          destination_address: homeAddress
        });
      }
    }

    if (newRequests.length > 0) {
      const { error: insErr } = await supabase.from('transport_requests').insert(newRequests);
      if (insErr) throw insErr;
    }

    revalidatePath('/transport');
    revalidatePath('/worker');
    return { success: true, count: newRequests.length };
  } catch (error: any) {
    console.error('Error generateTransportRequests:', error);
    return { success: false, error: error.message };
  }
}
