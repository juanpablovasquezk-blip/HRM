/**
 * Parallel Scheduling Engine (v2)
 *
 * Built incrementally under ROSTER-02..06.
 * Never writes to the operational database during preview/testing.
 */

export {
  buildBlueExpressApplyPlan,
  calculateBlueExpressNightStaffingProposal,
  getTwoMonthHistoryWindow,
  type BlueExpressApplyUpsertRow,
  type BlueExpressHistoryAssignment,
  type BlueExpressHistoryRequirement,
  type BlueExpressIdentifiers,
  type BlueExpressNightObservation,
  type BlueExpressNightProposal,
  type BlueExpressRequirementDiff,
  type BlueExpressTrendMethod,
  type BlueExpressWeekdaySummary,
} from './blue-express';
export {
  buildDotacionSlotKey,
  isAssignmentProtected,
  measureDotacionCoverage,
  normalizeIsoDate,
  prepareDotacionSlots,
  type PreparedDotacion,
} from './dotacion';

export {
  buildShiftDateTimeRange,
  checkMinRestBetweenShifts,
  checkMonthlySundaysOff,
  checkWeeklyDaysOff,
  checkWeeklyHoursLimit,
  classifyLeave,
  evaluateConsecutiveDaysStreak,
  evaluateConsecutiveRestPreference,
  evaluatePermissionsForWeek,
  expandApprovedLeaves,
  GENERAL_ORDINARY_WEEKLY_HOURS,
  getApplicableWeeklyHoursLimit,
  getShiftOccupiedDates,
  hasMandatoryJornadaViolation,
  identifyUnconfirmedRegimeCases,
  MAX_PREFERRED_CONSECUTIVE_DAYS,
  MIN_DAYS_OFF_FIVE_DAY_WEEK,
  MIN_REST_HOURS_BETWEEN_SHIFTS,
  MIN_SUNDAYS_OFF_PER_MONTH,
  splitShiftHoursByWeek,
  validateJornadaConstraints,
} from './jornada';

export {
  deriveNs22AnchorFromHistory,
  isNs22TitularWorkNight,
  NS22_END_TIME,
  NS22_START_TIME,
  scheduleAirportNs22,
  type Ns22AnchorResolution,
} from './aeropuerto-ns22';
export { fetchAllPaginated, type PaginatedFetchResult } from './pagination';

export {
  CHILE_NATIONAL_HOLIDAYS_BY_YEAR,
  getChileNationalHolidaysForRange,
  isHolidayZeroStaffingPair,
  type ChileNationalHoliday,
  type HolidayRangeLookup,
  type VerifiedHolidayYearCalendar,
} from './chile-holidays';

export { scheduleCrossArea } from './cobertura';
export { compareEnginesPreview } from './preview-compare';
export {
  computeRangeStateHash,
  getDefaultSchedulerEngine,
  isProtectedPersistedAssignment,
  isV2SaveEnabled,
  recoverRosterFromSnapshot,
  saveV2Schedule,
  validateNs22OperationalConfig,
  type Ns22OperationalConfirmation,
  type Ns22TitularConfirmation,
  type PersistedAssignmentRow,
  type PersistedRequirementRow,
  type RecoverSnapshotResult,
  type RosterPersistenceAdapter,
  type RosterV2Snapshot,
  type SaveV2ScheduleInput,
  type SaveV2ScheduleResult,
  type SaveV2TxParams,
  type SchedulerEngineChoice,
} from './save-recover';
export {
  createSupabaseRosterPersistenceAdapter,
  type SupabaseLikeClient,
} from './supabase-adapter';
export {
  buildExtraSelectorItems,
  createExtraAssignmentFromSelector,
  evaluateDailyPlanningVacancies,
  reconcileVacancyExtraRequirements,
  type ExtraSelectorItem,
} from './vacantes-diaria';

export type {
  ConfirmedRegimeConfig,
  CrossAreaAssignment,
  CrossAreaScheduleResult,
  DailyPlanningAssignmentRef,
  DailyPlanningVacancySummary,
  DailyVacancyStatus,
  DotacionCoverageSummary,
  DotacionGroupCoverage,
  DotacionSlot,
  EnginePreviewMetrics,
  ExtraRequirementState,
  ExtraTargetType,
  GeneratedAssignmentRef,
  JornadaViolation,
  LeaveCategory,
  Ns22Assignment,
  Ns22PreservedProtected,
  Ns22ScheduleResult,
  Ns22ShiftDefinition,
  Ns22TitularConfig,
  Ns22TitularConflict,
  Ns22TitularCycleSummary,
  Ns22Vacancy,
  OperationalPriority,
  PermissionRelocationCase,
  PersonnelScheduleProfile,
  PreviewComparisonResult,
  RawExistingAssignment,
  RawLeaveRecord,
  RawShiftRequirement,
  ReconcileExtraResult,
  ReinforcementShiftConfig,
  ScheduledShiftInterval,
  SlotCoverageDetail,
} from './types';
