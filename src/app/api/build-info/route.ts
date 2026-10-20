import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    version: 'v1.5.0-modulo-bonos',
    description: 'Modulo de Bonos con definicion dinamica, OTs y portales',
    commit: '4d20bb5',
    buildTime: new Date().toISOString(),
    status: 'success'
  });
}
