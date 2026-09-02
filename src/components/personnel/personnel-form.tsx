'use client';

import { useState, useTransition, useEffect } from 'react';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, CheckCircle2, XCircle, Phone, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { createPersonnel, updatePersonnel, deletePersonnel } from '@/app/(dashboard)/personnel/actions';
import { generateDismissalActa } from '@/app/(dashboard)/personnel/generate-dismissal-acta';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';
import type { Personnel } from '@/types/database';

interface PersonnelFormProps {
  personnel?: Personnel;
  companies?: { id: string; name: string }[];
  positions?: { id: string; name: string; area?: { name: string }; requires_shifts?: boolean }[];
  shifts?: { id: string; name: string; start_time: string; end_time: string }[];
  areas?: { id: string; name: string }[];
  hasTica?: boolean;
  hasPcp?: boolean;
  ticaNumber?: string;
  pcpNumber?: string;
  ticaExpiry?: string;
  pcpExpiry?: string;
  ticaUrl?: string;
  pcpUrl?: string;
}

const CLOTHING_SIZES_LETTER = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const PANTS_SIZES_NUMBER = ['36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58'];
const SHOE_SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'];

const AFP_LIST = [
  'CAPITAL',
  'CUPRUM',
  'HABITAT',
  'MODELO',
  'PLANVITAL',
  'PROVIDA',
  'UNO'
];

const ISAPRE_LIST = [
  'BANMÉDICA',
  'COLMENA',
  'CONSALUD',
  'CRUZBLANCA',
  'NUEVA MASVIDA',
  'VIDA TRES',
  'ESENCIAL'
];

const BANK_LIST = [
  'BANCO ESTADO',
  'BANCO DE CHILE',
  'BANCO SANTANDER',
  'BANCO BCI',
  'BANCO ITAÚ',
  'BANCO SCOTIABANK',
  'BANCO BICE',
  'BANCO SECURITY',
  'BANCO CONSORCIO',
  'BANCO INTERNACIONAL',
  'BANCO FALABELLA',
  'BANCO RIPLEY',
  'PREPAGO LOS HÉROES',
  'PREPAGO TENPO',
  'PREPAGO MACH'
];




// ── Phone helpers ──────────────────────────────────────────────────────────────
// Accepts any partial input and returns a formatted +56 X XXXX XXXX string.
function formatChileanPhone(raw: string): string {
  // Strip everything except digits
  let digits = raw.replace(/\D/g, '');
  // Remove leading country code if present (56)
  if (digits.startsWith('56')) digits = digits.slice(2);
  // Cap at 9 digits (Chilean mobile = 9 digits local)
  digits = digits.slice(0, 9);
  if (!digits) return '';
  // Build display string: +56 D XXXX XXXX
  let out = '+56 ' + digits[0];
  if (digits.length > 1) out += ' ' + digits.slice(1, 5);
  if (digits.length > 5) out += ' ' + digits.slice(5);
  return out;
}

function normalizePhone(display: string): string {
  const digits = display.replace(/\D/g, '');
  if (!digits) return '';
  const local = digits.startsWith('56') ? digits.slice(2) : digits;
  return local ? '+56' + local : '';
}

function isValidChileanPhone(display: string): boolean {
  const digits = display.replace(/\D/g, '');
  // Must have country code 56 + 9-digit local starting with 9 = 11 digits total
  if (digits.startsWith('56')) return digits.length === 11 && digits[2] === '9';
  return digits.length === 9 && digits[0] === '9';
}

// ── Email helper ───────────────────────────────────────────────────────────────
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function PersonnelForm({ 
  personnel, 
  companies = [], 
  positions = [], 
  shifts = [], 
  areas = [],
  hasTica = false,
  hasPcp = false,
  ticaNumber = '',
  pcpNumber = '',
  ticaExpiry = '',
  pcpExpiry = '',
  ticaUrl = '',
  pcpUrl = ''
}: PersonnelFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isEditing = !!personnel;
  const [prefersNight, setPrefersNight] = useState(personnel?.prefers_night ?? false);
  const [avoidsNight, setAvoidsNight] = useState(personnel?.avoids_night ?? false);
  const [hasSpecialContract, setHasSpecialContract] = useState(personnel?.has_special_contract ?? false);
  const [requiresTransport, setRequiresTransport] = useState((personnel as any)?.requires_transport ?? true);
  const [isActive, setIsActive] = useState(personnel?.is_active ?? true);
  const [inactiveReason, setInactiveReason] = useState(personnel?.inactive_reason || '');

  // New dismissal states
  const [isDismissOpen, setIsDismissOpen] = useState(false);
  const [dismissalReason, setDismissalReason] = useState('');
  const [dismissalDate, setDismissalDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [deliveredTica, setDeliveredTica] = useState(true);
  const [deliveredPcp, setDeliveredPcp] = useState(true);

  const handleConfirmDismiss = () => {
    if (!personnel) return;
    if (!dismissalReason.trim()) {
      toast.error('Por favor, ingresa el motivo de la baja');
      return;
    }

    startTransition(async () => {
      const refusedTica = hasTica ? !deliveredTica : false;
      const refusedPcp = hasPcp ? !deliveredPcp : false;

      const res = await deletePersonnel(personnel.id, dismissalReason, refusedTica, refusedPcp, dismissalDate);
      if (res.success) {
        toast.success(`Trabajador dado de baja correctamente`);
        setIsDismissOpen(false);

        // Find position name
        const posObj = positions.find(p => p.id === personnel.main_position);
        const positionName = posObj ? posObj.name : personnel.main_position;

        // Generate and download PDF actas if they had TICA or PCP
        if (hasTica) {
          try {
            await generateDismissalActa({
              first_name: personnel.first_name,
              last_name_father: personnel.last_name_father,
              last_name_mother: personnel.last_name_mother || '',
              rut: personnel.rut,
              main_position_name: positionName || '',
              credential_type: 'TICA',
              refused_to_return: refusedTica,
              credential_number: ticaNumber,
              credential_expiry: ticaExpiry,
              credential_image_url: ticaUrl || null,
              inactive_reason: dismissalReason
            });
          } catch (pdfErr) {
            console.error('Error generating TICA PDF on dismissal:', pdfErr);
          }
        }

        if (hasPcp) {
          try {
            await generateDismissalActa({
              first_name: personnel.first_name,
              last_name_father: personnel.last_name_father,
              last_name_mother: personnel.last_name_mother || '',
              rut: personnel.rut,
              main_position_name: positionName || '',
              credential_type: 'PCP',
              refused_to_return: refusedPcp,
              credential_number: pcpNumber,
              credential_expiry: pcpExpiry,
              credential_image_url: pcpUrl || null,
              inactive_reason: dismissalReason
            });
          } catch (pdfErr) {
            console.error('Error generating PCP PDF on dismissal:', pdfErr);
          }
        }

        // Redirect to profile page
        router.push(`/personnel/${personnel.id}`);
        router.refresh();
      } else {
        toast.error(res.error || 'Error al dar de baja');
      }
    });
  };
  const [selectedSecondary, setSelectedSecondary] = useState<string[]>(
    (personnel?.secondary_positions as string[]) || []
  );
  const [enableAccess, setEnableAccess] = useState(!!personnel?.user_id);
  const [isPrio04, setIsPrio04] = useState(personnel?.rotation_pattern?.includes('PRIO-04') || false);
  const [dropdownValue, setDropdownValue] = useState<string>('');
  const [healthSystem, setHealthSystem] = useState(personnel?.health_system || '');
  
  // RUT, Bank Details & Gender
  const [rutValue, setRutValue] = useState(personnel?.rut || '');
  const [bankAccountType, setBankAccountType] = useState(personnel?.bank_account_type || '');
  const [bankName, setBankName] = useState(personnel?.bank_name || '');
  const [bankAccountNumber, setBankAccountNumber] = useState(personnel?.bank_account_number || '');
  const [nationalitySelect, setNationalitySelect] = useState(() => {
    const nat = (personnel?.nationality || 'CHILENA').toUpperCase();
    return ['CHILENA', 'ARGENTINA', 'BOLIVIANA', 'PERUANA', 'COLOMBIANA', 'VENEZOLANA'].includes(nat) ? nat : 'OTRA';
  });
  const [customNationality, setCustomNationality] = useState(() => {
    const nat = (personnel?.nationality || 'CHILENA').toUpperCase();
    return ['CHILENA', 'ARGENTINA', 'BOLIVIANA', 'PERUANA', 'COLOMBIANA', 'VENEZOLANA'].includes(nat) ? '' : nat;
  });

  useEffect(() => {
    if (bankAccountType === 'RUT') {
      setBankName('BANCO ESTADO');
      const body = rutValue.replace(/[^0-9kK]/g, '').slice(0, -1).replace(/\D/g, '');
      setBankAccountNumber(body);
    }
  }, [bankAccountType, rutValue]);



  // ── Phone controlled state ─────────────────────────────────────────────────
  const [phoneDisplay, setPhoneDisplay] = useState(() =>
    personnel?.phone ? formatChileanPhone(personnel.phone) : ''
  );
  const [phoneTouched, setPhoneTouched] = useState(false);
  const phoneValid = !phoneDisplay || isValidChileanPhone(phoneDisplay);
  const phoneError = phoneTouched && phoneDisplay && !phoneValid
    ? 'Debe tener 9 dígitos locales: +56 9 XXXX XXXX'
    : '';

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow the user to clear the field
    if (!raw.replace(/\D/g, '')) { setPhoneDisplay(''); return; }
    setPhoneDisplay(formatChileanPhone(raw));
  };

  // ── Email controlled state ─────────────────────────────────────────────────
  const [emailDisplay, setEmailDisplay] = useState(personnel?.email || '');
  const [emailTouched, setEmailTouched] = useState(false);
  const emailValid = !emailDisplay || isValidEmail(emailDisplay);
  const emailError = emailTouched && emailDisplay && !emailValid
    ? 'Formato inválido. Ej: juan.perez@empresa.com'
    : '';

  const [requiresShifts, setRequiresShifts] = useState<boolean>((personnel as any)?.requires_shifts ?? true);

  // Stabilize initial values for uncontrolled inputs to satisfy Base UI
  const [initialValues] = useState(() => {
    const addr = (personnel?.address as { street?: string; city?: string; region?: string; comuna?: string }) || {};
    return {
      first_name: personnel?.first_name || '',
      last_name_father: personnel?.last_name_father || '',
      last_name_mother: personnel?.last_name_mother || '',
      rut: personnel?.rut || '',
      email: personnel?.email || '',
      birth_date: personnel?.birth_date || '',
      phone: personnel?.phone || '',
      address_street: addr.street || '',
      address_city: addr.city || '',
      address_region: addr.region || '',
      address_comuna: addr.comuna || '',
      driver_licenses: personnel?.driver_licenses?.join(', ') || '',
      main_position: personnel?.main_position || '',
      rotation_pattern: personnel?.rotation_pattern || '5x2',
      fixed_shift_id: personnel?.fixed_shift_id || '',
      hire_date: personnel?.hire_date || '',
      termination_date: personnel?.termination_date || '',
      company_id: personnel?.company_id || '',
      // Emergency Contact
      emergency_contact_name: personnel?.emergency_contact_name || '',
      emergency_contact_relationship: personnel?.emergency_contact_relationship || '',
      emergency_contact_phone: personnel?.emergency_contact_phone || '',
      // Clothing Sizes
      clothing_tshirt_size: personnel?.clothing_tshirt_size || '',
      clothing_polar_size: personnel?.clothing_polar_size || '',
      clothing_pants_size_letter: personnel?.clothing_pants_size_letter || '',
      clothing_pants_size_number: personnel?.clothing_pants_size_number || '',
      clothing_shoe_size: personnel?.clothing_shoe_size || '',
      clothing_parka_size: personnel?.clothing_parka_size || '',
      clothing_overall_size: personnel?.clothing_overall_size || '',
      custom_clothing_sizes: (personnel?.custom_clothing_sizes as Record<string, string>) || {},
      afp: personnel?.afp || '',
      health_system: personnel?.health_system || '',
      isapre: personnel?.isapre || '',
      gender: personnel?.gender || '',
      nationality: personnel?.nationality || 'CHILENA',
      marital_status: personnel?.marital_status || '',
      bank_account_type: personnel?.bank_account_type || '',
      bank_name: personnel?.bank_name || '',
      bank_account_number: personnel?.bank_account_number || '',
    };
  });

  const [allCustomSizeFields, setAllCustomSizeFields] = useState<{ key: string; label: string; sizeType: string }[]>([]);

  useEffect(() => {
    const fetchCatalogCustomSizes = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('epp_product_catalog')
          .select('size_field, size_type')
          .not('size_field', 'is', null)
          .like('size_field', 'clothing_custom_%');

        const catalogMap = new Map((data || []).map((d: any) => [d.size_field, d.size_type || 'LETTER']));
        const existingWorkerKeys = Object.keys(initialValues.custom_clothing_sizes || {});

        const combinedKeys = Array.from(new Set([...Array.from(catalogMap.keys()), ...existingWorkerKeys]));

        const formatted = combinedKeys.map(k => {
          const clean = k.replace('clothing_custom_', '').replace(/_/g, ' ');
          const label = 'Talla: ' + clean.charAt(0).toUpperCase() + clean.slice(1);
          const sizeType = catalogMap.get(k) || 'LETTER';
          return { key: k, label, sizeType };
        });

        setAllCustomSizeFields(formatted);
      } catch (e) {
        console.error('Error fetching catalog custom sizes:', e);
      }
    };
    fetchCatalogCustomSizes();
  }, [initialValues.custom_clothing_sizes]);

  const address = (personnel?.address as { street?: string; city?: string; region?: string; comuna?: string }) || {};

  const handleSubmit = async (formData: FormData) => {
    // Normalize phone to +56XXXXXXXXX before sending
    formData.set('phone', normalizePhone(phoneDisplay));
    // Email value is already correct (controlled)
    formData.set('email', emailDisplay);

    formData.set('prefers_night', String(prefersNight));
    formData.set('avoids_night', String(avoidsNight));
    formData.set('has_special_contract', String(hasSpecialContract));
    formData.set('requires_transport', String(requiresTransport));
    formData.set('is_active', String(isActive));
    formData.set('inactive_reason', inactiveReason);
    formData.set('secondary_positions', selectedSecondary.join(','));
    formData.set('enable_access', String(enableAccess));

    // Manually set bank/health fields to avoid disabled fields being omitted
    formData.set('health_system', healthSystem);
    formData.set('bank_account_type', bankAccountType);
    formData.set('bank_name', bankName);
    formData.set('bank_account_number', bankAccountNumber);


    // Block submission if validations fail
    if (phoneDisplay && !isValidChileanPhone(phoneDisplay)) {
      setPhoneTouched(true);
      toast.error('El número de teléfono no es válido');
      return;
    }
    if (emailDisplay && !isValidEmail(emailDisplay)) {
      setEmailTouched(true);
      toast.error('El email no tiene un formato válido');
      return;
    }

    // Manage rotation pattern + priority tags
    let pattern = formData.get('rotation_pattern') as string;
    if (isPrio04 && !pattern.includes('PRIO-04')) {
      pattern = `${pattern} PRIO-04`;
    } else if (!isPrio04 && pattern.includes('PRIO-04')) {
      pattern = pattern.replace('PRIO-04', '').trim();
    }
    formData.set('rotation_pattern', pattern);

    startTransition(async () => {
      const result = isEditing
        ? await updatePersonnel(personnel!.id, formData)
        : await createPersonnel(formData);

      if (result.error) {
        toast.error('Error', { description: result.error });
      } else {
        toast.success(isEditing ? 'Trabajador actualizado' : 'Trabajador registrado');
        router.back();
      }
    });
  };

  const positionMap = Object.fromEntries(positions.map(p => [p.id, p.name]));

  return (
    <form action={handleSubmit} className="space-y-6 max-w-3xl">
      {/* Información Personal */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Información Personal</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="first_name">Nombre *</Label>
            <Input id="first_name" name="first_name" defaultValue={initialValues.first_name} required placeholder="Juan" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name_father">Apellido Paterno *</Label>
            <Input id="last_name_father" name="last_name_father" defaultValue={initialValues.last_name_father} required placeholder="Pérez" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name_mother">Apellido Materno</Label>
            <Input id="last_name_mother" name="last_name_mother" defaultValue={initialValues.last_name_mother} placeholder="García" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rut">RUT *</Label>
            <Input id="rut" name="rut" value={rutValue} onChange={e => setRutValue(e.target.value)} required placeholder="12.345.678-9" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">
              <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />Email (para acceso al sistema)</span>
            </Label>
            <div className="relative">
              <Input
                id="email"
                name="email"
                type="text"
                inputMode="email"
                value={emailDisplay}
                onChange={e => setEmailDisplay(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                placeholder="juan.perez@empresa.com"
                className={emailTouched && emailDisplay
                  ? emailValid ? 'border-emerald-400 pr-8' : 'border-red-400 pr-8'
                  : 'pr-8'
                }
              />
              {emailTouched && emailDisplay && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {emailValid
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    : <XCircle className="h-4 w-4 text-red-500" />}
                </span>
              )}
            </div>
            {emailError && <p className="text-xs text-red-600">{emailError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="birth_date">Fecha de Nacimiento *</Label>
            <DatePickerField id="birth_date" name="birth_date" value={initialValues.birth_date} minYear={1940} maxYear={2010} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">
              <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Teléfono (WhatsApp)</span>
            </Label>
            <div className="relative">
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                value={phoneDisplay}
                onChange={handlePhoneChange}
                onBlur={() => setPhoneTouched(true)}
                placeholder="+56 9 1234 5678"
                className={phoneTouched && phoneDisplay
                  ? phoneValid ? 'border-emerald-400 pr-8' : 'border-red-400 pr-8'
                  : 'pr-8'
                }
              />
              {phoneTouched && phoneDisplay && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {phoneValid
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    : <XCircle className="h-4 w-4 text-red-500" />}
                </span>
              )}
            </div>
            {phoneError
              ? <p className="text-xs text-red-600">{phoneError}</p>
              : <p className="text-xs text-muted-foreground">Formato: +56 9 XXXX XXXX — solo números chilenos</p>
            }
          </div>

          <div className="space-y-2">
            <Label htmlFor="gender">Género *</Label>
            <select id="gender" name="gender" defaultValue={initialValues.gender} required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Seleccionar género</option>
              <option value="MASCULINO">MASCULINO</option>
              <option value="FEMENINO">FEMENINO</option>
              <option value="OTRO">OTRO</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nationality_select">Nacionalidad</Label>
            <select
              id="nationality_select"
              value={nationalitySelect}
              onChange={(e) => setNationalitySelect(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="CHILENA">CHILENA</option>
              <option value="ARGENTINA">ARGENTINA</option>
              <option value="BOLIVIANA">BOLIVIANA</option>
              <option value="PERUANA">PERUANA</option>
              <option value="COLOMBIANA">COLOMBIANA</option>
              <option value="VENEZOLANA">VENEZOLANA</option>
              <option value="OTRA">OTRA</option>
            </select>
            {nationalitySelect === 'OTRA' ? (
              <div className="mt-1.5 animate-in fade-in duration-200">
                <Input
                  id="nationality"
                  name="nationality"
                  value={customNationality}
                  onChange={(e) => setCustomNationality(e.target.value.toUpperCase())}
                  placeholder="Especificar nacionalidad (ej: ECUATORIANA)"
                  required
                />
              </div>
            ) : (
              <input
                type="hidden"
                id="nationality"
                name="nationality"
                value={nationalitySelect}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="marital_status">Estado Civil</Label>
            <select id="marital_status" name="marital_status" defaultValue={initialValues.marital_status}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Seleccionar estado civil</option>
              <option value="SOLTERO/A">SOLTERO/A</option>
              <option value="CASADO/A">CASADO/A</option>
              <option value="DIVORCIADO/A">DIVORCIADO/A</option>
              <option value="VIUDO/A">VIUDO/A</option>
              <option value="UNIÓN CIVIL">UNIÓN CIVIL</option>
            </select>
          </div>

          
          <div className="flex items-center justify-between p-4 rounded-xl border border-blue-100 bg-blue-50/30 md:col-span-2">
            <div className="space-y-0.5">
              <Label className="text-blue-900 font-bold">Acceso al Sistema</Label>
              <p className="text-[11px] text-blue-700">Crea un usuario automáticamente usando el email y RUT (como clave inicial).</p>
            </div>
            <Switch 
              checked={enableAccess} 
              onCheckedChange={setEnableAccess} 
            />
          </div>
        </CardContent>
      </Card>

      {/* Dirección */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Dirección</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2 md:col-span-4">
            <Label htmlFor="address_street">Calle</Label>
            <Textarea id="address_street" name="address_street" defaultValue={initialValues.address_street} placeholder="Av. Providencia 1234" rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address_comuna">Comuna</Label>
            <Input id="address_comuna" name="address_comuna" defaultValue={initialValues.address_comuna} placeholder="Providencia" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address_city">Ciudad</Label>
            <Input id="address_city" name="address_city" defaultValue={initialValues.address_city} placeholder="Santiago" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address_region">Región</Label>
            <Input id="address_region" name="address_region" defaultValue={initialValues.address_region} placeholder="Metropolitana" />
          </div>
        </CardContent>
      </Card>

      {/* Contacto de Emergencia */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Contacto de Emergencia</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="emergency_contact_name">Nombre de Contacto</Label>
            <Input id="emergency_contact_name" name="emergency_contact_name" defaultValue={initialValues.emergency_contact_name} placeholder="María Gómez" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emergency_contact_relationship">Parentesco</Label>
            <Input id="emergency_contact_relationship" name="emergency_contact_relationship" defaultValue={initialValues.emergency_contact_relationship} placeholder="Cónyuge / Madre / Hermano" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="emergency_contact_phone">Teléfono de Contacto</Label>
            <Input id="emergency_contact_phone" name="emergency_contact_phone" defaultValue={initialValues.emergency_contact_phone} placeholder="+56 9 8765 4321" />
          </div>
        </CardContent>
      </Card>

      {/* Previsión Social */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Previsión Social (AFP y Salud)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="afp">AFP</Label>
            <select id="afp" name="afp" defaultValue={initialValues.afp}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Seleccionar AFP</option>
              {AFP_LIST.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="health_system">Sistema de Salud</Label>
            <select id="health_system" name="health_system" value={healthSystem} onChange={e => setHealthSystem(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Seleccionar Sistema</option>
              <option value="FONASA">FONASA</option>
              <option value="ISAPRE">ISAPRE</option>
            </select>
          </div>

          {healthSystem === 'ISAPRE' && (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="isapre">Isapre</Label>
              <select id="isapre" name="isapre" defaultValue={initialValues.isapre}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Seleccionar Isapre</option>
                {ISAPRE_LIST.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Datos Bancarios */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Datos Bancarios</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bank_account_type">Tipo de Cuenta</Label>
            <select id="bank_account_type" name="bank_account_type" value={bankAccountType} onChange={e => setBankAccountType(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Seleccionar tipo</option>
              <option value="VISTA">VISTA</option>
              <option value="CORRIENTE">CORRIENTE</option>
              <option value="RUT">RUT (CUENTA RUT)</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank_name">Banco</Label>
            <select 
              id="bank_name" 
              name="bank_name" 
              value={bankName} 
              onChange={e => setBankName(e.target.value)}
              disabled={bankAccountType === 'RUT'}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-80"
            >
              <option value="">Seleccionar banco</option>
              {BANK_LIST.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank_account_number">Número de Cuenta</Label>
            <Input 
              id="bank_account_number" 
              name="bank_account_number" 
              type="text" 
              inputMode="numeric"
              pattern="[0-9]*"
              value={bankAccountNumber} 
              onChange={e => setBankAccountNumber(e.target.value.replace(/\D/g, ''))}
              readOnly={bankAccountType === 'RUT'}
              placeholder="123456789" 
            />
            {bankAccountType === 'RUT' && (
              <p className="text-[10px] text-blue-600 font-medium">Autocompletado con el RUT.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tallas de Ropa */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Tallas de Ropa y Calzado</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="clothing_tshirt_size">Talla de Polera</Label>
            <select id="clothing_tshirt_size" name="clothing_tshirt_size" defaultValue={initialValues.clothing_tshirt_size}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Seleccionar talla</option>
              {CLOTHING_SIZES_LETTER.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clothing_polar_size">Talla de Polar</Label>
            <select id="clothing_polar_size" name="clothing_polar_size" defaultValue={initialValues.clothing_polar_size}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Seleccionar talla</option>
              {CLOTHING_SIZES_LETTER.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clothing_pants_size_letter">Talla de Pantalón (Letra)</Label>
            <select id="clothing_pants_size_letter" name="clothing_pants_size_letter" defaultValue={initialValues.clothing_pants_size_letter}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Seleccionar talla</option>
              {CLOTHING_SIZES_LETTER.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clothing_pants_size_number">Talla de Pantalón (Número)</Label>
            <select id="clothing_pants_size_number" name="clothing_pants_size_number" defaultValue={initialValues.clothing_pants_size_number}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Seleccionar talla</option>
              {PANTS_SIZES_NUMBER.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clothing_shoe_size">Talla de Zapatos</Label>
            <select id="clothing_shoe_size" name="clothing_shoe_size" defaultValue={initialValues.clothing_shoe_size}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Seleccionar talla</option>
              {SHOE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clothing_parka_size">Talla de Parka</Label>
            <select id="clothing_parka_size" name="clothing_parka_size" defaultValue={initialValues.clothing_parka_size}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Seleccionar talla</option>
              {CLOTHING_SIZES_LETTER.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="clothing_overall_size">Talla de Jardinera Térmica</Label>
            <select id="clothing_overall_size" name="clothing_overall_size" defaultValue={initialValues.clothing_overall_size}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Seleccionar talla</option>
              {CLOTHING_SIZES_LETTER.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Custom Clothing Sizes */}
          {allCustomSizeFields.length > 0 && (
            <div className="md:col-span-2 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider font-mono">
                Tallas Personalizadas Adicionales (Catálogo EPP)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allCustomSizeFields.map(({ key, label, sizeType }) => {
                  const val = initialValues.custom_clothing_sizes?.[key] || '';
                  const options = sizeType === 'NUMBER' ? PANTS_SIZES_NUMBER : sizeType === 'SHOE' ? SHOE_SIZES : CLOTHING_SIZES_LETTER;
                  return (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={key}>{label}</Label>
                      <select
                        id={key}
                        name={key}
                        defaultValue={val}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">Seleccionar talla</option>
                        {options.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      {/* Cargo y Empresa */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Cargo y Empresa</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="company_id">Empresa *</Label>
            <select id="company_id" name="company_id" required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={initialValues.company_id}>
              <option value="">Seleccionar empresa</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="main_position">Cargo Principal</Label>
            <select id="main_position" name="main_position"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={initialValues.main_position}
              onChange={(e) => {
                const selectedPosId = e.target.value;
                const posObj = positions.find(p => p.id === selectedPosId);
                if (posObj && posObj.requires_shifts !== undefined) {
                  setRequiresShifts(posObj.requires_shifts);
                }
              }}>
              <option value="">Por asignar / Sin cargo</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.area?.name ? `(${p.area.name})` : ''} {p.requires_shifts === false ? ' (Sin turnos)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="space-y-0.5">
                <Label htmlFor="requires_shifts_toggle" className="text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                  Requiere asignación de turnos (Roster Operativo)
                </Label>
                <p className="text-xs text-slate-500">
                  Si se desmarca, este trabajador estará exento de la planificación de turnos pero mantendrá acceso a su Ficha, Documentos y EPP.
                </p>
              </div>
              <Switch 
                id="requires_shifts_toggle" 
                checked={requiresShifts} 
                onCheckedChange={setRequiresShifts} 
              />
            </div>
            <input type="hidden" name="requires_shifts" value={requiresShifts ? 'true' : 'false'} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>
              Cargos Secundarios{' '}
              <span className="text-xs text-muted-foreground">(ordenados por prioridad — el primero será la primera opción si no se necesita del cargo principal)</span>
            </Label>

            {/* Add from dropdown */}
            <div className="flex gap-2">
              <select
                className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={dropdownValue}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val && !selectedSecondary.includes(val)) {
                    setSelectedSecondary(prev => [...prev, val]);
                  }
                  // Reset select immediately
                  setDropdownValue('');
                }}
              >
                <option value="">+ Agregar cargo secundario...</option>
                {positions
                  .filter(p => !selectedSecondary.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.area?.name ? `(${p.area.name})` : ''}
                    </option>
                  ))
                }
              </select>
            </div>

            {/* Priority list */}
            {selectedSecondary.length > 0 ? (
              <div className="space-y-1.5 p-3 rounded-lg border border-input bg-slate-50 dark:bg-slate-900/50">
                {selectedSecondary.map((posId, idx) => {
                  const posName = positionMap[posId];
                  const displayName = posName ? posName : `(Cargo no encontrado - ${posId.split('-')[0]})`;
                  return (
                    <div key={`${posId}-${idx}`} className="flex items-center gap-2 bg-white dark:bg-slate-950 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-800 shadow-sm">
                      <span className="flex items-center justify-center h-6 w-6 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 text-xs font-bold shrink-0">
                        {idx + 1}
                      </span>
                      <span className={`text-sm font-medium flex-1 ${!posName && 'text-red-500'}`}>{displayName}</span>
                      <div className="flex items-center gap-0.5">
                        <button type="button" disabled={idx === 0}
                          className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-default transition-colors"
                          onClick={() => {
                            const arr = [...selectedSecondary];
                            [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                            setSelectedSecondary(arr);
                          }}>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button type="button" disabled={idx === selectedSecondary.length - 1}
                          className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-default transition-colors"
                          onClick={() => {
                            const arr = [...selectedSecondary];
                            [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                            setSelectedSecondary(arr);
                          }}>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        <button type="button"
                          className="h-6 w-6 flex items-center justify-center rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors ml-1"
                          onClick={() => setSelectedSecondary(prev => prev.filter(p => p !== posId))}>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic px-1">Sin cargos secundarios asignados.</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="driver_licenses">
              Licencias de Conducir{' '}
              <span className="text-xs text-muted-foreground">(separadas por coma)</span>
            </Label>
            <Input id="driver_licenses" name="driver_licenses" defaultValue={initialValues.driver_licenses} placeholder="B, C, D" />
          </div>
        </CardContent>
      </Card>

      {/* Planificación y Rotación */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base text-orange-600">Planificación y Escala</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rotation_pattern">Patrón de Rotación</Label>
              <select 
                id="rotation_pattern" 
                name="rotation_pattern"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue={initialValues.rotation_pattern}
              >
                <option value="5x2">5x2 (Semanal / Rotativo)</option>
                <option value="5X2-RELEVO-A">5x2 Relevo A (Fin de semana libre Sem 1)</option>
                <option value="5X2-RELEVO-B">5x2 Relevo B (Fin de semana libre Sem 2)</option>
                <option value="l-v">Lunes a Viernes (Fijo)</option>
                <option value="7x7">7x7 (Ciclo Estándar)</option>
                <option value="7X7-A">7x7 - Turno A (Inicio Ciclo)</option>
                <option value="7X7-B">7x7 - Turno B (Relevo Ciclo)</option>
                <option value="4x4_noche">4x4 Noche (Intercambiable)</option>
                <option value="BLUE_DIA-1">Blue Día - Secuencia 1 (A-C-B)</option>
                <option value="BLUE_DIA-2">Blue Día - Secuencia 2 (B-A-C)</option>
                <option value="BLUE_DIA-3">Blue Día - Secuencia 3 (C-B-A)</option>
                <option value="BLUE_NOCHE-1">Blue Noche - Secuencia 1 (A-C-B)</option>
                <option value="BLUE_NOCHE-2">Blue Noche - Secuencia 2 (B-A-C)</option>
                <option value="BLUE_NOCHE-3">Blue Noche - Secuencia 3 (C-B-A)</option>
                <option value="part_time">Part-Time / Ocasional</option>
                <option value="manual">Manual / Bajo Demanda</option>
              </select>
              <p className="text-[10px] text-muted-foreground italic">Determina cómo el motor propone los turnos. Usa Relevo A/B para alternar fines de semana en Supervisores.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fixed_shift_id">Turno Fijo (Opcional)</Label>
              <select 
                id="fixed_shift_id" 
                name="fixed_shift_id"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue={initialValues.fixed_shift_id}
              >
                <option value="">Ninguno / Rotativo</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.start_time.substring(0,5)} - {s.end_time.substring(0,5)})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground italic">Si se asigna, este trabajador siempre preferirá este turno.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hire_date">Fecha de Ingreso (Contratación)</Label>
              <DatePickerField id="hire_date" name="hire_date" value={initialValues.hire_date} />
              <p className="text-[10px] text-muted-foreground italic">No se podrán asignar turnos antes de esta fecha.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="termination_date">Fecha de Baja (Si renuncia)</Label>
              <DatePickerField id="termination_date" name="termination_date" value={initialValues.termination_date} />
              <p className="text-[10px] text-muted-foreground italic">Pasada esta fecha, el trabajador quedará bloqueado en el roster.</p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-orange-100 bg-orange-50/30 md:col-span-2">
              <div>
                <Label htmlFor="has_special_contract" className="text-orange-900">¿Contrato Especial? (7x7 / Otros)</Label>
                <p className="text-[11px] text-orange-700">Exime de la regla de 40h semanales y domingos libres (ej: Canes externo)</p>
              </div>
              <Switch id="has_special_contract" checked={hasSpecialContract} onCheckedChange={setHasSpecialContract} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-blue-100 bg-blue-50/30 md:col-span-2">
              <div>
                <Label htmlFor="is_prio_04" className="text-blue-900">Prioridad Turno 04:00 (Supervisores)</Label>
                <p className="text-[11px] text-blue-700">Asegura que este trabajador cubra primero los turnos de las 04:00 frente a otros candidatos.</p>
              </div>
              <Switch id="is_prio_04" checked={isPrio04} onCheckedChange={setIsPrio04} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferencias y Restricciones */}
      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Preferencias y Restricciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="prefers_night">Prefiere Turno Nocturno</Label>
              <p className="text-xs text-muted-foreground">Priorizar asignaciones de turno nocturno</p>
            </div>
            <Switch id="prefers_night" checked={prefersNight} onCheckedChange={(checked) => { setPrefersNight(checked); if (checked) setAvoidsNight(false); }} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="avoids_night">Evita Turno Nocturno</Label>
              <p className="text-xs text-muted-foreground">Evitar asignar turnos nocturnos cuando sea posible</p>
            </div>
            <Switch id="avoids_night" checked={avoidsNight} onCheckedChange={(checked) => { setAvoidsNight(checked); if (checked) setPrefersNight(false); }} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="requires_transport">Requiere Transporte</Label>
              <p className="text-xs text-muted-foreground">Si se desactiva, la IA evitará darle turnos que necesiten transporte (prioridad baja)</p>
            </div>
            <Switch id="requires_transport" checked={requiresTransport} onCheckedChange={setRequiresTransport} />
          </div>
          {(!isEditing || !isActive) && (
            <>
              <Separator />
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="is_active" className={!isActive ? 'text-red-600 font-bold' : ''}>Estado Activo</Label>
                    <p className="text-xs text-muted-foreground">Si se desactiva, el trabajador no aparecerá en el roster ni en el listado principal</p>
                  </div>
                  <Switch 
                    id="is_active" 
                    checked={isActive} 
                    onCheckedChange={(checked) => {
                      setIsActive(checked);
                      if (checked) {
                        setInactiveReason('');
                      }
                    }} 
                  />
                </div>
                {!isActive && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <Label htmlFor="inactive_reason" className="text-red-600 font-bold">Motivo de la Baja *</Label>
                    <textarea
                      id="inactive_reason"
                      placeholder="Por favor, ingresa el motivo por el cual estás dando de baja a este trabajador..."
                      value={inactiveReason}
                      onChange={(e) => setInactiveReason(e.target.value)}
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 placeholder:text-muted-foreground"
                      required
                    />
                    <p className="text-xs text-red-500 font-semibold mt-1">
                      ⚠️ Al desactivar al trabajador y guardar los cambios, se eliminarán permanentemente todos sus documentos y cartas del sistema para ahorrar espacio.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Acciones */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}
            className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/25">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Guardar Cambios' : 'Crear Trabajador'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
        </div>

        {isEditing && isActive && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setIsDismissOpen(true)}
            className="bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/25 font-bold uppercase text-xs"
          >
            Dar de Baja Trabajador
          </Button>
        )}
      </div>

      {/* DIALOG: DAR DE BAJA */}
      <Dialog open={isDismissOpen} onOpenChange={setIsDismissOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
              <svg className="h-5 w-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Dar de Baja Trabajador
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Indica la fecha y el motivo de la baja de {personnel?.first_name} {personnel?.last_name_father}. El trabajador será desactivado del sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Date field */}
            <div className="space-y-1.5">
              <Label htmlFor="dismissal-date" className="text-sm font-semibold">Fecha de Baja *</Label>
              <input
                id="dismissal-date"
                type="date"
                value={dismissalDate}
                onChange={e => setDismissalDate(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              />
            </div>

            {/* Reason field */}
            <div className="space-y-1.5">
              <Label htmlFor="dismissal-reason" className="text-sm font-semibold">Motivo de la Baja *</Label>
              <textarea
                id="dismissal-reason"
                placeholder="Escribe el motivo de la baja aquí..."
                value={dismissalReason}
                onChange={e => setDismissalReason(e.target.value)}
                className="flex min-h-[90px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 placeholder:text-slate-400"
                required
              />
              <p className="text-[11px] text-rose-500 font-medium">
                {hasTica || hasPcp 
                  ? '⚠️ Si el trabajador posee credenciales TICA o PCP activas, se generarán automáticamente sus actas de devolución y quedará en estado "Baja Pendiente" hasta subir las recepciones firmadas por la DGAC.' 
                  : '⚠️ Al dar de baja, se desactivará al trabajador y se limpiarán sus documentos de manera permanente.'}
              </p>
            </div>

            {/* Checkbox for TICA Return */}
            {hasTica && (
              <div className="flex items-start gap-2 p-3 bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl">
                <Checkbox 
                  id="deliver-tica" 
                  checked={deliveredTica}
                  onCheckedChange={(checked) => setDeliveredTica(!!checked)}
                  className="mt-0.5"
                />
                <Label htmlFor="deliver-tica" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none leading-tight">
                  El trabajador entregó su credencial TICA física. (Si no la entregó, desmarca esta opción para dejar constancia de que se negó en el acta).
                </Label>
              </div>
            )}

            {/* Checkbox for PCP Return */}
            {hasPcp && (
              <div className="flex items-start gap-2 p-3 bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/30 rounded-xl">
                <Checkbox 
                  id="deliver-pcp" 
                  checked={deliveredPcp}
                  onCheckedChange={(checked) => setDeliveredPcp(!!checked)}
                  className="mt-0.5"
                />
                <Label htmlFor="deliver-pcp" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none leading-tight">
                  El trabajador entregó su credencial PCP física. (Si no la entregó, desmarca esta opción para dejar constancia de que se negó en el acta).
                </Label>
              </div>
            )}
          </div>

          <DialogFooter className="mt-2 gap-2 flex-col sm:flex-row">
            <Button variant="ghost" onClick={() => setIsDismissOpen(false)} className="rounded-xl font-bold uppercase text-xs">
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmDismiss}
              disabled={isPending || !dismissalReason.trim() || !dismissalDate}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl px-6 font-black uppercase text-xs"
            >
              {isPending ? 'Procesando...' : 'Confirmar Baja'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
