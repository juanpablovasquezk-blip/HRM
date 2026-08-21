'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Trash2,
  Building,
  Loader2,
  FileText,
  Upload,
  Download,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Save,
  FileCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createCompany,
  updateCompanyDetails,
  deleteCompany,
  deleteCompanyDocument,
  CompanyDetailsInput,
} from './actions';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface CompanyDoc {
  id: string;
  company_id: string;
  category: string;
  title: string;
  file_url: string;
  file_name: string;
  uploaded_at: string;
}

interface Company {
  id: string;
  name: string;
  legal_name?: string | null;
  rut?: string | null;
  giro?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  phone?: string | null;
  email?: string | null;
  legal_representative?: string | null;
  created_at: string;
  company_documents?: CompanyDoc[];
}

export function CompaniesClient({ initialCompanies }: { initialCompanies: Company[] }) {
  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [expandedCompanyId, setExpandedCompanyIdState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('expanded_company_id');
      if (saved && initialCompanies.some(c => c.id === saved)) {
        return saved;
      }
    }
    return initialCompanies.length > 0 ? initialCompanies[0].id : null;
  });

  const setExpandedCompanyId = (id: string | null) => {
    setExpandedCompanyIdState(id);
    if (typeof window !== 'undefined') {
      if (id) {
        sessionStorage.setItem('expanded_company_id', id);
      } else {
        sessionStorage.removeItem('expanded_company_id');
      }
    }
  };
  const [isLoading, setIsLoading] = useState(false);
  const [savingCompanyId, setSavingCompanyId] = useState<string | null>(null);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  // Form states for each company ID
  const [formDataMap, setFormDataMap] = useState<Record<string, CompanyDetailsInput>>(() => {
    const map: Record<string, CompanyDetailsInput> = {};
    initialCompanies.forEach((c) => {
      map[c.id] = {
        name: c.name || '',
        legal_name: c.legal_name || '',
        rut: c.rut || '',
        giro: c.giro || '',
        address: c.address || '',
        city: c.city || '',
        region: c.region || '',
        phone: c.phone || '',
        email: c.email || '',
        legal_representative: c.legal_representative || '',
      };
    });
    return map;
  });

  // State for new document form
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocCategory, setNewDocCategory] = useState('GENERAL');
  const [newDocFile, setNewDocFile] = useState<File | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsLoading(true);
    const result = await createCompany(newName);
    setIsLoading(false);

    if (result.error) {
      toast.error('Error al crear empresa', { description: result.error });
    } else {
      toast.success('Empresa creada correctamente');
      setNewName('');
      window.location.reload();
    }
  };

  const handleFieldChange = (companyId: string, field: keyof CompanyDetailsInput, value: string) => {
    setFormDataMap((prev) => ({
      ...prev,
      [companyId]: {
        ...prev[companyId],
        [field]: value,
      },
    }));
  };

  const handleSaveDetails = async (companyId: string) => {
    const formVals = formDataMap[companyId];
    if (!formVals || !formVals.name.trim()) {
      toast.error('El nombre de la empresa no puede estar vacío.');
      return;
    }

    setSavingCompanyId(companyId);
    const res = await updateCompanyDetails(companyId, formVals);
    setSavingCompanyId(null);

    if (res.error) {
      toast.error('Error al guardar datos', { description: res.error });
    } else {
      toast.success('Datos de la empresa guardados correctamente.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta empresa? Esto fallará si tiene personal asignado.')) return;
    setIsLoading(true);
    const result = await deleteCompany(id);
    setIsLoading(false);

    if (result.error) {
      toast.error('No se pudo eliminar', { description: 'Asegúrate de que no tenga personal asignado.' });
    } else {
      toast.success('Empresa eliminada');
      window.location.reload();
    }
  };

  // Helper: upload via API route (avoids server action serialization issues)
  const uploadViaApi = async (fd: FormData): Promise<{ success: boolean; error?: string }> => {
    const response = await fetch('/api/company-documents/upload', {
      method: 'POST',
      body: fd,
    });
    return response.json();
  };

  // Upload RIOHS PDF specifically for a company
  const handleUploadRiohs = async (companyId: string, file: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('El RIOHS debe ser un archivo PDF.');
      return;
    }

    setUploadingCategory(`RIOHS_${companyId}`);
    try {
      const fd = new FormData();
      fd.append('companyId', companyId);
      fd.append('category', 'RIOHS');
      fd.append('title', 'Reglamento Interno de Orden, Higiene y Seguridad (RIOHS)');
      fd.append('file', file);

      const res = await uploadViaApi(fd);

      if (!res.success) {
        toast.error(res.error || 'Error al subir RIOHS.');
      } else {
        toast.success('✅ RIOHS de la empresa subido y actualizado correctamente. El módulo de entrega ha sido activado.');
        window.location.reload();
      }
    } catch (err: any) {
      console.error('Upload exception:', err);
      toast.error('Error durante la subida del archivo: ' + (err.message || 'El archivo puede ser demasiado grande o la conexión expiró.'));
    } finally {
      setUploadingCategory(null);
    }
  };

  // Upload general company document
  const handleUploadGeneralDoc = async (companyId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim() || !newDocFile) {
      toast.error('Debes proporcionar un título y seleccionar un archivo.');
      return;
    }

    setUploadingCategory(`GENERAL_${companyId}`);
    try {
      const fd = new FormData();
      fd.append('companyId', companyId);
      fd.append('category', newDocCategory);
      fd.append('title', newDocTitle.trim());
      fd.append('file', newDocFile);

      const res = await uploadViaApi(fd);

      if (!res.success) {
        toast.error(res.error || 'Error al subir documento.');
      } else {
        toast.success('Documento corporativo agregado exitosamente.');
        setNewDocTitle('');
        setNewDocFile(null);
        window.location.reload();
      }
    } catch (err: any) {
      console.error('Upload exception:', err);
      toast.error('Error durante la subida: ' + (err.message || 'Error inesperado.'));
    } finally {
      setUploadingCategory(null);
    }
  };

  const handleDeleteDoc = async (docId: string, companyId: string) => {
    if (!confirm('¿Deseas eliminar este documento corporativo?')) return;

    const res = await deleteCompanyDocument(docId, companyId);
    if (!res.success) {
      toast.error(res.error || 'Error al eliminar documento.');
    } else {
      toast.success('Documento eliminado.');
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6">
      {/* Create New Company Header Card */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building className="h-5 w-5 text-orange-600" />
            Nueva Empresa / Razón Social
          </CardTitle>
          <CardDescription>Agrega una nueva entidad legal para gestionar su personal y documentos.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="company-name" className="sr-only">
                Nombre de la Empresa
              </Label>
              <Input
                id="company-name"
                placeholder="Ej. Logística Norte S.A."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isLoading || !newName.trim()} className="bg-orange-600 hover:bg-orange-700 text-white">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Agregar
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Companies Accordion List */}
      <div className="space-y-4">
        {companies.map((company) => {
          const isExpanded = expandedCompanyId === company.id;
          const formVals = formDataMap[company.id] || {};

          const docs = company.company_documents || [];
          const riohsDoc = docs.find((d) => d.category === 'RIOHS');
          const otherDocs = docs.filter((d) => d.category !== 'RIOHS');

          return (
            <Card key={company.id} className="border-slate-200/70 dark:border-slate-800 shadow-sm overflow-hidden transition-all">
              {/* Accordion Header */}
              <div
                onClick={() => setExpandedCompanyId(isExpanded ? null : company.id)}
                className="p-4 flex items-center justify-between cursor-pointer bg-slate-50/50 hover:bg-slate-100/60 dark:bg-slate-900/40 dark:hover:bg-slate-900/80 transition-colors border-b border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-orange-100 dark:bg-orange-950/50 text-orange-600 flex items-center justify-center shrink-0 border border-orange-200/60 dark:border-orange-900/50">
                    <Building className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">{company.name}</h3>
                      {riohsDoc ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 gap-1 text-[11px]">
                          <CheckCircle2 className="h-3 w-3" /> RIOHS Vigente
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 gap-1 text-[11px]">
                          <AlertTriangle className="h-3 w-3" /> RIOHS Pendiente
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      RUT: <span className="font-semibold">{formVals.rut || company.rut || 'Sin especificar'}</span>
                      {company.legal_name && ` — ${company.legal_name}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                    onClick={() => handleDelete(company.id)}
                    title="Eliminar Empresa"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpandedCompanyId(isExpanded ? null : company.id)}
                    className="text-slate-500"
                  >
                    {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </Button>
                </div>
              </div>

              {/* Expanded Accordion Content */}
              {isExpanded && (
                <CardContent className="p-6 space-y-8 bg-white dark:bg-slate-950">
                  {/* 1. Legal Company Details Form */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <Building className="h-4 w-4 text-orange-600" />
                        Datos Legales e Identificación Corporativa
                      </h4>
                      <Button
                        size="sm"
                        onClick={() => handleSaveDetails(company.id)}
                        disabled={savingCompanyId === company.id}
                        className="bg-orange-600 hover:bg-orange-700 text-white h-8 text-xs gap-1.5"
                      >
                        {savingCompanyId === company.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Guardar Cambios
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                      <div>
                        <Label className="text-xs text-slate-600 font-medium">Nombre Fantasía</Label>
                        <Input
                          value={formVals.name || ''}
                          onChange={(e) => handleFieldChange(company.id, 'name', e.target.value)}
                          className="mt-1 h-8 text-xs"
                          placeholder="Ej. MINERQUIM"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <Label className="text-xs text-slate-600 font-medium">Razón Social Completa</Label>
                        <Input
                          value={formVals.legal_name || ''}
                          onChange={(e) => handleFieldChange(company.id, 'legal_name', e.target.value)}
                          className="mt-1 h-8 text-xs"
                          placeholder="Ej. COMERCIALIZADORA Y SERVICIOS DE INGENIERIA MINERQUIM LIMITADA"
                        />
                      </div>

                      <div>
                        <Label className="text-xs text-slate-600 font-medium">RUT Empresa</Label>
                        <Input
                          value={formVals.rut || ''}
                          onChange={(e) => handleFieldChange(company.id, 'rut', e.target.value)}
                          className="mt-1 h-8 text-xs font-mono"
                          placeholder="Ej. 76.135.448-5"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <Label className="text-xs text-slate-600 font-medium">Giro Comercial / Actividad</Label>
                        <Input
                          value={formVals.giro || ''}
                          onChange={(e) => handleFieldChange(company.id, 'giro', e.target.value)}
                          className="mt-1 h-8 text-xs"
                          placeholder="Ej. Servicios de ingeniería y mantenimiento industrial"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <Label className="text-xs text-slate-600 font-medium">Dirección Matriz / Sucursal</Label>
                        <Input
                          value={formVals.address || ''}
                          onChange={(e) => handleFieldChange(company.id, 'address', e.target.value)}
                          className="mt-1 h-8 text-xs"
                          placeholder="Ej. Av. Los Conquistadores 1950"
                        />
                      </div>

                      <div>
                        <Label className="text-xs text-slate-600 font-medium">Ciudad</Label>
                        <Input
                          value={formVals.city || ''}
                          onChange={(e) => handleFieldChange(company.id, 'city', e.target.value)}
                          className="mt-1 h-8 text-xs"
                          placeholder="Ej. Providencia"
                        />
                      </div>

                      <div>
                        <Label className="text-xs text-slate-600 font-medium">Región</Label>
                        <Input
                          value={formVals.region || ''}
                          onChange={(e) => handleFieldChange(company.id, 'region', e.target.value)}
                          className="mt-1 h-8 text-xs"
                          placeholder="Ej. Región Metropolitana"
                        />
                      </div>

                      <div>
                        <Label className="text-xs text-slate-600 font-medium">Teléfono de Contacto</Label>
                        <Input
                          value={formVals.phone || ''}
                          onChange={(e) => handleFieldChange(company.id, 'phone', e.target.value)}
                          className="mt-1 h-8 text-xs"
                          placeholder="Ej. +56 2 2345 6789"
                        />
                      </div>

                      <div>
                        <Label className="text-xs text-slate-600 font-medium">Email Corporativo</Label>
                        <Input
                          value={formVals.email || ''}
                          onChange={(e) => handleFieldChange(company.id, 'email', e.target.value)}
                          className="mt-1 h-8 text-xs"
                          placeholder="Ej. contacto@minerquim.cl"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <Label className="text-xs text-slate-600 font-medium">Representante Legal</Label>
                        <Input
                          value={formVals.legal_representative || ''}
                          onChange={(e) => handleFieldChange(company.id, 'legal_representative', e.target.value)}
                          className="mt-1 h-8 text-xs"
                          placeholder="Nombre del Representante Legal"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. RIOHS Dedicated Section */}
                  <div className="space-y-3 pt-2">
                    <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b pb-2">
                      <FileCheck className="h-4 w-4 text-orange-600" />
                      Reglamento Interno de Orden, Higiene y Seguridad (RIOHS)
                    </h4>

                    <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">RIOHS Maestro Vigente</span>
                          {riohsDoc ? (
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Activo / Subido
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300">
                              Sin RIOHS Subido
                            </Badge>
                          )}
                        </div>
                        {riohsDoc ? (
                          <p className="text-xs text-slate-500">
                            Archivo: <span className="font-medium text-slate-700 dark:text-slate-300">{riohsDoc.file_name}</span> — Subido el{' '}
                            {format(new Date(riohsDoc.uploaded_at), "dd 'de' MMMM 'de' yyyy", { locale: es })}
                          </p>
                        ) : (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            Al subir el RIOHS en formato PDF, se habilitará automáticamente la opción de envío por correo a los trabajadores de esta empresa.
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {riohsDoc && (
                          <a href={riohsDoc.file_url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-slate-300">
                              <Download className="h-3.5 w-3.5 text-slate-600" />
                              Ver RIOHS Actual
                            </Button>
                          </a>
                        )}

                        <label className="cursor-pointer">
                          <span className="inline-flex items-center justify-center rounded-md text-xs font-semibold h-8 px-3 bg-orange-600 hover:bg-orange-700 text-white shadow-xs gap-1.5 transition-colors">
                            {uploadingCategory === `RIOHS_${company.id}` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Upload className="h-3.5 w-3.5" />
                            )}
                            {riohsDoc ? 'Reemplazar RIOHS (PDF)' : 'Subir RIOHS (PDF)'}
                          </span>
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleUploadRiohs(company.id, file);
                                e.target.value = '';
                              }
                            }}
                            disabled={uploadingCategory === `RIOHS_${company.id}`}
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* 3. General Corporate Documents Section */}
                  <div className="space-y-4 pt-2">
                    <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b pb-2">
                      <FileText className="h-4 w-4 text-orange-600" />
                      Otros Documentos Corporativos
                    </h4>

                    {/* Upload Form for Corporate Docs */}
                    <form onSubmit={(e) => handleUploadGeneralDoc(company.id, e)} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/30 flex flex-col md:flex-row gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <Label className="text-[11px] text-slate-600">Título / Nombre del Documento</Label>
                        <Input
                          placeholder="Ej. Política de Prevención de Alcohol y Drogas 2026"
                          value={newDocTitle}
                          onChange={(e) => setNewDocTitle(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="w-full md:w-40 space-y-1">
                        <Label className="text-[11px] text-slate-600">Categoría</Label>
                        <select
                          value={newDocCategory}
                          onChange={(e) => setNewDocCategory(e.target.value)}
                          className="w-full h-8 px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
                        >
                          <option value="GENERAL">General</option>
                          <option value="POLITICA">Politica</option>
                          <option value="CERTIFICADO">Certificado</option>
                        </select>
                      </div>

                      <div className="w-full md:w-60 space-y-1">
                        <Label className="text-[11px] text-slate-600">Archivo (PDF / Imagen)</Label>
                        <Input
                          type="file"
                          onChange={(e) => setNewDocFile(e.target.files?.[0] || null)}
                          className="h-8 text-xs cursor-pointer"
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={uploadingCategory === `GENERAL_${company.id}` || !newDocTitle.trim() || !newDocFile}
                        size="sm"
                        className="h-8 text-xs bg-slate-800 hover:bg-slate-900 text-white shrink-0"
                      >
                        {uploadingCategory === `GENERAL_${company.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5 mr-1" />
                        )}
                        Adjuntar Documento
                      </Button>
                    </form>

                    {/* Table of Other Documents */}
                    {otherDocs.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 font-semibold border-b">
                            <tr>
                              <th className="p-2.5">Título / Documento</th>
                              <th className="p-2.5">Categoría</th>
                              <th className="p-2.5">Fecha Subida</th>
                              <th className="p-2.5 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {otherDocs.map((doc) => (
                              <tr key={doc.id} className="hover:bg-slate-50/50">
                                <td className="p-2.5 font-medium text-slate-800 dark:text-slate-200">
                                  {doc.title}
                                  <span className="block text-[10px] text-slate-400 font-normal">{doc.file_name}</span>
                                </td>
                                <td className="p-2.5">
                                  <Badge variant="outline" className="text-[10px]">
                                    {doc.category}
                                  </Badge>
                                </td>
                                <td className="p-2.5 text-slate-500">
                                  {format(new Date(doc.uploaded_at), "dd/MM/yyyy HH:mm", { locale: es })}
                                </td>
                                <td className="p-2.5 text-right space-x-1">
                                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600">
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                  </a>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteDoc(doc.id, company.id)}
                                    className="h-7 w-7 p-0 text-red-600 hover:text-red-800"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic text-center py-2">
                        No hay otros documentos corporativos adjuntos para esta empresa.
                      </p>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
