'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { format, endOfMonth, parseISO, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Palmtree,
  Send,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  checkWorkerQuotaAvailability,
  deleteWorkerLeave,
  requestFreeDays,
  requestVacation,
} from '../actions';
import {
  buildWorkerMonthSelectorOptions,
  expandDateRange,
  FREE_DAY_REQUEST_REASON,
  isMonthOpenForWorkerRequest,
  VACATION_SUCCESS_MESSAGE,
  validateWeeklyFreeDayQuota,
} from '@/lib/worker/portal-requests';

interface FreeRequestClientProps {
  personnelId: string;
  initialRequests?: any[];
  referenceNowIso?: string;
  rotationPattern?: string | null;
  ns22AnchorDate?: string | null;
  requiresShifts?: boolean | null;
  birthDate?: string | null;
  initialFreeOccupiedDates?: string[];
  initialVacationOccupiedDates?: string[];
  initialVacationSuccessMessage?: string | null;
}

export default function FreeRequestClient({
  personnelId,
  initialRequests = [],
  referenceNowIso,
  rotationPattern = null,
  ns22AnchorDate = null,
  requiresShifts = true,
  birthDate = null,
  initialFreeOccupiedDates = [],
  initialVacationOccupiedDates = [],
  initialVacationSuccessMessage = null,
}: FreeRequestClientProps) {
  const referenceNow = useMemo(
    () => (referenceNowIso ? new Date(referenceNowIso) : new Date()),
    [referenceNowIso]
  );

  const monthOptions = useMemo(
    () => buildWorkerMonthSelectorOptions(referenceNow),
    [referenceNow]
  );

  const defaultOpenMonth =
    monthOptions.find((m) => m.isOpen)?.yearMonth || monthOptions[0]?.yearMonth || '';

  const [requests, setRequests] = useState<any[]>(initialRequests);
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultOpenMonth);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [freeOccupiedDates, setFreeOccupiedDates] = useState<string[]>(initialFreeOccupiedDates);
  const [isCheckingFree, setIsCheckingFree] = useState(false);
  const [isSubmittingFree, setIsSubmittingFree] = useState(false);

  // Vacation form state
  const [vacStart, setVacStart] = useState<string>('');
  const [vacEnd, setVacEnd] = useState<string>('');
  const [vacOccupiedDates, setVacOccupiedDates] = useState<string[]>(initialVacationOccupiedDates);
  const [isCheckingVac, setIsCheckingVac] = useState(false);
  const [isSubmittingVac, setIsSubmittingVac] = useState(false);
  const [vacSuccessMsg, setVacSuccessMsg] = useState<string | null>(initialVacationSuccessMessage);

  const [isPendingDelete, startDeleteTransition] = useTransition();

  const selectedMonthOption =
    monthOptions.find((m) => m.yearMonth === selectedMonth) || monthOptions[0];

  const freeRequestsInSelectedMonth = useMemo(() => {
    return requests.filter(
      (r) =>
        r.type === 'other' &&
        r.reason === FREE_DAY_REQUEST_REASON &&
        String(r.start_date).startsWith(selectedMonth)
    );
  }, [requests, selectedMonth]);

  const activeFreeDaysCountInMonth = useMemo(() => {
    const activeDates = new Set<string>();
    for (const req of freeRequestsInSelectedMonth) {
      if (req.status === 'pending' || req.status === 'approved') {
        for (const d of expandDateRange(req.start_date, req.end_date)) {
          if (d.startsWith(selectedMonth)) activeDates.add(d);
        }
      }
    }
    return activeDates.size;
  }, [freeRequestsInSelectedMonth, selectedMonth]);

  const remainingFreeQuota = Math.max(0, 2 - activeFreeDaysCountInMonth);
  const isFreeLimitReached = remainingFreeQuota === 0;

  const weeklyQuotaCheck = useMemo(
    () =>
      validateWeeklyFreeDayQuota({
        rotationPattern,
        ns22AnchorDate,
        requiresShifts,
        birthDate,
        existingFreeRequests: requests,
        selectedDates,
      }),
    [rotationPattern, ns22AnchorDate, requiresShifts, birthDate, requests, selectedDates]
  );

  const verifyFreeDatesQuota = async (datesToVerify: string[]) => {
    if (datesToVerify.length === 0) {
      setFreeOccupiedDates([]);
      return;
    }
    setIsCheckingFree(true);
    const check = await checkWorkerQuotaAvailability({ personnelId, dates: datesToVerify });
    setIsCheckingFree(false);
    setFreeOccupiedDates(check.occupiedDates || []);
  };

  const handleDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    if (!date) return;

    if (!date.startsWith(selectedMonth)) {
      toast.error(`Selecciona una fecha dentro de ${selectedMonthOption?.label || selectedMonth}.`);
      return;
    }

    if (selectedDates.includes(date)) {
      const next = selectedDates.filter((d) => d !== date);
      setSelectedDates(next);
      await verifyFreeDatesQuota(next);
      return;
    }

    if (selectedDates.length >= remainingFreeQuota) {
      toast.error(`Te quedan ${remainingFreeQuota} día(s) libre(s) disponible(s) en este mes.`);
      return;
    }

    const next = [...selectedDates, date].sort();
    setSelectedDates(next);
    await verifyFreeDatesQuota(next);
  };

  const handleRemoveFreeDate = async (date: string) => {
    const next = selectedDates.filter((d) => d !== date);
    setSelectedDates(next);
    await verifyFreeDatesQuota(next);
  };

  const handleSubmitFree = async () => {
    if (selectedDates.length === 0 || freeOccupiedDates.length > 0 || !weeklyQuotaCheck.valid) return;

    setIsSubmittingFree(true);
    const res = await requestFreeDays(personnelId, selectedDates);
    if (res.success) {
      toast.success('Solicitud de días libres enviada (Pendiente de revisión)');
      const newRows = selectedDates.map((d, idx) => ({
        id: res.ids?.[idx] || `local-free-${d}-${Date.now()}`,
        personnel_id: personnelId,
        start_date: d,
        end_date: d,
        type: 'other',
        status: 'pending',
        reason: FREE_DAY_REQUEST_REASON,
      }));
      setRequests((prev) => [...prev, ...newRows].sort((a, b) => a.start_date.localeCompare(b.start_date)));
      setSelectedDates([]);
      setFreeOccupiedDates([]);
    } else {
      if (res.occupiedDates && res.occupiedDates.length > 0) {
        setFreeOccupiedDates(res.occupiedDates);
      }
      toast.error(res.error || 'No se pudo enviar la solicitud');
    }
    setIsSubmittingFree(false);
  };

  const vacRangeDates = useMemo(() => expandDateRange(vacStart, vacEnd), [vacStart, vacEnd]);

  const vacClosedDates = useMemo(() => {
    return vacRangeDates.filter((d) => !isMonthOpenForWorkerRequest(d.slice(0, 7), referenceNow));
  }, [vacRangeDates, referenceNow]);

  const verifyVacationRange = async (start: string, end: string) => {
    const range = expandDateRange(start, end);
    if (range.length === 0) {
      setVacOccupiedDates([]);
      return;
    }
    setIsCheckingVac(true);
    const check = await checkWorkerQuotaAvailability({ personnelId, dates: range });
    setIsCheckingVac(false);
    setVacOccupiedDates(check.occupiedDates || []);
  };

  const handleVacStartChange = async (val: string) => {
    setVacStart(val);
    setVacSuccessMsg(null);
    if (val && vacEnd && val <= vacEnd) {
      await verifyVacationRange(val, vacEnd);
    } else {
      setVacOccupiedDates([]);
    }
  };

  const handleVacEndChange = async (val: string) => {
    setVacEnd(val);
    setVacSuccessMsg(null);
    if (vacStart && val && vacStart <= val) {
      await verifyVacationRange(vacStart, val);
    } else {
      setVacOccupiedDates([]);
    }
  };

  const handleSubmitVacation = async () => {
    if (!vacStart || !vacEnd || vacStart > vacEnd) {
      toast.error('Selecciona un primer y último día válidos.');
      return;
    }
    if (vacClosedDates.length > 0) {
      toast.error('El rango incluye fechas en un período cerrado.');
      return;
    }
    if (vacOccupiedDates.length > 0) {
      toast.error('Ajusta las fechas ocupadas antes de enviar tu solicitud.');
      return;
    }

    setIsSubmittingVac(true);
    const res = await requestVacation({
      personnelId,
      startDate: vacStart,
      endDate: vacEnd,
    });
    if (res.success) {
      const msg = res.message || VACATION_SUCCESS_MESSAGE;
      setVacSuccessMsg(msg);
      toast.success('Solicitud de vacaciones enviada');
      setRequests((prev) =>
        [
          ...prev,
          {
            id: res.ids?.[0] || `local-vac-${vacStart}-${Date.now()}`,
            personnel_id: personnelId,
            start_date: vacStart,
            end_date: vacEnd,
            type: 'vacation',
            status: 'pending',
            reason: 'Solicitud de vacaciones',
          },
        ].sort((a, b) => a.start_date.localeCompare(b.start_date))
      );
      setVacStart('');
      setVacEnd('');
      setVacOccupiedDates([]);
    } else {
      if (res.occupiedDates && res.occupiedDates.length > 0) {
        setVacOccupiedDates(res.occupiedDates);
      }
      toast.error(res.error || 'No se pudo enviar la solicitud de vacaciones');
    }
    setIsSubmittingVac(false);
  };

  const handleDelete = (id: string) => {
    startDeleteTransition(async () => {
      const res = await deleteWorkerLeave(id);
      if (res.success) {
        toast.success('Solicitud cancelada y cupo liberado');
        setRequests((prev) => prev.filter((r) => r.id !== id));
      } else {
        toast.error(res.error || 'No se pudo cancelar la solicitud');
      }
    });
  };

  const monthMinDate = selectedMonth
    ? format(startOfMonth(parseISO(`${selectedMonth}-01`)), 'yyyy-MM-dd')
    : undefined;
  const monthMaxDate = selectedMonth
    ? format(endOfMonth(parseISO(`${selectedMonth}-01`)), 'yyyy-MM-dd')
    : undefined;

  const formatShortDate = (iso: string) => {
    try {
      return format(parseISO(iso), 'dd-MM-yyyy');
    } catch {
      return iso;
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'approved') {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none text-[10px] font-bold">
          Aprobada
        </Badge>
      );
    }
    if (status === 'rejected') {
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-none text-[10px] font-bold">
          Rechazada
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none text-[10px] font-bold">
        Pendiente de revisión
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Solicitar días libres */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 uppercase text-sm leading-none">
                Solicitar días libres
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Máximo 2 fechas por mes
              </p>
            </div>
          </div>
        </div>

        {/* Selector de mes */}
        <div className="space-y-2">
          <label
            htmlFor="free-month-selector"
            className="text-[10px] font-black text-slate-400 uppercase tracking-widest block"
          >
            Mes a consultar o solicitar
          </label>
          <select
            id="free-month-selector"
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              setSelectedDates([]);
              setFreeOccupiedDates([]);
            }}
            className="w-full h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-900"
          >
            {monthOptions.map((opt) => (
              <option key={opt.yearMonth} value={opt.yearMonth}>
                {opt.label} — {opt.isOpen ? 'Abierto' : 'Cerrado'}
              </option>
            ))}
          </select>
        </div>

        {!selectedMonthOption?.isOpen ? (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center space-y-1.5">
            <div className="flex items-center justify-center gap-1.5 text-slate-600 font-bold text-xs uppercase">
              <Clock className="h-4 w-4" />
              Período Cerrado
            </div>
            <p className="text-xs text-slate-500">
              Las solicitudes para <strong>{selectedMonthOption?.label}</strong> cerraron el{' '}
              <strong>{formatShortDate(selectedMonthOption?.deadlineDate || '')}</strong> (horario de Santiago).
              Puedes consultar tus solicitudes registradas abajo.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs bg-slate-50 rounded-xl px-3.5 py-2.5">
              <span className="font-semibold text-slate-600">Cupo mensual disponible</span>
              <span className="font-black text-slate-900">
                {remainingFreeQuota} de 2 fechas
              </span>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="free-day-date"
                className="text-[10px] font-black text-slate-400 uppercase tracking-widest block"
              >
                Agregar fecha ({selectedMonthOption.label})
              </label>
              <input
                id="free-day-date"
                type="date"
                min={monthMinDate}
                max={monthMaxDate}
                onChange={handleDateChange}
                disabled={isFreeLimitReached}
                className="w-full p-3.5 bg-slate-50 rounded-2xl border border-slate-200 font-bold text-slate-900 disabled:opacity-50"
              />
            </div>

            {isFreeLimitReached && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3.5 flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <p className="text-xs font-bold text-emerald-800">
                  Ya completaste tus 2 fechas (pendientes o aprobadas) para {selectedMonthOption.label}.
                </p>
              </div>
            )}

            {selectedDates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedDates.map((date) => {
                  const occupied = freeOccupiedDates.includes(date);
                  return (
                    <div
                      key={date}
                      className={`px-3 py-1.5 rounded-full text-xs font-black flex items-center gap-2 border ${
                        occupied
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                      }`}
                    >
                      {formatShortDate(date)}
                      <button
                        type="button"
                        onClick={() => handleRemoveFreeDate(date)}
                        className="hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {!weeklyQuotaCheck.valid && weeklyQuotaCheck.message && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-800 leading-snug font-medium">
                  {weeklyQuotaCheck.message}
                </p>
              </div>
            )}

            {freeOccupiedDates.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-800 leading-snug">
                  El cupo para tu cargo y área ya está ocupado en:{' '}
                  <strong>{freeOccupiedDates.map(formatShortDate).join(', ')}</strong>. Ajusta y elige fechas disponibles antes de enviar.
                </p>
              </div>
            )}

            <div className="bg-amber-50 rounded-2xl p-3.5 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 leading-normal font-medium">
                Cierre del período: <strong>{formatShortDate(selectedMonthOption.deadlineDate)}</strong> al finalizar el día (horario de Santiago).
              </p>
            </div>

            <Button
              onClick={handleSubmitFree}
              disabled={
                selectedDates.length === 0 ||
                isSubmittingFree ||
                isCheckingFree ||
                isFreeLimitReached ||
                !weeklyQuotaCheck.valid ||
                freeOccupiedDates.length > 0
              }
              className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-2xl py-6 font-black uppercase tracking-widest text-xs shadow-lg shadow-slate-200"
            >
              {isSubmittingFree ? (
                'Enviando...'
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Enviar días libres
                </>
              )}
            </Button>
          </div>
        )}

        {freeRequestsInSelectedMonth.length > 0 && (
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Solicitudes en {selectedMonthOption?.label}
            </p>
            <div className="space-y-2">
              {freeRequestsInSelectedMonth.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between bg-slate-50 px-3.5 py-2.5 rounded-xl text-xs"
                >
                  <span className="font-bold text-slate-900">{formatShortDate(req.start_date)}</span>
                  {statusBadge(req.status)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Solicitar vacaciones */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="h-10 w-10 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
            <Palmtree className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 uppercase text-sm leading-none">
              Solicitar vacaciones
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Primer y último día incluidos
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="vac-start-date"
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest block"
            >
              Primer día de vacaciones
            </label>
            <input
              id="vac-start-date"
              type="date"
              value={vacStart}
              onChange={(e) => handleVacStartChange(e.target.value)}
              className="w-full p-3 bg-slate-50 rounded-2xl border border-slate-200 font-bold text-slate-900 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="vac-end-date"
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest block"
            >
              Último día de vacaciones
            </label>
            <input
              id="vac-end-date"
              type="date"
              value={vacEnd}
              min={vacStart || undefined}
              onChange={(e) => handleVacEndChange(e.target.value)}
              className="w-full p-3 bg-slate-50 rounded-2xl border border-slate-200 font-bold text-slate-900 text-sm"
            />
          </div>
        </div>

        {vacStart && vacEnd && vacStart <= vacEnd && (
          <p className="text-xs font-semibold text-slate-600">
            Rango seleccionado: <strong>{vacRangeDates.length} día(s)</strong> ({formatShortDate(vacStart)} al{' '}
            {formatShortDate(vacEnd)}).
          </p>
        )}

        {vacClosedDates.length > 0 && (
          <div className="bg-slate-100 border border-slate-200 rounded-2xl p-3.5 flex items-start gap-2.5">
            <Clock className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700 leading-snug">
              El rango incluye fechas en período cerrado ({vacClosedDates.map(formatShortDate).join(', ')}).
              Elige fechas de meses abiertos (por ejemplo, desde el 01-01-2027).
            </p>
          </div>
        )}

        {vacOccupiedDates.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-800 leading-snug">
              El cupo para tu cargo y área ya está ocupado en:{' '}
              <strong>{vacOccupiedDates.map(formatShortDate).join(', ')}</strong>. Ajusta las fechas de tu solicitud para continuar.
            </p>
          </div>
        )}

        {vacSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-900 font-medium leading-relaxed">{vacSuccessMsg}</p>
          </div>
        )}

        <Button
          onClick={handleSubmitVacation}
          disabled={
            !vacStart ||
            !vacEnd ||
            vacStart > vacEnd ||
            vacClosedDates.length > 0 ||
            vacOccupiedDates.length > 0 ||
            isCheckingVac ||
            isSubmittingVac
          }
          className="w-full bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl py-6 font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-100"
        >
          {isSubmittingVac ? (
            'Enviando...'
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Solicitar vacaciones
            </>
          )}
        </Button>
      </div>

      {/* 3. Mis solicitudes */}
      <div
        id="mis-solicitudes"
        className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-black text-slate-900 uppercase text-sm">Mis solicitudes</h3>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {requests.length} total
          </span>
        </div>

        {requests.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">
            Aún no tienes solicitudes de días libres ni vacaciones registradas.
          </p>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => {
              const isVac = req.type === 'vacation';
              return (
                <div
                  key={req.id}
                  className="flex items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-slate-900">
                        {isVac ? 'Vacaciones' : 'Día libre'}
                      </span>
                      {statusBadge(req.status)}
                    </div>
                    <p className="text-xs text-slate-600 font-medium">
                      {req.start_date === req.end_date
                        ? formatShortDate(req.start_date)
                        : `${formatShortDate(req.start_date)} al ${formatShortDate(req.end_date)}`}
                    </p>
                  </div>

                  {req.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(req.id)}
                      disabled={isPendingDelete}
                      className="text-slate-400 hover:text-red-500 shrink-0"
                      title="Cancelar solicitud pendiente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
