import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle2,
  RefreshCw, Search, Building2, ShoppingCart, Package2,
  User, CalendarDays, PackageCheck, Truck, ThumbsUp,
  FileText, CreditCard, MapPin, Hash, Warehouse, ArrowDownToLine, ArrowUpFromLine,
  X, TrendingUp, TrendingDown, BarChart2,
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

function InfoCell({ icon: Icon, label, value, colorCls }: {
  icon: React.ElementType; label: string; value?: string | null; colorCls?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="w-3.5 h-3.5 text-slate-400 mt-[3px] shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-none mb-0.5">{label}</p>
        <p className={`text-sm font-medium break-words ${colorCls ?? "text-slate-800"}`}>{value}</p>
      </div>
    </div>
  );
}

export function OcMiniDialog({
  companyId, ordemId, onClose,
}: { companyId: number; ordemId: number; onClose: () => void }) {
  const q = trpc.compras.getOrdemMiniDetalhe.useQuery(
    { companyId, ordemId },
    { staleTime: 60_000 }
  );
  const d = q.data;
  const st = d ? (OC_STATUS[d.status] ?? OC_STATUS.pendente) : null;
  const [itensOpen, setItensOpen] = useState(true);
  const [almoxOpen, setAlmoxOpen] = useState(true);

  const tipoLabel = (t?: string | null) => {
    if (!t) return null;
    return { compra: "Compra", servico: "Serviço", pacote: "Pacote", equipamento: "Equipamento" }[t] ?? t;
  };

  const pgto = [d?.forma_pagamento, d?.condicao_pagamento].filter(Boolean).join(" · ") || null;
  const almox: any[] = (d as any)?.almoxMovimentos ?? [];

  /* Proporção de cada item no total para a mini-barra */
  const maxItemTotal = d ? Math.max(...d.itens.map(i => i.total ?? 0), 1) : 1;

  /* Status color mapping for header gradient */
  const headerGradient: Record<string, string> = {
    rascunho:         "from-yellow-600 to-amber-500",
    pendente:         "from-amber-600 to-orange-500",
    aprovada:         "from-blue-700 to-indigo-600",
    aguardando_aprovacao_extra: "from-red-700 to-rose-600",
    entregue_parcial: "from-orange-600 to-amber-500",
    entregue:         "from-emerald-700 to-teal-600",
    cancelada:        "from-slate-600 to-slate-500",
  };
  const grad = d ? (headerGradient[d.status] ?? "from-slate-700 to-slate-600") : "from-slate-700 to-slate-600";

  /* Step state */
  const steps = d ? [
    {
      icon: FileText,
      label: "Solicitação",
      done: !!d.numero_sc,
      sub: d.numero_sc ?? "OC direta",
      who: d.sc_criado_por_nome,
      when: d.sc_criado_em,
    },
    {
      icon: ShoppingCart,
      label: "OC Emitida",
      done: true,
      sub: d.numero_oc,
      who: d.criado_por_nome,
      when: d.criado_em,
    },
    {
      icon: ThumbsUp,
      label: "Aprovação",
      done: !!d.aprovador_nome,
      sub: d.aprovador_nome ?? "Pendente",
      who: null,
      when: d.aprovado_em,
    },
    {
      icon: PackageCheck,
      label: "Entrega",
      done: !!d.data_entrega_real,
      sub: d.data_entrega_real ?? (d.data_entrega_prevista ? `Prev. ${d.data_entrega_prevista}` : "—"),
      who: null,
      when: null,
    },
  ] : [];

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl w-full p-0 overflow-hidden rounded-2xl shadow-2xl border-0">

        {/* ── HEADER GRADIENTE ─────────────────────────────────────── */}
        <div className={`relative bg-gradient-to-br ${grad} px-5 pt-5 pb-4`}>
          {/* Fechar */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>

          {/* Número + badges */}
          <div className="flex items-start gap-3 pr-8">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0 mt-0.5">
              <ShoppingCart className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-bold font-mono text-lg tracking-tight leading-none">
                  {d ? d.numero_oc : "Carregando…"}
                </span>
                {st && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/20 text-white border border-white/30">
                    {st.label}
                  </span>
                )}
                {d?.tipo && tipoLabel(d.tipo) && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/10 text-white/80">
                    {tipoLabel(d.tipo)}
                  </span>
                )}
              </div>
              {d && (
                <p className="text-white/60 text-xs mt-1">
                  {[d.fornecedor_nome, d.obra_nome].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>

          {/* Total destacado + chips rápidos */}
          {d && (
            <div className="mt-4 flex items-end justify-between gap-3 flex-wrap">
              <div>
                <p className="text-white/50 text-[10px] uppercase tracking-widest font-semibold mb-0.5">Total da OC</p>
                <p className="text-white text-2xl font-bold tabular-nums">{fmt(d.total_oc)}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pgto && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 text-white/90 text-[11px] font-medium">
                    <CreditCard className="w-3 h-3" />{pgto}
                  </span>
                )}
                {d.itens.length > 0 && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 text-white/90 text-[11px] font-medium">
                    <BarChart2 className="w-3 h-3" />{d.itens.length} itens
                  </span>
                )}
                {almox.length > 0 && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 text-white/90 text-[11px] font-medium">
                    <Warehouse className="w-3 h-3" />{almox.length} mov. almox
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── CORPO ────────────────────────────────────────────────── */}
        <div className="overflow-y-auto max-h-[60vh] bg-white">
          {q.isLoading && (
            <div className="py-14 flex flex-col items-center gap-2 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <p className="text-xs">Carregando OC…</p>
            </div>
          )}
          {!q.isLoading && !d && (
            <p className="text-sm text-slate-500 py-10 text-center">OC não encontrada.</p>
          )}

          {d && (
            <>
              {/* ── TIMELINE ─────────────────────────────────────── */}
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-start relative">
                  {/* linha de fundo */}
                  <div className="absolute top-4 left-4 right-4 h-px bg-slate-200 z-0" />
                  {steps.map((s, i) => {
                    const Icon = s.icon;
                    const isLast = i === steps.length - 1;
                    return (
                      <div key={i} className={`flex-1 flex flex-col items-center relative z-10 ${!isLast ? "pr-1" : ""}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                          s.done
                            ? "bg-indigo-600 border-indigo-600 shadow-md shadow-indigo-200"
                            : "bg-white border-slate-300"
                        }`}>
                          <Icon className={`w-3.5 h-3.5 ${s.done ? "text-white" : "text-slate-400"}`} />
                        </div>
                        <p className={`text-[10px] font-semibold mt-1.5 text-center ${s.done ? "text-indigo-700" : "text-slate-400"}`}>
                          {s.label}
                        </p>
                        <p className={`text-[11px] font-medium text-center truncate w-full px-1 ${s.done ? "text-slate-700" : "text-slate-400 italic"}`}>
                          {s.sub}
                        </p>
                        {(s.who || s.when) && (
                          <p className="text-[10px] text-slate-400 text-center leading-tight px-1">
                            {[s.who, s.when].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── CHIPS DE DETALHE ─────────────────────────────── */}
              <div className="px-5 pb-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                {d.fornecedor_nome && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                    <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-slate-500 font-medium">Fornecedor</span>
                    <span className="text-slate-800 font-semibold">{d.fornecedor_nome}</span>
                  </div>
                )}
                {d.obra_nome && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-slate-500 font-medium">Obra</span>
                    <span className="text-slate-800 font-semibold truncate max-w-[200px]">{d.obra_nome}</span>
                  </div>
                )}
                {d.data_entrega_prevista && !d.data_entrega_real && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs">
                    <Truck className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-amber-600 font-medium">Prev.</span>
                    <span className="text-amber-800 font-semibold">{d.data_entrega_prevista}</span>
                  </div>
                )}
                {d.data_entrega_real && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="text-emerald-600 font-medium">Entregue</span>
                    <span className="text-emerald-800 font-semibold">{d.data_entrega_real}</span>
                  </div>
                )}
                {d.numero_nf && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                    <Hash className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-slate-500 font-medium">NF</span>
                    <span className="text-slate-800 font-semibold">{d.numero_nf}</span>
                  </div>
                )}
              </div>

              {/* ── OBSERVAÇÕES ──────────────────────────────────── */}
              {d.observacoes && (
                <div className="px-5 pb-4 border-t border-slate-100 pt-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-1.5">Observações</p>
                  <p className="text-sm text-slate-600 break-words whitespace-pre-wrap leading-relaxed">{d.observacoes}</p>
                </div>
              )}

              {/* ── ITENS ────────────────────────────────────────── */}
              {d.itens.length > 0 && (
                <div className="border-t border-slate-100">
                  {/* Cabeçalho colapsável */}
                  <button
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors group"
                    onClick={() => setItensOpen(o => !o)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-indigo-100 flex items-center justify-center">
                        <BarChart2 className="w-3 h-3 text-indigo-600" />
                      </div>
                      <span className="text-sm font-semibold text-slate-700">Itens</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                        {d.itens.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-indigo-700">{fmt(d.total_oc)}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${itensOpen ? "" : "-rotate-90"}`} />
                    </div>
                  </button>

                  {itensOpen && (
                    <div className="px-5 pb-4">
                      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
                              <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Descrição</th>
                              <th className="text-right px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">Qtd</th>
                              <th className="text-right px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">Unit.</th>
                              <th className="text-right px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {d.itens.map((it, i) => {
                              const pct = Math.round(((it.total ?? 0) / maxItemTotal) * 100);
                              return (
                                <tr key={i} className="group hover:bg-indigo-50/40 transition-colors">
                                  <td className="px-3 py-2.5 text-slate-700 break-words max-w-[180px]">
                                    {/* Mini barra de proporção */}
                                    <div className="mb-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-indigo-400 transition-all"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    {it.descricao}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-slate-500 whitespace-nowrap">
                                    {it.qtd?.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                                    <span className="text-slate-400 ml-0.5">{it.unidade}</span>
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-slate-500 whitespace-nowrap">
                                    {fmt(it.preco_unit ?? 0)}
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-semibold text-slate-800 whitespace-nowrap">
                                    {fmt(it.total ?? 0)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Composição do total */}
                      <div className="mt-2 space-y-1 text-xs">
                        {d.frete > 0 && (
                          <div className="flex justify-between px-1 text-slate-500">
                            <span className="flex items-center gap-1"><Truck className="w-3 h-3" />Frete</span>
                            <span>{fmt(d.frete)}</span>
                          </div>
                        )}
                        {d.outras_despesas > 0 && (
                          <div className="flex justify-between px-1 text-slate-500">
                            <span>Outras despesas</span><span>{fmt(d.outras_despesas)}</span>
                          </div>
                        )}
                        {d.desconto > 0 && (
                          <div className="flex justify-between px-1 text-emerald-600">
                            <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3" />Desconto</span>
                            <span>− {fmt(d.desconto)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-sm text-slate-900 pt-2 border-t border-slate-200 px-1">
                          <span>Total</span><span className="text-indigo-700">{fmt(d.total_oc)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── ALMOXARIFADO ─────────────────────────────────── */}
              <div className="border-t border-slate-100">
                <button
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
                  onClick={() => setAlmoxOpen(o => !o)}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center ${almox.length > 0 ? "bg-teal-100" : "bg-slate-100"}`}>
                      <Warehouse className={`w-3 h-3 ${almox.length > 0 ? "text-teal-600" : "text-slate-400"}`} />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">Almoxarifado</span>
                    {almox.length > 0 && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-600 font-medium border border-teal-200">
                        {almox.length} mov.
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${almoxOpen ? "" : "-rotate-90"}`} />
                </button>

                {almoxOpen && (
                  <div className="px-5 pb-4">
                    {almox.length === 0 ? (
                      <div className="flex items-center gap-2.5 px-3 py-3 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                        <Warehouse className="w-4 h-4 text-slate-300 shrink-0" />
                        <p className="text-xs text-slate-400">Nenhuma movimentação no almoxarifado para esta OC.</p>
                      </div>
                    ) : (
                      <div className="relative pl-5">
                        {/* linha vertical de timeline */}
                        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-slate-200" />
                        <div className="space-y-3">
                          {almox.map((mv: any, i: number) => {
                            const isEntrada = mv.tipo === 'entrada';
                            return (
                              <div key={i} className="relative flex items-start gap-3">
                                {/* dot */}
                                <div className={`absolute -left-5 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center border-2 bg-white ${isEntrada ? "border-teal-400" : "border-rose-400"}`}>
                                  {isEntrada
                                    ? <ArrowDownToLine className="w-2 h-2 text-teal-500" />
                                    : <ArrowUpFromLine className="w-2 h-2 text-rose-500" />}
                                </div>
                                {/* card */}
                                <div className={`flex-1 rounded-xl border px-3 py-2.5 text-xs ${isEntrada ? "bg-teal-50/60 border-teal-200" : "bg-rose-50/60 border-rose-200"}`}>
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className={`font-bold text-[11px] uppercase tracking-wide ${isEntrada ? "text-teal-700" : "text-rose-700"}`}>
                                      {isEntrada ? "Entrada" : mv.tipo === "consumo_direto" ? "Consumo" : "Saída"}
                                    </span>
                                    <span className="font-bold tabular-nums text-slate-800">
                                      {(mv.quantidade ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                                      {mv.itemNome && <span className="font-normal text-slate-500 ml-1">{mv.itemNome}</span>}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-slate-500">
                                    {mv.usuarioNome && (
                                      <span className="flex items-center gap-1">
                                        <User className="w-2.5 h-2.5 text-slate-400" />{mv.usuarioNome}
                                      </span>
                                    )}
                                    {mv.obraNome && (
                                      <span className="flex items-center gap-1">
                                        <MapPin className="w-2.5 h-2.5 text-slate-400" />{mv.obraNome}
                                      </span>
                                    )}
                                    {mv.criadoEm && (
                                      <span className="flex items-center gap-1">
                                        <CalendarDays className="w-2.5 h-2.5 text-slate-400" />{mv.criadoEm}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
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
