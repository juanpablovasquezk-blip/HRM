import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Generate and view operational reports
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { title: 'Liquidación de Bonos', desc: 'Reporte de pago por persona de turnos y transportes nocturnos con mes de liquidación', href: '/reports/bonos' },
          { title: 'Extra Shifts Detail', desc: 'Summary of extra shifts grouped by personnel', href: '/reports/extras' },
          { title: 'Shift Coverage Report', desc: 'Weekly coverage by area and position', href: '/reports/coverage' },
          { title: 'Personnel Hours Report', desc: 'Hours worked per person per week', href: '/reports/hours' },
          { title: 'Leave Summary', desc: 'Leave usage by type and department', href: '/reports/leaves' },
          { title: 'Document Compliance', desc: 'Expired and expiring documents', href: '/reports/compliance' },
          { title: 'Transport Usage', desc: 'Company transport utilization', href: '/reports/transport' },
          { title: 'Scheduling Efficiency', desc: 'Constraint violations and coverage %', href: '/reports/efficiency' },
          { title: 'GeoVictoria Export', desc: 'Excel export for attendance system integration', href: '/reports/geovictoria' },
          { title: 'Reporte de Permisos GeoVictoria', desc: 'Exporta vacaciones, licencias médicas y permisos con goce de sueldo en formato GeoVictoria', href: '/reports/geovictoria-permisos' },
          { title: 'Reporte de Ausencias', desc: 'Listado de inasistencias de personal por fecha y comentarios de supervisión', href: '/reports/absences' },
          { title: 'Reporte de Amonestaciones y Felicitaciones', desc: 'Historial detallado de cartas de amonestación y felicitación registradas', href: '/reports/warnings' },
        ].map((report) => (
          <Link key={report.title} href={report.href || '#'}>
            <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-orange-600" />
                  {report.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{report.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
