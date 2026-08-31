'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface MultiSelectFilterProps {
  placeholder: string;
  singularName?: string;
  pluralName?: string;
  options: FilterOption[];
  selectedValues: string[];
  onChange: (selected: string[]) => void;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
}

export function MultiSelectFilter({
  placeholder,
  singularName = 'opción',
  pluralName = 'opciones',
  options,
  selectedValues,
  onChange,
  searchPlaceholder = 'Buscar...',
  className = '',
  disabled = false,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase().trim();
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, search]);

  const handleToggle = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const handleSelectAll = () => {
    const allValues = Array.from(new Set([...selectedValues, ...filteredOptions.map((o) => o.value)]));
    onChange(allValues);
  };

  const handleClear = () => {
    const filteredSet = new Set(filteredOptions.map((o) => o.value));
    onChange(selectedValues.filter((v) => !filteredSet.has(v)));
  };

  const selectedCount = selectedValues.length;

  let buttonText = placeholder;
  if (selectedCount === 1) {
    const found = options.find((o) => o.value === selectedValues[0]);
    if (found) buttonText = found.label;
  } else if (selectedCount > 1) {
    buttonText = `${selectedCount} ${pluralName}`;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-expanded={open}
        className={`flex h-10 w-full items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-xs font-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer ${
          disabled ? 'opacity-50 pointer-events-none' : ''
        } ${
          selectedCount > 0
            ? 'border-orange-500/50 bg-orange-50/40 text-orange-950 dark:text-orange-200 font-semibold'
            : 'text-slate-600 dark:text-slate-300'
        } ${className}`}
      >
        <span className="truncate pr-1">{buttonText}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>

      <PopoverContent className="w-[230px] p-2 space-y-2" align="start">
        {options.length > 5 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs rounded-lg"
            />
          </div>
        )}

        <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground font-medium">
          <button
            type="button"
            onClick={handleSelectAll}
            className="hover:text-orange-600 cursor-pointer transition-colors"
          >
            Seleccionar todos
          </button>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="hover:text-red-600 cursor-pointer transition-colors"
            >
              Desmarcar
            </button>
          )}
        </div>

        <div className="max-h-[220px] overflow-y-auto space-y-1 pr-1">
          {filteredOptions.length === 0 ? (
            <p className="text-center py-4 text-xs text-muted-foreground italic">No hay opciones</p>
          ) : (
            filteredOptions.map((opt) => {
              const isChecked = selectedValues.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => handleToggle(opt.value)}
                      className="rounded-md border-slate-300 data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
                    />
                    <span className="truncate text-slate-800 dark:text-slate-200">{opt.label}</span>
                  </div>
                  {opt.count !== undefined && (
                    <span className="text-[10px] text-slate-400 font-mono">({opt.count})</span>
                  )}
                </label>
              );
            })
          )}
        </div>

        {selectedCount > 0 && (
          <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-7 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/30"
              onClick={() => onChange([])}
            >
              Limpiar selección ({selectedCount})
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
