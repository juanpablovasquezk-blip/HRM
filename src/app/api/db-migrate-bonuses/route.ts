import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireApiAuth(['ADMIN']);
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    {
      success: false,
      error: 'Endpoint de migración deshabilitado por seguridad (HRM-007).',
    },
    { status: 410 }
  );
}
