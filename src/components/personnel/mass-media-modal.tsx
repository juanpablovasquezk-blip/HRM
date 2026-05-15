'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Megaphone, Send, Video, AlertCircle, Loader2, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { sendFilteredMassMessage } from '@/app/(dashboard)/personnel/communications-actions';
import { listPersonnel } from '@/app/(dashboard)/personnel/actions';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import type { Personnel } from '@/types/database';

export function MassMediaModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<{id: string, name: string}[]>([]);
  const [companies, setCompanies] = useState<{id: string, name: string}[]>([]);
  
  const [filters, setFilters] = useState({
    position_id: '',
    company_id: '',
    status: 'active' as 'active' | 'inactive' | 'all'
  });

  const [message, setMessage] = useState('');
  const [mediaUrl, setMediaUrl] = useState('https://pvcjaxqcgiqlhjxkpbuk.supabase.co/storage/v1/object/public/media/Guia_App.mp4');
  
  const [personnelList, setPersonnelList] = useState<Personnel[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isFetchingPersonnel, setIsFetchingPersonnel] = useState(false);
  
  useEffect(() => {
    if (!open) return;
    async function loadOptions() {
      const supabase = createClient();
      const [{ data: pos }, { data: comps }] = await Promise.all([
        supabase.from('positions').select('id, name').order('name'),
        supabase.from('companies').select('id, name').order('name')
      ]);
      if (pos) setPositions(pos);
      if (comps) setCompanies(comps);
    }
    loadOptions();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    async function fetchPersonnel() {
      setIsFetchingPersonnel(true);
      const { data, error } = await listPersonnel(
        undefined, 
        filters.company_id || undefined, 
        filters.position_id || undefined, 
        filters.status === 'active'
      );
      if (data) {
        setPersonnelList(data);
        setSelectedIds(new Set(data.map(p => p.id)));
      }
      setIsFetchingPersonnel(false);
    }
    fetchPersonnel();
  }, [filters, open]);

  const toggleSelectAll = () => {
    if (selectedIds.size === personnelList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(personnelList.map(p => p.id)));
    }
  };

  const togglePerson = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSend = async () => {
    if (!message.trim() && !mediaUrl.trim()) {
      toast.error('Debes incluir al menos un mensaje de texto o un enlace multimedia.');
      return;
    }

    if (!confirm(`¿Estás seguro de enviar este comunicado masivo a ${selectedIds.size} trabajadores? Esta acción no se puede deshacer.`)) {
      return;
    }

    setLoading(true);
    try {
      const result = await sendFilteredMassMessage(message, mediaUrl, filters, Array.from(selectedIds));
      
      if (result.success) {
        toast.success(`Mensaje enviado con éxito a ${result.sent} de ${result.total} trabajadores.`);
        if (result.failed && result.failed > 0) {
          const errorDetails = result.errors ? result.errors.join(' | ') : '';
          toast.error(`Falló el envío para ${result.failed} trabajadores. Detalles: ${errorDetails}`, { duration: 10000 });
        }
        setOpen(false);
      } else {
        toast.error('Error: ' + result.error);
      }
    } catch (err: any) {
      toast.error('Error al enviar masivamente: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl shadow-md border-0">
          <Megaphone className="mr-2 h-4 w-4" />
          Enviar Comunicado Masivo
        </Button>
      } />
      
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto rounded-3xl border-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-black text-slate-800">
            <Megaphone className="h-6 w-6 text-orange-500" />
            Comunicado al Personal
          </DialogTitle>
          <DialogDescription>
            Envía un mensaje de WhatsApp (con video o imagen) a los trabajadores filtrados. 
            Puedes usar <code className="bg-slate-100 px-1 rounded text-orange-600">{`{nombre}`}</code>, <code className="bg-slate-100 px-1 rounded text-orange-600">{`{apellido}`}</code>, <code className="bg-slate-100 px-1 rounded text-orange-600">{`{email}`}</code> y <code className="bg-slate-100 px-1 rounded text-orange-600">{`{password}`}</code> en el mensaje para personalizarlo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Filtros */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-slate-400" />
              1. Filtrar Destinatarios
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-500 uppercase">Cargo</Label>
                <select 
                  className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  value={filters.position_id}
                  onChange={e => setFilters({...filters, position_id: e.target.value})}
                >
                  <option value="">Todos los cargos</option>
                  {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-500 uppercase">Empresa</Label>
                <select 
                  className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  value={filters.company_id}
                  onChange={e => setFilters({...filters, company_id: e.target.value})}
                >
                  <option value="">Todas las empresas</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-500 uppercase">Estado</Label>
                <select 
                  className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  value={filters.status}
                  onChange={e => setFilters({...filters, status: e.target.value as any})}
                >
                  <option value="active">Solo Activos</option>
                  <option value="inactive">Solo Inactivos</option>
                  <option value="all">Todos</option>
                </select>
              </div>
            </div>
          </div>
          {/* Selección de Personal */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <User className="h-4 w-4 text-emerald-500" />
                2. Seleccionar Destinatarios ({selectedIds.size})
              </Label>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={toggleSelectAll}
                className="text-[10px] uppercase font-bold text-slate-500 hover:text-orange-600"
              >
                {selectedIds.size === personnelList.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
              </Button>
            </div>

            <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white max-h-[200px] overflow-y-auto">
              {isFetchingPersonnel ? (
                <div className="p-8 text-center flex flex-col items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                  <span className="text-xs text-slate-400">Cargando personal...</span>
                </div>
              ) : personnelList.length > 0 ? (
                <div className="divide-y divide-slate-50">
                  {personnelList.map(person => (
                    <div 
                      key={person.id} 
                      className={`flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors cursor-pointer ${!selectedIds.has(person.id) ? 'opacity-60' : ''}`}
                      onClick={() => togglePerson(person.id)}
                    >
                      <Checkbox 
                        checked={selectedIds.has(person.id)}
                        onCheckedChange={() => togglePerson(person.id)}
                        className="rounded-md border-slate-300 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700 uppercase">
                          {person.first_name} {person.last_name_father}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {person.phone || 'Sin teléfono'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-400 italic">
                  No hay trabajadores que coincidan con los filtros.
                </div>
              )}
            </div>
          </div>
          {/* Contenido */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Video className="h-4 w-4 text-indigo-500" />
                Enlace Multimedia (Video o Imagen)
              </Label>
              <Input 
                placeholder="https://.../video.mp4" 
                value={mediaUrl}
                onChange={e => setMediaUrl(e.target.value)}
                className="font-mono text-xs bg-indigo-50/30 border-indigo-100 rounded-xl"
              />
              <p className="text-[10px] text-slate-500 ml-1">Debe ser una URL directa a un archivo .mp4, .jpg, .png</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-bold text-slate-700">Mensaje (Caption)</Label>
              <Textarea 
                placeholder={`Hola {nombre},\nAquí te enviamos un video explicativo...`}
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="min-h-[120px] rounded-xl border-slate-200"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading} className="rounded-xl">
            Cancelar
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={loading || (!message && !mediaUrl) || selectedIds.size === 0}
            className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {loading ? 'Enviando...' : `Enviar a ${selectedIds.size} seleccionados`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
