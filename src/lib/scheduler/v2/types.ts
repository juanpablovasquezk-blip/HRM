import type { OperationalPriority } from '../../../app/(dashboard)/shifts/dotacion/matrix-utils';

export type { OperationalPriority };

export interface PriorityQuotaBreakdown {
  priority: OperationalPriority | string;
  required_count: number;
}

export interface RawShiftRequirement {
  id: string;
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  required_count: number;
  priority?: string | null;
  priority_quotas?: PriorityQuotaBreakdown[] | null;
  is_extra?: boolean | null;
  shift?: {
    name?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    duration_hours?: number | null;
    requires_transport?: boolean | null;
  } | null;
  area?: {
    name?: string | null;
  } | null;
  position?: {
    name?: string | null;
  } | null;
  positions?: {
    name?: string | null;
  } | null;
}

export interface RawExistingAssignment {
  id?: string;
  personnel_id: string;
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  status?: string | null;
  is_locked?: boolean | null;
  is_manual?: boolean | null;
  frozen_by_rule?: boolean | null;
  is_validated?: boolean | null;
  is_published?: boolean | null;
  is_extra?: boolean | null;
  shift_start?: string | null;
  shift_end?: string | null;
  duration_hours?: number | null;
}

export interface DotacionSlot {
  slot_key: string;
  priority_slot_key?: string;
  requirement_ids: string[];
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  is_extra: boolean;
  priority: OperationalPriority;
  priority_rank: number;
  required_count: number;
  protected_filled_count: number;
  remaining_count: number;
  shift_start: string;
  shift_end: string;
  shift_duration_hours: number;
  requires_transport: boolean;
  area_name?: string;
  position_name?: string;
  shift_name?: string;
}

export interface GeneratedAssignmentRef {
  personnel_id: string;
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  is_extra?: boolean;
  priority?: OperationalPriority;
  priority_slot_key?: string;
}

export interface SlotCoverageDetail {
  slot_key: string;
  priority_slot_key?: string;
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  is_extra: boolean;
  priority: OperationalPriority;
  priority_rank: number;
  required_count: number;
  protected_filled_count: number;
  assigned_count: number;
  covered_count: number;
  vacancy_count: number;
  over_allocated_count: number;
  area_name?: string;
  position_name?: string;
  shift_name?: string;
}

export interface PriorityCoverageSummary {
  required: number;
  covered: number;
  vacancies: number;
}

export interface DotacionGroupCoverage {
  total_required: number;
  total_covered: number;
  total_vacancies: number;
  coverage_percent: number;
  by_priority?: Partial<Record<OperationalPriority, PriorityCoverageSummary>>;
  slots: SlotCoverageDetail[];
}

export interface DotacionCoverageSummary {
  ordinary: DotacionGroupCoverage;
  extra: DotacionGroupCoverage;
  unmatched_protected_ordinary: number;
  unmatched_protected_extra: number;
}

// ---------------------------------------------------------------------------
// ROSTER-03: Jornada, descansos y permisos
// ---------------------------------------------------------------------------

export type LeaveCategory =
  | 'monthly_free_choice'
  | 'birthday'
  | 'generic_personal'
  | 'medical_or_vacation'
  | 'other_absence';

export interface ConfirmedRegimeConfig {
  exemption_type: 'none' | 'art_38_exceptional' | 'special_confirmed';
  exempt_weekly_hours_limit?: boolean;
  exempt_five_day_week?: boolean;
  exempt_monthly_sundays?: boolean;
  regime_note?: string;
}

export interface RawLeaveRecord {
  id?: string;
  personnel_id: string;
  type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason?: string | null;
}

export interface PersonnelScheduleProfile {
  personnel_id: string;
  first_name?: string;
  full_name?: string;
  birth_date?: string | null;
  main_position: string | null;
  main_position_name?: string;
  secondary_positions?: string[];
  rotation_pattern?: string | null;
  has_special_contract?: boolean;
  /**
   * Explicit confirmed regime exemptions. Without a confirmed regime,
   * no broad exemption is applied by position, pattern, or has_special_contract.
   */
  confirmed_regime?: ConfirmedRegimeConfig | null;
  /**
   * Optional contractual weekly hours limit. If provided and < 42,
   * overrides the 42h general ordinary limit.
   */
  contractual_weekly_hours?: number | null;
  /**
   * Optional stricter minimum rest hours between shifts (defaults to 12h).
   */
  min_rest_hours?: number | null;
  fixed_shift_id?: string | null;
  exclusive_shift_id?: string | null;
  exclusive_shift_start?: string | null;
  area_id?: string | null;
  /**
   * Day/night preference flags; in v2 these do NOT exclude operators.
   */
  prefers_night?: boolean;
  avoids_night?: boolean;
}

export interface ScheduledShiftInterval {
  date: string; // YYYY-MM-DD
  shift_start: string; // HH:MM or HH:MM:SS
  shift_end: string; // HH:MM or HH:MM:SS
  duration_hours: number;
  shift_id?: string;
  area_id?: string;
  position_id?: string;
  slot_key?: string;
}

export interface JornadaViolation {
  type:
    | 'max_hours'
    | 'min_rest'
    | 'min_days_off'
    | 'sundays_off'
    | 'leave_conflict'
    | 'consecutive_days'
    | 'non_consecutive_rest';
  severity: 'error' | 'warning';
  personnel_id: string;
  date: string;
  message: string;
}

export interface PermissionRelocationCase {
  personnel_id: string;
  permission_date: string;
  leave_type: string;
  leave_category: LeaveCategory;
  reason?: string | null;
  status:
    | 'on_free_day'
    | 'proposed_relocation'
    | 'relocated'
    | 'pending_relocation'
    | 'unrelocatable'
    | 'generic_personal_no_relocation';
  reason_code?:
    | 'missing_base_calendar'
    | 'no_compatible_slot'
    | 'jornada_blocked'
    | 'generic_personal'
    | 'proposed_unconfirmed';
  respected_permission: boolean;
  requires_relocation: boolean;
  relocated_to: string | null;
  relocated_slot_key?: string | null;
  proposed_slot?: ScheduledShiftInterval | null;
  assigned_shift?: ScheduledShiftInterval | null;
  blocking_reasons?: string[];
  message: string;
}

// ---------------------------------------------------------------------------
// ROSTER-04: Aeropuerto NS22 (4x4 continuo y reemplazos)
// ---------------------------------------------------------------------------

export interface Ns22TitularConfig {
  personnel_id: string;
  first_name?: string;
  birth_date?: string | null;
  /**
   * Reference date (YYYY-MM-DD) where cyclePos === 0 (start of a 4-night block).
   * Remains immutable across absences and replacements.
   */
  anchor_date: string;
  /**
   * Phase offset in days within the 8-day 4x4 cycle (e.g. 0 for Titular A, 4 for Titular B).
   */
  cycle_offset?: number;
  /**
   * Explicit confirmation that the 4x4 Sunday exemption regime applies.
   */
  confirmed_4x4_regime?: boolean;
}

export interface Ns22ShiftDefinition {
  shift_id: string;
  area_id: string;
  position_id: string;
  shift_start?: string; // Expected '22:00'
  shift_end?: string; // Expected '07:00'
  duration_hours?: number; // Si falta, se deriva con resolveShiftDurationHours (8h para 22:00-07:00)
}

export interface Ns22Assignment {
  date: string;
  personnel_id: string;
  role: 'titular' | 'replacement';
  replaces_titular_id?: string | null;
  shift_id: string;
  area_id: string;
  position_id: string;
  shift_start: string;
  shift_end: string;
  duration_hours: number;
  occupied_dates: string[];
  is_locked: boolean;
  frozen_by_rule: boolean;
}

export interface Ns22Vacancy {
  date: string;
  shift_id: string;
  area_id: string;
  position_id: string;
  missing_titular_id: string;
  reason: string;
  rejected_candidates: Array<{ personnel_id: string; reasons: string[] }>;
}

export interface Ns22TitularCycleSummary {
  personnel_id: string;
  anchor_date: string;
  cycle_offset: number;
  scheduled_nights: string[];
  absent_nights: string[];
  conflict_nights: string[];
}

export interface Ns22PreservedProtected {
  date: string;
  personnel_id: string;
  role: 'titular' | 'replacement';
  shift_id: string;
  area_id: string;
  position_id: string;
}

export interface Ns22TitularConflict {
  date: string;
  personnel_id: string;
  message: string;
}

export interface Ns22ScheduleResult {
  assignments: Ns22Assignment[];
  preserved_protected: Ns22PreservedProtected[];
  titular_conflicts: Ns22TitularConflict[];
  vacancies: Ns22Vacancy[];
  vacant_nights?: Array<{ date: string; missing_titular_id: string }>;
  titular_cycles: Ns22TitularCycleSummary[];
  verification_notices: string[];
}

// ---------------------------------------------------------------------------
// ROSTER-05: Cobertura entre áreas y optimización conjunta
// ---------------------------------------------------------------------------

export interface CrossAreaAssignment {
  date: string;
  personnel_id: string;
  shift_id: string;
  area_id: string;
  position_id: string;
  shift_start: string;
  shift_end: string;
  duration_hours: number;
  slot_key: string;
  priority_slot_key?: string;
  priority?: OperationalPriority;
  assignment_kind: 'ordinary' | 'ns22_titular' | 'ns22_replacement' | 'reinforcement';
  match_type: 'primary' | 'secondary' | 'reinforcement';
  priority_rank: number;
  is_extra: false;
  is_locked: boolean;
  frozen_by_rule: boolean;
}

export interface ReinforcementShiftConfig {
  shift_id: string;
  shift_start: string;
  shift_end: string;
  duration_hours: number;
  area_id?: string;
  position_id?: string;
  /**
   * Allowed JS getDay() values (0=Sun..6=Sat). E.g. [1,2,3,4,5] for Mon-Fri.
   */
  days_of_week?: number[];
}

export interface CrossAreaScheduleResult {
  assignments: CrossAreaAssignment[];
  ordinary_assignments: CrossAreaAssignment[];
  reinforcements: CrossAreaAssignment[];
  coverage: DotacionCoverageSummary;
  remaining_vacancies: SlotCoverageDetail[];
  audit_violations: JornadaViolation[];
  holiday_warnings: string[];
  ns22_result: Ns22ScheduleResult | null;
  permission_cases: PermissionRelocationCase[];
  stats: {
    total_required: number;
    total_covered: number;
    total_vacancies: number;
    coverage_percent: number;
    covered_primary_count: number;
    covered_secondary_count: number;
    reinforcement_count: number;
  };
  timings?: {
    candidate_selection_ms: number;
    relocations_ms: number;
    final_audit_ms: number;
    total_ms: number;
  };
}

// ---------------------------------------------------------------------------
// ROSTER-08: Vacantes en Planificación Diaria y Dotación Extra
// ---------------------------------------------------------------------------

export type ExtraTargetType = 'manual' | 'v2_vacancy';

export interface ExtraRequirementState {
  id?: string;
  slot_key: string;
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  is_extra: true;
  manual_count: number;
  auto_vacancy_count: number;
  required_count: number;
  linked_ordinary_slot_key: string;
  linked_requirement_id?: string | null;
}

export interface ReconcileExtraResult {
  extra_requirements: ExtraRequirementState[];
  upserts: ExtraRequirementState[];
  deleted_slot_keys: string[];
}

export interface DailyPlanningAssignmentRef {
  personnel_id: string;
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  is_extra?: boolean | null;
  extra_target?: ExtraTargetType | null;
  linked_requirement_id?: string | null;
  status?: string | null;
  is_on_leave?: boolean | null;
}

export interface DailyVacancyStatus {
  slot_key: string;
  date: string;
  area_id: string;
  position_id: string;
  shift_id: string;
  ordinary_requirement_id?: string | null;
  ordinary_required: number;
  ordinary_filled: number;
  linked_extra_slots: number;
  manual_extra_slots: number;
  extra_filled_linked: number;
  extra_filled_manual: number;
  covered_via_extra_for_vacancy: number;
  effective_ordinary_coverage: number;
  open_falta_count: number;
  open_linked_extra_count: number;
  open_manual_extra_count: number;
  suppressed_by_holiday: boolean;
}

export interface DailyPlanningVacancySummary {
  date: string;
  slots: DailyVacancyStatus[];
  total_open_faltas: number;
  total_open_linked_extras: number;
  total_open_manual_extras: number;
  holiday_warnings: string[];
}

// ---------------------------------------------------------------------------
// ROSTER-06: Comparación en vista previa (v1 vs v2 sin guardado)
// ---------------------------------------------------------------------------

export interface V2PreviewAssignment {
  date: string;
  personnel_id: string;
  shift_id: string;
  shift_name?: string;
  shift_start: string;
  shift_end: string;
  area_id: string;
  area_name?: string;
  position_id: string;
  position_name?: string;
  assignment_kind:
    | 'ordinary'
    | 'ns22_titular'
    | 'ns22_replacement'
    | 'reinforcement'
    | 'protected';
  match_type: 'primary' | 'secondary' | 'reinforcement';
  is_protected: boolean;
  is_extra: boolean;
}

export interface EnginePreviewMetrics {
  engine: 'v1' | 'v2';
  label: string;
  start_date?: string;
  end_date?: string;
  total_required: number;
  total_covered: number;
  total_vacancies: number;
  coverage_percent: number;
  coverage_by_priority?: DotacionGroupCoverage['by_priority'];
  covered_primary_count: number;
  covered_secondary_count: number;
  reinforcement_count: number;
  jornada_conflicts_count: number;
  vacancies: SlotCoverageDetail[];
  conflicts: JornadaViolation[];
  holiday_warnings: string[];
  execution_time_ms: number;
  assignments?: V2PreviewAssignment[];
}

export interface PreviewComparisonResult {
  default_engine: 'v1';
  dry_run: true;
  called_v1_save_route: false;
  v1: EnginePreviewMetrics;
  v2: EnginePreviewMetrics;
  unconfirmed_rules: string[];
  deltas: {
    coverage_diff: number;
    vacancies_diff: number;
    primary_diff: number;
    secondary_diff: number;
    reinforcements_diff: number;
    conflicts_diff: number;
  };
}
