import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    
    // 1. Get total count of transport_requests
    const { count: totalCount, error: countError } = await supabase
      .from('transport_requests')
      .select('*', { count: 'exact', head: true });

    // 2. Get first 3 rows just to see their dates
    const { data: sampleRows, error: sampleError } = await supabase
      .from('transport_requests')
      .select('id, date, transport_type')
      .limit(3);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      env: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT_SET',
        // Mask the anon key for security but show if it is set
        HAS_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      },
      totalCount: totalCount,
      countError: countError ? { code: countError.code, message: countError.message } : null,
      sampleRows: sampleRows || null,
      sampleError: sampleError ? { code: sampleError.code, message: sampleError.message } : null
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      stack: err.stack
    }, { status: 500 });
  }
}
