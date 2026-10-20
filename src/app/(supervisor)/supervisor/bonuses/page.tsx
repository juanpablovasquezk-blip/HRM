import React from 'react';
import { getSupervisorSession } from '../../actions';
import { redirect } from 'next/navigation';
import { getSupervisorBonuses } from './actions';
import { SupervisorBonusesClient } from './bonuses-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { format, startOfMonth, endOfMonth } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function SupervisorBonusesPage() {
  const session = await getSupervisorSession();
  if (!session) redirect('/supervisor/login');

  const now = new Date();
  const startDate = format(startOfMonth(now), 'yyyy-MM-dd');
  const endDate = format(endOfMonth(now), 'yyyy-MM-dd');

  const admin = createAdminClient();

  const [bonusesRes, personnelRes] = await Promise.all([
    getSupervisorBonuses({ startDate, endDate }),
    admin.from('personnel').select('id, first_name, last_name_father, rut').eq('is_active', true).order('first_name'),
  ]);

  return (
    <SupervisorBonusesClient
      initialBonuses={bonusesRes.data || []}
      personnelList={personnelRes.data || []}
    />
  );
}
