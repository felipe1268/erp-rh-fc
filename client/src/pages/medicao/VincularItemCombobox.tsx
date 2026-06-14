// Rev. 3094 — Combobox de vínculo "contorno → item do orçamento" para o
// Levantamento de Campo. Substitui o <Select> simples (sem busca, que misturava
// grupos e atividades repetidas por pavimento) por:
//  - BUSCA conforme se digita (código EAP, descrição OU pavimento);
//  - AGRUPAMENTO por pavimento/etapa (caminho da árvore EAP), para que a MESMA
//    atividade repetida em vários pavimentos NÃO seja confundida na medição;
//  - detecção robusta de item MENSURÁVEL (folha = sem filhos na árvore EAP),
//    independente do campo `tipo` (que vem inconsistente: "Item"/"Composto"/"").

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ItemVinculavel = {
  id: number;
  eapCodigo: string;
  descricao: string;
  unidade: string;
  grupoPath: string; // caminho dos grupos ancestrais (pavimento/etapa) " › "
  search: string; // texto combinado em minúsculas p/ filtro
};

const nf = (v: number, d = 2) =>
  (isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

// Constrói a lista de itens MENSURÁVEIS (folhas) a partir do orçamento plano.
// Um item é GRUPO (pavimento/etapa, não mensurável) se existe outro item cujo
// `eapCodigo` começa com `code + "."` — ou seja, ele tem filhos na árvore EAP.
export function buildItensVinculaveis(itens: any[]): ItemVinculavel[] {
  const norm = (s: any) => String(s ?? "").trim();
  const cleanDesc = (s: string) => norm(s).replace(/[:\s]+$/, "");
  const byCode = new Map<string, any>();
  for (const it of itens ?? []) {
    const code = norm(it?.eapCodigo);
    if (code) byCode.set(code, it);
  }
  const codes = Array.from(byCode.keys());
  const isGroup = (code: string) => codes.some((c) => c !== code && c.startsWith(code + "."));
  const ancestorsOf = (code: string): string[] => {
    const parts = code.split(".");
    const out: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      const anc = byCode.get(parts.slice(0, i).join("."));
      if (anc) out.push(cleanDesc(anc.descricao));
    }
    return out;
  };
  const leaves: ItemVinculavel[] = [];
  for (const it of itens ?? []) {
    const code = norm(it?.eapCodigo);
    if (!code) continue;
    if (isGroup(code)) continue; // grupo/pavimento → não é medível
    if (norm(it?.tipo) === "Etapa/Subetapa") continue; // cabeçalho mesmo sem filhos
    const descricao = norm(it.descricao);
    const unidade = norm(it.unidade);
    const grupoPath = ancestorsOf(code).join(" › ");
    leaves.push({
      id: it.id,
      eapCodigo: code,
      descricao,
      unidade,
      grupoPath,
      search: `${code} ${descricao} ${grupoPath}`.toLowerCase(),
    });
  }
  return leaves;
}

const LIMITE = 200;

export function VincularItemCombobox({
  items,
  value,
  onChange,
  jaMedidoMap,
  emptyHint,
  disabled,
}: {
  items: ItemVinculavel[];
  value: string; // id do item vinculado ("" = nenhum)
  onChange: (id: string) => void;
  jaMedidoMap?: Map<number, number>;
  emptyHint?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = useMemo(
    () => items.find((i) => String(i.id) === String(value)),
    [items, value],
  );

  const filtered = useMemo(() => {
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const res = tokens.length
      ? items.filter((i) => tokens.every((t) => i.search.includes(t)))
      : items;
    return res.slice(0, LIMITE);
  }, [items, q]);

  const grupos = useMemo(() => {
    const m = new Map<string, ItemVinculavel[]>();
    for (const i of filtered) {
      const k = i.grupoPath || "—";
      const arr = m.get(k);
      if (arr) arr.push(i);
      else m.set(k, [i]);
    }
    return Array.from(m.entries());
  }, [filtered]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="h-auto min-h-7 w-full justify-between gap-1 py-1 text-xs font-normal"
        >
          {selected ? (
            <span className="flex w-full flex-col items-start overflow-hidden text-left leading-tight">
              <span className="w-full truncate">
                {selected.eapCodigo} · {selected.descricao}
                {selected.unidade ? ` (${selected.unidade})` : ""}
              </span>
              {selected.grupoPath ? (
                <span className="w-full truncate text-[10px] text-gray-400">{selected.grupoPath}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-gray-400">Vincular item do orçamento…</span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(30rem,92vw)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por código, atividade ou pavimento…"
            value={q}
            onValueChange={setQ}
          />
          <CommandList className="max-h-[50vh]">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-gray-500">
                {emptyHint ?? "Nenhum item no orçamento vinculado."}
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-gray-500">
                Nada encontrado para “{q.trim()}”.
              </div>
            ) : (
              <>
                {value ? (
                  <CommandItem
                    value="__desvincular"
                    onSelect={() => {
                      onChange("");
                      setOpen(false);
                    }}
                    className="text-xs text-red-600"
                  >
                    <X className="mr-1 h-3.5 w-3.5" /> Desvincular item
                  </CommandItem>
                ) : null}
                {grupos.map(([path, list]) => (
                  <CommandGroup key={path} heading={path === "—" ? "Sem agrupamento" : path}>
                    {list.map((i) => {
                      const ja = jaMedidoMap?.get(i.id) ?? 0;
                      const sel = String(value) === String(i.id);
                      return (
                        <CommandItem
                          key={i.id}
                          value={String(i.id)}
                          onSelect={() => {
                            onChange(String(i.id));
                            setOpen(false);
                          }}
                          className="items-start gap-1 text-xs"
                        >
                          <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", sel ? "opacity-100" : "opacity-0")} />
                          <span className="flex flex-col leading-tight">
                            <span>
                              <b>{i.eapCodigo}</b> · {i.descricao}
                              {i.unidade ? <span className="text-gray-400"> ({i.unidade})</span> : null}
                            </span>
                            {ja > 0 ? (
                              <span className="text-[10px] text-amber-600">
                                já medido neste contrato: {nf(ja)} {i.unidade}
                              </span>
                            ) : null}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ))}
                {filtered.length >= LIMITE ? (
                  <div className="px-3 py-1.5 text-center text-[10px] text-gray-400">
                    Mostrando os primeiros {LIMITE}. Refine a busca para ver mais.
                  </div>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
