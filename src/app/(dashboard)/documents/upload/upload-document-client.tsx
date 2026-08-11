'use client';

import { Suspense, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Upload, Info } from 'lucide-react';
import { toast } from 'sonner';
import { uploadDocument } from '@/app/(dashboard)/documents/actions';
import { DocumentDefinition } from '@/types/database';
import { labelSelfie } from '@/lib/documents/selfie-labeler';
import { compileSingleCardPdf } from '@/lib/documents/pdf-compiler';

interface Personnel {
  id: string;
  first_name: string;
  last_name_father: string;
  last_name_mother: string;
  main_position: string | null;
  secondary_positions: string[];
  rut?: string;
}

interface Props {
  personnelList: Personnel[];
  documentDefinitions: DocumentDefinition[];
}

function DocumentUploadForm({ personnelList, documentDefinitions }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDefId, setSelectedDefId] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  // Initialize from URL so filtering works immediately when coming from a profile page
  const initialPersonnelId = searchParams.get('personnel_id') || '';
  const [selectedPersonnelId, setSelectedPersonnelId] = useState(initialPersonnelId);

  // ── Derive selected objects ───────────────────────────────────────────────
  const selectedPersonnel = personnelList.find(p => p.id === selectedPersonnelId);
  const selectedDef = documentDefinitions.find(d => d.id === selectedDefId);
  const parentDef = selectedDef?.depends_on_definition_id
    ? documentDefinitions.find(d => d.id === selectedDef!.depends_on_definition_id)
    : null;

  // ── Filter definitions by the selected worker's positions ─────────────────
  // A definition is applicable if:
  //   - it has no position restriction (applicable_positions is empty → applies to all), OR
  //   - the worker's main or secondary positions are in the list
  const applicableDefinitions = documentDefinitions.filter(def => {
    if (!def.is_active) return false;
    const hasRestriction = def.applicable_positions && def.applicable_positions.length > 0;
    if (!hasRestriction) return true; // applies to all

    if (!selectedPersonnel) return true; // no worker selected yet → show all active

    const workerPositions = [
      selectedPersonnel.main_position,
      ...(selectedPersonnel.secondary_positions || []),
    ].filter(Boolean) as string[];

    return def.applicable_positions.some(p => workerPositions.includes(p));
  });

  // ── Date field logic driven by definition metadata ────────────────────────
  // requires_expiration + no dependency → fixed expiration date
  // requires_expiration + has dependency  → date from parent document (anchor)
  // no requires_expiration                → issue date (engine calculates 180d)
  const needsExpirationDate = selectedDef?.requires_expiration && !selectedDef?.depends_on_definition_id;
  const needsAnchorDate = selectedDef?.requires_expiration && !!selectedDef?.depends_on_definition_id;
  const needsIssueDate = selectedDef && !selectedDef.requires_expiration;
  const isTicaOrPcp = selectedDef?.name.toLowerCase().includes('tica') || selectedDef?.name.toLowerCase().includes('pcp');

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const base64ToFile = (base64String: string, filename: string): File => {
    const arr = base64String.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };

  const handleSubmit = async (formData: FormData) => {
    if (!selectedFile) {
      toast.error('Por favor selecciona un archivo');
      return;
    }
    if (!selectedDef) {
      toast.error('Por favor selecciona el tipo de documento');
      return;
    }

    startTransition(async () => {
      const loadingToast = toast.loading('Procesando y subiendo documento...');
      
      try {
        let fileToUpload = selectedFile;
        const isImage = selectedFile.type.startsWith('image/');
        const docNameLower = selectedDef.name.toLowerCase();

        // 1. If it's a selfie with white background, label it with name and RUT
        if (isImage && (docNameLower.includes('foto con fondo blanco') || docNameLower === 'foto de perfil')) {
          if (!selectedPersonnel) throw new Error('No se ha seleccionado el trabajador');
          const base64 = await fileToBase64(selectedFile);
          const fullName = `${selectedPersonnel.first_name} ${selectedPersonnel.last_name_father} ${selectedPersonnel.last_name_mother || ''}`;
          const labeledBase64 = await labelSelfie(base64, fullName, selectedPersonnel.rut || '');
          const fileSuffix = `${selectedPersonnel.first_name}_${selectedPersonnel.last_name_father}`
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]/g, '_');
          fileToUpload = base64ToFile(labeledBase64, `FOTO_NOMBRE_${fileSuffix}.jpg`);
        }

        // 2. If it's a card (Cedula, Licencia, TICA) and it's an image, compile to PDF
        else if (isImage && (docNameLower.includes('cedula') || docNameLower.includes('licencia') || docNameLower.includes('tica'))) {
          if (!selectedPersonnel) throw new Error('No se ha seleccionado el trabajador');
          const base64 = await fileToBase64(selectedFile);
          const pdfBase64 = await compileSingleCardPdf(base64);
          const fileSuffix = `${selectedPersonnel.first_name}_${selectedPersonnel.last_name_father}`
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]/g, '_');
          const sanitizedType = selectedDef.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]/g, '_')
            .toUpperCase();
          fileToUpload = base64ToFile(pdfBase64, `${sanitizedType}_${fileSuffix}.pdf`);
        }

        formData.set('file', fileToUpload);
        formData.set('type', selectedDef.name);
        formData.set('definition_id', selectedDef.id);

        const result = await uploadDocument(formData);
        
        if (result.error) {
          toast.error('Error al subir', { description: result.error, id: loadingToast });
        } else {
          toast.success('Documento subido correctamente', { id: loadingToast });
          const selectedId = formData.get('personnel_id');
          if (selectedId) {
            router.push(`/personnel/${selectedId}`);
          } else {
            router.push('/documents');
          }
        }
      } catch (err: any) {
        toast.error('Error al procesar el archivo', { description: err.message || 'Inténtalo de nuevo', id: loadingToast });
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
          {/* ── Trabajador ───────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="personnel_id">Trabajador *</Label>
            <select
              id="personnel_id"
              name="personnel_id"
              value={selectedPersonnelId}
              required
              onChange={e => {
                setSelectedPersonnelId(e.target.value);
                setSelectedDefId(''); // reset doc type when worker changes
              }}
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

          {/* ── Tipo de Documento (dynamic, filtered by position) ─────────── */}
          <div className="space-y-2">
            <Label htmlFor="doc_definition">Tipo de Documento *</Label>
            <select
              id="doc_definition"
              name="doc_definition"
              value={selectedDefId}
              onChange={e => setSelectedDefId(e.target.value)}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Seleccione tipo</option>
              {applicableDefinitions.map((def) => (
                <option key={def.id} value={def.id}>
                  {def.name}{def.is_mandatory ? ' *' : ''}
                </option>
              ))}
            </select>
            {selectedPersonnel && applicableDefinitions.length === 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <Info className="h-3 w-3" />
                No hay documentos configurados para el cargo de este trabajador.
              </p>
            )}
            {selectedPersonnel && documentDefinitions.length > applicableDefinitions.length && (
              <p className="text-[10px] text-slate-400 italic">
                Mostrando {applicableDefinitions.length} de {documentDefinitions.length} documentos según el cargo.
              </p>
            )}
          </div>

          {/* ── Número de Documento ───────────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="number">
              Número de Documento {isTicaOrPcp && <span className="text-red-500">*</span>}
            </Label>
            <Input 
              id="number" 
              name="number" 
              placeholder={isTicaOrPcp ? "Ingresa el número de credencial" : "Opcional"} 
              required={isTicaOrPcp} 
            />
          </div>

          {/* ── Date fields driven by definition metadata ─────────────────── */}
          {needsExpirationDate && (
            <div className="space-y-2">
              <Label htmlFor="explicit_expiration_date">Fecha de Vencimiento *</Label>
              <DatePickerField id="explicit_expiration_date" name="explicit_expiration_date" minYear={2020} maxYear={2045} required />
            </div>
          )}

          {needsIssueDate && (
            <div className="space-y-2">
              <Label htmlFor="issue_date">Fecha de Emisión <span className="text-muted-foreground font-normal text-xs">(Opcional)</span></Label>
              <DatePickerField id="issue_date" name="issue_date" minYear={2020} maxYear={2045} />
            </div>
          )}

          {needsAnchorDate && parentDef && (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="tica_date">
                Fecha de Vencimiento de {parentDef.name}{' '}
                <span className="text-xs text-muted-foreground font-normal">
                  (el sistema calculará el vencimiento automáticamente)
                </span>
              </Label>
              <DatePickerField id="tica_date" name="tica_date" required={needsAnchorDate} minYear={2020} maxYear={2045} />
            </div>
          )}

          {/* Issue date always shown when anchor date is used (for records) */}
          {needsAnchorDate && (
            <div className="space-y-2">
              <Label htmlFor="issue_date">Fecha de Emisión</Label>
              <DatePickerField id="issue_date" name="issue_date" minYear={2020} maxYear={2045} />
            </div>
          )}

          {/* ── Definition info badge ────────────────────────────────────── */}
          {selectedDef?.description && (
            <div className="md:col-span-2 flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{selectedDef.description}</span>
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
              {selectedFile ? selectedFile.name : 'Arrastra y suelta o haz clic para seleccionar'}
            </p>
            <Input
              type="file"
              id="file-upload"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              className="max-w-xs mx-auto"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
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

export function UploadDocumentClient({ personnelList, documentDefinitions }: Props) {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subir Documento</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Sube un documento de cumplimiento con seguimiento de expiración
        </p>
      </div>

      <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
        <DocumentUploadForm personnelList={personnelList} documentDefinitions={documentDefinitions} />
      </Suspense>
    </div>
  );
}
