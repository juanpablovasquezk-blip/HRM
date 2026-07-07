'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Download, FileSpreadsheet, Loader2, AlertCircle, Check,
  ChevronsUpDown, Users, X, ShieldCheck, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  getGeoVictoriaPermisosData,
  getPersonnelForFilter,
  markPermisosAsDownloaded,
  type PersonnelFilterItem,
} from './actions';

export default function GeoVictoriaPermisosClient() {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [onlyNew, setOnlyNew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [personnelList, setPersonnelList] = useState<PersonnelFilterItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPersonnelOpen, setIsPersonnelOpen] = useState(false);

  useEffect(() => {
    getPersonnelForFilter().then(({ data }) => setPersonnelList(data));
  }, []);

  const handleDownload = async () => {
    setIsLoading(true);
    try {
      const { data, leaveIds, assignmentIds } = await getGeoVictoriaPermisosData({
        startDate,
        endDate,
        onlyNew,
        personnelIds: selectedIds.length > 0 ? selectedIds : undefined,
      });

      if (!data || data.length === 0) {
        toast.info('No se encontraron permisos para el período seleccionado.');
        return;
      }

      // Build Excel with exact column headers expected by GeoVictoria
      const ws = XLSX.utils.json_to_sheet(data, {
        header: ['RUT', 'ID Tipo Permiso', 'Dia', 'Mes', 'Año', 'Extension', 'Comentario', 'Hora Inicio', 'Hora Fin', 'Asignacion'],
      });

      // Rename headers to match GeoVictoria specification exactly
      const headerRow = {
        A1: 'RUT',
        B1: 'ID Tipo Permiso',
        C1: 'Día',
        D1: 'Mes',
        E1: 'Año',
        F1: 'Extensión',
        G1: 'Comentario',
        H1: 'Hora Inicio',
        I1: 'Hora Fin',
        J1: 'Asignación',
      };
      Object.entries(headerRow).forEach(([cell, value]) => {
        if (ws[cell]) ws[cell].v = value;
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Permisos');

      const modeLabel = onlyNew ? '_nuevos' : '_todo';
      const fileName = `GeoVictoria_Permisos_${startDate}_to_${endDate}${modeLabel}.xlsx`;
      XLSX.writeFile(wb, fileName);

      // Mark records as downloaded AFTER successful file generation
      const markResult = await markPermisosAsDownloaded(leaveIds, assignmentIds);
      if (!markResult.success) {
        toast.warning('Archivo descargado pero no se pudo marcar como descargado en la base de datos.', {
          description: markResult.error,
        });
      } else {
        toast.success(`Reporte generado: ${data.length} permiso(s) exportado(s).`, {
          description: onlyNew
            ? 'Los registros fueron marcados como descargados.'
            : 'Descarga completa (TODO).',
        });
      }
    } catch (err: any) {
      toast.error('Error al generar reporte', { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Card className="border-slate-200/60 shadow-sm overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />

        <CardHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <CardTitle className="text-xl font-black uppercase tracking-tight">
              Reporte de Permisos GeoVictoria
            </CardTitle>
          </div>
          <CardDescription>
            Exporta vacaciones, licencias médicas y permisos con goce de sueldo en formato compatible con GeoVictoria.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {/* Date range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="perm-start-date" className="text-xs font-bold uppercase text-slate-500">
                Fecha Inicio
              </Label>
              <Input
                id="perm-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="font-bold"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="perm-end-date" className="text-xs font-bold uppercase text-slate-500">
                Fecha Fin
              </Label>
              <Input
                id="perm-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="font-bold"
              />
            </div>
          </div>

          {/* Personnel filter */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-slate-500">
              Filtrar por Personal (Opcional)
            </Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedIds.length > 0 ? (
                selectedIds.map(id => {
                  const person = personnelList.find(p => p.id === id);
                  return (
                    <Badge
                      key={id}
                      variant="secondary"
                      className="bg-emerald-50 text-emerald-700 border-emerald-100 flex items-center gap-1 py-1"
                    >
                      {person?.first_name} {person?.last_name_father}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-emerald-900"
                        onClick={() => setSelectedIds(prev => prev.filter(i => i !== id))}
                      />
                    </Badge>
                  );
                })
              ) : (
                <span className="text-xs text-slate-400 italic">Todos los trabajadores incluidos</span>
              )}
            </div>

            <Popover open={isPersonnelOpen} onOpenChange={setIsPersonnelOpen}>
              <PopoverTrigger
                aria-expanded={isPersonnelOpen}
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  'w-full justify-between h-10 border-slate-200 bg-white font-normal',
                )}
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium">
                    {selectedIds.length === 0
                      ? 'Seleccionar personas...'
                      : `${selectedIds.length} seleccionados`}
                  </span>
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command className="border-none">
                  <CommandInput placeholder="Buscar por nombre..." />
                  <CommandList>
                    <CommandEmpty>No se encontraron resultados.</CommandEmpty>
                    <CommandGroup className="max-h-[300px] overflow-auto">
                      {personnelList.map((person) => (
                        <CommandItem
                          key={person.id}
                          onSelect={() => {
                            setSelectedIds(prev =>
                              prev.includes(person.id)
                                ? prev.filter(id => id !== person.id)
                                : [...prev, person.id],
                            );
                          }}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <div className={cn(
                            'flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                            selectedIds.includes(person.id)
                              ? 'bg-primary text-primary-foreground'
                              : 'opacity-50 [&_svg]:invisible',
                          )}>
                            <Check className={cn('h-3 w-3')} />
                          </div>
                          <span className="flex-1">{person.first_name} {person.last_name_father}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
                {selectedIds.length > 0 && (
                  <div className="p-2 border-t border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedIds([])}
                      className="text-xs h-7"
                    >
                      Limpiar selección
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setIsPersonnelOpen(false)}
                      className="text-xs h-7 bg-slate-800"
                    >
                      Cerrar
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* TODO / SOLO CAMBIOS toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-bold text-slate-800">Solo Cambios (No Descargados)</Label>
                {onlyNew && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] font-bold px-1.5">
                    <Sparkles className="h-2.5 w-2.5 mr-1" />
                    ACTIVO
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {onlyNew
                  ? 'Solo se exportarán permisos que aún no han sido descargados para GeoVictoria.'
                  : 'Se exportarán todos los permisos del período, incluyendo los ya descargados.'}
              </p>
            </div>
            <Switch
              checked={onlyNew}
              onCheckedChange={setOnlyNew}
            />
          </div>

          {/* Tipo summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { code: '-1', label: 'Vacaciones', color: 'bg-blue-50 border-blue-100 text-blue-700' },
              { code: '-2', label: 'Licencia Médica', color: 'bg-orange-50 border-orange-100 text-orange-700' },
              { code: '-12', label: 'Goce de Sueldo', color: 'bg-purple-50 border-purple-100 text-purple-700' },
            ].map(item => (
              <div
                key={item.code}
                className={`rounded-lg border p-3 ${item.color} flex flex-col items-center text-center`}
              >
                <span className="text-lg font-black font-mono">{item.code}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider mt-0.5 opacity-75">
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          {/* Action button */}
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <Button
              id="download-permisos-btn"
              onClick={handleDownload}
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 h-12 shadow-lg shadow-emerald-200"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Descargar Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info panel */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3">
        <AlertCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-800 space-y-1">
          <p className="font-bold uppercase tracking-wider">Instrucciones de Uso</p>
          <ul className="list-disc list-inside space-y-1 opacity-80">
            <li>Solo se incluyen <strong>vacaciones</strong> y <strong>licencias médicas</strong> aprobadas.</li>
            <li>Los <strong>permisos con goce de sueldo (-12)</strong> corresponden a turnos eliminados manualmente en planificación diaria.</li>
            <li>La extensión cuenta todos los días del permiso, incluyendo sábados y domingos.</li>
            <li>Al descargar, los registros se marcan automáticamente como <strong>descargados</strong>.</li>
            <li>Usa <strong>SOLO CAMBIOS</strong> para exportar únicamente los permisos nuevos desde la última descarga.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
