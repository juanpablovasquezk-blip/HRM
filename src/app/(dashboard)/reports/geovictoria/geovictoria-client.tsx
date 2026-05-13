'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Download, FileSpreadsheet, Search, Loader2, AlertCircle, Check, ChevronsUpDown, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { getGeoVictoriaData, getPersonnelForFilter } from './actions';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

export default function GeoVictoriaClient() {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [onlyManual, setOnlyManual] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [personnelList, setPersonnelList] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPersonnelOpen, setIsPersonnelOpen] = useState(false);

  useEffect(() => {
    const fetchPersonnel = async () => {
      const { data } = await getPersonnelForFilter();
      setPersonnelList(data);
    };
    fetchPersonnel();
  }, []);

  const handleDownload = async () => {
    setIsLoading(true);
    try {
      const { data } = await getGeoVictoriaData({ 
        startDate, 
        endDate, 
        onlyManual,
        personnelIds: selectedIds.length > 0 ? selectedIds : undefined
      });

      if (!data || data.length === 0) {
        toast.info('No se encontraron registros para el período seleccionado');
        return;
      }

      // Generate Excel
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'GeoVictoria');

      // Export
      const fileName = `GeoVictoria_${startDate}_to_${endDate}${onlyManual ? '_cambios' : ''}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast.success('Reporte generado correctamente');
    } catch (err: any) {
      toast.error('Error al generar reporte', { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Card className="border-slate-200/60 shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-blue-600 to-indigo-600" />
        <CardHeader>
          <div className="flex items-center gap-3 mb-1">
             <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                <FileSpreadsheet className="h-5 w-5" />
             </div>
             <CardTitle className="text-xl font-black uppercase tracking-tight">Reporte GeoVictoria</CardTitle>
          </div>
          <CardDescription>
            Exporta la planificación de turnos en formato compatible con GeoVictoria para el control de asistencia.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="start-date" className="text-xs font-bold uppercase text-slate-500">Fecha Inicio</Label>
              <Input 
                id="start-date" 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="font-bold"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date" className="text-xs font-bold uppercase text-slate-500">Fecha Fin</Label>
              <Input 
                id="end-date" 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="font-bold"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-slate-500">Filtrar por Personal (Opcional)</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedIds.length > 0 ? (
                selectedIds.map(id => {
                  const person = personnelList.find(p => p.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 flex items-center gap-1 py-1">
                      {person?.first_name} {person?.last_name_father}
                      <X 
                        className="h-3 w-3 cursor-pointer hover:text-blue-900" 
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
                  buttonVariants({ variant: "outline" }),
                  "w-full justify-between h-10 border-slate-200 bg-white font-normal"
                )}
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium">
                    {selectedIds.length === 0 
                      ? "Seleccionar personas..." 
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
                                : [...prev, person.id]
                            );
                          }}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <div className={cn(
                            "flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            selectedIds.includes(person.id)
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50 [&_svg]:invisible"
                          )}>
                            <Check className={cn("h-3 w-3")} />
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

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="space-y-0.5">
              <Label className="text-sm font-bold text-slate-800">Solo Cambios de Turno</Label>
              <p className="text-xs text-slate-500">Exportar únicamente los turnos modificados manualmente.</p>
            </div>
            <Switch 
              checked={onlyManual}
              onCheckedChange={setOnlyManual}
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
             <Button 
               onClick={handleDownload} 
               disabled={isLoading}
               className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 h-12 shadow-lg shadow-indigo-200"
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

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
        <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800 space-y-1">
          <p className="font-bold uppercase tracking-wider">Instrucciones de Uso</p>
          <ul className="list-disc list-inside space-y-1 opacity-80">
            <li>El reporte solo incluye turnos de fechas que han sido <strong>publicadas</strong>.</li>
            <li>El DNI se exporta automáticamente limpio (sin puntos ni guión).</li>
            <li>Si un turno no tiene ID GeoV definido, aparecerá con el valor <strong>-1</strong>.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
