// Rev. 2493 — Combobox pesquisável de Função extraído de `Colaboradores.tsx`
// (Rev. 2169) pra ser compartilhado com `FuncionariosTerceiros.tsx` e
// quaisquer outros forms que precisem do MESMO catálogo `jobFunctions` ao
// invés de texto livre. Pedido user (image_1779887618252/631987/678443,
// 27/05/2026): "A FUNÇÃO DOS TERCEIROS NÃO QUERO PODER DIGITAR.. QUERO QUE
// SIGA AS FUNÇÕES QUE JÁ TEMOS NO NOSSO BANCO DE DADOS".
//
// Padrão: Popover + cmdk com filtro case/acento-insensitive, largura
// herdada do trigger, item "—" pra limpar. Idêntico ao PlanoDeContaCombobox.
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function FuncaoCombobox({
  value,
  onChange,
  options,
  placeholder = "Selecione a função",
  triggerClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  options: any[];
  placeholder?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(
    () => options.slice().sort((a: any, b: any) => String(a.nome).localeCompare(String(b.nome), "pt-BR")),
    [options],
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "mt-1 h-9 w-full flex items-center justify-between rounded-md border px-3 text-sm bg-input transition-colors",
            open ? "border-blue-400 ring-2 ring-blue-100" : "border-input hover:border-gray-300",
            triggerClassName,
          )}
        >
          <span className={cn("truncate text-left", !value && "text-muted-foreground")}>
            {value || placeholder}
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
          filter={(itemValue, search) => {
            const s = search.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const v = itemValue.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return v.includes(s) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Buscar função..." />
          <CommandList className="max-h-72">
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma função encontrada.
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="--limpar--"
                onSelect={() => { onChange(""); setOpen(false); }}
                className="text-xs text-muted-foreground italic"
              >
                <Check className={cn("w-3.5 h-3.5 mr-2", !value ? "opacity-100" : "opacity-0")} />
                — {placeholder} —
              </CommandItem>
              {sorted.map((f: any) => (
                <CommandItem
                  key={f.id}
                  value={String(f.nome)}
                  onSelect={() => { onChange(String(f.nome)); setOpen(false); }}
                  className="text-xs"
                >
                  <Check className={cn("w-3.5 h-3.5 mr-2", f.nome === value ? "opacity-100" : "opacity-0")} />
                  {f.nome}
                  {f.cbo && <span className="ml-auto text-[10px] text-muted-foreground">CBO {f.cbo}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default FuncaoCombobox;
