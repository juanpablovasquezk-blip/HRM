/**
 * Scheduling Engine Type Definitions
 */

export interface RecalculationInput {
  date_range: [string, string]; // [start, end] ISO date strings
  area_id?: string;
  position_id?: string;
  affected_personnel_id?: string;
  reason: 'sick_leave' | 'manual' | 'optimization';
  override_freeze?: boolean;
}

export interface CandidateScore {
  personnel_id: string;
  availability_score: number;     // 0-100: is the person available?
  preference_score: number;       // 0-100: does the shift match preferences?
  hours_balance_score: number;    // 0-100: fewer hours = higher score
  position_match_score: number;   // 0-100: does position match?
  fairness_score: number;         // 0-100: historical fairness
  total_score: number;
}

export interface ConstraintViolation {
  type: 'max_hours' | 'min_days_off' | 'min_rest' | 'birthday' | 'preference' | 'rotation_violation';
  personnel_id: string;
  date: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ScheduleResult {
  assignments: AssignmentCandidate[];
  violations: ConstraintViolation[];
  stats: {
    total_slots: number;
    filled_slots: number;
    coverage_percent: number;
    recalculated_count: number;
  };
}

export interface AssignmentCandidate {
  personnel_id: string;
  shift_id: string;
  date: string;
  area_id: string;
  position_id: string;
  status: 'scheduled';
  is_locked: boolean;
  is_manual: boolean;
  frozen_by_rule: boolean;
}

export interface PersonnelAvailability {
  personnel_id: string;
  birth_date: string | null;
  first_name: string;
  main_position: string;
  main_position_name?: string;
  main_position_obj?: any;
  secondary_positions: string[];
  prefers_night: boolean;
  avoids_night: boolean;
  fixed_shift_id: string | null;
  fixed_shift_name?: string;
  rotation_pattern: string | null;
  has_special_contract: boolean;
  // Computed during scheduling
  weekly_hours: number;
  days_off_count: number;
  last_shift_end: Date | null;
  assigned_dates: Set<string>;
  leave_dates: Set<string>;
}

export interface ShiftSlot {
  requirement_id: string;
  date: string;
  shift_id: string;
  area_id: string;
  position_id: string;
  shift_start: string; // HH:MM
  shift_end: string;   // HH:MM
  shift_duration_hours: number;
  required_count: number;
  filled_count: number;
  position_name?: string;
  area_name?: string;
  shift_name?: string;
}
