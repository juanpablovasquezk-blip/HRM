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
import { Bus, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { TransportFormClient } from './transport-form-client';

export default async function TransportPage() {
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from('transport_logs')
    .select('*, personnel:personnel(first_name, last_name_father)')
    .order('date', { ascending: false })
    .limit(50);

  const { data: personnel } = await supabase
    .from('personnel')
    .select('id, first_name, last_name_father')
    .eq('is_active', true)
    .order('last_name_father');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transport Control</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Daily transport log entry by supervisors
        </p>
      </div>

      <TransportFormClient personnel={personnel || []} />

      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bus className="h-4 w-4" />
            Transport Logs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logs && logs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Personnel</TableHead>
                  <TableHead>Company Transport</TableHead>
                  <TableHead>Reservation</TableHead>
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const person = log.personnel as { first_name: string; last_name_father: string } | null;
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm font-medium">{format(new Date(log.date), 'PP')}</TableCell>
                      <TableCell>{person?.first_name} {person?.last_name_father}</TableCell>
                      <TableCell>
                        {log.used_company_transport
                          ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Yes</Badge>
                          : <Badge variant="secondary">No</Badge>
                        }
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.reservation_number || '—'}</TableCell>
                      <TableCell>
                        {log.issues ? (
                          <span className="text-sm text-red-600 flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {log.issues}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">None</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Bus className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No transport logs found.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
