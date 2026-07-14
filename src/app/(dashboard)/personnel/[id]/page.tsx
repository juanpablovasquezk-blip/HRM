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
import { ArrowLeft, Edit, FileText, Cake, Moon, SunMedium, AlertTriangle, Mail, Repeat, CalendarCheck, Pin, ShieldCheck, User, Printer } from 'lucide-react';

import { format, differenceInDays, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { DocumentActions } from './document-actions';
import { calculateDynamicExpiration, calculateIntervalExpiration } from '@/lib/utils/document-calc';
import { AccessActions } from './access-actions';
import { LettersCard } from '@/components/personnel/letters-card';
import { getUserRole } from '@/app/role-actions';

export default async function PersonnelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: person, error }, 
    { data: allPositions }, 
    { data: allShifts },
    { data: lettersData },
    role
  ] = await Promise.all([
    supabase.from('personnel').select('*, company:companies(name), documents(*)').eq('id', id).single(),
    supabase.from('positions').select('id, name'),
    supabase.from('shifts').select('id, name'),
    supabase.from('personnel_letters').select('*').eq('personnel_id', id).order('date', { ascending: false }),
    getUserRole()
  ]);

  if (error || !person) notFound();

  const posMap = Object.fromEntries((allPositions || []).map((p: any) => [p.id, p.name]));
  const shiftMap = Object.fromEntries((allShifts || []).map((s: any) => [s.id, s.name]));
  const address = (person.address as { street?: string; city?: string; region?: string }) || {};
  
  // 1. Fetch all definitions to know which ones are mandatory
  const { data: allDefs } = await supabase.from('document_definitions').select('*').eq('is_active', true);
  const definitions = (allDefs || []).filter(def => {
    if (!def.applicable_positions || def.applicable_positions.length === 0) return true;
    return def.applicable_positions.includes(person.main_position);
  });

  const documents = (person.documents as Array<{ id: string; definition_id: string; type: string; expiration_date: string | null; file_url: string; uploaded_at: string; status: string }>) || [];

  // Dynamic Missing Documents Logic
  // Match by definition_id for new uploads, OR by type name for legacy uploads
  const uploadedDefIds = new Set(documents.map((doc: any) => doc.definition_id).filter(Boolean));
  const uploadedTypes = new Set(
    documents.map((doc: any) => (doc.type || '').toLowerCase().trim()).filter(Boolean)
  );

  const missingDocs = definitions
    .filter(def => {
      if (!def.is_mandatory) return false;
      if (uploadedDefIds.has(def.id)) return false; // matched by definition_id
      if (uploadedTypes.has((def.name || '').toLowerCase().trim())) return false; // legacy match by name
      return true;
    })
    .map(def => def.name);

  return (
    <div className="space-y-6 max-w-5xl pb-20">
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
          {person.user_id && (
            <Badge className="mt-2 bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200 flex w-fit items-center gap-1.5">
              <ShieldCheck className="h-3 w-3" />
              Acceso Habilitado
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/personnel-print/${id}`} target="_blank">
            <Button variant="outline" className="border-orange-200 text-orange-700 hover:bg-orange-50 gap-1.5">
              <Printer className="h-4 w-4" />
              Imprimir Ficha
            </Button>
          </Link>
          <Link href={`/personnel/${id}/edit`}>
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
          </Link>
        </div>

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
                     person.rotation_pattern === 'l-v' ? 'Lunes a Viernes (Fijo)' :
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
              <CardTitle className="text-base">Estado y Acceso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge className={person.is_active
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }>
                  {person.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
              <Separator className="opacity-50" />
              <div className="space-y-1">
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Credenciales del Sistema</p>
                <AccessActions 
                  personnelId={id} 
                  hasAccess={!!person.user_id} 
                  email={person.email} 
                />
              </div>
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
              Gestión Documental
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
                  <TableHead>Estado</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Vigencia</TableHead>
                  <TableHead>Subido</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc: any) => {
                  const def = definitions.find(d => d.id === doc.definition_id)
                    // Fallback: match by name for legacy uploads without definition_id
                    || definitions.find(d =>
                        (d.name || '').toLowerCase().trim() === (doc.type || '').toLowerCase().trim()
                      );
                  // Only use stored expiration_date if the definition requires expiration
                  // (or if there's no definition, i.e. legacy upload — respect whatever was stored)
                  const hasExpiration = !def || def.requires_expiration !== false;
                  let displayExpiry = (hasExpiration && doc.expiration_date)
                    ? new Date(doc.expiration_date + 'T12:00:00')
                    : null;
                  let isCalculated = false;

                  // If no manual expiry, check for dynamic calculation
                  if (!displayExpiry && def?.requires_expiration) {
                    if (def.depends_on_definition_id) {
                      const anchorDoc = documents.find(d => d.definition_id === def.depends_on_definition_id);
                      if (anchorDoc?.expiration_date) {
                        displayExpiry = calculateDynamicExpiration(
                          parseISO(anchorDoc.expiration_date),
                          def.cycle_months || 6,
                          def.anchor_days_offset || 30
                        );
                        isCalculated = true;
                      }
                    } else if (doc.uploaded_at) {
                      displayExpiry = calculateIntervalExpiration(
                        parseISO(doc.uploaded_at),
                        def.cycle_months || 6
                      );
                      isCalculated = true;
                    }
                  }

                  const daysLeft = displayExpiry
                    ? differenceInDays(displayExpiry, new Date())
                    : null;
                  
                  return (
                    <TableRow key={doc.id}>
                      <TableCell className="font-bold text-slate-700">
                        {doc.type}
                        {def?.is_mandatory && (
                          <span className="ml-1 text-[9px] bg-red-100 text-red-600 px-1 rounded font-black uppercase">Obligatorio</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-bold uppercase text-[10px]",
                            doc.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                            doc.status === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-100' :
                            'bg-amber-50 text-amber-700 border-amber-100'
                          )}
                        >
                          {doc.status === 'APPROVED' ? 'Aprobado' : 
                           doc.status === 'REJECTED' ? 'Rechazado' : 'Pendiente'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{displayExpiry ? format(displayExpiry, 'dd/MM/yyyy') : '—'}</span>
                          {isCalculated && (
                            <span className="text-[9px] text-indigo-500 font-bold uppercase italic">Calculado</span>
                          )}
                        </div>
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
                          <span className="text-muted-foreground text-xs italic">Sin fecha</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {format(new Date(doc.uploaded_at), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        {doc.file_url ? (
                          <div className="flex justify-end items-center gap-1">
                             <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="icon" title="Ver Documento" className="h-8 w-8 text-orange-600">
                                <FileText className="h-4 w-4" />
                              </Button>
                             </a>
                             <DocumentActions 
                               documentId={doc.id} 
                               currentStatus={doc.status} 
                               personnelId={id} 
                             />
                          </div>
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
            <div className="py-8 text-center text-sm text-muted-foreground font-medium">
              No hay documentos subidos aún para este funcionario.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cartas de Felicitación y Amonestación */}
      <LettersCard 
        personnelId={id} 
        initialLetters={lettersData || []} 
        role={role} 
      />
    </div>
  );
}
