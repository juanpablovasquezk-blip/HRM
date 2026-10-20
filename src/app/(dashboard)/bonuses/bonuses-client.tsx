'use client';

import React, { useState, useTransition, useMemo } from 'react';
import { BonusRecord, BonusType, Company } from '@/types/database';
import { 
  getBonusRecords, 
  createBonusRecord, 
  createBatchBonusRecord, 
  voidBonusRecord, 
  updateBonusRecord, 
  bulkUpdateBonusPaidMonth 
} from './actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Coins,
  Plus,
  Users,
  Search,
  Filter,
  Download,
  Calendar,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Pencil,
  FileSpreadsheet,
  Check,
  X,
  ExternalLink,
  Info,
  ChevronsUpDown
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';

interface PersonnelSimple {
  id: string;
  first_name: string;
  last_name_father: string;
  last_name_mother: string;
  rut: string;
  company_id: string;
}

interface BonusesClientProps {
  initialRecords: BonusRecord[];
  bonusTypes: BonusType[];
  companies: Company[];
  personnelList: PersonnelSimple[];
}

export function BonusesClient({
  initialRecords,
  bonusTypes,
  companies,
  personnelList,
}: BonusesClientProps) {
  const [records, setRecords] = useState<BonusRecord[]>(initialRecords);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Filtros
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'voided'>('active');
  const [selectedPaidStatus, setSelectedPaidStatus] = useState<'all' | 'paid' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOt, setSearchOt] = useState('');

  // Selección masiva para liquidación
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPaidMonth, setBulkPaidMonth] = useState('');
  const [bulkLiquidating, setBulkLiquidating] = useState(false);

  // Modales
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Estados de formularios
  const [targetRecord, setTargetRecord] = useState<BonusRecord | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [savingAction, setSavingAction] = useState(false);

  // Form Individual
  const [formPersonnelId, setFormPersonnelId] = useState('');
  const [comboboxOpenPerson, setComboboxOpenPerson] = useState(false);
  const [formTypeId, setFormTypeId] = useState('');
  const [comboboxOpenType, setComboboxOpenType] = useState(false);
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formOt, setFormOt] = useState('');
  const [formObservations, setFormObservations] = useState('');

  // Form Batch (Grupal por OT)
  const [batchPersonnelIds, setBatchPersonnelIds] = useState<string[]>([]);
  const [batchTypeId, setBatchTypeId] = useState('');
  const [batchDate, setBatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchOt, setBatchOt] = useState('');
  const [batchObservations, setBatchObservations] = useState('');
  const [batchSearchPerson, setBatchSearchPerson] = useState('');

  // Recalcular lista cuando cambian los filtros
  const handleApplyFilters = async () => {
    setLoading(true);
    try {
      const res = await getBonusRecords({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        companyId: selectedCompany !== 'ALL' ? selectedCompany : undefined,
        bonusTypeId: selectedType !== 'ALL' ? selectedType : undefined,
        status: selectedStatus,
        paidStatus: selectedPaidStatus,
        otNumber: searchOt || undefined,
        searchPersonnel: searchQuery || undefined,
      });

      if (res.success && res.data) {
        setRecords(res.data);
        setSelectedIds([]);
      } else {
        toast.error(res.error || 'Error al filtrar bonos');
      }
    } catch (err: any) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = async () => {
    setStartDate('');
    setEndDate('');
    setSelectedCompany('ALL');
    setSelectedType('ALL');
    setSelectedStatus('active');
    setSelectedPaidStatus('all');
    setSearchQuery('');
    setSearchOt('');
    setLoading(true);
    try {
      const res = await getBonusRecords({ status: 'active' });
      if (res.success && res.data) {
        setRecords(res.data);
        setSelectedIds([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Métricas
  const metrics = useMemo(() => {
    let totalAmount = 0;
    let pendingAmount = 0;
    let paidAmount = 0;
    let activeCount = 0;
    let voidedCount = 0;

    for (const r of records) {
      if (r.status === 'voided') {
        voidedCount++;
        continue;
      }
      activeCount++;
      totalAmount += r.amount;
      if (r.paid_month) {
        paidAmount += r.amount;
      } else {
        pendingAmount += r.amount;
      }
    }

    return { totalAmount, pendingAmount, paidAmount, activeCount, voidedCount };
  }, [records]);

  // Selección en tabla
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const selectable = records
        .filter((r) => r.status === 'active')
        .map((r) => r.id);
      setSelectedIds(selectable);
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Liquidación masiva
  const handleBulkLiquidate = async () => {
    if (selectedIds.length === 0) {
      toast.error('Selecciona al menos un bono para liquidar');
      return;
    }
    if (!bulkPaidMonth || !/^\d{4}-\d{2}$/.test(bulkPaidMonth)) {
      toast.error('Ingresa un periodo válido en formato YYYY-MM (ej: 2026-10)');
      return;
    }

    setBulkLiquidating(true);
    try {
      const res = await bulkUpdateBonusPaidMonth(selectedIds, bulkPaidMonth);
      if (res.success) {
        toast.success(`${selectedIds.length} bonos liquidados para ${bulkPaidMonth}`);
        setRecords((prev) =>
          prev.map((r) =>
            selectedIds.includes(r.id) ? { ...r, paid_month: bulkPaidMonth } : r
          )
        );
        setSelectedIds([]);
        setBulkPaidMonth('');
      } else {
        toast.error(res.error || 'Error al liquidar bonos');
      }
    } catch (err: any) {
      toast.error('Error inesperado');
    } finally {
      setBulkLiquidating(false);
    }
  };

  // Abrir modal Individual
  const handleOpenSingleCreate = () => {
    const firstType = bonusTypes[0];
    setFormPersonnelId('');
    setFormTypeId(firstType?.id || '');
    setFormAmount(firstType?.default_amount || 0);
    setFormOt('');
    setFormObservations('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setIsSingleModalOpen(true);
  };

  // Cambio de tipo en modal individual
  const handleSingleTypeChange = (typeId: string) => {
    setFormTypeId(typeId);
    const bt = bonusTypes.find((t) => t.id === typeId);
    if (bt) {
      setFormAmount(bt.default_amount);
    }
  };

  const handleSaveSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPersonnelId) {
      toast.error('Selecciona al colaborador');
      return;
    }
    if (!formTypeId) {
      toast.error('Selecciona el tipo de bono');
      return;
    }

    const bt = bonusTypes.find((t) => t.id === formTypeId);
    if (bt?.requires_ot && !formOt.trim()) {
      toast.error('El N° de OT es obligatorio para este bono');
      return;
    }

    setSavingAction(true);
    try {
      const res = await createBonusRecord({
        personnel_id: formPersonnelId,
        bonus_type_id: formTypeId,
        date: formDate,
        amount: Number(formAmount),
        ot_number: formOt.trim() || null,
        observations: formObservations.trim() || null,
      });

      if (res.success && res.data) {
        toast.success('Bono registrado con éxito');
        setIsSingleModalOpen(false);
        handleApplyFilters();
      } else {
        toast.error(res.error || 'Error al registrar bono');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error inesperado');
    } finally {
      setSavingAction(false);
    }
  };

  // Abrir modal Grupal por OT
  const handleOpenBatchCreate = () => {
    const stallOrDerrame = bonusTypes.find((t) => t.requires_ot) || bonusTypes[0];
    setBatchTypeId(stallOrDerrame?.id || '');
    setBatchPersonnelIds([]);
    setBatchOt('');
    setBatchObservations('');
    setBatchDate(new Date().toISOString().split('T')[0]);
    setBatchSearchPerson('');
    setIsBatchModalOpen(true);
  };

  const handleToggleBatchPerson = (personnelId: string) => {
    setBatchPersonnelIds((prev) =>
      prev.includes(personnelId)
        ? prev.filter((id) => id !== personnelId)
        : [...prev, personnelId]
    );
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (batchPersonnelIds.length === 0) {
      toast.error('Selecciona al menos un colaborador');
      return;
    }
    if (!batchOt.trim()) {
      toast.error('Ingresa el N° de OT');
      return;
    }

    setSavingAction(true);
    try {
      const res = await createBatchBonusRecord({
        personnel_ids: batchPersonnelIds,
        bonus_type_id: batchTypeId,
        date: batchDate,
        ot_number: batchOt.trim(),
        observations: batchObservations.trim() || null,
      });

      if (res.success) {
        toast.success(
          `Se crearon ${res.insertedCount} bonos correctamente.${
            res.skippedCount ? ` (${res.skippedCount} omitidos por ya poseer bono en esta OT)` : ''
          }`
        );
        setIsBatchModalOpen(false);
        handleApplyFilters();
      } else {
        toast.error(res.error || 'Error al emitir bonos en lote');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error inesperado');
    } finally {
      setSavingAction(false);
    }
  };

  // Modal Anulación
  const handleOpenVoid = (record: BonusRecord) => {
    if (record.paid_month) {
      toast.error('No se puede anular un bono ya liquidado');
      return;
    }
    setTargetRecord(record);
    setVoidReason('');
    setIsVoidModalOpen(true);
  };

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetRecord) return;
    if (!voidReason.trim() || voidReason.trim().length < 4) {
      toast.error('Indica un motivo claro de anulación (mínimo 4 caracteres)');
      return;
    }

    setSavingAction(true);
    try {
      const res = await voidBonusRecord(targetRecord.id, voidReason);
      if (res.success) {
        toast.success('Bono anulado correctamente');
        setIsVoidModalOpen(false);
        setRecords((prev) =>
          prev.map((r) =>
            r.id === targetRecord.id
              ? {
                  ...r,
                  status: 'voided',
                  void_reason: voidReason,
                  voided_at: new Date().toISOString(),
                }
              : r
          )
        );
      } else {
        toast.error(res.error || 'Error al anular');
      }
    } catch (err: any) {
      toast.error('Error al procesar anulación');
    } finally {
      setSavingAction(false);
    }
  };

  // Modal Edición
  const handleOpenEdit = (record: BonusRecord) => {
    if (record.paid_month) {
      toast.error('No se puede editar un bono ya liquidado');
      return;
    }
    if (record.status === 'voided') {
      toast.error('No se puede editar un bono anulado');
      return;
    }
    setTargetRecord(record);
    setFormDate(record.date);
    setFormAmount(record.amount);
    setFormOt(record.ot_number || '');
    setFormObservations(record.observations || '');
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetRecord) return;

    setSavingAction(true);
    try {
      const res = await updateBonusRecord(targetRecord.id, {
        date: formDate,
        amount: Number(formAmount),
        ot_number: formOt.trim() || null,
        observations: formObservations.trim() || null,
      });

      if (res.success) {
        toast.success('Bono actualizado');
        setIsEditModalOpen(false);
        setRecords((prev) =>
          prev.map((r) =>
            r.id === targetRecord.id
              ? {
                  ...r,
                  date: formDate,
                  amount: targetRecord.bonus_type?.amount_is_editable ? Number(formAmount) : r.amount,
                  ot_number: formOt.trim() || null,
                  observations: formObservations.trim() || null,
                }
              : r
          )
        );
      } else {
        toast.error(res.error || 'Error al actualizar');
      }
    } catch (err: any) {
      toast.error('Error al editar bono');
    } finally {
      setSavingAction(false);
    }
  };

  // Exportar Excel
  const handleExportExcel = () => {
    if (records.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    const exportRows = records.map((r) => {
      const p = r.personnel;
      return {
        'RUT': p?.rut || '',
        'Colaborador': p ? `${p.first_name} ${p.last_name_father} ${p.last_name_mother || ''}`.trim() : '',
        'Empresa': p?.company?.name || '',
        'Tipo de Bono': r.bonus_type?.name || '',
        'Fecha': r.date,
        'N° OT': r.ot_number || 'N/A',
        'Monto ($)': r.amount,
        'Estado': r.status === 'voided' ? 'ANULADO' : r.paid_month ? 'LIQUIDADO' : 'PENDIENTE',
        'Mes Liquidado': r.paid_month || 'Pendiente',
        'Observaciones': r.observations || '',
        'Motivo Anulación': r.void_reason || '',
        'Origen': r.source,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bonos');
    XLSX.writeFile(workbook, `HRM_Bonos_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
    toast.success('Reporte exportado a Excel');
  };

  // Filtrado de personal para el modal Batch
  const filteredBatchPersonnel = useMemo(() => {
    if (!batchSearchPerson.trim()) return personnelList;
    const q = batchSearchPerson.toLowerCase();
    return personnelList.filter((p) => {
      const full = `${p.first_name} ${p.last_name_father} ${p.last_name_mother || ''}`.toLowerCase();
      return full.includes(q) || p.rut.toLowerCase().includes(q);
    });
  }, [personnelList, batchSearchPerson]);

  const currentSelectedTypeObj = bonusTypes.find((t) => t.id === formTypeId);

  return (
    <div className="space-y-6">
      {/* Encabezado y Acciones Principales */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Coins className="h-7 w-7 text-emerald-600" />
            Módulo de Bonos
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Registro, control de OT y gestión de liquidaciones de bonos de todo el personal.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportExcel}
            className="gap-2 text-slate-700 dark:text-slate-200"
          >
            <Download className="h-4 w-4" />
            Exportar Excel
          </Button>

          <Button
            onClick={handleOpenBatchCreate}
            variant="outline"
            className="gap-2 border-emerald-600/40 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
          >
            <Users className="h-4 w-4 text-emerald-600" />
            Ingreso Grupal por OT
          </Button>

          <Button
            onClick={handleOpenSingleCreate}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Nuevo Bono
          </Button>
        </div>
      </div>

      {/* Tarjetas de Métricas Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Total Vigente
              </p>
              <p className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
                ${metrics.totalAmount.toLocaleString('es-CL')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {metrics.activeCount} bonos activos
              </p>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl text-emerald-600">
              <Coins className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Pendiente de Pago
              </p>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-500 mt-1">
                ${metrics.pendingAmount.toLocaleString('es-CL')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Sin mes asignado</p>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-2xl text-amber-600">
              <Clock className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Liquidado / Pagado
              </p>
              <p className="text-2xl font-black text-blue-600 dark:text-blue-500 mt-1">
                ${metrics.paidAmount.toLocaleString('es-CL')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Con mes asignado</p>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-2xl text-blue-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Anulados
              </p>
              <p className="text-2xl font-black text-slate-500 mt-1">
                {metrics.voidedCount}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Excluidos de liquidación</p>
            </div>
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-500">
              <Ban className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros */}
      <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Fechas */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Empresa */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Empresa</Label>
              <Select value={selectedCompany} onValueChange={(val) => setSelectedCompany(val || 'ALL')}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas las empresas</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de Bono */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tipo de Bono</Label>
              <Select value={selectedType} onValueChange={(val) => setSelectedType(val || 'ALL')}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los tipos</SelectItem>
                  {bonusTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Estado de Bono */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Estado Bono</Label>
              <Select value={selectedStatus} onValueChange={(val: any) => setSelectedStatus(val)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="voided">Anulados</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Estado Pago */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Liquidación</Label>
              <Select value={selectedPaidStatus} onValueChange={(val: any) => setSelectedPaidStatus(val)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendientes</SelectItem>
                  <SelectItem value="paid">Liquidados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-1 items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar colaborador o RUT..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <div className="relative w-36">
                <Input
                  placeholder="Filtrar por N° OT..."
                  value={searchOt}
                  onChange={(e) => setSearchOt(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="text-xs h-9 text-slate-500"
              >
                Limpiar
              </Button>
              <Button
                size="sm"
                onClick={handleApplyFilters}
                disabled={loading}
                className="gap-1.5 h-9 bg-slate-900 hover:bg-slate-800 text-white text-xs"
              >
                <Filter className="h-3.5 w-3.5" />
                {loading ? 'Filtrando...' : 'Aplicar Filtros'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Barra de Liquidación en Bloque */}
      {selectedIds.length > 0 && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 text-sm text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span>
              <strong>{selectedIds.length}</strong> {selectedIds.length === 1 ? 'bono seleccionado' : 'bonos seleccionados'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="month"
              value={bulkPaidMonth}
              onChange={(e) => setBulkPaidMonth(e.target.value)}
              className="h-9 w-44 text-xs bg-white dark:bg-slate-900"
              placeholder="YYYY-MM"
            />
            <Button
              size="sm"
              onClick={handleBulkLiquidate}
              disabled={bulkLiquidating || !bulkPaidMonth}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
            >
              {bulkLiquidating ? 'Asignando...' : 'Asignar Mes Liquidado'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-600"
            >
              Deseleccionar
            </Button>
          </div>
        </div>
      )}

      {/* Tabla de Registros */}
      <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/70 dark:bg-slate-900/50">
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    records.length > 0 &&
                    selectedIds.length === records.filter((r) => r.status === 'active').length
                  }
                  onCheckedChange={handleSelectAll}
                  aria-label="Seleccionar todos"
                />
              </TableHead>
              <TableHead className="text-xs font-semibold">Colaborador</TableHead>
              <TableHead className="text-xs font-semibold">Tipo Bono</TableHead>
              <TableHead className="text-xs font-semibold">Fecha</TableHead>
              <TableHead className="text-xs font-semibold">N° OT</TableHead>
              <TableHead className="text-xs font-semibold text-right">Monto</TableHead>
              <TableHead className="text-xs font-semibold">Estado / Mes</TableHead>
              <TableHead className="text-xs font-semibold">Observaciones</TableHead>
              <TableHead className="text-xs font-semibold text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                  No se encontraron bonos registrados con los filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              records.map((item) => {
                const p = item.personnel;
                const isVoided = item.status === 'voided';
                const isPaid = Boolean(item.paid_month);

                return (
                  <TableRow
                    key={item.id}
                    className={`text-xs ${
                      isVoided ? 'opacity-50 line-through bg-slate-50/50 dark:bg-slate-900/30' : ''
                    }`}
                  >
                    <TableCell>
                      {!isVoided && (
                        <Checkbox
                          checked={selectedIds.includes(item.id)}
                          onCheckedChange={() => handleToggleSelectRow(item.id)}
                          aria-label={`Seleccionar bono ${item.id}`}
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {p ? `${p.first_name} ${p.last_name_father} ${p.last_name_mother || ''}` : 'N/A'}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {p?.rut || ''} {p?.company?.name ? `• ${p.company.name}` : ''}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="font-normal text-[11px] gap-1">
                        <Coins className="h-3 w-3 text-emerald-600" />
                        {item.bonus_type?.name || 'Bono'}
                      </Badge>
                    </TableCell>

                    <TableCell className="font-mono text-[11px]">
                      {item.date ? format(parseISO(item.date), 'dd/MM/yyyy') : '-'}
                    </TableCell>

                    <TableCell>
                      {item.ot_number ? (
                        <span className="font-mono font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300">
                          {item.ot_number}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">-</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right font-bold text-slate-900 dark:text-slate-100">
                      ${item.amount.toLocaleString('es-CL')}
                    </TableCell>

                    <TableCell>
                      {isVoided ? (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <Ban className="h-3 w-3" /> Anulado
                        </Badge>
                      ) : isPaid ? (
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {item.paid_month}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] gap-1">
                          <Clock className="h-3 w-3" /> Pendiente
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="max-w-[180px] truncate" title={item.observations || ''}>
                      {isVoided ? (
                        <span className="text-red-500 italic text-[11px]" title={item.void_reason || ''}>
                          Motivo: {item.void_reason}
                        </span>
                      ) : (
                        item.observations || '-'
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      {!isVoided && !isPaid && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-500 hover:text-slate-900"
                            onClick={() => handleOpenEdit(item)}
                            title="Editar bono"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                            onClick={() => handleOpenVoid(item)}
                            title="Anular bono"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Modal Bono Individual */}
      <Dialog open={isSingleModalOpen} onOpenChange={setIsSingleModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveSingle}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-emerald-600" />
                Registrar Nuevo Bono
              </DialogTitle>
              <DialogDescription>
                Ingreso manual individual para un colaborador.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Selector Searchable de Colaborador */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Colaborador *</Label>
                <Popover open={comboboxOpenPerson} onOpenChange={setComboboxOpenPerson}>
                  <PopoverTrigger
                    role="combobox"
                    aria-expanded={comboboxOpenPerson}
                    className={cn(
                      buttonVariants({ variant: 'outline' }),
                      "w-full justify-between h-9 text-xs font-normal"
                    )}
                  >
                    {(() => {
                      const p = personnelList.find((item) => item.id === formPersonnelId);
                      return p 
                        ? `${p.first_name} ${p.last_name_father} (${p.rut})`
                        : "Seleccionar colaborador o escribir para buscar...";
                    })()}
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                  </PopoverTrigger>
                  <PopoverContent className="w-[380px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Escribe nombre, apellido o RUT..." className="text-xs" />
                      <CommandList className="max-h-56">
                        <CommandEmpty>No se encontró ningún colaborador.</CommandEmpty>
                        <CommandGroup>
                          {personnelList.map((p) => {
                            const isSelected = formPersonnelId === p.id;
                            return (
                              <CommandItem
                                key={p.id}
                                value={`${p.first_name} ${p.last_name_father} ${p.last_name_mother || ''} ${p.rut}`}
                                onSelect={() => {
                                  setFormPersonnelId(p.id);
                                  setComboboxOpenPerson(false);
                                }}
                                className="text-xs cursor-pointer flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <Check className={`h-3.5 w-3.5 text-emerald-600 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                                  <div>
                                    <p className="font-semibold">{p.first_name} {p.last_name_father} {p.last_name_mother || ''}</p>
                                    <p className="text-[11px] text-muted-foreground font-mono">{p.rut}</p>
                                  </div>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Selector Searchable de Tipo de Bono */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tipo de Bono *</Label>
                <Popover open={comboboxOpenType} onOpenChange={setComboboxOpenType}>
                  <PopoverTrigger
                    role="combobox"
                    aria-expanded={comboboxOpenType}
                    className={cn(
                      buttonVariants({ variant: 'outline' }),
                      "w-full justify-between h-9 text-xs font-normal"
                    )}
                  >
                    {(() => {
                      const t = bonusTypes.find((item) => item.id === formTypeId);
                      return t 
                        ? `${t.name} ${t.default_amount > 0 ? `($${t.default_amount.toLocaleString('es-CL')})` : '(Monto variable)'}`
                        : "Seleccionar tipo de bono...";
                    })()}
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                  </PopoverTrigger>
                  <PopoverContent className="w-[380px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar tipo de bono..." className="text-xs" />
                      <CommandList className="max-h-52">
                        <CommandEmpty>No se encontró tipo de bono.</CommandEmpty>
                        <CommandGroup>
                          {bonusTypes.map((t) => {
                            const isSelected = formTypeId === t.id;
                            return (
                              <CommandItem
                                key={t.id}
                                value={`${t.name} ${t.code}`}
                                onSelect={() => {
                                  handleSingleTypeChange(t.id);
                                  setComboboxOpenType(false);
                                }}
                                className="text-xs cursor-pointer flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2">
                                  <Check className={`h-3.5 w-3.5 text-emerald-600 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                                  <div>
                                    <p className="font-semibold">{t.name}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                      {t.default_amount > 0 ? `$${t.default_amount.toLocaleString('es-CL')}` : 'Monto manual'} • {t.requires_ot ? 'Exige OT' : 'Sin OT obligatoria'}
                                    </p>
                                  </div>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Fecha</Label>
                  <Input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Monto ($ CLP)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formAmount || ''}
                    disabled={!currentSelectedTypeObj?.amount_is_editable}
                    onChange={(e) => setFormAmount(Number(e.target.value))}
                    className="text-xs"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center justify-between">
                  <span>N° Orden de Trabajo (OT)</span>
                  {currentSelectedTypeObj?.requires_ot && (
                    <span className="text-[10px] text-emerald-600 font-semibold">* Requerido</span>
                  )}
                </Label>
                <Input
                  placeholder="Ej: OT-10492"
                  value={formOt}
                  onChange={(e) => setFormOt(e.target.value)}
                  className="text-xs font-mono"
                  required={currentSelectedTypeObj?.requires_ot}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Observaciones / Detalle</Label>
                <Textarea
                  placeholder="Ej: Limpieza de stall, desarme, cliente asociado..."
                  value={formObservations}
                  onChange={(e) => setFormObservations(e.target.value)}
                  className="text-xs"
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsSingleModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={savingAction} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {savingAction ? 'Guardando...' : 'Crear Bono'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Ingreso Grupal por OT */}
      <Dialog open={isBatchModalOpen} onOpenChange={setIsBatchModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSaveBatch}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-600" />
                Ingreso Grupal por OT
              </DialogTitle>
              <DialogDescription>
                Asigna un bono a múltiples colaboradores que participaron en la misma Orden de Trabajo.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Tipo de Bono</Label>
                  <Select value={batchTypeId} onValueChange={(val) => setBatchTypeId(val || '')}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {bonusTypes
                        .filter((t) => t.requires_ot || !t.amount_is_editable)
                        .map((t) => (
                          <SelectItem key={t.id} value={t.id} className="text-xs">
                            {t.name} (${t.default_amount.toLocaleString('es-CL')})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Fecha</Label>
                  <Input
                    type="date"
                    value={batchDate}
                    onChange={(e) => setBatchDate(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">N° Orden de Trabajo (OT)</Label>
                  <Input
                    placeholder="Ej: OT-88421"
                    value={batchOt}
                    onChange={(e) => setBatchOt(e.target.value)}
                    className="text-xs font-mono uppercase"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Observación (Actividad/Cliente)</Label>
                  <Input
                    placeholder="Ej: Limpieza Stall / Hidronor"
                    value={batchObservations}
                    onChange={(e) => setBatchObservations(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Selección múltiple de colaboradores */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">
                    Colaboradores Participantes ({batchPersonnelIds.length} seleccionados)
                  </Label>
                  <Input
                    placeholder="Filtrar colaboradores..."
                    value={batchSearchPerson}
                    onChange={(e) => setBatchSearchPerson(e.target.value)}
                    className="h-7 w-48 text-[11px]"
                  />
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-2 max-h-48 overflow-y-auto space-y-1 bg-slate-50/50 dark:bg-slate-900/50">
                  {filteredBatchPersonnel.map((p) => {
                    const isChecked = batchPersonnelIds.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleToggleBatchPerson(p.id)}
                        className={`flex items-center gap-2 p-1.5 rounded cursor-pointer text-xs transition-colors ${
                          isChecked ? 'bg-emerald-100/70 dark:bg-emerald-950/40 font-medium' : 'hover:bg-slate-100'
                        }`}
                      >
                        <Checkbox checked={isChecked} />
                        <span>
                          {p.first_name} {p.last_name_father} ({p.rut})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsBatchModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={savingAction} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {savingAction ? 'Emitiendo bonos...' : `Asignar a ${batchPersonnelIds.length} Colaboradores`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Anulación de Bono */}
      <Dialog open={isVoidModalOpen} onOpenChange={setIsVoidModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleConfirmVoid}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Anular Registro de Bono
              </DialogTitle>
              <DialogDescription>
                El bono quedará marcado como ANULADO en auditoría y no se sumará a liquidaciones de sueldo.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              {targetRecord && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-lg text-xs space-y-1">
                  <p><strong>Colaborador:</strong> {targetRecord.personnel?.first_name} {targetRecord.personnel?.last_name_father}</p>
                  <p><strong>Tipo:</strong> {targetRecord.bonus_type?.name} (${targetRecord.amount.toLocaleString('es-CL')})</p>
                  {targetRecord.ot_number && <p><strong>OT:</strong> {targetRecord.ot_number}</p>}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="voidReason" className="text-xs font-semibold">
                  Motivo de Anulación (Auditoría) *
                </Label>
                <Textarea
                  id="voidReason"
                  placeholder="Indica la razón: error de digitación, trabajo cancelado en faena, OT incorrecta..."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="text-xs"
                  rows={3}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsVoidModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={savingAction} variant="destructive">
                {savingAction ? 'Anulando...' : 'Confirmar Anulación'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Bono */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveEdit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-emerald-600" />
                Editar Bono
              </DialogTitle>
              <DialogDescription>
                Modificación de registro pendiente de liquidación.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Fecha</Label>
                  <Input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Monto ($ CLP)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formAmount}
                    disabled={!targetRecord?.bonus_type?.amount_is_editable}
                    onChange={(e) => setFormAmount(Number(e.target.value))}
                    className="text-xs"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">N° Orden de Trabajo (OT)</Label>
                <Input
                  value={formOt}
                  onChange={(e) => setFormOt(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Observaciones</Label>
                <Textarea
                  value={formObservations}
                  onChange={(e) => setFormObservations(e.target.value)}
                  className="text-xs"
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={savingAction} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {savingAction ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
