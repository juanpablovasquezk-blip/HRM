'use client';

import React, { useState } from 'react';
import { loginAsSupervisor } from '../../actions';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ShieldCheck, Mail, Loader2 } from 'lucide-react';

export default function SupervisorLoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    const res = await loginAsSupervisor(email);
    
    if (res.success) {
      toast.success('Bienvenido, Supervisor');
      router.push('/supervisor');
    } else {
      toast.error(res.error || 'Error al iniciar sesión');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-md border-none shadow-2xl rounded-3xl overflow-hidden">
        <CardHeader className="bg-slate-900 text-white p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20 rotate-3">
            <ShieldCheck className="h-10 w-10 text-white" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-black uppercase tracking-tight">Portal Supervisor</CardTitle>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Acceso Restringido</p>
          </div>
        </CardHeader>
        <CardContent className="p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Correo Institucional</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input 
                  type="email" 
                  placeholder="tu@correo.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-12 py-6 rounded-2xl bg-slate-50 border-none focus-visible:ring-2 focus-visible:ring-slate-900 font-medium"
                />
              </div>
            </div>
            
            <Button 
              type="submit" 
              disabled={loading}
              className="w-full py-7 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-slate-200 transition-all active:scale-95"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                'Entrar al Panel'
              )}
            </Button>
            
            <p className="text-center text-[10px] text-slate-400 font-medium italic">
              Si no tienes acceso, contacta al administrador del sistema.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
