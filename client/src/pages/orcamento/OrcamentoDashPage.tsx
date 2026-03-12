import React, { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import OrcamentoDashTab from "./OrcamentoDashTab";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import {
  Loader2, ChevronDown, ArrowLeft, LayoutGrid,
  TrendingUp, DollarSign, BarChart2, Users,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const n = (v: any) => parseFloat(v || "0") || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16"];

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fBRLK(v: number) {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$${(v / 1_000).toFixed(0)}k`;
  return formatBRL(v);
}

const TODOS_ID = -1;

// ── Dashboard Consolidado (todos os orçamentos) ───────────────────────────────
function OrcamentoConsolidadoDash({ lista, formatBRL }: { lista: any[]; formatBRL: (v: number) => string }) {
  const totalVenda  = r2(lista.reduce((s, o) => s + n(o.totalVenda), 0));
  const totalCusto  = r2(lista.reduce((s, o) => s + n(o.totalCusto), 0));
  const lucro       = r2(totalVenda - totalCusto);
  const margemMedia = totalVenda > 0 ? (lucro / totalVenda) * 100 : 0;
  const bdiMedio    = lista.length > 0
    ? lista.reduce((s, o) => s + n(o.bdiPercentual) * 100, 0) / lista.length
    : 0;
  const ticketMedio = lista.length > 0 ? totalVenda / lista.length : 0;
  const maior = lista.reduce((mx, o) => n(o.totalVenda) > n(mx?.totalVenda ?? 0) ? o : mx, lista[0]);

  // Ranking por valor (horizontal bar)
  const ranking = [...lista]
    .sort((a, b) => n(b.totalVenda) - n(a.totalVenda))
    .slice(0, 12)
    .map(o => ({
      name: (o.descricao ?? o.nome ?? `#${o.id}`).slice(0, 28),
      venda: n(o.totalVenda),
      custo: n(o.totalCusto),
      bdi: (n(o.bdiPercentual) * 100).toFixed(1),
    }));

  // Por cliente (pie)
  const clienteMap: Record<string, number> = {};
  lista.forEach(o => {
    const c = o.cliente ?? "Sem cliente";
    clienteMap[c] = (clienteMap[c] ?? 0) + n(o.totalVenda);
  });
  const clientePie = Object.entries(clienteMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  // BDI por orçamento
  const bdiChart = [...lista]
    .filter(o => n(o.bdiPercentual) > 0)
    .sort((a, b) => n(b.bdiPercentual) - n(a.bdiPercentual))
    .slice(0, 12)
    .map(o => ({
      name: (o.descricao ?? o.nome ?? `#${o.id}`).slice(0, 20),
      bdi: +(n(o.bdiPercentual) * 100).toFixed(2),
      margem: n(o.margemLucroBdi) > 0
        ? +(n(o.margemLucroBdi) * 100).toFixed(2)
        : 0,
    }));

  const kpis = [
    { label: "Projetos", value: String(lista.length), icon: <LayoutGrid className="h-5 w-5" />, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Valor Total de Venda", value: fBRLK(totalVenda), icon: <DollarSign className="h-5 w-5" />, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Lucro Total Estimado", value: fBRLK(lucro), icon: <TrendingUp className="h-5 w-5" />, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Margem Média", value: `${margemMedia.toFixed(1)}%`, icon: <BarChart2 className="h-5 w-5" />, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "BDI Médio", value: `${bdiMedio.toFixed(1)}%`, icon: <BarChart2 className="h-5 w-5" />, color: "text-cyan-600", bg: "bg-cyan-50" },
    { label: "Ticket Médio", value: fBRLK(ticketMedio), icon: <DollarSign className="h-5 w-5" />, color: "text-rose-600", bg: "bg-rose-50" },
    { label: "Custo Total", value: fBRLK(totalCusto), icon: <DollarSign className="h-5 w-5" />, color: "text-slate-600", bg: "bg-slate-100" },
    { label: "Maior Projeto", value: fBRLK(n(maior?.totalVenda)), icon: <Users className="h-5 w-5" />, color: "text-indigo-600", bg: "bg-indigo-50" },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2">
            <div className={`w-9 h-9 rounded-lg ${k.bg} ${k.color} flex items-center justify-center`}>
              {k.icon}
            </div>
            <p className="text-[11px] text-slate-500 font-medium leading-tight">{k.label}</p>
            <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ranking por valor */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Ranking por Valor de Venda</p>
          {ranking.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={ranking.length * 34 + 20}>
              <BarChart data={ranking} layout="vertical" barSize={14} margin={{ left: 0, right: 50, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fBRLK} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => formatBRL(n(v))} />
                <Bar dataKey="venda" name="Venda" fill="#3b82f6" radius={[0,4,4,0]}>
                  {ranking.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Por cliente */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Distribuição por Cliente</p>
          {clientePie.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">Sem dados</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={170} height={170}>
                <PieChart>
                  <Pie data={clientePie} cx="50%" cy="50%" innerRadius={40} outerRadius={75}
                    dataKey="value" fontSize={10}>
                    {clientePie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatBRL(n(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                {clientePie.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-slate-600 truncate flex-1">{d.name}</span>
                    <span className="font-semibold text-slate-800 shrink-0">{fBRLK(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* BDI e Margem por projeto */}
        {bdiChart.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 lg:col-span-2">
            <p className="text-sm font-semibold text-slate-700 mb-3">BDI e Margem por Orçamento (%)</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bdiChart} barGap={2} margin={{ left: 0, right: 10, top: 0, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10 }} unit="%" />
                <Tooltip formatter={(v: any) => `${n(v).toFixed(2)}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="bdi" name="BDI %" fill="#3b82f6" radius={[3,3,0,0]} maxBarSize={28} />
                <Bar dataKey="margem" name="Margem %" fill="#10b981" radius={[3,3,0,0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Tabela resumo */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 lg:col-span-2 overflow-x-auto">
          <p className="text-sm font-semibold text-slate-700 mb-3">Resumo de Todos os Orçamentos</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-700 text-white">
                <th className="py-2 px-3 text-left font-semibold">Orçamento</th>
                <th className="py-2 px-3 text-left font-semibold">Cliente</th>
                <th className="py-2 px-3 text-right font-semibold">Custo</th>
                <th className="py-2 px-3 text-right font-semibold">Venda</th>
                <th className="py-2 px-3 text-right font-semibold">BDI%</th>
                <th className="py-2 px-3 text-right font-semibold">Margem%</th>
                <th className="py-2 px-3 text-right font-semibold">Lucro</th>
              </tr>
            </thead>
            <tbody>
              {[...lista]
                .sort((a, b) => n(b.totalVenda) - n(a.totalVenda))
                .map((o, i) => {
                  const venda  = n(o.totalVenda);
                  const custo  = n(o.totalCusto);
                  const lucroO = r2(venda - custo);
                  const marg   = venda > 0 ? ((lucroO / venda) * 100).toFixed(1) : "—";
                  const bdi    = (n(o.bdiPercentual) * 100).toFixed(1);
                  return (
                    <tr key={o.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="py-1.5 px-3 font-medium text-slate-800 max-w-[200px] truncate">
                        {o.descricao ?? o.nome ?? `#${o.id}`}
                      </td>
                      <td className="py-1.5 px-3 text-slate-500 truncate max-w-[140px]">{o.cliente ?? "—"}</td>
                      <td className="py-1.5 px-3 text-right text-slate-700">{custo > 0 ? formatBRL(custo) : "—"}</td>
                      <td className="py-1.5 px-3 text-right font-semibold text-blue-700">{venda > 0 ? formatBRL(venda) : "—"}</td>
                      <td className="py-1.5 px-3 text-right text-slate-600">{bdi}%</td>
                      <td className="py-1.5 px-3 text-right text-emerald-700 font-medium">{marg}%</td>
                      <td className="py-1.5 px-3 text-right font-semibold" style={{ color: lucroO >= 0 ? "#059669" : "#dc2626" }}>
                        {lucroO !== 0 ? formatBRL(lucroO) : "—"}
                      </td>
                    </tr>
                  );
                })}
              {/* Totais */}
              <tr style={{ background: "#F7F797" }}>
                <td className="py-2 px-3 font-bold text-slate-800" colSpan={2}>TOTAL PORTFÓLIO</td>
                <td className="py-2 px-3 text-right font-bold text-slate-800">{formatBRL(totalCusto)}</td>
                <td className="py-2 px-3 text-right font-bold text-blue-800">{formatBRL(totalVenda)}</td>
                <td className="py-2 px-3 text-right font-bold text-slate-800">{bdiMedio.toFixed(1)}%</td>
                <td className="py-2 px-3 text-right font-bold text-emerald-800">{margemMedia.toFixed(1)}%</td>
                <td className="py-2 px-3 text-right font-bold" style={{ color: lucro >= 0 ? "#065f46" : "#991b1b" }}>
                  {formatBRL(lucro)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function OrcamentoDashPage() {
  const [, params] = useRoute("/orcamento/:id/dash");
  const [, setLocation] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;

  const [selectedId, setSelectedId] = useState<number | null>(
    params?.id ? parseInt(params.id) : null
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  // Lista de orçamentos para o seletor
  const { data: lista = [], isLoading: loadingLista } = trpc.orcamento.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  // Auto-seleciona o primeiro se nenhum foi passado na URL
  useEffect(() => {
    if (!selectedId && lista.length > 0) {
      setSelectedId(n(lista[0].id));
    }
  }, [lista, selectedId]);

  // Dados completos do orçamento selecionado (apenas quando não é "Todos")
  const { data, isLoading: loadingOrc } = trpc.orcamento.getById.useQuery(
    { id: selectedId ?? 0 },
    { enabled: !!selectedId && selectedId !== TODOS_ID }
  );

  const orc = data as any;

  // ── Cálculos ─────────────────────────────────────────────────────────────
  const itens     = orc?.itens    ?? [];
  const insumos   = orc?.insumos  ?? [];
  const bdiLinhas = orc?.bdiLinhas ?? [];

  const bdiPct  = n(orc?.bdiPercentual) * 100;
  const metaPct = n(orc?.metaPercentual) * 100;

  const childMap: Record<string, boolean> = {};
  itens.forEach((item: any) => {
    const dot = item.eapCodigo?.lastIndexOf(".");
    if (dot > 0) childMap[item.eapCodigo.slice(0, dot)] = true;
  });

  const leafItems = itens.filter((i: any) => !childMap[i.eapCodigo]);
  const calcMat   = r2(leafItems.reduce((s: number, i: any) => r2(s) + r2(n(i.custoTotalMat)), 0));
  const calcMdo   = r2(leafItems.reduce((s: number, i: any) => r2(s) + r2(n(i.custoTotalMdo)), 0));
  const calcCusto = r2(leafItems.reduce((s: number, i: any) => r2(s) + r2(n(i.custoTotal)),    0));
  const calcVenda = r2(leafItems.reduce((s: number, i: any) => r2(s) + r2(n(i.vendaTotal)),    0));

  const totalCusto     = r2(n(orc?.totalCusto) || calcCusto);
  const totalVenda     = r2(n(orc?.totalVenda) || calcVenda);
  const totalMat       = r2(n(orc?.totalMateriais) || calcMat);
  const totalMdo       = r2(n(orc?.totalMdo) || calcMdo);
  const valorNegociado = r2(n(orc?.valorNegociado));
  const totalMeta      = r2(totalCusto * (1 - metaPct / 100));

  const margemLucroPct = n(orc?.margemLucroBdi) > 0
    ? n(orc?.margemLucroBdi)
    : (totalVenda > 0 && totalCusto > 0 ? (totalVenda - totalCusto) / totalVenda : 0);

  // Nome exibido no seletor
  const isTodos = selectedId === TODOS_ID;
  const selectedOrc = isTodos ? null : lista.find((o: any) => n(o.id) === selectedId);
  const pickerLabel = loadingLista
    ? "Carregando..."
    : isTodos
    ? `Todos os Orçamentos (${lista.length})`
    : selectedOrc
    ? (selectedOrc.descricao ?? selectedOrc.nome ?? `Orçamento #${selectedOrc.id}`)
    : "Selecionar orçamento";

  return (
    <DashboardLayout>
      <div className="p-4">

        {/* ── Cabeçalho ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost" size="sm"
              className="text-muted-foreground -ml-2"
              onClick={() =>
                selectedId && selectedId !== TODOS_ID
                  ? setLocation(`/orcamento/${selectedId}`)
                  : setLocation("/orcamento/lista")
              }
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                {isTodos ? "Dashboard Consolidado" : "Dashboard do Orçamento"}
              </h1>
              {selectedOrc && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedOrc.descricao ?? selectedOrc.nome ?? `Orçamento #${selectedOrc.id}`}
                  {selectedOrc.cliente ? ` · ${selectedOrc.cliente}` : ""}
                </p>
              )}
              {isTodos && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Visão consolidada de todos os orçamentos do portfólio
                </p>
              )}
            </div>
          </div>

          {/* Seletor de Orçamento */}
          <div className="relative">
            <button
              onClick={() => setPickerOpen(v => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium shadow-sm transition-all min-w-[240px] justify-between"
            >
              <span className="truncate">{pickerLabel}</span>
              <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
            </button>

            {pickerOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-80 max-h-80 overflow-y-auto">
                {/* Opção: Todos */}
                <button
                  onClick={() => { setSelectedId(TODOS_ID); setPickerOpen(false); setLocation("/orcamento/dash"); }}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 transition-colors border-b-2 border-slate-200 ${isTodos ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-700 font-medium"}`}
                >
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4 shrink-0" />
                    <span>Todos os Orçamentos</span>
                    <span className="ml-auto text-[10px] bg-indigo-100 text-indigo-600 rounded-full px-2 py-0.5">
                      {lista.length} projetos
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 ml-6">Visão consolidada do portfólio</p>
                </button>

                {/* Orçamentos individuais */}
                {lista.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">Nenhum orçamento encontrado</p>
                ) : (
                  lista.map((o: any) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        setSelectedId(n(o.id));
                        setPickerOpen(false);
                        setLocation(`/orcamento/${o.id}/dash`);
                      }}
                      className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 ${n(o.id) === selectedId ? "bg-emerald-50 text-emerald-700 font-medium" : "text-slate-700"}`}
                    >
                      <p className="font-medium truncate">{o.descricao ?? o.nome ?? `Orçamento #${o.id}`}</p>
                      {o.cliente && <p className="text-[10px] text-muted-foreground mt-0.5">{o.cliente}</p>}
                      {n(o.totalVenda) > 0 && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Venda: {formatBRL(n(o.totalVenda))} · BDI: {(n(o.bdiPercentual) * 100).toFixed(1)}%
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Conteúdo ──────────────────────────────────────────────── */}

        {/* Estado inicial sem seleção */}
        {!selectedId && !loadingLista && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
            <p className="text-lg font-medium">Selecione um orçamento para ver o dashboard</p>
            <p className="text-sm">Use o seletor acima para escolher um projeto ou ver todos juntos</p>
          </div>
        )}

        {/* Carregando lista */}
        {loadingLista && (
          <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Carregando orçamentos...</span>
          </div>
        )}

        {/* Dashboard consolidado — Todos */}
        {!loadingLista && isTodos && lista.length > 0 && (
          <OrcamentoConsolidadoDash lista={lista} formatBRL={formatBRL} />
        )}

        {/* Carregando orçamento individual */}
        {!isTodos && selectedId && loadingOrc && (
          <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Carregando dados do orçamento...</span>
          </div>
        )}

        {/* Dashboard individual */}
        {!isTodos && selectedId && !loadingOrc && orc && (
          <OrcamentoDashTab
            orc={orc}
            orcamentoId={selectedId ?? 0}
            itens={itens}
            insumos={insumos}
            bdiLinhas={bdiLinhas}
            totalCusto={totalCusto}
            totalVenda={totalVenda}
            totalMat={totalMat}
            totalMdo={totalMdo}
            totalMeta={totalMeta}
            valorNegociado={valorNegociado}
            margemLucroPct={margemLucroPct}
            bdiPct={bdiPct}
            metaPct={metaPct}
            childMap={childMap}
            composicoesCatalogo={[]}
            formatBRL={formatBRL}
          />
        )}

      </div>
    </DashboardLayout>
  );
}
