'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { bulkImportPersonnel } from '../actions';

export default function PersonnelImportPage() {
  const [csvData, setCsvData] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const handleImport = async () => {
    if (!csvData.trim()) return;
    
    setIsLoading(true);
    
    // Detect delimiter: Tabs (Excel) take priority, then semicolon/comma
    const delimiter = csvData.includes('\t') ? '\t' : (csvData.includes(';') ? ';' : ',');
    
    // Split by any newline character and remove empty lines
    const lines = csvData.trim().split(/\r?\n/).filter(line => line.trim() !== '');
    const rawHeaders = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
    
    // Header Mapping Aliases
    const headerMap: Record<string, string> = {
      'empresa': 'empresa',
      'nombre': 'nombre',
      'apellido_paterno': 'apellido_paterno',
      'apellido_materno': 'apellido_materno',
      'rut': 'rut',
      'email': 'email',
      'fecha_nacimiento': 'fecha_nacimiento',
      'telefono': 'telefono',
      'cargo_principal': 'cargo_principal'
    };

    const headers = rawHeaders.map(h => headerMap[h] || h);

    const data = lines.slice(1).map((line, lineIdx) => {
      const values = line.split(delimiter).map(v => v.trim());
      const obj: any = {};
      headers.forEach((header, i) => {
        if (header) obj[header] = values[i];
      });
      return obj;
    });

    const result = await bulkImportPersonnel(data);
    setIsLoading(false);

    if (result.error) {
      toast.error('Error en la importación', { description: result.error });
    } else {
      toast.success(`Importación finalizada: ${result.imported} registros creados`);
      router.push('/personnel');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-orange-600" />
          Importar Personal (Masivo)
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pega los datos de tu Excel siguiendo el formato de columnas indicado
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 border-slate-200/60 dark:border-slate-800 shadow-sm h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Instrucciones</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-3 text-muted-foreground">
            <p>1. Prepara tu Excel con las siguientes columnas (exactamente en este orden o con estos nombres):</p>
            <ul className="list-disc list-inside space-y-1 font-mono text-[10px] bg-slate-50 p-2 rounded border border-slate-100">
              <li>empresa</li>
              <li>nombre</li>
              <li>apellido_paterno</li>
              <li>apellido_materno</li>
              <li>rut</li>
              <li>email</li>
              <li>fecha_nacimiento</li>
              <li>telefono</li>
              <li>cargo_principal</li>
            </ul>
            <p>2. Copia las celdas de tu Excel (incluyendo los títulos).</p>
            <p>3. Pégalas en el cuadro de texto a la derecha.</p>
            <div className="flex items-center gap-2 text-amber-600 font-medium">
              <AlertCircle className="h-4 w-4" />
              <span>Asegúrate de que la empresa y el cargo existan previamente.</span>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 border-slate-200/60 dark:border-slate-800 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">Pegar Datos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea 
              placeholder="Pega aquí (ej: empresa;nombre;apellido_paterno...)"
              className="min-h-[300px] font-mono text-xs whitespace-pre overflow-auto"
              value={csvData}
              onChange={(e) => setCsvData(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
              <Button 
                onClick={handleImport} 
                className="bg-orange-600 hover:bg-orange-700 text-white"
                disabled={isLoading || !csvData.trim()}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                Iniciar Importación
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
