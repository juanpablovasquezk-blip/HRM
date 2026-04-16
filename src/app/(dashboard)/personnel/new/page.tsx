import { createClient } from '@/lib/supabase/server';
import { PersonnelForm } from '@/components/personnel/personnel-form';

export default async function NewPersonnelPage() {
  const supabase = await createClient();
  const [{ data: companies }, { data: positions }, { data: shifts }] = await Promise.all([
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('positions').select('id, name').order('name'),
    supabase.from('shifts').select('id, name, start_time, end_time').order('name'),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <a href="/personnel" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-orange-600 transition-colors mb-2">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Volver a Personal
        </a>
        <h1 className="text-2xl font-bold tracking-tight">Agregar Personal</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Registrar un nuevo trabajador
        </p>
      </div>
      <PersonnelForm
        companies={JSON.parse(JSON.stringify(companies || []))}
        positions={JSON.parse(JSON.stringify(positions || []))}
        shifts={JSON.parse(JSON.stringify(shifts || []))}
      />
    </div>
  );
}
