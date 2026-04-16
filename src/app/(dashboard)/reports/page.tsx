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
          { title: 'Shift Coverage Report', desc: 'Weekly coverage by area and position' },
          { title: 'Personnel Hours Report', desc: 'Hours worked per person per week' },
          { title: 'Leave Summary', desc: 'Leave usage by type and department' },
          { title: 'Document Compliance', desc: 'Expired and expiring documents' },
          { title: 'Transport Usage', desc: 'Company transport utilization' },
          { title: 'Scheduling Efficiency', desc: 'Constraint violations and coverage %' },
        ].map((report) => (
          <Card key={report.title} className="border-slate-200/60 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer">
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
        ))}
      </div>
    </div>
  );
}
