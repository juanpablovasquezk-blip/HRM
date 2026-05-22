import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format, addDays } from 'date-fns';
import { getFreezeStatus } from '@/lib/scheduler';
import { CalendarDays, Lock, Hand, Snowflake, Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function AssignmentsPage() {
  const supabase = await createClient();

  const today = new Date();
  const startDate = format(today, 'yyyy-MM-dd');
  const endDate = format(addDays(today, 7), 'yyyy-MM-dd');

  const { data: assignments } = await supabase
    .from('shift_assignments')
    .select(
      '*, personnel:personnel(first_name, last_name_father), shift:shifts(name, start_time, end_time), area:areas(name), position:positions(name)'
    )
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });

  return (
    <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Asignaciones de Turnos</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {format(today, 'PP')} — {format(addDays(today, 7), 'PP')} · Próximos 7 días
            </p>
          </div>
          <Link href="/shifts/assignments/manual">
            <Button className="bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-500/25">
              <Plus className="mr-2 h-4 w-4" />
              Cargar Turno Manual
            </Button>
          </Link>
        </div>

      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Assignment Table
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignments && assignments.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Personnel</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => {
                    const person = a.personnel as { first_name: string; last_name_father: string } | null;
                    const shift = a.shift as { name: string; start_time: string; end_time: string } | null;
                    const area = a.area as { name: string } | null;
                    const position = a.position as { name: string } | null;
                    const freeze = getFreezeStatus(a.date);

                    return (
                      <TableRow key={a.id} className={freeze.frozen ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{format(new Date(a.date), 'EEE, MMM d')}</p>
                            <Badge className={`text-[10px] mt-0.5 ${freeze.color}`}>{freeze.label}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {person?.first_name} {person?.last_name_father}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{shift?.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {shift?.start_time?.slice(0, 5)} — {shift?.end_time?.slice(0, 5)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{area?.name || '—'}</TableCell>
                        <TableCell className="text-sm">{position?.name || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {a.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {a.is_locked && (
                              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] gap-0.5">
                                <Lock className="h-2.5 w-2.5" /> Locked
                              </Badge>
                            )}
                            {a.is_manual && (
                              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] gap-0.5">
                                <Hand className="h-2.5 w-2.5" /> Manual
                              </Badge>
                            )}
                            {a.frozen_by_rule && (
                              <Badge className="bg-blue-100 text-orange-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] gap-0.5">
                                <Snowflake className="h-2.5 w-2.5" /> Frozen
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No assignments found for this period.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
