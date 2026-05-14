'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { MessageSquare, Save, ShieldCheck, Key, Hash, Send, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { saveWhatsAppSettings, getWhatsAppSettings } from './actions';

export default function WhatsAppSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    ultramsg_instance_id: '',
    ultramsg_token: '',
    ultramsg_group_blue: '',
    ultramsg_group_fedex: '',
    ultramsg_group_dhl: '',
    ultramsg_group_others: ''
  });

  const supabase = createClient();

  useEffect(() => {
    async function loadSettings() {
      try {
        const result = await getWhatsAppSettings();
        
        if (!result.success) throw new Error(result.error);

        if (result.is_fallback) {
          toast.warning('Cargado desde respaldo (error de cache en base de datos)');
        }

        const data = result.data || {};
        const newSettings = { ...settings };
        
        Object.keys(newSettings).forEach(key => {
          if (key in data) {
            newSettings[key as keyof typeof settings] = (data as Record<string, string>)[key];
          }
        });

        setSettings(newSettings);
      } catch (error: any) {
        console.error('Error loading settings:', error);
        toast.error('Error al cargar configuración: ' + error.message);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveWhatsAppSettings(settings);

      if (!result.success) {
        throw new Error(result.error);
      }
      
      toast.success('Configuración guardada correctamente');
    } catch (error: any) {
      toast.error('Error al guardar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center font-bold animate-pulse">Cargando configuración...</div>;

  return (
    <div className="space-y-6 max-w-2xl pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-emerald-600" />
            Integración WhatsApp
          </h1>
          <p className="text-slate-500 text-sm">Configura la segmentación por grupos de operación</p>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6"
        >
          {saving ? 'Guardando...' : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Guardar Cambios
            </>
          )}
        </Button>
      </div>

      <div className="grid gap-6">
        {/* API Credentials */}
        <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Key className="h-4 w-4" />
              Credenciales UltraMsg
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">Instance ID</Label>
                <Input 
                  placeholder="Ej: instance12345"
                  value={settings.ultramsg_instance_id}
                  onChange={(e) => setSettings({ ...settings, ultramsg_instance_id: e.target.value })}
                  className="rounded-xl bg-slate-50 border-slate-200 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">API Token</Label>
                <Input 
                  type="password"
                  placeholder="Token secreto"
                  value={settings.ultramsg_token}
                  onChange={(e) => setSettings({ ...settings, ultramsg_token: e.target.value })}
                  className="rounded-xl bg-slate-50 border-slate-200 focus:ring-emerald-500"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Groups Segmentation */}
        <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-4">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Users className="h-4 w-4" />
              IDs de Grupos por Operación
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-indigo-600 ml-1">Grupo BlueExpress</Label>
                <Input 
                  placeholder="ID del grupo Blue"
                  value={settings.ultramsg_group_blue}
                  onChange={(e) => setSettings({ ...settings, ultramsg_group_blue: e.target.value })}
                  className="rounded-xl bg-indigo-50/30 border-indigo-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-orange-600 ml-1">Grupo FedEx</Label>
                <Input 
                  placeholder="ID del grupo Fedex"
                  value={settings.ultramsg_group_fedex}
                  onChange={(e) => setSettings({ ...settings, ultramsg_group_fedex: e.target.value })}
                  className="rounded-xl bg-orange-50/30 border-orange-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-red-600 ml-1">Grupo DHL</Label>
                <Input 
                  placeholder="ID del grupo DHL"
                  value={settings.ultramsg_group_dhl}
                  onChange={(e) => setSettings({ ...settings, ultramsg_group_dhl: e.target.value })}
                  className="rounded-xl bg-red-50/30 border-red-100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-600 ml-1">Otros (Aeropuerto / Base / Atrex)</Label>
                <Input 
                  placeholder="ID del grupo general"
                  value={settings.ultramsg_group_others}
                  onChange={(e) => setSettings({ ...settings, ultramsg_group_others: e.target.value })}
                  className="rounded-xl bg-slate-100/50 border-slate-200"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 italic px-1">
              Los mensajes se enviarán automáticamente al grupo correspondiente según el área del trabajador.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
