import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    version: 'v1.4.0-proyeccion-completa',
    description: 'Proyeccion TV con Documentos Criticos y Cumpleanos sin Dotacion Horario',
    buildTime: new Date().toISOString(),
    status: 'success'
  });
}
