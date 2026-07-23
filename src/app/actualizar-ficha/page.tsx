import React from 'react';
import { getPersonnelUpdateDetailsByToken } from '../(dashboard)/personnel/update-actions';
import ActualizarFichaClient from './actualizar-ficha-client';
import { AlertCircle, UserCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

interface ActualizarFichaPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ActualizarFichaPage({ searchParams }: ActualizarFichaPageProps) {
  const { token } = await searchParams;

  if (!token) {
    return <ErrorState message="Enlace de actualización no válido. Se requiere un token de acceso." />;
  }

  const res = await getPersonnelUpdateDetailsByToken(token);

  if (res.status === 'EXPIRED') {
    return <ErrorState message={res.error || "Este enlace de actualización ha caducado. Por favor, solicita uno nuevo a tu supervisor."} />;
  }

  if (res.status === 'NOT_FOUND' || !res.data?.worker) {
    return <ErrorState message={res.error || "Este enlace no es válido o el trabajador ya no está registrado."} />;
  }

  const worker = res.data.worker;

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 flex flex-col justify-center">
      <div className="max-w-xl mx-auto w-full space-y-8">
        <div className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/20 mb-4">
            <UserCheck className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-slate-50">
            Actualización de Ficha de Personal
          </h2>
          <p className="text-sm font-semibold text-orange-600 uppercase tracking-wider mt-1">
            {worker.company?.name || 'GRUPO MINERQUIM'}
          </p>
        </div>

        <ActualizarFichaClient token={token} worker={worker} />
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
      <Card className="max-w-md w-full border-none shadow-2xl rounded-3xl overflow-hidden bg-white dark:bg-slate-900">
        <CardContent className="p-8 text-center space-y-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400">
            <AlertCircle className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-black uppercase tracking-tight text-slate-950 dark:text-slate-50">Acceso Denegado</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {message}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
