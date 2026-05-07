// =============================================================================
// Database Types — mirrors supabase/schema.sql exactly
// =============================================================================

export type Role = 'ADMIN' | 'HR' | 'SUPERVISOR' | 'USER';

export type LeaveType = 'vacation' | 'sick' | 'personal' | 'maternity' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export type AssignmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export type RecalcReason = 'sick_leave' | 'manual' | 'optimization';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export interface Company {
  id: string;
  name: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  company_id: string | null;
  avatar_url: string | null;
  phone: string | null;
  created_at: string;
}

export interface Personnel {
  id: string;
  user_id: string | null;
  company_id: string;
  first_name: string;
  last_name_father: string;
  last_name_mother: string;
  rut: string;
  email: string | null;
  birth_date: string;
  address: PersonnelAddress | null;
  phone: string;
  main_position: string | null;
  secondary_positions: string[];
  driver_licenses: string[];
  prefers_night: boolean;
  avoids_night: boolean;
  fixed_shift_id: string | null;
  rotation_pattern: string | null;
  hire_date: string | null;
  termination_date: string | null;
  has_special_contract: boolean;
  is_active: boolean;
  created_at: string;
}

export interface PersonnelAddress {
  street: string;
  city: string;
  region: string;
  zip?: string;
}

export interface Document {
  id: string;
  personnel_id: string;
  definition_id: string | null;
  type: string; // Deprecated but kept for compatibility
  number: string;
  file_url: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejection_reason: string | null;
  issue_date: string;
  expiration_date: string;
  tica_date: string | null;
  uploaded_by: string;
  uploaded_at: string;
  created_at: string;
}

export interface DocumentDefinition {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  is_mandatory: boolean;
  requires_expiration: boolean;
  applicable_positions: string[]; // Added this
  depends_on_definition_id: string | null; // Added for TICA-like rules
  cycle_months: number | null;            // e.g., 6
  anchor_days_offset: number | null;      // e.g., 30
  is_active: boolean;
  created_at: string;
}

export interface Area {
  id: string;
  name: string;
  company_id: string;
  created_at: string;
}

export interface Position {
  id: string;
  area_id: string;
  name: string;
  created_at: string;
}

export interface Shift {
  id: string;
  name: string;
  start_time: string; // HH:MM:SS
  end_time: string;   // HH:MM:SS
  duration_hours: number;
  requires_transport: boolean;
  geov: number | null;
  company_id: string;
  created_at: string;
}

export interface ShiftRequirement {
  id: string;
  date: string;
  shift_id: string;
  area_id: string;
  position_id: string;
  required_count: number;
  is_extra?: boolean;
  created_at: string;
}

export interface ShiftAssignment {
  id: string;
  personnel_id: string;
  shift_id: string;
  date: string;
  area_id: string;
  position_id: string;
  status: AssignmentStatus;
  is_locked: boolean;
  is_manual: boolean;
  frozen_by_rule: boolean;
  is_extra?: boolean;
  is_confirmed?: boolean;
  override_by: string | null;
  override_reason: string | null;
  created_at: string;
}

export interface Leave {
  id: string;
  personnel_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  status: LeaveStatus;
  reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface TransportLog {
  id: string;
  personnel_id: string;
  date: string;
  used_company_transport: boolean;
  reservation_number: string | null;
  issues: string | null;
  logged_by: string;
  created_at: string;
}

export type TransportType = 'PENDIENTE' | 'PROPIO' | 'REQUERIDO';
export type TransportStatus = 'ABIERTO' | 'CONFORME' | 'NO_CONFORME';

export interface TransportRequest {
  id: string;
  assignment_id: string;
  personnel_id: string;
  date: string;
  type: 'ENTRADA' | 'SALIDA';
  transport_type: TransportType;
  reservation_number: string | null;
  pickup_time: string | null; // HH:MM:SS
  pickup_address: string | null;
  destination_address: string | null;
  status: TransportStatus;
  observations: string | null;
  created_at: string;
}

export interface TransportRequestWithDetails extends TransportRequest {
  personnel?: Personnel;
  assignment?: ShiftAssignmentWithDetails;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'shift_published' | 'shift_changed' | 'document_expiring' | 'document_expired' | 'leave_approved' | 'leave_rejected' | 'general';
  title: string;
  message: string;
  is_read: boolean;
  data: Record<string, unknown> | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Joined / extended types used in UI
// ---------------------------------------------------------------------------

export interface PersonnelWithDetails extends Personnel {
  company?: Company;
  user?: User;
  documents?: Document[];
}

export interface ShiftAssignmentWithDetails extends ShiftAssignment {
  personnel?: Personnel;
  shift?: Shift;
  area?: Area;
  position?: Position;
}

export interface ShiftRequirementWithDetails extends ShiftRequirement {
  shift?: Shift;
  area?: Area;
  position?: Position;
  filled_count?: number;
}

export interface LeaveWithDetails extends Leave {
  personnel?: Personnel;
  approver?: User;
}

// ---------------------------------------------------------------------------
// Scheduler types
// ---------------------------------------------------------------------------

export interface RecalculationInput {
  date_range: [string, string]; // [start, end] ISO date strings
  area_id?: string;
  position_id?: string;
  affected_personnel_id?: string;
  reason: RecalcReason;
  override_freeze?: boolean;
}

export interface CandidateScore {
  personnel_id: string;
  availability_score: number;
  preference_score: number;
  hours_balance_score: number;
  position_match_score: number;
  fairness_score: number;
  total_score: number;
}

export interface ConstraintViolation {
  type: 'max_hours' | 'min_days_off' | 'min_rest' | 'birthday' | 'preference' | 'fatigue' | 'consecutive_days';
  personnel_id: string;
  date: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ScheduleResult {
  assignments: ShiftAssignment[];
  violations: ConstraintViolation[];
  coverage?: number;
  count?: number;
  stats: {
    total_slots: number;
    filled_slots: number;
    coverage_percent: number;
    recalculated_count: number;
    execution_time_ms?: number;
  };
}
