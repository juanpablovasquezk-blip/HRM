import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Edit, FileText, Cake, Moon, SunMedium, AlertTriangle, Mail, Repeat, CalendarCheck, Pin } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

export default async function PersonnelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: person, error }, { data: allPositions }, { data: allShifts }] = await Promise.all([
    supabase.from('personnel').select('*, company:companies(name), documents(*)').eq('id', id).single(),
    supabase.from('positions').select('id, name'),
    supabase.from('shifts').select('id, name'),
  ]);

  if (error || !person) notFound();

  const posMap = Object.fromEntries((allPositions || []).map((p: any) => [p.id, p.name]));
  const shiftMap = Object.fromEntries((allShifts || []).map((s: any) => [s.id, s.name]));
  const address = (person.address as { street?: string; city?: string; region?: string }) || {};
  const documents = (person.documents as Array<{ id: string; type: string; expiration_date: string | null; file_url: string; uploaded_at: string }>) || [];

  // Logica de Cumplimiento de Documentos
  const uploadedTypes = documents.map(doc => doc.type);
  const missingDocs: string[] = [];

  if (!uploadedTypes.includes('Cédula de Identidad')) {
    missingDocs.push('Cédula de Identidad');
  }
  if (!uploadedTypes.includes('Antecedentes para fines especiales')) {
    missingDocs.push('Antecedentes para fines especiales');
  }

  const hasPCP = uploadedTypes.includes('PCP');
  if (hasPCP) {
    if (!uploadedTypes.includes('Licencia de Conducir')) {
      missingDocs.push('Licencia de Conducir (Requerido por tener PCP)');
    }
    if (!uploadedTypes.includes('Hoja de vida del conductor')) {
      missingDocs.push('Hoja de vida del conductor (Requerido por tener PCP)');
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/personnel">
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {person.first_name} {person.last_name_father} {person.last_name_mother}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {person.rut} · {(person.company as { name: string } | null)?.name}
          </p>
        </div>
        <Link href={`/personnel/${id}/edit`}>
          <Button variant="outline">
            <Edit className="mr-2 h-4 w-4" />
            Editar
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Información Personal */}
        <Card className="lg:col-span-2 border-slate-200/60 dark:border-slate-800 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Información Personal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Fecha de Nacimiento</p>
                <p className="font-medium flex items-center gap-1.5">
                  <Cake className="h-3.5 w-3.5" />
                  {person.birth_date ? format(new Date(person.birth_date), 'PPP') : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Teléfono</p>
                <p className="font-medium">{person.phone || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Email</p>
                <p className="font-medium flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
                  <Mail className="h-3.5 w-3.5" />
                  {person.email || '—'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Dirección</p>
                <p className="font-medium">
                  {[address.street, address.city, address.region].filter(Boolean).join(', ') || '—'}
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Cargo Principal</p>
                <Badge variant="secondary" className="mt-1">{posMap[person.main_position] || person.main_position}</Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Cargos Secundarios</p>
                <div className="flex gap-1 flex-wrap mt-1">
                  {(person.secondary_positions as string[])?.length > 0
                    ? (person.secondary_positions as string[]).map((pos: string) => (
                        <Badge key={pos} variant="outline" className="text-xs">{posMap[pos] || pos}</Badge>
                      ))
                    : <span className="text-muted-foreground">—</span>}
                </div>
              </div>
              <div>
                <p className="text-muted-foreground">Licencias de Conducir</p>
                <div className="flex gap-1 flex-wrap mt-1">
                  {(person.driver_licenses as string[])?.length > 0
                    ? (person.driver_licenses as string[]).map((lic: string) => (
                        <Badge key={lic} className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                          {lic}
                        </Badge>
                      ))
                    : <span className="text-muted-foreground">—</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preferencias */}
        <div className="space-y-4">
          <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Preferencias de Turno</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-indigo-500" />
                <span className="text-sm">
                  Prefiere Nocturno: <strong>{person.prefers_night ? 'Sí' : 'No'}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <SunMedium className="h-4 w-4 text-amber-500" />
                <span className="text-sm">
                  Evita Nocturno: <strong>{person.avoids_night ? 'Sí' : 'No'}</strong>
                </span>
              </div>
              <Separator className="my-2" />
              <div className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-orange-500" />
                <span className="text-sm">
                  Rotación: <strong>
                    {person.rotation_pattern === '5x2' ? '5x2 Rotativo (Semanal)' : 
                     person.rotation_pattern === '7x7' ? '7x7 Canes' : 
                     person.rotation_pattern === '4x4_noche' ? '4x4 Noche' : 
                     person.rotation_pattern || 'Estándar'}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Pin className="h-4 w-4 text-emerald-500" />
                <span className="text-sm">
                  Turno Fijo: <strong>{person.fixed_shift_id ? shiftMap[person.fixed_shift_id] : 'No asignado'}</strong>
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Estado</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge className={person.is_active
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }>
                {person.is_active ? 'Activo' : 'Inactivo'}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Alertas de Cumplimiento */}
      {missingDocs.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-4 flex gap-3 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-red-800 dark:text-red-400">
              Faltan documentos requeridos
            </h4>
            <ul className="text-sm text-red-700 dark:text-red-300 list-disc list-inside">
              {missingDocs.map((doc, i) => (
                <li key={i}>{doc}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Documentos */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Documentos
            </CardTitle>
            <Link href={`/documents/upload?personnel_id=${id}`}>
              <Button variant="outline" size="sm">
                Subir Documento
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {documents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Subido</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => {
                  const daysLeft = doc.expiration_date
                    ? differenceInDays(new Date(doc.expiration_date), new Date())
                    : null;
                  return (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">{doc.type}</TableCell>
                      <TableCell>
                        {doc.expiration_date
                          ? format(new Date(doc.expiration_date), 'PP')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {daysLeft !== null ? (
                          <Badge
                            className={
                              daysLeft < 0
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : daysLeft < 30
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            }
                          >
                            {daysLeft < 0
                              ? 'Vencido'
                              : daysLeft < 30
                              ? `${daysLeft}d restantes`
                              : 'Vigente'}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(doc.uploaded_at), 'PP')}
                      </TableCell>
                      <TableCell className="text-right">
                        {doc.file_url ? (
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" className="h-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/50">
                              <FileText className="mr-2 h-4 w-4" />
                              Ver Doc
                            </Button>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground mr-2">N/A</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No hay documentos subidos aún.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
