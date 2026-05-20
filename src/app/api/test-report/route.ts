import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Query using Standard client (obeys RLS)
    const supabase = await createClient();
    const { count: rlsCount, error: rlsError } = await supabase
      .from('transport_requests')
      .select('*', { count: 'exact', head: true });

    // 2. Query using Admin client (bypasses RLS)
    const adminSupabase = createAdminClient();
    const { count: adminCount, error: adminError } = await adminSupabase
      .from('transport_requests')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      databaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT_SET',
      queryResults: {
        standardClientWithRLS: {
          count: rlsCount,
          error: rlsError ? { code: rlsError.code, message: rlsError.message } : null
        },
        adminClientBypassingRLS: {
          count: adminCount,
          error: adminError ? { code: adminError.code, message: adminError.message } : null
        }
      }
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      stack: err.stack
    }, { status: 500 });
  }
}
