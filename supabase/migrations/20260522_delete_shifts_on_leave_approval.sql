-- =============================================================================
-- Migration: Delete Shift Assignments and Transport Requests on Leave Approval
-- Date: 2026-05-22
-- =============================================================================

-- 1. Create trigger function to cancel assignments and delete transport requests
CREATE OR REPLACE FUNCTION public.delete_shifts_on_approved_leave()
RETURNS TRIGGER AS $$
BEGIN
  -- We only act if the leave is approved
  IF NEW.status = 'approved' THEN
    -- Cancel conflicting shift assignments
    UPDATE public.shift_assignments
    SET status = 'cancelled'
    WHERE personnel_id = NEW.personnel_id
      AND date >= NEW.start_date
      AND date <= NEW.end_date;

    -- Delete conflicting transport requests
    DELETE FROM public.transport_requests
    WHERE personnel_id = NEW.personnel_id
      AND date >= NEW.start_date
      AND date <= NEW.end_date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger on leaves table
DROP TRIGGER IF EXISTS on_leave_approved_delete_shifts ON public.leaves;
CREATE TRIGGER on_leave_approved_delete_shifts
  AFTER INSERT OR UPDATE OF status, start_date, end_date, personnel_id
  ON public.leaves
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_shifts_on_approved_leave();
