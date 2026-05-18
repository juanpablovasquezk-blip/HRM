import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    deployedCommit: 'd444671c6993a4b9ee5696d5ea2476d05f36e4b8',
    buildTime: '2026-05-18T19:48:00Z',
    status: 'success'
  });
}
