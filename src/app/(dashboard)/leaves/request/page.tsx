import { createClient } from '@/lib/supabase/server';
import { LeaveForm } from '../leave-form-client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function LeaveRequestPage() {
  const supabase = await createClient();

  const { data: personnel } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father, rut')
    .eq('is_active', true)
    .order('last_name_father');

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/leaves">
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ingresar Licencia o Vacaciones</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Registra una ausencia médica o feriado legal para el personal
          </p>
        </div>
      </div>

      <LeaveForm personnel={personnel || []} />
    </div>
  );
}
