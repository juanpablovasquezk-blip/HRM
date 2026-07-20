'use client';

import { useState, useEffect, useTransition } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Shirt, 
  CheckCircle2, 
  Search, 
  UserCheck, 
  Building, 
  Send,
  AlertTriangle,
  Clock,
  Lock,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  updateWorkerClothingSizes, 
  getWorkerSelfServiceDetails, 
  getWorkerSelfServiceDetailsByToken 
} from '../(dashboard)/epp/actions';

const CLOTHING_SIZES_LETTER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'];
const PANTS_SIZES_NUMBER = ['36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60'];
const SHOE_SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'];

interface TallasClientProps {
  workersList: { id: string; rut: string; fullName: string; positionName: string; companyName: string }[];
  initialWorkerIdOrRut?: string;
  initialToken?: string;
}

export default function TallasClient({ workersList, initialWorkerIdOrRut, initialToken }: TallasClientProps) {
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(() => {
    if (!initialWorkerIdOrRut) return '';
    const match = workersList.find(w => w.id === initialWorkerIdOrRut || w.rut === initialWorkerIdOrRut);
    return match ? match.id : '';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<'IDLE' | 'VALID' | 'EXPIRED' | 'NOT_FOUND'>('IDLE');
  const [errorMessage, setErrorMessage] = useState('');
  const [expiresAtDate, setExpiresAtDate] = useState<string | null>(null);
  
  const [workerDetails, setWorkerDetails] = useState<any>(null);
  const [sizesForm, setSizesForm] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Handle Token verification on mount if initialToken is present
  useEffect(() => {
    if (initialToken) {
      const loadTokenDetails = async () => {
        setIsLoadingDetails(true);
        try {
          const res = await getWorkerSelfServiceDetailsByToken(initialToken);
          if (res.status === 'EXPIRED') {
            setTokenStatus('EXPIRED');
            setErrorMessage(res.error || 'Este enlace ha caducado.');
          } else if (res.status === 'VALID' && res.data) {
            setTokenStatus('VALID');
            setWorkerDetails(res.data);
            setExpiresAtDate(res.data.expiresAt);
            const w = res.data.worker;

            const form: Record<string, string> = {
              clothing_tshirt_size: w.clothing_tshirt_size || '',
              clothing_polar_size: w.clothing_polar_size || '',
              clothing_pants_size_letter: w.clothing_pants_size_letter || '',
              clothing_pants_size_number: w.clothing_pants_size_number || '',
              clothing_shoe_size: w.clothing_shoe_size || '',
              clothing_parka_size: w.clothing_parka_size || '',
              clothing_overall_size: w.clothing_overall_size || '',
            };

            if (w.custom_clothing_sizes) {
              Object.entries(w.custom_clothing_sizes).forEach(([k, v]) => {
                form[k] = (v as string) || '';
              });
            }

            setSizesForm(form);
          } else {
            setTokenStatus('NOT_FOUND');
            setErrorMessage(res.error || 'Enlace no válido');
          }
        } catch (e) {
          setTokenStatus('NOT_FOUND');
          setErrorMessage('Error al verificar el enlace');
        } finally {
          setIsLoadingDetails(false);
        }
      };
      loadTokenDetails();
    }
  }, [initialToken]);

  // Filter workers for manual search if no token
  const filteredWorkers = workersList.filter(w => 
    w.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.rut.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Load details when a worker is selected manually
  const handleSelectWorker = async (workerId: string) => {
    setSelectedWorkerId(workerId);
    setIsLoadingDetails(true);
    setWorkerDetails(null);
    setIsSubmitted(false);

    try {
      const res = await getWorkerSelfServiceDetails(workerId);
      if (res?.data) {
        setWorkerDetails(res.data);
        const w = res.data.worker;

        const form: Record<string, string> = {
          clothing_tshirt_size: w.clothing_tshirt_size || '',
          clothing_polar_size: w.clothing_polar_size || '',
          clothing_pants_size_letter: w.clothing_pants_size_letter || '',
          clothing_pants_size_number: w.clothing_pants_size_number || '',
          clothing_shoe_size: w.clothing_shoe_size || '',
          clothing_parka_size: w.clothing_parka_size || '',
          clothing_overall_size: w.clothing_overall_size || '',
        };

        if (w.custom_clothing_sizes) {
          Object.entries(w.custom_clothing_sizes).forEach(([k, v]) => {
            form[k] = (v as string) || '';
          });
        }

        setSizesForm(form);
      } else {
        toast.error(res?.error || 'Error al cargar datos del trabajador');
      }
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerDetails?.worker?.id) return;

    startTransition(async () => {
      const res = await updateWorkerClothingSizes(workerDetails.worker.id, sizesForm);
      if (res.success) {
        setIsSubmitted(true);
        toast.success('Tallas registradas exitosamente');
      } else {
        toast.error(res.error || 'Error al guardar tallas');
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-xl mx-auto space-y-6">
        
        {/* Header Branding Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-6 text-center space-y-3">
          <div className="flex justify-center">
            <div className="h-12 w-12 rounded-2xl bg-orange-100 dark:bg-orange-950/50 flex items-center justify-center text-orange-600 dark:text-orange-400">
              <Shirt className="h-6 w-6" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Registro de Tallas de Uniforme y EPP
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Formulario oficial para el registro de tallas de vestuario laboral y equipos de protección personal.
            </p>
          </div>
        </div>

        {/* Expired Token Screen */}
        {tokenStatus === 'EXPIRED' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-red-200 dark:border-red-900/50 p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-red-600 dark:text-red-400">
                <Clock className="h-9 w-9" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-red-950 dark:text-red-300">
                Enlace Caducado
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <div className="pt-2 text-xs text-muted-foreground">
              Por razones de seguridad, cada enlace personal tiene un tiempo límite de validez. Contacta a Recursos Humanos para recibir un nuevo enlace por WhatsApp.
            </div>
          </div>
        )}

        {/* Invalid Token Screen */}
        {tokenStatus === 'NOT_FOUND' && initialToken && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-amber-200 dark:border-amber-900/50 p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <XCircle className="h-9 w-9" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-amber-950 dark:text-amber-300">
                Enlace No Válido
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {errorMessage || 'El código del enlace no fue encontrado o es incorrecto.'}
              </p>
            </div>
          </div>
        )}

        {/* Step 1: Worker Selection if no token and no details */}
        {!workerDetails && tokenStatus !== 'EXPIRED' && tokenStatus !== 'NOT_FOUND' && !initialToken && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-6 space-y-4">
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Busca tu Nombre o RUT en el listado:
            </Label>
            
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Escribe tu nombre o RUT (Ej: 17.426.406-6)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 pt-1">
              {filteredWorkers.length > 0 ? (
                filteredWorkers.map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => handleSelectWorker(w.id)}
                    className="w-full text-left p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-orange-300 dark:hover:border-orange-800 hover:bg-orange-50/30 dark:hover:bg-orange-950/20 transition-all flex items-center justify-between group"
                  >
                    <div>
                      <p className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-orange-600">
                        {w.fullName}
                      </p>
                      <p className="text-xs text-slate-500 font-mono">
                        {w.rut} • {w.positionName}
                      </p>
                    </div>
                    <UserCheck className="h-4 w-4 text-slate-400 group-hover:text-orange-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-slate-400">
                  No se encontraron trabajadores que coincidan con la búsqueda.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        {isLoadingDetails && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-12 text-center space-y-3">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-orange-500 border-t-transparent" />
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Cargando tu información de tallas...</p>
          </div>
        )}

        {/* Step 2: Form or Success Screen */}
        {workerDetails && !isLoadingDetails && (
          <>
            {isSubmitted ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-emerald-200 dark:border-emerald-900/50 p-8 text-center space-y-4">
                <div className="flex justify-center">
                  <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    ¡Muchas gracias, {workerDetails.worker.first_name}!
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Tus tallas oficiales han sido guardadas con éxito. Puedes cerrar esta ventana.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-6 space-y-6">
                
                {/* Worker Profile Card */}
                <div className="bg-orange-50/60 dark:bg-orange-950/30 rounded-xl p-4 border border-orange-200/80 dark:border-orange-900/50 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                      <p className="font-bold text-slate-900 dark:text-white text-base">
                        {workerDetails.worker.first_name} {workerDetails.worker.last_name_father} {workerDetails.worker.last_name_mother || ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-600 dark:text-slate-400 font-medium">
                      <span className="font-mono">{workerDetails.worker.rut}</span>
                      <span>•</span>
                      <span>{workerDetails.worker.position?.name || 'Sin Cargo'}</span>
                    </div>

                    {expiresAtDate && (
                      <div className="flex items-center gap-1 mt-2 text-[11px] text-amber-800 dark:text-amber-400 font-medium">
                        <Clock className="h-3 w-3" />
                        <span>Enlace válido hasta el {format(parseISO(expiresAtDate), "d 'de' MMMM 'a las' HH:mm", { locale: es })}</span>
                      </div>
                    )}
                  </div>

                  {!initialToken && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setWorkerDetails(null)}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      Cambiar
                    </Button>
                  )}
                </div>

                {/* Size Dropdowns */}
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider font-mono">
                    Selecciona tus tallas oficiales:
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    {/* Talla Polera */}
                    <div className="space-y-1.5">
                      <Label htmlFor="clothing_tshirt_size" className="text-xs font-semibold">Talla de Polera</Label>
                      <select
                        id="clothing_tshirt_size"
                        value={sizesForm.clothing_tshirt_size || ''}
                        onChange={(e) => setSizesForm(prev => ({ ...prev, clothing_tshirt_size: e.target.value }))}
                        className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="">Seleccionar talla...</option>
                        {CLOTHING_SIZES_LETTER.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* Talla Polar */}
                    <div className="space-y-1.5">
                      <Label htmlFor="clothing_polar_size" className="text-xs font-semibold">Talla de Polar / Chaqueta</Label>
                      <select
                        id="clothing_polar_size"
                        value={sizesForm.clothing_polar_size || ''}
                        onChange={(e) => setSizesForm(prev => ({ ...prev, clothing_polar_size: e.target.value }))}
                        className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="">Seleccionar talla...</option>
                        {CLOTHING_SIZES_LETTER.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* Talla Pantalón Letra */}
                    <div className="space-y-1.5">
                      <Label htmlFor="clothing_pants_size_letter" className="text-xs font-semibold">Talla Pantalón (Letra)</Label>
                      <select
                        id="clothing_pants_size_letter"
                        value={sizesForm.clothing_pants_size_letter || ''}
                        onChange={(e) => setSizesForm(prev => ({ ...prev, clothing_pants_size_letter: e.target.value }))}
                        className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="">Seleccionar talla...</option>
                        {CLOTHING_SIZES_LETTER.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* Talla Pantalón Número */}
                    <div className="space-y-1.5">
                      <Label htmlFor="clothing_pants_size_number" className="text-xs font-semibold">Talla Pantalón (Número)</Label>
                      <select
                        id="clothing_pants_size_number"
                        value={sizesForm.clothing_pants_size_number || ''}
                        onChange={(e) => setSizesForm(prev => ({ ...prev, clothing_pants_size_number: e.target.value }))}
                        className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="">Seleccionar número...</option>
                        {PANTS_SIZES_NUMBER.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* Talla Zapatos */}
                    <div className="space-y-1.5">
                      <Label htmlFor="clothing_shoe_size" className="text-xs font-semibold">Talla Calzado / Zapatos</Label>
                      <select
                        id="clothing_shoe_size"
                        value={sizesForm.clothing_shoe_size || ''}
                        onChange={(e) => setSizesForm(prev => ({ ...prev, clothing_shoe_size: e.target.value }))}
                        className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="">Seleccionar número de calzado...</option>
                        {SHOE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* Talla Parka */}
                    <div className="space-y-1.5">
                      <Label htmlFor="clothing_parka_size" className="text-xs font-semibold">Talla de Parka</Label>
                      <select
                        id="clothing_parka_size"
                        value={sizesForm.clothing_parka_size || ''}
                        onChange={(e) => setSizesForm(prev => ({ ...prev, clothing_parka_size: e.target.value }))}
                        className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="">Seleccionar talla...</option>
                        {CLOTHING_SIZES_LETTER.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* Custom Catalog Items */}
                    {(workerDetails.catalog || []).filter((c: any) => c.uses_sizes && c.size_field?.startsWith('clothing_custom_')).map((catItem: any) => {
                      const key = catItem.size_field!;
                      const clean = key.replace('clothing_custom_', '').replace(/_/g, ' ');
                      const label = 'Talla: ' + clean.charAt(0).toUpperCase() + clean.slice(1);
                      const options = catItem.size_type === 'NUMBER' ? PANTS_SIZES_NUMBER : catItem.size_type === 'SHOE' ? SHOE_SIZES : CLOTHING_SIZES_LETTER;

                      return (
                        <div key={key} className="space-y-1.5 sm:col-span-2">
                          <Label htmlFor={key} className="text-xs font-semibold text-orange-700 dark:text-orange-400">{label}</Label>
                          <select
                            id={key}
                            value={sizesForm[key] || ''}
                            onChange={(e) => setSizesForm(prev => ({ ...prev, [key]: e.target.value }))}
                            className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                          >
                            <option value="">Seleccionar talla...</option>
                            {options.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      );
                    })}

                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold h-11 text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm"
                  >
                    {isPending ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Guardando...
                      </span>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Guardar Mis Tallas
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-400">
          Grupo Minerquim • HRM Roster Manager
        </div>
      </div>
    </div>
  );
}
