import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TodoItem {
  id: string;
  text: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  dueLabel: string;
  done: boolean;
}

const todos: TodoItem[] = [
  {
    id: '1',
    text: 'Review Attendance Logs',
    description: 'Ensure all employee attendance records are updated',
    priority: 'high',
    dueLabel: 'Today',
    done: false,
  },
  {
    id: '2',
    text: 'Expiring Documents',
    description: '5 documents expiring within 30 days',
    priority: 'high',
    dueLabel: 'Today',
    done: false,
  },
  {
    id: '3',
    text: 'Pending Leave Requests',
    description: '3 leave requests awaiting approval',
    priority: 'medium',
    dueLabel: 'Today',
    done: false,
  },
  {
    id: '4',
    text: 'Shift Coverage Check',
    description: 'Verify coverage for upcoming week',
    priority: 'medium',
    dueLabel: 'Tomorrow',
    done: false,
  },
  {
    id: '5',
    text: 'Generate Weekly Report',
    description: 'Create shift and attendance report',
    priority: 'low',
    dueLabel: 'This week',
    done: true,
  },
];

const priorityColors = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

export function TodoList() {
  return (
    <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Things To Do
          </CardTitle>
          <button className="text-xs text-orange-600 hover:text-orange-700 dark:text-blue-400 font-medium transition-colors">
            + New task
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {todos.map((todo) => (
          <div
            key={todo.id}
            className={cn(
              'flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50',
              todo.done && 'opacity-50'
            )}
          >
            {todo.done ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-sm font-medium',
                  todo.done && 'line-through text-muted-foreground'
                )}
              >
                {todo.text}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {todo.description}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge
                variant="secondary"
                className={cn('text-[10px] px-1.5 py-0', priorityColors[todo.priority])}
              >
                {todo.priority}
              </Badge>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                {todo.dueLabel}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
