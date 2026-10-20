import React from 'react';
import { getWorkerSession } from '../../actions';
import { redirect } from 'next/navigation';
import { getWorkerBonuses } from './actions';
import { WorkerBonusesClient } from './bonuses-client';
import { format, startOfMonth, endOfMonth } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function WorkerBonusesPage() {
  const session = await getWorkerSession();
  if (!session) redirect('/worker/login');

  const now = new Date();
  const startDate = format(startOfMonth(now), 'yyyy-MM-dd');
  const endDate = format(endOfMonth(now), 'yyyy-MM-dd');

  const res = await getWorkerBonuses({ startDate, endDate });

  return <WorkerBonusesClient initialBonuses={res.data || []} />;
}
