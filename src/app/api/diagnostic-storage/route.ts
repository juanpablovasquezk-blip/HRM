import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !hasServiceRoleKey) {
      return NextResponse.json({
        success: false,
        error: 'Missing Supabase environment variables on server',
        url: url || null,
        hasServiceRoleKey
      });
    }

    const adminClient = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: buckets, error: storageErr } = await adminClient.storage.listBuckets();

    return NextResponse.json({
      success: true,
      supabaseUrlPrefix: url.substring(0, 25) + '...',
      hasServiceRoleKey,
      buckets: buckets || null,
      storageError: storageErr ? {
        message: storageErr.message,
        status: (storageErr as any).status
      } : null
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message
    });
  }
}
