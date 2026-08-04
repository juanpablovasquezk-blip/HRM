import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface MissingDocsCardProps {
  count: number;
  people: Array<{
    personnel: {
      id: string;
      first_name: string;
      last_name_father: string;
    };
    missingCount: number;
    documentNames: string[];
  }>;
}

export function MissingDocsCard({ count, people }: MissingDocsCardProps) {
  return (
    <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm flex flex-col h-full">
      <CardHeader className="pb-3 flex-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Documentos por Subir</CardTitle>
              <p className="text-xs text-muted-foreground">
                {count === 0 ? 'Sin documentos faltantes' : `${count} funcionario(s) con documentos pendientes`}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 flex-1 flex flex-col justify-between">
        {count === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center flex-1">
            <span className="text-2xl mb-1">🎉</span>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">¡Todo al día!</p>
            <p className="text-xs text-muted-foreground mt-0.5">Todos los funcionarios tienen sus documentos requeridos subidos.</p>
          </div>
        ) : (
          <div className="space-y-2 flex-1">
            {people.map((item, i) => (
              <Link 
                key={i}
                href={`/personnel/${item.personnel.id}`}
                className="flex items-center justify-between rounded-lg px-3 py-2 border border-slate-100 bg-slate-50/50 hover:bg-slate-100/70 hover:border-slate-200 dark:border-slate-800/40 dark:bg-slate-900/20 dark:hover:bg-slate-800/40 dark:hover:border-slate-700/80 transition-all duration-200 group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs font-bold shrink-0">
                    {item.personnel.first_name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate leading-snug">
                      {item.personnel.first_name} {item.personnel.last_name_father}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate leading-normal">
                      Falta: {item.documentNames.slice(0, 2).join(', ')}{item.documentNames.length > 2 ? '...' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded text-amber-700 dark:text-amber-300 font-bold">
                    {item.missingCount} doc{item.missingCount !== 1 ? 's' : ''}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/50 flex-none">
          <Link 
            href="/personnel"
            className="text-xs text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 font-semibold flex items-center gap-1 w-fit group"
          >
            Ver listado de personal
            <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
