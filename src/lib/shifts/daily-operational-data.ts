import { createAdminClient } from '@/lib/supabase/admin';
import type { ShiftAssignmentWithDetails, ShiftRequirementWithDetails } from '@/types/database';

/**
 * Internal server-only helper to fetch daily operational data.
 * Must NOT have 'use server' so it is never exposed as a public Server Action.
 * Used by both the protected dashboard action (getDailyOperationalData) and /proyeccion.
 */
export async function fetchDailyOperationalData(date: string) {
  const supabase = createAdminClient();

  // 1. Get all assignments for this day
  const { data: assignments, error: assErr } = await supabase
    .from('shift_assignments')
    .select('*, personnel:personnel(*), shift:shifts!shift_assignments_shift_id_fkey(*), area:areas(*), position:positions(*)')
    .eq('date', date);

  // 1.1. Get all approved leaves for this day to exclude personnel with medical/vacation leaves
  const { data: activeLeaves } = await supabase
    .from('leaves')
    .select('personnel_id')
    .eq('status', 'approved')
    .lte('start_date', date)
    .gte('end_date', date);

  const leavePersonnelIds = new Set((activeLeaves || []).map(l => l.personnel_id));

  // 2. Get all requirements (regular + extra) for this day
  const { data: requirements, error: reqErr } = await supabase
    .from('shift_requirements')
    .select('*, shift:shifts(*), area:areas(*), position:positions(*)')
    .eq('date', date);

  if (assErr || reqErr) {
    console.error('Error fetching daily data:', assErr || reqErr);
    return { error: 'Error al cargar datos operativos' };
  }

  // 3. Count how many active extra assignments exist for each requirement slot (server-side)
  const { data: extraAssignments, error: extraErr } = await supabase
    .from('shift_assignments')
    .select('shift_id, area_id, position_id, personnel_id, status')
    .eq('date', date)
    .eq('is_extra', true)
    .neq('status', 'cancelled');

  console.log(`[getDailyOperationalData] date=${date} extraAssignments found: ${extraAssignments?.length ?? 0}`,
    extraErr ? `ERROR: ${extraErr.message}` : '',
    JSON.stringify(extraAssignments?.map(e => ({ sid: e.shift_id, aid: e.area_id, pid: e.position_id, per: e.personnel_id, st: e.status })))
  );

  // Build a lookup: "shift_id|area_id|position_id" -> count
  const extraFillCount = new Map<string, number>();
  for (const ea of extraAssignments || []) {
    const key = `${ea.shift_id}|${ea.area_id}|${ea.position_id}`;
    extraFillCount.set(key, (extraFillCount.get(key) || 0) + 1);
  }

  // Attach filled_count to each extra requirement
  const extraReqs = (requirements || []).filter(r => r.is_extra);
  for (const r of extraReqs) {
    const key = `${r.shift_id}|${r.area_id}|${r.position_id}`;
    const count = extraFillCount.get(key) || 0;
    console.log(`[getDailyOperationalData] Extra req: key=${key} required=${r.required_count} filled=${count}`);
  }

  const requirementsWithFill = (requirements || []).map(r => ({
    ...r,
    filled_count: r.is_extra
      ? (extraFillCount.get(`${r.shift_id}|${r.area_id}|${r.position_id}`) || 0)
      : 0,
  }));

  const assignmentsWithLeave = (assignments || []).map(a => ({
    ...a,
    is_on_leave: leavePersonnelIds.has((a as any).personnel_id),
  }));

  const activeAssignments = assignmentsWithLeave.filter(a => {
    const p = a.personnel as any;
    if (!p) return false;
    if (p.termination_date && date > p.termination_date) return false;
    const todayStr = new Date().toLocaleDateString('sv');
    if (!p.is_active && date >= todayStr) return false;
    return true;
  }) as ShiftAssignmentWithDetails[];

  // Deduplicate non-extra assignments per person: keep only the most recent one
  // (highest created_at / id) and auto-delete older duplicates from DB.
  const seenPersonNormal = new Map<string, ShiftAssignmentWithDetails>();
  const duplicateIds: string[] = [];

  for (const a of activeAssignments) {
    if ((a as any).is_extra) continue; // extra shifts are allowed to coexist
    const pid = (a as any).personnel_id as string;
    const prev = seenPersonNormal.get(pid);
    if (!prev) {
      seenPersonNormal.set(pid, a);
    } else {
      // Keep the one with the greater id (more recently created), discard the other
      if (a.id > prev.id) {
        duplicateIds.push(prev.id);
        seenPersonNormal.set(pid, a);
      } else {
        duplicateIds.push(a.id);
      }
    }
  }

  // Async cleanup of duplicates in the background (non-blocking)
  if (duplicateIds.length > 0) {
    const adminClient = createAdminClient();
    adminClient.from('shift_assignments').delete().in('id', duplicateIds)
      .then(({ error }) => {
        if (error) console.error('[getDailyOperationalData] Error deleting duplicate assignments:', error.message);
        else console.log(`[getDailyOperationalData] Auto-deleted ${duplicateIds.length} duplicate assignment(s) for ${date}`);
      });
  }

  // Rebuild deduplicated list: all extra + one non-extra per person
  const dedupedAssignments = activeAssignments.filter(a =>
    (a as any).is_extra || seenPersonNormal.get((a as any).personnel_id)?.id === a.id
  );

  return {
    assignments: dedupedAssignments,
    requirements: requirementsWithFill as ShiftRequirementWithDetails[],
  };
}
