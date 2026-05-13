'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error('Error de acceso', {
          description: error.message,
        });
        return;
      }

      const role = data.user?.user_metadata?.role || 'USER';
      toast.success('¡Bienvenido!');
      
      // Client-side redirection for faster feedback
      if (role === 'ADMIN' || role === 'HR') {
        router.push('/dashboard');
      } else if (role === 'SUPERVISOR') {
        router.push('/supervisor');
      } else {
        router.push('/worker');
      }
      
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
            <Label htmlFor="password" className="text-sm font-medium">
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
