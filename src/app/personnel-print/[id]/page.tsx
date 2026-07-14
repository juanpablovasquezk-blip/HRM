import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { PrintTrigger } from './print-trigger';

export const dynamic = 'force-dynamic';

export default async function PersonnelPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: person, error }, 
    { data: allPositions }, 
    { data: allShifts }
  ] = await Promise.all([
    supabase.from('personnel').select('*, company:companies(name)').eq('id', id).single(),
    supabase.from('positions').select('id, name'),
    supabase.from('shifts').select('id, name')
  ]);

  if (error || !person) notFound();

  const posMap = Object.fromEntries((allPositions || []).map((p: any) => [p.id, p.name]));
  const shiftMap = Object.fromEntries((allShifts || []).map((s: any) => [s.id, s.name]));
  const address = (person.address as { street?: string; city?: string; region?: string; comuna?: string }) || {};

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 print:p-0 print:bg-white text-slate-900 dark:text-slate-100 print:text-black">
      {/* Dynamic Style Injection to force exactly 1 page in print */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4;
            margin: 0.6cm 0.6cm 0.6cm 0.6cm;
          }
          body {
            background-color: white !important;
            color: black !important;
            font-size: 10px !important;
            line-height: 1.15 !important;
            margin: 0 !important;
          }
          h1 {
            font-size: 1.4rem !important;
            margin-bottom: 2px !important;
          }
          h2 {
            font-size: 0.7rem !important;
            margin-bottom: 2px !important;
            padding-bottom: 1px !important;
            color: #475569 !important; /* text-slate-600 */
          }
          .grid {
            gap: 0.3rem !important;
          }
          .gap-4 {
            gap: 0.3rem !important;
          }
          p {
            margin: 0 !important;
          }
          .space-y-8 > * + * {
            margin-top: 0.5rem !important;
          }
          .pb-6 {
            padding-bottom: 0.35rem !important;
          }
          .pt-8 {
            padding-top: 0.4rem !important;
          }
          .pt-6 {
            padding-top: 0.25rem !important;
          }
          .mt-8 {
            margin-top: 1rem !important;
          }
        }
      `}} />

      {/* Floating Controller Panel (hidden on print) */}
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl shadow-sm print:hidden">
        <Link href={`/personnel/${id}`}>
          <Button variant="ghost" size="sm" className="rounded-xl gap-1">
            <ArrowLeft className="h-4 w-4" />
            Volver a la Ficha
          </Button>
        </Link>
        <div className="flex gap-2">
          <PrintTrigger />
        </div>
      </div>

      {/* Main Print Container (styled to look like a sheet) */}
      <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 print:bg-white border border-slate-200 dark:border-slate-800 print:border-none p-6 sm:p-8 print:p-0 rounded-2xl shadow-sm print:shadow-none space-y-4 font-sans text-xs">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-200 pb-3">
          <div className="space-y-0.5">
            <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Ficha Única de Personal</p>
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-slate-100 print:text-black">
              {person.first_name} {person.last_name_father} {person.last_name_mother}
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              RUT: {person.rut} · Empresa: {(person.company as { name: string } | null)?.name || '—'}
            </p>
          </div>
          <div className="text-right">
            <Badge className={person.is_active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-rose-100 text-rose-700 hover:bg-rose-100"}>
              {person.is_active ? "ACTIVO" : "INACTIVO"}
            </Badge>
          </div>
        </div>

        {/* Section 1: Identificación y Datos Personales */}
        <div className="space-y-1.5">
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-0.5">1. Datos Personales</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Nombres</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">{person.first_name}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Apellido Paterno</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">{person.last_name_father}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Apellido Materno</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">{person.last_name_mother || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">RUT</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">{person.rut}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Fecha Nacimiento</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">
                {person.birth_date ? format(new Date(person.birth_date), 'dd/MM/yyyy') : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Género</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">{person.gender || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Teléfono</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">{person.phone || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Correo Electrónico</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black text-xs break-all">{person.email || '—'}</p>
            </div>
          </div>
        </div>

        {/* Section 2: Dirección Residencial */}
        <div className="space-y-1.5">
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-0.5">2. Dirección Residencial</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="sm:col-span-2">
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Calle y Número</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">{address.street || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Comuna</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">{address.comuna || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Ciudad / Región</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">
                {[address.city, address.region].filter(Boolean).join(', ') || '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Previsión Social y Datos Bancarios (Side by side grid row to save vertical height) */}
        <div className="space-y-1.5">
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-0.5">3. Previsión Social y Pago de Remuneraciones</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">AFP</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">{person.afp || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Sistema Salud</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">{person.health_system || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Isapre</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">{person.isapre || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Banco</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">{person.bank_name || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Tipo Cuenta</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">{person.bank_account_type || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Nº Cuenta</p>
              <p className="font-semibold text-slate-850 dark:text-slate-200 print:text-black">{person.bank_account_number || '—'}</p>
            </div>
          </div>
        </div>

        {/* Section 4 & 5 side by side on desktop and print to save height */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:grid-cols-2 print:gap-6">
          {/* Section 4: Contacto de Emergencia */}
          <div className="space-y-1.5">
            <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-0.5">4. Contacto de Emergencia</h2>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Nombre</p>
                <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black">{person.emergency_contact_name || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Parentezco</p>
                <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black">{person.emergency_contact_relationship || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Teléfono</p>
                <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black">{person.emergency_contact_phone || '—'}</p>
              </div>
            </div>
          </div>

          {/* Section 5: Tallas de Uniforme */}
          <div className="space-y-1.5">
            <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-0.5">5. Tallas de Uniforme</h2>
            <div className="grid grid-cols-7 gap-2 text-xs">
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Polera</p>
                <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black">{person.clothing_tshirt_size || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Polar</p>
                <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black">{person.clothing_polar_size || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Pant. (L)</p>
                <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black">{person.clothing_pants_size_letter || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Pant. (N)</p>
                <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black">{person.clothing_pants_size_number || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Zapatos</p>
                <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black">{person.clothing_shoe_size || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Parka</p>
                <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black">{person.clothing_parka_size || '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Jardin.</p>
                <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black">{person.clothing_overall_size || '—'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 6: Datos Organizacionales y Laborales */}
        <div className="space-y-1.5">
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-0.5">6. Asignación Laboral y Contrato</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="col-span-2">
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Cargo Principal</p>
              <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black">
                {posMap[person.main_position] || person.main_position || '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Planificación (Rotación)</p>
              <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black text-[11px]">
                {person.rotation_pattern === '5x2' ? '5X2 ROTATIVO (SEMANAL)' : 
                 person.rotation_pattern === 'l-v' ? 'LUNES A VIERNES (FIJO)' :
                 person.rotation_pattern === '7x7' ? '7X7 CANES' : 
                 person.rotation_pattern === '4x4_noche' ? '4X4 NOCHE' : 
                 person.rotation_pattern || '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Turno Fijo</p>
              <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black">
                {person.fixed_shift_id ? shiftMap[person.fixed_shift_id] : 'ROTATIVO / NINGUNO'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Fecha Contratación</p>
              <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black">
                {person.hire_date ? format(new Date(person.hire_date), 'dd/MM/yyyy') : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Licencias de Conducir</p>
              <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black uppercase">
                {(person.driver_licenses as string[])?.length > 0
                  ? (person.driver_licenses as string[]).join(', ')
                  : 'NINGUNA'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[9px] print:text-[8px]">Transporte Empresa</p>
              <p className="font-semibold text-slate-855 dark:text-slate-200 print:text-black uppercase">
                {person.requires_transport ? 'SÍ (REQUIERE)' : 'NO (LO HACE POR SU CUENTA)'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer legal disclaimer & signatures */}
        <div className="pt-4 border-t border-slate-200 text-[8px] leading-relaxed space-y-3 text-slate-500 print:text-black">
          <p className="text-justify">
            Declaro bajo juramento que los datos expuestos en este documento corresponden íntegramente a la realidad y autorizo a la empresa al tratamiento de mis datos personales de acuerdo con las políticas internas y las normativas laborales vigentes en Chile.
          </p>
          <div className="grid grid-cols-2 pt-2 gap-8">
            <div className="text-center space-y-1">
              <div className="border-t border-slate-300 w-40 mx-auto mt-4"></div>
              <p className="font-bold text-slate-500 print:text-black">Firma del Trabajador</p>
              <p className="text-[8px] text-slate-450">RUT: {person.rut}</p>
            </div>
            <div className="text-center space-y-1">
              <div className="border-t border-slate-300 w-40 mx-auto mt-4"></div>
              <p className="font-bold text-slate-500 print:text-black">Representante de la Empresa</p>
              <p className="text-[8px] text-slate-450">Grupo Minerquim</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
