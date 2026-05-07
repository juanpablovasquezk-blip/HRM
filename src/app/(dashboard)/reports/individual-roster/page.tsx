import { listPersonnel } from '@/app/(dashboard)/personnel/actions';
import { IndividualRosterClient } from '@/app/(dashboard)/reports/individual-roster/individual-roster-client';
import { createClient } from '@/lib/supabase/server';

export default async function IndividualRosterPage() {
  const supabase = await createClient();
  const [{ data: personnel }, { data: areas }, { data: positions }] = await Promise.all([
    listPersonnel(),
    supabase.from('areas').select('id, name').order('name'),
    supabase.from('positions').select('id, area_id')
  ]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Roster Individual Imprimible</h1>
        <p className="text-muted-foreground text-sm">
          Genera el calendario de turnos para un trabajador específico en formato de impresión.
        </p>
      </div>

      <IndividualRosterClient 
        personnelList={personnel || []} 
        areas={areas || []} 
        positions={positions || []}
      />
    </div>
  );
}
