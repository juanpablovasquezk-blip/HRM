import React from 'react';
import { getSupervisorSession } from '../../actions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SupervisorPersonnelClient from './personnel-client';

export default async function SupervisorPersonnelPage() {
  const session = await getSupervisorSession();
  if (!session) redirect('/supervisor/login');

  const supabase = await createClient();
  
  const [
    { data: personnel },
    { data: documentDefs },
    { data: documents }
  ] = await Promise.all([
    supabase.from('personnel').select('*').eq('is_active', true).or('onboarding_status.is.null,onboarding_status.eq.approved').order('last_name', { ascending: true }),
    supabase.from('document_definitions').select('*').eq('is_active', true),
    supabase.from('documents').select('*')
  ]);

  return (
    <SupervisorPersonnelClient 
      personnel={personnel || []} 
      documentDefs={documentDefs || []} 
      documents={documents || []} 
    />
  );
}
