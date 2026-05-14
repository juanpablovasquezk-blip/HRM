'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { KeyRound, Loader2, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';
import { resetPasswordToRut, enablePersonnelAccess } from '../actions';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';

interface AccessActionsProps {
  personnelId: string;
  hasAccess: boolean;
  email?: string | null;
}

export function AccessActions({ personnelId, hasAccess, email }: AccessActionsProps) {
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleReset = async () => {
    setLoading(true);
    try {
      const res = await resetPasswordToRut(personnelId);
      if (res.success) {
        toast.success('Contraseña restablecida', { 
          description: 'La contraseña ahora es el RUT sin puntos ni guion.' 
        });
        setIsOpen(false);
      } else {
        toast.error('Error', { description: res.error });
      }
    } catch (e) {
      toast.error('Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  const handleEnable = async () => {
    if (!email) {
      toast.error('Se requiere un correo electrónico para habilitar el acceso');
      return;
    }
    setLoading(true);
    try {
      const res = await enablePersonnelAccess(personnelId, email, 'USER');
      if (res.success) {
        toast.success('Acceso habilitado correctamente');
        window.location.reload();
      } else {
        toast.error('Error', { description: res.error });
      }
    } catch (e) {
      toast.error('Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  if (!hasAccess) {
    return (
      <Button 
        variant="outline" 
        size="sm" 
        className="w-full mt-2 gap-2 text-blue-600 border-blue-200 bg-blue-50/50 hover:bg-blue-100"
        onClick={handleEnable}
        disabled={loading || !email}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <User className="h-3 w-3" />}
        Habilitar Acceso
      </Button>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger>
        <div className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-orange-200 hover:bg-orange-50 h-9 px-3 w-full mt-2 gap-2 text-orange-600">
          <KeyRound className="h-3 w-3" />
          Resetear Contraseña
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resetear Contraseña</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de restablecer la contraseña de este usuario? 
            La nueva contraseña será su **RUT sin puntos ni guion**.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleReset} 
            disabled={loading}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Reseteo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
