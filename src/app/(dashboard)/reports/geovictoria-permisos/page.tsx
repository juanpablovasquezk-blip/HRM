import GeoVictoriaPermisosClient from './permisos-client';

export const metadata = {
  title: 'Reporte de Permisos GeoVictoria | HRM Roster Manager',
  description: 'Exporta vacaciones, licencias médicas y permisos con goce de sueldo en formato GeoVictoria.',
};

export default function GeoVictoriaPermisosPage() {
  return <GeoVictoriaPermisosClient />;
}
