'use client';

import React, { useState, useTransition, useEffect } from 'react';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle2, XCircle, Phone, Mail, User, ShieldAlert, Award, Shirt, HelpCircle, ShieldCheck, CreditCard, FileDown, CalendarDays, FileText, AlertCircle } from 'lucide-react';


import { toast } from 'sonner';

import DocumentCapture from '@/components/onboarding/document-capture';
import { compileFrontBackPdf } from '@/lib/documents/pdf-compiler';
import { labelSelfie } from '@/lib/documents/selfie-labeler';

interface OnboardingFormProps {
  token: string;
  companyName: string;
}

const CLOTHING_SIZES_LETTER = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const PANTS_SIZES_NUMBER = ['36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58'];
const SHOE_SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'];
const DRIVER_LICENSES = ['B', 'C', 'D', 'A1', 'A2', 'A3', 'A4', 'A5'];

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

const METROPOLITANA_PROVINCES = {
  'SANTIAGO': [
    'CERRILLOS', 'CERRO NAVIA', 'CONCHALÍ', 'EL BOSQUE', 'ESTACIÓN CENTRAL',
    'HUECHURABA', 'INDEPENDENCIA', 'LA CISTERNA', 'LA FLORIDA', 'LA GRANJA',
    'LA PINTANA', 'LA REINA', 'LAS CONDES', 'LO BARNECHEA', 'LO ESPEJO',
    'LO PRADO', 'MACUL', 'MAIPÚ', 'ÑUÑOA', 'PEDRO AGUIRRE CERDA',
    'PEÑALOLÉN', 'PROVIDENCIA', 'PUDAHUEL', 'QUILICURA', 'QUINTA NORMAL',
    'RECOLETA', 'RENCA', 'SAN JOAQUÍN', 'SAN MIGUEL', 'SAN RAMÓN',
    'SANTIAGO', 'VITACURA'
  ],
  'CHACABUCO': ['COLINA', 'LAMPA', 'TIL TIL'],
  'CORDILLERA': ['PIRQUE', 'PUENTE ALTO', 'SAN JOSÉ DE MAIPO'],
  'MAIPO': ['BUIN', 'CALERA DE TANGO', 'PAINE', 'SAN BERNARDO'],
  'MELIPILLA': ['ALHUÉ', 'CURACAVÍ', 'MARÍA PINTO', 'MELIPILLA', 'SAN PEDRO'],
  'TALAGANTE': ['EL MONTE', 'ISLA DE MAIPO', 'PADRE HURTADO', 'PEÑAFLOR', 'TALAGANTE']
} as const;




// Chilean RUT formatter
function formatRut(value: string): string {
  const clean = value.replace(/[^0-9kK]/g, '');
  if (clean.length <= 1) return clean;
  
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1).toUpperCase();
  
  let formatted = '';
  for (let i = body.length - 1, j = 0; i >= 0; i--, j++) {
    if (j > 0 && j % 3 === 0) formatted = '.' + formatted;
    formatted = body[i] + formatted;
  }
  return formatted + '-' + dv;
}

// Phone formatting display (+56 9 XXXX XXXX)
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

export default function OnboardingForm({ token, companyName }: OnboardingFormProps) {
  const [isPending, startTransition] = useTransition();
  const [isSuccess, setIsSuccess] = useState(false);

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastNameFather, setLastNameFather] = useState('');
  const [lastNameMother, setLastNameMother] = useState('');
  const [rut, setRut] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [emailDisplay, setEmailDisplay] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  
  const [phoneDisplay, setPhoneDisplay] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);

  // Address
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressRegion, setAddressRegion] = useState('METROPOLITANA');
  const [addressComuna, setAddressComuna] = useState('');


  // Emergency contact
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  // Tallas de ropa
  const [clothingTshirt, setClothingTshirt] = useState('');
  const [clothingPolar, setClothingPolar] = useState('');
  const [clothingPantsLetter, setClothingPantsLetter] = useState('');
  const [clothingPantsNumber, setClothingPantsNumber] = useState('');
  const [clothingShoe, setClothingShoe] = useState('');
  const [clothingParka, setClothingParka] = useState('');
  const [clothingOverall, setClothingOverall] = useState('');

  // Licencias
  const [selectedLicenses, setSelectedLicenses] = useState<string[]>([]);

  // Previsión Social
  const [afp, setAfp] = useState('');
  const [healthSystem, setHealthSystem] = useState('');
  const [isapre, setIsapre] = useState('');

  // Género y Datos Bancarios
  const [gender, setGender] = useState('');
  const [bankAccountType, setBankAccountType] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [nationality, setNationality] = useState('CHILENA');
  const [nationalitySelect, setNationalitySelect] = useState('CHILENA');
  const [customNationality, setCustomNationality] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');

  // Consentimiento de datos
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTermsDetail, setShowTermsDetail] = useState(false);

  // Documentos obligatorios
  const [cedulaExpiration, setCedulaExpiration] = useState('');
  const [cedulaFront, setCedulaFront] = useState<string | null>(null);
  const [cedulaBack, setCedulaBack] = useState<string | null>(null);

  const [licenciaExpiration, setLicenciaExpiration] = useState('');
  const [licenciaFront, setLicenciaFront] = useState<string | null>(null);
  const [licenciaBack, setLicenciaBack] = useState<string | null>(null);

  const [selfie, setSelfie] = useState<string | null>(null);

  const [antecedentesPdf, setAntecedentesPdf] = useState<string | null>(null);
  const [antecedentesIssueDate, setAntecedentesIssueDate] = useState('');

  const [hojaVidaPdf, setHojaVidaPdf] = useState<string | null>(null);
  const [hojaVidaIssueDate, setHojaVidaIssueDate] = useState('');

  // Auxiliares de validación de fechas
  const isDateOlderThanDays = (dateStr: string, maxDays: number): boolean => {
    if (!dateStr) return false;
    const issueDate = new Date(dateStr);
    const today = new Date();
    issueDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - issueDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > maxDays;
  };

  const isFutureDate = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const targetDate = new Date(dateStr);
    const today = new Date();
    targetDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return targetDate > today;
  };


  useEffect(() => {
    if (bankAccountType === 'RUT') {
      setBankName('BANCO ESTADO');
      const body = rut.replace(/[^0-9kK]/g, '').slice(0, -1).replace(/\D/g, '');
      setBankAccountNumber(body);
    }
  }, [bankAccountType, rut]);



  // Validation results
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

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setRut(formatRut(raw));
  };

  const handleLicenseToggle = (license: string) => {
    setSelectedLicenses(prev => 
      prev.includes(license) 
        ? prev.filter(l => l !== license) 
        : [...prev, license]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!acceptedTerms) {
      toast.error('Debes leer y aceptar la política de tratamiento de datos personales para continuar.');
      return;
    }

    if (!firstName || !lastNameFather || !lastNameMother || !rut || !birthDate || !emailDisplay || !phoneDisplay || !afp || !healthSystem || !gender || !bankAccountType || !bankName || !bankAccountNumber) {
      toast.error('Por favor, completa todos los campos requeridos');
      return;
    }

    if (healthSystem === 'ISAPRE' && !isapre) {
      toast.error('Por favor, selecciona tu Isapre');
      return;
    }

    if (!isValidEmail(emailDisplay)) {
      setEmailTouched(true);
      toast.error('El correo electrónico no es válido');
      return;
    }

    if (!isValidChileanPhone(phoneDisplay)) {
      setPhoneTouched(true);
      toast.error('El número de teléfono no es válido');
      return;
    }

    if (emergencyPhone && !isValidChileanPhone(emergencyPhone)) {
      toast.error('El teléfono de contacto de emergencia no es válido');
      return;
    }

    // --- Validaciones de Documentos ---
    if (!cedulaExpiration) {
      toast.error('Por favor, ingresa la fecha de vencimiento de tu cédula.');
      return;
    }
    if (!cedulaFront || !cedulaBack) {
      toast.error('Por favor, captura o sube el frontis y reverso de tu cédula de identidad.');
      return;
    }

    const hasDriverLicense = selectedLicenses.length > 0;
    if (hasDriverLicense) {
      if (!licenciaExpiration) {
        toast.error('Por favor, ingresa la fecha de vencimiento de tu licencia de conducir.');
        return;
      }
      if (!licenciaFront || !licenciaBack) {
        toast.error('Por favor, captura o sube el frontis y reverso de tu licencia de conducir.');
        return;
      }
    }

    if (!selfie) {
      toast.error('Por favor, tómate una foto de perfil (selfie) con fondo blanco.');
      return;
    }

    if (!antecedentesPdf) {
      toast.error('Por favor, sube el Certificado de Antecedentes en PDF.');
      return;
    }
    if (!antecedentesIssueDate) {
      toast.error('Por favor, ingresa la fecha de emisión de tu certificado de antecedentes.');
      return;
    }
    if (isFutureDate(antecedentesIssueDate)) {
      toast.error('La fecha de emisión del certificado de antecedentes no puede estar en el futuro.');
      return;
    }
    if (isDateOlderThanDays(antecedentesIssueDate, 25)) {
      toast.error('El certificado de antecedentes no puede tener más de 25 días desde su fecha de emisión.');
      return;
    }

    if (hasDriverLicense) {
      if (!hojaVidaPdf) {
        toast.error('Por favor, sube la Hoja de Vida del Conductor en PDF.');
        return;
      }
      if (!hojaVidaIssueDate) {
        toast.error('Por favor, ingresa la fecha de emisión de la hoja de vida del conductor.');
        return;
      }
      if (isFutureDate(hojaVidaIssueDate)) {
        toast.error('La fecha de emisión de la hoja de vida del conductor no puede estar en el futuro.');
        return;
      }
      if (isDateOlderThanDays(hojaVidaIssueDate, 25)) {
        toast.error('La hoja de vida del conductor no puede tener más de 25 días desde su fecha de emisión.');
        return;
      }
    }

    startTransition(async () => {
      try {
        toast.info('Procesando imágenes y compilando documentos. Por favor, espera...');
        
        // Generar el PDF de la cédula
        const compiledCedula = await compileFrontBackPdf(cedulaFront, cedulaBack);

        // Generar el PDF de la licencia (si aplica)
        let compiledLicencia = null;
        if (hasDriverLicense && licenciaFront && licenciaBack) {
          compiledLicencia = await compileFrontBackPdf(licenciaFront, licenciaBack);
        }

        // Generar selfie etiquetada (con banner negro e información)
        const labeledSelfieData = await labelSelfie(
          selfie,
          `${firstName} ${lastNameFather} ${lastNameMother}`,
          rut
        );

        const response = await fetch('/api/onboarding', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token,
            personalData: {
              first_name: firstName,
              last_name_father: lastNameFather,
              last_name_mother: lastNameMother,
              rut,
              birth_date: birthDate,
              email: emailDisplay,
              phone: normalizePhone(phoneDisplay),
              address_street: addressStreet,
              address_city: addressCity,
              address_region: addressRegion,
              address_comuna: addressComuna,
              
              emergency_contact_name: emergencyName,
              emergency_contact_relationship: emergencyRelationship,
              emergency_contact_phone: normalizePhone(emergencyPhone),

              clothing_tshirt_size: clothingTshirt,
              clothing_polar_size: clothingPolar,
              clothing_pants_size_letter: clothingPantsLetter,
              clothing_pants_size_number: clothingPantsNumber,
              clothing_shoe_size: clothingShoe,
              clothing_parka_size: clothingParka,
              clothing_overall_size: clothingOverall,

              driver_licenses: selectedLicenses,

              // Social Security
              afp,
              health_system: healthSystem,
              isapre: healthSystem === 'ISAPRE' ? isapre : null,

              // Gender & Bank Details
              gender,
              bank_account_type: bankAccountType,
              bank_name: bankName,
              bank_account_number: bankAccountNumber,

              // Contract fields
              nationality,
              marital_status: maritalStatus,
            },
            documents: {
              cedula_pdf_base64: compiledCedula,
              cedula_expiration_date: cedulaExpiration,
              
              licencia_pdf_base64: compiledLicencia,
              licencia_expiration_date: hasDriverLicense ? licenciaExpiration : null,
              
              selfie_original_base64: selfie,
              selfie_labeled_base64: labeledSelfieData,
              
              antecedentes_pdf_base64: antecedentesPdf,
              antecedentes_issue_date: antecedentesIssueDate,
              
              hoja_vida_pdf_base64: hasDriverLicense ? hojaVidaPdf : null,
              hoja_vida_issue_date: hasDriverLicense ? hojaVidaIssueDate : null,
            }
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          toast.error(result.error || 'Ocurrió un error al enviar la ficha');
        } else {
          toast.success('Ficha enviada con éxito');
          setIsSuccess(true);
        }
      } catch (err: any) {
        console.error(err);
        toast.error('Error al procesar o enviar los documentos. Reintenta.');
      }
    });
  };

  if (isSuccess) {
    return (
      <Card className="border-none shadow-2xl rounded-3xl overflow-hidden bg-white dark:bg-slate-900">
        <CardContent className="p-8 text-center space-y-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-950 dark:text-slate-50">¡Ficha Enviada!</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
              Tus datos han sido registrados en la plataforma de <strong>{companyName}</strong>. Su incorporación está pendiente de la aprobación del administrador.
            </p>
          </div>
          <div className="pt-4">
            <p className="text-xs text-slate-400">Ya puedes cerrar esta pestaña.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 1. Información Personal */}
      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <User className="h-5 w-5 text-orange-500" />
            Información Personal
          </CardTitle>
          <CardDescription>Completa tus datos de identificación básica.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">Nombres *</Label>
              <Input 
                id="first_name" 
                value={firstName} 
                onChange={e => setFirstName(e.target.value)} 
                required 
                placeholder="JUAN ANTONIO" 
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name_father">Apellido Paterno *</Label>
              <Input 
                id="last_name_father" 
                value={lastNameFather} 
                onChange={e => setLastNameFather(e.target.value)} 
                required 
                placeholder="PÉREZ" 
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name_mother">Apellido Materno *</Label>
              <Input 
                id="last_name_mother" 
                value={lastNameMother} 
                onChange={e => setLastNameMother(e.target.value)} 
                required
                placeholder="GARCÍA" 
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rut">RUT *</Label>
              <Input 
                id="rut" 
                value={rut} 
                onChange={handleRutChange} 
                required 
                placeholder="12.345.678-9" 
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="birth_date">Fecha de Nacimiento *</Label>
              <Input 
                id="birth_date" 
                type="date" 
                value={birthDate} 
                onChange={e => setBirthDate(e.target.value)} 
                required 
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500"
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
                  placeholder="juan.perez@empresa.com" 
                  className={`h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500 pr-10 ${
                    emailTouched && emailDisplay ? (emailValid ? 'border-emerald-500' : 'border-red-500') : ''
                  }`}
                />
                {emailTouched && emailDisplay && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {emailValid ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Teléfono (WhatsApp) *</Label>
              <div className="relative">
                <Input 
                  id="phone" 
                  value={phoneDisplay} 
                  onChange={handlePhoneChange} 
                  onBlur={() => setPhoneTouched(true)}
                  required
                  placeholder="+56 9 1234 5678" 
                  className={`h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500 pr-10 ${
                    phoneTouched && phoneDisplay ? (phoneValid ? 'border-emerald-500' : 'border-red-500') : ''
                  }`}
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
              <Label htmlFor="nationality">Nacionalidad *</Label>
              <Select 
                value={nationalitySelect} 
                onValueChange={(val) => {
                  setNationalitySelect(val || '');
                  if (val === 'OTRA') {
                    setNationality(customNationality);
                  } else {
                    setNationality(val || '');
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
                    onChange={e => {
                      const val = e.target.value.toUpperCase();
                      setCustomNationality(val);
                      setNationality(val);
                    }}
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


      {/* 2. Dirección */}
      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Mail className="h-5 w-5 text-orange-500" />
            Dirección Habitual
          </CardTitle>
          <CardDescription>Especifica tu lugar de residencia actual.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="address_street">Calle y Número *</Label>
            <Textarea 
              id="address_street" 
              value={addressStreet} 
              onChange={e => setAddressStreet(e.target.value)} 
              required
              placeholder="AV. PROVIDENCIA 1234 DEPT. 45" 
              rows={2}
              className="rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="address_city">Ciudad / Provincia *</Label>
              <Select value={addressCity} onValueChange={(val) => { setAddressCity(val || ''); setAddressComuna(''); }} required>
                <SelectTrigger id="address_city" className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="SELECCIONAR PROVINCIA" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(METROPOLITANA_PROVINCES).map(province => (
                    <SelectItem key={province} value={province}>{province}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="address_comuna">Comuna *</Label>
              <Select 
                value={addressComuna} 
                onValueChange={(val) => setAddressComuna(val || '')} 
                required
                disabled={!addressCity}
              >
                <SelectTrigger id="address_comuna" className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder={addressCity ? "SELECCIONAR COMUNA" : "SELECCIONE PROVINCIA PRIMERO"} />
                </SelectTrigger>
                <SelectContent>
                  {addressCity && METROPOLITANA_PROVINCES[addressCity as keyof typeof METROPOLITANA_PROVINCES]?.map(comuna => (
                    <SelectItem key={comuna} value={comuna}>{comuna}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="address_region">Región *</Label>
              <Input 
                id="address_region" 
                value={addressRegion} 
                readOnly
                disabled
                className="h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 text-slate-500 font-semibold cursor-not-allowed"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Previsión Social */}
      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-orange-500" />
            Previsión Social (AFP y Salud)
          </CardTitle>
          <CardDescription>Indica tus instituciones de previsión social y salud.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* AFP */}
            <div className="space-y-1.5">
              <Label htmlFor="afp">AFP *</Label>
              <Select value={afp} onValueChange={(val) => setAfp(val || '')} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar AFP" />
                </SelectTrigger>
                <SelectContent>
                  {AFP_LIST.map(item => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sistema de Salud */}
            <div className="space-y-1.5">
              <Label htmlFor="health_system">Sistema de Salud *</Label>
              <Select value={healthSystem} onValueChange={(val) => {
                setHealthSystem(val || '');
                if (val !== 'ISAPRE') setIsapre('');
              }} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar Sistema" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FONASA">FONASA</SelectItem>
                  <SelectItem value="ISAPRE">ISAPRE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Isapre Dropdown */}
            {healthSystem === 'ISAPRE' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="isapre">Isapre *</Label>
                <Select value={isapre} onValueChange={(val) => setIsapre(val || '')} required>
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                    <SelectValue placeholder="Seleccionar Isapre" />
                  </SelectTrigger>
                  <SelectContent>
                    {ISAPRE_LIST.map(item => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Datos Bancarios */}
      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-orange-500" />
            Datos Bancarios
          </CardTitle>
          <CardDescription>Indica la cuenta donde deseas recibir el pago de tus remuneraciones.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Tipo de Cuenta */}
            <div className="space-y-1.5">
              <Label htmlFor="bank_account_type">Tipo de Cuenta *</Label>
              <Select value={bankAccountType} onValueChange={(val) => setBankAccountType(val || '')} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VISTA">VISTA</SelectItem>
                  <SelectItem value="CORRIENTE">CORRIENTE</SelectItem>
                  <SelectItem value="RUT">RUT (CUENTA RUT)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Banco */}
            <div className="space-y-1.5">
              <Label htmlFor="bank_name">Banco *</Label>
              <Select 
                value={bankName} 
                onValueChange={(val) => setBankName(val || '')} 
                required
                disabled={bankAccountType === 'RUT'}
              >
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar banco" />
                </SelectTrigger>
                <SelectContent>
                  {BANK_LIST.map(item => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Número de Cuenta */}
            <div className="space-y-1.5">
              <Label htmlFor="bank_account_number">Número de Cuenta *</Label>
              <Input 
                id="bank_account_number"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={bankAccountNumber} 
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  setBankAccountNumber(val);
                }} 
                required
                readOnly={bankAccountType === 'RUT'}
                placeholder="123456789"
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500"
              />
              {bankAccountType === 'RUT' && (
                <p className="text-[10px] text-blue-600 font-medium">Autocompletado con tu RUT sin puntos ni guión.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Contacto de Emergencia */}


      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-orange-500" />
            Contacto de Emergencia
          </CardTitle>
          <CardDescription>¿A quién avisar en caso de accidente o acontecimiento?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emergency_name">Nombre Completo *</Label>
              <Input 
                id="emergency_name" 
                value={emergencyName} 
                onChange={e => setEmergencyName(e.target.value)} 
                required
                placeholder="MARÍA GÓMEZ" 
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emergency_relationship">Parentesco *</Label>
              <Input 
                id="emergency_relationship" 
                value={emergencyRelationship} 
                onChange={e => setEmergencyRelationship(e.target.value)} 
                required
                placeholder="CÓNYUGE / MADRE / HERMANO" 
                className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="emergency_phone">Teléfono de Contacto *</Label>
              <div className="relative">
                <Input 
                  id="emergency_phone" 
                  value={emergencyPhone} 
                  onChange={handleEmergencyPhoneChange} 
                  required
                  placeholder="+56 9 8765 4321" 
                  className={`h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500 pr-10 ${
                    emergencyPhone ? (emergencyPhoneValid ? 'border-emerald-500' : 'border-red-500') : ''
                  }`}
                />
                {emergencyPhone && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {emergencyPhoneValid ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">Formato: +56 9 XXXX XXXX</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Tallas de Ropa */}
      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Shirt className="h-5 w-5 text-orange-500" />
            Tallas de Ropa y Calzado
          </CardTitle>
          <CardDescription>Selecciona tus tallas para la asignación de uniforme corporativo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Polera */}
            <div className="space-y-1.5">
              <Label htmlFor="clothing_tshirt">Talla de Polera *</Label>
              <Select value={clothingTshirt} onValueChange={(val) => setClothingTshirt(val || '')} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar talla" />
                </SelectTrigger>
                <SelectContent>
                  {CLOTHING_SIZES_LETTER.map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Polar */}
            <div className="space-y-1.5">
              <Label htmlFor="clothing_polar">Talla de Polar *</Label>
              <Select value={clothingPolar} onValueChange={(val) => setClothingPolar(val || '')} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar talla" />
                </SelectTrigger>
                <SelectContent>
                  {CLOTHING_SIZES_LETTER.map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Pantalon Letra */}
            <div className="space-y-1.5">
              <Label htmlFor="clothing_pants_letter">Talla de Pantalón (Letra) *</Label>
              <Select value={clothingPantsLetter} onValueChange={(val) => setClothingPantsLetter(val || '')} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar talla" />
                </SelectTrigger>
                <SelectContent>
                  {CLOTHING_SIZES_LETTER.map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Pantalon Numero */}
            <div className="space-y-1.5">
              <Label htmlFor="clothing_pants_number">Talla de Pantalón (Número) *</Label>
              <Select value={clothingPantsNumber} onValueChange={(val) => setClothingPantsNumber(val || '')} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar talla" />
                </SelectTrigger>
                <SelectContent>
                  {PANTS_SIZES_NUMBER.map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Zapatos */}
            <div className="space-y-1.5">
              <Label htmlFor="clothing_shoe">Talla de Zapatos *</Label>
              <Select value={clothingShoe} onValueChange={(val) => setClothingShoe(val || '')} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar talla" />
                </SelectTrigger>
                <SelectContent>
                  {SHOE_SIZES.map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Parka */}
            <div className="space-y-1.5">
              <Label htmlFor="clothing_parka">Talla de Parka *</Label>
              <Select value={clothingParka} onValueChange={(val) => setClothingParka(val || '')} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar talla" />
                </SelectTrigger>
                <SelectContent>
                  {CLOTHING_SIZES_LETTER.map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Jardinera Térmica */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="clothing_overall">Talla de Jardinera Térmica *</Label>
              <Select value={clothingOverall} onValueChange={(val) => setClothingOverall(val || '')} required>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700">
                  <SelectValue placeholder="Seleccionar talla" />
                </SelectTrigger>
                <SelectContent>
                  {CLOTHING_SIZES_LETTER.map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* 5. Licencias de Conducir */}
      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Award className="h-5 w-5 text-orange-500" />
            Licencias de Conducir (Opcional)
          </CardTitle>
          <CardDescription>Selecciona las clases de licencias de conducir vigentes que posees.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {DRIVER_LICENSES.map(license => (
              <div key={license} className="flex items-center space-x-2 p-2 rounded-lg bg-slate-50/80 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                <Checkbox 
                  id={`lic-${license}`} 
                  checked={selectedLicenses.includes(license)}
                  onCheckedChange={() => handleLicenseToggle(license)}
                  className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                />
                <Label htmlFor={`lic-${license}`} className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer w-full py-1">
                  Clase {license}
                </Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 6. Documentación Obligatoria */}
      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText className="h-5 w-5 text-orange-500" />
            Documentación Obligatoria
          </CardTitle>
          <CardDescription>
            Sube o captura los documentos e imágenes requeridos para tu ingreso.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Cédula de Identidad */}
          <div className="space-y-4 p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950/40 text-xs font-bold text-orange-600">1</span>
              <h3 className="text-sm font-bold uppercase tracking-wider">Cédula de Identidad *</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cedula_exp">Fecha de Vencimiento *</Label>
                <Input
                  id="cedula_exp"
                  type="date"
                  value={cedulaExpiration}
                  onChange={(e) => setCedulaExpiration(e.target.value)}
                  required
                  className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <DocumentCapture
                id="cedula_front"
                label="Parte Delantera *"
                description="Foto frontal de la cédula."
                type="card"
                value={cedulaFront}
                onChange={setCedulaFront}
              />
              <DocumentCapture
                id="cedula_back"
                label="Parte Trasera *"
                description="Foto trasera de la cédula."
                type="card"
                value={cedulaBack}
                onChange={setCedulaBack}
              />
            </div>
          </div>

          {/* Licencia de Conducir (si aplica) */}
          {selectedLicenses.length > 0 && (
            <div className="space-y-4 p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950/40 text-xs font-bold text-orange-600">2</span>
                <h3 className="text-sm font-bold uppercase tracking-wider">Licencia de Conducir (Clase {selectedLicenses.join(', ')}) *</h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="lic_exp">Fecha de Vencimiento *</Label>
                  <Input
                    id="lic_exp"
                    type="date"
                    value={licenciaExpiration}
                    onChange={(e) => setLicenciaExpiration(e.target.value)}
                    required
                    className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <DocumentCapture
                  id="lic_front"
                  label="Parte Delantera *"
                  description="Foto frontal de la licencia."
                  type="card"
                  value={licenciaFront}
                  onChange={setLicenciaFront}
                />
                <DocumentCapture
                  id="lic_back"
                  label="Parte Trasera *"
                  description="Foto trasera de la licencia."
                  type="card"
                  value={licenciaBack}
                  onChange={setLicenciaBack}
                />
              </div>
            </div>
          )}

          {/* Fotografía de Perfil (Selfie) */}
          <div className="space-y-4 p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950/40 text-xs font-bold text-orange-600">
                {selectedLicenses.length > 0 ? '3' : '2'}
              </span>
              <h3 className="text-sm font-bold uppercase tracking-wider">Fotografía de Perfil (Selfie) *</h3>
            </div>
            
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-3 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-normal">
                <strong>Requisito Importante:</strong> La foto debe ser una selfie tomada de frente, con el rostro completamente visible y despejado, utilizando obligatoriamente un <strong>fondo blanco</strong>.
              </p>
            </div>

            <DocumentCapture
              id="selfie_pic"
              label="Capturar Selfie *"
              description="Sácate una foto sobre fondo blanco."
              type="selfie"
              value={selfie}
              onChange={setSelfie}
            />
          </div>

          {/* Certificado de Antecedentes */}
          <div className="space-y-4 p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950/40 text-xs font-bold text-orange-600">
                {selectedLicenses.length > 0 ? '4' : '3'}
              </span>
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Certificado de Antecedentes <strong className="font-extrabold text-orange-600 dark:text-orange-400">Para Fines Especiales</strong> *
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="antecedentes_date">Fecha de Emisión *</Label>
                <Input
                  id="antecedentes_date"
                  type="date"
                  value={antecedentesIssueDate}
                  onChange={(e) => setAntecedentesIssueDate(e.target.value)}
                  required
                  className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500"
                />
                {antecedentesIssueDate && isDateOlderThanDays(antecedentesIssueDate, 25) && (
                  <p className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                    <XCircle className="h-3 w-3" /> Certificado emitido hace más de 25 días. No es válido.
                  </p>
                )}
              </div>
            </div>

            <DocumentCapture
              id="antecedentes_pdf"
              label="Certificado en formato PDF *"
              description="Sube el archivo PDF oficial del Registro Civil."
              type="pdf"
              value={antecedentesPdf}
              onChange={setAntecedentesPdf}
            />
          </div>

          {/* Hoja de Vida del Conductor (si aplica) */}
          {selectedLicenses.length > 0 && (
            <div className="space-y-4 p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950/40 text-xs font-bold text-orange-600">5</span>
                <h3 className="text-sm font-bold uppercase tracking-wider">Hoja de Vida del Conductor *</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="hoja_vida_date">Fecha de Emisión *</Label>
                  <Input
                    id="hoja_vida_date"
                    type="date"
                    value={hojaVidaIssueDate}
                    onChange={(e) => setHojaVidaIssueDate(e.target.value)}
                    required
                    className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 focus:ring-orange-500"
                  />
                  {hojaVidaIssueDate && isDateOlderThanDays(hojaVidaIssueDate, 25) && (
                    <p className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> Certificado emitido hace más de 25 días. No es válido.
                    </p>
                  )}
                </div>
              </div>

              <DocumentCapture
                id="hoja_vida_pdf"
                label="Hoja de Vida en formato PDF *"
                description="Sube el archivo PDF oficial del Registro Civil."
                type="pdf"
                value={hojaVidaPdf}
                onChange={setHojaVidaPdf}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consentimiento y Términos */}
      <Card className="border-none shadow-xl rounded-3xl bg-white dark:bg-slate-900">

        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox 
              id="accept_terms" 
              checked={acceptedTerms}
              onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <label 
                htmlFor="accept_terms" 
                className="text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer select-none"
              >
                He leído y acepto la política de tratamiento de datos personales *
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Debes leer y aceptar esta política para poder enviar la ficha.{' '}
                <button 
                  type="button" 
                  onClick={() => setShowTermsDetail(!showTermsDetail)}
                  className="text-orange-600 hover:text-orange-700 font-bold underline focus:outline-none"
                >
                  {showTermsDetail ? 'Ver menos' : 'Ver política completa'}
                </button>
              </p>
            </div>
          </div>

          {showTermsDetail && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 leading-relaxed transition-all duration-200">
              Los datos recolectados en esta ficha serán tratados exclusivamente para la gestión de su incorporación a la empresa, la confección y ejecución de su contrato de trabajo, el pago de remuneraciones, la gestión de beneficios legales y convencionales, la seguridad en el lugar de trabajo y el cumplimiento de las obligaciones legales, previsionales, tributarias y laborales vigentes en Chile.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Button */}
      <Button 
        type="submit" 
        disabled={isPending || !acceptedTerms}
        className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-2xl font-black uppercase tracking-wider text-xs shadow-lg shadow-orange-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 border-none"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-5 animate-spin" />
            Enviando Ficha...
          </>
        ) : (
          'Enviar Ficha de Ingreso'
        )}
      </Button>

    </form>
  );
}
