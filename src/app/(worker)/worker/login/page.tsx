'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginAsWorker } from '../../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function WorkerLoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      const res = await loginAsWorker(email);
      if (res.success) {
        toast.success('Sesión iniciada correctamente');
        router.push('/worker');
      } else {
        toast.error(res.error || 'Error al iniciar sesión');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md space-y-8 bg-white p-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-6">
            <div className="h-20 w-20 rounded-2xl overflow-hidden shadow-lg">
              <img src="/icon.jpg" alt="Logo" className="h-full w-full object-cover" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Acceso Trabajador</h1>
          <p className="text-slate-500 text-sm">Ingresa tu email registrado para consultar tus turnos y transporte</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-bold uppercase text-slate-400 ml-1">Correo Electrónico</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-xl bg-slate-50 border-slate-200 focus:ring-orange-500"
              required
            />
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold uppercase tracking-wide shadow-lg shadow-orange-200 transition-all active:scale-95"
            disabled={loading}
          >
            {loading ? 'Iniciando sesión...' : 'Entrar'}
          </Button>
        </form>

        <div className="pt-6 text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">
            HRM Roster Manager &copy; 2026
          </p>
        </div>
      </div>
    </div>
  );
}
