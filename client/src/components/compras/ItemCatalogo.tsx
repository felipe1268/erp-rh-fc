import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle2,
  RefreshCw, Search, Building2, ShoppingCart, Package2,
  User, CalendarDays, PackageCheck, Truck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const fmt = (v: number) =>
  "R$" + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const OC_STATUS: Record<string, { label: string; cls: string }> = {
  rascunho:         { label: "Rascunho",        cls: "bg-yellow-100 text-yellow-700" },
  pendente:         { label: "Pendente",         cls: "bg-amber-100 text-amber-700" },
  aprovada:         { label: "Aprovada",         cls: "bg-blue-100 text-blue-700" },
  aguardando_aprovacao_extra: { label: "Aguard. Admin", cls: "bg-red-100 text-red-700" },
  entregue_parcial: { label: "Entrega Parcial",  cls: "bg-orange-100 text-orange-700" },
  entregue:         { label: "Entregue",         cls: "bg-emerald-100 text-emerald-700" },
  cancelada:        { label: "Cancelada",        cls: "bg-gray-100 text-gray-500" },
};

// ─── Mini-dialog de detalhe da OC ────────────────────────────────────────────
export { OC_STATUS };
export function OcMiniDialog({
  companyId, ordemId, onClose,
}: { companyId: number; ordemId: number; onClose: () => void }) {
  const q = trpc.compras.getOrdemMiniDetalhe.useQuery(
    { companyId, ordemId },
    { staleTime: 60_000 }
  );
  const d = q.data;
  const st = d ? (OC_STATUS[d.status] ?? OC_STATUS.pendente) : null;

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="w-4 h-4 text-blue-500 shrink-0" />
            {d ? d.numero_oc : "Carregando…"}
            {st && (
              <span className={`ml-1 px-2 py-0.5 rounded text-[11px] font-semibold ${st.cls}`}>
                {st.label}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {q.isLoading && (
          <div className="py-8 flex justify-center">
            <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        )}

        {!q.isLoading && !d && (
          <p className="text-sm text-slate-500 py-4">OC não encontrada.</p>
        )}

        {d && (
          <div className="space-y-4 pt-1">
            {/* Metadados principais */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">

              {/* Quem pediu */}
              <div className="flex items-start gap-2">
                <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide leading-none mb-0.5">Quem pediu</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    {d.sc_criado_por_nome ?? "—"}
                  </p>
                  {d.numero_sc && (
                    <p className="text-[11px] text-slate-400 mt-0.5">SC: {d.numero_sc}</p>
                  )}
                </div>
              </div>

              {/* Quando pediu */}
              <div className="flex items-start gap-2">
                <CalendarDays className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide leading-none mb-0.5">Quando pediu</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    {d.sc_criado_em ?? "—"}
                  </p>
                </div>
              </div>

              {/* Quando foi feita (OC criada) */}
              <div className="flex items-start gap-2">
                <PackageCheck className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide leading-none mb-0.5">OC criada em</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    {d.criado_em ?? "—"}
                  </p>
                </div>
              </div>

              {/* Fornecedor */}
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide leading-none mb-0.5">Fornecedor</p>
                  <p className="font-medium text-slate-800 dark:text-slate-200 break-words">
                    {d.fornecedor_nome ?? "—"}
                  </p>
                </div>
              </div>

              {/* Entrega prevista */}
              {d.data_entrega_prevista && (
                <div className="flex items-start gap-2">
                  <Truck className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide leading-none mb-0.5">Entrega prevista</p>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{d.data_entrega_prevista}</p>
                  </div>
                </div>
              )}

              {/* Entregue em */}
              {d.data_entrega_real && (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide leading-none mb-0.5">Entregue em</p>
                    <p className="font-medium text-emerald-700 dark:text-emerald-400">{d.data_entrega_real}</p>
                  </div>
                </div>
              )}

              {/* Obra */}
              {d.obra_nome && (
                <div className="flex items-start gap-2 col-span-2">
                  <Building2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase tracking-wide leading-none mb-0.5">Obra</p>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{d.obra_nome}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Itens */}
            {d.itens.length > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-2">Itens ({d.itens.length})</p>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {d.itens.map((it, i) => (
                    <div key={i} className="flex items-center justify-between text-xs gap-2">
                      <span className="text-slate-700 dark:text-slate-300 truncate flex-1" title={it.descricao}>
                        {it.descricao}
                      </span>
                      <span className="text-slate-500 whitespace-nowrap shrink-0">
                        {it.qtd?.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {it.unidade}
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-medium whitespace-nowrap shrink-0">
                        {fmt(it.total ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-700 mt-2">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Total: {fmt(d.total_oc ?? 0)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── OC detail row (lazy loaded per descricao) ───────────────────────────────
function OcDetalheRows({
  companyId, descricao, onSelectOc,
}: { companyId: number; descricao: string; onSelectOc: (id: number) => void }) {
  const q = trpc.compras.getItemOcDetalhes.useQuery(
    { companyId, descricao },
    { staleTime: 60_000 }
  );
  if (q.isLoading)
    return <tr><td colSpan={6} className="px-3 py-2 text-xs text-slate-400 italic">Carregando OCs…</td></tr>;
  if (!q.data?.length)
    return <tr><td colSpan={6} className="px-3 py-2 text-xs text-slate-400 italic">Nenhuma OC encontrada</td></tr>;
  return (
    <>
      {q.data.map((oc, i) => (
        <tr key={i} className="border-t border-slate-100 dark:border-slate-700/50 text-xs">
          <td className="px-3 py-1.5 whitespace-nowrap">
            <button
              className="font-mono text-blue-600 dark:text-blue-400 hover:underline hover:text-blue-800 dark:hover:text-blue-300 transition-colors text-left"
              onClick={() => onSelectOc(oc.ordem_id)}
            >
              {oc.numero_oc ?? "—"}
            </button>
          </td>
          <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{oc.data}</td>
          <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300 max-w-[220px] truncate" title={oc.obra_nome}>
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
              {oc.obra_nome}
            </span>
          </td>
          <td className="px-3 py-1.5 text-slate-600 text-right whitespace-nowrap">
            {oc.qtd?.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {oc.unidade}
          </td>
          <td className="px-3 py-1.5 text-slate-500 text-right whitespace-nowrap">
            {fmt(oc.preco_unit ?? 0)}
          </td>
          <td className="px-3 py-1.5 text-slate-800 dark:text-slate-200 font-medium text-right whitespace-nowrap">
            {fmt(oc.total ?? 0)}
          </td>
        </tr>
      ))}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  companyId: number;
}

export default function ItemCatalogo({ companyId }: Props) {
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [expandedFamilias, setExpandedFamilias] = useState<Set<string>>(new Set());
  const [expandedVariantes, setExpandedVariantes] = useState<Set<string>>(new Set());
  const [expandedDescs, setExpandedDescs] = useState<Set<string>>(new Set());
  const [selectedOcId, setSelectedOcId] = useState<number | null>(null);

  const q = trpc.compras.getItensFamilias.useQuery(
    { companyId },
    { enabled: companyId > 0, staleTime: 120_000 }
  );

  const padronizarItens = trpc.compras.padronizarItens.useMutation({
    onSuccess: (r) => {
      toast({ title: "Padronizado", description: `${r.updated} registro(s) corrigido(s).` });
      q.refetch();
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function toggleFam(key: string) {
    setExpandedFamilias(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleVar(key: string) {
    setExpandedVariantes(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleDesc(key: string) {
    setExpandedDescs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const allFamilias = q.data?.familias ?? [];
  const buscaUp = busca.trim().toUpperCase();
  const familias = buscaUp
    ? allFamilias.filter(f =>
        f.nome.includes(buscaUp) ||
        f.variantes.some(v =>
          v.canonical.toUpperCase().includes(buscaUp) ||
          v.descricoes.some(d => d.nome.toUpperCase().includes(buscaUp))
        )
      )
    : allFamilias;

  const totalFamilias = familias.length;
  const totalItens = familias.reduce((s, f) => s + f.variantes.length, 0);
  const totalGasto = familias.reduce((s, f) => s + f.totalGasto, 0);
  const totalDups = familias.reduce((s, f) => s + f.variantes.filter(v => v.hasDuplicates).length, 0);

  if (q.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <span className="text-sm">Carregando catálogo de itens…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Barra de pesquisa + KPIs */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="Filtrar por família ou descrição…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 text-slate-600 dark:text-slate-300">
            <strong>{totalFamilias}</strong> famílias · <strong>{totalItens}</strong> produtos
          </span>
          <span className="text-xs bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 text-slate-600 dark:text-slate-300">
            <strong>{fmt(totalGasto)}</strong> total
          </span>
          {totalDups > 0 && (
            <span className="text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded px-2 py-1 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="inline w-3 h-3 mr-0.5 -mt-0.5" />
              {totalDups} grupos c/ variantes
            </span>
          )}
        </div>
      </div>

      {/* Lista de famílias */}
      {familias.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          {busca ? "Nenhum resultado para essa busca" : "Nenhum item encontrado"}
        </div>
      ) : (
        <div className="space-y-1.5">
          {familias.map(fam => {
            const isFamOpen = expandedFamilias.has(fam.key);
            const dupCount = fam.variantes.filter(v => v.hasDuplicates).length;
            return (
              <div key={fam.key} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                {/* Família header */}
                <button
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-left"
                  onClick={() => toggleFam(fam.key)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isFamOpen
                      ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    <Package2 className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                      {fam.nome}
                    </span>
                    {dupCount > 0 && (
                      <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0">
                        <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                        {dupCount} variante{dupCount > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs text-slate-500">{fam.variantes.length} produto{fam.variantes.length !== 1 ? "s" : ""}</span>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{fmt(fam.totalGasto)}</span>
                  </div>
                </button>

                {/* Variantes da família */}
                {isFamOpen && (
                  <div className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-700/50">
                    {fam.variantes.map(variant => {
                      const isVarOpen = expandedVariantes.has(variant.normKey);
                      const singleDesc = variant.descricoes.length === 1;
                      return (
                        <div key={variant.normKey}>
                          {/* Variant header */}
                          <button
                            className="w-full flex items-center justify-between px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left"
                            onClick={() => toggleVar(variant.normKey)}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {isVarOpen
                                ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                              {variant.hasDuplicates
                                ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                : <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                              <span className="text-sm text-slate-700 dark:text-slate-300 break-words min-w-0">
                                {variant.canonical}
                              </span>
                              {!singleDesc && (
                                <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-500 px-1.5 py-0 shrink-0">
                                  {variant.descricoes.length} var.
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="text-xs text-slate-400 flex items-center gap-0.5">
                                <ShoppingCart className="w-3 h-3" />{variant.totalOcs}
                              </span>
                              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                {fmt(variant.totalGasto)}
                              </span>
                              {variant.hasDuplicates && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-[10px] h-6 px-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                                  onClick={e => {
                                    e.stopPropagation();
                                    const subs = variant.descricoes
                                      .filter(d => d.nome !== variant.canonical)
                                      .map(d => ({ de: d.nome, para: variant.canonical }));
                                    if (subs.length) padronizarItens.mutate({ companyId, substituicoes: subs });
                                  }}
                                  disabled={padronizarItens.isPending}
                                >
                                  Padronizar
                                </Button>
                              )}
                            </div>
                          </button>

                          {/* Descrições dentro da variante */}
                          {isVarOpen && (
                            <div className="px-4 pb-3 pt-1 space-y-1.5 bg-slate-50/50 dark:bg-slate-800/20">
                              {variant.descricoes.map(desc => {
                                const descKey = `${variant.normKey}||${desc.nome}`;
                                const isDescOpen = expandedDescs.has(descKey);
                                const isCanonical = desc.nome === variant.canonical;
                                return (
                                  <div key={desc.nome} className="rounded border border-slate-200 dark:border-slate-700 overflow-hidden">
                                    <button
                                      className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-white dark:hover:bg-slate-800 text-left"
                                      onClick={() => toggleDesc(descKey)}
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        {isDescOpen
                                          ? <ChevronDown className="w-3 h-3 text-slate-300 shrink-0" />
                                          : <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />}
                                        <span className={`text-xs break-all ${isCanonical ? "text-green-700 dark:text-green-400 font-medium" : "text-slate-600 dark:text-slate-400"}`}>
                                          {desc.nome}
                                          {isCanonical && <span className="ml-1 text-[10px] text-green-500">(principal)</span>}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0 ml-2 text-xs text-slate-400">
                                        <span>{desc.n_ocs} OC(s)</span>
                                        <span>{desc.unidade}</span>
                                        <span className="font-medium text-slate-600 dark:text-slate-400">{fmt(desc.totalGasto)}</span>
                                        {!isCanonical && variant.hasDuplicates && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-[10px] h-5 px-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                            onClick={e => {
                                              e.stopPropagation();
                                              padronizarItens.mutate({ companyId, substituicoes: [{ de: desc.nome, para: variant.canonical }] });
                                            }}
                                            disabled={padronizarItens.isPending}
                                          >
                                            Corrigir
                                          </Button>
                                        )}
                                      </div>
                                    </button>

                                    {/* OC details (lazy) */}
                                    {isDescOpen && (
                                      <div className="border-t border-slate-100 dark:border-slate-700 overflow-x-auto">
                                        <table className="w-full text-xs min-w-[500px]">
                                          <thead>
                                            <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-[10px] uppercase tracking-wide">
                                              <th className="px-3 py-1 text-left">OC</th>
                                              <th className="px-3 py-1 text-left">Data</th>
                                              <th className="px-3 py-1 text-left">Obra</th>
                                              <th className="px-3 py-1 text-right">Qtd</th>
                                              <th className="px-3 py-1 text-right">Preço Unit.</th>
                                              <th className="px-3 py-1 text-right">Total</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            <OcDetalheRows companyId={companyId} descricao={desc.nome} onSelectOc={setSelectedOcId} />
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedOcId !== null && (
        <OcMiniDialog
          companyId={companyId}
          ordemId={selectedOcId}
          onClose={() => setSelectedOcId(null)}
        />
      )}
    </div>
  );
}
