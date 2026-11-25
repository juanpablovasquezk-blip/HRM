import React from 'react';
import Link from 'next/link';
import {
  getWorkerTomorrowData,
  getWorkerSession,
  getWorkerPortalRequests,
  getWorkerSizeRequirements,
  getWorkerPendingDocuments,
} from '../actions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Clock, 
  MapPin, 
  Briefcase, 
  Bus, 
  Car, 
  AlertCircle,
  CalendarDays,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import FreeRequestClient from './free-request-client';
import { PendingDocsCard } from './pending-docs-card';

export default async function WorkerHomePage() {
  const session = await getWorkerSession();
  if (!session) redirect('/worker/login');

  const data = await getWorkerTomorrowData();
  if (!data) return null;

  const tomorrowFormatted = format(parseISO(data.date), "EEEE d 'de' MMMM", { locale: es });

  const [{ data: portalRequests }, sizeRequirements, pendingDocsRes] = await Promise.all([
    getWorkerPortalRequests(session.id),
    getWorkerSizeRequirements(),
    getWorkerPendingDocuments(),
  ]);

  return (
    <div className="p-6 space-y-6 max-w-lg mx-auto pb-24">
      {/* Welcome Header */}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-slate-900 leading-tight">Hola, {session.first_name} 👋</h2>
          <p className="text-slate-500 font-medium">Esta es tu información para mañana</p>
          <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mt-1">
            <CalendarDays className="h-3 w-3" />
            {tomorrowFormatted}
          </div>
        </div>

        {/* Missing EPP / Uniform Sizes Banner */}
        {sizeRequirements.hasMissingSizes && (
          <Link
            href="/worker/profile#clothing"
            className="block rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm hover:bg-amber-100/70 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl bg-amber-100 p-2 text-amber-700">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-amber-950">
                    Tallas de uniforme / EPP pendientes
                  </p>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Completa tus tallas requeridas ({sizeRequirements.missingFields.map(f => f.productName).join(', ')}).
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-700 pt-0.5">
                    Ir a Tallas EPP <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Documentos pendientes */}
        <PendingDocsCard items={pendingDocsRes.items} />
      </div>

      {/* Main Content */}
      {data.assignments.length === 0 ? (
        session.requires_shifts === false ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-100 shadow-sm flex flex-col items-center gap-4">
            <div className="h-16 w-16 bg-orange-50 rounded-2xl flex items-center justify-center">
              <Briefcase className="h-8 w-8 text-orange-500" />
            </div>
            <div className="space-y-1">
              <h3 className="font-black text-lg text-slate-900 uppercase tracking-tight">Registro Administrativo</h3>
              <p className="text-slate-500 text-xs font-medium">Tu cargo no requiere rotación ni asignación de turnos operativos.</p>
            </div>
            <div className="pt-2 flex flex-col w-full gap-2">
              <Link href="/worker/profile" className="text-xs font-bold text-orange-600 bg-orange-50 py-2.5 px-4 rounded-xl hover:bg-orange-100 transition-colors">
                Ver Mi Ficha Personal
              </Link>
              <Link href="/worker/documents" className="text-xs font-bold text-slate-600 bg-slate-50 py-2.5 px-4 rounded-xl hover:bg-slate-100 transition-colors">
                Mis Documentos
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-slate-100 flex flex-col items-center gap-4">
            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center">
              <Clock className="h-8 w-8 text-slate-300" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-xl text-slate-400 uppercase">Turno Libre</h3>
              <p className="text-slate-400 text-sm">Disfruta tu día de descanso</p>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {data.assignments.map((asg) => (
            <Card key={asg.id} className={`overflow-hidden border-none shadow-xl shadow-slate-200/50 rounded-3xl ${asg.is_extra ? 'ring-2 ring-orange-500 ring-offset-2' : ''}`}>
              <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-400" />
                  <span className="text-sm font-bold uppercase tracking-wider">
                    Turno de Mañana ({format(parseISO(data.date), 'dd-MM-yyyy')})
                  </span>
                </div>
                {asg.is_extra && (
                  <Badge className="bg-orange-500 hover:bg-orange-500 text-white border-none text-[10px] font-black px-2 py-0.5 uppercase">Extra</Badge>
                )}
              </div>
              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Ingreso</p>
                    <p className="text-2xl font-black text-slate-900 leading-none">{asg.shift?.start_time.substring(0,5)}</p>
                  </div>
                  <div className="space-y-1 border-l border-slate-100 pl-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Salida</p>
                    <p className="text-2xl font-black text-slate-900 leading-none">{asg.shift?.end_time.substring(0,5)}</p>
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                      <MapPin className="h-4 w-4 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Destino / Área</p>
                      <p className="font-bold text-slate-700">{asg.area?.name}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                      <Briefcase className="h-4 w-4 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Puesto Asignado</p>
                      <p className="font-bold text-slate-700">{asg.position?.name}</p>
                    </div>
                  </div>
                </div>

                {/* Transport Info */}
                {data.transport.map((tr) => (
                  <div key={tr.id} className="mt-4 pt-6 border-t border-slate-100">
                    {(tr.transport_type === 'PROPIO' || tr.transport_type === 'Propio') ? (
                      <div className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl flex items-center gap-3 border border-emerald-100">
                        <Car className="h-5 w-5" />
                        <span className="text-xs font-black uppercase">Transporte Propio</span>
                      </div>
                    ) : (tr.transport_type === 'EMPRESA' || tr.transport_type === 'REQUERIDO' || tr.transport_type === 'Empresa') ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-indigo-700">
                          <Bus className="h-5 w-5" />
                          <span className="text-xs font-black uppercase tracking-tight">Transporte Coordinado</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 shadow-inner">
                          <div>
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Recogida</p>
                            <p className="font-black text-indigo-900 text-lg">{tr.pickup_time?.substring(0,5) || '--:--'}</p>
                          </div>
                          <div className="border-l border-indigo-100 pl-4">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Reserva N°</p>
                            <p className="font-black text-indigo-900 text-lg">{tr.reservation_number || 'PENDIENTE'}</p>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Dirección de Recogida</p>
                          <p className="text-sm font-bold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100 italic">
                            {tr.pickup_address || 
                             (typeof session.address === 'string' ? session.address : (session.address?.street || 'No registrada'))}
                          </p>
                        </div>

                        {/* Help Message for Transvip */}
                        <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-2 shadow-lg">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] font-medium leading-relaxed">
                              Cualquier consulta referente al transporte llamar al <span className="font-black text-orange-400">(2) 2677 3000</span> (reservas Transvip).
                            </p>
                          </div>
                          <div className="h-px bg-white/10 w-full" />
                          <p className="text-[10px] font-black text-white/50 uppercase tracking-tight">
                            En caso que no lo pasen a buscar, llamar a las 04:00 al supervisor de turno.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-50 text-amber-700 p-4 rounded-2xl flex items-center gap-3 border border-amber-100">
                        <AlertCircle className="h-5 w-5" />
                        <span className="text-xs font-bold uppercase italic">Transporte por confirmar</span>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Free Days, Vacations & My Requests */}
      <FreeRequestClient
        personnelId={session.id}
        initialRequests={portalRequests || []}
        referenceNowIso={new Date().toISOString()}
        rotationPattern={session.rotation_pattern || null}
        ns22AnchorDate={session.ns22_anchor_date || null}
        requiresShifts={session.requires_shifts ?? true}
        birthDate={session.birth_date || null}
      />

      {/* Quick Help Footer */}
      <div className="bg-slate-900/5 p-4 rounded-2xl border border-slate-200/50">
        <p className="text-[10px] text-slate-500 font-medium text-center italic">
          Si tienes dudas sobre tu turno, contacta a tu supervisor directo.
        </p>
      </div>
    </div>
  );
}
