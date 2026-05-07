import React from 'react';
import { getWorkerRosterData, getWorkerSession } from '../../actions';
import { redirect } from 'next/navigation';
import RosterClient from './roster-client';
import { format } from 'date-fns';

export default async function WorkerRosterPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const session = await getWorkerSession();
  if (!session) redirect('/worker/login');

  const { month } = await searchParams;
  const currentMonth = month || format(new Date(), 'yyyy-MM');
  
  const data = await getWorkerRosterData(currentMonth);
  if (!data) return null;

  return <RosterClient data={data} selectedMonth={currentMonth} />;
}
