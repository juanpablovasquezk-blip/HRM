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

export default function HistoricalRecordsClient({ metadata, initialHistory }: Props) {
  const [activeTab, setActiveTab] = useState<'shifts' | 'transport'>('shifts');
  const [history, setHistory] = useState(initialHistory);
  const [saving, setSaving] = useState(false);

  // Extra Shift Form State
  const [shiftForm, setShiftForm] = useState({
    personnelId: '',
    date: '',
    shiftId: '',
    areaId: '',
    positionId: ''
  });

  // Own Transport Form State
  const [transportForm, setTransportForm] = useState({
    personnelId: '',
    date: ''
  });

  const refreshHistory = async () => {
    const res = await getHistoricalData();
    if (res.data) {
      setHistory(res.data);
    }
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftForm.personnelId || !shiftForm.date || !shiftForm.shiftId || !shiftForm.areaId || !shiftForm.positionId) {
      toast.error('Todos los campos son obligatorios.');
      return;
    }

    setSaving(true);
    const res = await createHistoricalExtraShift(shiftForm);
    setSaving(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success('Turno extra histórico registrado con éxito.');
      setShiftForm({
        personnelId: '',
        date: '',
        shiftId: '',
        areaId: '',
        positionId: ''
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
                  onChange={(e) => setShiftForm({ ...shiftForm, personnelId: e.target.value })}
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
                  onChange={(e) => setShiftForm({ ...shiftForm, date: e.target.value })}
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

              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Guardando...' : 'Guardar Turno Extra'}
              </button>
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
          <h2 className="text-md font-bold text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-600" />
            Historial de Registros
          </h2>

          {activeTab === 'shifts' ? (
            <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-400 uppercase font-black border-b border-slate-150 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Empleado</th>
                    <th className="px-4 py-3">Turno</th>
                    <th className="px-4 py-3">Área / Cargo</th>
                    <th className="px-4 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {history.extraShifts.map((s) => (
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
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Empleado</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {history.ownTransports.map((t) => (
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
