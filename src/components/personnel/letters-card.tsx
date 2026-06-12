'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { FileText, Award, AlertTriangle, Plus, Trash2, Calendar, FileDown, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { uploadLetter, deleteLetter } from '@/app/(dashboard)/personnel/letters-actions';

interface Letter {
  id: string;
  type: 'FELICITACION' | 'AMONESTACION';
  date: string;
  reason: string;
  file_url: string | null;
  created_at: string;
}

interface LettersCardProps {
  personnelId: string;
  initialLetters: Letter[];
  role: string;
}

export function LettersCard({ personnelId, initialLetters, role }: LettersCardProps) {
  const [letters, setLetters] = useState<Letter[]>(initialLetters);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  // Form states
  const [type, setType] = useState<'FELICITACION' | 'AMONESTACION'>('AMONESTACION');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const canManage = ['ADMIN', 'AIRPORT_ASSISTANT', 'ASSISTANT'].includes(role);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('Por favor, ingresa el motivo o justificación');
      return;
    }
    if (!date) {
      toast.error('Por favor, selecciona una fecha');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Subiendo carta de personal...');

    try {
      const formData = new FormData();
      formData.append('personnel_id', personnelId);
      formData.append('type', type);
      formData.append('date', date);
      formData.append('reason', reason);
      if (file) {
        formData.append('file', file);
      }

      const result = await uploadLetter(formData);

      if (!result.success) {
        throw new Error(result.error || 'Ocurrió un error al subir');
      }

      toast.success(
        type === 'FELICITACION' 
          ? 'Carta de felicitación registrada exitosamente' 
          : 'Carta de amonestación registrada exitosamente',
        { id: toastId }
      );

      // Append new letter to list and sort by date descending
      if (result.data) {
        setLetters(prev => [result.data as Letter, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      }

      // Reset form & close modal
      setReason('');
      setFile(null);
      setType('AMONESTACION');
      setIsOpen(false);
    } catch (error: any) {
      toast.error('Error al guardar la carta: ' + error.message, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, letterType: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar esta carta de ${letterType.toLowerCase()}?`)) {
      return;
    }

    setIsDeletingId(id);
    const toastId = toast.loading('Eliminando carta...');

    try {
      const result = await deleteLetter(id);

      if (!result.success) {
        throw new Error(result.error || 'Ocurrió un error al eliminar');
      }

      toast.success('Carta eliminada exitosamente', { id: toastId });
      setLetters(prev => prev.filter(l => l.id !== id));
    } catch (error: any) {
      toast.error('Error al eliminar: ' + error.message, { id: toastId });
    } finally {
      setIsDeletingId(null);
    }
  };

  const formatLetterDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'dd/MM/yyyy');
    } catch (e) {
      return dateStr;
    }
  };

  const felicitacionesCount = letters.filter(l => l.type === 'FELICITACION').length;
  const amonestacionesCount = letters.filter(l => l.type === 'AMONESTACION').length;

  return (
    <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
      <CardHeader className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800/80 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-5 w-5 text-indigo-600" />
              Cartas de Felicitación y Amonestación
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-1">
              Registro histórico de cartas de felicitaciones ({felicitacionesCount}) y amonestaciones ({amonestacionesCount}).
            </CardDescription>
          </div>

          {canManage && (
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger render={
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs flex items-center gap-1.5 shadow-sm">
                  <Plus className="h-4 w-4" />
                  Subir Carta
                </Button>
              } />
              <DialogContent className="sm:max-w-lg rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">Registrar Nueva Carta</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                  <div className="space-y-1">
                    <Label htmlFor="letter-type" className="text-xs font-bold text-slate-600 uppercase">Tipo de Documento</Label>
                    <select
                      id="letter-type"
                      value={type}
                      onChange={(e) => setType(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="AMONESTACION">Amonestación ⚠️</option>
                      <option value="FELICITACION">Felicitación ✨</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="letter-date" className="text-xs font-bold text-slate-600 uppercase">Fecha del Documento</Label>
                    <Input
                      id="letter-date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="rounded-xl border-slate-200 focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="letter-reason" className="text-xs font-bold text-slate-600 uppercase">Motivo / Descripción</Label>
                    <Textarea
                      id="letter-reason"
                      placeholder="Describe brevemente el motivo de la carta..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="rounded-xl border-slate-200 focus:ring-2 focus:ring-indigo-500 min-h-[100px]"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="letter-file" className="text-xs font-bold text-slate-600 uppercase">Documento Escaneado (PDF o Imagen)</Label>
                    <Input
                      id="letter-file"
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={handleFileChange}
                      className="rounded-xl border-slate-200 focus:ring-2 focus:ring-indigo-500 file:mr-4 file:py-1 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                    <p className="text-[10px] text-slate-400 italic">Opcional. Subir documento escaneado/fotografiado para respaldo.</p>
                  </div>

                  <DialogFooter className="pt-4 flex gap-2">
                    <DialogClose render={
                      <Button type="button" variant="outline" className="rounded-xl">Cancelar</Button>
                    } />
                    <Button 
                      type="submit" 
                      disabled={isSubmitting}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5"
                    >
                      {isSubmitting ? 'Guardando...' : 'Registrar Carta'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {letters.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400 font-medium">
            No se han registrado cartas de felicitación o amonestación para este colaborador.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {letters.map((letter) => (
              <div 
                key={letter.id} 
                className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors"
              >
                <div className="flex gap-3 items-start flex-1">
                  <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                    letter.type === 'FELICITACION' 
                      ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' 
                      : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600'
                  }`}>
                    {letter.type === 'FELICITACION' ? (
                      <Award className="h-5 w-5" />
                    ) : (
                      <AlertTriangle className="h-5 w-5" />
                    )}
                  </div>
                  
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={
                        letter.type === 'FELICITACION'
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100/80 font-bold text-[10px] uppercase'
                          : 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 hover:bg-rose-100/80 font-bold text-[10px] uppercase'
                      }>
                        {letter.type === 'FELICITACION' ? 'Felicitación' : 'Amonestación'}
                      </Badge>
                      <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatLetterDate(letter.date)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 font-medium whitespace-pre-line leading-relaxed">
                      {letter.reason}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:self-start shrink-0">
                  {letter.file_url ? (
                    <a 
                      href={letter.file_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-block"
                    >
                      <Button variant="outline" size="sm" className="rounded-xl border-slate-200 hover:bg-slate-100 h-8 flex items-center gap-1">
                        <FileDown className="h-3.5 w-3.5" />
                        <span>Ver Documento</span>
                      </Button>
                    </a>
                  ) : (
                    <span className="text-[10px] font-medium text-slate-400 italic mr-1">Sin archivo adjunto</span>
                  )}

                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(letter.id, letter.type)}
                      disabled={isDeletingId === letter.id}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl h-8 w-8"
                      title="Eliminar registro"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
