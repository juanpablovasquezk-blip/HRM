import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 print:p-0 print:bg-white text-slate-900 dark:text-slate-100 print:text-black">
      {/* Floating Controller Panel (hidden on print) */}
      <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm print:hidden">
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
      <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 print:bg-white border border-slate-200 dark:border-slate-800 print:border-none p-8 sm:p-12 print:p-0 rounded-3xl shadow-sm print:shadow-none space-y-8 font-sans">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-200 pb-6">
          <div className="space-y-1">
            <p className="text-xs font-bold text-orange-600 uppercase tracking-widest">Ficha de Personal</p>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">
              {person.first_name} {person.last_name_father} {person.last_name_mother}
            </h1>
            <p className="text-sm text-slate-500 font-medium">
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
        <div className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">1. Datos Personales</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Nombres</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.first_name}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Apellido Paterno</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.last_name_father}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Apellido Materno</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.last_name_mother || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">RUT</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.rut}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Fecha de Nacimiento</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {person.birth_date ? format(new Date(person.birth_date), 'dd/MM/yyyy') : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Género</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.gender || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Teléfono (WhatsApp)</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.phone || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Correo Electrónico</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs break-all">{person.email || '—'}</p>
            </div>
          </div>
        </div>

        {/* Section 2: Dirección Residencial */}
        <div className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">2. Dirección Residencial</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
            <div className="sm:col-span-2">
              <p className="text-slate-400 font-bold uppercase text-[10px]">Calle y Número</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{address.street || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Comuna</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{address.comuna || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Ciudad / Región</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {[address.city, address.region].filter(Boolean).join(', ') || '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Section 3: Previsión Social y Salud */}
        <div className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">3. Previsión Social</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">AFP</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.afp || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Sistema de Salud</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.health_system || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Isapre</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.isapre || '—'}</p>
            </div>
          </div>
        </div>

        {/* Section 4: Datos Bancarios */}
        <div className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">4. Información de Pago (Banco)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Banco</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.bank_name || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Tipo de Cuenta</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.bank_account_type || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Número de Cuenta</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.bank_account_number || '—'}</p>
            </div>
          </div>
        </div>

        {/* Section 5: Contacto de Emergencia */}
        <div className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">5. Contacto de Emergencia</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Nombre Completo</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.emergency_contact_name || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Parentesco / Vínculo</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.emergency_contact_relationship || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Teléfono de Emergencia</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{person.emergency_contact_phone || '—'}</p>
            </div>
          </div>
        </div>

        {/* Section 6: Uniforme corporativo (Tallas) */}
        <div className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">6. Tallas de Uniforme</h2>
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-4 text-xs">
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Polera</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{person.clothing_tshirt_size || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Polar</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{person.clothing_polar_size || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Pantalón (L)</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{person.clothing_pants_size_letter || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Pantalón (N)</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{person.clothing_pants_size_number || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Calzado</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{person.clothing_shoe_size || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Parka</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{person.clothing_parka_size || '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Jardinera</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{person.clothing_overall_size || '—'}</p>
            </div>
          </div>
        </div>

        {/* Section 7: Datos Organizacionales y Laborales */}
        <div className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">7. Asignación Laboral y Contrato</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="col-span-2">
              <p className="text-slate-400 font-bold uppercase text-[10px]">Cargo Principal</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {posMap[person.main_position] || person.main_position || '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Planificación (Rotación)</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                {person.rotation_pattern === '5x2' ? '5X2 ROTATIVO (SEMANAL)' : 
                 person.rotation_pattern === 'l-v' ? 'LUNES A VIERNES (FIJO)' :
                 person.rotation_pattern === '7x7' ? '7X7 CANES' : 
                 person.rotation_pattern === '4x4_noche' ? '4X4 NOCHE' : 
                 person.rotation_pattern || '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Turno Fijo</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {person.fixed_shift_id ? shiftMap[person.fixed_shift_id] : 'ROTATIVO / NINGUNO'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Fecha de Contratación</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {person.hire_date ? format(new Date(person.hire_date), 'dd/MM/yyyy') : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Licencias de Conducir</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 uppercase">
                {(person.driver_licenses as string[])?.length > 0
                  ? (person.driver_licenses as string[]).join(', ')
                  : 'NINGUNA'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 font-bold uppercase text-[10px]">Transporte Empresa</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 uppercase">
                {person.requires_transport ? 'SÍ (REQUIERE)' : 'NO (LO HACE POR SU CUENTA)'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer legal disclaimer */}
        <div className="pt-8 border-t border-slate-200 text-[9px] text-slate-400 leading-relaxed space-y-2">
          <p>
            Declaro bajo juramento que los datos expuestos en este documento corresponden íntegramente a la realidad y autorizo a la empresa al tratamiento de mis datos personales de acuerdo con las políticas internas y las normativas laborales vigentes en Chile.
          </p>
          <div className="grid grid-cols-2 pt-6 gap-8">
            <div className="text-center space-y-1">
              <div className="border-t border-slate-300 w-48 mx-auto mt-8"></div>
              <p className="font-bold text-slate-500">Firma del Trabajador</p>
              <p className="text-slate-400">RUT: {person.rut}</p>
            </div>
            <div className="text-center space-y-1">
              <div className="border-t border-slate-300 w-48 mx-auto mt-8"></div>
              <p className="font-bold text-slate-500">Representante de la Empresa</p>
              <p className="text-slate-400">Grupo Minerquim</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
