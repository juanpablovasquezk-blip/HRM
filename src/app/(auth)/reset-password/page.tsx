'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Supabase automatically handles the session if the user arrives via a recovery link
  
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        toast.error('Error', { description: error.message });
        return;
      }

      toast.success('Contraseña actualizada', { 
        description: 'Ahora puedes iniciar sesión con tu nueva contraseña' 
      });
      
      router.push('/login');
    } catch (e) {
      toast.error('Ocurrió un error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-2xl bg-white/80 backdrop-blur-xl dark:bg-slate-900/80">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 h-16 w-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center text-orange-600">
          <KeyRound className="h-8 w-8" />
        </div>
        <CardTitle className="text-2xl font-bold">Nueva Contraseña</CardTitle>
        <CardDescription>
          Ingresa tu nueva contraseña para recuperar el acceso
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleReset} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña Nueva</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar Contraseña</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="h-11 rounded-xl"
            />
          </div>
          <Button
            type="submit"
            className="w-full h-11 bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-lg transition-all"
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Actualizar Contraseña
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
