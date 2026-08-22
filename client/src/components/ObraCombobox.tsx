// Combobox pesquisável de obra — busca por qualquer trecho do nome, sem acento.
// Usa o mesmo padrão do EmployeeCombobox (Popover + cmdk).
// "Sem obra (administrativo)" é sempre o primeiro item da lista.
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type ObraOption = { id: number | string; nome: string };

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const SEM_OBRA_VALUE = "0";
const SEM_OBRA_LABEL = "Sem obra (administrativo)";

export function ObraCombobox({
  value,
  onValueChange,
  obras,
  placeholder = "Selecione a obra...",
  disabled,
  triggerClassName,
  className,
}: {
  /** ID da obra selecionada como string, ou "0" / "" para sem obra */
  value: string;
  onValueChange: (v: string) => void;
  obras: ObraOption[];
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () => obras.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")),
    [obras],
  );

  const selectedLabel = useMemo(() => {
    if (value === SEM_OBRA_VALUE || value === "") return SEM_OBRA_LABEL;
    const found = obras.find((o) => String(o.id) === value);
    return found ? found.nome : placeholder;
  }, [obras, value, placeholder]);

  const isAdm = value === SEM_OBRA_VALUE || value === "";

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-9 w-full flex items-center justify-between rounded-md border px-3 text-sm bg-slate-50 transition-colors",
            open ? "border-blue-400 ring-2 ring-blue-100" : "border-input hover:border-gray-300",
            disabled && "opacity-50 cursor-not-allowed",
            triggerClassName,
            className,
          )}
        >
          <span className={cn("truncate text-left", isAdm && "text-muted-foreground")}>
            {selectedLabel}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" sideOffset={4}>
        <Command
          filter={(itemValue, search, keywords) => {
            const hay = norm([itemValue, ...(keywords || [])].join(" "));
            return hay.includes(norm(search)) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Buscar por nome da obra..." className="h-9" />
          <CommandList className="max-h-72">
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma obra encontrada.
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={SEM_OBRA_VALUE}
                keywords={[SEM_OBRA_LABEL]}
                onSelect={() => { onValueChange(SEM_OBRA_VALUE); setOpen(false); }}
                className="text-xs text-muted-foreground italic"
              >
                <Check className={cn("w-3.5 h-3.5 mr-2 shrink-0", isAdm ? "opacity-100" : "opacity-0")} />
                {SEM_OBRA_LABEL}
              </CommandItem>
              {sorted.map((o) => (
                <CommandItem
                  key={o.id}
                  value={String(o.id)}
                  keywords={[o.nome]}
                  onSelect={() => { onValueChange(String(o.id)); setOpen(false); }}
                  className="text-xs"
                >
                  <Check className={cn("w-3.5 h-3.5 mr-2 shrink-0", String(o.id) === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.nome}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default ObraCombobox;
