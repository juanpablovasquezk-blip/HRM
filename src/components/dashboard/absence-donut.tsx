'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface Props {
  active: number;
  vacation: number;
  sick: number;
  total: number;
}

const COLORS = ['#10b981', '#3b82f6', '#ef4444'];

export function AbsenceDonut({ active, vacation, sick, total }: Props) {
  const data = [
    { name: 'Activos', value: active },
    { name: 'Vacaciones', value: vacation },
    { name: 'Licencia Médica', value: sick },
  ].filter(d => d.value > 0);

  const absentTotal = vacation + sick;
  const coveragePercent = total > 0 ? Math.round((active / total) * 100) : 0;

  return (
    <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Dotación Hoy</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{total} personas en total</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="relative h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                paddingAngle={data.length > 1 ? 3 : 0}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid hsl(var(--border))',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  fontSize: '12px',
                }}
                formatter={(value: any, name: any) => [`${value} personas`, name]}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ bottom: 28 }}>
            <span className="text-3xl font-bold">{coveragePercent}%</span>
            <span className="text-xs text-muted-foreground">Cobertura</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="text-center">
            <p className="text-lg font-bold text-emerald-600">{active}</p>
            <p className="text-xs text-muted-foreground">Activos</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-blue-500">{vacation}</p>
            <p className="text-xs text-muted-foreground">Vacaciones</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-red-500">{sick}</p>
            <p className="text-xs text-muted-foreground">Licencia</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
