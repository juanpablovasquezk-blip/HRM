'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Loader2, CheckCircle2, XCircle, Phone, Mail, User, ShieldAlert, Shirt, CreditCard, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { updatePersonnelFichaByToken } from '../(dashboard)/personnel/update-actions';

interface ActualizarFichaClientProps {
  token: string;
  worker: any;
}

const CLOTHING_SIZES_LETTER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const PANTS_SIZES_NUMBER = ['36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60'];
const SHOE_SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'];

const AFP_LIST = ['CAPITAL', 'CUPRUM', 'HABITAT', 'MODELO', 'PLANVITAL', 'PROVIDA', 'UNO'];
const ISAPRE_LIST = ['BANMÉDICA', 'COLMENA', 'CONSALUD', 'CRUZBLANCA', 'NUEVA MASVIDA', 'VIDA TRES', 'ESENCIAL'];
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

// Formatting helpers
function formatChileanPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('56')) digits = digits.slice(2);
  digits = digits.slice(0, 9);
  if (!digits) return '';
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
  if (digits.startsWith('56')) return digits.length === 11 && digits[2] === '9';
  return digits.length === 9 && digits[0] === '9';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export default function ActualizarFichaClient({ token, worker }: ActualizarFichaClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSuccess, setIsSuccess] = useState(false);

  // Load existing values from worker object
  const address = worker.address || {};

  // Form states
  const [firstName, setFirstName] = useState(worker.first_name || '');
  const [lastNameFather, setLastNameFather] = useState(worker.last_name_father || '');
  const [lastNameMother, setLastNameMother] = useState(worker.last_name_mother || '');
  const [birthDate, setBirthDate] = useState(worker.birth_date || '');
  const [emailDisplay, setEmailDisplay] = useState(worker.email || '');
  const [emailTouched, setEmailTouched] = useState(false);
  
  const [phoneDisplay, setPhoneDisplay] = useState(() => {
    return worker.phone ? formatChileanPhone(worker.phone) : '';
  });
  const [phoneTouched, setPhoneTouched] = useState(false);

  // Address
  const [addressStreet, setAddressStreet] = useState(address.street || '');
  const [addressCity, setAddressCity] = useState(address.city || '');
  const [addressRegion, setAddressRegion] = useState(address.region || '');
  const [addressComuna, setAddressComuna] = useState(address.comuna || '');

  // Emergency contact
  const [emergencyName, setEmergencyName] = useState(worker.emergency_contact_name || '');
  const [emergencyRelationship, setEmergencyRelationship] = useState(worker.emergency_contact_relationship || '');
  const [emergencyPhone, setEmergencyPhone] = useState(() => {
    return worker.emergency_contact_phone ? formatChileanPhone(worker.emergency_contact_phone) : '';
  });

  // Tallas de ropa
  const [clothingTshirt, setClothingTshirt] = useState(worker.clothing_tshirt_size || '');
  const [clothingPolar, setClothingPolar] = useState(worker.clothing_polar_size || '');
  const [clothingPantsLetter, setClothingPantsLetter] = useState(worker.clothing_pants_size_letter || '');
  const [clothingPantsNumber, setClothingPantsNumber] = useState(worker.clothing_pants_size_number || '');
  const [clothingShoe, setClothingShoe] = useState(worker.clothing_shoe_size || '');
  const [clothingParka, setClothingParka] = useState(worker.clothing_parka_size || '');
  const [clothingOverall, setClothingOverall] = useState(worker.clothing_overall_size || '');

  // Previsión Social
  const [afp, setAfp] = useState(worker.afp || '');
  const [healthSystem, setHealthSystem] = useState(worker.health_system || '');
  const [isapre, setIsapre] = useState(worker.isapre || '');

  // Género, Estado Civil, Banco y Nacionalidad
  const [gender, setGender] = useState(worker.gender || '');
  const [maritalStatus, setMaritalStatus] = useState(worker.marital_status || '');
  const [bankAccountType, setBankAccountType] = useState(worker.bank_account_type || '');
  const [bankName, setBankName] = useState(worker.bank_name || '');
  const [bankAccountNumber, setBankAccountNumber] = useState(worker.bank_account_number || '');

  // Nationality handling
  const [nationalitySelect, setNationalitySelect] = useState(() => {
    const nat = (worker.nationality || 'CHILENA').toUpperCase();
    return ['CHILENA', 'ARGENTINA', 'BOLIVIANA', 'PERUANA', 'COLOMBIANA', 'VENEZOLANA'].includes(nat) ? nat : 'OTRA';
  });
  const [customNationality, setCustomNationality] = useState(() => {
    const nat = (worker.nationality || 'CHILENA').toUpperCase();
    return ['CHILENA', 'ARGENTINA', 'BOLIVIANA', 'PERUANA', 'COLOMBIANA', 'VENEZOLANA'].includes(nat) ? '' : nat;
  });

  // Automatically fill Account Number if bank account type is RUT
  React.useEffect(() => {
    if (bankAccountType === 'RUT' && worker.rut) {
      setBankName('BANCO ESTADO');
      const body = worker.rut.replace(/[^0-9kK]/g, '').slice(0, -1).replace(/\D/g, '');
      setBankAccountNumber(body);
    }
  }, [bankAccountType, worker.rut]);

  // Validations
  const emailValid = !emailDisplay || isValidEmail(emailDisplay);
  const phoneValid = !phoneDisplay || isValidChileanPhone(phoneDisplay);
  const emergencyPhoneValid = !emergencyPhone || isValidChileanPhone(emergencyPhone);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (!raw.replace(/\D/g, '')) { setPhoneDisplay(''); return; }
    setPhoneDisplay(formatChileanPhone(raw));
  };

  const handleEmergencyPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (!raw.replace(/\D/g, '')) { setEmergencyPhone(''); return; }
    setEmergencyPhone(formatChileanPhone(raw));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName || !lastNameFather || !birthDate || !emailDisplay || !phoneDisplay || !afp || !healthSystem || !gender || !maritalStatus || !bankAccountType || !bankName || !bankAccountNumber || !emergencyName || !emergencyPhone || !emergencyRelationship) {
      toast.error('Por favor, completa todos los campos requeridos (*).');
      return;
    }

    if (!emailValid) {
      setEmailTouched(true);
      toast.error('Por favor, ingresa un correo electrónico válido.');
      return;
    }

    if (!phoneValid) {
      setPhoneTouched(true);
      toast.error('Por favor, ingresa un número de teléfono móvil válido.');
      return;
    }

    if (!emergencyPhoneValid) {
      toast.error('Por favor, ingresa un teléfono de contacto de emergencia válido.');
      return;
    }

    if (healthSystem === 'ISAPRE' && !isapre) {
      toast.error('Por favor, especifica cuál es tu Isapre.');
      return;
    }

    // Determine final nationality string to submit
    const finalNationality = nationalitySelect === 'OTRA' ? customNationality : nationalitySelect;
    if (!finalNationality) {
      toast.error('Por favor, especifica tu nacionalidad.');
      return;
    }

    const payload = {
      first_name: firstName,
      last_name_father: lastNameFather,
      last_name_mother: lastNameMother,
      email: emailDisplay,
      phone: normalizePhone(phoneDisplay),
      birth_date: birthDate,
      gender,
      nationality: finalNationality,
      marital_status: maritalStatus,

      address_street: addressStreet,
      address_city: addressCity,
      address_region: addressRegion,
      address_comuna: addressComuna,

      emergency_contact_name: emergencyName,
      emergency_contact_relationship: emergencyRelationship,
      emergency_contact_phone: normalizePhone(emergencyPhone),

      afp,
      health_system: healthSystem,
      isapre,

      bank_account_type: bankAccountType,
      bank_name: bankName,
      bank_account_number: bankAccountNumber,

      // Uniform sizes (pre-filled as well)
      clothing_tshirt_size: clothingTshirt,
      clothing_polar_size: clothingPolar,
      clothing_pants_size_letter: clothingPantsLetter,
      clothing_pants_size_number: clothingPantsNumber,
      clothing_shoe_size: clothingShoe,
      clothing_parka_size: clothingParka,
      clothing_overall_size: clothingOverall,
    };

    startTransition(async () => {
      const res = await updatePersonnelFichaByToken(token, payload);
      if (res.success) {
        setIsSuccess(true);
        toast.success('¡Ficha actualizada correctamente!');
      } else {
        toast.error(res.error || 'Error al guardar los datos de la ficha.');
      }
    });
  };

  if (isSuccess) {
    return (
      <Card className="border-none shadow-2xl rounded-3xl bg-white dark:bg-slate-900 overflow-hidden">
        <CardContent className="p-8 text-center space-y-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-400">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-black uppercase tracking-tight text-slate-950 dark:text-slate-50">¡Actualización Exitosa!</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Muchas gracias. Tus datos personales han sido corroborados y guardados con éxito en el sistema. Puedes cerrar esta ventana.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-20">
      
      {/* 1. Datos Personales */}
      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <User className="h-5 w-5 text-orange-500" />
            Datos Personales
          </CardTitle>
          <CardDescription>Corrobora que tus nombres e información básica estén al día.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">Nombres *</Label>
              <Input 
                id="first_name" 
                value={firstName} 
                onChange={e => setFirstName(e.target.value)} 
                required
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="last_name_father">Apellido Paterno *</Label>
              <Input 
                id="last_name_father" 
                value={lastNameFather} 
                onChange={e => setLastNameFather(e.target.value)} 
                required
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="last_name_mother">Apellido Materno</Label>
              <Input 
                id="last_name_mother" 
                value={lastNameMother} 
                onChange={e => setLastNameMother(e.target.value)} 
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rut">RUT (Solo Lectura)</Label>
              <Input 
                id="rut" 
                value={worker.rut || ''} 
                disabled 
                className="h-11 rounded-xl bg-slate-100 dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-500 font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="birth_date">Fecha de Nacimiento *</Label>
              <DatePickerField 
                id="birth_date" 
                value={birthDate} 
                onChange={setBirthDate} 
                required
                minYear={1940}
                maxYear={2010}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Correo Electrónico *</Label>
              <div className="relative">
                <Input 
                  id="email" 
                  type="email"
                  value={emailDisplay} 
                  onChange={e => setEmailDisplay(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  required
                  placeholder="ejemplo@correo.com"
                  className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 pr-10"
                />
                {emailTouched && emailDisplay && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {emailValid ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Teléfono Celular *</Label>
              <div className="relative">
                <Input 
                  id="phone" 
                  value={phoneDisplay} 
                  onChange={handlePhoneChange}
                  onBlur={() => setPhoneTouched(true)}
                  required
                  placeholder="+56 9 XXXX XXXX"
                  className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 pr-10"
                />
                {phoneTouched && phoneDisplay && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {phoneValid ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">Formato: +56 9 XXXX XXXX</p>
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="gender">Género *</Label>
              <Select value={gender} onValueChange={(val) => setGender(val || '')} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar género" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MASCULINO">MASCULINO</SelectItem>
                  <SelectItem value="FEMENINO">FEMENINO</SelectItem>
                  <SelectItem value="OTRO">OTRO</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nationality_select">Nacionalidad *</Label>
              <Select 
                value={nationalitySelect} 
                onValueChange={(val) => {
                  setNationalitySelect(val || '');
                  if (val !== 'OTRA') {
                    setCustomNationality('');
                  }
                }} 
                required
              >
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar nacionalidad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHILENA">CHILENA</SelectItem>
                  <SelectItem value="ARGENTINA">ARGENTINA</SelectItem>
                  <SelectItem value="BOLIVIANA">BOLIVIANA</SelectItem>
                  <SelectItem value="PERUANA">PERUANA</SelectItem>
                  <SelectItem value="COLOMBIANA">COLOMBIANA</SelectItem>
                  <SelectItem value="VENEZOLANA">VENEZOLANA</SelectItem>
                  <SelectItem value="OTRA">OTRA</SelectItem>
                </SelectContent>
              </Select>
              {nationalitySelect === 'OTRA' && (
                <div className="mt-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Input
                    id="nationality_custom"
                    value={customNationality}
                    onChange={e => setCustomNationality(e.target.value.toUpperCase())}
                    placeholder="Especificar nacionalidad"
                    className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700"
                    required
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="marital_status">Estado Civil *</Label>
              <Select value={maritalStatus} onValueChange={(val) => setMaritalStatus(val || '')} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar estado civil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SOLTERO/A">SOLTERO/A</SelectItem>
                  <SelectItem value="CASADO/A">CASADO/A</SelectItem>
                  <SelectItem value="DIVORCIADO/A">DIVORCIADO/A</SelectItem>
                  <SelectItem value="VIUDO/A">VIUDO/A</SelectItem>
                  <SelectItem value="UNIÓN CIVIL">UNIÓN CIVIL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Dirección Habitual */}
      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Mail className="h-5 w-5 text-orange-500" />
            Dirección Habitual
          </CardTitle>
          <CardDescription>Tu domicilio actual para registros oficiales.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="address_street">Calle y Número *</Label>
            <Input 
              id="address_street" 
              value={addressStreet} 
              onChange={e => setAddressStreet(e.target.value)} 
              required
              className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700"
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="address_comuna">Comuna *</Label>
              <Input 
                id="address_comuna" 
                value={addressComuna} 
                onChange={e => setAddressComuna(e.target.value)} 
                required
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address_city">Ciudad *</Label>
              <Input 
                id="address_city" 
                value={addressCity} 
                onChange={e => setAddressCity(e.target.value)} 
                required
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address_region">Región *</Label>
              <Input 
                id="address_region" 
                value={addressRegion} 
                onChange={e => setAddressRegion(e.target.value)} 
                required
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Previsión y Salud */}
      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-orange-500" />
            Previsión y Salud
          </CardTitle>
          <CardDescription>AFP e Institución de Salud previsional.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div className="space-y-1.5">
              <Label htmlFor="afp">Institución AFP *</Label>
              <Select value={afp} onValueChange={(val) => setAfp(val || '')} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar AFP" />
                </SelectTrigger>
                <SelectContent>
                  {AFP_LIST.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="health_system">Sistema de Salud *</Label>
              <Select value={healthSystem} onValueChange={(val) => {
                setHealthSystem(val || '');
                if (val !== 'ISAPRE') setIsapre('');
              }} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar Fonasa / Isapre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FONASA">FONASA</SelectItem>
                  <SelectItem value="ISAPRE">ISAPRE</SelectItem>
                  <SelectItem value="NINGUNO">NINGUNO (PARTICULAR)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {healthSystem === 'ISAPRE' && (
              <div className="space-y-1.5 md:col-span-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <Label htmlFor="isapre">Nombre de Isapre *</Label>
                <Select value={isapre} onValueChange={(val) => setIsapre(val || '')} required>
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                    <SelectValue placeholder="Seleccionar Isapre" />
                  </SelectTrigger>
                  <SelectContent>
                    {ISAPRE_LIST.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

          </div>
        </CardContent>
      </Card>

      {/* 4. Datos Bancarios */}
      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-orange-500" />
            Datos de Pago (Cuenta Bancaria)
          </CardTitle>
          <CardDescription>Indica la cuenta bancaria para el depósito de tus remuneraciones.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <div className="space-y-1.5">
              <Label htmlFor="bank_account_type">Tipo de Cuenta *</Label>
              <Select value={bankAccountType} onValueChange={(val) => setBankAccountType(val || '')} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CORRIENTE">CORRIENTE</SelectItem>
                  <SelectItem value="VISTA">VISTA</SelectItem>
                  <SelectItem value="RUT">CUENTA RUT (BANCOESTADO)</SelectItem>
                  <SelectItem value="AHORRO">AHORRO</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bank_name">Banco *</Label>
              <Select 
                value={bankName} 
                onValueChange={(val) => setBankName(val || '')} 
                disabled={bankAccountType === 'RUT'}
                required
              >
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar Banco" />
                </SelectTrigger>
                <SelectContent>
                  {BANK_LIST.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bank_account_number">Número de Cuenta *</Label>
              <Input 
                id="bank_account_number" 
                value={bankAccountNumber} 
                onChange={e => setBankAccountNumber(e.target.value)} 
                disabled={bankAccountType === 'RUT'}
                required
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700"
              />
            </div>

          </div>
        </CardContent>
      </Card>

      {/* 5. Contacto de Emergencia */}
      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Phone className="h-5 w-5 text-orange-500" />
            Contacto de Emergencia
          </CardTitle>
          <CardDescription>A quién contactar en caso de una urgencia.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <div className="space-y-1.5">
              <Label htmlFor="emergency_name">Nombre Completo *</Label>
              <Input 
                id="emergency_name" 
                value={emergencyName} 
                onChange={e => setEmergencyName(e.target.value)} 
                required
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emergency_relationship">Parentesco / Relación *</Label>
              <Input 
                id="emergency_relationship" 
                value={emergencyRelationship} 
                onChange={e => setEmergencyRelationship(e.target.value)} 
                required
                placeholder="Ej: Cónyuge, Madre, Hermano"
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emergency_phone">Teléfono de Contacto *</Label>
              <Input 
                id="emergency_phone" 
                value={emergencyPhone} 
                onChange={handleEmergencyPhoneChange}
                required
                placeholder="+56 9 XXXX XXXX"
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700"
              />
            </div>

          </div>
        </CardContent>
      </Card>

      {/* 6. Tallas de Vestuario (Opcional, pero se pre-llena) */}
      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Shirt className="h-5 w-5 text-orange-500" />
            Tallas de Uniforme y EPP
          </CardTitle>
          <CardDescription>Opcional: Verifica tus tallas para entregas de ropa de trabajo.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          
          <div className="space-y-1.5">
            <Label htmlFor="tshirt_size">Talla Polera</Label>
            <Select value={clothingTshirt} onValueChange={setClothingTshirt}>
              <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {CLOTHING_SIZES_LETTER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="polar_size">Talla Polar</Label>
            <Select value={clothingPolar} onValueChange={setClothingPolar}>
              <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {CLOTHING_SIZES_LETTER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pants_size_letter">Talla Pantalón (Letra)</Label>
            <Select value={clothingPantsLetter} onValueChange={setClothingPantsLetter}>
              <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {CLOTHING_SIZES_LETTER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pants_size_number">Talla Pantalón (Número)</Label>
            <Select value={clothingPantsNumber} onValueChange={setClothingPantsNumber}>
              <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {PANTS_SIZES_NUMBER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shoe_size">Calzado / Zapato de Seguridad</Label>
            <Select value={clothingShoe} onValueChange={setClothingShoe}>
              <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {SHOE_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="parka_size">Talla Parka</Label>
            <Select value={clothingParka} onValueChange={setClothingParka}>
              <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {CLOTHING_SIZES_LETTER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="overall_size">Talla Overol</Label>
            <Select value={clothingOverall} onValueChange={setClothingOverall}>
              <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {CLOTHING_SIZES_LETTER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

        </CardContent>
      </Card>

      {/* Botón de Enviar */}
      <Button 
        type="submit" 
        disabled={isPending}
        className="w-full h-12 rounded-2xl bg-orange-500 hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-700 text-white font-bold text-sm tracking-wide shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 transition-all flex items-center justify-center gap-2"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Guardando Cambios...
          </>
        ) : (
          'Corroborar y Guardar Ficha'
        )}
      </Button>

    </form>
  );
}
