import { createClient } from '@/lib/supabase/server';
import { ShiftManageClient } from './shift-manage-client';

export default async function ShiftManagePage() {
  const supabase = await createClient();
  const { data: shifts } = await supabase.from('shifts').select('*').order('start_time');
  const { data: companies } = await supabase.from('companies').select('id, name').order('name');

  return (
    <ShiftManageClient
      initialShifts={shifts || []}
      companies={companies || []}
    />
  );
}
