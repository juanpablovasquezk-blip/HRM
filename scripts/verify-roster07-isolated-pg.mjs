/**
 * ROSTER-07: Procedimiento reproducible de verificación en instancia aislada de Supabase / PostgreSQL.
 *
 * Requisitos de entorno (instancia AISLADA, jamás la base operativa):
 *   TEST_DATABASE_URL="postgresql://postgres:...@db.<proyecto-aislado>.supabase.co:5432/postgres"
 *   TEST_SUPABASE_URL="https://<proyecto-aislado>.supabase.co"
 *   TEST_SUPABASE_SERVICE_ROLE_KEY="..."
 *   TEST_SUPABASE_ANON_KEY="..."
 *
 * Uso:
 *   node scripts/verify-roster07-isolated-pg.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const testDbUrl = process.env.TEST_DATABASE_URL;
const testSbUrl = process.env.TEST_SUPABASE_URL;
const testServiceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const testAnonKey = process.env.TEST_SUPABASE_ANON_KEY;
const authorizedProjectRef = process.env.AUTHORIZED_ISOLATED_PROJECT_REF || null;
const prodSbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

function extractSupabaseRefFromApiUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const m = u.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return { host: u.hostname.toLowerCase(), ref: m ? m[1].toLowerCase() : null };
  } catch {
    return { host: null, ref: null };
  }
}

function extractSupabaseRefFromDbUrl(dbStr) {
  try {
    const u = new URL(dbStr);
    const host = u.hostname.toLowerCase();
    const user = decodeURIComponent(u.username || '').toLowerCase();
    const dbHostMatch = host.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i);
    const poolerUserMatch = user.match(/^postgres\.([a-z0-9-]+)$/i);
    return {
      host,
      ref: dbHostMatch?.[1] || poolerUserMatch?.[1] || null,
      isLocal: host === 'localhost' || host === '127.0.0.1' || host === '::1',
    };
  } catch {
    return { host: null, ref: null, isLocal: false };
  }
}

if (!testDbUrl || !testSbUrl || !testServiceKey || !testAnonKey) {
  console.error(
    '[BLOQUEO] Faltan variables de entorno de la instancia aislada (TEST_DATABASE_URL, TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_ROLE_KEY, TEST_SUPABASE_ANON_KEY).'
  );
  process.exit(2);
}

const apiInfo = extractSupabaseRefFromApiUrl(testSbUrl);
const dbInfo = extractSupabaseRefFromDbUrl(testDbUrl);
const prodInfo = prodSbUrl ? extractSupabaseRefFromApiUrl(prodSbUrl) : { host: null, ref: null };

if (!apiInfo.host || !dbInfo.host) {
  console.error('[ABORTADO] No se pudo verificar el destino de TEST_SUPABASE_URL o TEST_DATABASE_URL.');
  process.exit(3);
}

if (
  (prodSbUrl && testSbUrl.replace(/\/+$/, '') === prodSbUrl.replace(/\/+$/, '')) ||
  (prodInfo.ref && (apiInfo.ref === prodInfo.ref || dbInfo.ref === prodInfo.ref)) ||
  (prodInfo.host && dbInfo.host.includes(prodInfo.host))
) {
  console.error('[ABORTADO] TEST_SUPABASE_URL o TEST_DATABASE_URL apunta al proyecto operativo.');
  process.exit(3);
}

if (apiInfo.ref && dbInfo.ref && apiInfo.ref !== dbInfo.ref) {
  console.error(
    `[ABORTADO] Desajuste entre API (${apiInfo.ref}) y SQL (${dbInfo.ref}); no apuntan al mismo proyecto aislado.`
  );
  process.exit(3);
}

if (!apiInfo.ref && !dbInfo.isLocal) {
  console.error('[ABORTADO] No se pudo confirmar que SQL y API apunten al mismo proyecto aislado.');
  process.exit(3);
}

if (authorizedProjectRef && apiInfo.ref !== authorizedProjectRef.toLowerCase()) {
  console.error(
    `[ABORTADO] El proyecto (${apiInfo.ref}) no coincide con AUTHORIZED_ISOLATED_PROJECT_REF (${authorizedProjectRef}).`
  );
  process.exit(3);
}

const sql = postgres(testDbUrl, { max: 4 });
const sbService = createClient(testSbUrl, testServiceKey, { auth: { persistSession: false } });
const sbAnon = createClient(testSbUrl, testAnonKey, { auth: { persistSession: false } });

async function verifySqlAndApiSameIsolatedInstance() {
  console.log('0. Verificando en solo lectura que SQL y API apunten al mismo proyecto aislado...');
  const sqlAreas = await sql`SELECT id, name FROM public.areas ORDER BY id LIMIT 10`;
  const { data: apiAreas, error: apiErr } = await sbService
    .from('areas')
    .select('id, name')
    .order('id', { ascending: true })
    .limit(10);
  if (apiErr) {
    throw new Error(`[ABORTADO] Falló la verificación de API en instancia aislada: ${apiErr.message}`);
  }
  assert.deepEqual(
    (apiAreas || []).map((a) => `${a.id}:${a.name}`),
    sqlAreas.map((a) => `${a.id}:${a.name}`),
    'La conexión SQL y la API REST no devuelven el mismo catálogo; abortado antes de escribir.'
  );
}

async function main() {
  await verifySqlAndApiSameIsolatedInstance();

  console.log('1. Aplicando migraciones de ROSTER-08 y ROSTER-07 en instancia aislada...');
  const mig08 = fs.readFileSync(
    path.resolve('docs/migrations/roster08-vacancy-extra-links.sql'),
    'utf8'
  );
  const mig07 = fs.readFileSync(
    path.resolve('docs/migrations/roster07-activation-and-snapshots.sql'),
    'utf8'
  );
  await sql.unsafe(mig08);
  await sql.unsafe(mig07);

  console.log('2. Verificando que anon y authenticated NO puedan invocar las RPC directamente...');
  const { error: anonSaveErr } = await sbAnon.rpc('save_v2_schedule_tx', {
    p_start_date: '2026-11-20',
    p_end_date: '2026-11-20',
    p_filters: {},
    p_ns22_confirmation: {},
    p_expected_baseline_at: null,
    p_expected_baseline_hash: null,
    p_delete_assignment_ids: [],
    p_insert_assignments: [],
    p_upsert_extra_requirements: [],
    p_delete_requirement_ids: [],
  });
  assert.ok(anonSaveErr, 'anon no debe poder ejecutar save_v2_schedule_tx');

  const [{ anon_can_save, auth_can_save, anon_can_rec, auth_can_rec }] = await sql`
    SELECT
      has_function_privilege('anon', 'public.save_v2_schedule_tx(date,date,jsonb,jsonb,timestamptz,text,uuid[],jsonb,jsonb,uuid[])', 'EXECUTE') AS anon_can_save,
      has_function_privilege('authenticated', 'public.save_v2_schedule_tx(date,date,jsonb,jsonb,timestamptz,text,uuid[],jsonb,jsonb,uuid[])', 'EXECUTE') AS auth_can_save,
      has_function_privilege('anon', 'public.recover_v2_snapshot_tx(uuid,boolean)', 'EXECUTE') AS anon_can_rec,
      has_function_privilege('authenticated', 'public.recover_v2_snapshot_tx(uuid,boolean)', 'EXECUTE') AS auth_can_rec
  `;
  assert.equal(anon_can_save, false);
  assert.equal(auth_can_save, false);
  assert.equal(anon_can_rec, false);
  assert.equal(auth_can_rec, false);

  console.log('3. Sembrando datos sintéticos de prueba...');
  const testDate = '2099-11-20';
  const [area] = await sql`SELECT id FROM public.areas LIMIT 1`;
  const [pos] = await sql`SELECT id FROM public.positions LIMIT 1`;
  const [shift] = await sql`SELECT id FROM public.shifts LIMIT 1`;
  const people = await sql`SELECT id FROM public.personnel WHERE is_active = true LIMIT 2`;
  assert.ok(area && pos && shift && people.length >= 2, 'Catálogo sintético insuficiente');

  await sql`DELETE FROM public.shift_assignments WHERE date = ${testDate}`;
  await sql`DELETE FROM public.shift_requirements WHERE date = ${testDate}`;

  const [ordReq] = await sql`
    INSERT INTO public.shift_requirements (date, area_id, position_id, shift_id, required_count, is_extra, updated_at)
    VALUES (${testDate}, ${area.id}, ${pos.id}, ${shift.id}, 2, false, now())
    RETURNING id, updated_at
  `;
  const [draftAsg] = await sql`
    INSERT INTO public.shift_assignments (
      personnel_id, shift_id, date, area_id, position_id, status,
      is_locked, is_manual, is_confirmed, is_validated, is_published, frozen_by_rule, is_extra, updated_at
    )
    VALUES (
      ${people[0].id}, ${shift.id}, ${testDate}, ${area.id}, ${pos.id}, 'scheduled',
      false, false, false, false, false, false, false, now()
    )
    RETURNING id, updated_at
  `;

  console.log('4. Probando fallo intermedio en save_v2_schedule_tx (rollback atómico)...');
  const { error: failTxErr } = await sbService.rpc('save_v2_schedule_tx', {
    p_start_date: testDate,
    p_end_date: testDate,
    p_filters: {},
    p_ns22_confirmation: { confirmed: true },
    p_expected_baseline_at: null,
    p_expected_baseline_hash: null,
    p_delete_assignment_ids: [draftAsg.id],
    p_insert_assignments: [
      {
        personnel_id: '00000000-0000-0000-0000-000000000000', // Violación FK intencional
        shift_id: shift.id,
        date: testDate,
        area_id: area.id,
        position_id: pos.id,
        status: 'scheduled',
        is_extra: false,
      },
    ],
    p_upsert_extra_requirements: [],
    p_delete_requirement_ids: [],
  });
  assert.ok(failTxErr, 'Debe fallar por violación FK');
  const remainingAfterFail = await sql`
    SELECT id FROM public.shift_assignments WHERE id = ${draftAsg.id}
  `;
  assert.equal(remainingAfterFail.length, 1, 'El borrador previo debe seguir intacto tras rollback');

  console.log('5. Probando concurrencia entre dos sesiones (edición/eliminación entre lectura y escritura)...');
  const [{ hash: baselineHash }] = await sql`
    SELECT public.compute_roster_range_hash(${testDate}::date, ${testDate}::date) AS hash
  `;
  // Sesión 2 elimina draftAsg entre la lectura de Sesión 1 y la escritura de Sesión 1
  const sqlSession2 = postgres(testDbUrl, { max: 1 });
  await sqlSession2`DELETE FROM public.shift_assignments WHERE id = ${draftAsg.id}`;
  await sqlSession2.end();

  const { error: concurrentErr } = await sbService.rpc('save_v2_schedule_tx', {
    p_start_date: testDate,
    p_end_date: testDate,
    p_filters: {},
    p_ns22_confirmation: { confirmed: true },
    p_expected_baseline_at: null,
    p_expected_baseline_hash: baselineHash,
    p_delete_assignment_ids: [],
    p_insert_assignments: [],
    p_upsert_extra_requirements: [],
    p_delete_requirement_ids: [],
  });
  assert.ok(concurrentErr && concurrentErr.message.includes('CONCURRENT_MODIFICATION'));

  console.log('6. Probando guardado limpio, recuperación y flujo de Dotación Extra en PostgreSQL real...');
  const { data: saveData, error: saveErr } = await sbService.rpc('save_v2_schedule_tx', {
    p_start_date: testDate,
    p_end_date: testDate,
    p_filters: {},
    p_ns22_confirmation: { confirmed: true },
    p_expected_baseline_at: null,
    p_expected_baseline_hash: null,
    p_delete_assignment_ids: [],
    p_insert_assignments: [
      {
        personnel_id: people[0].id,
        shift_id: shift.id,
        date: testDate,
        area_id: area.id,
        position_id: pos.id,
        status: 'scheduled',
        is_extra: false,
      },
    ],
    p_upsert_extra_requirements: [
      {
        date: testDate,
        area_id: area.id,
        position_id: pos.id,
        shift_id: shift.id,
        required_count: 1,
        manual_count: 0,
        auto_vacancy_count: 1,
        linked_requirement_id: ordReq.id,
      },
    ],
    p_delete_requirement_ids: [],
  });
  assert.equal(saveErr, null);
  assert.ok(saveData?.snapshot_id);

  // Extra vinculado nuevo + verificación fuera del rol ordinario y 1 vez en Bonos
  const { error: extErr } = await sbService.from('shift_assignments').insert({
    personnel_id: people[1].id,
    shift_id: shift.id,
    date: testDate,
    area_id: area.id,
    position_id: pos.id,
    status: 'scheduled',
    is_extra: true,
    is_manual: true,
    extra_target: 'v2_vacancy',
    linked_requirement_id: ordReq.id,
  });
  assert.equal(extErr, null);

  const ordRoleP2 = await sql`
    SELECT id FROM public.shift_assignments
    WHERE personnel_id = ${people[1].id} AND date = ${testDate} AND is_extra = false AND status <> 'cancelled'
  `;
  assert.equal(ordRoleP2.length, 0);

  const bonosP2 = await sql`
    SELECT id, extra_target, linked_requirement_id FROM public.shift_assignments
    WHERE personnel_id = ${people[1].id} AND date = ${testDate} AND is_extra = true
      AND status <> 'cancelled' AND (attendance_status IS NULL OR attendance_status <> 'absent')
  `;
  assert.equal(bonosP2.length, 1);
  assert.equal(bonosP2[0].extra_target, 'v2_vacancy');
  assert.equal(bonosP2[0].linked_requirement_id, ordReq.id);

  // Recuperación concurrente: Sesión 2 edita desde el flujo habitual HRM mientras se intenta recuperar
  await sbService.from('shift_assignments').update({ is_manual: true, updated_at: new Date(Date.now() + 5000).toISOString() }).eq('date', testDate).eq('is_extra', false);
  const { error: concurrentRecErr } = await sbService.rpc('recover_v2_snapshot_tx', {
    p_snapshot_id: saveData.snapshot_id,
    p_force: false,
  });
  assert.ok(concurrentRecErr && concurrentRecErr.message.includes('CONCURRENT_MODIFICATION'));
  const manualAfterBlockedRec = await sql`
    SELECT is_manual FROM public.shift_assignments WHERE date = ${testDate} AND is_extra = false
  `;
  assert.equal(manualAfterBlockedRec[0]?.is_manual, true, 'El cambio ajeno debe preservarse');

  // Recuperación forzada para limpiar datos de prueba al estado previo del snapshot
  const { error: recErr } = await sbService.rpc('recover_v2_snapshot_tx', {
    p_snapshot_id: saveData.snapshot_id,
    p_force: true,
  });
  assert.equal(recErr, null);

  await sql`DELETE FROM public.shift_assignments WHERE date = ${testDate}`;
  await sql`DELETE FROM public.shift_requirements WHERE date = ${testDate}`;
  await sql`DELETE FROM public.roster_v2_snapshots WHERE start_date = ${testDate}`;

  console.log('VERIFICACIÓN EN POSTGRESQL AISLADO COMPLETADA CON ÉXITO.');
}

main()
  .catch((err) => {
    console.error('ERROR EN VERIFICACIÓN:', err);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end();
  });
