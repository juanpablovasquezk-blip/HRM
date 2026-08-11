'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { 
  Users as UsersIcon, 
  FileSpreadsheet, 
  Edit, 
  ShieldCheck, 
  FileText, 
  Settings2,
  Check,
  Plus,
  CheckCircle2,
  XCircle,
  Link2,
  Copy,
  UserCheck,
  UserX,
  UserMinus,
  Printer,
  Send,
  ClipboardCopy
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { createOnboardingToken, approveOnboarding, rejectOnboarding, deletePersonnel } from './actions';
import { createWorkerSizeToken } from '../epp/actions';
import { createPersonnelUpdateToken, sendFichaUpdateWhatsApp } from './update-actions';


interface Personnel {
  id: string;
  first_name: string;
  last_name_father: string;
  last_name_mother: string;
  rut: string;
  main_position: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  hire_date: string | null;
  termination_date: string | null;
  prefers_night: boolean;
  avoids_night: boolean;
  company_id: string;
  rotation_pattern: string | null;
  fixed_shift_id: string | null;
  user_id: string | null;
  requires_transport: boolean;
  is_active: boolean;
  driver_licenses?: string[];
  company: { name: string } | null;
  onboarding_status?: string | null;
  rejection_reason?: string | null;
  inactive_reason?: string | null;
  clothing_tshirt_size?: string | null;
  clothing_polar_size?: string | null;
  clothing_pants_size_letter?: string | null;
  clothing_pants_size_number?: string | null;
  clothing_shoe_size?: string | null;
  clothing_parka_size?: string | null;
  clothing_overall_size?: string | null;
  custom_clothing_sizes?: Record<string, string> | null;
  afp?: string | null;
  health_system?: string | null;
  bank_account_number?: string | null;
  emergency_contact_phone?: string | null;
  gender?: string | null;
  marital_status?: string | null;
  missingFields?: string[];
  missingDocs?: string[];
}


const isFichaIncompleta = (person: Personnel) => {
  return (
    !person.afp ||
    !person.health_system ||
    !person.bank_account_number ||
    !person.emergency_contact_phone ||
    !person.gender ||
    !person.marital_status ||
    !person.phone
  );
};

interface PersonnelTableClientProps {
  personnel: Personnel[];
  positionMap: Record<string, string>;
  shiftMap: Record<string, string>;
  canEdit: boolean;
  companies?: { id: string; name: string }[];
  positions?: { id: string; name: string; area?: { name: string } }[];
  shifts?: { id: string; name: string; start_time: string; end_time: string }[];
}

interface ColumnConfig {
  id: string;
  label: string;
  defaultVisible: boolean;
}

export default function PersonnelTableClient({
  personnel,
  positionMap,
  shiftMap,
  canEdit,
  companies = [],
  positions = [],
  shifts = []
}: PersonnelTableClientProps) {
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const columnPanelRef = useRef<HTMLDivElement>(null);

  const [isPending, startTransition] = useTransition();

  // Invite states
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteCompanyId, setInviteCompanyId] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');

  // Approval states
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Personnel | null>(null);
  const [approvePositionId, setApprovePositionId] = useState('');
  const [approveRotationPattern, setApproveRotationPattern] = useState('5x2');
  const [approveFixedShiftId, setApproveFixedShiftId] = useState('');
  const [approveEnableAccess, setApproveEnableAccess] = useState(true);

  // Rejection states
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectPerson, setRejectPerson] = useState<Personnel | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Dismiss (Baja) states
  const [isDismissOpen, setIsDismissOpen] = useState(false);
  const [dismissPerson, setDismissPerson] = useState<Personnel | null>(null);
  const [dismissReason, setDismissReason] = useState('');

  // Invite handler
  const handleGenerateInvite = async () => {
    if (!inviteCompanyId) {
      toast.error('Selecciona una empresa');
      return;
    }
    const result = await createOnboardingToken(inviteCompanyId);
    if (result.success && result.token) {
      const link = window.location.origin + '/onboarding?token=' + result.token;
      setGeneratedLink(link);
      toast.success('Enlace generado con éxito');
    } else {
      toast.error(result.error || 'Error al generar enlace');
    }
  };

  // Copy link helper
  const handleCopyLink = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      toast.success('Enlace copiado al portapapeles');
    }
  };

  // Approval handler
  const handleApprove = () => {
    if (!selectedPerson) return;
    if (!approvePositionId) {
      toast.error('Selecciona un cargo principal para el trabajador');
      return;
    }

    startTransition(async () => {
      const res = await approveOnboarding(
        selectedPerson.id,
        approvePositionId,
        approveRotationPattern,
        approveFixedShiftId || null,
        approveEnableAccess
      );

      if (res.success) {
        toast.success(`Trabajador ${selectedPerson.first_name} aprobado y activado`);
        setIsApproveOpen(false);
        setSelectedPerson(null);
        window.location.reload();
      } else {
        toast.error(res.error || 'Error al aprobar ficha');
      }
    });
  };

  // Reject handlers
  const handleRejectClick = (person: Personnel) => {
    setRejectPerson(person);
    setRejectionReason('');
    setIsRejectOpen(true);
  };

  const handleConfirmReject = () => {
    if (!rejectPerson) return;
    if (!rejectionReason.trim()) {
      toast.error('Por favor, ingresa el motivo del rechazo');
      return;
    }

    startTransition(async () => {
      const res = await rejectOnboarding(rejectPerson.id, rejectionReason);
      if (res.success) {
        toast.success(`Postulación de ${rejectPerson.first_name} rechazada`);
        setIsRejectOpen(false);
        setRejectPerson(null);
        window.location.reload();
      } else {
        toast.error(res.error || 'Error al rechazar postulación');
      }
    });
  };

  // Dismiss (Baja) handlers
  const handleDismissClick = (person: Personnel) => {
    setDismissPerson(person);
    setDismissReason('');
    setIsDismissOpen(true);
  };

  const handleConfirmDismiss = () => {
    if (!dismissPerson) return;
    if (!dismissReason.trim()) {
      toast.error('Por favor, ingresa el motivo de la baja');
      return;
    }

    startTransition(async () => {
      const res = await deletePersonnel(dismissPerson.id, dismissReason);
      if (res.success) {
        toast.success(`Trabajador ${dismissPerson.first_name} dado de baja`);
        setIsDismissOpen(false);
        setDismissPerson(null);
        window.location.reload();
      } else {
        toast.error(res.error || 'Error al dar de baja');
      }
    });
  };


  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnPanelRef.current && !columnPanelRef.current.contains(e.target as Node)) {
        setShowColumnPanel(false);
      }
    };
    if (showColumnPanel) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnPanel]);

  // Define available columns
  const columns: ColumnConfig[] = [
    { id: 'fullName', label: 'Nombre Completo', defaultVisible: true },
    { id: 'rut', label: 'RUT', defaultVisible: true },
    { id: 'main_position', label: 'Cargo', defaultVisible: true },
    { id: 'company', label: 'Empresa', defaultVisible: true },
    { id: 'epp_sizes', label: 'Tallas EPP', defaultVisible: true },
    { id: 'rotation_pattern', label: 'Planificación', defaultVisible: true },
    { id: 'preferences', label: 'Preferencias', defaultVisible: true },
    { id: 'email', label: 'Correo', defaultVisible: false },
    { id: 'phone', label: 'Teléfono', defaultVisible: false },
    { id: 'driver_licenses', label: 'Licencias', defaultVisible: false },
    { id: 'birth_date', label: 'Fecha Nacimiento', defaultVisible: false },
    { id: 'hire_date', label: 'Fecha Contratación', defaultVisible: false },
    { id: 'termination_date', label: 'Fecha Término', defaultVisible: false },
    { id: 'requires_transport', label: 'Requiere Transporte', defaultVisible: false },
    { id: 'is_active', label: 'Estado', defaultVisible: false },
  ];

  // State to track visible columns
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    return Object.fromEntries(columns.map(c => [c.id, c.defaultVisible]));
  });

  const toggleColumn = (columnId: string) => {
    setVisibleColumns(prev => {
      // Don't allow hiding all columns
      const next = { ...prev, [columnId]: !prev[columnId] };
      const hasVisible = Object.values(next).some(Boolean);
      return hasVisible ? next : prev;
    });
  };

  // Select all / Deselect all
  const selectAll = () => {
    setVisibleColumns(Object.fromEntries(columns.map(c => [c.id, true])));
  };

  const resetDefault = () => {
    setVisibleColumns(Object.fromEntries(columns.map(c => [c.id, c.defaultVisible])));
  };

  const handleCopyWorkerSizeTokenLink = async (person: Personnel) => {
    try {
      const res = await createWorkerSizeToken(person.id, 3);
      if (res.success && res.token) {
        const link = `${window.location.origin}/tallas?token=${res.token}`;
        navigator.clipboard.writeText(link);
        toast.success(`¡Link de tallas exclusivo para ${person.first_name} ${person.last_name_father} copiado! (Válido 3 días)`);
      } else {
        toast.error('Error al generar el enlace de tallas');
      }
    } catch (e) {
      toast.error('Error de conexión');
    }
  };

  const handleCopyUpdateFichaLink = async (person: Personnel) => {
    try {
      const res = await createPersonnelUpdateToken(person.id, 7);
      if (res.success && res.token) {
        const link = `${window.location.origin}/actualizar-ficha?token=${res.token}`;
        navigator.clipboard.writeText(link);
        toast.success(`¡Enlace de actualización de ficha para ${person.first_name} ${person.last_name_father} copiado! (Válido 7 días)`);
      } else {
        toast.error('Error al generar el enlace de actualización');
      }
    } catch (e) {
      toast.error('Error de conexión');
    }
  };

  const handleSendUpdateFichaWhatsApp = async (person: Personnel) => {
    if (!person.phone || person.phone.trim().length < 8) {
      toast.error('El trabajador no tiene un teléfono válido registrado.');
      return;
    }

    if (!confirm(`¿Enviar enlace de actualización de ficha a ${person.first_name} ${person.last_name_father} por WhatsApp?`)) {
      return;
    }

    const toastId = toast.loading(`Enviando enlace a ${person.first_name}...`);
    try {
      const res = await sendFichaUpdateWhatsApp(person.id, window.location.origin);
      if (res.success) {
        toast.success(`✅ Enlace de actualización enviado a ${person.first_name} por WhatsApp.`, { id: toastId });
      } else {
        toast.error(`Error: ${res.error}`, { id: toastId });
      }
    } catch (e) {
      toast.error('Error de conexión al enviar WhatsApp', { id: toastId });
    }
  };

  // Export to Excel
  const handleExport = () => {
    if (personnel.length === 0) {
      toast.info('No hay registros para exportar');
      return;
    }

    try {
      // Map data according to selected/visible columns
      const dataToExport = personnel.map(p => {
        const row: Record<string, any> = {};

        if (visibleColumns.fullName) {
          row['Nombres'] = p.first_name || '';
          row['Apellido Paterno'] = p.last_name_father || '';
          row['Apellido Materno'] = p.last_name_mother || '';
        }
        if (visibleColumns.rut) {
          row['RUT'] = p.rut || '';
        }
        if (visibleColumns.main_position) {
          row['Cargo'] = positionMap[p.main_position] || p.main_position || '';
        }
        if (visibleColumns.company) {
          row['Empresa'] = p.company?.name || '';
        }
        if (visibleColumns.rotation_pattern) {
          row['Planificación / Rotación'] = p.rotation_pattern || 'Estándar';
          row['Turno Fijo'] = p.fixed_shift_id ? (shiftMap[p.fixed_shift_id] || 'Sí') : 'No';
        }
        if (visibleColumns.preferences) {
          row['Prefiere Turno Noche'] = p.prefers_night ? 'Sí' : 'No';
          row['Evita Turno Noche'] = p.avoids_night ? 'Sí' : 'No';
        }
        if (visibleColumns.email) {
          row['Correo'] = p.email || '';
        }
        if (visibleColumns.phone) {
          row['Teléfono'] = p.phone || '';
        }
        if (visibleColumns.driver_licenses) {
          row['Licencias'] = p.driver_licenses?.join(', ') || '';
        }
        if (visibleColumns.birth_date) {
          row['Fecha de Nacimiento'] = p.birth_date || '';
        }
        if (visibleColumns.hire_date) {
          row['Fecha de Contratación'] = p.hire_date || '';
        }
        if (visibleColumns.termination_date) {
          row['Fecha de Término'] = p.termination_date || '';
        }
        if (visibleColumns.requires_transport) {
          row['Requiere Transporte'] = p.requires_transport ? 'Sí' : 'No';
        }
        if (visibleColumns.is_active) {
          row['Estado'] = p.is_active ? 'Activo' : 'De baja';
        }

        return row;
      });

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Personal');

      // Add simple styling by auto-adjusting column widths
      const maxLens = Object.keys(dataToExport[0] || {}).map(key => {
        let max = key.length;
        dataToExport.forEach(row => {
          const val = String(row[key] || '');
          if (val.length > max) max = val.length;
        });
        return { wch: max + 3 };
      });
      ws['!cols'] = maxLens;

      const fileName = `Listado_Personal_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Listado exportado correctamente en Excel');
    } catch (error: any) {
      toast.error('Error al exportar a Excel', { description: error.message });
    }
  };

  return (
    <div className="space-y-4">
      {/* Table Toolbar / Control Row */}
      <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground font-medium">
          Mostrando <span className="font-bold text-slate-700 dark:text-slate-300">{personnel.length}</span> registros de personal
        </div>
        
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {/* Column Selector - Custom inline panel (no portal) */}
          <div className="relative" ref={columnPanelRef}>
            <button
              onClick={() => setShowColumnPanel(v => !v)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-background text-slate-600 hover:bg-slate-50 hover:text-orange-600 dark:border-slate-800 dark:text-slate-400 h-9 px-3 gap-1.5 text-xs font-semibold cursor-pointer outline-none transition-colors"
            >
              <Settings2 className="h-4 w-4" />
              Columnas
            </button>

            {showColumnPanel && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 shadow-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Ver Columnas</span>
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {columns.map(c => (
                    <button
                      key={c.id}
                      onClick={() => toggleColumn(c.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                        visibleColumns[c.id]
                          ? 'bg-orange-500 border-orange-500 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}>
                        {visibleColumns[c.id] && <Check className="h-3 w-3" />}
                      </span>
                      <span className="text-slate-700 dark:text-slate-300">{c.label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between px-2 py-1.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <button
                    onClick={selectAll}
                    className="text-[10px] h-7 px-2 font-bold text-slate-600 hover:text-orange-600 rounded transition-colors"
                  >
                    Todas
                  </button>
                  <button
                    onClick={resetDefault}
                    className="text-[10px] h-7 px-2 font-bold text-slate-400 hover:text-slate-600 rounded transition-colors"
                  >
                    Predeterminado
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Export to Excel Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="h-9 bg-emerald-50/50 hover:bg-emerald-50 border-emerald-200 text-emerald-700 hover:text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400 gap-1.5 text-xs font-semibold rounded-lg"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Descargar Excel
          </Button>

          {/* Invitation Link Button */}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsInviteOpen(true);
                setGeneratedLink('');
                setInviteCompanyId('');
              }}
              className="h-9 bg-orange-50/50 hover:bg-orange-50 border-orange-200 text-orange-700 hover:text-orange-800 dark:bg-orange-950/20 dark:border-orange-900 dark:text-orange-400 gap-1.5 text-xs font-semibold rounded-lg"
            >
              <Link2 className="h-4 w-4" />
              Generar Link de Invitación
            </Button>
          )}
        </div>
      </div>


      {/* Main Table */}
      {personnel.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleColumns.fullName && <TableHead>Nombre</TableHead>}
                {visibleColumns.rut && <TableHead>RUT</TableHead>}
                {visibleColumns.main_position && <TableHead>Cargo</TableHead>}
                {visibleColumns.company && <TableHead>Empresa</TableHead>}
                {visibleColumns.epp_sizes && <TableHead>Tallas EPP</TableHead>}
                {visibleColumns.rotation_pattern && <TableHead>Planificación</TableHead>}
                {visibleColumns.preferences && <TableHead>Preferencias</TableHead>}
                {visibleColumns.email && <TableHead>Correo</TableHead>}
                {visibleColumns.phone && <TableHead>Teléfono</TableHead>}
                {visibleColumns.driver_licenses && <TableHead>Licencias</TableHead>}
                {visibleColumns.birth_date && <TableHead>Fecha Nacimiento</TableHead>}
                {visibleColumns.hire_date && <TableHead>Fecha Contratación</TableHead>}
                {visibleColumns.termination_date && <TableHead>Fecha Término</TableHead>}
                {visibleColumns.requires_transport && <TableHead>Transporte</TableHead>}
                {visibleColumns.is_active && <TableHead>Estado</TableHead>}
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personnel.map((person) => {
                const hasStandardSizes = person.clothing_tshirt_size || person.clothing_shoe_size || person.clothing_pants_size_letter;

                return (
                  <TableRow key={person.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    {/* Full Name Cell */}
                    {visibleColumns.fullName && (
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link
                              href={`/personnel/${person.id}`}
                              className="font-medium text-orange-600 hover:text-orange-700 dark:text-blue-400 hover:underline inline-flex items-center gap-1.5"
                            >
                              {person.first_name} {person.last_name_father} {person.last_name_mother}
                              {person.user_id && (
                                <ShieldCheck className="h-3.5 w-3.5 text-blue-500 fill-blue-50" />
                              )}
                            </Link>
                            {isFichaIncompleta(person) && (
                              <Badge 
                                variant="outline" 
                                className="bg-amber-50/80 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30 text-[10px] py-0 px-1.5 font-bold uppercase tracking-wider h-5 flex items-center"
                                title={person.missingFields && person.missingFields.length > 0 ? `Falta completar: ${person.missingFields.join(', ')}` : "Falta completar datos en su ficha (AFP, Salud, Contacto de Emergencia, Banco, etc.)"}
                              >
                                Ficha Incompleta
                              </Badge>
                            )}
                            {person.missingDocs && person.missingDocs.length > 0 && (
                              <Badge 
                                variant="outline" 
                                className="bg-rose-50/80 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30 text-[10px] py-0 px-1.5 font-bold uppercase tracking-wider h-5 flex items-center"
                                title={`Faltan documentos: ${person.missingDocs.join(', ')}`}
                              >
                                Doc. Incompleta
                              </Badge>
                            )}
                            {!person.is_active && (
                              <Badge 
                                variant="outline" 
                                className={person.onboarding_status === 'rejected' ? "bg-red-50 text-red-700 border-red-200 text-[10px] h-5 flex items-center font-bold" : "bg-rose-50 text-rose-700 border-rose-200 text-[10px] h-5 flex items-center font-bold"}
                              >
                                {person.onboarding_status === 'rejected' ? 'Rechazado' : 'De baja'}
                              </Badge>
                            )}
                          </div>
                          {!person.is_active && person.onboarding_status === 'rejected' && person.rejection_reason && (
                            <p className="text-[11px] text-red-600 font-medium italic" title={person.rejection_reason}>
                              Motivo rechazo: {person.rejection_reason}
                            </p>
                          )}
                          {!person.is_active && person.onboarding_status !== 'rejected' && person.inactive_reason && (
                            <p className="text-[11px] text-rose-600 font-medium italic" title={person.inactive_reason}>
                              Motivo baja: {person.inactive_reason}
                            </p>
                          )}
                          
                          {/* Missing details listing */}
                          {person.missingFields && person.missingFields.length > 0 && (
                            <div className="text-[10px] text-amber-700 dark:text-amber-400 flex flex-wrap gap-1 items-center mt-0.5 max-w-md">
                              <span className="font-semibold select-none">Falta:</span>
                              {person.missingFields.map((f, i) => (
                                <span key={i} className="bg-amber-50/50 dark:bg-amber-950/30 px-1 py-0.5 rounded text-[9px] border border-amber-100 dark:border-amber-900/50">
                                  {f}
                                </span>
                              ))}
                            </div>
                          )}
                          {person.missingDocs && person.missingDocs.length > 0 && (
                            <div className="text-[10px] text-rose-700 dark:text-rose-400 flex flex-wrap gap-1 items-center mt-0.5 max-w-md">
                              <span className="font-semibold select-none">Faltan documentos:</span>
                              {person.missingDocs.map((d, i) => (
                                <span key={i} className="bg-rose-50/50 dark:bg-rose-950/30 px-1 py-0.5 rounded text-[9px] border border-rose-100 dark:border-rose-900/50">
                                  {d}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    )}

                    {/* RUT Cell */}
                    {visibleColumns.rut && (
                      <TableCell className="font-mono text-sm">
                        {person.rut}
                      </TableCell>
                    )}

                    {/* Cargo Cell */}
                    {visibleColumns.main_position && (
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {positionMap[person.main_position] || person.main_position}
                        </Badge>
                      </TableCell>
                    )}

                    {/* Empresa Cell */}
                    {visibleColumns.company && (
                      <TableCell className="text-muted-foreground">
                        {person.company?.name || '—'}
                      </TableCell>
                    )}

                    {/* Tallas EPP Cell */}
                    {visibleColumns.epp_sizes && (
                      <TableCell>
                        {hasStandardSizes ? (
                          <div className="flex flex-wrap gap-1 text-[10px]">
                            {person.clothing_tshirt_size && (
                              <Badge variant="outline" className="bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800">
                                Polera: {person.clothing_tshirt_size}
                              </Badge>
                            )}
                            {person.clothing_pants_size_letter && (
                              <Badge variant="outline" className="bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800">
                                Pantalón: {person.clothing_pants_size_letter}
                              </Badge>
                            )}
                            {person.clothing_shoe_size && (
                              <Badge variant="outline" className="bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800">
                                Calzado: {person.clothing_shoe_size}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px]">
                            ⚠️ Sin Tallas
                          </Badge>
                        )}
                      </TableCell>
                    )}

                    {/* Planificación Cell */}
                    {visibleColumns.rotation_pattern && (
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
                    )}

                    {/* Preferencias Cell */}
                    {visibleColumns.preferences && (
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
                          {!person.prefers_night && !person.avoids_night && (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                      </TableCell>
                    )}

                    {/* Email Cell */}
                    {visibleColumns.email && (
                      <TableCell className="text-xs font-mono text-slate-600">
                        {person.email || '—'}
                      </TableCell>
                    )}

                    {/* Phone Cell */}
                    {visibleColumns.phone && (
                      <TableCell className="text-xs text-slate-600">
                        {person.phone || '—'}
                      </TableCell>
                    )}

                    {/* Licenses Cell */}
                    {visibleColumns.driver_licenses && (
                      <TableCell>
                        {person.driver_licenses && person.driver_licenses.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {person.driver_licenses.map(lic => (
                              <Badge key={lic} variant="outline" className="text-[9px] bg-slate-100 text-slate-700 border-slate-200">
                                {lic}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                    )}

                    {/* Birth Date Cell */}
                    {visibleColumns.birth_date && (
                      <TableCell className="text-xs text-slate-600 font-mono">
                        {person.birth_date || '—'}
                      </TableCell>
                    )}

                    {/* Hire Date Cell */}
                    {visibleColumns.hire_date && (
                      <TableCell className="text-xs text-slate-600 font-mono">
                        {person.hire_date || '—'}
                      </TableCell>
                    )}

                    {/* Termination Date Cell */}
                    {visibleColumns.termination_date && (
                      <TableCell className="text-xs text-slate-600 font-mono">
                        {person.termination_date || '—'}
                      </TableCell>
                    )}

                    {/* Requires Transport Cell */}
                    {visibleColumns.requires_transport && (
                      <TableCell>
                        <Badge variant="outline" className={person.requires_transport ? 'bg-blue-50 text-blue-700 border-blue-200 text-[10px]' : 'bg-slate-50 text-slate-500 border-slate-200 text-[10px]'}>
                          {person.requires_transport ? 'Sí' : 'No'}
                        </Badge>
                      </TableCell>
                    )}

                    {/* Is Active Cell */}
                    {visibleColumns.is_active && (
                      <TableCell>
                        <Badge variant="outline" className={person.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]' : person.onboarding_status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200 text-[10px]' : 'bg-rose-50 text-rose-700 border-rose-200 text-[10px]'}>
                          {person.is_active ? 'Activo' : person.onboarding_status === 'rejected' ? 'Rechazado' : 'De baja'}
                        </Badge>
                      </TableCell>
                    )}

                    {/* Actions Cell */}
                    <TableCell className="text-right">
                      {person.onboarding_status === 'pending' ? (
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            disabled={isPending}
                            onClick={() => {
                              setSelectedPerson(person);
                              setApprovePositionId(person.main_position || '');
                              setApproveRotationPattern(person.rotation_pattern || '5x2');
                              setApproveFixedShiftId(person.fixed_shift_id || '');
                              setApproveEnableAccess(true);
                              setIsApproveOpen(true);
                            }}
                            className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                            title="Aprobar ficha"
                          >
                            <UserCheck className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            disabled={isPending}
                            onClick={() => handleRejectClick(person)}
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                            title="Rechazar ficha"
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : canEdit ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyUpdateFichaLink(person)}
                            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                            title="Copiar Enlace de Actualización de Ficha (Válido 7 días)"
                          >
                            <ClipboardCopy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={!person.phone}
                            onClick={() => handleSendUpdateFichaWhatsApp(person)}
                            className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                            title={person.phone ? "Enviar Enlace de Ficha por WhatsApp" : "No tiene teléfono registrado"}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyWorkerSizeTokenLink(person)}
                            className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                            title="Copiar Link WhatsApp exclusivo de tallas (Válido 3 días)"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <Link href={`/personnel-print/${person.id}`} target="_blank">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-orange-600" title="Imprimir Ficha">
                              <Printer className="h-4 w-4" />
                            </Button>
                          </Link>
                          {person.is_active && (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isPending}
                              onClick={() => handleDismissClick(person)}
                              className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                              title="Dar de baja trabajador"
                            >
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          )}
                          <Link href={`/personnel/${person.id}/edit`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-orange-600" title="Editar Ficha">
                               <Edit className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyUpdateFichaLink(person)}
                            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                            title="Copiar Enlace de Actualización de Ficha (Válido 7 días)"
                          >
                            <ClipboardCopy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={!person.phone}
                            onClick={() => handleSendUpdateFichaWhatsApp(person)}
                            className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                            title={person.phone ? "Enviar Enlace de Ficha por WhatsApp" : "No tiene teléfono registrado"}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyWorkerSizeTokenLink(person)}
                            className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                            title="Copiar Link WhatsApp exclusivo de tallas (Válido 3 días)"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <Link href={`/personnel-print/${person.id}`} target="_blank">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-orange-600" title="Imprimir Ficha">
                              <Printer className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Link href={`/personnel/${person.id}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-orange-600">
                               <FileText className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      )}
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
            No se encontró personal para el filtro actual.
          </p>
        </div>
      )}
      {/* DIALOG 1: GENERAR LINK DE INVITACIÓN */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <Link2 className="h-5 w-5 text-orange-500" />
              Generar Link de Invitación
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Selecciona la empresa del nuevo trabajador para generar el link.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-company">Empresa *</Label>
              <select 
                id="invite-company" 
                value={inviteCompanyId}
                onChange={e => setInviteCompanyId(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Seleccionar empresa...</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {generatedLink && (
              <div className="space-y-1.5">
                <Label>Link de Invitación</Label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={generatedLink}
                    className="flex-1 h-10 rounded-lg bg-slate-50 border border-slate-200 px-3 text-xs font-mono"
                  />
                  <Button size="icon" onClick={handleCopyLink} className="bg-slate-900 hover:bg-slate-800 text-white rounded-lg h-10 w-10">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-emerald-600 font-medium">¡Copiado! Puedes enviarlo por WhatsApp al nuevo trabajador.</p>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4 gap-2 flex-col sm:flex-row">
            <Button variant="ghost" onClick={() => setIsInviteOpen(false)} className="rounded-xl font-bold uppercase text-xs">
              Cerrar
            </Button>
            {!generatedLink && (
              <Button 
                onClick={handleGenerateInvite}
                disabled={!inviteCompanyId}
                className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-6 font-black uppercase text-xs"
              >
                Generar Enlace
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: APROBAR POSTULACIÓN */}
      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-500" />
              Aprobar Postulación
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Configura los datos del cargo y turnos para {selectedPerson?.first_name} {selectedPerson?.last_name_father}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="approve-position">Cargo Principal *</Label>
              <select 
                id="approve-position" 
                value={approvePositionId}
                onChange={e => setApprovePositionId(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Seleccionar cargo...</option>
                {positions.map(p => (
                  <option key={p.id} value={p.id}>{p.name} {p.area?.name ? `(${p.area.name})` : ''}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="approve-rotation">Patrón de Rotación *</Label>
              <select 
                id="approve-rotation" 
                value={approveRotationPattern}
                onChange={e => setApproveRotationPattern(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="5x2">5x2 (Semanal / Rotativo)</option>
                <option value="5X2-RELEVO-A">5x2 Relevo A</option>
                <option value="5X2-RELEVO-B">5x2 Relevo B</option>
                <option value="l-v">Lunes a Viernes</option>
                <option value="7x7">7x7 (Rotativo)</option>
                <option value="7X7-A">7x7 Relevo A</option>
                <option value="7X7-B">7x7 Relevo B</option>
                <option value="4x4_noche">4x4 Noche</option>
                <option value="part_time">Part Time</option>
                <option value="manual">Manual / Sin Rotación</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="approve-shift">Turno Fijo (Opcional)</Label>
              <select 
                id="approve-shift" 
                value={approveFixedShiftId}
                onChange={e => setApproveFixedShiftId(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Ninguno / Rotativo</option>
                {shifts.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.start_time.substring(0,5)} - {s.end_time.substring(0,5)})</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-blue-100 bg-blue-50/20">
              <div className="space-y-0.5">
                <Label className="text-xs font-bold text-blue-900">Dar Acceso al Sistema</Label>
                <p className="text-[10px] text-blue-700">Crea un usuario usando el email y RUT como clave inicial.</p>
              </div>
              <Switch 
                checked={approveEnableAccess}
                onCheckedChange={setApproveEnableAccess}
                disabled={!selectedPerson?.email}
              />
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2 flex-col sm:flex-row">
            <Button variant="ghost" onClick={() => { setIsApproveOpen(false); setSelectedPerson(null); }} className="rounded-xl font-bold uppercase text-xs">
              Cancelar
            </Button>
            <Button 
              onClick={handleApprove}
              disabled={isPending || !approvePositionId}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6 font-black uppercase text-xs"
            >
              {isPending ? 'Aprobando...' : 'Aprobar e Incorporar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: RECHAZAR POSTULACIÓN */}
      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <UserX className="h-5 w-5 text-red-500" />
              Rechazar Postulación
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Indica el motivo por el cual estás rechazando la postulación de {rejectPerson?.first_name} {rejectPerson?.last_name_father}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="rejection-reason" className="text-sm font-semibold">Motivo del Rechazo *</Label>
              <textarea
                id="rejection-reason"
                placeholder="Escribe el motivo aquí..."
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                className="flex min-h-[90px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 placeholder:text-slate-400"
                required
              />
              <p className="text-[11px] text-rose-500 font-medium">
                ⚠️ Al rechazar la postulación, se eliminarán permanentemente todos sus documentos y archivos subidos del sistema para liberar espacio.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-2 gap-2 flex-col sm:flex-row">
            <Button variant="ghost" onClick={() => { setIsRejectOpen(false); setRejectPerson(null); }} className="rounded-xl font-bold uppercase text-xs">
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmReject}
              disabled={isPending || !rejectionReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-6 font-black uppercase text-xs"
            >
              {isPending ? 'Rechazando...' : 'Confirmar Rechazo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 4: DAR DE BAJA */}
      <Dialog open={isDismissOpen} onOpenChange={setIsDismissOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <UserMinus className="h-5 w-5 text-rose-500" />
              Dar de Baja Trabajador
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Indica el motivo de la baja de {dismissPerson?.first_name} {dismissPerson?.last_name_father}. El trabajador será desactivado del sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="dismiss-reason" className="text-sm font-semibold">Motivo de la Baja *</Label>
              <textarea
                id="dismiss-reason"
                placeholder="Escribe el motivo de la baja aquí..."
                value={dismissReason}
                onChange={e => setDismissReason(e.target.value)}
                className="flex min-h-[90px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-slate-400"
                required
              />
              <p className="text-[11px] text-rose-500 font-medium">
                ⚠️ Al dar de baja, se eliminarán permanentemente todos sus documentos y cartas del sistema para liberar espacio.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-2 gap-2 flex-col sm:flex-row">
            <Button variant="ghost" onClick={() => { setIsDismissOpen(false); setDismissPerson(null); }} className="rounded-xl font-bold uppercase text-xs">
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmDismiss}
              disabled={isPending || !dismissReason.trim()}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl px-6 font-black uppercase text-xs"
            >
              {isPending ? 'Procesando...' : 'Confirmar Baja'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

