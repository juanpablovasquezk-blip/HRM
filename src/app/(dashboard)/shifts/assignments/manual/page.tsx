import { createClient } from '@/lib/supabase/server';
import { ManualAssignmentClient } from '../manual-assignment-client';

export default async function ManualAssignmentPage() {
  const supabase = await createClient();

  const [
    { data: personnel },
    { data: shifts },
    { data: areas }
  ] = await Promise.all([
    supabase.from('personnel').select('id, first_name, last_name_father, rut').eq('is_active', true).or('onboarding_status.is.null,onboarding_status.eq.approved').order('last_name_father'),
    supabase.from('shifts').select('id, name, start_time, end_time').order('name'),
    supabase.from('areas').select('id, name, positions(id, name)').order('name')
  ]);

  return <ManualAssignmentClient 
    personnel={personnel || []} 
    shifts={shifts || []} 
    areas={areas || []} 
  />;
}
