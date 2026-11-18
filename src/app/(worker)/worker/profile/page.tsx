import { getWorkerProfile, getWorkerSizeRequirements } from '../../actions';
import { redirect } from 'next/navigation';
import ProfileClient from './profile-client';

export default async function ProfilePage() {
  const [profile, sizeRequirements] = await Promise.all([
    getWorkerProfile(),
    getWorkerSizeRequirements(),
  ]);
  
  if (!profile) {
    redirect('/worker/login');
  }
  
  return <ProfileClient profile={profile} sizeRequirements={sizeRequirements} />;
}
