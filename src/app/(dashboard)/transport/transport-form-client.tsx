'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createTransportLog } from './actions';

interface TransportFormClientProps {
  personnel: Array<{ id: string; first_name: string; last_name_father: string }>;
}

export function TransportFormClient({ personnel }: TransportFormClientProps) {
  const [isPending, startTransition] = useTransition();
  const [usedTransport, setUsedTransport] = useState(false);

  const handleSubmit = (formData: FormData) => {
    formData.set('used_company_transport', String(usedTransport));
    startTransition(async () => {
      const result = await createTransportLog(formData);
      if (result.error) toast.error('Error', { description: result.error });
      else toast.success('Transport log created');
    });
  };

  return (
    <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="h-4 w-4" />
          New Transport Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="transport-personnel">Personnel</Label>
            <select id="transport-personnel" name="personnel_id" required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Select</option>
              {personnel.map(p => (
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name_father}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="transport-date">Date</Label>
            <Input id="transport-date" name="date" type="date" required
              defaultValue={new Date().toISOString().split('T')[0]} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transport-reservation">Reservation #</Label>
            <Input id="transport-reservation" name="reservation_number" placeholder="Optional" />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={usedTransport} onCheckedChange={setUsedTransport} />
              <Label className="text-xs whitespace-nowrap">Company Transport</Label>
            </div>
          </div>
          <div className="md:col-span-3 space-y-2">
            <Label htmlFor="transport-issues">Issues</Label>
            <Textarea id="transport-issues" name="issues" placeholder="Report any issues..." rows={2} />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={isPending}
              className="bg-gradient-to-r from-orange-500 to-orange-600 text-white w-full">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log Entry'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
