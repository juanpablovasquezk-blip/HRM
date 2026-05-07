import React from 'react';
import { getDailyPlanning, getSupervisorSession } from '../../actions';
import { redirect } from 'next/navigation';
import AttendanceClient from './attendance-client';

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const session = await getSupervisorSession();
  if (!session) redirect('/supervisor/login');

  const { date } = await searchParams;
  const data = await getDailyPlanning(date);
  if (!data) return null;

  return <AttendanceClient key={data.date} initialData={data} />;
}
