import type { ExtraRequirementState } from './types';
import type {
  PersistedAssignmentRow,
  PersistedRequirementRow,
  PersistedV2DraftRow,
  PublishV2TxParams,
  RosterPersistenceAdapter,
  RosterV2Snapshot,
  SaveV2TxParams,
} from './save-recover';

export interface SupabaseLikeClient {
  from(table: string): any;
  rpc?(fn: string, args?: Record<string, unknown>): Promise<{ data: any; error: any }>;
  __runInTransaction?<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Adaptador de persistencia para Supabase / Postgres (compatible con el cliente real
 * de Supabase y con un cliente aislado de pruebas que implemente la misma API).
 */
export function createSupabaseRosterPersistenceAdapter(
  supabase: SupabaseLikeClient
): RosterPersistenceAdapter {
  return {
    async loadRangeState(startDate: string, endDate: string) {
      const [{ data: assignments, error: aErr }, { data: requirements, error: rErr }] =
        await Promise.all([
          supabase
            .from('shift_assignments')
            .select('*')
            .gte('date', startDate)
            .lte('date', endDate),
          supabase
            .from('shift_requirements')
            .select('*')
            .gte('date', startDate)
            .lte('date', endDate),
        ]);

      if (aErr) throw new Error(`Error cargando shift_assignments: ${aErr.message}`);
      if (rErr) throw new Error(`Error cargando shift_requirements: ${rErr.message}`);

      return {
        assignments: (assignments || []) as PersistedAssignmentRow[],
        requirements: (requirements || []) as PersistedRequirementRow[],
      };
    },

    async saveSnapshot(snapshot: Omit<RosterV2Snapshot, 'id'>) {
      const { data, error } = await supabase
        .from('roster_v2_snapshots')
        .insert({
          start_date: snapshot.startDate,
          end_date: snapshot.endDate,
          engine: snapshot.engine,
          filters: snapshot.filters,
          assignments_backup: snapshot.assignments,
          requirements_backup: snapshot.requirements,
          ns22_confirmation: snapshot.ns22Confirmation,
          created_at: snapshot.createdAt,
          restored_at: snapshot.restoredAt,
        })
        .select('id')
        .single();

      if (error || !data?.id) {
        throw new Error(`Error guardando snapshot v2: ${error?.message || 'sin id'}`);
      }
      return { snapshotId: String(data.id) };
    },

    async loadSnapshot(snapshotId: string): Promise<RosterV2Snapshot | null> {
      const { data, error } = await supabase
        .from('roster_v2_snapshots')
        .select('*')
        .eq('id', snapshotId)
        .maybeSingle();

      if (error) {
        throw new Error(`Error leyendo snapshot ${snapshotId}: ${error.message}`);
      }
      if (!data) return null;

      return {
        id: String(data.id),
        startDate: String(data.start_date),
        endDate: String(data.end_date),
        engine: 'v2',
        filters: data.filters || {},
        assignments: (data.assignments_backup || []) as PersistedAssignmentRow[],
        requirements: (data.requirements_backup || []) as PersistedRequirementRow[],
        ns22Confirmation: data.ns22_confirmation,
        createdAt: String(data.created_at),
        savedCompletedAt: data.saved_completed_at ? String(data.saved_completed_at) : null,
        restoredAt: data.restored_at ? String(data.restored_at) : null,
      };
    },

    async markSnapshotSavedCompleted(snapshotId: string, savedCompletedAt: string) {
      const { error } = await supabase
        .from('roster_v2_snapshots')
        .update({ saved_completed_at: savedCompletedAt })
        .eq('id', snapshotId);
      if (error) {
        throw new Error(`Error marcando snapshot completado: ${error.message}`);
      }
    },

    async markSnapshotRestored(snapshotId: string, restoredAt: string) {
      const { error } = await supabase
        .from('roster_v2_snapshots')
        .update({ restored_at: restoredAt })
        .eq('id', snapshotId);
      if (error) {
        throw new Error(`Error marcando snapshot restaurado: ${error.message}`);
      }
    },

    async deleteAssignmentsByIds(ids: string[]) {
      if (ids.length === 0) return;
      const { error } = await supabase.from('shift_assignments').delete().in('id', ids);
      if (error) {
        throw new Error(`Error eliminando asignaciones reemplazables: ${error.message}`);
      }
    },

    async upsertAssignments(rows: Omit<PersistedAssignmentRow, 'id'>[]) {
      if (rows.length === 0) return;
      const nowIso = new Date().toISOString();
      const payload = rows.map((r) => ({ ...r, updated_at: r.updated_at || nowIso }));
      const { error } = await supabase.from('shift_assignments').upsert(payload, {
        onConflict: 'personnel_id,date,shift_id,is_extra',
        ignoreDuplicates: false,
      });
      if (error) {
        throw new Error(`Error guardando asignaciones v2: ${error.message}`);
      }
    },

    async upsertExtraRequirements(rows: ExtraRequirementState[]) {
      if (rows.length === 0) return;
      const nowIso = new Date().toISOString();
      const payload = rows.map((r) => ({
        date: r.date,
        area_id: r.area_id,
        position_id: r.position_id,
        shift_id: r.shift_id,
        is_extra: true,
        required_count: r.required_count,
        manual_extra_count: r.manual_count,
        auto_vacancy_count: r.auto_vacancy_count,
        linked_requirement_id: r.linked_requirement_id ?? null,
        updated_at: nowIso,
      }));
      const { error } = await supabase.from('shift_requirements').upsert(payload, {
        onConflict: 'area_id,position_id,shift_id,date,is_extra',
        ignoreDuplicates: false,
      });
      if (error) {
        throw new Error(`Error reconciliando requerimientos extra: ${error.message}`);
      }
    },

    async deleteRequirementsByIds(ids: string[]) {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from('shift_requirements')
        .delete()
        .in('id', ids)
        .eq('is_extra', true);
      if (error) {
        throw new Error(`Error eliminando requerimientos extra obsoletos: ${error.message}`);
      }
    },

    async restoreRangeState(
      startDate: string,
      endDate: string,
      assignments: PersistedAssignmentRow[],
      requirements: PersistedRequirementRow[]
    ) {
      const { error: delA } = await supabase
        .from('shift_assignments')
        .delete()
        .gte('date', startDate)
        .lte('date', endDate);
      if (delA) throw new Error(`Error limpiando asignaciones al restaurar: ${delA.message}`);

      if (assignments.length > 0) {
        const { error: insA } = await supabase.from('shift_assignments').insert(assignments);
        if (insA) throw new Error(`Error restaurando asignaciones: ${insA.message}`);
      }

      const { error: delR } = await supabase
        .from('shift_requirements')
        .delete()
        .gte('date', startDate)
        .lte('date', endDate);
      if (delR) throw new Error(`Error limpiando requerimientos al restaurar: ${delR.message}`);

      if (requirements.length > 0) {
        const { error: insR } = await supabase.from('shift_requirements').insert(requirements);
        if (insR) throw new Error(`Error restaurando requerimientos: ${insR.message}`);
      }
    },

    ...(supabase.rpc
      ? {
          async computeRangeHash(startDate: string, endDate: string) {
            const { data, error } = await supabase.rpc!('compute_roster_range_hash', {
              p_start_date: startDate,
              p_end_date: endDate,
            });
            if (error) {
              throw new Error(`Error calculando hash del rango: ${error.message}`);
            }
            return String(data || '');
          },
          async executeSaveTx(params: SaveV2TxParams) {
            const { data, error } = await supabase.rpc!('save_v2_schedule_tx', {
              p_start_date: params.startDate,
              p_end_date: params.endDate,
              p_filters: params.filters,
              p_ns22_confirmation: params.ns22Confirmation,
              p_expected_baseline_at: params.expectedBaselineAt,
              p_expected_baseline_hash: params.expectedBaselineHash,
              p_delete_assignment_ids: params.deleteAssignmentIds,
              p_insert_assignments: params.insertAssignments,
              p_upsert_extra_requirements: params.upsertExtraRequirements,
              p_delete_requirement_ids: params.deleteRequirementIds,
            });
            if (error) {
              throw new Error(error.message);
            }
            return {
              snapshotId: String(data?.snapshot_id),
              savedCompletedAt: data?.saved_completed_at ? String(data.saved_completed_at) : null,
              postSaveStateHash: data?.post_save_state_hash ? String(data.post_save_state_hash) : null,
            };
          },
          async executeRecoverTx(snapshotId: string, force = false) {
            const { data, error } = await supabase.rpc!('recover_v2_snapshot_tx', {
              p_snapshot_id: snapshotId,
              p_force: force,
            });
            if (error) {
              throw new Error(error.message);
            }
            return {
              snapshotId: String(data?.snapshot_id || snapshotId),
              restoredAssignmentsCount: Number(data?.restored_assignments_count || 0),
              restoredRequirementsCount: Number(data?.restored_requirements_count || 0),
            };
          },
          async executePublishTx(params: PublishV2TxParams) {
            const { data, error } = await supabase.rpc!('publish_v2_approved_draft_tx', {
              p_draft_id: params.draftId,
              p_start_date: params.startDate,
              p_end_date: params.endDate,
              p_area_id: params.areaId ?? null,
              p_expected_range_hash: params.expectedPersistedRangeHash,
              p_expected_draft_version_hash: params.expectedDraftVersionHash,
              p_expected_approved_version_hash: params.expectedApprovedVersionHash,
              p_now_iso: params.nowIso,
            });
            if (error) {
              const msg = String(error.message || '');
              const isConflict = msg.includes('CONCURRENT_MODIFICATION') || msg.includes('STALE_APPROVAL');
              return {
                success: false,
                conflictDetected: isConflict,
                error: msg,
              };
            }
            return {
              success: true,
              publishedCount: Number(data?.published_count || 0),
            };
          },
        }
      : {}),
    async saveDraftState(draft: PersistedV2DraftRow) {
      const { error } = await supabase
        .from('roster_v2_drafts')
        .upsert(draft, { onConflict: 'id' });
      if (error) {
        throw new Error(`Error guardando estado de borrador v2: ${error.message}`);
      }
    },
    async loadDraftState(draftId: string): Promise<PersistedV2DraftRow | null> {
      const { data, error } = await supabase
        .from('roster_v2_drafts')
        .select('*')
        .eq('id', draftId)
        .maybeSingle();
      if (error) {
        throw new Error(`Error leyendo borrador v2 ${draftId}: ${error.message}`);
      }
      return (data as PersistedV2DraftRow | null) || null;
    },
    ...(supabase.__runInTransaction
      ? {
          runInTransaction<T>(fn: () => Promise<T>) {
            return supabase.__runInTransaction!(fn);
          },
        }
      : {}),
  };
}
