import { createClient } from '@/lib/supabase/server';
import { ShiftManageClient } from './shift-manage-client';

export default async function ShiftManagePage() {
  const supabase = await createClient();
  const { data: shifts } = await supabase.from('shifts').select('*').order('start_time');
  const { data: companies } = await supabase.from('companies').select('id, name').order('name');

  // Deduplicate: since each shift is stored once per company (NOT NULL constraint),
  // show only the first occurrence of each name+start_time+end_time combination.
  const seen = new Set<string>();
  const uniqueShifts = (shifts || []).filter(s => {
    const key = `${s.name}|${s.start_time}|${s.end_time}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <ShiftManageClient
      initialShifts={uniqueShifts}
      companies={companies || []}
    />
  );
}

