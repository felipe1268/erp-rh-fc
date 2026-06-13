// Rev. 3017 — Análise de Custos · DETALHE (drill-down)
// Tela aberta ao clicar em QUALQUER KPI / barra / fatia / linha da
// "Análise de Custos". Lê os params da URL (ano, mes, tipo, valor),
// re-busca `financial.getContasAPagarByYear` e mostra os lançamentos
// PERTINENTES ao item clicado: KPIs do recorte, distribuição por mês,
// quebra por uma dimensão secundária e a tabela detalhada completa.
// 100% client-side (ZERO novo backend).
import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import {
  ChevronLeft, CircleDollarSign, CheckCircle2, Receipt, AlertTriangle,
  BarChart2, Layers, Tag, Building2, Calendar, ListChecks,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechTooltip, LabelList,
} from "recharts";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}
function BRLk(v: number): string {
  const n = v || 0;
  const br = (x: number, d: number) =>
    x.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  if (Math.abs(n) >= 1_000_000) return `R$ ${br(n / 1_000_000, 1)} mi`;
  if (Math.abs(n) >= 1_000) return `R$ ${br(n / 1_000, 0)} mil`;
  return formatBRL(n);
}
function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function valorEfetivo(r: any): number {
  const real = Number(r.valorRealizado ?? 0);
  if (real > 0) return real;
  return Number(r.valorPrevisto ?? 0);
}
function mesNumDe(r: any): number {
  const s: string = (r.dataCompetencia || r.dataVencimento || "") as string;
  if (!s || s.length < 7) return 0;
  const m = parseInt(s.slice(5, 7), 10);
  return isNaN(m) ? 0 : m;
}
function isVencido(r: any): boolean {
  return Number(r.diasAtraso ?? 0) > 0 && r.status !== "pago";
}
function fmtData(s?: string): string {
  if (!s || s.length < 10) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function statusTheme(r: any): { label: string; cls: string } {
  if (isVencido(r)) return { label: "Vencido", cls: "bg-red-100 text-red-700" };
  if (r.status === "pago") return { label: "Pago", cls: "bg-emerald-100 text-emerald-700" };
  if (r.status === "parcial") return { label: "Parcial", cls: "bg-amber-100 text-amber-700" };
  return { label: "Em aberto", cls: "bg-amber-100 text-amber-700" };
}

function DetTooltip({ active, payload, label, totalRef }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-xs">
      {label != null && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-1.5 text-gray-600">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color || p.payload?.fill }} />
          <span>{p.name}:</span>
          <span className="font-semibold tabular-nums">{formatBRL(p.value)}</span>
          {totalRef ? <span className="text-gray-400">({pct(p.value, totalRef).toFixed(1)}%)</span> : null}
        </p>
      ))}
    </div>
  );
}

export default function FinanceiroAnaliseCustosDetalhe() {
  const { companyId } = useCompany();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const params = useMemo(() => new URLSearchParams(search), [search]);
  const ano = parseInt(params.get("ano") || String(new Date().getFullYear()), 10);
  const mes = parseInt(params.get("mes") || "0", 10); // 0 = ano inteiro
  const tipo = params.get("tipo") || "status"; // status | mes | categoria | centro | fornecedor
  const valor = params.get("valor") || "total";

  const { data, isLoading } = (trpc as any).financial.getContasAPagarByYear.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
  );
  const rowsAll: any[] = Array.isArray(data) ? data : [];

  // Recorte: aplica o filtro de mês herdado da tela-mãe + o filtro do clique.
  const rows = useMemo(() => {
    let base = rowsAll;
    // tipo=mes define o próprio mês; senão respeita o filtro herdado.
    if (tipo === "mes") {
      const mn = parseInt(valor, 10);
      base = base.filter((r) => mesNumDe(r) === mn);
    } else if (mes > 0) {
      base = base.filter((r) => mesNumDe(r) === mes);
    }
    switch (tipo) {
      case "status":
        if (valor === "pago") return base.filter((r) => r.status === "pago");
        if (valor === "aberto") return base.filter((r) => r.status !== "pago");
        if (valor === "vencido") return base.filter((r) => isVencido(r));
        return base; // total
      case "categoria":
        return base.filter((r) => (r.contaNome || "Sem categoria") === valor);
      case "centro":
        return base.filter((r) => (r.obraNome || "Sem centro de custo") === valor);
      case "fornecedor":
        return base.filter((r) => (r.fornecedorNome || "").trim() === valor);
      default:
        return base; // mes (já filtrado)
    }
  }, [rowsAll, tipo, valor, mes]);

  const kpis = useMemo(() => {
    let total = 0, pago = 0, aberto = 0, vencido = 0, qtdVencido = 0;
    for (const r of rows) {
      const ef = valorEfetivo(r);
      total += ef;
      if (r.status === "pago") pago += Number(r.valorRealizado ?? 0) || ef;
      else aberto += Number(r.valorPrevisto ?? 0) || ef;
      if (isVencido(r)) { vencido += ef; qtdVencido++; }
    }
    return { total, pago, aberto, vencido, qtdVencido, qtd: rows.length };
  }, [rows]);

  // Distribuição por mês (12 meses) do recorte.
  const porMes = useMemo(() => {
    const arr = MESES_ABREV.map((m) => ({ mes: m, value: 0 }));
    for (const r of rows) {
      const mn = mesNumDe(r);
      if (mn < 1 || mn > 12) continue;
      arr[mn - 1].value += valorEfetivo(r);
    }
    return arr;
  }, [rows]);

  // Quebra secundária pertinente: se já filtramos por categoria/fornecedor,
  // quebramos pela OUTRA dimensão; senão por categoria.
  const breakdown = useMemo(() => {
    const porChave = (fn: (r: any) => string) => {
      const map = new Map<string, number>();
      for (const r of rows) {
        const k = fn(r);
        map.set(k, (map.get(k) ?? 0) + valorEfetivo(r));
      }
      return Array.from(map.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
    };
    if (tipo === "categoria") {
      return { titulo: "Por Fornecedor", icon: Building2, data: porChave((r) => (r.fornecedorNome || "Sem fornecedor").trim() || "Sem fornecedor") };
    }
    if (tipo === "fornecedor") {
      return { titulo: "Por Categoria", icon: Tag, data: porChave((r) => (r.contaNome || "Sem categoria")) };
    }
    if (tipo === "centro") {
      return { titulo: "Por Categoria", icon: Tag, data: porChave((r) => (r.contaNome || "Sem categoria")) };
    }
    return { titulo: "Por Centro de Custo", icon: Layers, data: porChave((r) => (r.obraNome || "Sem centro de custo")) };
  }, [rows, tipo]);

  // Lançamentos detalhados (ordenados por valor desc).
  const lancamentos = useMemo(() => {
    return [...rows].sort((a, b) => valorEfetivo(b) - valorEfetivo(a));
  }, [rows]);

  // Cabeçalho descritivo do recorte.
  const { titulo, subtitulo, Icon } = useMemo(() => {
    const periodo = mes > 0 && tipo !== "mes" ? `${MESES_FULL[mes - 1]} de ${ano}` : `Ano de ${ano}`;
    switch (tipo) {
      case "mes": {
        const mn = parseInt(valor, 10);
        return { titulo: MESES_FULL[mn - 1] ? `${MESES_FULL[mn - 1]} de ${ano}` : `Mês ${valor}`, subtitulo: "Lançamentos do mês", Icon: Calendar };
      }
      case "categoria":
        return { titulo: valor, subtitulo: `Categoria · ${periodo}`, Icon: Tag };
      case "centro":
        return { titulo: valor, subtitulo: `Centro de custo · ${periodo}`, Icon: Layers };
      case "fornecedor":
        return { titulo: valor, subtitulo: `Fornecedor · ${periodo}`, Icon: Building2 };
      default: {
        const lbl = valor === "pago" ? "Pago" : valor === "aberto" ? "Em aberto" : valor === "vencido" ? "Vencido" : "Custo total";
        return { titulo: lbl, subtitulo: `Visão geral · ${periodo}`, Icon: CircleDollarSign };
      }
    }
  }, [tipo, valor, mes, ano]);

  const semDados = !isLoading && rows.length === 0;
  const voltar = () => setLocation("/financeiro/analise-custos");

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={voltar}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2 min-w-0">
                <Icon className="w-5 h-5 md:w-6 md:h-6 text-rose-600 shrink-0" />
                <span className="truncate" title={titulo}>{titulo}</span>
              </h1>
              <p className="text-sm text-gray-500 mt-0.5 truncate">{subtitulo}</p>
            </div>
          </div>
        </div>

        {/* KPIs do recorte */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Custo do recorte", value: kpis.total, icon: CircleDollarSign, color: "text-rose-600", bg: "bg-rose-50", fmt: "brl" },
            { label: "Pago", value: kpis.pago, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", fmt: "brl" },
            { label: "Em aberto", value: kpis.aberto, icon: Receipt, color: "text-amber-600", bg: "bg-amber-50", fmt: "brl" },
            { label: "Vencido", value: kpis.vencido, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", fmt: "brl", badge: kpis.qtdVencido },
            { label: "Lançamentos", value: kpis.qtd, icon: ListChecks, color: "text-indigo-600", bg: "bg-indigo-50", fmt: "int" },
          ].map((c) => {
            const I = c.icon;
            const isInt = c.fmt === "int";
            return (
              <Card key={c.label} className="border-0 shadow-sm">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
                      <I className={`w-4 h-4 ${c.color}`} />
                    </div>
                    {c.badge !== undefined && c.badge > 0 && (
                      <span className="text-[10px] font-semibold text-red-700 bg-red-100 rounded-full px-1.5 py-0.5">{c.badge}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 font-medium">{c.label}</p>
                  <p
                    className={`text-base lg:text-lg font-bold ${c.color} mt-0.5 tabular-nums leading-tight whitespace-nowrap`}
                    title={isLoading ? undefined : isInt ? undefined : formatBRL(c.value)}
                  >
                    {isLoading ? "..." : isInt ? c.value.toLocaleString("pt-BR") : BRLk(c.value)}
                  </p>
                  {!isLoading && !isInt && c.value > 0 && (
                    <p className="text-[10px] text-gray-400 tabular-nums leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                      {formatBRL(c.value)}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {semDados ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-16 text-center">
              <CircleDollarSign className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Nenhum lançamento neste recorte.</p>
              <p className="text-xs text-gray-400 mt-1">Volte e selecione outro item.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Gráficos pertinentes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Distribuição por mês — só faz sentido quando NÃO é um mês único */}
              {tipo !== "mes" && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                      <BarChart2 className="w-4 h-4" /> Distribuição por Mês — {ano}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-4">
                    <div style={{ width: "100%", height: 280 }}>
                      <ResponsiveContainer>
                        <BarChart data={porMes} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                          <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={BRLk} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={56} />
                          <RechTooltip content={<DetTooltip />} cursor={{ fill: "#f8fafc" }} />
                          <Bar dataKey="value" name="Custo" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Quebra por dimensão secundária */}
              <Card className={`border-0 shadow-sm ${tipo === "mes" ? "lg:col-span-2" : ""}`}>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                    <breakdown.icon className="w-4 h-4" /> {breakdown.titulo}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-4">
                  {breakdown.data.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-12">Sem dados para esta quebra</p>
                  ) : (
                    <div style={{ width: "100%", height: Math.max(220, breakdown.data.length * 46 + 24) }}>
                      <ResponsiveContainer>
                        <BarChart data={breakdown.data} layout="vertical" margin={{ top: 4, right: 78, left: 8, bottom: 0 }} barCategoryGap="22%">
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                          <XAxis type="number" tickFormatter={BRLk} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={150}
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            tickFormatter={(v: string) => (v && v.length > 22 ? v.slice(0, 21) + "…" : v)}
                            axisLine={false}
                            tickLine={false}
                          />
                          <RechTooltip content={<DetTooltip totalRef={kpis.total} />} cursor={{ fill: "#f8fafc" }} />
                          <Bar dataKey="value" name="Custo" fill="#06b6d4" radius={[0, 4, 4, 0]} maxBarSize={26}>
                            <LabelList dataKey="value" position="right" formatter={BRLk} style={{ fontSize: 10, fill: "#475569" }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Tabela detalhada */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                  <ListChecks className="w-4 h-4" /> Lançamentos detalhados
                  <span className="text-xs font-normal text-gray-400">({lancamentos.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-5 pb-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[820px]">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-100">
                        <th className="text-left font-medium py-2 pr-2">Descrição</th>
                        <th className="text-left font-medium py-2 px-2">Fornecedor</th>
                        <th className="text-left font-medium py-2 px-2">Categoria</th>
                        <th className="text-left font-medium py-2 px-2">Centro de Custo</th>
                        <th className="text-left font-medium py-2 px-2">Competência</th>
                        <th className="text-left font-medium py-2 px-2">Vencimento</th>
                        <th className="text-center font-medium py-2 px-2">Status</th>
                        <th className="text-right font-medium py-2 pl-2">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lancamentos.map((r, i) => {
                        const st = statusTheme(r);
                        return (
                          <tr key={r.id ?? i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 pr-2 text-gray-700 max-w-[240px] truncate" title={r.descricao || r.origemDescricao || ""}>
                              {r.descricao || r.origemDescricao || "—"}
                            </td>
                            <td className="py-2 px-2 text-gray-600 max-w-[160px] truncate" title={r.fornecedorNome || ""}>{r.fornecedorNome || "—"}</td>
                            <td className="py-2 px-2 text-gray-600 max-w-[160px] truncate" title={r.contaNome || ""}>{r.contaNome || "Sem categoria"}</td>
                            <td className="py-2 px-2 text-gray-600 max-w-[160px] truncate" title={r.obraNome || ""}>{r.obraNome || "Sem centro de custo"}</td>
                            <td className="py-2 px-2 text-gray-500 tabular-nums whitespace-nowrap">{fmtData(r.dataCompetencia)}</td>
                            <td className="py-2 px-2 text-gray-500 tabular-nums whitespace-nowrap">{fmtData(r.dataVencimento)}</td>
                            <td className="py-2 px-2 text-center">
                              <span className={`inline-block text-[10px] font-semibold rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                            </td>
                            <td className="py-2 pl-2 text-right tabular-nums font-semibold text-gray-800 whitespace-nowrap">{formatBRL(valorEfetivo(r))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200">
                        <td colSpan={7} className="py-2.5 pr-2 text-right font-semibold text-gray-600">Total do recorte</td>
                        <td className="py-2.5 pl-2 text-right tabular-nums font-bold text-rose-600 whitespace-nowrap">{formatBRL(kpis.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
