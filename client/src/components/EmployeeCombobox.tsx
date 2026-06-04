// Rev. 2746 — Combobox pesquisável de colaborador (busca por nome, acento-insensitive)
// para os seletores de "Gestores para Contratos de Terceiros" em Configurações.
// Reaproveita o MESMO padrão do `FuncaoCombobox` (Popover + cmdk). O filtro da
// lista de quais colaboradores aparecem (ex.: só funções indiretas) é feito por
// quem usa o componente, via a prop `options`.
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type EmployeeOption = { id: number | string; nomeCompleto: string; funcao?: string | null };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function EmployeeCombobox({
  value,
  onChange,
  options,
  placeholder = "Selecione o colaborador...",
  triggerClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  options: EmployeeOption[];
  placeholder?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(
    () => options.slice().sort((a, b) => String(a.nomeCompleto).localeCompare(String(b.nomeCompleto), "pt-BR")),
    [options],
  );
  const selected = useMemo(() => options.find((o) => String(o.id) === value), [options, value]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 w-full flex items-center justify-between rounded-md border px-3 text-sm bg-input transition-colors",
            open ? "border-blue-400 ring-2 ring-blue-100" : "border-input hover:border-gray-300",
            triggerClassName,
          )}
        >
          <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
            {selected ? `${selected.nomeCompleto}${selected.funcao ? ` — ${selected.funcao}` : ""}` : placeholder}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {value && (
              <span
                className="text-gray-400 hover:text-red-500 px-1"
                role="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onChange(""); setOpen(false); }}
              >
                ×
              </span>
            )}
            <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" sideOffset={4}>
        <Command
          filter={(itemValue, search, keywords) => {
            const hay = norm([itemValue, ...(keywords || [])].join(" "));
            return hay.includes(norm(search)) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Buscar por nome..." />
          <CommandList className="max-h-72">
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              Nenhum colaborador encontrado.
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="--limpar--"
                onSelect={() => { onChange(""); setOpen(false); }}
                className="text-xs text-muted-foreground italic"
              >
                <Check className={cn("w-3.5 h-3.5 mr-2", !value ? "opacity-100" : "opacity-0")} />
                — Nenhum —
              </CommandItem>
              {sorted.map((o) => (
                <CommandItem
                  key={o.id}
                  value={String(o.id)}
                  keywords={[o.nomeCompleto, o.funcao || ""]}
                  onSelect={() => { onChange(String(o.id)); setOpen(false); }}
                  className="text-xs"
                >
                  <Check className={cn("w-3.5 h-3.5 mr-2 shrink-0", String(o.id) === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.nomeCompleto}</span>
                  {o.funcao && <span className="ml-auto pl-2 text-[10px] text-muted-foreground shrink-0">{o.funcao}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default EmployeeCombobox;
