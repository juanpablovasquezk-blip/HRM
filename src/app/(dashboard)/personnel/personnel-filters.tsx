'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Company {
  id: string;
  name: string;
}

interface Position {
  id: string;
  name: string;
}

interface PersonnelFiltersProps {
  initialSearch?: string;
  initialCompanyId?: string;
  initialPositionId?: string;
  companies: Company[];
  positions: Position[];
}

export function PersonnelFilters({ 
  initialSearch, 
  initialCompanyId, 
  initialPositionId,
  companies, 
  positions 
}: PersonnelFiltersProps) {
  // Deduplicate positions by name for the filter dropdown
  const uniquePositions = Array.from(
    new Map(positions.map(p => [p.name, p])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <form className="flex gap-2">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          name="search"
          placeholder="Buscar por nombre o RUT..."
          defaultValue={initialSearch}
          className="pl-10"
          id="personnel-search"
        />
      </div>
      <div className="flex-1 max-w-[200px]">
        <select
          name="company_id"
          defaultValue={initialCompanyId}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(e) => {
            const form = e.target.form;
            if (form) form.submit();
          }}
        >
          <option value="">Todas las empresas</option>
          {companies?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 max-w-[200px]">
        <select
          name="position_id"
          defaultValue={initialPositionId}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(e) => {
            const form = e.target.form;
            if (form) form.submit();
          }}
        >
          <option value="">Todos los cargos</option>
          {uniquePositions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="secondary">
        Filtrar
      </Button>
    </form>
  );
}
