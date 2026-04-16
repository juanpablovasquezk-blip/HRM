'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface Person {
  id: string;
  first_name: string;
  last_name_father: string;
  rut: string;
}

interface PersonnelSelectProps {
  personnel: Person[];
  onSelect: (id: string) => void;
  defaultValue?: string;
  placeholder?: string;
}

export function PersonnelSelect({ 
  personnel, 
  onSelect, 
  defaultValue,
  placeholder = "Seleccionar trabajador..." 
}: PersonnelSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(defaultValue || '');

  const selectedPerson = personnel.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        role="combobox"
        aria-expanded={open}
        className={cn(
          buttonVariants({ variant: 'outline' }),
          "w-full justify-between font-normal"
        )}
      >
        {selectedPerson
          ? `${selectedPerson.first_name} ${selectedPerson.last_name_father} (${selectedPerson.rut})`
          : placeholder}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput placeholder="Buscar por nombre o RUT..." />
          <CommandList>
            <CommandEmpty>No se encontró al trabajador.</CommandEmpty>
            <CommandGroup>
              {personnel.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.first_name} ${p.last_name_father} ${p.rut}`}
                  onSelect={() => {
                    setValue(p.id);
                    onSelect(p.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === p.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div>
                    <p className="font-medium text-sm">
                      {p.first_name} {p.last_name_father}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {p.rut}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
