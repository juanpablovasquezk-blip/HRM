import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
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
import { CalendarDays, Clock, MapPin, Layers, Zap } from 'lucide-react';

export default async function ShiftsPage() {
  const supabase = await createClient();

  const { data: shifts } = await supabase
    .from('shifts')
    .select('*')
    .order('start_time');

  const { data: areas } = await supabase
    .from('areas')
    .select('*, positions(count)')
    .order('name');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shift Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage shifts, areas, positions, and run the scheduling engine
          </p>
        </div>
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/shifts/manage">
          <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-orange-600 dark:bg-blue-900/30 dark:text-blue-400 group-hover:scale-110 transition-transform">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">Manage Shifts</p>
                <p className="text-xs text-muted-foreground">{shifts?.length || 0} shifts defined</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/shifts/areas">
          <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">Areas & Positions</p>
                <p className="text-xs text-muted-foreground">{areas?.length || 0} areas</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/shifts/dotacion">
          <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 group-hover:scale-110 transition-transform">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">Master Requirements</p>
                <p className="text-xs text-muted-foreground">Reglas de dotación</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/shifts/daily">
          <Card className="border-indigo-100 dark:border-indigo-900 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group bg-indigo-50/30">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">Daily Planning</p>
                <p className="text-xs text-muted-foreground">Cambios día a día</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/shifts/assignments">
          <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400 group-hover:scale-110 transition-transform">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">Assignments</p>
                <p className="text-xs text-muted-foreground">View schedule</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Shifts Table */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Shift Definitions</CardTitle>
            <Link href="/shifts/manage">
              <Button variant="outline" size="sm">
                <Zap className="mr-2 h-3.5 w-3.5" />
                Manage
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {shifts && shifts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Transport</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell className="font-medium">{shift.name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {shift.start_time?.slice(0, 5)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {shift.end_time?.slice(0, 5)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {shift.duration_hours}h
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {shift.requires_transport ? (
                        <Badge className="bg-blue-100 text-orange-700 dark:bg-blue-900/30 dark:text-blue-400">
                          Required
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">No</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No shifts defined yet. Create your first shift.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
