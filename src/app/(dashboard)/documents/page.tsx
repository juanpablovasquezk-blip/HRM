import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
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
import { Plus, FileText, AlertTriangle } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

export default async function DocumentsPage() {
  const supabase = await createClient();

  const { data: documents } = await supabase
    .from('documents')
    .select('*, personnel:personnel(first_name, last_name_father, rut)')
    .order('expiration_date', { ascending: true });

  const today = new Date();

  const stats = {
    total: documents?.length || 0,
    expired: documents?.filter(d => d.expiration_date && differenceInDays(new Date(d.expiration_date), today) < 0).length || 0,
    expiring: documents?.filter(d => {
      if (!d.expiration_date) return false;
      const days = differenceInDays(new Date(d.expiration_date), today);
      return days >= 0 && days <= 30;
    }).length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Compliance document tracking & management
          </p>
        </div>
        <Link href="/documents/upload">
          <Button className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/25">
            <Plus className="mr-2 h-4 w-4" />
            Upload Document
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-orange-600 dark:bg-blue-900/30 dark:text-blue-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Documents</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.expiring}</p>
              <p className="text-xs text-muted-foreground">Expiring Soon</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.expired}</p>
              <p className="text-xs text-muted-foreground">Expired</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-0" />
        <CardContent className="p-0">
          {documents && documents.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Expiration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Approval</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => {
                    const personnel = doc.personnel as { first_name: string; last_name_father: string; rut: string } | null;
                    const daysLeft = doc.expiration_date
                      ? differenceInDays(new Date(doc.expiration_date), today)
                      : null;
                    const status =
                      daysLeft === null
                        ? 'unknown'
                        : daysLeft < 0
                        ? 'expired'
                        : daysLeft <= 30
                        ? 'expiring_soon'
                        : 'valid';

                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <Link 
                            href={`/personnel/${doc.personnel_id}`}
                            className="group flex flex-col hover:underline text-blue-600 dark:text-blue-400 font-semibold"
                          >
                            <span>{personnel?.first_name} {personnel?.last_name_father}</span>
                            <span className="text-xs text-muted-foreground font-mono font-normal">
                              {personnel?.rut}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{doc.type}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {doc.number || '—'}
                        </TableCell>
                        <TableCell>
                          {doc.expiration_date
                            ? format(new Date(doc.expiration_date), 'PP')
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              status === 'expired'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : status === 'expiring_soon'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            }
                          >
                            {status === 'expired'
                              ? 'Expired'
                              : status === 'expiring_soon'
                              ? `${daysLeft}d left`
                              : 'Valid'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              doc.status === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : doc.status === 'REJECTED'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }
                          >
                            {doc.status === 'APPROVED'
                              ? 'Aprobado'
                              : doc.status === 'REJECTED'
                              ? 'Rechazado'
                              : 'Pendiente'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(doc.uploaded_at), 'PP')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/personnel/${doc.personnel_id}`}>
                            <Button 
                              variant={doc.status === 'PENDING' ? 'default' : 'outline'} 
                              size="sm" 
                              className={doc.status === 'PENDING' ? "bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-sm" : "font-semibold"}
                            >
                              {doc.status === 'PENDING' ? 'Validar' : 'Ver Ficha'}
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
              <FileText className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">
                No documents found. Upload your first document.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
