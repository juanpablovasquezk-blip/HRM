'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateWorkerProfile } from '../../actions';
import { toast } from 'sonner';
import { User, Phone, MapPin, Building, Activity, CreditCard, Shirt, AlertCircle, Save, X, Edit2, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const AFP_LIST = ['CAPITAL', 'CUPRUM', 'HABITAT', 'MODELO', 'PLANVITAL', 'PROVIDA', 'UNO'];
const ISAPRE_LIST = ['BANMÉDICA', 'COLMENA', 'CONSALUD', 'CRUZBLANCA', 'NUEVA MASVIDA', 'VIDA TRES', 'ESENCIAL'];
const BANK_LIST = ['BANCO ESTADO', 'BANCO DE CHILE', 'BANCO SANTANDER', 'BANCO BCI', 'BANCO ITAÚ', 'BANCO SCOTIABANK', 'BANCO BICE', 'BANCO SECURITY', 'BANCO CONSORCIO', 'BANCO INTERNACIONAL', 'BANCO FALABELLA', 'BANCO RIPLEY', 'PREPAGO LOS HÉROES', 'PREPAGO TENPO', 'PREPAGO MACH'];
const CLOTHING_SIZES_LETTER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const PANTS_SIZES_NUMBER = ['36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60'];
const SHOE_SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'];

export default function ProfileClient({ profile }: { profile: any }) {
  const router = useRouter();
  
  const isFichaIncompleta = (person: any) => {
    return !person.afp || !person.health_system || !person.bank_account_number || 
      !person.emergency_contact_phone || !person.gender || !person.marital_status || !person.phone;
  };

  const getCompletionPercentage = () => {
    const requiredFields = ['afp', 'health_system', 'bank_account_number', 'emergency_contact_phone', 'gender', 'marital_status', 'phone'];
    const filledFields = requiredFields.filter(field => !!profile[field]);
    return Math.round((filledFields.length / requiredFields.length) * 100);
  };

  const incompleta = isFichaIncompleta(profile);
  const completionPercentage = getCompletionPercentage();

  const [editSection, setEditSection] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({
    ...profile,
    address_street: profile.address?.street || '',
    address_city: profile.address?.city || '',
    address_comuna: profile.address?.comuna || '',
    address_region: profile.address?.region || '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const val = name === 'email' ? value : value.toUpperCase();
    setFormData((prev: any) => ({ ...prev, [name]: val }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (section: string) => {
    setIsSubmitting(true);
    const result = await updateWorkerProfile(formData);
    setIsSubmitting(false);

    if (result.success) {
      toast.success('Ficha actualizada correctamente');
      setEditSection(null);
      router.refresh();
    } else {
      toast.error(result.error || 'Error al actualizar');
    }
  };

  const renderField = (label: string, value: string | null | undefined, isEditing: boolean, inputName: string, type: 'text' | 'select' = 'text', options: string[] = []) => {
    if (isEditing) {
      if (type === 'select') {
        return (
          <div className="space-y-1">
            <Label className="text-xs text-slate-500 font-semibold">{label}</Label>
            <Select value={formData[inputName] || ''} onValueChange={(val) => handleSelectChange(inputName, val)}>
              <SelectTrigger className="w-full bg-slate-50 border-slate-200">
                <SelectValue placeholder={`Seleccionar ${label}`} />
              </SelectTrigger>
              <SelectContent>
                {options.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      }
      return (
        <div className="space-y-1">
          <Label className="text-xs text-slate-500 font-semibold">{label}</Label>
          <Input 
            name={inputName} 
            value={formData[inputName] || ''} 
            onChange={handleInputChange} 
            className="bg-slate-50 border-slate-200"
            placeholder={label}
          />
        </div>
      );
    }
    return (
      <div>
        <p className="text-xs text-slate-500 font-semibold">{label}</p>
        {value ? (
          <p className="text-sm font-medium text-slate-900">{value}</p>
        ) : (
          <span className="inline-block mt-0.5 px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-md">Sin completar</span>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6 pb-12">
      {/* Header */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <User className="w-32 h-32" />
        </div>
        <div className="relative z-10 space-y-1">
          <h1 className="text-2xl font-black">{profile.first_name} {profile.last_name_father} {profile.last_name_mother}</h1>
          <p className="text-slate-300 font-medium">{profile.rut}</p>
          <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 bg-white/10 rounded-full text-xs font-semibold text-orange-200">
            <Building className="h-3.5 w-3.5" />
            {profile.company?.name || 'Sin empresa'}
          </div>
        </div>
        
        <div className="mt-6 space-y-2 relative z-10">
          <div className="flex justify-between items-center text-xs font-semibold">
            <span className="text-slate-300">Completitud de Ficha</span>
            <span className={completionPercentage === 100 ? "text-emerald-400" : "text-orange-400"}>{completionPercentage}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ${completionPercentage === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-orange-500 to-red-500'}`}
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {incompleta && (
        <div className="bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl p-4 shadow-lg shadow-red-500/20 text-white animate-[pulse_3s_ease-in-out_infinite]">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 shrink-0" />
            <div>
              <h3 className="font-bold text-sm">Ficha Incompleta</h3>
              <p className="text-xs text-white/90 mt-1 leading-relaxed">
                Por favor, completa los datos faltantes marcados con "Sin completar" para poder gestionar tu información correctamente.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <SectionCard 
          id="personal" 
          title="Datos Personales" 
          icon={User}
          editSection={editSection}
          setEditSection={setEditSection}
          handleSave={handleSave}
          isSubmitting={isSubmitting}
        >
          {(isEditing: boolean) => (
            <div className="grid grid-cols-2 gap-4">
              {renderField('RUT', profile.rut, false, 'rut')}
              {renderField('Fecha Nacimiento', formData.birth_date, isEditing, 'birth_date')}
              {renderField('Género', formData.gender, isEditing, 'gender', 'select', ['MASCULINO', 'FEMENINO', 'OTRO'])}
              {renderField('Nacionalidad', formData.nationality, isEditing, 'nationality')}
              {renderField('Estado Civil', formData.marital_status, isEditing, 'marital_status', 'select', ['SOLTERO/A', 'CASADO/A', 'VIUDO/A', 'DIVORCIADO/A', 'CONVIVIENTE CIVIL'])}
            </div>
          )}
        </SectionCard>

        <SectionCard 
          id="contact" 
          title="Contacto" 
          icon={Phone}
          editSection={editSection}
          setEditSection={setEditSection}
          handleSave={handleSave}
          isSubmitting={isSubmitting}
        >
          {(isEditing: boolean) => (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {renderField('Teléfono', formData.phone, isEditing, 'phone')}
                {renderField('Email', formData.email, isEditing, 'email')}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {renderField('Calle y N°', formData.address_street, isEditing, 'address_street')}
                {renderField('Comuna', formData.address_comuna, isEditing, 'address_comuna')}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {renderField('Ciudad', formData.address_city, isEditing, 'address_city')}
                {renderField('Región', formData.address_region, isEditing, 'address_region')}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard 
          id="emergency" 
          title="Contacto de Emergencia" 
          icon={AlertCircle}
          editSection={editSection}
          setEditSection={setEditSection}
          handleSave={handleSave}
          isSubmitting={isSubmitting}
        >
          {(isEditing: boolean) => (
            <div className="space-y-4">
              {renderField('Nombre Completo', formData.emergency_contact_name, isEditing, 'emergency_contact_name')}
              <div className="grid grid-cols-2 gap-4">
                {renderField('Parentesco', formData.emergency_contact_relationship, isEditing, 'emergency_contact_relationship')}
                {renderField('Teléfono', formData.emergency_contact_phone, isEditing, 'emergency_contact_phone')}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard 
          id="social" 
          title="Previsión Social" 
          icon={Activity}
          editSection={editSection}
          setEditSection={setEditSection}
          handleSave={handleSave}
          isSubmitting={isSubmitting}
        >
          {(isEditing: boolean) => (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {renderField('AFP', formData.afp, isEditing, 'afp', 'select', AFP_LIST)}
                {renderField('Sistema de Salud', formData.health_system, isEditing, 'health_system', 'select', ['FONASA', 'ISAPRE'])}
              </div>
              {formData.health_system === 'ISAPRE' && (
                renderField('Isapre', formData.isapre, isEditing, 'isapre', 'select', ISAPRE_LIST)
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard 
          id="bank" 
          title="Datos Bancarios" 
          icon={CreditCard}
          editSection={editSection}
          setEditSection={setEditSection}
          handleSave={handleSave}
          isSubmitting={isSubmitting}
        >
          {(isEditing: boolean) => (
            <div className="space-y-4">
              {renderField('Banco', formData.bank_name, isEditing, 'bank_name', 'select', BANK_LIST)}
              <div className="grid grid-cols-2 gap-4">
                {renderField('Tipo de Cuenta', formData.bank_account_type, isEditing, 'bank_account_type', 'select', ['VISTA', 'CORRIENTE', 'AHORRO', 'RUT'])}
                {renderField('N° Cuenta', formData.bank_account_number, isEditing, 'bank_account_number')}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard 
          id="clothing" 
          title="Tallas EPP" 
          icon={Shirt}
          editSection={editSection}
          setEditSection={setEditSection}
          handleSave={handleSave}
          isSubmitting={isSubmitting}
        >
          {(isEditing: boolean) => (
            <div className="grid grid-cols-2 gap-4">
              {renderField('Polera', formData.clothing_tshirt_size, isEditing, 'clothing_tshirt_size', 'select', CLOTHING_SIZES_LETTER)}
              {renderField('Polar', formData.clothing_polar_size, isEditing, 'clothing_polar_size', 'select', CLOTHING_SIZES_LETTER)}
              {renderField('Pantalón (Letra)', formData.clothing_pants_size_letter, isEditing, 'clothing_pants_size_letter', 'select', CLOTHING_SIZES_LETTER)}
              {renderField('Pantalón (N°)', formData.clothing_pants_size_number, isEditing, 'clothing_pants_size_number', 'select', PANTS_SIZES_NUMBER)}
              {renderField('Calzado', formData.clothing_shoe_size, isEditing, 'clothing_shoe_size', 'select', SHOE_SIZES)}
              {renderField('Parka', formData.clothing_parka_size, isEditing, 'clothing_parka_size', 'select', CLOTHING_SIZES_LETTER)}
              {renderField('Overol', formData.clothing_overall_size, isEditing, 'clothing_overall_size', 'select', CLOTHING_SIZES_LETTER)}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({
  id,
  title,
  icon: Icon,
  editSection,
  setEditSection,
  handleSave,
  isSubmitting,
  children,
}: {
  id: string;
  title: string;
  icon: any;
  editSection: string | null;
  setEditSection: (section: string | null) => void;
  handleSave: (section: string) => void;
  isSubmitting: boolean;
  children: (isEditing: boolean) => React.ReactNode;
}) {
  const isEditing = editSection === id;
  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden mb-4">
      <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3 px-4 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-white rounded-lg shadow-sm border border-slate-100">
            <Icon className="h-4 w-4 text-orange-500" />
          </div>
          <CardTitle className="text-base font-bold text-slate-800">{title}</CardTitle>
        </div>
        {isEditing ? (
          <div className="flex gap-2">
            <Button size="icon" variant="ghost" onClick={() => setEditSection(null)} className="h-7 w-7 text-slate-500">
              <X className="h-4 w-4" />
            </Button>
            <Button size="icon" onClick={() => handleSave(id)} disabled={isSubmitting} className="h-7 w-7 bg-emerald-500 hover:bg-emerald-600">
              <Save className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button size="icon" variant="ghost" onClick={() => setEditSection(id)} className="h-7 w-7 text-slate-400 hover:text-orange-600">
            <Edit2 className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {children(isEditing)}
      </CardContent>
    </Card>
  );
}
