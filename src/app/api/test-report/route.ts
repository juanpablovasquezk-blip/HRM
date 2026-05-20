import { getTransportReportData } from '@/app/(dashboard)/reports/transport/actions';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await getTransportReportData({
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      companyId: ''
    });
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dataCount: res.data ? res.data.length : null,
      error: res.error || null,
      data: res.data || null
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      stack: err.stack
    }, { status: 500 });
  }
}
