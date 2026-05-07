import React from 'react';
import { getDailyPlanning, getSupervisorSession } from '../../actions';
import { redirect } from 'next/navigation';
import TransportClient from './transport-client';

export default async function TransportPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const session = await getSupervisorSession();
  if (!session) redirect('/supervisor/login');

  const { date } = await searchParams;
  const data = await getDailyPlanning(date);
  if (!data) return null;

  // STRICT FILTER: For Transport, only show assignments where is_confirmed is true
  const filteredData = {
    ...data,
    assignments: data.assignments.filter((a: any) => a.is_confirmed === true)
  };

  return <TransportClient key={data.date} initialData={filteredData} />;
}
