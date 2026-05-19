import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    
    // Test a basic select
    const { data: assignment, error: aErr } = await supabase
      .from('shift_assignments')
      .select('*')
      .limit(1)
      .single();
      
    if (aErr) {
      return NextResponse.json({ success: false, error: aErr.message });
    }
    
    // Let's try to query information_schema via RPC or see if we can do something else.
    // Since we don't have direct SQL execution, let's try to trigger the UUID error by updating
    // attendance_updated_by with a non-uuid string directly from the server.
    const { data: updateRes, error: updateErr } = await supabase
      .from('shift_assignments')
      .update({
        attendance_updated_by: 'TEST_STRING_FROM_SERVER'
      })
      .eq('id', assignment.id)
      .select();
      
    return NextResponse.json({
      success: true,
      sampleAssignment: assignment,
      updateResult: updateRes || null,
      updateError: updateErr ? {
        message: updateErr.message,
        code: updateErr.code,
        details: updateErr.details,
        hint: updateErr.hint
      } : null
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
