import React from 'react';
import { getSupervisorSession } from '../../actions';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { getUserRole } from '@/app/role-actions';
import SupervisorPersonnelClient from './personnel-client';

export default async function SupervisorPersonnelPage() {
  const session = await getSupervisorSession();
  if (!session) redirect('/supervisor/login');

  const supabase = createAdminClient();
  const userRole = await getUserRole();
  
  const [
    { data: personnelRaw },
    { data: documentDefs },
    { data: documents },
    { data: positions }
  ] = await Promise.all([
    supabase
      .from('personnel')
      .select('*')
      .eq('is_active', true)
      .or('onboarding_status.is.null,onboarding_status.eq.approved')
      .order('last_name_father', { ascending: true }),
    supabase.from('document_definitions').select('*').eq('is_active', true),
    supabase.from('documents').select('*'),
    supabase.from('positions').select('id, name')
  ]);

  const posMap = Object.fromEntries((positions || []).map(p => [p.id, p.name]));

  const personnel = (personnelRaw || []).map(p => ({
    ...p,
    main_position: posMap[p.main_position] || p.main_position || 'Sin Cargo'
  }));

  return (
    <SupervisorPersonnelClient 
      personnel={personnel} 
      documentDefs={documentDefs || []} 
      documents={documents || []} 
      userRole={userRole || 'USER'}
    />
  );
}
