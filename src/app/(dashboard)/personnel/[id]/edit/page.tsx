import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { PersonnelForm } from '@/components/personnel/personnel-form';

export default async function EditPersonnelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: person, error }, { data: companies }, { data: positions }, { data: shifts }, { data: areas }] = await Promise.all([
    supabase.from('personnel').select('*').eq('id', id).single(),
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('positions').select('id, name, area:areas(name)').order('name'),
    supabase.from('shifts').select('id, name, start_time, end_time').order('name'),
    supabase.from('areas').select('id, name').order('name'),
  ]);

  if (error || !person) notFound();

  return (
    <div className="space-y-6">
      <div>
        <a href={`/personnel/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-orange-600 transition-colors mb-2">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Volver al perfil
        </a>
        <h1 className="text-2xl font-bold tracking-tight">
          Editar: {person.first_name} {person.last_name_father}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Modifica la información del trabajador
        </p>
      </div>
      <PersonnelForm
        key={person.id}
        personnel={JSON.parse(JSON.stringify(person))}
        companies={JSON.parse(JSON.stringify(companies || []))}
        positions={JSON.parse(JSON.stringify(positions || []))}
        shifts={JSON.parse(JSON.stringify(shifts || []))}
        areas={JSON.parse(JSON.stringify(areas || []))}
      />
    </div>
  );
}
