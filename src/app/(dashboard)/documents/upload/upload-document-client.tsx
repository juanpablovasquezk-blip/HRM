'use client';

import { Suspense, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { uploadDocument } from '@/app/(dashboard)/documents/actions';

const DOCUMENT_TYPES = [
  'Cédula de Identidad',
  'Antecedentes para fines especiales',
  'Tica',
  'PCP',
  'Licencia de Conducir',
  'Hoja de vida del conductor'
];

interface Personnel {
  id: string;
  first_name: string;
  last_name_father: string;
  last_name_mother: string;
}

function DocumentUploadForm({ personnelList }: { personnelList: Personnel[] }) {
  const [isPending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const personnelId = searchParams.get('personnel_id') || '';

  const handleSubmit = async (formData: FormData) => {
    if (!selectedFile) {
      toast.error('Por favor selecciona un archivo');
      return;
    }
    formData.set('file', selectedFile);

    startTransition(async () => {
      const result = await uploadDocument(formData);
      if (result.error) {
        toast.error('Error al subir', { description: result.error });
      } else {
        toast.success('Documento subido correctamente');
        const selectedId = formData.get('personnel_id');
        if (selectedId) {
          router.push(`/personnel/${selectedId}`);
        } else {
          router.push('/documents');
        }
      }
    });
  };

  return (
    <form action={handleSubmit} className="space-y-6">
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Detalles del Documento</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="personnel_id">Trabajador *</Label>
            <select
              id="personnel_id"
              name="personnel_id"
              defaultValue={personnelId}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Seleccione un trabajador</option>
              {personnelList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name_father} {p.last_name_mother}
                </option>
              ))}
            </select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="type">Tipo de Documento *</Label>
            <select
              id="type"
              name="type"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Seleccione tipo</option>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="number">Número de Documento</Label>
            <Input
              id="number"
              name="number"
              placeholder="Opcional"
            />
          </div>
          
          {/* Expiration Logic conditionally rendered */}
          {['Cédula de Identidad', 'Tica', 'PCP', 'Licencia de Conducir'].includes(docType) && (
            <div className="space-y-2">
              <Label htmlFor="explicit_expiration_date">Fecha de Vencimiento *</Label>
              <Input id="explicit_expiration_date" name="explicit_expiration_date" type="date" required />
            </div>
          )}

          {['Antecedentes para fines especiales', 'Hoja de vida del conductor'].includes(docType) && (
            <div className="space-y-2">
              <Label htmlFor="issue_date">Fecha de Emisión *</Label>
              <Input id="issue_date" name="issue_date" type="date" required />
            </div>
          )}

          {docType === 'Antecedentes para fines especiales' && (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="tica_date">
                Fecha de Vencimiento de TICA (Opcional){' '}
                <span className="text-xs text-muted-foreground">
                  (Si ingresa TICA, el certificado vencerá 25 días antes. Si no, a los 180 días de emisión)
                </span>
              </Label>
              <Input id="tica_date" name="tica_date" type="date" />
            </div>
          )}

          {docType === 'Hoja de vida del conductor' && (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="pcp_date">
                Fecha de Vencimiento de PCP (Opcional){' '}
                <span className="text-xs text-muted-foreground">
                  (Mismo patrón que antecedentes, asociado al vencimiento del PCP)
                </span>
              </Label>
              <Input id="pcp_date" name="pcp_date" type="date" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Subir Archivo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              {selectedFile
                ? selectedFile.name
                : 'Arrastra y suelta o haz clic para seleccionar'}
            </p>
            <Input
              type="file"
              id="file-upload"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              className="max-w-xs mx-auto"
              onChange={(e) =>
                setSelectedFile(e.target.files?.[0] || null)
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={isPending || !selectedFile}
          className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/25"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Subir Documento
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// Separate generic component so it doesn't fail 'use client' compilation
export function UploadDocumentClient({ personnelList }: { personnelList: Personnel[] }) {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subir Documento</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Sube un documento de cumplimiento con seguimiento de expiración
        </p>
      </div>

      <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
        <DocumentUploadForm personnelList={personnelList} />
      </Suspense>
    </div>
  );
}
