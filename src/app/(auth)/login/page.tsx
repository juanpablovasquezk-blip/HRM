'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Shield, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [inactiveError, setInactiveError] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('error') === 'inactive') {
        setInactiveError(true);
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setInactiveError(false);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        toast.error('Error de acceso', {
          description: error.message,
        });
        return;
      }

      // Check if this worker account is inactive
      const { data: personnel } = await supabase
        .from('personnel')
        .select('is_active')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

      const userRole = data.user?.user_metadata?.role;
      const isManagement = ['ADMIN', 'HR', 'SUPERVISOR', 'SAFETY_OFFICER', 'AIRPORT_ASSISTANT', 'ASSISTANT'].includes(userRole);

      if (personnel && personnel.is_active === false && !isManagement) {
        await supabase.auth.signOut();
        setInactiveError(true);
        toast.error('Acceso denegado', {
          description: 'Tu cuenta se encuentra inactiva o desvinculada. Contacta a Recursos Humanos.',
          duration: 6000
        });
        return;
      }

      toast.success('¡Bienvenido!');
      
      // Always go to role-selection to handle multi-role users
      router.push('/role-selection');
      
      router.refresh();
    } catch (e) {
      toast.error('Ocurrió un error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-2xl shadow-orange-900/10 bg-white/80 backdrop-blur-xl dark:bg-slate-900/80">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-4 relative h-[80px] w-auto inline-flex items-center justify-center">
          <img src="/logo.png" alt="HRM Logo" className="h-full w-auto object-contain" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
          Plataforma de Gestión
        </CardTitle>
        <CardDescription className="text-base text-muted-foreground/80">
          Ingresa tus credenciales para continuar
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {inactiveError && (
          <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-800">Acceso no disponible</p>
              <p className="text-red-600 mt-0.5">
                Esta cuenta se encuentra inactiva o desvinculada. Si crees que se trata de un error, contacta al área de Recursos Humanos.
              </p>
            </div>
          </div>
        )}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Correo Electrónico
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 rounded-xl border-slate-200 focus:ring-orange-500 focus:border-orange-500"
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" title="Contraseña (RUT)" className="text-sm font-medium">
              Contraseña (RUT)
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 rounded-xl border-slate-200 focus:ring-orange-500 focus:border-orange-500"
              autoComplete="current-password"
            />
            <div className="flex justify-end">
              <Link 
                href="/forgot-password" 
                className="text-xs text-orange-600 hover:text-orange-700 font-medium transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </div>
          <Button
            type="submit"
            className="w-full h-11 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-500/25 transition-all duration-200"
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Iniciar Sesión
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
