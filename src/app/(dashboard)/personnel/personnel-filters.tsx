'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

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
  initialStatus?: 'active' | 'inactive' | 'pending' | 'missing_sizes' | 'all' | 'incomplete' | 'missing_docs' | 'dismissal_pending';
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

  // Deduplicate positions by name for the filter dropdown
  const uniquePositions = Array.from(
    new Map(positions.map(p => [p.name, p])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const [positionPopoverOpen, setPositionPopoverOpen] = useState(false);
  const selectedPositionIds = currentPositionId ? currentPositionId.split(',').filter(Boolean) : [];

  let positionButtonLabel = 'Todos los cargos';
  if (selectedPositionIds.length === 1) {
    const pos = uniquePositions.find(p => p.id === selectedPositionIds[0]);
    if (pos) positionButtonLabel = pos.name;
  } else if (selectedPositionIds.length > 1) {
    positionButtonLabel = `${selectedPositionIds.length} cargos`;
  }

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
        <Popover open={positionPopoverOpen} onOpenChange={setPositionPopoverOpen}>
          <PopoverTrigger
            aria-expanded={positionPopoverOpen}
            className="flex h-10 w-full justify-between items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-normal text-muted-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring [&>span]:line-clamp-1 text-left hover:bg-background cursor-pointer"
          >
            <span className={selectedPositionIds.length > 0 ? "text-foreground" : "text-muted-foreground"}>
              {positionButtonLabel}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-2" align="start">
            <div className="flex flex-col gap-2">
              <div className="max-h-[250px] overflow-y-auto space-y-1.5 pr-1">
                {uniquePositions.map((p) => {
                  const isChecked = selectedPositionIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm font-normal text-foreground"
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          let newIds: string[];
                          if (checked) {
                            newIds = [...selectedPositionIds, p.id];
                          } else {
                            newIds = selectedPositionIds.filter(id => id !== p.id);
                          }
                          updateFilter('position_id', newIds.join(','));
                        }}
                      />
                      <span className="line-clamp-1">{p.name}</span>
                    </label>
                  );
                })}
              </div>
              {selectedPositionIds.length > 0 && (
                <>
                  <div className="h-px bg-border -mx-2 my-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs h-8 text-muted-foreground hover:text-orange-600"
                    onClick={() => updateFilter('position_id', '')}
                  >
                    Limpiar selección
                  </Button>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex-1 max-w-[200px]">
        <select
          name="status"
          value={currentStatus}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(e) => updateFilter('status', e.target.value)}
        >
          <option value="active">Solo Activos</option>
          <option value="missing_sizes">⚠️ Sin Tallas EPP</option>
          <option value="incomplete">❌ Fichas Incompletas</option>
          <option value="missing_docs">📄 Doc. Requerida Incompleta</option>
          <option value="dismissal_pending">⏳ Baja Pendiente</option>
          <option value="inactive">Solo Bajas</option>
          <option value="pending">Solicitudes Pendientes</option>
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
