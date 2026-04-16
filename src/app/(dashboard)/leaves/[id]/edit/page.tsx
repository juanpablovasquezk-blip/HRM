import { createClient } from '@/lib/supabase/server';
import { LeaveForm } from '../../leave-form-client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { notFound } from 'next/navigation';

export default async function LeaveEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: leave }, { data: personnel }] = await Promise.all([
    supabase.from('leaves').select('*').eq('id', id).single(),
    supabase.from('personnel').select('id, first_name, last_name_father, rut').eq('is_active', true).order('last_name_father')
  ]);

  if (!leave) {
    notFound();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/leaves">
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Editar Registro</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Modifica las fechas o el tipo de ausencia para el trabajador
          </p>
        </div>
      </div>

      <LeaveForm personnel={personnel || []} leave={leave} />
    </div>
  );
}
