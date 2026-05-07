'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
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
  initialStatus?: 'active' | 'inactive' | 'all';
  companies: Company[];
  positions: Position[];
}

export function PersonnelFilters({ 
  companies, 
  positions 
}: PersonnelFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Helper to update URL
  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const currentSearch = searchParams.get('search') || '';
  const currentCompanyId = searchParams.get('company_id') || '';
  const currentPositionId = searchParams.get('position_id') || '';
  const currentStatus = searchParams.get('status') || 'active';

  const [searchTerm, setSearchTerm] = useState(currentSearch);

  // Debounce effect for search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm !== currentSearch) {
        updateFilter('search', searchTerm);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  // Sync local state if currentSearch changes from outside (e.g. Clear button)
  useEffect(() => {
    setSearchTerm(currentSearch);
  }, [currentSearch]);

  // Deduplicate positions by name for the filter dropdown
  const uniquePositions = Array.from(
    new Map(positions.map(p => [p.name, p])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex gap-2">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          name="search"
          placeholder="Buscar por nombre o RUT..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
          id="personnel-search"
        />
      </div>
      <div className="flex-1 max-w-[200px]">
        <select
          name="company_id"
          value={currentCompanyId}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(e) => updateFilter('company_id', e.target.value)}
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
          value={currentPositionId}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(e) => updateFilter('position_id', e.target.value)}
        >
          <option value="">Todos los cargos</option>
          {uniquePositions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 max-w-[200px]">
        <select
          name="status"
          value={currentStatus}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(e) => updateFilter('status', e.target.value)}
        >
          <option value="active">Solo Activos</option>
          <option value="inactive">Solo Bajas</option>
          <option value="all">Todos</option>
        </select>
      </div>
      {(currentSearch || currentCompanyId || currentPositionId || currentStatus !== 'active') && (
        <Button 
          variant="ghost" 
          onClick={() => router.push(pathname)}
          className="text-muted-foreground hover:text-orange-600"
        >
          Limpiar
        </Button>
      )}
    </div>
  );
}
