'use client';

import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, AlertTriangle, X, Clock, MapPin, Briefcase, CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { resolveRosterAssignmentDisplay } from '@/app/(dashboard)/reports/individual-roster/roster-display-utils';

interface RosterClientProps {
  data: any;
  selectedMonth: string;
}

function formatShiftRange(shift: any): { short: string; full: string; crossesMidnight: boolean } | null {
  if (!shift?.start_time || !shift?.end_time) return null;
  const start = String(shift.start_time).slice(0, 5);
  const end = String(shift.end_time).slice(0, 5);
  const crossesMidnight = end <= start;
  return {
    short: `${start}–${end}`,
    full: crossesMidnight ? `${start}–${end} (termina al día siguiente)` : `${start}–${end}`,
    crossesMidnight,
  };
}

function formatLeaveLabel(leave: any): string {
  if (!leave) return '';
  if (leave.type === 'vacation') return 'Vacaciones aprobadas';
  if (leave.type === 'sick') return 'Licencia médica aprobada';
  if (leave.type === 'free_request' || leave.reason === 'Solicitud mensual de días libres') {
    return 'Día libre solicitado aprobado';
  }
  return 'Permiso / ausencia aprobada';
}

export default function RosterClient({ data, selectedMonth }: RosterClientProps) {
  const router = useRouter();
  const currentMonthDate = parseISO(selectedMonth + '-01');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonthDate),
    end: endOfMonth(currentMonthDate),
  });

  const handlePrevMonth = () => {
    const d = new Date(currentMonthDate);
    d.setMonth(d.getMonth() - 1);
    setSelectedDay(null);
    router.push(`/worker/roster?month=${format(d, 'yyyy-MM')}`);
  };

  const handleNextMonth = () => {
    const d = new Date(currentMonthDate);
    d.setMonth(d.getMonth() + 1);
    setSelectedDay(null);
    router.push(`/worker/roster?month=${format(d, 'yyyy-MM')}`);
  };

  const getDayAssignment = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    if (!data?.assignments) return null;
    return data.assignments.find((a: any) => a.date === dateStr) || null;
  };

  const getDayLeave = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    if (!data?.leaves) return null;
    return (
      data.leaves.find((l: any) => {
        const start = l.start_date;
        const end = l.end_date || l.start_date;
        return dateStr >= start && dateStr <= end;
      }) || null
    );
  };

  const getDayMeta = (day: Date) => {
    const assignment = getDayAssignment(day);
    const leave = getDayLeave(day);
    const isFreeRequest =
      Boolean(leave) &&
      (leave.type === 'free_request' || leave.reason === 'Solicitud mensual de días libres');

    const isBirthday =
      Boolean(data?.personnel?.birth_date) &&
      format(day, 'MM-dd') === format(parseISO(data.personnel.birth_date), 'MM-dd');

    const actualShiftName = assignment?.shift?.name || 'L';
    const isDifferent = Boolean(
      assignment && assignment.original_shift_id && assignment.shift_id !== assignment.original_shift_id
    );
    const isToday = isSameDay(day, new Date());
    const display = resolveRosterAssignmentDisplay({
      assignment,
      leave: isFreeRequest ? null : leave,
      isSundayOrHoliday: day.getDay() === 0,
    });
    const hours = formatShiftRange(assignment?.shift);

    return {
      assignment,
      leave,
      isFreeRequest,
      isBirthday,
      actualShiftName,
      isDifferent,
      isToday,
      display,
      hours,
    };
  };

  const selectedMeta = selectedDay ? getDayMeta(selectedDay) : null;

  return (
    <div className="p-3 sm:p-4 space-y-5 max-w-lg mx-auto pb-24">
      {/* Calendar Header */}
      <div className="flex items-center justify-between bg-white p-3.5 sm:p-4 rounded-3xl shadow-sm border border-slate-100">
        <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="rounded-xl" aria-label="Mes anterior">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="font-black text-base sm:text-lg uppercase tracking-tight text-slate-900">
          {format(currentMonthDate, 'MMMM yyyy', { locale: es })}
        </h2>
        <Button variant="ghost" size="icon" onClick={handleNextMonth} className="rounded-xl" aria-label="Mes siguiente">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Detailed Weekly List */}
      <div className="space-y-5">
        {(() => {
          const weeks: Date[][] = [];
          let currentWeek: Date[] = [];

          days.forEach((day, i) => {
            currentWeek.push(day);
            if (day.getDay() === 0 || i === days.length - 1) {
              weeks.push(currentWeek);
              currentWeek = [];
            }
          });

          return weeks.map((week, weekIdx) => (
            <div
              key={weekIdx}
              className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden"
            >
              <table className="w-full table-fixed text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="w-[12%] px-1 py-2.5 sm:p-3 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-center border-r border-slate-800">
                      Día
                    </th>
                    <th className="w-[17%] px-1.5 py-2.5 sm:p-3 text-[9px] sm:text-[10px] font-black uppercase tracking-wider border-r border-slate-800">
                      Fecha
                    </th>
                    <th className="w-[21%] px-1.5 py-2.5 sm:p-3 text-[9px] sm:text-[10px] font-black uppercase tracking-wider border-r border-slate-800">
                      Turno
                    </th>
                    <th className="w-[28%] px-1.5 py-2.5 sm:p-3 text-[9px] sm:text-[10px] font-black uppercase tracking-wider border-r border-slate-800">
                      Asignación
                    </th>
                    <th className="w-[22%] px-1 py-2.5 sm:p-3 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-center">
                      Horas
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {week.map((day) => {
                    const {
                      assignment,
                      leave,
                      isFreeRequest,
                      isBirthday,
                      actualShiftName,
                      isDifferent,
                      isToday,
                      display,
                      hours,
                    } = getDayMeta(day);

                    const showBirthdayLabel = isBirthday && actualShiftName === 'L' && !leave;
                    const assignmentText = showBirthdayLabel
                      ? 'CUMPLEAÑOS'
                      : isFreeRequest
                      ? 'LIBRE'
                      : display.label;

                    return (
                      <tr
                        key={day.toISOString()}
                        onClick={() => setSelectedDay(day)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedDay(day);
                          }
                        }}
                        className={cn(
                          'cursor-pointer hover:bg-slate-50/80 active:bg-slate-100/80 transition-colors',
                          isToday && 'bg-orange-50/40',
                          isFreeRequest
                            ? 'bg-emerald-50/60 border-l-4 border-l-emerald-500'
                            : isDifferent
                            ? 'bg-orange-50/20 border-l-4 border-l-orange-500'
                            : 'border-l-4 border-l-transparent'
                        )}
                      >
                        <td className="px-1 py-2.5 sm:p-3 text-center border-r border-slate-50">
                          <span
                            className={cn(
                              'text-[9px] sm:text-[10px] font-black uppercase',
                              isToday ? 'text-orange-600' : 'text-slate-400'
                            )}
                          >
                            {format(day, 'EEE', { locale: es }).replace('.', '')}
                          </span>
                        </td>
                        <td className="px-1.5 py-2.5 sm:p-3 border-r border-slate-50 whitespace-nowrap">
                          <span
                            className={cn(
                              'text-[10px] sm:text-[11px] font-bold',
                              isToday ? 'text-orange-700' : 'text-slate-700'
                            )}
                          >
                            <span className="sm:hidden">{format(day, 'dd-MM')}</span>
                            <span className="hidden sm:inline">{format(day, 'dd-MM-yyyy')}</span>
                          </span>
                        </td>
                        <td className="px-1.5 py-2.5 sm:p-3 border-r border-slate-50">
                          <div className="flex items-center gap-1 min-w-0">
                            <Badge
                              className={cn(
                                isFreeRequest
                                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-100'
                                  : showBirthdayLabel
                                  ? 'bg-pink-500 text-white shadow-sm shadow-pink-100'
                                  : actualShiftName === 'L'
                                  ? 'bg-slate-100 text-slate-400'
                                  : isDifferent
                                  ? 'bg-orange-500 text-white ring-2 ring-orange-200 ring-offset-1'
                                  : 'bg-slate-900 text-white',
                                'border-none text-[9px] font-black px-1.5 py-0.5 shadow-sm whitespace-nowrap'
                              )}
                            >
                              {isFreeRequest ? 'LIBRE' : showBirthdayLabel ? 'CUMPLE' : actualShiftName}
                            </Badge>
                            {isDifferent && (
                              <AlertTriangle
                                aria-label="Cambio de turno"
                                className="h-3.5 w-3.5 text-orange-600 shrink-0 animate-pulse"
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-1.5 py-2.5 sm:p-3 border-r border-slate-50">
                          {showBirthdayLabel ? (
                            <span className="inline-block rounded-md px-1.5 py-0.5 text-[9px] sm:text-[10px] font-black uppercase bg-pink-50 text-pink-700 leading-tight">
                              CUMPLEAÑOS
                            </span>
                          ) : assignment && !leave ? (
                            <span
                              style={{
                                backgroundColor: display.style.backgroundColor,
                                color: display.style.color,
                              }}
                              className="inline-block rounded-md px-1.5 py-0.5 text-[9px] sm:text-[10px] font-black uppercase leading-tight max-w-full whitespace-normal break-words text-center align-middle"
                            >
                              {assignmentText}
                            </span>
                          ) : (
                            <span
                              className={cn(
                                'text-[9px] sm:text-[10px] font-bold uppercase leading-tight',
                                isFreeRequest ? 'text-emerald-700' : leave ? 'text-slate-700' : 'text-slate-400'
                              )}
                            >
                              {assignmentText}
                            </span>
                          )}
                        </td>
                        <td className="px-1 py-2.5 sm:p-3 text-center whitespace-nowrap">
                          {hours ? (
                            <span className="text-[9px] sm:text-[10px] font-black text-slate-900">
                              {hours.short}
                              {hours.crossesMidnight && (
                                <span className="text-orange-600 ml-0.5">+1</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ));
        })()}
      </div>

      {/* Legend */}
      <div className="bg-white p-5 rounded-3xl border border-slate-100 space-y-4 shadow-sm">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-50 pb-2">
          Leyenda
        </h3>
        <div className="grid grid-cols-2 gap-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-slate-900 flex items-center justify-center text-[10px] font-black text-white shrink-0">
              AM
            </div>
            <span className="text-xs font-bold text-slate-600">Turno Normal</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-orange-500 flex items-center justify-center text-[10px] font-black text-white shrink-0">
              PM
            </div>
            <span className="text-xs font-bold text-orange-600 italic">Cambio de Turno</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center text-[8px] font-black text-white shrink-0">
              LIBRE
            </div>
            <span className="text-xs font-bold text-slate-600">Día Solicitado</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 shrink-0">
              L
            </div>
            <span className="text-xs font-bold text-slate-600">Día Libre Roster</span>
          </div>
        </div>
      </div>

      {/* Bottom Detail Sheet */}
      {selectedDay && selectedMeta && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-[1px]"
            onClick={() => setSelectedDay(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Detalle del día"
            className="fixed bottom-0 left-0 right-0 z-[60] max-w-lg mx-auto bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 p-5 pb-8 space-y-4"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Detalle del día
                </p>
                <h3 className="text-base font-black text-slate-900 capitalize">
                  {format(selectedDay, "EEEE d 'de' MMMM yyyy", { locale: es })}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                aria-label="Cerrar detalle"
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {selectedMeta.leave ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black uppercase',
                      selectedMeta.isFreeRequest
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 text-slate-800'
                    )}
                  >
                    <CalendarCheck className="h-4 w-4" />
                    {selectedMeta.isFreeRequest ? 'LIBRE' : selectedMeta.display.label}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-700">
                  {formatLeaveLabel(selectedMeta.leave)}
                </p>
              </div>
            ) : !selectedMeta.assignment ? (
              <div className="space-y-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black uppercase',
                    selectedMeta.isBirthday
                      ? 'bg-pink-500 text-white'
                      : 'bg-slate-100 text-slate-600'
                  )}
                >
                  <CalendarCheck className="h-4 w-4" />
                  {selectedMeta.isBirthday ? 'LIBRE CUMPLEAÑOS' : 'DÍA LIBRE'}
                </span>
                <p className="text-sm text-slate-600">
                  {selectedMeta.isBirthday
                    ? 'Día libre por cumpleaños según tu programación.'
                    : 'Sin turno asignado para esta fecha.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {/* Summary pill line */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-xs font-bold text-slate-800">
                  {selectedMeta.display.label}
                  {selectedMeta.assignment.position?.name
                    ? ` · ${selectedMeta.assignment.position.name}`
                    : ''}
                  {` · ${selectedMeta.actualShiftName}`}
                  {selectedMeta.hours ? ` · ${selectedMeta.hours.short}` : ''}
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      Destino
                    </span>
                    <span
                      style={{
                        backgroundColor: selectedMeta.display.style.backgroundColor,
                        color: selectedMeta.display.style.color,
                      }}
                      className="rounded-lg px-2.5 py-1 text-xs font-black uppercase"
                    >
                      {selectedMeta.display.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                      <Briefcase className="h-4 w-4 text-slate-400" />
                      Función asignada
                    </span>
                    <span className="text-xs font-black text-slate-900">
                      {selectedMeta.assignment.position?.name || 'Sin función especificada'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-slate-400" />
                      Turno y horario
                    </span>
                    <span className="text-xs font-black text-slate-900 text-right">
                      {selectedMeta.actualShiftName}
                      {selectedMeta.hours ? ` · ${selectedMeta.hours.full}` : ''}
                    </span>
                  </div>
                </div>

                {selectedMeta.isDifferent && (
                  <div className="flex items-center gap-2 rounded-xl bg-orange-50 border border-orange-200 px-3 py-2 text-xs font-bold text-orange-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Este turno presenta un cambio respecto al turno original.</span>
                  </div>
                )}
              </div>
            )}

            <Button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="w-full rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold"
            >
              Cerrar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
