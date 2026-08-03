'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateDynamicExpiration } from '@/lib/utils/document-calc';

// Get notifications for the current user
export async function getNotifications(limit: number = 20) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { notifications: [], unreadCount: 0 };

  const adminClient = createAdminClient();
  
  const { data: notifications } = await adminClient
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  const { count } = await adminClient
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  return {
    notifications: notifications || [],
    unreadCount: count || 0,
  };
}

// Mark notification as read
export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const adminClient = createAdminClient();
  await adminClient
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', user.id);
}

// Mark all as read
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const adminClient = createAdminClient();
  await adminClient
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false);
}

// Get dashboard alerts (documents expiring/expired, fichas incomplete, etc.)
export async function getDashboardAlerts() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { alerts: [] };

  const adminClient = createAdminClient();
  const today = new Date().toISOString().split('T')[0];
  
  // Calculate dates
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const in30DaysStr = in30Days.toISOString().split('T')[0];

  const alerts: Array<{
    id: string;
    type: 'warning' | 'danger' | 'info' | 'success';
    category: string;
    title: string;
    message: string;
    count?: number;
    data?: any;
  }> = [];

  // Fetch document definitions and documents
  const [{ data: definitions }, { data: allDocs }] = await Promise.all([
    adminClient.from('document_definitions').select('*'),
    adminClient
      .from('documents')
      .select('*, personnel!inner(id, first_name, last_name_father, is_active)')
      .eq('personnel.is_active', true)
  ]);

  const defs = definitions || [];
  const docs = allDocs || [];

  // Compute resolved expiration dates in memory
  const resolvedDocs = docs.map(doc => {
    const def = defs.find(d => d.id === doc.definition_id);
    let expirationDateStr = doc.expiration_date;

    if (def?.requires_expiration && def.depends_on_definition_id) {
      const anchorDoc = docs.find(d => d.personnel_id === doc.personnel_id && d.definition_id === def.depends_on_definition_id);
      if (anchorDoc?.expiration_date) {
        const calcDate = calculateDynamicExpiration(
          new Date(anchorDoc.expiration_date + 'T12:00:00'),
          def.cycle_months || 6,
          def.anchor_days_offset || 30
        );
        expirationDateStr = calcDate.toISOString().split('T')[0];
      }
    }

    return {
      ...doc,
      real_expiration_date: expirationDateStr,
    };
  });

  // 1. Documents expired
  const expiredDocsFiltered = resolvedDocs.filter(d => d.real_expiration_date && d.real_expiration_date < today);
  const expiredCount = expiredDocsFiltered.length;

  if (expiredCount > 0) {
    alerts.push({
      id: 'docs-expired',
      type: 'danger',
      category: 'Documentos',
      title: 'Documentos Vencidos',
      message: `${expiredCount} documento(s) han expirado y requieren atención inmediata.`,
      count: expiredCount,
      data: expiredDocsFiltered.slice(0, 5),
    });
  }

  // 2. Documents expiring within 30 days
  const expiringDocsFiltered = resolvedDocs.filter(
    d => d.real_expiration_date && d.real_expiration_date >= today && d.real_expiration_date <= in30DaysStr
  );
  const expiringCount = expiringDocsFiltered.length;

  if (expiringCount > 0) {
    alerts.push({
      id: 'docs-expiring',
      type: 'warning',
      category: 'Documentos',
      title: 'Documentos Por Vencer',
      message: `${expiringCount} documento(s) vencen en los próximos 30 días.`,
      count: expiringCount,
      data: expiringDocsFiltered.slice(0, 5),
    });
  }

  // 3. Fichas incompletas - query personnel missing critical fields
  const { data: incompletePersonnel, count: incompleteCount } = await adminClient
    .from('personnel')
    .select('id, first_name, last_name_father, rut, afp, health_system, bank_account_number, emergency_contact_phone, gender, marital_status, phone', { count: 'exact' })
    .eq('is_active', true)
    .or('afp.is.null,health_system.is.null,bank_account_number.is.null,emergency_contact_phone.is.null,gender.is.null,marital_status.is.null,phone.is.null,afp.eq.,health_system.eq.,bank_account_number.eq.,emergency_contact_phone.eq.,gender.eq.,marital_status.eq.,phone.eq.');

  if (incompleteCount && incompleteCount > 0) {
    alerts.push({
      id: 'fichas-incomplete',
      type: 'warning',
      category: 'Personal',
      title: 'Fichas Incompletas',
      message: `${incompleteCount} trabajador(es) tienen fichas con datos faltantes.`,
      count: incompleteCount,
      data: incompletePersonnel?.slice(0, 5),
    });
  }

  // 4. Recent ficha updates (from notifications table, last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const { data: recentUpdates, count: updateCount } = await adminClient
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .eq('title', 'Ficha Actualizada')
    .eq('is_read', false)
    .gte('created_at', sevenDaysAgo.toISOString());

  if (updateCount && updateCount > 0) {
    alerts.push({
      id: 'fichas-updated',
      type: 'info',
      category: 'Personal',
      title: 'Fichas Actualizadas',
      message: `${updateCount} ficha(s) han sido actualizadas por trabajadores.`,
      count: updateCount,
    });
  }

  // 5. Documents pending validation
  const { data: pendingDocs, count: pendingDocsCount } = await adminClient
    .from('documents')
    .select('*, personnel!inner(id, first_name, last_name_father, is_active)', { count: 'exact' })
    .eq('personnel.is_active', true)
    .eq('status', 'PENDING');

  if (pendingDocsCount && pendingDocsCount > 0) {
    alerts.push({
      id: 'docs-pending',
      type: 'warning',
      category: 'Documentos',
      title: 'Documentos por Validar',
      message: `Tienes ${pendingDocsCount} documento(s) pendiente(s) de aprobación.`,
      count: pendingDocsCount,
      data: pendingDocs?.slice(0, 5),
    });
  }

  return { alerts };
}
