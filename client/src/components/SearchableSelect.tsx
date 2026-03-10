"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Texto extra para busca (ex: CPF, matrícula) - não exibido, mas pesquisável */
  searchExtra?: string;
  /** Subtítulo exibido abaixo do label */
  subtitle?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Selecione...",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhum resultado encontrado.",
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Normalizar texto para busca (remove acentos, lowercase)
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const term = normalize(search);
    return options.filter((opt) => {
      const searchText = normalize(
        `${opt.label} ${opt.subtitle || ""} ${opt.searchExtra || ""}`
      );
      return searchText.includes(term);
    });
  }, [options, search]);

  // Focus input when popover opens
  React.useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setSearch("");
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal h-9 px-3",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div
          ref={listRef}
          className="max-h-[280px] overflow-y-auto p-1"
        >
          {filteredOptions.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            filteredOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "relative flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                  value === opt.value && "bg-accent text-accent-foreground"
                )}
                onClick={() => {
                  onValueChange(opt.value);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value === opt.value ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex flex-col items-start text-left min-w-0">
                  <span className="truncate w-full">{opt.label}</span>
                  {opt.subtitle && (
                    <span className="text-xs text-muted-foreground truncate w-full">
                      {opt.subtitle}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
