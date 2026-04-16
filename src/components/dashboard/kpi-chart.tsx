'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const data = [
  { month: 'Jan', coverage: 78, compliance: 85, satisfaction: 72 },
  { month: 'Feb', coverage: 82, compliance: 79, satisfaction: 75 },
  { month: 'Mar', coverage: 86, compliance: 88, satisfaction: 80 },
  { month: 'Apr', coverage: 79, compliance: 82, satisfaction: 71 },
  { month: 'May', coverage: 90, compliance: 91, satisfaction: 85 },
  { month: 'Jun', coverage: 85, compliance: 87, satisfaction: 79 },
];

export function KPIChart() {
  return (
    <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            KPI Metrics
          </CardTitle>
          <span className="text-xs text-muted-foreground">Last 6 months</span>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
              barGap={3}
              barSize={14}
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
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid hsl(var(--border))',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  fontSize: '12px',
                }}
                cursor={{ fill: 'hsl(var(--muted))', radius: 4 }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
              />
              <Bar
                dataKey="coverage"
                name="Coverage"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="compliance"
                name="Compliance"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="satisfaction"
                name="Satisfaction"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
