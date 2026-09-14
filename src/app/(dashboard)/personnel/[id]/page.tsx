import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
import { ArrowLeft, Edit, FileText, Cake, Moon, SunMedium, AlertTriangle, Mail, Repeat, CalendarCheck, Pin, ShieldCheck, ShieldOff, User, Printer } from 'lucide-react';

import { format, differenceInDays, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { DocumentActions } from './document-actions';
import { calculateDynamicExpiration, calculateIntervalExpiration } from '@/lib/utils/document-calc';
import { syncDependentDocumentsExpiration } from '@/lib/documents/sync-expiry';
import { AccessActions } from './access-actions';
import { LettersCard } from '@/components/personnel/letters-card';
import { getUserRole } from '@/app/role-actions';
import { hasPermission } from '@/lib/auth/roles';
import { ContractDownloadButton } from './contract-download-button';
import { TicaLetterDownloadButton } from './tica-letter-download-button';
import { DismissalPanelClient } from './dismissal-panel-client';
import { RiohsGadget } from './riohs/riohs-gadget';
import { PersonnelBonusesCard } from './personnel-bonuses-card';

export default async function PersonnelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  // Sync dynamic expiration & clean duplicates on load
  await syncDependentDocumentsExpiration(id, adminSupabase);

  const [
    { data: person, error }, 
    { data: allPositions }, 
    { data: allShifts },
    { data: lettersData },
    { data: riohsRecord },
    { data: companyDocsData },
    { data: bonusesData },
    { data: contractHistoryData },
    role
  ] = await Promise.all([
    supabase.from('personnel').select('*, company:companies(id, name, rut, legal_name), documents(*)').eq('id', id).single(),
    supabase.from('positions').select('id, name'),
    supabase.from('shifts').select('id, name'),
    supabase.from('personnel_letters').select('*').eq('personnel_id', id).order('date', { ascending: false }),
    adminSupabase.from('riohs_records').select('*').eq('personnel_id', id).maybeSingle(),
    supabase.from('company_documents').select('*'),
    adminSupabase.from('special_bonuses').select('*').eq('personnel_id', id).order('date', { ascending: false }),
    adminSupabase.from('personnel_contract_history').select('*').eq('personnel_id', id).order('start_date', { ascending: false }),
    getUserRole()
  ]);

  if (error || !person) notFound();

  const canEdit = hasPermission(role as any, 'managePersonnel');

  // Fetch dismissal records if there is a dismissal process
  let dismissalRecords: any[] = [];
  if (person.dismissal_status === 'pending' || person.dismissal_status === 'completed' || !person.is_active) {
    const { data: recs } = await supabase
      .from('dismissal_records')
      .select('*')
      .eq('personnel_id', id)
      .order('created_at', { ascending: true });
    dismissalRecords = recs || [];
  }

  const posMap = Object.fromEntries((allPositions || []).map((p: any) => [p.id, p.name]));
  const shiftMap = Object.fromEntries((allShifts || []).map((s: any) => [s.id, s.name]));
  const address = (person.address as { street?: string; city?: string; region?: string }) || {};
  
  // 1. Fetch all definitions to know which ones are mandatory
  const { data: allDefs } = await supabase.from('document_definitions').select('*').eq('is_active', true);
  const definitions = (allDefs || []).filter(def => {
    if (!def.applicable_positions || def.applicable_positions.length === 0) return true;
    return def.applicable_positions.includes(person.main_position);
  });

  const rawDocuments = (person.documents as Array<{ id: string; definition_id: string; type: string; number?: string | null; expiration_date: string | null; file_url: string; uploaded_at: string; status: string }>) || [];
  // Sort by uploaded_at DESC so newest documents are always first
  const allDocuments = [...rawDocuments].sort((a, b) => new Date(b.uploaded_at || 0).getTime() - new Date(a.uploaded_at || 0).getTime());

  // Deduplicate and filter out RIOHS documents for general documents table
  const seenGeneralKeys = new Set<string>();
  const generalDocuments = allDocuments
    .filter((doc) => !doc.type?.toUpperCase().startsWith('RIOHS'))
    .filter((doc) => {
      const def = definitions.find(d => d.id === doc.definition_id)
        || definitions.find(d => (d.name || '').toLowerCase().trim() === (doc.type || '').toLowerCase().trim());
      const key = def ? `def_${def.id}` : `type_${(doc.type || '').toLowerCase().trim()}`;
      if (seenGeneralKeys.has(key)) return false;
      seenGeneralKeys.add(key);
      return true;
    });

  // Dynamic Missing Documents Logic
  // Match by definition_id for new uploads, OR by type name for legacy uploads
  const uploadedDefIds = new Set(allDocuments.map((doc: any) => doc.definition_id).filter(Boolean));
  const uploadedTypes = new Set(
    allDocuments.map((doc: any) => (doc.type || '').toLowerCase().trim()).filter(Boolean)
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
          {person.is_active ? (
            person.user_id ? (
              <Badge className="mt-2 bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200 flex w-fit items-center gap-1.5">
                <ShieldCheck className="h-3 w-3" />
                Acceso Portal Habilitado
              </Badge>
            ) : null
          ) : (
            <Badge className="mt-2 bg-red-100 text-red-700 hover:bg-red-200 border-red-200 flex w-fit items-center gap-1.5 font-bold">
              <ShieldOff className="h-3 w-3" />
              Inactivo / Baja
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <ContractDownloadButton person={person} />
              <TicaLetterDownloadButton person={person} />
            </>
          )}
          <Link href={`/personnel-print/${id}`} target="_blank">
            <Button variant="outline" className="border-orange-200 text-orange-700 hover:bg-orange-50 gap-1.5">
              <Printer className="h-4 w-4" />
              Imprimir Ficha
            </Button>
          </Link>
          {canEdit && (
            <Link href={`/personnel/${id}/edit`}>
              <Button variant="outline">
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </Button>
            </Link>
          )}
        </div>

      </div>

      {(person.dismissal_status === 'pending' || (dismissalRecords && dismissalRecords.length > 0)) && (
        <DismissalPanelClient
          personnelId={id}
          personName={`${person.first_name} ${person.last_name_father} ${person.last_name_mother || ''}`.trim()}
          personRut={person.rut}
          mainPositionName={posMap[person.main_position] || person.main_position}
          dismissalReason={person.inactive_reason || ''}
          ticaNumber={
            allDocuments.find((d: any) =>
              (d.definition_id && definitions.find(def => def.id === d.definition_id)?.name.toLowerCase().includes('tica')) ||
              (d.type || '').toLowerCase().includes('tica')
            )?.number || ''
          }
          pcpNumber={
            allDocuments.find((d: any) =>
              (d.definition_id && definitions.find(def => def.id === d.definition_id)?.name.toLowerCase().includes('pcp')) ||
              (d.type || '').toLowerCase().includes('pcp')
            )?.number || ''
          }
          ticaExpiry={
            allDocuments.find((d: any) =>
              (d.definition_id && definitions.find(def => def.id === d.definition_id)?.name.toLowerCase().includes('tica')) ||
              (d.type || '').toLowerCase().includes('tica')
            )?.expiration_date || ''
          }
          pcpExpiry={
            allDocuments.find((d: any) =>
              (d.definition_id && definitions.find(def => def.id === d.definition_id)?.name.toLowerCase().includes('pcp')) ||
              (d.type || '').toLowerCase().includes('pcp')
            )?.expiration_date || ''
          }
          ticaUrl={
            allDocuments.find((d: any) =>
              (d.definition_id && definitions.find(def => def.id === d.definition_id)?.name.toLowerCase().includes('tica')) ||
              (d.type || '').toLowerCase().includes('tica')
            )?.file_url || ''
          }
          pcpUrl={
            allDocuments.find((d: any) =>
              (d.definition_id && definitions.find(def => def.id === d.definition_id)?.name.toLowerCase().includes('pcp')) ||
              (d.type || '').toLowerCase().includes('pcp')
            )?.file_url || ''
          }
          initialRecords={dismissalRecords}
          isCompleted={person.dismissal_status === 'completed' || !person.is_active}
        />
      )}

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
              {canEdit && (
                <>
                  <Separator className="opacity-50" />
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase text-muted-foreground font-bold">Credenciales del Sistema</p>
                    {person.is_active ? (
                      <AccessActions 
                        personnelId={id} 
                        hasAccess={!!person.user_id} 
                        email={person.email} 
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground italic pt-1">
                        Acceso deshabilitado (colaborador inactivo)
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Tarjeta de Información Contractual */}
          <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  Contrato de Trabajo
                </CardTitle>
                <Badge className={person.contract_type === 'INDEFINIDO' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold uppercase text-[10px]' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold uppercase text-[10px]'}>
                  {person.contract_type === 'INDEFINIDO' ? 'Indefinido' : 'Plazo Fijo'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Fecha de Ingreso:</span>
                <span className="font-semibold">{person.hire_date ? format(new Date(person.hire_date), 'dd/MM/yyyy') : (person.contract_start_date ? format(new Date(person.contract_start_date), 'dd/MM/yyyy') : '—')}</span>
              </div>
              {person.contract_start_date && person.contract_start_date !== person.hire_date && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Inicio Contrato Actual:</span>
                  <span className="font-semibold">{format(new Date(person.contract_start_date), 'dd/MM/yyyy')}</span>
                </div>
              )}

              {person.contract_type === 'PLAZO_FIJO' && (
                <>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Duración del Contrato:</span>
                    <span className="font-semibold">{person.contract_duration_days ? `${person.contract_duration_days} días` : '—'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Fecha de Término:</span>
                    <span className="font-bold text-amber-700 dark:text-amber-400">
                      {person.contract_end_date ? format(new Date(person.contract_end_date), 'dd/MM/yyyy') : '—'}
                    </span>
                  </div>
                </>
              )}

              {person.contract_type === 'INDEFINIDO' && person.indefinite_contract_date && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Paso a Indefinido:</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    {format(new Date(person.indefinite_contract_date), 'dd/MM/yyyy')}
                  </span>
                </div>
              )}

              {/* Mini History List */}
              {contractHistoryData && contractHistoryData.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Historial de Períodos</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {contractHistoryData.map((h: any, i: number) => (
                      <div key={h.id || i} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[11px] space-y-0.5">
                        <div className="flex items-center justify-between font-bold">
                          <span className={h.contract_type === 'INDEFINIDO' ? 'text-emerald-600' : 'text-amber-600'}>
                            {h.contract_type === 'INDEFINIDO' ? 'Indefinido' : `Plazo Fijo (${h.duration_days || '—'}d)`}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {h.start_date ? format(new Date(h.start_date), 'dd/MM/yy') : ''}
                            {h.end_date ? ` → ${format(new Date(h.end_date), 'dd/MM/yy')}` : ''}
                          </span>
                        </div>
                        {h.notes && <p className="text-[10px] text-muted-foreground italic">{h.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Alertas de Cumplimiento */}
      {person.is_active && missingDocs.length > 0 && (
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
          {generalDocuments.length > 0 ? (
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
                {generalDocuments.map((doc: any) => {
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

                  // If definition requires expiration, calculate it dynamically if there's a dependency,
                  // or if there's no manual expiry stored.
                  if (def?.requires_expiration) {
                    const docNameLower = (doc.type || def?.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const pcpDef = definitions.find((d: any) => (d.name || '').toLowerCase().includes('pcp'));
                    const ticaDef = definitions.find((d: any) => (d.name || '').toLowerCase().includes('tica'));

                    let targetAnchorDefId = def.depends_on_definition_id;
                    if (docNameLower.includes('hoja de vida') && pcpDef) {
                      targetAnchorDefId = pcpDef.id;
                    } else if (docNameLower.includes('antecedentes') && ticaDef) {
                      targetAnchorDefId = ticaDef.id;
                    }

                    if (targetAnchorDefId) {
                      const anchorDef = definitions.find(d => d.id === targetAnchorDefId);
                      const anchorDoc = allDocuments.find(d => 
                        d.definition_id === targetAnchorDefId ||
                        (anchorDef && (d.type || '').toLowerCase().trim() === (anchorDef.name || '').toLowerCase().trim())
                      );
                      if (anchorDoc?.expiration_date) {
                        displayExpiry = calculateDynamicExpiration(
                          parseISO(anchorDoc.expiration_date),
                          def.cycle_months || 6,
                          def.anchor_days_offset || 30
                        );
                        isCalculated = true;
                      } else if (!displayExpiry && doc.uploaded_at) {
                        displayExpiry = calculateIntervalExpiration(
                          parseISO(doc.uploaded_at),
                          def.cycle_months || 6
                        );
                        isCalculated = true;
                      }
                    } else if (!displayExpiry && doc.uploaded_at) {
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
                               fileUrl={doc.file_url}
                               docType={def?.name || doc.type}
                               firstName={person.first_name}
                               lastNameFather={person.last_name_father}
                               readOnly={!canEdit}
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

      {/* Bonos Especiales */}
      <PersonnelBonusesCard
        personnelId={id}
        workerName={`${person.first_name} ${person.last_name_father} ${person.last_name_mother || ''}`}
        initialBonuses={bonusesData || []}
        canEdit={canEdit}
      />

      {/* Gadget Prevención de riesgos (RIOHS) */}
      {(() => {
        let activeRiohsRecord = riohsRecord;
        if (!activeRiohsRecord && person?.documents) {
          const docs = (person.documents as any[]) || [];
          const authGenDoc = docs.find(d => d.type === 'RIOHS Autorización Digital');
          const authSignedDoc = docs.find(d => d.type === 'RIOHS Autorización Firmada');
          const emailSentDoc = docs.find(d => d.type === 'RIOHS Email Enviado');
          const receptionDoc = docs.find(d => d.type === 'RIOHS Recepción Firmada');

          if (authGenDoc || authSignedDoc || emailSentDoc || receptionDoc) {
            let status = 'PENDING';
            if (receptionDoc) status = 'COMPLETED';
            else if (emailSentDoc) status = 'RIOHS_SENT';
            else if (authSignedDoc) status = 'AUTH_UPLOADED';
            else if (authGenDoc) status = 'AUTH_GENERATED';

            activeRiohsRecord = {
              personnel_id: id,
              company_id: person.company_id || '',
              status,
              auth_generated_at: authGenDoc?.uploaded_at || null,
              auth_signed_file_url: authSignedDoc?.file_url || null,
              auth_uploaded_at: authSignedDoc?.uploaded_at || null,
              riohs_sent_at: emailSentDoc?.uploaded_at || null,
              riohs_sent_to_email: emailSentDoc?.number || null,
              reception_signed_file_url: receptionDoc?.file_url || null,
              reception_uploaded_at: receptionDoc?.uploaded_at || null,
            };
          }
        }

        const companyDocs = (companyDocsData || []).filter((d: any) => d.company_id === person.company_id);
        const hasCompanyRiohs = companyDocs.some((d: any) => d.category === 'RIOHS');

        return (
          <RiohsGadget
            personnelId={id}
            workerName={`${person.first_name} ${person.last_name_father} ${person.last_name_mother || ''}`}
            firstName={person.first_name}
            lastNameFather={person.last_name_father}
            workerRut={person.rut}
            workerEmail={person.email}
            companyId={person.company_id}
            companyName={person.company?.legal_name || person.company?.name || 'MINERQUIM'}
            companyRut={person.company?.rut || '76.135.448-5'}
            hasCompanyRiohs={hasCompanyRiohs}
            userRole={role}
            initialRecord={activeRiohsRecord as any}
          />
        );
      })()}

      {/* Cartas de Felicitación y Amonestación */}
      <LettersCard 
        personnelId={id} 
        initialLetters={lettersData || []} 
        role={role} 
      />
    </div>
  );
}
