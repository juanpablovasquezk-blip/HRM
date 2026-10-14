import { getProyeccionData } from './actions';
import ProyeccionClient from './proyeccion-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: 'Minerquim • Modo Proyección TV',
  description: 'Panel de proyección continua para pantallas y monitores operativos',
};

export default async function ProyeccionPage() {
  const result = await getProyeccionData();

  if (result.error || !result.data) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-6 text-center font-sans">
        <div className="max-w-md bg-slate-900 border border-red-800/80 p-8 rounded-2xl shadow-2xl">
          <h2 className="text-xl font-black text-red-400 uppercase tracking-wide mb-2">
            Error al Cargar Modo Proyección
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            {result.error || 'No se pudieron recuperar los datos operativos.'}
          </p>
          <a
            href="/proyeccion"
            className="inline-block px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition-colors text-sm uppercase"
          >
            Reintentar Conexión
          </a>
        </div>
      </div>
    );
  }

  return <ProyeccionClient initialPayload={result.data} />;
}
