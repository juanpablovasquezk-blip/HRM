import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const SHARED_SYNC_SECRET = process.env.WOMM_SYNC_SECRET || 'womm_hrm_sync_secret_2026';

export async function POST(request: Request) {
  try {
    // 1. Validar cabecera de autenticación
    const incomingSecret = request.headers.get('x-sync-secret');
    if (!incomingSecret || incomingSecret !== SHARED_SYNC_SECRET) {
      return NextResponse.json(
        { success: false, error: 'No autorizado: secreto inválido o ausente' },
        { status: 401 }
      );
    }

    // 2. Parsear el cuerpo de la petición
    const body = await request.json();
    const {
      ot_number,
      service_type, // 'STALL' o 'DERRAME'
      activity,     // ej: 'Limpieza', 'Armado', 'Desarme'
      client_name,  // ej: 'LATAM Cargo', 'Hidronor'
      date,         // 'YYYY-MM-DD'
      workers,      // [{ rut: '...' }] o ['...']
      notes
    } = body;

    if (!ot_number || !service_type || !date || !workers || !Array.isArray(workers)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Faltan campos obligatorios: ot_number, service_type, date, workers (array)' 
        },
        { status: 400 }
      );
    }

    const cleanOt = String(ot_number).trim();

    // Descartar números de OT temporales/ficticios (ej: WO-1792511498654) generados antes del número definitivo
    if (/^WO-\d{8,}$/i.test(cleanOt) || /^(TEMP|DRAFT|BORRADOR)/i.test(cleanOt)) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: `N° de OT temporal/ficticio (${cleanOt}) omitido hasta recibir N° definitivo`,
      });
    }

    const targetService = String(service_type).trim().toUpperCase();

    const admin = createAdminClient();

    // 3. Buscar el tipo de bono correspondiente en el catálogo
    const { data: bonusType, error: typeError } = await admin
      .from('bonus_types')
      .select('*')
      .eq('code', targetService)
      .single();

    if (typeError || !bonusType) {
      return NextResponse.json(
        { success: false, error: `Tipo de bono '${targetService}' no encontrado en HRM.` },
        { status: 404 }
      );
    }

    if (!bonusType.active) {
      return NextResponse.json(
        { success: false, error: `El tipo de bono '${targetService}' está desactivado en HRM.` },
        { status: 400 }
      );
    }

    // Preparar observación automática
    let observations = '';
    if (targetService === 'STALL') {
      observations = activity ? `Actividad: ${activity}` : 'Servicio de Stall';
      if (client_name) observations += ` (Cliente: ${client_name})`;
    } else if (targetService === 'DERRAME') {
      observations = client_name ? `Cliente: ${client_name}` : 'Contención de Derrame';
      if (activity) observations += ` - ${activity}`;
    }
    if (notes) observations += ` [${notes}]`;

    // 4. Procesar cada trabajador por RUT
    const results: Array<{ rut: string; status: 'CREATED' | 'ALREADY_EXISTS' | 'NOT_FOUND'; error?: string }> = [];
    const bonusAmount = bonusType.default_amount;

    // Cargar todo el personal para mapeo infalible por RUT normalizado
    const { data: allPersonnel } = await admin
      .from('personnel')
      .select('id, first_name, last_name_father, rut');

    const personnelList = allPersonnel || [];
    const normalizeRut = (r?: string | null) => (r || '').replace(/[^0-9kK]/g, '').toUpperCase();
    const externalRef = body.work_order_id ? `WOMM-WO-${body.work_order_id}` : cleanOt;

    for (const rawWorker of workers) {
      const rawRut = typeof rawWorker === 'string' ? rawWorker : rawWorker?.rut;
      if (!rawRut) continue;

      const cleanWorkerRut = normalizeRut(rawRut);

      // Buscar colaborador en personnel
      const person = personnelList.find(p => normalizeRut(p.rut) === cleanWorkerRut);

      if (!person) {
        results.push({ rut: rawRut, status: 'NOT_FOUND', error: 'RUT no encontrado en personal de HRM' });
        continue;
      }

      // Verificar si ya tiene registrado este bono activo para esta OT o este ID de WO
      let existingQuery = admin
        .from('bonus_records')
        .select('id, ot_number')
        .eq('personnel_id', person.id)
        .eq('bonus_type_id', bonusType.id)
        .eq('status', 'active');

      if (body.work_order_id) {
        existingQuery = existingQuery.or(`ot_number.eq.${cleanOt},external_ref.eq.${externalRef}`);
      } else {
        existingQuery = existingQuery.eq('ot_number', cleanOt);
      }

      const { data: existingBonus } = await existingQuery.maybeSingle();

      if (existingBonus) {
        // Si ya existía pero con OT provisoria o diferente, actualizar al número definitivo
        if (existingBonus.ot_number !== cleanOt) {
          await admin
            .from('bonus_records')
            .update({
              ot_number: cleanOt,
              observations: observations.trim() || null,
              external_ref: externalRef,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingBonus.id);
        }
        results.push({ rut: rawRut, status: 'ALREADY_EXISTS' });
        continue;
      }

      // Insertar el bono automático
      const { error: insertError } = await admin
        .from('bonus_records')
        .insert({
          personnel_id: person.id,
          bonus_type_id: bonusType.id,
          date: date,
          amount: bonusAmount,
          ot_number: cleanOt,
          observations: observations.trim() || null,
          paid_month: null,
          status: 'active',
          source: 'womm',
          external_ref: externalRef,
        });

      if (insertError) {
        results.push({ rut: rawRut, status: 'NOT_FOUND', error: insertError.message });
      } else {
        results.push({ rut: rawRut, status: 'CREATED' });
      }
    }

    const createdCount = results.filter(r => r.status === 'CREATED').length;

    return NextResponse.json({
      success: true,
      ot_number: cleanOt,
      bonus_type: bonusType.name,
      amount: bonusAmount,
      created_count: createdCount,
      details: results,
      timestamp: new Date().toISOString()
    });

  } catch (err: any) {
    console.error('[WOMM Integration Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
