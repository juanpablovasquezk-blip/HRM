"use client";

import React, { useState, useEffect, useRef } from "react";
import { format, parse, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

interface DatePickerFieldProps {
  value?: string; // YYYY-MM-DD
  onChange?: (value: string) => void;
  label?: string;
  placeholder?: string;
  minYear?: number;
  maxYear?: number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
}

export function DatePickerField({
  value: initialValue = "",
  onChange,
  label,
  placeholder = "DD-MM-AAAA",
  minYear = 1950,
  maxYear = 2045,
  required,
  disabled,
  className,
  id,
  name,
}: DatePickerFieldProps) {
  // Input display value DD-MM-AAAA
  const [inputValue, setInputValue] = useState("");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Internal YYYY-MM-DD value for uncontrolled usage
  const [internalValue, setInternalValue] = useState(initialValue);

  // Sync internal value (YYYY-MM-DD) to input value (DD-MM-AAAA)
  useEffect(() => {
    if (initialValue) {
      setInternalValue(initialValue);
      const parsedDate = parse(initialValue, "yyyy-MM-dd", new Date());
      if (isValid(parsedDate)) {
        const formatted = format(parsedDate, "dd-MM-yyyy");
        if (formatted !== inputValue) {
          setInputValue(formatted);
        }
      } else {
        setInputValue(initialValue); // fallback for invalid initial value
      }
    } else {
      setInternalValue("");
      setInputValue("");
    }
  }, [initialValue]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    
    // Auto-insert dashes if typing normally
    let formatted = rawVal.replace(/[^\d-]/g, "");
    if (formatted.length > 2 && formatted[2] !== "-") {
      formatted = formatted.slice(0, 2) + "-" + formatted.slice(2);
    }
    if (formatted.length > 5 && formatted[5] !== "-") {
      formatted = formatted.slice(0, 5) + "-" + formatted.slice(5);
    }
    // limit length to 10
    formatted = formatted.slice(0, 10);

    setInputValue(formatted);

    if (formatted.length === 10) {
      const parsedDate = parse(formatted, "dd-MM-yyyy", new Date());
      if (isValid(parsedDate)) {
        const iso = format(parsedDate, "yyyy-MM-dd");
        setInternalValue(iso);
        onChange?.(iso);
      }
    } else if (formatted === "") {
      setInternalValue("");
      onChange?.("");
    }
  };

  const handleSelectDate = (date: Date | undefined) => {
    if (date) {
      const iso = format(date, "yyyy-MM-dd");
      setInternalValue(iso);
      onChange?.(iso);
      setIsPopoverOpen(false);
    } else {
      setInternalValue("");
      onChange?.("");
    }
  };

  const selectedDate = internalValue ? parse(internalValue, "yyyy-MM-dd", new Date()) : undefined;

  return (
    <div className={cn(className)}>
      {label && (
        <Label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
      )}
      <div className="relative">
        {name && <input type="hidden" name={name} value={internalValue} />}
        <Input
          id={id}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          ref={inputRef}
          className="h-11 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700 pr-10"
        />
        
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 disabled:opacity-50"
            disabled={disabled}
          >
            <CalendarIcon className="h-4 w-4" />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={isValid(selectedDate) ? selectedDate : undefined}
              onSelect={handleSelectDate}
              startMonth={new Date(minYear, 0)}
              endMonth={new Date(maxYear, 11)}
              captionLayout="dropdown"
              locale={es}
              defaultMonth={isValid(selectedDate) ? selectedDate : undefined}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
