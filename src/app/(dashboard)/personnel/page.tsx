import Link from 'next/link';
export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Users as UsersIcon, FileSpreadsheet, Edit, AlertTriangle, CheckCircle2, Clock, ClipboardCheck } from 'lucide-react';
import { PersonnelFilters } from './personnel-filters';
import { differenceInDays, parseISO } from 'date-fns';

export default async function PersonnelPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; company_id?: string; position_id?: string; status?: 'active' | 'inactive' | 'all' }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let positionIds: string[] = [];
  if (params.position_id) {
    const { data: posData } = await supabase
      .from('positions')
      .select('name')
      .eq('id', params.position_id)
      .single();

    if (posData) {
      const { data: shared } = await supabase
        .from('positions')
        .select('id')
        .eq('name', posData.name);
      positionIds = shared?.map(p => p.id) || [];
    }
  }

  let query = supabase
    .from('personnel')
    .select('*, company:companies!personnel_company_id_fkey(name)')
    .order('last_name_father', { ascending: true });

  const status = params.status || 'active';
  if (status === 'active') {
    query = query.eq('is_active', true);
  } else if (status === 'inactive') {
    query = query.eq('is_active', false);
  }

  if (positionIds.length > 0) {
    query = query.in('main_position', positionIds);
  }

  if (params.search) {
    query = query.or(
      `first_name.ilike.%${params.search}%,last_name_father.ilike.%${params.search}%,rut.ilike.%${params.search}%`
    );
  }

  const [
    { data: personnel, error: pErr }, 
    { data: positions, error: posErr }, 
    { data: companies, error: cErr }, 
    { data: shifts, error: sErr }
  ] = await Promise.all([
    query,
    supabase.from('positions').select('id, name'),
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('shifts').select('id, name')
  ]);

  if (pErr || posErr || cErr || sErr) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
        <h2 className="font-bold mb-2">Error detectado en la base de datos:</h2>
        <pre className="text-xs overflow-auto">
          {JSON.stringify({ personnel: pErr, positions: posErr, companies: cErr, shifts: sErr }, null, 2)}
        </pre>
      </div>
    );
  }

  const positionMap = Object.fromEntries((positions || []).map(p => [p.id, p.name]));
  const shiftMap = Object.fromEntries((shifts || []).map(s => [s.id, s.name]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Personal</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona tu fuerza laboral — {personnel?.length ?? 0} trabajadores {status === 'active' ? 'activos' : status === 'inactive' ? 'de baja' : 'registrados'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/personnel/import">
            <Button variant="outline" className="border-slate-200 text-slate-600 hover:text-orange-600">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Importar Masivo
            </Button>
          </Link>
          <Link href="/personnel/new">
            <Button className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/25">
              <Plus className="mr-2 h-4 w-4" />
              Agregar Personal
            </Button>
          </Link>
        </div>
      </div>

      {/* Search */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-3">
          <PersonnelFilters 
            initialSearch={params.search} 
            initialCompanyId={params.company_id} 
            initialPositionId={params.position_id}
            initialStatus={status}
            companies={companies || []} 
            positions={positions || []}
          />
        </CardHeader>
        <CardContent className="p-0">
          {personnel && personnel.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>RUT</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Planificación</TableHead>
                    <TableHead>Preferencias</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {personnel.map((p) => {
                    const person = p as {
                      id: string;
                      first_name: string;
                      last_name_father: string;
                      last_name_mother: string;
                      rut: string;
                      main_position: string;
                      phone: string | null;
                      prefers_night: boolean;
                      avoids_night: boolean;
                      company: { name: string } | null;
                      rotation_pattern: string | null;
                      fixed_shift_id: string | null;
                      documents: Array<{ definition_id: string; expiration_date: string | null; status: string }>;
                    };

                    // Compliance Calculation (Simplified until tables are fixed)
                    const complianceStatus: 'critical' | 'warning' | 'review' | 'ok' = 'ok';
                    const uploadedIds: string[] = [];

                    return (
                    <TableRow key={person.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Link
                            href={`/personnel/${person.id}`}
                            className="font-medium text-orange-600 hover:text-orange-700 dark:text-blue-400 hover:underline inline-flex items-center gap-1.5"
                          >
                            {person.first_name} {person.last_name_father} {person.last_name_mother}
                          </Link>
                          <div className="flex gap-1">
                            {/* Status messages hidden during debug */}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {person.rut}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {positionMap[person.main_position] || person.main_position}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {person.company?.name || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit text-[10px] font-semibold bg-orange-50/50 text-orange-700 border-orange-200">
                            {person.rotation_pattern === '5x2' ? '5x2 Rotativo' : 
                             person.rotation_pattern === '7x7' ? '7x7 Canes' : 
                             person.rotation_pattern === '4x4_noche' ? '4x4 Noche' : 
                             person.rotation_pattern || 'Estándar'}
                          </Badge>
                          {person.fixed_shift_id && (
                            <div className="text-[10px] text-slate-500 italic">
                              Turno: {shiftMap[person.fixed_shift_id] || 'Fijo'}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {person.prefers_night && (
                            <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 text-[10px]">
                              Noche
                            </Badge>
                          )}
                          {person.avoids_night && (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
                              No Noche
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/personnel/${person.id}/edit`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-orange-600">
                             <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 mb-4">
                <UsersIcon className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">
                No se encontró personal. Comienza agregando a tu primer trabajador.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
