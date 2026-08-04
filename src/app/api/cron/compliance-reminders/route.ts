import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/ultramsg';

export async function GET(request: Request) {
  // 1. Simple authorization check (skip if CRON_SECRET is not configured)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
  }

  const supabase = createAdminClient();
  const platformUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    // 2. Fetch all active workers
    const { data: activeWorkers, error: fetchWorkersError } = await supabase
      .from('personnel')
      .select('id, first_name, last_name_father, email, rut, phone, afp, health_system, bank_account_number, emergency_contact_phone, gender, marital_status, main_position, secondary_positions')
      .eq('is_active', true);

    if (fetchWorkersError) throw fetchWorkersError;
    if (!activeWorkers || activeWorkers.length === 0) {
      return NextResponse.json({ success: true, processed: 0, messagesSent: 0 });
    }

    // 3. Fetch all active mandatory document definitions
    const { data: mandatoryDefs, error: fetchDefsError } = await supabase
      .from('document_definitions')
      .select('id, name, applicable_positions')
      .eq('is_active', true)
      .eq('is_mandatory', true);

    if (fetchDefsError) throw fetchDefsError;
    const defs = mandatoryDefs || [];

    // 4. Fetch all uploaded documents
    const workerIds = activeWorkers.map(w => w.id);
    const { data: existingDocs, error: fetchDocsError } = await supabase
      .from('documents')
      .select('definition_id, personnel_id, file_url')
      .in('personnel_id', workerIds);

    if (fetchDocsError) throw fetchDocsError;
    const docs = existingDocs || [];

    let messagesSent = 0;

    // 5. Scan and send reminders
    for (const worker of activeWorkers) {
      // Skip if no phone number
      if (!worker.phone || worker.phone.trim().length < 8) continue;

      const positionIds: string[] = [];
      if (worker.main_position) positionIds.push(worker.main_position);
      if (Array.isArray(worker.secondary_positions)) {
        positionIds.push(...worker.secondary_positions);
      }

      // Check completeness
      const isProfileIncomplete = !worker.afp || !worker.health_system || !worker.bank_account_number || 
        !worker.emergency_contact_phone || !worker.gender || !worker.marital_status || !worker.phone;

      const workerDocs = docs.filter(d => d.personnel_id === worker.id);
      const missingForThisWorker = defs.filter(def => {
        const applicable: string[] = def.applicable_positions || [];
        if (applicable.length > 0 && !applicable.some((p: string) => positionIds.includes(p))) {
          return false;
        }
        const doc = workerDocs.find(d => d.definition_id === def.id);
        return !doc || !doc.file_url;
      });

      // If either profile is incomplete or documents are missing, compile and send reminder
      if (isProfileIncomplete || missingForThisWorker.length > 0) {
        const cleanRut = worker.rut.replace(/[.-]/g, '').toUpperCase();
        const loginLink = `${platformUrl}/login`;

        const pendingItems: string[] = [];
        if (isProfileIncomplete) {
          pendingItems.push('• Datos personales en tu Ficha (previsión, salud, contacto de emergencia, etc.)');
        }
        if (missingForThisWorker.length > 0) {
          pendingItems.push(`• Subir documentos faltantes: *${missingForThisWorker.map(d => d.name).join(', ')}*`);
        }
        const pendingStr = pendingItems.join('\n');

        const message = 
          `Hola *${worker.first_name}* 📋\n\n` +
          `Debido a requerimientos aeronáuticos obligatorios y auditorías de seguridad de la DGAC, debemos mantener actualizados tus datos y documentos en la plataforma de Minerquim.\n\n` +
          `Actualmente registras la siguiente información pendiente:\n` +
          `${pendingStr}\n\n` +
          `Por favor, ingresa a tu portal personal para completarlos lo antes posible:\n` +
          `🔗 ${loginLink}\n\n` +
          `*Credenciales de acceso:*\n` +
          `• Usuario: _${worker.email}_\n` +
          `• Contraseña: _${cleanRut}_\n\n` +
          `_(Nota: Estos datos son confidenciales y obligatorios para gestionar tus credenciales de acceso)_\n\n` +
          `¡Muchas gracias por tu ayuda!`;

        // Format phone to UltraMsg format
        let cleanPhone = worker.phone.replace(/\D/g, '');
        if (cleanPhone.length === 8) cleanPhone = '569' + cleanPhone;
        if (cleanPhone.length === 9 && !cleanPhone.startsWith('56')) cleanPhone = '56' + cleanPhone;
        if (!cleanPhone.includes('@')) {
          cleanPhone = `${cleanPhone}@c.us`;
        }

        try {
          const res = await sendWhatsAppMessage(cleanPhone, message);
          if (res.success) {
            messagesSent++;
          }
        } catch (err) {
          console.error(`[Cron Reminder] Failed for ${worker.first_name} (${worker.id}):`, err);
        }

        // Wait 1.5s between messages to avoid flooding
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed: activeWorkers.length, 
      messagesSent 
    });

  } catch (error: any) {
    console.error('Compliance reminders cron job failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' }, 
      { status: 500 }
    );
  }
}
