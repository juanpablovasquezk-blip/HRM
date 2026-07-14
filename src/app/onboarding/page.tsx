import React from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import OnboardingForm from './onboarding-form';
import { AlertCircle, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

interface OnboardingPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const { token } = await searchParams;

  if (!token) {
    return <ErrorState message="Enlace de invitación no válido. Se requiere un token." />;
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Validate the token and fetch company details
  const { data: tokenData, error: tokenError } = await supabase
    .from('onboarding_tokens')
    .select('*, company:companies(id, name)')
    .eq('token', token)
    .gt('expires_at', now)
    .is('used_at', null)
    .maybeSingle();

  if (tokenError || !tokenData) {
    return <ErrorState message="Este enlace de invitación ha expirado, ya fue utilizado o es inválido. Por favor, solicita uno nuevo a tu supervisor." />;
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 flex flex-col justify-center">
      <div className="max-w-xl mx-auto w-full space-y-8">
        {/* Logo or App Branding header */}
        <div className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/20 mb-4">
            <FileText className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-slate-50">
            Ficha de Ingreso de Personal
          </h2>
          <p className="text-sm font-semibold text-orange-600 uppercase tracking-wider mt-1">
            {tokenData.company?.name || 'EMPRESA'}
          </p>
        </div>

        <OnboardingForm token={token} companyName={tokenData.company?.name || ''} />
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
            <h3 className="text-lg font-black uppercase tracking-tight text-slate-950 dark:text-slate-50">Acceso no Válido</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {message}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
