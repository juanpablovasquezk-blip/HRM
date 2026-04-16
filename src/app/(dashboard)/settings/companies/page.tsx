import { createClient } from '@/lib/supabase/server';
import { CompaniesClient } from './companies-client';
import { Building, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function CompaniesPage() {
  const supabase = await createClient();
  
  const { data: companies } = await supabase
    .from('companies')
    .select('*')
    .order('name');

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building className="h-6 w-6 text-orange-600" />
            Gestión de Empresas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Administra las distintas razones sociales o empresas del holding
          </p>
        </div>
      </div>

      <CompaniesClient initialCompanies={companies || []} />
    </div>
  );
}
