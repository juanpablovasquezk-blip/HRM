import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Briefcase } from 'lucide-react';
import { format } from 'date-fns';
import { LeaveActions } from './leave-actions-client';

export default async function LeavesPage() {
  const supabase = await createClient();

  const { data: leaves } = await supabase
    .from('leaves')
    .select('*, personnel:personnel(first_name, last_name_father, rut)')
    .order('created_at', { ascending: false });

  const pending = leaves?.filter((l) => l.status === 'pending') || [];
  const approved = leaves?.filter((l) => l.status === 'approved') || [];
  const rejected = leaves?.filter((l) => l.status === 'rejected') || [];

  const statusBadge: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const typeBadge: Record<string, string> = {
    vacation: 'bg-blue-100 text-orange-700 dark:bg-blue-900/30 dark:text-blue-400',
    sick: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    personal: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
    maternity: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    free_request: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  };

  const renderTable = (data: any[]) => {
    if (!data || data.length === 0) return <EmptyState />;

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Personal</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Desde</TableHead>
            <TableHead>Hasta</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((leave) => {
            const person = leave.personnel;
            return (
              <TableRow key={leave.id}>
                <TableCell>
                  {person ? (
                    <div>
                      <p className="font-medium">{person.first_name} {person.last_name_father}</p>
                      <p className="text-xs text-muted-foreground font-mono">{person.rut}</p>
                    </div>
                  ) : (
                    <span className="text-red-500 text-xs italic">Personal no encontrado ({leave.personnel_id})</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={
                    (leave.type === 'other' && leave.reason === 'Solicitud mensual de días libres')
                      ? typeBadge.free_request 
                      : (typeBadge[leave.type] || typeBadge.other)
                  }>
                    {leave.type === 'vacation' ? 'Vacaciones' : 
                     leave.type === 'sick' ? 'Licencia Médica' : 
                     leave.type === 'personal' ? 'Administrativo' : 
                     (leave.type === 'other' && leave.reason === 'Solicitud mensual de días libres') ? 'Solicitud de Libre' : 
                     leave.type === 'other' ? 'Otro' : leave.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{leave.start_date}</TableCell>
                <TableCell className="text-sm">{leave.end_date}</TableCell>
                <TableCell>
                  <Badge className={statusBadge[leave.status]}>
                    {leave.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <LeaveActions leaveId={leave.id} status={leave.status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestión de Ausencias</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Administra vacaciones, licencias médicas y días administrativos
          </p>
        </div>
        <Link href="/leaves/request">
          <Button className="bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25">
            <Plus className="mr-2 h-4 w-4" />
            Ingresar Ausencia
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-slate-200/60 shadow-sm border-l-4 border-l-amber-500">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{pending.length}</p>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Pendientes</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/60 shadow-sm border-l-4 border-l-emerald-500">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{approved.length}</p>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Aprobadas</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/60 shadow-sm border-l-4 border-l-red-500">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{rejected.length}</p>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Rechazadas</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-slate-50/50 dark:bg-slate-900/50 h-auto p-0">
            <TabsTrigger value="pending" className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 px-6 py-4 transition-all">
              Pendientes ({pending.length})
            </TabsTrigger>
            <TabsTrigger value="approved" className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 px-6 py-4 transition-all">
              Aprobadas ({approved.length})
            </TabsTrigger>
            <TabsTrigger value="rejected" className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 px-6 py-4 transition-all">
              Rechazadas ({rejected.length})
            </TabsTrigger>
          </TabsList>
          <div className="bg-white dark:bg-slate-950">
            <TabsContent value="pending" className="mt-0">{renderTable(pending)}</TabsContent>
            <TabsContent value="approved" className="mt-0">{renderTable(approved)}</TabsContent>
            <TabsContent value="rejected" className="mt-0">{renderTable(rejected)}</TabsContent>
          </div>
        </Tabs>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-16 text-center text-sm text-muted-foreground">
      <Briefcase className="h-10 w-10 mx-auto mb-4 opacity-20 text-slate-400" />
      <p className="font-medium text-slate-500">No hay registros en esta categoría</p>
    </div>
  );
}
