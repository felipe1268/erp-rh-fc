// ============================================================================
// Rev. 2324 — Dashboard consolidada Almoxarifado + Equipamentos.
// Tabs separadas pra análise: Visão Geral, Estoque, Movimentações,
// Ferramentas Terceiros, Equipamentos Próprios, Equipamentos Locados.
// 100% client-side — agrega dados dos endpoints existentes (sem novo server).
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import {
  Warehouse, Package, ArrowLeftRight, AlertTriangle, Truck, HardHat,
  DollarSign, Activity, Clock, Wrench, ArrowLeft, MapPin, Building2,
  TrendingUp, TrendingDown, ShieldAlert, CheckCircle2, Layers, Tag,
  CalendarRange, ArrowUp, ArrowDown, Minus,
} from "lucide-react";

const fmtBRL = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: number) => (v || 0).toLocaleString("pt-BR");
const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

// Last N days bucket key (YYYY-MM-DD)
function bucketDayKey(d: Date | string) {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toISOString().slice(0, 10);
}

// YYYY-MM bucket key
function monthKey(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  if (isNaN(x.getTime())) return null;
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Rev. 2332 — Labels capitalizados + ano completo ("Jan 2026" no lugar de "jan/26")
const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_PT_CAP = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function lastNMonths(n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ key: k, label: `${MESES_PT_CAP[d.getUTCMonth()]} ${d.getUTCFullYear()}` });
  }
  return out;
}
// Rev. 2330 — Ano fechado (jan→dez do ano escolhido)
function monthsOfYear(year: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let m = 0; m < 12; m++) {
    const k = `${year}-${String(m + 1).padStart(2, "0")}`;
    out.push({ key: k, label: `${MESES_PT_CAP[m]} ${year}` });
  }
  return out;
}

// Rev. 2332 — DeltaCell: valor + seta direcional vs mês anterior (% ou abs).
// Direcional puro: ▲ verde se subiu, ▼ vermelho se desceu, ─ cinza se igual/sem prev.
function DeltaCell({ value, prev, money, accent }: { value: number; prev: number | undefined; money?: boolean; accent?: string }) {
  const v = money ? (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : (value || 0).toLocaleString("pt-BR");
  const hasPrev = prev !== undefined;
  const diff = hasPrev ? (value || 0) - (prev || 0) : 0;
  const pct = hasPrev && prev! !== 0 ? (diff / Math.abs(prev!)) * 100 : null;
  const tone = !hasPrev || diff === 0
    ? "text-slate-400 bg-slate-50 ring-slate-200/60"
    : diff > 0
      ? "text-emerald-700 bg-emerald-50 ring-emerald-200/60"
      : "text-red-700 bg-red-50 ring-red-200/60";
  const Arrow = !hasPrev || diff === 0 ? Minus : diff > 0 ? ArrowUp : ArrowDown;
  const badgeText = !hasPrev
    ? "—"
    : diff === 0
      ? "0"
      : pct !== null && Math.abs(pct) < 999
        ? `${diff > 0 ? "+" : ""}${pct.toFixed(0)}%`
        : `${diff > 0 ? "+" : ""}${(diff || 0).toLocaleString("pt-BR")}`;
  return (
    <div className="flex items-center justify-end gap-2">
      <span className={accent || "text-slate-800"}>{v}</span>
      <span
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ring-1 text-[10px] font-semibold tabular-nums ${tone}`}
        title={hasPrev ? `Mês anterior: ${money ? (prev || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : (prev || 0).toLocaleString("pt-BR")}` : "Sem mês anterior na série"}
      >
        <Arrow className="h-2.5 w-2.5" strokeWidth={2.5} />
        {badgeText}
      </span>
    </div>
  );
}

const TABS_VALIDOS = new Set(["visao", "estoque", "movs", "ferramentas", "proprios", "locados"]);

export default function DashAlmoxarifadoEquipamentos() {
  const { selectedCompany } = useCompany();
  const companyId = Number(selectedCompany?.id) || 0;
  const enabled = !!companyId;

  // Rev. 2327 — Aba controlada pela querystring (?tab=X) com 3 fontes:
  //   (a) leitura inicial de window.location.search OU sessionStorage._navParams
  //       (usado pela sidebar do DashboardLayout pra deep-link, ver L1790-1808);
  //   (b) listener do evento 'navParamsUpdated' (clique de outro item da
  //       sidebar enquanto a página já está montada — mesmo pattern de
  //       Epis.tsx / ProgramasSST.tsx / PlanejamentoDetalhe.tsx);
  //   (c) clique nas próprias <Tabs>: setTab atualiza state + sessionStorage
  //       + dispara 'navParamsUpdated' pra sincronizar o destaque dourado
  //       da sidebar. Não usamos setLocation com query porque o useLocation
  //       do wouter v3 só observa pathname — re-render por mudança de query
  //       não acontece, e isso quebraria o sync.
  const readInitial = (): string => {
    if (typeof window === "undefined") return "visao";
    const qs = new URLSearchParams(window.location.search).get("tab");
    if (qs && TABS_VALIDOS.has(qs)) return qs;
    const stored = sessionStorage.getItem("_navParams");
    if (stored) {
      const t = new URLSearchParams(stored).get("tab");
      if (t && TABS_VALIDOS.has(t)) return t;
    }
    return "visao";
  };
  const [tabAtual, setTabAtual] = useState<string>(() => readInitial());
  const setTab = (v: string) => {
    const safe = TABS_VALIDOS.has(v) ? v : "visao";
    setTabAtual(safe);
    try {
      // URL = fonte de verdade pra deep-link / back-forward.
      // replaceState evita inflar o histórico a cada clique de aba.
      const url = `${window.location.pathname}?tab=${safe}${window.location.hash || ""}`;
      window.history.replaceState(null, "", url);
      sessionStorage.setItem("_navParams", `tab=${safe}`);
      window.dispatchEvent(new Event("navParamsUpdated"));
    } catch {}
  };
  useEffect(() => {
    const handler = () => {
      const raw = sessionStorage.getItem("_navParams");
      if (!raw) return;
      const t = new URLSearchParams(raw).get("tab");
      if (t && TABS_VALIDOS.has(t)) setTabAtual(t);
      // Não removemos aqui pra não atropelar o listener do DashboardLayout
      // (que também lê _navParams pra atualizar sidebarActiveParam).
    };
    window.addEventListener("navParamsUpdated", handler);
    // Sync inicial: garante que a sidebar destaque o item correto mesmo
    // quando a página entra sem ?tab= (ex.: refresh com _navParams ainda em
    // sessionStorage de uma navegação anterior) ou quando o tab inicial veio
    // só do sessionStorage. Sem isso, fica "aba X visível, nenhum item
    // dourado na sidebar".
    try {
      if (!sessionStorage.getItem("_navParams")) {
        sessionStorage.setItem("_navParams", `tab=${tabAtual}`);
      }
      if (!new URLSearchParams(window.location.search).get("tab")) {
        const url = `${window.location.pathname}?tab=${tabAtual}${window.location.hash || ""}`;
        window.history.replaceState(null, "", url);
      }
      window.dispatchEvent(new Event("navParamsUpdated"));
    } catch {}
    // Back/forward do navegador → re-leitura da URL.
    const onPop = () => {
      const qs = new URLSearchParams(window.location.search).get("tab");
      if (qs && TABS_VALIDOS.has(qs)) setTabAtual(qs);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("navParamsUpdated", handler);
      window.removeEventListener("popstate", onPop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Queries (todas em paralelo via react-query) ────────────────────────────
  const itensQ      = trpc.compras.listarItens.useQuery({ companyId, incluirAplicacaoDireta: true }, { enabled });
  const movsQ       = trpc.warehouse.listMovements.useQuery({ companyId, limit: 2000 }, { enabled });
  const loansOpenQ  = trpc.warehouse.listOpenLoans.useQuery({ companyId }, { enabled });
  const insumosQ    = trpc.warehouse.listInsumos.useQuery({ companyId, limit: 200 }, { enabled });
  const transfQ     = trpc.warehouse.listTransferencias.useQuery({ companyId, limit: 200 }, { enabled });
  const propriosQ   = trpc.equipamentos.propriosListar.useQuery({ companyId }, { enabled });
  const locadosQ    = trpc.equipamentos.locadosListar.useQuery({ companyId }, { enabled });
  const vencendoQ   = trpc.equipamentos.locadosListar.useQuery({ companyId, vencendoEmDias: 30 }, { enabled });
  const obrasQ      = trpc.obras.listActive.useQuery({ companyId }, { enabled });
  const ferramentasQ = trpc.ferramentasTerceiros.listarRegistros.useQuery({ companyId, limit: 200 }, { enabled });

  const obrasMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of ((obrasQ.data || []) as any[])) m.set(Number(o.id), String(o.nome || `Obra #${o.id}`));
    return m;
  }, [obrasQ.data]);

  // ── Agregados Estoque ──────────────────────────────────────────────────────
  const stockAgg = useMemo(() => {
    const itens = (itensQ.data || []) as any[];
    const total = itens.length;
    let unidadesEstoque = 0, valorTotal = 0, abaixoMin = 0, semEstoque = 0;
    const porCategoria = new Map<string, { qtd: number; valor: number }>();
    for (const it of itens) {
      const saldo = Number(it.saldoAtual ?? it.quantidade ?? 0);
      const preco = Number(it.precoMedio ?? it.precoUnitario ?? 0);
      unidadesEstoque += saldo;
      valorTotal += saldo * preco;
      const min = Number(it.estoqueMinimo ?? 0);
      if (saldo <= 0) semEstoque += 1;
      else if (min > 0 && saldo < min) abaixoMin += 1;
      const cat = String(it.categoria || "— sem categoria —");
      const cur = porCategoria.get(cat) || { qtd: 0, valor: 0 };
      cur.qtd += 1; cur.valor += saldo * preco;
      porCategoria.set(cat, cur);
    }
    const cats = Array.from(porCategoria.entries())
      .map(([k, v]) => ({ categoria: k, qtd: v.qtd, valor: v.valor }))
      .sort((a, b) => b.valor - a.valor);
    return { total, unidadesEstoque, valorTotal, abaixoMin, semEstoque, cats };
  }, [itensQ.data]);

  // ── Agregados Movimentações (últimos 30 dias) ──────────────────────────────
  const movAgg = useMemo(() => {
    const movs = ((movsQ.data || []) as any[]).filter(m => !m.estornadaEm);
    const limite = new Date(); limite.setDate(limite.getDate() - 29);
    const limiteKey = bucketDayKey(limite);
    const last30 = movs.filter(m => bucketDayKey(m.criadoEm) >= limiteKey);

    const porTipo = new Map<string, number>();
    const porDia: Record<string, { entradas: number; saidas: number }> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - (29 - i));
      porDia[bucketDayKey(d)] = { entradas: 0, saidas: 0 };
    }
    let totalEntradas = 0, totalSaidas = 0;
    for (const m of last30) {
      porTipo.set(m.tipo, (porTipo.get(m.tipo) || 0) + 1);
      const k = bucketDayKey(m.criadoEm);
      if (!porDia[k]) porDia[k] = { entradas: 0, saidas: 0 };
      const qtd = Math.abs(Number(m.quantidade || 0));
      const isEntrada = String(m.tipo || "").toLowerCase().includes("entrada");
      if (isEntrada) { porDia[k].entradas += qtd; totalEntradas += qtd; }
      else { porDia[k].saidas += qtd; totalSaidas += qtd; }
    }
    return {
      totalMovs: last30.length,
      totalEntradas, totalSaidas,
      porTipo: Array.from(porTipo.entries()).map(([t, c]) => ({ tipo: t, count: c })).sort((a, b) => b.count - a.count),
      porDia,
    };
  }, [movsQ.data]);

  // ── Equipamentos Próprios ──────────────────────────────────────────────────
  const proprAgg = useMemo(() => {
    const list = (propriosQ.data || []) as any[];
    const total = list.length;
    const porStatus = new Map<string, number>();
    let valorAtivos = 0;
    for (const p of list) {
      const s = String(p.status || "indefinido");
      porStatus.set(s, (porStatus.get(s) || 0) + 1);
      valorAtivos += Number(p.valorAquisicao || 0);
    }
    return { total, valorAtivos, porStatus: Array.from(porStatus.entries()) };
  }, [propriosQ.data]);

  // ── Equipamentos Locados ───────────────────────────────────────────────────
  const locAgg = useMemo(() => {
    const list = (locadosQ.data || []) as any[];
    const ativos = list.filter(l => l.status === "em_uso");
    const devolvidos = list.filter(l => l.status === "devolvido");
    const atrasados = list.filter(l => l.status === "atrasado");
    const vencendo = (vencendoQ.data || []) as any[];
    const custoMes = ativos.reduce((acc, l) => acc + Number(l.valorMensal || 0), 0);
    const porFornecedor = new Map<string, { qtd: number; custo: number }>();
    const porObra = new Map<string, { qtd: number; custo: number }>();
    const semObra = ativos.filter(l => !l.obraId).length;
    for (const l of ativos) {
      const f = String(l.fornecedorNome || "— sem fornecedor —");
      const cur = porFornecedor.get(f) || { qtd: 0, custo: 0 };
      cur.qtd += 1; cur.custo += Number(l.valorMensal || 0);
      porFornecedor.set(f, cur);
      const oNome = l.obraId ? (obrasMap.get(Number(l.obraId)) || `Obra #${l.obraId}`) : "— sem obra —";
      const co = porObra.get(oNome) || { qtd: 0, custo: 0 };
      co.qtd += 1; co.custo += Number(l.valorMensal || 0);
      porObra.set(oNome, co);
    }
    return {
      total: list.length,
      ativos: ativos.length, devolvidos: devolvidos.length, atrasados: atrasados.length,
      vencendo30: vencendo.length, custoMes, semObra,
      porFornecedor: Array.from(porFornecedor.entries()).map(([n, v]) => ({ nome: n, ...v })).sort((a, b) => b.custo - a.custo),
      porObra: Array.from(porObra.entries()).map(([n, v]) => ({ nome: n, ...v })).sort((a, b) => b.custo - a.custo),
      vencendo,
    };
  }, [locadosQ.data, vencendoQ.data, obrasMap]);

  // ── Rev. 2327/2330 — Comparativo mês a mês ────────────────────────────────
  // Rev. 2330: filtro de período compartilhado por todas as 6 tabs.
  // '12m' = últimos 12 meses corridos; número = ano fechado (jan→dez).
  // Anos disponíveis = união dos anos com dado em qualquer fonte + ano atual.
  const [periodoMeses, setPeriodoMeses] = useState<"12m" | number>("12m");
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>();
    const yearOf = (d: any) => { const k = monthKey(d); return k ? Number(k.slice(0, 4)) : null; };
    const push = (y: number | null) => { if (y && y >= 2000 && y <= 2100) anos.add(y); };
    for (const m of ((movsQ.data || []) as any[])) push(yearOf(m.criadoEm));
    for (const p of ((propriosQ.data || []) as any[])) push(yearOf(p.dataAquisicao || p.criadoEm));
    for (const l of ((locadosQ.data || []) as any[])) { push(yearOf(l.dataInicio || l.criadoEm)); push(yearOf(l.dataDevolucao)); }
    for (const f of ((ferramentasQ.data || []) as any[])) push(yearOf(f.data_hora || f.dataHora || f.criado_em || f.criadoEm));
    for (const it of ((itensQ.data || []) as any[])) push(yearOf(it.criadoEm || it.createdAt));
    anos.add(new Date().getUTCFullYear());
    return Array.from(anos).sort((a, b) => b - a);
  }, [movsQ.data, propriosQ.data, locadosQ.data, ferramentasQ.data, itensQ.data]);
  const periodoLabel = periodoMeses === "12m" ? "últimos 12 meses" : `ano ${periodoMeses}`;

  const monthlyAgg = useMemo(() => {
    const months = periodoMeses === "12m" ? lastNMonths(12) : monthsOfYear(periodoMeses);
    const empty = () => months.reduce((acc, m) => { acc[m.key] = 0; return acc; }, {} as Record<string, number>);

    const movsEntradas = empty();
    const movsSaidas = empty();
    const movsCount = empty();
    const propriosNovos = empty();
    const propriosValor = empty();
    const locadosIniciados = empty();
    const locadosDevolvidos = empty();
    const locadosCustoIniciado = empty();
    const ferramentasReg = empty();
    const itensCadastrados = empty();

    for (const m of ((movsQ.data || []) as any[])) {
      if (m.estornadaEm) continue;
      const k = monthKey(m.criadoEm);
      if (!k || !(k in movsCount)) continue;
      const qtd = Math.abs(Number(m.quantidade || 0));
      const isEntrada = String(m.tipo || "").toLowerCase().includes("entrada");
      movsCount[k] += 1;
      if (isEntrada) movsEntradas[k] += qtd;
      else movsSaidas[k] += qtd;
    }
    for (const p of ((propriosQ.data || []) as any[])) {
      const k = monthKey(p.dataAquisicao || p.criadoEm);
      if (!k || !(k in propriosNovos)) continue;
      propriosNovos[k] += 1;
      propriosValor[k] += Number(p.valorAquisicao || 0);
    }
    for (const l of ((locadosQ.data || []) as any[])) {
      const ki = monthKey(l.dataInicio || l.criadoEm);
      if (ki && ki in locadosIniciados) {
        locadosIniciados[ki] += 1;
        locadosCustoIniciado[ki] += Number(l.valorMensal || 0);
      }
      const kd = monthKey(l.dataDevolucao);
      if (kd && kd in locadosDevolvidos) locadosDevolvidos[kd] += 1;
    }
    for (const f of ((ferramentasQ.data || []) as any[])) {
      const k = monthKey(f.data_hora || f.dataHora || f.criado_em || f.criadoEm);
      if (k && k in ferramentasReg) ferramentasReg[k] += 1;
    }
    for (const it of ((itensQ.data || []) as any[])) {
      const k = monthKey(it.criadoEm || it.createdAt);
      if (k && k in itensCadastrados) itensCadastrados[k] += 1;
    }

    return {
      months,
      movsEntradas, movsSaidas, movsCount,
      propriosNovos, propriosValor,
      locadosIniciados, locadosDevolvidos, locadosCustoIniciado,
      ferramentasReg, itensCadastrados,
    };
  }, [periodoMeses, movsQ.data, propriosQ.data, locadosQ.data, ferramentasQ.data, itensQ.data]);

  // Rev. 2330/2331 — Header padrão pras 6 tabelas mês a mês.
  // Rev. 2331: design refeito — chip de ícone, título + sub-título do período,
  // e selector como SEGMENTED PILL (mais moderno + 1 clique = troca, sem dropdown).
  // Selector global afeta TODAS as tabs (state único `periodoMeses`).
  const periodoOpcoes: Array<{ valor: "12m" | number; rotulo: string }> = [
    { valor: "12m", rotulo: "12M" },
    ...anosDisponiveis.map(y => ({ valor: y, rotulo: String(y) })),
  ];
  const MesesHeader = ({ titulo }: { titulo: string }) => (
    <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-white flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/60 ring-1 ring-emerald-200/60 flex items-center justify-center">
          <CalendarRange className="h-4.5 w-4.5 text-emerald-700" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 text-[15px] leading-tight truncate">{titulo}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">{periodoLabel}</div>
        </div>
      </div>
      <div
        className="inline-flex items-center gap-0.5 p-1 rounded-full bg-slate-100/80 ring-1 ring-slate-200/70 max-w-full overflow-x-auto scrollbar-thin"
        role="tablist"
        aria-label="Período"
      >
        {periodoOpcoes.map(opt => {
          const ativo = String(opt.valor) === String(periodoMeses);
          return (
            <button
              key={String(opt.valor)}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => setPeriodoMeses(opt.valor)}
              className={[
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 whitespace-nowrap",
                ativo
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-500 hover:text-slate-800 hover:bg-white/60",
              ].join(" ")}
            >
              {opt.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Ferramentas terceiros ──────────────────────────────────────────────────
  const ferrAgg = useMemo(() => {
    const list = (ferramentasQ.data || []) as any[];
    return { total: list.length, items: list.slice(0, 30) };
  }, [ferramentasQ.data]);

  // ── Empréstimos / Insumos / Transferências ─────────────────────────────────
  const opsAgg = useMemo(() => ({
    loansAbertos: ((loansOpenQ.data || []) as any[]).length,
    insumos: ((insumosQ.data || []) as any[]).length,
    transferencias: ((transfQ.data || []) as any[]).length,
  }), [loansOpenQ.data, insumosQ.data, transfQ.data]);

  const carregando = itensQ.isLoading || propriosQ.isLoading || locadosQ.isLoading;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <Link href="/dashboards">
              <a className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"><ArrowLeft className="h-3 w-3" /> Voltar aos Dashboards</a>
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mt-1">
              <Warehouse className="h-6 w-6 text-emerald-600" /> Dashboard Almoxarifado &amp; Equipamentos
            </h1>
            <p className="text-sm text-slate-600 mt-1">Análise consolidada de estoque, movimentações, equipamentos próprios/locados e ferramentas de terceiros — em abas separadas.</p>
          </div>
          {carregando && <div className="text-xs text-slate-500">Carregando dados…</div>}
        </div>

        <Tabs value={tabAtual} onValueChange={setTab} className="w-full">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="visao"><Activity className="h-4 w-4 mr-1.5" />Visão Geral</TabsTrigger>
            <TabsTrigger value="estoque"><Package className="h-4 w-4 mr-1.5" />Estoque</TabsTrigger>
            <TabsTrigger value="movs"><ArrowLeftRight className="h-4 w-4 mr-1.5" />Movimentações</TabsTrigger>
            <TabsTrigger value="ferramentas"><Wrench className="h-4 w-4 mr-1.5" />Ferramentas Terceiros</TabsTrigger>
            <TabsTrigger value="proprios"><HardHat className="h-4 w-4 mr-1.5" />Equip. Próprios</TabsTrigger>
            <TabsTrigger value="locados"><Truck className="h-4 w-4 mr-1.5" />Equip. Locados</TabsTrigger>
          </TabsList>

          {/* ─────────── VISÃO GERAL ─────────── */}
          <TabsContent value="visao" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <DashKpi label="Itens cadastrados" value={fmtNum(stockAgg.total)} icon={Package} color="blue" />
              <DashKpi label="Valor do estoque" value={fmtBRL(stockAgg.valorTotal)} icon={DollarSign} color="teal" />
              <DashKpi label="Equip. próprios" value={fmtNum(proprAgg.total)} icon={HardHat} color="indigo" />
              <DashKpi label="Locados ativos" value={fmtNum(locAgg.ativos)} icon={Truck} color="green" sub={fmtBRL(locAgg.custoMes) + "/mês"} />

              <DashKpi label="Abaixo do mínimo" value={fmtNum(stockAgg.abaixoMin)} icon={AlertTriangle} color="amber" />
              <DashKpi label="Sem estoque" value={fmtNum(stockAgg.semEstoque)} icon={ShieldAlert} color="red" />
              <DashKpi label="Locações vencendo (30d)" value={fmtNum(locAgg.vencendo30)} icon={Clock} color="amber" />
              <DashKpi label="Locados em atraso" value={fmtNum(locAgg.atrasados)} icon={AlertTriangle} color="red" />

              <DashKpi label="Empréstimos abertos" value={fmtNum(opsAgg.loansAbertos)} icon={ArrowLeftRight} color="purple" />
              <DashKpi label="Insumos (saídas)" value={fmtNum(opsAgg.insumos)} icon={ArrowLeftRight} color="orange" />
              <DashKpi label="Transferências" value={fmtNum(opsAgg.transferencias)} icon={ArrowLeftRight} color="blue" />
              <DashKpi label="Ferramentas terceiros" value={fmtNum(ferrAgg.total)} icon={Wrench} color="indigo" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DashChart
                title="Movimentações por dia (últimos 30 dias)"
                type="line"
                labels={Object.keys(movAgg.porDia).map(k => k.slice(5))}
                datasets={[
                  { label: "Entradas", data: Object.values(movAgg.porDia).map(d => d.entradas), borderColor: "#10B981", backgroundColor: "rgba(16,185,129,0.15)", fill: true, tension: 0.3 },
                  { label: "Saídas",   data: Object.values(movAgg.porDia).map(d => d.saidas),   borderColor: "#DC2626", backgroundColor: "rgba(220,38,38,0.15)", fill: true, tension: 0.3 },
                ]}
              />
              <DashChart
                title="Custo mensal de locação por obra"
                type="doughnut"
                labels={locAgg.porObra.slice(0, 8).map(o => o.nome)}
                datasets={[{ data: locAgg.porObra.slice(0, 8).map(o => Math.round(o.custo)) }]}
                valueFormatter={fmtBRL}
              />
            </div>

            {/* Rev. 2327 — Comparativo mês a mês consolidado */}
            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <MesesHeader titulo="Comparativo mês a mês" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-2.5">Mês</th>
                      <th className="text-right p-2.5">Movs</th>
                      <th className="text-right p-2.5 text-emerald-700">Entradas (qtd)</th>
                      <th className="text-right p-2.5 text-red-700">Saídas (qtd)</th>
                      <th className="text-right p-2.5">Locados iniciados</th>
                      <th className="text-right p-2.5">Próprios adquiridos</th>
                      <th className="text-right p-2.5">Ferramentas terc.</th>
                      <th className="text-right p-2.5">Itens cadastrados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyAgg.months.map((m, i, arr) => {
                      const pk = arr[i - 1]?.key;
                      const p = (f: Record<string, number>) => (pk !== undefined ? f[pk] : undefined);
                      return (
                        <tr key={m.key} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">{m.label}</td>
                          <td className="p-2.5"><DeltaCell value={monthlyAgg.movsCount[m.key]} prev={p(monthlyAgg.movsCount)} /></td>
                          <td className="p-2.5"><DeltaCell value={monthlyAgg.movsEntradas[m.key]} prev={p(monthlyAgg.movsEntradas)} accent="text-emerald-700" /></td>
                          <td className="p-2.5"><DeltaCell value={monthlyAgg.movsSaidas[m.key]} prev={p(monthlyAgg.movsSaidas)} accent="text-red-700" /></td>
                          <td className="p-2.5"><DeltaCell value={monthlyAgg.locadosIniciados[m.key]} prev={p(monthlyAgg.locadosIniciados)} /></td>
                          <td className="p-2.5"><DeltaCell value={monthlyAgg.propriosNovos[m.key]} prev={p(monthlyAgg.propriosNovos)} /></td>
                          <td className="p-2.5"><DeltaCell value={monthlyAgg.ferramentasReg[m.key]} prev={p(monthlyAgg.ferramentasReg)} /></td>
                          <td className="p-2.5"><DeltaCell value={monthlyAgg.itensCadastrados[m.key]} prev={p(monthlyAgg.itensCadastrados)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ─────────── ESTOQUE ─────────── */}
          <TabsContent value="estoque" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <DashKpi label="Itens cadastrados" value={fmtNum(stockAgg.total)} icon={Package} color="blue" />
              <DashKpi label="Unidades em estoque" value={fmtNum(stockAgg.unidadesEstoque)} icon={Layers} color="teal" />
              <DashKpi label="Valor total" value={fmtBRL(stockAgg.valorTotal)} icon={DollarSign} color="green" />
              <DashKpi label="Categorias" value={fmtNum(stockAgg.cats.length)} icon={Tag} color="purple" />
              <DashKpi label="Abaixo do mínimo" value={fmtNum(stockAgg.abaixoMin)} icon={AlertTriangle} color="amber" sub="reposição necessária" />
              <DashKpi label="Sem estoque" value={fmtNum(stockAgg.semEstoque)} icon={ShieldAlert} color="red" />
              <DashKpi label="Saudáveis" value={fmtNum(Math.max(0, stockAgg.total - stockAgg.abaixoMin - stockAgg.semEstoque))} icon={CheckCircle2} color="green" />
              <DashKpi label="Cobertura mensal (R$)" value={fmtBRL(stockAgg.valorTotal)} icon={TrendingUp} color="blue" sub="valor parado" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DashChart
                title="Valor do estoque por categoria (top 10)"
                type="horizontalBar"
                labels={stockAgg.cats.slice(0, 10).map(c => c.categoria)}
                datasets={[{ label: "R$", data: stockAgg.cats.slice(0, 10).map(c => Math.round(c.valor)) }]}
                valueFormatter={fmtBRL}
              />
              <DashChart
                title="Itens por categoria (top 10)"
                type="doughnut"
                labels={stockAgg.cats.slice(0, 10).map(c => c.categoria)}
                datasets={[{ data: stockAgg.cats.slice(0, 10).map(c => c.qtd) }]}
              />
            </div>

            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 flex items-center gap-2">
                <Tag className="h-4 w-4 text-slate-500" /> Categorias — detalhe
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                    <tr><th className="text-left p-2.5">Categoria</th><th className="text-right p-2.5">Itens</th><th className="text-right p-2.5">Valor parado</th></tr>
                  </thead>
                  <tbody>
                    {stockAgg.cats.slice(0, 20).map(c => (
                      <tr key={c.categoria} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="p-2.5 text-slate-800">{c.categoria}</td>
                        <td className="p-2.5 text-right">{fmtNum(c.qtd)}</td>
                        <td className="p-2.5 text-right font-medium">{fmtBRL(c.valor)}</td>
                      </tr>
                    ))}
                    {stockAgg.cats.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-slate-500">Sem dados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Rev. 2327 — Itens cadastrados mês a mês */}
            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <MesesHeader titulo="Itens cadastrados mês a mês" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-2.5">Mês</th>
                      <th className="text-right p-2.5">Novos itens</th>
                      <th className="text-right p-2.5">Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let acc = 0;
                      let prevN: number | undefined;
                      let prevAcc: number | undefined;
                      return monthlyAgg.months.map(m => {
                        const n = monthlyAgg.itensCadastrados[m.key];
                        acc += n;
                        const row = (
                          <tr key={m.key} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">{m.label}</td>
                            <td className="p-2.5"><DeltaCell value={n} prev={prevN} /></td>
                            <td className="p-2.5"><DeltaCell value={acc} prev={prevAcc} accent="text-slate-600" /></td>
                          </tr>
                        );
                        prevN = n;
                        prevAcc = acc;
                        return row;
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ─────────── MOVIMENTAÇÕES ─────────── */}
          <TabsContent value="movs" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <DashKpi label="Movimentações (30d)" value={fmtNum(movAgg.totalMovs)} icon={ArrowLeftRight} color="blue" />
              <DashKpi label="Entradas (qtd)" value={fmtNum(movAgg.totalEntradas)} icon={TrendingUp} color="green" />
              <DashKpi label="Saídas (qtd)" value={fmtNum(movAgg.totalSaidas)} icon={TrendingDown} color="red" />
              <DashKpi label="Saldo (qtd)" value={fmtNum(movAgg.totalEntradas - movAgg.totalSaidas)} icon={Activity} color={movAgg.totalEntradas >= movAgg.totalSaidas ? "green" : "red"} />
            </div>

            <DashChart
              title="Entradas vs Saídas por dia (últimos 30 dias)"
              type="bar"
              labels={Object.keys(movAgg.porDia).map(k => k.slice(5))}
              datasets={[
                { label: "Entradas", data: Object.values(movAgg.porDia).map(d => d.entradas), backgroundColor: "#10B981" },
                { label: "Saídas",   data: Object.values(movAgg.porDia).map(d => d.saidas),   backgroundColor: "#DC2626" },
              ]}
              height={320}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DashChart
                title="Movimentações por tipo (30d)"
                type="doughnut"
                labels={movAgg.porTipo.map(t => t.tipo)}
                datasets={[{ data: movAgg.porTipo.map(t => t.count) }]}
              />
              <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">Últimas 15 movimentações</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                      <tr><th className="text-left p-2">Data</th><th className="text-left p-2">Tipo</th><th className="text-left p-2">Item</th><th className="text-right p-2">Qtd</th></tr>
                    </thead>
                    <tbody>
                      {((movsQ.data || []) as any[]).slice(0, 15).map((m: any) => (
                        <tr key={m.id} className="border-t border-slate-100">
                          <td className="p-2 text-slate-600 whitespace-nowrap">{fmtDate(m.criadoEm)}</td>
                          <td className="p-2"><span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">{m.tipo}</span></td>
                          <td className="p-2 text-slate-800 truncate max-w-[200px]" title={m.itemNome}>{m.itemNome || "—"}</td>
                          <td className="p-2 text-right font-medium">{fmtNum(Math.abs(Number(m.quantidade || 0)))}</td>
                        </tr>
                      ))}
                      {((movsQ.data || []) as any[]).length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-500">Sem movimentações.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Rev. 2327 — Entradas vs Saídas mês a mês */}
            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <MesesHeader titulo="Movimentações mês a mês" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-2.5">Mês</th>
                      <th className="text-right p-2.5">Movs (#)</th>
                      <th className="text-right p-2.5 text-emerald-700">Entradas (qtd)</th>
                      <th className="text-right p-2.5 text-red-700">Saídas (qtd)</th>
                      <th className="text-right p-2.5">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyAgg.months.map((m, i, arr) => {
                      const pk = arr[i - 1]?.key;
                      const ent = monthlyAgg.movsEntradas[m.key];
                      const sai = monthlyAgg.movsSaidas[m.key];
                      const saldo = ent - sai;
                      const prevEnt = pk ? monthlyAgg.movsEntradas[pk] : undefined;
                      const prevSai = pk ? monthlyAgg.movsSaidas[pk] : undefined;
                      const prevSaldo = pk ? (monthlyAgg.movsEntradas[pk] - monthlyAgg.movsSaidas[pk]) : undefined;
                      const prevCount = pk ? monthlyAgg.movsCount[pk] : undefined;
                      return (
                        <tr key={m.key} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">{m.label}</td>
                          <td className="p-2.5"><DeltaCell value={monthlyAgg.movsCount[m.key]} prev={prevCount} /></td>
                          <td className="p-2.5"><DeltaCell value={ent} prev={prevEnt} accent="text-emerald-700" /></td>
                          <td className="p-2.5"><DeltaCell value={sai} prev={prevSai} accent="text-red-700" /></td>
                          <td className="p-2.5"><DeltaCell value={saldo} prev={prevSaldo} accent={saldo >= 0 ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ─────────── FERRAMENTAS TERCEIROS ─────────── */}
          <TabsContent value="ferramentas" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <DashKpi label="Registros" value={fmtNum(ferrAgg.total)} icon={Wrench} color="indigo" />
              <DashKpi label="Empréstimos abertos" value={fmtNum(opsAgg.loansAbertos)} icon={ArrowLeftRight} color="purple" sub="pendentes de devolução" />
            </div>
            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">Ferramentas de terceiros — últimos 30 registros</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                    <tr><th className="text-left p-2">Data</th><th className="text-left p-2">Terceiro</th><th className="text-left p-2">Obra</th><th className="text-left p-2">Itens</th></tr>
                  </thead>
                  <tbody>
                    {ferrAgg.items.map((f: any) => (
                      <tr key={f.id} className="border-t border-slate-100">
                        <td className="p-2 text-slate-600 whitespace-nowrap">{fmtDate(f.data_hora || f.dataHora || f.criado_em || f.criadoEm)}</td>
                        <td className="p-2 text-slate-800">{f.empresa_terceira || f.empresaTerceira || f.responsavel_nome || "—"}</td>
                        <td className="p-2 text-slate-700">{f.obra_nome || (f.obra_id ? (obrasMap.get(Number(f.obra_id)) || `#${f.obra_id}`) : (f.obraId ? (obrasMap.get(Number(f.obraId)) || `#${f.obraId}`) : "—"))}</td>
                        <td className="p-2 text-right">{Number(f.qtd_itens ?? f.qtdItens ?? 0)}</td>
                      </tr>
                    ))}
                    {ferrAgg.items.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-500">Nenhum registro de ferramentas de terceiros.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Rev. 2327 — Registros de ferramentas mês a mês */}
            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <MesesHeader titulo="Registros mês a mês" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-2.5">Mês</th>
                      <th className="text-right p-2.5">Registros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyAgg.months.map((m, i, arr) => {
                      const pk = arr[i - 1]?.key;
                      return (
                        <tr key={m.key} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">{m.label}</td>
                          <td className="p-2.5"><DeltaCell value={monthlyAgg.ferramentasReg[m.key]} prev={pk ? monthlyAgg.ferramentasReg[pk] : undefined} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ─────────── EQUIP. PRÓPRIOS ─────────── */}
          <TabsContent value="proprios" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <DashKpi label="Total cadastrados" value={fmtNum(proprAgg.total)} icon={HardHat} color="indigo" />
              <DashKpi label="Valor em ativos" value={fmtBRL(proprAgg.valorAtivos)} icon={DollarSign} color="teal" sub="aquisição acumulada" />
              {proprAgg.porStatus.slice(0, 2).map(([st, ct]) => (
                <DashKpi key={st} label={`Status: ${st}`} value={fmtNum(ct)} icon={Activity} color="blue" />
              ))}
            </div>
            <DashChart
              title="Equipamentos próprios por status"
              type="doughnut"
              labels={proprAgg.porStatus.map(([s]) => s)}
              datasets={[{ data: proprAgg.porStatus.map(([, c]) => c) }]}
            />
            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 flex items-center justify-between">
                <span>Lista (20 mais recentes)</span>
                <Link href="/equipamentos/proprios"><a className="text-xs text-blue-600 hover:underline">Ver todos →</a></Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                    <tr><th className="text-left p-2">Descrição</th><th className="text-left p-2">Patrimônio</th><th className="text-left p-2">Status</th><th className="text-right p-2">Valor aquisição</th></tr>
                  </thead>
                  <tbody>
                    {((propriosQ.data || []) as any[]).slice(0, 20).map((p: any) => (
                      <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="p-2 text-slate-800">{p.descricao}</td>
                        <td className="p-2 text-slate-700">{p.codigoPatrimonio || p.codigoInterno || "—"}</td>
                        <td className="p-2"><span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">{p.status || "—"}</span></td>
                        <td className="p-2 text-right">{fmtBRL(Number(p.valorAquisicao || 0))}</td>
                      </tr>
                    ))}
                    {((propriosQ.data || []) as any[]).length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-500">Nenhum equipamento próprio cadastrado.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Rev. 2327 — Aquisições mês a mês */}
            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <MesesHeader titulo="Aquisições mês a mês" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-2.5">Mês</th>
                      <th className="text-right p-2.5">Equipamentos</th>
                      <th className="text-right p-2.5">Valor adquirido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyAgg.months.map((m, i, arr) => {
                      const pk = arr[i - 1]?.key;
                      return (
                        <tr key={m.key} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">{m.label}</td>
                          <td className="p-2.5"><DeltaCell value={monthlyAgg.propriosNovos[m.key]} prev={pk ? monthlyAgg.propriosNovos[pk] : undefined} /></td>
                          <td className="p-2.5"><DeltaCell value={monthlyAgg.propriosValor[m.key]} prev={pk ? monthlyAgg.propriosValor[pk] : undefined} money /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ─────────── EQUIP. LOCADOS ─────────── */}
          <TabsContent value="locados" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <DashKpi label="Ativos" value={fmtNum(locAgg.ativos)} icon={Activity} color="blue" />
              <DashKpi label="Custo / mês" value={fmtBRL(locAgg.custoMes)} icon={DollarSign} color="teal" />
              <DashKpi label="Vencendo (30d)" value={fmtNum(locAgg.vencendo30)} icon={Clock} color="amber" />
              <DashKpi label="Atrasados" value={fmtNum(locAgg.atrasados)} icon={AlertTriangle} color="red" />
              <DashKpi label="Devolvidos" value={fmtNum(locAgg.devolvidos)} icon={CheckCircle2} color="green" />
              <DashKpi label="Sem obra vinculada" value={fmtNum(locAgg.semObra)} icon={MapPin} color="amber" sub="vincule em lote" />
              <DashKpi label="Fornecedores" value={fmtNum(locAgg.porFornecedor.length)} icon={Building2} color="purple" />
              <DashKpi label="Obras atendidas" value={fmtNum(locAgg.porObra.filter(o => o.nome !== "— sem obra —").length)} icon={MapPin} color="indigo" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DashChart
                title="Custo mensal por fornecedor (top 10)"
                type="horizontalBar"
                labels={locAgg.porFornecedor.slice(0, 10).map(f => f.nome)}
                datasets={[{ label: "R$/mês", data: locAgg.porFornecedor.slice(0, 10).map(f => Math.round(f.custo)) }]}
                valueFormatter={fmtBRL}
              />
              <DashChart
                title="Custo mensal por obra"
                type="doughnut"
                labels={locAgg.porObra.slice(0, 10).map(o => o.nome)}
                datasets={[{ data: locAgg.porObra.slice(0, 10).map(o => Math.round(o.custo)) }]}
                valueFormatter={fmtBRL}
              />
            </div>

            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 flex items-center justify-between">
                <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-amber-600" /> Locações vencendo em até 30 dias</span>
                <Link href="/equipamentos/locados"><a className="text-xs text-blue-600 hover:underline">Abrir lista →</a></Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                    <tr><th className="text-left p-2">Equipamento</th><th className="text-left p-2">Fornecedor</th><th className="text-left p-2">Obra</th><th className="text-left p-2">Fim previsto</th><th className="text-right p-2">R$/mês</th></tr>
                  </thead>
                  <tbody>
                    {locAgg.vencendo.slice(0, 25).map((l: any) => (
                      <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="p-2 text-slate-800">{l.descricao}</td>
                        <td className="p-2 text-slate-700">{l.fornecedorNome || "—"}</td>
                        <td className="p-2 text-slate-700">{l.obraId ? (obrasMap.get(Number(l.obraId)) || `#${l.obraId}`) : "—"}</td>
                        <td className="p-2 text-amber-700 font-medium">{fmtDate(l.dataFimPrevista)}</td>
                        <td className="p-2 text-right">{fmtBRL(Number(l.valorMensal || 0))}</td>
                      </tr>
                    ))}
                    {locAgg.vencendo.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Nenhuma locação vencendo no período. 👌</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Rev. 2327 — Locações iniciadas vs devolvidas mês a mês */}
            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <MesesHeader titulo="Locações mês a mês" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-2.5">Mês</th>
                      <th className="text-right p-2.5 text-emerald-700">Iniciadas</th>
                      <th className="text-right p-2.5 text-red-700">Devolvidas</th>
                      <th className="text-right p-2.5">Saldo (#)</th>
                      <th className="text-right p-2.5">Custo mensal das iniciadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyAgg.months.map((m, i, arr) => {
                      const pk = arr[i - 1]?.key;
                      const ini = monthlyAgg.locadosIniciados[m.key];
                      const dev = monthlyAgg.locadosDevolvidos[m.key];
                      const saldo = ini - dev;
                      const prevIni = pk ? monthlyAgg.locadosIniciados[pk] : undefined;
                      const prevDev = pk ? monthlyAgg.locadosDevolvidos[pk] : undefined;
                      const prevSaldo = pk ? (monthlyAgg.locadosIniciados[pk] - monthlyAgg.locadosDevolvidos[pk]) : undefined;
                      const prevCusto = pk ? monthlyAgg.locadosCustoIniciado[pk] : undefined;
                      return (
                        <tr key={m.key} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">{m.label}</td>
                          <td className="p-2.5"><DeltaCell value={ini} prev={prevIni} accent="text-emerald-700" /></td>
                          <td className="p-2.5"><DeltaCell value={dev} prev={prevDev} accent="text-red-700" /></td>
                          <td className="p-2.5"><DeltaCell value={saldo} prev={prevSaldo} accent={saldo >= 0 ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"} /></td>
                          <td className="p-2.5"><DeltaCell value={monthlyAgg.locadosCustoIniciado[m.key]} prev={prevCusto} money /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
