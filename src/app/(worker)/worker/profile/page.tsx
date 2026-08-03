import { getWorkerProfile } from '../../actions';
import { redirect } from 'next/navigation';
import ProfileClient from './profile-client';

export default async function ProfilePage() {
  const profile = await getWorkerProfile();
  
  if (!profile) {
    redirect('/worker/login');
  }
  
  return <ProfileClient profile={profile} />;
}
