'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Download, FileSpreadsheet, Search, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { getGeoVictoriaData } from './actions';
import { format } from 'date-fns';

export default function GeoVictoriaClient() {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [onlyManual, setOnlyManual] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleDownload = async () => {
    setIsLoading(true);
    try {
      const { data } = await getGeoVictoriaData({ startDate, endDate, onlyManual });

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
