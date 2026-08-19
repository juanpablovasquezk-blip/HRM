import { redirect } from 'next/navigation';
import { getUserRole } from '@/app/role-actions';
import { getSystemUsers } from './actions';
import { UsersClient } from './users-client';

export const dynamic = 'force-dynamic';

export default async function SettingsUsersPage() {
  const role = await getUserRole();

  if (role !== 'ADMIN' && role !== 'HR') {
    redirect('/dashboard');
  }

  const res = await getSystemUsers();
  const users = res.success && res.data ? res.data : [];

  return <UsersClient initialUsers={users} />;
}
