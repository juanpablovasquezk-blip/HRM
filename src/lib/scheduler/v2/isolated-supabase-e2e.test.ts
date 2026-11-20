import test from 'node:test';
import assert from 'node:assert/strict';
import { runSchedulerV2, recoverV2RosterAction } from '../../../app/(dashboard)/shifts/actions';
import { assignExtraPersonnel } from '../../../app/(dashboard)/shifts/daily/actions';
import { getBonosReportData } from '../../../app/(dashboard)/reports/bonos/actions';
import { fetchDailyOperationalData } from '../../../lib/shifts/daily-operational-data';
import {
  computeRangeStateHash,
  getDefaultSchedulerEngine,
  isV2SaveEnabled,
  type Ns22OperationalConfirmation,
} from './index';

type Row = Record<string, any>;

/**
 * Cliente Supabase aislado en memoria con transacciones atómicas,
 * restricciones únicas y esquema completo de ROSTER-07 + ROSTER-08.
 */
class IsolatedSupabaseClient {
  tables: Record<string, Row[]> = {
    areas: [],
    positions: [],
    shifts: [],
    personnel: [],
    leaves: [],
    shift_requirements: [],
    shift_assignments: [],
    roster_v2_snapshots: [],
    transport_requests: [],
    special_bonuses: [],
  };

  failOnTableWrite: { table: string; op: 'insert' | 'upsert' | 'update' | 'delete' } | null = null;
  private seq = 1;

  nextUuid(prefix = '00000000-0000-4000-8000-'): string {
    const tail = String(this.seq++).padStart(12, '0');
    return `${prefix}${tail}`;
  }

  async __runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    const backup = JSON.parse(JSON.stringify(this.tables));
    try {
      return await fn();
    } catch (err) {
      this.tables = backup;
      throw err;
    }
  }

  rpcCalls: string[] = [];
  beforeRpc: ((fn: string) => Promise<void>) | null = null;

  rpc = async (fn: string, args: Record<string, any> = {}) => {
    this.rpcCalls.push(fn);
    if (this.beforeRpc) {
      await this.beforeRpc(fn);
    }
    try {
      const data = await this.__runInTransaction(async () => {
        if (fn === 'save_v2_schedule_tx') {
          const startDate = String(args.p_start_date);
          const endDate = String(args.p_end_date);
          const rangeAssigns = this.tables.shift_assignments.filter(
            (a) => a.date >= startDate && a.date <= endDate
          );
          const rangeReqs = this.tables.shift_requirements.filter(
            (r) => r.date >= startDate && r.date <= endDate
          );
          let maxTs: string | null = null;
          for (const row of [...rangeAssigns, ...rangeReqs]) {
            if (row.updated_at && (!maxTs || row.updated_at > maxTs)) maxTs = row.updated_at;
          }
          const currentHash = computeRangeStateHash(rangeAssigns as any, rangeReqs as any);
          if (
            (args.p_expected_baseline_at && maxTs && maxTs > args.p_expected_baseline_at) ||
            (args.p_expected_baseline_hash && currentHash !== args.p_expected_baseline_hash)
          ) {
            throw new Error(
              `CONCURRENT_MODIFICATION: Otro supervisor editó o eliminó registros en el rango ${startDate}..${endDate}.`
            );
          }

          const snapshotId = this.nextUuid();
          const snapRow: Row = {
            id: snapshotId,
            start_date: startDate,
            end_date: endDate,
            engine: 'v2',
            filters: args.p_filters || {},
            assignments_backup: JSON.parse(JSON.stringify(rangeAssigns)),
            requirements_backup: JSON.parse(JSON.stringify(rangeReqs)),
            ns22_confirmation: args.p_ns22_confirmation || {},
            baseline_max_updated_at: maxTs,
            baseline_state_hash: currentHash,
            created_at: new Date().toISOString(),
            saved_completed_at: null,
            post_save_state_hash: null,
            restored_at: null,
          };
          this.tables.roster_v2_snapshots.push(snapRow);

          const delIds: string[] = args.p_delete_assignment_ids || [];
          if (delIds.length > 0) {
            const { error } = await this.from('shift_assignments').delete().in('id', delIds);
            if (error) throw new Error(error.message);
          }

          const inserts: Row[] = args.p_insert_assignments || [];
          if (inserts.length > 0) {
            const { error } = await this.from('shift_assignments').upsert(inserts, {
              onConflict: 'personnel_id,date,shift_id,is_extra',
              ignoreDuplicates: false,
            });
            if (error) throw new Error(error.message);
          }

          const extraReqs: Row[] = args.p_upsert_extra_requirements || [];
          if (extraReqs.length > 0) {
            const mapped = extraReqs.map((r) => ({
              date: r.date,
              area_id: r.area_id,
              position_id: r.position_id,
              shift_id: r.shift_id,
              is_extra: true,
              required_count: r.required_count,
              manual_extra_count: r.manual_count,
              auto_vacancy_count: r.auto_vacancy_count,
              linked_requirement_id: r.linked_requirement_id ?? null,
            }));
            const { error } = await this.from('shift_requirements').upsert(mapped, {
              onConflict: 'area_id,position_id,shift_id,date,is_extra',
              ignoreDuplicates: false,
            });
            if (error) throw new Error(error.message);
          }

          const delReqIds: string[] = args.p_delete_requirement_ids || [];
          if (delReqIds.length > 0) {
            const { error } = await this.from('shift_requirements').delete().in('id', delReqIds);
            if (error) throw new Error(error.message);
          }

          const postAssigns = this.tables.shift_assignments.filter(
            (a) => a.date >= startDate && a.date <= endDate
          );
          const postReqs = this.tables.shift_requirements.filter(
            (r) => r.date >= startDate && r.date <= endDate
          );
          snapRow.saved_completed_at = new Date().toISOString();
          snapRow.post_save_state_hash = computeRangeStateHash(postAssigns as any, postReqs as any);
          return {
            success: true,
            snapshot_id: snapshotId,
            saved_completed_at: snapRow.saved_completed_at,
            post_save_state_hash: snapRow.post_save_state_hash,
          };
        }

        if (fn === 'recover_v2_snapshot_tx') {
          const snap = this.tables.roster_v2_snapshots.find((s) => s.id === args.p_snapshot_id);
          if (!snap) throw new Error(`SNAPSHOT_NOT_FOUND: ${args.p_snapshot_id}`);

          const curAssigns = this.tables.shift_assignments.filter(
            (a) => a.date >= snap.start_date && a.date <= snap.end_date
          );
          const curReqs = this.tables.shift_requirements.filter(
            (r) => r.date >= snap.start_date && r.date <= snap.end_date
          );
          let curMax: string | null = null;
          for (const row of [...curAssigns, ...curReqs]) {
            if (row.updated_at && (!curMax || row.updated_at > curMax)) curMax = row.updated_at;
          }
          const curHash = computeRangeStateHash(curAssigns as any, curReqs as any);
          if (
            !args.p_force &&
            ((snap.saved_completed_at && curMax && curMax > snap.saved_completed_at) ||
              (snap.post_save_state_hash && curHash !== snap.post_save_state_hash))
          ) {
            throw new Error(
              'CONCURRENT_MODIFICATION: Existen ediciones o eliminaciones posteriores realizadas por otro supervisor.'
            );
          }

          this.tables.shift_assignments = [
            ...this.tables.shift_assignments.filter(
              (a) => a.date < snap.start_date || a.date > snap.end_date
            ),
            ...JSON.parse(JSON.stringify(snap.assignments_backup)),
          ];
          this.tables.shift_requirements = [
            ...this.tables.shift_requirements.filter(
              (r) => r.date < snap.start_date || r.date > snap.end_date
            ),
            ...JSON.parse(JSON.stringify(snap.requirements_backup)),
          ];
          snap.restored_at = new Date().toISOString();
          return {
            success: true,
            snapshot_id: snap.id,
            restored_assignments_count: snap.assignments_backup.length,
            restored_requirements_count: snap.requirements_backup.length,
          };
        }

        throw new Error(`RPC desconocida: ${fn}`);
      });
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message || String(err) } };
    }
  };

  from(table: string) {
    const client = this;
    const state: {
      op: 'select' | 'insert' | 'upsert' | 'update' | 'delete';
      payload?: any;
      upsertOpts?: { onConflict?: string; ignoreDuplicates?: boolean };
      filters: Array<(row: Row) => boolean>;
      orderBy: Array<{ col: string; asc: boolean }>;
      rangeBounds?: [number, number];
      limitCount?: number;
      wantSingle?: 'single' | 'maybeSingle';
      returning?: boolean;
    } = {
      op: 'select',
      filters: [],
      orderBy: [],
    };

    const hydrateRow = (row: Row): Row => {
      const copy = { ...row };
      if (table === 'shift_assignments') {
        copy.personnel = client.tables.personnel.find((p) => p.id === row.personnel_id) || null;
        copy.shift = client.tables.shifts.find((s) => s.id === row.shift_id) || null;
        copy.area = client.tables.areas.find((a) => a.id === row.area_id) || null;
        copy.position = client.tables.positions.find((p) => p.id === row.position_id) || null;
      } else if (table === 'shift_requirements') {
        copy.shift = client.tables.shifts.find((s) => s.id === row.shift_id) || null;
        copy.area = client.tables.areas.find((a) => a.id === row.area_id) || null;
        copy.position = client.tables.positions.find((p) => p.id === row.position_id) || null;
      }
      return copy;
    };

    const execute = async (): Promise<{ data: any; error: any }> => {
      try {
        const rows = client.tables[table] || (client.tables[table] = []);

        if (state.op === 'select') {
          let matched = rows.filter((r) => state.filters.every((f) => f(r))).map(hydrateRow);
          for (const ord of [...state.orderBy].reverse()) {
            matched.sort((a, b) => {
              const av = String(a[ord.col] ?? '');
              const bv = String(b[ord.col] ?? '');
              return ord.asc ? av.localeCompare(bv) : bv.localeCompare(av);
            });
          }
          if (state.rangeBounds) {
            matched = matched.slice(state.rangeBounds[0], state.rangeBounds[1] + 1);
          }
          if (typeof state.limitCount === 'number') {
            matched = matched.slice(0, state.limitCount);
          }
          if (state.wantSingle === 'single') {
            if (matched.length === 0) return { data: null, error: { message: 'No rows found' } };
            return { data: matched[0], error: null };
          }
          if (state.wantSingle === 'maybeSingle') {
            return { data: matched[0] || null, error: null };
          }
          return { data: matched, error: null };
        }

        if (client.failOnTableWrite && client.failOnTableWrite.table === table && client.failOnTableWrite.op === state.op) {
          return { data: null, error: { message: `Fallo simulado en ${table}.${state.op}` } };
        }

        if (state.op === 'insert') {
          const items = Array.isArray(state.payload) ? state.payload : [state.payload];
          const inserted: Row[] = [];
          for (const item of items) {
            const newRow: Row = {
              id: item.id || client.nextUuid(),
              updated_at: item.updated_at || new Date().toISOString(),
              ...item,
            };
            rows.push(newRow);
            inserted.push({ ...newRow });
          }
          if (state.wantSingle === 'single') return { data: inserted[0], error: null };
          return { data: state.returning ? inserted : null, error: null };
        }

        if (state.op === 'upsert') {
          const items = Array.isArray(state.payload) ? state.payload : [state.payload];
          const conflictCols = (state.upsertOpts?.onConflict || 'id').split(',').map((c) => c.trim());
          const out: Row[] = [];
          for (const item of items) {
            const idx = rows.findIndex((r) => conflictCols.every((c) => String(r[c]) === String(item[c])));
            if (idx >= 0) {
              if (!state.upsertOpts?.ignoreDuplicates) {
                rows[idx] = { ...rows[idx], ...item, updated_at: item.updated_at || new Date().toISOString() };
              }
              out.push({ ...rows[idx] });
            } else {
              const newRow: Row = {
                id: item.id || client.nextUuid(),
                updated_at: item.updated_at || new Date().toISOString(),
                ...item,
              };
              rows.push(newRow);
              out.push({ ...newRow });
            }
          }
          return { data: out, error: null };
        }

        if (state.op === 'update') {
          const updated: Row[] = [];
          for (let i = 0; i < rows.length; i++) {
            if (state.filters.every((f) => f(rows[i]))) {
              rows[i] = { ...rows[i], ...state.payload, updated_at: new Date().toISOString() };
              updated.push({ ...rows[i] });
            }
          }
          return { data: updated, error: null };
        }

        if (state.op === 'delete') {
          const kept: Row[] = [];
          const deleted: Row[] = [];
          for (const r of rows) {
            if (state.filters.every((f) => f(r))) deleted.push(r);
            else kept.push(r);
          }
          client.tables[table] = kept;
          return { data: deleted, error: null };
        }

        return { data: null, error: null };
      } catch (err: any) {
        return { data: null, error: { message: err?.message || String(err) } };
      }
    };

    const builder: any = {
      select() {
        state.returning = true;
        return builder;
      },
      insert(payload: any) {
        state.op = 'insert';
        state.payload = payload;
        return builder;
      },
      upsert(payload: any, opts?: any) {
        state.op = 'upsert';
        state.payload = payload;
        state.upsertOpts = opts;
        return builder;
      },
      update(payload: any) {
        state.op = 'update';
        state.payload = payload;
        return builder;
      },
      delete() {
        state.op = 'delete';
        return builder;
      },
      eq(col: string, val: any) {
        state.filters.push((r) => r[col] === val);
        return builder;
      },
      neq(col: string, val: any) {
        state.filters.push((r) => r[col] !== val);
        return builder;
      },
      gte(col: string, val: any) {
        state.filters.push((r) => String(r[col] ?? '') >= String(val));
        return builder;
      },
      lte(col: string, val: any) {
        state.filters.push((r) => String(r[col] ?? '') <= String(val));
        return builder;
      },
      in(col: string, vals: any[]) {
        const set = new Set(vals);
        state.filters.push((r) => set.has(r[col]));
        return builder;
      },
      or(expr: string) {
        // Soporta filtros como attendance_status.is.null,attendance_status.neq.absent
        const parts = expr.split(',').map((p) => p.trim());
        state.filters.push((r) =>
          parts.some((p) => {
            const [col, op, val] = p.split('.');
            if (op === 'is' && val === 'null') return r[col] === null || r[col] === undefined;
            if (op === 'neq') return r[col] !== val;
            return true;
          })
        );
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        state.orderBy.push({ col, asc: opts?.ascending !== false });
        return builder;
      },
      range(from: number, to: number) {
        state.rangeBounds = [from, to];
        return builder;
      },
      limit(n: number) {
        state.limitCount = n;
        return builder;
      },
      single() {
        state.wantSingle = 'single';
        return execute();
      },
      maybeSingle() {
        state.wantSingle = 'maybeSingle';
        return execute();
      },
      then(resolve: any, reject: any) {
        return execute().then(resolve, reject);
      },
    };

    return builder;
  }
}

function seedBaseCatalog(db: IsolatedSupabaseClient) {
  db.tables.areas = [
    { id: 'area-base', name: 'Base' },
    { id: 'area-aero', name: 'Aeropuerto' },
  ];
  db.tables.positions = [
    { id: 'pos-op', name: 'Operador de grúa', requires_shifts: true },
  ];
  db.tables.shifts = [
    { id: 'sh-am', name: 'AM 08', start_time: '08:00:00', end_time: '17:00:00', duration_hours: 8 },
    { id: 'sh-ns22', name: 'NS 22', start_time: '22:00:00', end_time: '07:00:00', duration_hours: 8 },
  ];
  db.tables.personnel = [
    {
      id: 'p-1',
      first_name: 'Juan',
      last_name_father: 'Pérez',
      last_name_mother: 'Soto',
      rut: '11.111.111-1',
      main_position: 'pos-op',
      secondary_positions: [],
      is_active: true,
      requires_shifts: true,
      company_id: 'comp-1',
    },
    {
      id: 'p-2',
      first_name: 'Ana',
      last_name_father: 'Díaz',
      last_name_mother: 'Lagos',
      rut: '22.222.222-2',
      main_position: 'pos-op',
      secondary_positions: [],
      is_active: true,
      requires_shifts: true,
      company_id: 'comp-1',
    },
    {
      id: 'p-extra',
      first_name: 'Luis',
      last_name_father: 'Rojas',
      last_name_mother: 'Vera',
      rut: '33.333.333-3',
      main_position: 'pos-op',
      secondary_positions: [],
      is_active: true,
      requires_shifts: true,
      company_id: 'comp-1',
    },
    {
      id: 'tit-1',
      first_name: 'JAVIER IGNACIO',
      last_name_father: 'LOPEZ',
      last_name_mother: '',
      rut: '44.444.444-4',
      main_position: 'pos-op',
      secondary_positions: [],
      is_active: true,
      requires_shifts: true,
      company_id: 'comp-1',
    },
    {
      id: 'tit-2',
      first_name: 'MARCELO ANDRES',
      last_name_father: 'JARA',
      last_name_mother: '',
      rut: '55.555.555-5',
      main_position: 'pos-op',
      secondary_positions: [],
      is_active: true,
      requires_shifts: true,
      company_id: 'comp-1',
    },
  ];
}

const CONFIRMED_NS22: Ns22OperationalConfirmation = {
  confirmed: true,
  scheduleConfirmed: true,
  regimeConfirmed: true,
  titulares: [
    { personnelId: 'tit-1', name: 'JAVIER IGNACIO LOPEZ', anchorStatus: 'confirmed', confirmedAnchorDate: '2026-11-08' },
    { personnelId: 'tit-2', name: 'MARCELO ANDRES JARA', anchorStatus: 'confirmed', confirmedAnchorDate: '2026-11-04' },
  ],
};

test('ROSTER-07 E2E (acciones reales en Supabase aislado): guardar v2, recargar Planificación Diaria, recuperar respaldo y volver a v1', async () => {
  const prevTest = process.env.ROSTER_ISOLATED_TEST;
  const prevSave = process.env.ROSTER_V2_SAVE_ENABLED;
  const prevLinks = process.env.ROSTER_V2_EXTRA_LINKS;
  process.env.ROSTER_ISOLATED_TEST = 'true';
  process.env.ROSTER_V2_SAVE_ENABLED = 'true';
  process.env.ROSTER_V2_EXTRA_LINKS = 'true';

  try {
    const db = new IsolatedSupabaseClient();
    seedBaseCatalog(db);
    db.tables.shift_requirements = [
      {
        id: 'req-base-1',
        date: '2026-11-18',
        area_id: 'area-base',
        position_id: 'pos-op',
        shift_id: 'sh-am',
        required_count: 2,
        is_extra: false,
        priority: 'Normal',
        updated_at: '2026-11-17T10:00:00.000Z',
      },
    ];
    db.tables.shift_assignments = [
      {
        id: 'asg-prev-draft',
        personnel_id: 'p-1',
        shift_id: 'sh-am',
        date: '2026-11-18',
        area_id: 'area-base',
        position_id: 'pos-op',
        status: 'scheduled',
        is_locked: false,
        is_manual: false,
        is_confirmed: false,
        is_validated: false,
        is_published: false,
        frozen_by_rule: false,
        original_shift_id: 'sh-am',
        is_extra: false,
        updated_at: '2026-11-17T10:00:00.000Z',
      },
    ];

    // 1. Guardar propuesta usando la acción real runSchedulerV2
    const saveRes: any = await runSchedulerV2({
      startDate: '2026-11-18',
      endDate: '2026-11-18',
      areaId: 'area-base',
      ns22Confirmation: CONFIRMED_NS22,
      testHooks: { supabase: db },
    });
    assert.equal(saveRes.success, true);
    assert.ok(saveRes.snapshotId);

    // 2. Recargar Planificación Diaria usando fetchDailyOperationalData
    const dailyAfterSave: any = await fetchDailyOperationalData('2026-11-18', db as any);
    assert.ok(!dailyAfterSave.error, dailyAfterSave.error);
    assert.ok(
      dailyAfterSave.assignments.length >= 2,
      `Expected >=2 assignments, got ${dailyAfterSave.assignments.length} (inserted=${saveRes.insertedCount}, stats=${JSON.stringify(saveRes.v2Result?.stats)}, vacancies=${JSON.stringify(saveRes.v2Result?.remaining_vacancies)})`
    );

    // 3. Recuperar roster previo desde el respaldo usando la acción real recoverV2RosterAction
    const recoverRes = await recoverV2RosterAction({
      snapshotId: saveRes.snapshotId,
      testHooks: { supabase: db },
    });
    assert.equal(recoverRes.success, true);

    const dailyAfterRecover: any = await fetchDailyOperationalData('2026-11-18', db as any);
    assert.equal(dailyAfterRecover.assignments.length, 1);
    assert.equal(dailyAfterRecover.assignments[0].id, 'asg-prev-draft');

    // 4. Comprobar por separado que v1 sigue siendo predeterminado/seleccionable y que se usaron las RPC SQL
    assert.equal(getDefaultSchedulerEngine(), 'v1');
    assert.ok(db.rpcCalls.includes('save_v2_schedule_tx'));
    assert.ok(db.rpcCalls.includes('recover_v2_snapshot_tx'));
  } finally {
    process.env.ROSTER_ISOLATED_TEST = prevTest;
    process.env.ROSTER_V2_SAVE_ENABLED = prevSave;
    process.env.ROSTER_V2_EXTRA_LINKS = prevLinks;
  }
});

test('ROSTER-07 E2E (transacción y concurrencia): rollback en fallo intermedio, protección ante cambios de otro supervisor y preservación', async () => {
  const prevTest = process.env.ROSTER_ISOLATED_TEST;
  const prevSave = process.env.ROSTER_V2_SAVE_ENABLED;
  process.env.ROSTER_ISOLATED_TEST = 'true';
  process.env.ROSTER_V2_SAVE_ENABLED = 'true';

  try {
    const db = new IsolatedSupabaseClient();
    seedBaseCatalog(db);
    db.tables.shift_requirements = [
      {
        id: 'req-base-1',
        date: '2026-11-19',
        area_id: 'area-base',
        position_id: 'pos-op',
        shift_id: 'sh-am',
        required_count: 3,
        is_extra: false,
        priority: 'Normal',
        updated_at: '2026-11-19T08:00:00.000Z',
      },
    ];
    db.tables.shift_assignments = [
      {
        id: 'asg-prot',
        personnel_id: 'p-1',
        shift_id: 'sh-am',
        date: '2026-11-19',
        area_id: 'area-base',
        position_id: 'pos-op',
        status: 'scheduled',
        is_locked: true,
        is_manual: false,
        is_confirmed: true,
        is_validated: false,
        is_published: false,
        frozen_by_rule: false,
        original_shift_id: 'sh-am',
        is_extra: false,
        updated_at: '2026-11-19T08:00:00.000Z',
      },
      {
        id: 'asg-manual-extra',
        personnel_id: 'p-extra',
        shift_id: 'sh-am',
        date: '2026-11-19',
        area_id: 'area-base',
        position_id: 'pos-op',
        status: 'scheduled',
        is_locked: false,
        is_manual: true,
        is_confirmed: false,
        is_validated: false,
        is_published: false,
        frozen_by_rule: false,
        original_shift_id: 'sh-am',
        is_extra: true,
        extra_target: 'manual',
        updated_at: '2026-11-19T08:00:00.000Z',
      },
      {
        id: 'asg-out-filter',
        personnel_id: 'tit-1',
        shift_id: 'sh-ns22',
        date: '2026-11-19',
        area_id: 'area-aero',
        position_id: 'pos-op',
        status: 'scheduled',
        is_locked: false,
        is_manual: false,
        is_confirmed: false,
        is_validated: false,
        is_published: false,
        frozen_by_rule: false,
        original_shift_id: 'sh-ns22',
        is_extra: false,
        updated_at: '2026-11-19T08:00:00.000Z',
      },
    ];

    // 1. Fallo intermedio en upsert de shift_assignments -> rollback completo
    db.failOnTableWrite = { table: 'shift_assignments', op: 'upsert' };
    const failRes: any = await runSchedulerV2({
      startDate: '2026-11-19',
      endDate: '2026-11-19',
      areaId: 'area-base',
      ns22Confirmation: CONFIRMED_NS22,
      testHooks: { supabase: db },
    });
    assert.equal(failRes.success, false);
    assert.equal(failRes.rolledBack, true);
    assert.equal(db.tables.shift_assignments.length, 3);

    // 2. Otro supervisor edita o elimina después del baseline -> runSchedulerV2 detecta conflicto y no sobrescribe
    db.failOnTableWrite = null;
    const conflictSaveByTs: any = await runSchedulerV2({
      startDate: '2026-11-19',
      endDate: '2026-11-19',
      areaId: 'area-base',
      ns22Confirmation: CONFIRMED_NS22,
      expectedBaselineAt: '2026-11-19T07:00:00.000Z',
      testHooks: { supabase: db },
    });
    assert.equal(conflictSaveByTs.success, false);
    assert.equal(conflictSaveByTs.conflictDetected, true);

    const baselineHashBeforeDelete = computeRangeStateHash(
      db.tables.shift_assignments as any,
      db.tables.shift_requirements as any
    );
    // Simular que otra sesión elimina 'asg-out-filter' (o un registro del rango) -> hash cambia aunque MAX(updated_at) no suba
    const removedRow = db.tables.shift_assignments.pop()!;
    const conflictSaveByDelete: any = await runSchedulerV2({
      startDate: '2026-11-19',
      endDate: '2026-11-19',
      areaId: 'area-base',
      ns22Confirmation: CONFIRMED_NS22,
      expectedBaselineAt: '2026-11-19T08:00:00.000Z',
      expectedBaselineHash: baselineHashBeforeDelete,
      testHooks: { supabase: db },
    });
    assert.equal(conflictSaveByDelete.success, false);
    assert.equal(conflictSaveByDelete.conflictDetected, true);
    assert.ok(!db.tables.shift_assignments.some((a) => a.id === removedRow.id));
    db.tables.shift_assignments.push(removedRow);

    // 3. Guardado limpio conserva protegido, extra manual y fuera de filtro
    const okSave: any = await runSchedulerV2({
      startDate: '2026-11-19',
      endDate: '2026-11-19',
      areaId: 'area-base',
      ns22Confirmation: CONFIRMED_NS22,
      expectedBaselineAt: '2026-11-19T08:00:00.000Z',
      testHooks: { supabase: db },
    });
    assert.equal(okSave.success, true);
    assert.ok(db.tables.shift_assignments.some((a) => a.id === 'asg-prot'));
    assert.ok(db.tables.shift_assignments.some((a) => a.id === 'asg-manual-extra'));
    assert.ok(db.tables.shift_assignments.some((a) => a.id === 'asg-out-filter'));

    // 4. Otro supervisor edita después del guardado -> recoverV2RosterAction no sobrescribe sus cambios
    db.tables.shift_assignments.push({
      id: 'sup2-edit',
      personnel_id: 'p-2',
      shift_id: 'sh-ns22',
      date: '2026-11-19',
      area_id: 'area-base',
      position_id: 'pos-op',
      status: 'scheduled',
      is_locked: false,
      is_manual: true,
      is_confirmed: false,
      is_validated: false,
      is_published: false,
      frozen_by_rule: false,
      original_shift_id: 'sh-ns22',
      is_extra: false,
      updated_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const blockedRecover: any = await recoverV2RosterAction({
      snapshotId: okSave.snapshotId,
      testHooks: { supabase: db },
    });
    assert.equal(blockedRecover.success, false);
    assert.equal(blockedRecover.conflictDetected, true);
    assert.ok(db.tables.shift_assignments.some((a) => a.id === 'sup2-edit'));
    // 5. Otro supervisor elimina un turno después del guardado -> recoverV2RosterAction también detecta la eliminación y no la revierte
    db.tables.shift_assignments = db.tables.shift_assignments.filter((a) => a.id !== 'sup2-edit');
    const deletedIndex = db.tables.shift_assignments.findIndex((a) => a.id === 'asg-manual-extra');
    assert.ok(deletedIndex >= 0);
    db.tables.shift_assignments.splice(deletedIndex, 1);
    const blockedRecoverByDelete: any = await recoverV2RosterAction({
      snapshotId: okSave.snapshotId,
      testHooks: { supabase: db },
    });
    assert.equal(blockedRecoverByDelete.success, false);
    assert.equal(blockedRecoverByDelete.conflictDetected, true);
    assert.ok(!db.tables.shift_assignments.some((a) => a.id === 'asg-manual-extra'));
  } finally {
    process.env.ROSTER_ISOLATED_TEST = prevTest;
    process.env.ROSTER_V2_SAVE_ENABLED = prevSave;
  }
});

test('ROSTER-07 E2E (Dotación Extra real): crear/reactivar, recargar Planificación Diaria, excluir rol ordinario y aparecer 1 vez en Bonos', async () => {
  const prevTest = process.env.ROSTER_ISOLATED_TEST;
  const prevLinks = process.env.ROSTER_V2_EXTRA_LINKS;
  process.env.ROSTER_ISOLATED_TEST = 'true';
  process.env.ROSTER_V2_EXTRA_LINKS = 'true';

  try {
    const db = new IsolatedSupabaseClient();
    seedBaseCatalog(db);
    db.tables.shift_requirements = [
      {
        id: 'req-ord-1',
        date: '2026-11-20',
        area_id: 'area-base',
        position_id: 'pos-op',
        shift_id: 'sh-am',
        required_count: 2,
        is_extra: false,
      },
    ];
    // Extra previamente cancelado para p-2
    db.tables.shift_assignments = [
      {
        id: 'extra-canc-p2',
        personnel_id: 'p-2',
        shift_id: 'sh-am',
        date: '2026-11-20',
        area_id: 'area-base',
        position_id: 'pos-op',
        status: 'cancelled',
        is_locked: false,
        is_manual: true,
        is_confirmed: false,
        is_validated: false,
        is_published: false,
        frozen_by_rule: false,
        original_shift_id: 'sh-am',
        is_extra: true,
        extra_target: 'manual',
        linked_requirement_id: null,
        attendance_status: null,
        paid_month: null,
      },
    ];

    // 1. Crear extra nuevo vinculado con assignExtraPersonnel (acción real)
    const createRes = await assignExtraPersonnel('2026-11-20', 'sh-am', 'area-base', 'pos-op', 'p-extra', {
      extraTarget: 'v2_vacancy',
      linkedRequirementId: 'req-ord-1',
      testHooks: { supabase: db, skipAvailability: true },
    });
    assert.equal(createRes.success, true);

    // 2. Reactivar extra cancelado de p-2 vinculado con assignExtraPersonnel
    const reactivateRes = await assignExtraPersonnel('2026-11-20', 'sh-am', 'area-base', 'pos-op', 'p-2', {
      extraTarget: 'v2_vacancy',
      linkedRequirementId: 'req-ord-1',
      testHooks: { supabase: db, skipAvailability: true },
    });
    assert.equal(reactivateRes.success, true);

    // 3. Recargar Planificación Diaria -> ambos conservan is_extra=true y vínculo
    const dailyData: any = await fetchDailyOperationalData('2026-11-20', db as any);
    const activeExtras = dailyData.assignments.filter((a: any) => a.is_extra === true && a.status === 'scheduled');
    assert.equal(activeExtras.length, 2);
    for (const ex of activeExtras) {
      assert.equal(ex.is_extra, true);
      assert.equal(ex.extra_target, 'v2_vacancy');
      assert.equal(ex.linked_requirement_id, 'req-ord-1');
    }

    // 4. Rol ordinario del trabajador (is_extra === false) los excluye
    const ordinaryForPExtra = db.tables.shift_assignments.filter(
      (a) => a.personnel_id === 'p-extra' && a.is_extra === false && a.status !== 'cancelled'
    );
    assert.equal(ordinaryForPExtra.length, 0);

    // 5. Reporte de Bonos real (getBonosReportData) -> cada uno aparece exactamente 1 vez
    const bonos: any = await getBonosReportData(
      { from: '2026-11-20', to: '2026-11-20' },
      { supabase: db }
    );
    assert.ok(!bonos.error);
    assert.equal(bonos.shifts.filter((s: any) => s.personnel_id === 'p-extra').length, 1);
    assert.equal(bonos.shifts.filter((s: any) => s.personnel_id === 'p-2').length, 1);

    // 6. Bloqueo por flag deshabilitado si se intenta guardar sin habilitar
    assert.equal(isV2SaveEnabled(), false);
  } finally {
    process.env.ROSTER_ISOLATED_TEST = prevTest;
    process.env.ROSTER_V2_EXTRA_LINKS = prevLinks;
  }
});

test('ROSTER-07 E2E (dos sesiones): edición o eliminación habitual de HRM mientras se ejecuta guardado o recuperación v2', async () => {
  const prevTest = process.env.ROSTER_ISOLATED_TEST;
  const prevSave = process.env.ROSTER_V2_SAVE_ENABLED;
  process.env.ROSTER_ISOLATED_TEST = 'true';
  process.env.ROSTER_V2_SAVE_ENABLED = 'true';

  try {
    const db = new IsolatedSupabaseClient();
    seedBaseCatalog(db);
    db.tables.shift_requirements = [
      {
        id: 'req-conc-1',
        date: '2026-11-21',
        area_id: 'area-base',
        position_id: 'pos-op',
        shift_id: 'sh-am',
        required_count: 2,
        is_extra: false,
        priority: 'Normal',
        updated_at: '2026-11-21T08:00:00.000Z',
      },
    ];
    db.tables.shift_assignments = [
      {
        id: 'asg-hrm-1',
        personnel_id: 'p-1',
        shift_id: 'sh-am',
        date: '2026-11-21',
        area_id: 'area-base',
        position_id: 'pos-op',
        status: 'scheduled',
        is_locked: false,
        is_manual: false,
        is_confirmed: false,
        is_validated: false,
        is_published: false,
        frozen_by_rule: false,
        original_shift_id: 'sh-am',
        is_extra: false,
        updated_at: '2026-11-21T08:00:00.000Z',
      },
    ];

    const baselineHash = computeRangeStateHash(
      db.tables.shift_assignments as any,
      db.tables.shift_requirements as any
    );

    // Sesión 2 ejecuta una edición habitual de HRM (cambio rápido a is_manual + sh-ns22) mientras Sesión 1 ejecuta runSchedulerV2
    db.beforeRpc = async (fn) => {
      if (fn === 'save_v2_schedule_tx') {
        await db
          .from('shift_assignments')
          .update({
            shift_id: 'sh-ns22',
            is_manual: true,
            updated_at: '2026-11-21T08:05:00.000Z',
          })
          .eq('id', 'asg-hrm-1');
      }
    };

    const raceSave: any = await runSchedulerV2({
      startDate: '2026-11-21',
      endDate: '2026-11-21',
      areaId: 'area-base',
      ns22Confirmation: CONFIRMED_NS22,
      expectedBaselineAt: '2026-11-21T08:00:00.000Z',
      expectedBaselineHash: baselineHash,
      testHooks: { supabase: db },
    });
    assert.equal(raceSave.success, false);
    assert.equal(raceSave.conflictDetected, true);
    const editedRow = db.tables.shift_assignments.find((a) => a.id === 'asg-hrm-1')!;
    assert.equal(editedRow.shift_id, 'sh-ns22');
    assert.equal(editedRow.is_manual, true);

    // Guardado limpio tras recargar baseline y luego eliminación concurrente durante recoverV2RosterAction
    db.beforeRpc = null;
    const cleanSave: any = await runSchedulerV2({
      startDate: '2026-11-21',
      endDate: '2026-11-21',
      areaId: 'area-base',
      ns22Confirmation: CONFIRMED_NS22,
      testHooks: { supabase: db },
    });
    assert.equal(cleanSave.success, true);

    // Sesión 2 elimina el turno protegido asg-hrm-1 mientras Sesión 1 ejecuta recoverV2RosterAction
    db.beforeRpc = async (fn) => {
      if (fn === 'recover_v2_snapshot_tx') {
        await db.from('shift_assignments').delete().eq('id', 'asg-hrm-1');
      }
    };
    const raceRecover: any = await recoverV2RosterAction({
      snapshotId: cleanSave.snapshotId,
      testHooks: { supabase: db },
    });
    assert.equal(raceRecover.success, false);
    assert.equal(raceRecover.conflictDetected, true);
    assert.ok(!db.tables.shift_assignments.some((a) => a.id === 'asg-hrm-1'));
  } finally {
    process.env.ROSTER_ISOLATED_TEST = prevTest;
    process.env.ROSTER_V2_SAVE_ENABLED = prevSave;
  }
});
