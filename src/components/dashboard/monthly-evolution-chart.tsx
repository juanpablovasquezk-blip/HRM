'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface Props {
  data: Array<{ month: string; extras: number; licencias: number; vacaciones: number }>;
}

export function MonthlyEvolutionChart({ data }: Props) {
  return (
    <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Evolución Mensual</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Últimos 2 meses — datos reales</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
              barGap={4}
              barSize={18}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-slate-200 dark:stroke-slate-700"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                className="text-slate-500"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                className="text-slate-500"
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid hsl(var(--border))',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  fontSize: '12px',
                }}
                cursor={{ fill: 'hsl(var(--muted))', radius: 4 }}
                formatter={(value: any, name: any) => [value, name]}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
              />
              <Bar dataKey="extras" name="Turnos Extra" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="licencias" name="Licencias Médicas" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="vacaciones" name="Vacaciones" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
