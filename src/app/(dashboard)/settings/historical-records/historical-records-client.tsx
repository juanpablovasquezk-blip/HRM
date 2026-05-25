'use client';

import React, { useState } from 'react';
import { 
  Calendar, 
  User, 
  MapPin, 
  Clock, 
  Briefcase, 
  Plus, 
  Trash2, 
  Save, 
  Car,
  History,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  createHistoricalExtraShift, 
  createHistoricalOwnTransport, 
  deleteHistoricalRecord,
  getHistoricalData
} from './actions';

interface Metadata {
  personnel: Array<{ id: string; first_name: string; last_name_father: string; last_name_mother?: string | null }>;
  shifts: Array<{ id: string; name: string; start_time: string; end_time: string }>;
  areas: Array<{ id: string; name: string }>;
  positions: Array<{ id: string; name: string }>;
}

interface HistoryItem {
  id: string;
  date: string;
  is_extra?: boolean;
  transport_type?: string;
  personnel?: { id: string; first_name: string; last_name_father: string } | null;
  shift?: { id: string; name: string; start_time: string; end_time: string } | null;
  area?: { id: string; name: string } | null;
  position?: { id: string; name: string } | null;
}

interface Props {
  metadata: Metadata;
  initialHistory: {
    extraShifts: HistoryItem[];
    ownTransports: HistoryItem[];
  };
}

const SortIndicator = ({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) => {
  if (!active) return <span className="ml-1.5 text-slate-300 dark:text-slate-700 select-none text-[10px]">↕</span>;
  return <span className="ml-1.5 text-indigo-600 dark:text-indigo-400 font-bold select-none text-[10px]">{direction === 'asc' ? '▲' : '▼'}</span>;
};

export default function HistoricalRecordsClient({ metadata, initialHistory }: Props) {
  const [activeTab, setActiveTab] = useState<'shifts' | 'transport'>('shifts');
  const [history, setHistory] = useState(initialHistory);
  const [saving, setSaving] = useState(false);
  const [shiftConflict, setShiftConflict] = useState<string | null>(null);

  // Sorting State
  const [shiftsSortField, setShiftsSortField] = useState<'date' | 'employee' | 'shift' | 'area'>('date');
  const [shiftsSortDir, setShiftsSortDir] = useState<'asc' | 'desc'>('desc');

  const [transportsSortField, setTransportsSortField] = useState<'date' | 'employee' | 'type'>('date');
  const [transportsSortDir, setTransportsSortDir] = useState<'asc' | 'desc'>('desc');

  const handleShiftsSort = (field: 'date' | 'employee' | 'shift' | 'area') => {
    if (shiftsSortField === field) {
      setShiftsSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setShiftsSortField(field);
      setShiftsSortDir('asc');
    }
  };

  const handleTransportsSort = (field: 'date' | 'employee' | 'type') => {
    if (transportsSortField === field) {
      setTransportsSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setTransportsSortField(field);
      setTransportsSortDir('asc');
    }
  };

  const getSortedShifts = () => {
    const items = [...history.extraShifts];
    items.sort((a, b) => {
      let aVal = '';
      let bVal = '';

      if (shiftsSortField === 'date') {
        aVal = a.date;
        bVal = b.date;
      } else if (shiftsSortField === 'employee') {
        aVal = `${a.personnel?.first_name || ''} ${a.personnel?.last_name_father || ''}`.trim().toLowerCase();
        bVal = `${b.personnel?.first_name || ''} ${b.personnel?.last_name_father || ''}`.trim().toLowerCase();
      } else if (shiftsSortField === 'shift') {
        aVal = (a.shift?.name || '').toLowerCase();
        bVal = (b.shift?.name || '').toLowerCase();
      } else if (shiftsSortField === 'area') {
        aVal = `${a.area?.name || ''} - ${a.position?.name || ''}`.trim().toLowerCase();
        bVal = `${b.area?.name || ''} - ${b.position?.name || ''}`.trim().toLowerCase();
      }

      if (aVal < bVal) return shiftsSortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return shiftsSortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  };

  const getSortedTransports = () => {
    const items = [...history.ownTransports];
    items.sort((a, b) => {
      let aVal = '';
      let bVal = '';

      if (transportsSortField === 'date') {
        aVal = a.date;
        bVal = b.date;
      } else if (transportsSortField === 'employee') {
        aVal = `${a.personnel?.first_name || ''} ${a.personnel?.last_name_father || ''}`.trim().toLowerCase();
        bVal = `${b.personnel?.first_name || ''} ${b.personnel?.last_name_father || ''}`.trim().toLowerCase();
      } else if (transportsSortField === 'type') {
        aVal = (a.transport_type || '').toLowerCase();
        bVal = (b.transport_type || '').toLowerCase();
      }

      if (aVal < bVal) return transportsSortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return transportsSortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  };

  // Extra Shift Form State
  const [shiftForm, setShiftForm] = useState({
    personnelId: '',
    date: '',
    shiftId: '',
    areaId: '',
    positionId: '',
    observations: ''
  });

  // Own Transport Form State
  const [transportForm, setTransportForm] = useState({
    personnelId: '',
    date: ''
  });

  // Filter Query States
  const [filterType, setFilterType] = useState<'month' | 'range'>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);

  const getStartAndEndOfMonth = (yearMonth: string) => {
    const [year, month] = yearMonth.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    
    const formatDate = (d: Date) => {
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      return `${yStr}-${mStr}-${dStr}`;
    };
    return {
      start: formatDate(start),
      end: formatDate(end)
    };
  };

  const refreshHistory = async (customStart?: string, customEnd?: string) => {
    setQueryLoading(true);
    let startStr = customStart;
    let endStr = customEnd;

    if (!startStr && !endStr) {
      if (filterType === 'month') {
        const bounds = getStartAndEndOfMonth(selectedMonth);
        startStr = bounds.start;
        endStr = bounds.end;
      } else {
        startStr = rangeStart || undefined;
        endStr = rangeEnd || undefined;
      }
    }

    const res = await getHistoricalData(startStr, endStr);
    setQueryLoading(false);
    if (res.data) {
      setHistory(res.data);
    } else if (res.error) {
      toast.error(res.error);
    }
  };

  const handleSaveShift = async (e: React.FormEvent, forceOverride = false) => {
    e.preventDefault();
    if (!shiftForm.personnelId || !shiftForm.date || !shiftForm.shiftId || !shiftForm.areaId || !shiftForm.positionId) {
      toast.error('Todos los campos son obligatorios.');
      return;
    }

    setSaving(true);
    const res = await createHistoricalExtraShift({ ...shiftForm, forceOverride });
    setSaving(false);

    if ('conflict' in res && res.conflict) {
      // Show inline conflict warning instead of blocking
      setShiftConflict(res.conflictMessage ?? 'Conflicto detectado.');
      return;
    }

    if ('error' in res && res.error) {
      toast.error(res.error);
    } else {
      toast.success('Turno extra histórico registrado con éxito.');
      setShiftConflict(null);
      setShiftForm({
        personnelId: '',
        date: '',
        shiftId: '',
        areaId: '',
        positionId: '',
        observations: ''
      });
      refreshHistory();
    }
  };

  const handleSaveTransport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transportForm.personnelId || !transportForm.date) {
      toast.error('Todos los campos son obligatorios.');
      return;
    }

    setSaving(true);
    const res = await createHistoricalOwnTransport(transportForm);
    setSaving(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success('Transporte propio histórico registrado con éxito.');
      setTransportForm({
        personnelId: '',
        date: ''
      });
      refreshHistory();
    }
  };

  const handleDelete = async (type: 'shift' | 'transport', id: string) => {
    const confirmDelete = window.confirm('¿Está seguro de que desea eliminar este registro histórico?');
    if (!confirmDelete) return;

    const res = await deleteHistoricalRecord(type, id);
    if (res.error) {
      toast.error(`Error al eliminar: ${res.error}`);
    } else {
      toast.success('Registro histórico eliminado con éxito.');
      refreshHistory();
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs Navigator */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('shifts')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-bold uppercase border-b-2 transition-all ${
            activeTab === 'shifts'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Calendar className="w-4 h-4" /> Turnos Extras Históricos
        </button>
        <button
          onClick={() => setActiveTab('transport')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-bold uppercase border-b-2 transition-all ${
            activeTab === 'transport'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Car className="w-4 h-4" /> Transporte Propio Histórico
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* FORM SIDE */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h2 className="text-md font-bold text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-600" />
            {activeTab === 'shifts' ? 'Registrar Turno Extra' : 'Registrar Transporte Propio'}
          </h2>

          {activeTab === 'shifts' ? (
            <form onSubmit={handleSaveShift} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase flex items-center gap-1">
                  <User className="w-3 h-3" /> Empleado
                </label>
                <select
                  value={shiftForm.personnelId}
                  onChange={(e) => { setShiftForm({ ...shiftForm, personnelId: e.target.value }); setShiftConflict(null); }}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm"
                  required
                >
                  <option value="">Seleccione Empleado...</option>
                  {metadata.personnel.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name_father} {p.last_name_mother || ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Fecha
                </label>
                <input
                  type="date"
                  value={shiftForm.date}
                  onChange={(e) => { setShiftForm({ ...shiftForm, date: e.target.value }); setShiftConflict(null); }}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Área
                  </label>
                  <select
                    value={shiftForm.areaId}
                    onChange={(e) => setShiftForm({ ...shiftForm, areaId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm"
                    required
                  >
                    <option value="">Área...</option>
                    {metadata.areas.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase flex items-center gap-1">
                    <Briefcase className="w-3 h-3" /> Cargo
                  </label>
                  <select
                    value={shiftForm.positionId}
                    onChange={(e) => setShiftForm({ ...shiftForm, positionId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm"
                    required
                  >
                    <option value="">Cargo...</option>
                    {metadata.positions.map((po) => (
                      <option key={po.id} value={po.id}>{po.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Turno
                </label>
                <select
                  value={shiftForm.shiftId}
                  onChange={(e) => setShiftForm({ ...shiftForm, shiftId: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm"
                  required
                >
                  <option value="">Seleccione Turno...</option>
                  {metadata.shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.start_time.substring(0, 5)} - {s.end_time.substring(0, 5)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Observations field */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Observaciones (opcional)
                </label>
                <textarea
                  value={shiftForm.observations}
                  onChange={(e) => setShiftForm({ ...shiftForm, observations: e.target.value })}
                  placeholder="Motivo del turno extra, contexto adicional..."
                  rows={2}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Conflict warning banner */}
              {shiftConflict && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-2">
                  <p className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    ⚠️ {shiftConflict}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={(e: any) => handleSaveShift(e, true)}
                      disabled={saving}
                      className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Guardando...' : 'Sí, registrar de todas formas'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShiftConflict(null)}
                      className="px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {!shiftConflict && (
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Guardando...' : 'Guardar Turno Extra'}
                </button>
              )}
            </form>
          ) : (
            <form onSubmit={handleSaveTransport} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase flex items-center gap-1">
                  <User className="w-3 h-3" /> Empleado
                </label>
                <select
                  value={transportForm.personnelId}
                  onChange={(e) => setTransportForm({ ...transportForm, personnelId: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm"
                  required
                >
                  <option value="">Seleccione Empleado...</option>
                  {metadata.personnel.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name_father} {p.last_name_mother || ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Fecha
                </label>
                <input
                  type="date"
                  value={transportForm.date}
                  onChange={(e) => setTransportForm({ ...transportForm, date: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Guardando...' : 'Guardar Transporte Propio'}
              </button>
            </form>
          )}
        </div>

        {/* LIST SIDE */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-md font-bold text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-600" />
              Historial de Registros
            </h2>
            {queryLoading && (
              <span className="text-xs text-slate-400 flex items-center gap-1.5 font-semibold">
                <span className="animate-spin rounded-full h-3 w-3 border-2 border-indigo-600 border-t-transparent"></span>
                Actualizando...
              </span>
            )}
          </div>

          {/* QUERY FILTERS */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-150 dark:border-slate-850 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Filtrar consulta en pantalla</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilterType('month')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
                    filterType === 'month'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-200 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  Por Mes
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('range')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all ${
                    filterType === 'range'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-200 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  Rango
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 text-xs">
              {filterType === 'month' ? (
                <div className="flex-1 min-w-[140px] space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                    Seleccionar Mes
                  </label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-medium focus:outline-none focus:ring-1.5 focus:ring-indigo-500"
                  />
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-[110px] space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                      Desde
                    </label>
                    <input
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono focus:outline-none focus:ring-1.5 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex-1 min-w-[110px] space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                      Hasta
                    </label>
                    <input
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono focus:outline-none focus:ring-1.5 focus:ring-indigo-500"
                    />
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={() => refreshHistory()}
                disabled={queryLoading}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 h-[38px] flex items-center justify-center min-w-[100px]"
              >
                {queryLoading ? (
                  <span className="flex items-center gap-1">
                    <span className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></span>
                    Cargando
                  </span>
                ) : (
                  'Consultar'
                )}
              </button>
            </div>
          </div>

          {activeTab === 'shifts' ? (
            <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-400 uppercase font-black border-b border-slate-150 dark:border-slate-800">
                  <tr>
                    <th 
                      className="px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      onClick={() => handleShiftsSort('date')}
                    >
                      <div className="flex items-center">
                        Fecha
                        <SortIndicator active={shiftsSortField === 'date'} direction={shiftsSortDir} />
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      onClick={() => handleShiftsSort('employee')}
                    >
                      <div className="flex items-center">
                        Empleado
                        <SortIndicator active={shiftsSortField === 'employee'} direction={shiftsSortDir} />
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      onClick={() => handleShiftsSort('shift')}
                    >
                      <div className="flex items-center">
                        Turno
                        <SortIndicator active={shiftsSortField === 'shift'} direction={shiftsSortDir} />
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      onClick={() => handleShiftsSort('area')}
                    >
                      <div className="flex items-center">
                        Área / Cargo
                        <SortIndicator active={shiftsSortField === 'area'} direction={shiftsSortDir} />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {getSortedShifts().map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                      <td className="px-4 py-3 text-slate-500 font-mono">{s.date}</td>
                      <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-350 uppercase">
                        {s.personnel?.first_name} {s.personnel?.last_name_father}
                      </td>
                      <td className="px-4 py-3 text-indigo-600 dark:text-indigo-400 font-bold">{s.shift?.name}</td>
                      <td className="px-4 py-3 text-slate-500">
                        <div className="font-semibold text-slate-600 dark:text-slate-400">{s.area?.name}</div>
                        <div className="text-[10px] text-slate-400">{s.position?.name}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleDelete('shift', s.id)}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-all"
                          title="Eliminar registro"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {history.extraShifts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400 italic bg-white dark:bg-slate-900">
                        No hay turnos extras históricos registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-400 uppercase font-black border-b border-slate-150 dark:border-slate-800">
                  <tr>
                    <th 
                      className="px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      onClick={() => handleTransportsSort('date')}
                    >
                      <div className="flex items-center">
                        Fecha
                        <SortIndicator active={transportsSortField === 'date'} direction={transportsSortDir} />
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      onClick={() => handleTransportsSort('employee')}
                    >
                      <div className="flex items-center">
                        Empleado
                        <SortIndicator active={transportsSortField === 'employee'} direction={transportsSortDir} />
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      onClick={() => handleTransportsSort('type')}
                    >
                      <div className="flex items-center">
                        Tipo
                        <SortIndicator active={transportsSortField === 'type'} direction={transportsSortDir} />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {getSortedTransports().map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                      <td className="px-4 py-3 text-slate-500 font-mono">{t.date}</td>
                      <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-350 uppercase">
                        {t.personnel?.first_name} {t.personnel?.last_name_father}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase">
                          Propio
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleDelete('transport', t.id)}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-all"
                          title="Eliminar registro"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {history.ownTransports.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400 italic bg-white dark:bg-slate-900">
                        No hay transportes propios históricos registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
