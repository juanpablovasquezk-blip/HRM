import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface AwayPerson {
  id: string;
  name: string;
  initials: string;
  reason: string;
  date: string;
  avatarColor: string;
}

const awayPeople: AwayPerson[] = [
  {
    id: '1',
    name: 'Abigail Nato',
    initials: 'AN',
    reason: 'On Leave',
    date: '21 May 2025',
    avatarColor: 'from-pink-400 to-rose-500',
  },
  {
    id: '2',
    name: 'Gina Kiraya',
    initials: 'GK',
    reason: 'Sick',
    date: '21 May 2025',
    avatarColor: 'from-violet-400 to-purple-500',
  },
  {
    id: '3',
    name: 'Jorge Pérez',
    initials: 'JP',
    reason: 'Vacation',
    date: '21 May 2025',
    avatarColor: 'from-cyan-400 to-blue-500',
  },
  {
    id: '4',
    name: 'María López',
    initials: 'ML',
    reason: 'Personal',
    date: '22 May 2025',
    avatarColor: 'from-amber-400 to-orange-500',
  },
];

const reasonBadge: Record<string, string> = {
  'On Leave': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Sick: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Vacation: 'bg-blue-100 text-orange-700 dark:bg-blue-900/30 dark:text-blue-400',
  Personal: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
};

export function WhosAway() {
  return (
    <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">
              Who&apos;s Away
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {awayPeople.length} Employee{awayPeople.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {awayPeople.map((person) => (
          <div
            key={person.id}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
          >
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarFallback
                className={`bg-gradient-to-br ${person.avatarColor} text-white text-xs font-semibold`}
              >
                {person.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{person.name}</p>
              <p className="text-xs text-muted-foreground">{person.date}</p>
            </div>
            <Badge
              variant="secondary"
              className={`text-[10px] px-2 py-0.5 shrink-0 ${
                reasonBadge[person.reason] || reasonBadge['Personal']
              }`}
            >
              {person.reason}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
