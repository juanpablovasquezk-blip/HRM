'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { MessageSquare, Save, Key, Users, Plus, Trash2, Mail, BellRing } from 'lucide-react';
import { getWhatsAppSettings, saveWhatsAppSettings } from './actions';
import { MassMediaModal } from '@/components/personnel/mass-media-modal';

interface WhatsAppGroup {
  name: string;
  id: string;
}

export default function WhatsAppSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [emailRecipients, setEmailRecipients] = useState('');
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);

  // Form for adding a new group
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');

  useEffect(() => {
    async function loadSettings() {
      try {
        const result = await getWhatsAppSettings();
        
        if (!result.success) throw new Error(result.error);

        if (result.is_fallback) {
          toast.warning('Cargado desde respaldo (error de cache en base de datos)');
        }

        const data = result.data || {};
        setInstanceId(data.ultramsg_instance_id || '');
        setToken(data.ultramsg_token || '');
        setEmailRecipients(data.email_recipients || '');

        let parsedGroups: WhatsAppGroup[] = [];
        if (data.ultramsg_groups) {
          try {
            parsedGroups = JSON.parse(data.ultramsg_groups);
          } catch (e) {
            console.error('Error parsing groups JSON:', e);
          }
        }
        setGroups(parsedGroups);
      } catch (error: any) {
        console.error('Error loading settings:', error);
        toast.error('Error al cargar configuración: ' + error.message);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleAddGroup = () => {
    if (!newGroupName.trim() || !newGroupId.trim()) {
      toast.error('Por favor, ingresa el nombre y el ID del grupo');
      return;
    }

    if (groups.some(g => g.id === newGroupId.trim())) {
      toast.error('Este ID de grupo ya está registrado');
      return;
    }

    setGroups([...groups, { name: newGroupName.trim(), id: newGroupId.trim() }]);
    setNewGroupName('');
    setNewGroupId('');
    toast.success('Grupo agregado a la lista');
  };

  const handleRemoveGroup = (index: number) => {
    const updated = [...groups];
    updated.splice(index, 1);
    setGroups(updated);
    toast.success('Grupo eliminado de la lista');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        ultramsg_instance_id: instanceId,
        ultramsg_token: token,
        email_recipients: emailRecipients,
        ultramsg_groups: JSON.stringify(groups)
      };

      const result = await saveWhatsAppSettings(payload);

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
    <div className="space-y-6 max-w-3xl pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BellRing className="h-6 w-6 text-emerald-600 animate-pulse" />
            Ajustes de Notificaciones e Integración
          </h1>
          <p className="text-slate-500 text-sm">Gestiona destinatarios de alertas de asistencia y grupos de WhatsApp</p>
        </div>
        <div className="flex gap-3">
          <MassMediaModal />
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6 shadow-md transition-all duration-200"
          >
            {saving ? 'Guardando...' : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Guardar Configuración
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Email Alerts Card */}
        <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden border">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
            <CardTitle className="text-sm font-bold tracking-tight text-slate-800 flex items-center gap-2">
              <Mail className="h-4 w-4 text-indigo-600" />
              Notificaciones de Ausencias por Correo
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Configura los destinatarios del correo diario automático con las inasistencias reportadas (se envía a las 15:00).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">Destinatarios de Correo</Label>
              <Input 
                placeholder="ejemplo1@empresa.com, ejemplo2@empresa.com"
                value={emailRecipients}
                onChange={(e) => setEmailRecipients(e.target.value)}
                className="rounded-xl bg-slate-50 border-slate-200 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-[10px] text-slate-400 mt-1 italic">
                Separa múltiples correos electrónicos usando comas. Si se deja en blanco o no hay ausencias, no se enviará ningún correo.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* API Credentials */}
        <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden border">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
            <CardTitle className="text-sm font-bold tracking-tight text-slate-800 flex items-center gap-2">
              <Key className="h-4 w-4 text-emerald-600" />
              Credenciales de UltraMsg (WhatsApp)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Datos de autenticación del servicio de mensajería API.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">ID de Instancia</Label>
                <Input 
                  placeholder="Ej: instance162661"
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  className="rounded-xl bg-slate-50 border-slate-200 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 ml-1">API Token</Label>
                <Input 
                  type="password"
                  placeholder="Token secreto"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="rounded-xl bg-slate-50 border-slate-200 focus:ring-emerald-500"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dynamic WhatsApp Groups List */}
        <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden border">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-5">
            <CardTitle className="text-sm font-bold tracking-tight text-slate-800 flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-600" />
              Lista de Grupos de WhatsApp
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Agrega y administra los grupos de WhatsApp donde se enviará la planificación diaria según la operación.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* New Group Add Form */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Agregar Nuevo Grupo</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-slate-500">Nombre de la Operación</Label>
                  <Input 
                    placeholder="Ej: BlueExpress, FedEx, DHL, Aeropuerto"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="rounded-xl bg-white border-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-slate-500">ID del Grupo (WhatsApp ID)</Label>
                  <Input 
                    placeholder="Ej: 120363040079533362@g.us"
                    value={newGroupId}
                    onChange={(e) => setNewGroupId(e.target.value)}
                    className="rounded-xl bg-white border-slate-200"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <Button 
                  type="button"
                  onClick={handleAddGroup}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 text-xs flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar Grupo
                </Button>
              </div>
            </div>

            {/* List of current groups */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 px-1">Grupos Configurados ({groups.length})</h4>
              
              {groups.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                  No hay grupos registrados. Agrega uno arriba.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden bg-white">
                  {groups.map((group, index) => (
                    <div key={group.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                      <div className="space-y-1">
                        <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                          {group.name}
                        </span>
                        <code className="text-[10px] text-slate-500 block font-mono bg-slate-100 px-1.5 py-0.5 rounded w-fit">
                          {group.id}
                        </code>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleRemoveGroup(index)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl p-2 h-auto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-400 mt-2 italic px-1">
              * Nota: Al publicar el plan diario, la imagen se enviará a todos los grupos configurados en esta lista. Las legacy keys se sincronizan en segundo plano.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

