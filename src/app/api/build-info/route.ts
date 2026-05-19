import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    deployedCommit: 'inspect-db-v1',
    buildTime: new Date().toISOString(),
    status: 'success'
  });
}
