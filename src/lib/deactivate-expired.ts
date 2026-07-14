import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Deactivates personnel whose termination_date has passed (is <= today).
 * Also bans their user accounts and cancels future shift assignments / transport requests.
 * 
 * This is meant to be called on dashboard load (fire-and-forget)
 * so that personnel are automatically deactivated when their termination date arrives.
 */
export async function deactivateExpiredPersonnel(): Promise<void> {
  try {
    const admin = createAdminClient();
    const todayStr = new Date().toLocaleDateString('sv'); // YYYY-MM-DD

    // Find active personnel whose termination_date has arrived or passed
    const { data: expired, error } = await admin
      .from('personnel')
      .select('id, user_id, termination_date')
      .eq('is_active', true)
      .not('termination_date', 'is', null)
      .lte('termination_date', todayStr);

    if (error || !expired || expired.length === 0) return;

    for (const person of expired) {
      // 1. Mark as inactive
      await admin
        .from('personnel')
        .update({ is_active: false })
        .eq('id', person.id);

      // 2. Ban user account if linked
      if (person.user_id) {
        try {
          await admin.auth.admin.updateUserById(person.user_id, {
            ban_duration: '87600h', // 10 years
          });
        } catch (banErr) {
          console.error(`[DEACTIVATE-EXPIRED] Error banning user ${person.user_id}:`, banErr);
        }
      }

      // 3. Cancel shift assignments after termination date
      await admin
        .from('shift_assignments')
        .update({ status: 'cancelled' })
        .eq('personnel_id', person.id)
        .gt('date', person.termination_date!);

      // 4. Delete transport requests after termination date
      await admin
        .from('transport_requests')
        .delete()
        .eq('personnel_id', person.id)
        .gt('date', person.termination_date!);
    }

    console.log(`[DEACTIVATE-EXPIRED] Deactivated ${expired.length} personnel with expired termination dates.`);
  } catch (err) {
    console.error('[DEACTIVATE-EXPIRED] Unexpected error:', err);
  }
}
