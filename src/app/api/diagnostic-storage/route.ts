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
    
    // 1. Get initial buckets
    const { data: initialBuckets, error: storageErr } = await adminClient.storage.listBuckets();
    if (storageErr) {
      return NextResponse.json({
        success: false,
        error: `Failed to list buckets: ${storageErr.message}`,
        storageError: {
          message: storageErr.message,
          status: (storageErr as any).status
        }
      });
    }

    const bucketNames = (initialBuckets || []).map(b => b.name);
    let createdBucket = false;
    let createError = null;

    // 2. Auto-create 'documents' bucket if it doesn't exist
    if (!bucketNames.includes('documents')) {
      const { error: createErr } = await adminClient.storage.createBucket('documents', {
        public: true
      });
      if (createErr) {
        createError = createErr.message;
      } else {
        createdBucket = true;
      }
    }

    // 3. Fetch final buckets list to verify
    const { data: finalBuckets } = await adminClient.storage.listBuckets();

    return NextResponse.json({
      success: true,
      supabaseUrlPrefix: url.substring(0, 25) + '...',
      hasServiceRoleKey,
      action: createdBucket 
        ? 'Created missing "documents" bucket successfully!' 
        : createError 
          ? `Failed to create "documents" bucket: ${createError}` 
          : 'No action needed ("documents" bucket already exists)',
      buckets: finalBuckets || null
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message
    });
  }
}
