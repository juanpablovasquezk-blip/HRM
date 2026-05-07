import GeoVictoriaClient from './geovictoria-client';

export const metadata = {
  title: 'Reporte GeoVictoria | HRM Roster',
  description: 'Descarga de planificación de turnos para integración con GeoVictoria',
};

export default function GeoVictoriaPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Reportes Operativos</h1>
        <p className="text-slate-500">Integración y sincronización con sistemas externos</p>
      </div>
      
      <GeoVictoriaClient />
    </div>
  );
}
