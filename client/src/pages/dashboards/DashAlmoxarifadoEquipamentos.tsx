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
  CalendarRange, ArrowUp, ArrowDown, Minus, X, Search, Hash, Eye,
  Scale, ShoppingCart, Sparkles, Loader2, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

const fmtBRL = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: number) => (v || 0).toLocaleString("pt-BR");

// Rev. 3016 — tema visual por status p/ os badges da lista de equip. próprios
// (cores intuitivas em vez do cinza único).
function statusProprioTheme(status?: string | null): { label: string; cls: string } {
  const s = String(status || "").trim().toLowerCase();
  const map: Record<string, { label: string; cls: string }> = {
    em_obra:     { label: "Em obra",     cls: "bg-blue-100 text-blue-700 ring-1 ring-blue-200" },
    disponivel:  { label: "Disponível",  cls: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" },
    manutencao:  { label: "Manutenção",  cls: "bg-amber-100 text-amber-700 ring-1 ring-amber-200" },
    inativo:     { label: "Inativo",     cls: "bg-slate-200 text-slate-600 ring-1 ring-slate-300" },
    baixado:     { label: "Baixado",     cls: "bg-rose-100 text-rose-700 ring-1 ring-rose-200" },
  };
  return map[s] || { label: status ? String(status) : "—", cls: "bg-slate-100 text-slate-700 ring-1 ring-slate-200" };
}
const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
// Rev. 2360 — converte "YYYY-MM-DD" → "DD/MM" (padrão BR) pros eixos X dos charts.
const fmtDayBR = (iso: string) => {
  const [, mm, dd] = (iso || "").split("-");
  return dd && mm ? `${dd}/${mm}` : (iso || "");
};
const DIAS_SEMANA_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Rev. 2360 — DeltaSub: badge compacto de variação Δ% vs período anterior
// usado nos `sub` dos KPIs da aba Movs. Renderiza inline: "x,x/dia · ↑12% vs N".
function DeltaSub({ current, previous, mediaDia, unidade = "" }: { current: number; previous: number; mediaDia: number; unidade?: string }) {
  const diff = current - previous;
  const pct = previous > 0 ? (diff / previous) * 100 : (current > 0 ? 100 : 0);
  const hasPrev = previous > 0 || current > 0;
  const sym = !hasPrev || diff === 0 ? "─" : diff > 0 ? "↑" : "↓";
  const tone = !hasPrev || diff === 0 ? "text-slate-400" : diff > 0 ? "text-emerald-600" : "text-red-600";
  const pctTxt = !hasPrev ? "—" : Math.abs(pct) >= 999 ? `${diff > 0 ? "+" : ""}${(diff || 0).toLocaleString("pt-BR")}` : `${Math.abs(pct).toFixed(0)}%`;
  return (
    <>
      {mediaDia.toFixed(1)}/dia{unidade} ·{" "}
      <span className={`font-semibold ${tone}`}>{sym} {pctTxt}</span>{" "}
      <span className="text-slate-400">vs {(previous || 0).toLocaleString("pt-BR")}</span>
    </>
  );
}

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
      // Rev. 2448 — Fields corretos do schema `almoxarifado_itens`:
      // `quantidadeAtual` (não saldoAtual) e `valorUnitario` (não precoMedio).
      // Antes da fix tudo vinha como `undefined → 0`, e a coluna "Valor parado"
      // ficava R$ 0,00 pra todas as categorias, mesmo com itens de valor
      // cadastrado. Aceita aliases legados como fallback defensivo.
      const saldo = Number(it.quantidadeAtual ?? it.saldoAtual ?? it.quantidade ?? 0);
      const preco = Number(it.valorUnitario ?? it.precoMedio ?? it.precoUnitario ?? 0);
      unidadesEstoque += saldo;
      valorTotal += saldo * preco;
      const min = Number(it.quantidadeMinima ?? it.estoqueMinimo ?? 0);
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

  // Rev. 2360 — período variável (7/30/90 dias) selecionável só na aba Movs.
  // Independente do `periodoMeses` (que controla tabelas mês-a-mês globais).
  const [movsPeriodoDias, setMovsPeriodoDias] = useState<7 | 30 | 90>(30);

  // ── Agregados Movimentações (período variável) ─────────────────────────────
  // Rev. 2360 — redesign: além do diário + por-tipo originais, agora calcula
  // top 10 itens mais movimentados, distribuição por dia da semana, top obras
  // destino, média/dia (entradas+saídas+saldo) e período anterior pra deltas.
  const movAgg = useMemo(() => {
    const dias = movsPeriodoDias;
    const movs = ((movsQ.data || []) as any[]).filter(m => !m.estornadaEm);
    const limite = new Date(); limite.setDate(limite.getDate() - (dias - 1));
    const limiteKey = bucketDayKey(limite);
    // Período anterior (mesma duração, imediatamente antes do limite) pros deltas
    const limiteAnt = new Date(); limiteAnt.setDate(limiteAnt.getDate() - (2 * dias - 1));
    const limiteAntKey = bucketDayKey(limiteAnt);

    const periodoAtual = movs.filter(m => bucketDayKey(m.criadoEm) >= limiteKey);
    const periodoAnterior = movs.filter(m => {
      const k = bucketDayKey(m.criadoEm);
      return k >= limiteAntKey && k < limiteKey;
    });

    const porTipo = new Map<string, number>();
    const porDia: Record<string, { entradas: number; saidas: number }> = {};
    const porDiaSemana = [0, 0, 0, 0, 0, 0, 0]; // dom..sab — total movs
    const porItem = new Map<string, { nome: string; entradas: number; saidas: number; total: number }>();
    const porObra = new Map<string, { nome: string; entradas: number; saidas: number; total: number }>();
    for (let i = 0; i < dias; i++) {
      const d = new Date(); d.setDate(d.getDate() - (dias - 1 - i));
      porDia[bucketDayKey(d)] = { entradas: 0, saidas: 0 };
    }
    let totalEntradas = 0, totalSaidas = 0;
    for (const m of periodoAtual) {
      porTipo.set(m.tipo, (porTipo.get(m.tipo) || 0) + 1);
      const k = bucketDayKey(m.criadoEm);
      if (!porDia[k]) porDia[k] = { entradas: 0, saidas: 0 };
      const qtd = Math.abs(Number(m.quantidade || 0));
      const isEntrada = String(m.tipo || "").toLowerCase().includes("entrada");
      if (isEntrada) { porDia[k].entradas += qtd; totalEntradas += qtd; }
      else { porDia[k].saidas += qtd; totalSaidas += qtd; }
      // Dia da semana
      const dow = new Date(m.criadoEm).getDay();
      if (dow >= 0 && dow <= 6) porDiaSemana[dow] += 1;
      // Top itens
      const itemKey = String(m.itemId || m.itemNome || "—");
      const itemNome = String(m.itemNome || "— sem item —");
      const ci = porItem.get(itemKey) || { nome: itemNome, entradas: 0, saidas: 0, total: 0 };
      ci.nome = itemNome;
      if (isEntrada) ci.entradas += qtd; else ci.saidas += qtd;
      ci.total += qtd;
      porItem.set(itemKey, ci);
      // Top obras destino
      const oNome = m.obraNome || (m.obraId ? (obrasMap.get(Number(m.obraId)) || `Obra #${m.obraId}`) : "— sem obra —");
      const co = porObra.get(oNome) || { nome: oNome, entradas: 0, saidas: 0, total: 0 };
      if (isEntrada) co.entradas += qtd; else co.saidas += qtd;
      co.total += qtd;
      porObra.set(oNome, co);
    }
    // Período anterior — só agregado (pros deltas dos KPIs)
    let entAnt = 0, saiAnt = 0;
    for (const m of periodoAnterior) {
      const qtd = Math.abs(Number(m.quantidade || 0));
      const isEntrada = String(m.tipo || "").toLowerCase().includes("entrada");
      if (isEntrada) entAnt += qtd; else saiAnt += qtd;
    }
    return {
      dias,
      totalMovs: periodoAtual.length,
      totalEntradas, totalSaidas,
      mediaDiaEntradas: totalEntradas / dias,
      mediaDiaSaidas: totalSaidas / dias,
      mediaDiaMovs: periodoAtual.length / dias,
      entAnt, saiAnt,
      movsAnt: periodoAnterior.length,
      porTipo: Array.from(porTipo.entries()).map(([t, c]) => ({ tipo: t, count: c })).sort((a, b) => b.count - a.count),
      porDia,
      porDiaSemana,
      topItens: Array.from(porItem.values()).sort((a, b) => b.total - a.total).slice(0, 10),
      topObras: Array.from(porObra.values()).sort((a, b) => b.total - a.total).slice(0, 8),
    };
  }, [movsQ.data, movsPeriodoDias, obrasMap]);

  // Rev. 2360 — Memo SEPARADO pro chart da Visão Geral (sempre 30d fixos),
  // pra que o filtro 7/30/90 da aba Movs NÃO contamine a Visão Geral.
  const visaoGeralMovs = useMemo(() => {
    const movs = ((movsQ.data || []) as any[]).filter(m => !m.estornadaEm);
    const limite = new Date(); limite.setDate(limite.getDate() - 29);
    const limiteKey = bucketDayKey(limite);
    const last30 = movs.filter(m => bucketDayKey(m.criadoEm) >= limiteKey);
    const porDia: Record<string, { entradas: number; saidas: number }> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - (29 - i));
      porDia[bucketDayKey(d)] = { entradas: 0, saidas: 0 };
    }
    for (const m of last30) {
      const k = bucketDayKey(m.criadoEm);
      if (!porDia[k]) porDia[k] = { entradas: 0, saidas: 0 };
      const qtd = Math.abs(Number(m.quantidade || 0));
      const isEntrada = String(m.tipo || "").toLowerCase().includes("entrada");
      if (isEntrada) porDia[k].entradas += qtd;
      else porDia[k].saidas += qtd;
    }
    return { porDia };
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
    // Rev. 2363 — heurística "atrasado" expandida (status formal OU em_uso
    // com data fim já no passado) pra casar com o filtro clicável do card e
    // não depender do StatusSync horário. Antes só usava o status formal.
    const HOJE_AGG = new Date(); HOJE_AGG.setHours(0, 0, 0, 0);
    const ativos = list.filter(l => l.status === "em_uso");
    const devolvidos = list.filter(l => l.status === "devolvido");
    const atrasados = list.filter(l => l.status === "atrasado" || (l.status === "em_uso" && l.dataFimPrevista && new Date(l.dataFimPrevista) < HOJE_AGG));
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
  // Rev. 2335 — padrão = ano corrente (pedido user 24/05/2026: "começar
  // sempre no início do ano"). "12m" continua disponível na pill.
  const [periodoMeses, setPeriodoMeses] = useState<"12m" | number>(() => new Date().getFullYear());
  // Rev. 2336 — drill-down: célula clicada da tabela "Locações mês a mês"
  type MetricaLoc = "ini" | "dev" | "saldo" | "custo";
  const [detalheLoc, setDetalheLoc] = useState<{ mesKey: string; mesLabel: string; metrica: MetricaLoc } | null>(null);
  const [detalheBusca, setDetalheBusca] = useState("");
  useEffect(() => { if (!detalheLoc) setDetalheBusca(""); }, [detalheLoc]);
  // Rev. 2363 — filtro contextual dos cards KPI da aba "Equip. Locados".
  // Cada card vira um toggle; quando ativo, a tabela "Locações vencendo em
  // até 30 dias" troca de conteúdo e título pra refletir o recorte clicado.
  type FiltroLocCard = "ativos" | "custoMes" | "vencendo30" | "atrasados" | "devolvidos" | "semObra" | "fornecedores" | "obras";
  const [filtroLocCard, setFiltroLocCard] = useState<FiltroLocCard | null>(null);

  // Rev. 2365 — Análise IA "Comprar vs Continuar Alugando" migrada do
  // /equipamentos/locados pra cá (Dashboard). Centraliza decisão estratégica.
  type AnaliseItem = {
    descricao: string; categoria: string | null; qtd: number;
    aluguelUnMes: number; gastoMesTotal: number;
    precoMedio: number; precoMin: number; precoMax: number;
    canalTipico: string; confianca: "alta" | "media" | "baixa";
    temPreco: boolean;
    paybackMeses: number | null; investimentoCompra: number | null; economiaAnual: number | null;
    recomendacao: "COMPRAR_JA" | "COMPRAR" | "AVALIAR" | "MANTER_LOCACAO";
  };
  type AnaliseResultado = {
    totalAnalisado: number; itens: AnaliseItem[];
    economiaAnualPotencial: number; investimentoTotalRecomendado: number;
    semEstimativa?: number; iaErroMsg?: string | null;
    fonte: string; geradoEm?: string;
  };
  const [resultadoAnaliseCA, setResultadoAnaliseCA] = useState<AnaliseResultado | null>(null);
  const [filtroRecAnalise, setFiltroRecAnalise] = useState<"" | "comprar" | "avaliar" | "manter">("");
  const analiseCAMut = trpc.equipamentos.locadosAnalisarCompraVsAluguel.useMutation({
    onSuccess: (res: any) => {
      setResultadoAnaliseCA(res);
      toast.success(`Análise IA concluída: ${res.totalAnalisado} descrição(ões) avaliada(s).`);
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao gerar análise IA."),
  });
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
                labels={Object.keys(visaoGeralMovs.porDia).map(fmtDayBR)}
                datasets={[
                  { label: "Entradas", data: Object.values(visaoGeralMovs.porDia).map(d => d.entradas), borderColor: "#10B981", backgroundColor: "rgba(16,185,129,0.15)", fill: true, tension: 0.3 },
                  { label: "Saídas",   data: Object.values(visaoGeralMovs.porDia).map(d => d.saidas),   borderColor: "#DC2626", backgroundColor: "rgba(220,38,38,0.15)", fill: true, tension: 0.3 },
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

          {/* ─────────── MOVIMENTAÇÕES (Rev. 2360 redesign) ─────────── */}
          <TabsContent value="movs" className="space-y-4 mt-4">
            {/* Rev. 2360 — Header com filtro de período (7/30/90d) +
                resumo do período anterior (referência pros deltas). */}
            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-white flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 h-9 w-9 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/60 ring-1 ring-blue-200/60 flex items-center justify-center">
                    <ArrowLeftRight className="h-4.5 w-4.5 text-blue-700" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 text-[15px] leading-tight">Análise de Movimentações</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      Últimos {movAgg.dias} dias · comparado com {movAgg.dias} dias anteriores
                    </div>
                  </div>
                </div>
                <div className="inline-flex items-center gap-0.5 p-1 rounded-full bg-slate-100/80 ring-1 ring-slate-200/70" role="tablist" aria-label="Período de análise">
                  {([7, 30, 90] as const).map(d => {
                    const ativo = movsPeriodoDias === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        role="tab"
                        aria-selected={ativo}
                        onClick={() => setMovsPeriodoDias(d)}
                        className={[
                          "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 whitespace-nowrap",
                          ativo
                            ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                            : "text-slate-500 hover:text-slate-800 hover:bg-white/60",
                        ].join(" ")}
                      >
                        {d} dias
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Rev. 2360 — KPIs com sub (média/dia + delta vs período anterior) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <DashKpi
                label={`Movimentações (${movAgg.dias}d)`}
                value={fmtNum(movAgg.totalMovs)}
                icon={ArrowLeftRight}
                color="blue"
                sub={(<DeltaSub current={movAgg.totalMovs} previous={movAgg.movsAnt} mediaDia={movAgg.mediaDiaMovs} />) as any}
              />
              <DashKpi
                label="Entradas (qtd)"
                value={fmtNum(movAgg.totalEntradas)}
                icon={TrendingUp}
                color="green"
                sub={(<DeltaSub current={movAgg.totalEntradas} previous={movAgg.entAnt} mediaDia={movAgg.mediaDiaEntradas} />) as any}
              />
              <DashKpi
                label="Saídas (qtd)"
                value={fmtNum(movAgg.totalSaidas)}
                icon={TrendingDown}
                color="red"
                sub={(<DeltaSub current={movAgg.totalSaidas} previous={movAgg.saiAnt} mediaDia={movAgg.mediaDiaSaidas} />) as any}
              />
              <DashKpi
                label="Saldo (qtd)"
                value={fmtNum(movAgg.totalEntradas - movAgg.totalSaidas)}
                icon={Activity}
                color={movAgg.totalEntradas >= movAgg.totalSaidas ? "green" : "red"}
                sub={`${movAgg.totalEntradas >= movAgg.totalSaidas ? "+" : ""}${fmtNum(movAgg.totalEntradas - movAgg.totalSaidas)} unidades líquidas`}
              />
            </div>

            {/* Rev. 2360 — Gráfico principal: eixo X em DD/MM (padrão BR) */}
            <DashChart
              title={`Entradas vs Saídas por dia (últimos ${movAgg.dias} dias)`}
              type="bar"
              labels={Object.keys(movAgg.porDia).map(fmtDayBR)}
              datasets={[
                { label: "Entradas", data: Object.values(movAgg.porDia).map(d => d.entradas), backgroundColor: "#10B981" },
                { label: "Saídas",   data: Object.values(movAgg.porDia).map(d => d.saidas),   backgroundColor: "#DC2626" },
              ]}
              height={320}
            />

            {/* Rev. 2360 — Análises auxiliares: 3 cards lado-a-lado.
                1) Top 10 itens mais movimentados (lista visual com barras
                   proporcionais — mais legível que doughnut com 10+ fatias).
                2) Por tipo (doughnut, mantido — costuma ter 2-4 categorias).
                3) Distribuição por dia da semana (vertical bar). */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden lg:col-span-2">
                <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" /> Top 10 itens mais movimentados
                </div>
                <div className="p-3 space-y-2">
                  {movAgg.topItens.length === 0 && <div className="p-4 text-center text-sm text-slate-500">Sem itens no período.</div>}
                  {movAgg.topItens.map((it, idx) => {
                    const maxTotal = movAgg.topItens[0]?.total || 1;
                    const pct = (it.total / maxTotal) * 100;
                    const pctEnt = it.total > 0 ? (it.entradas / it.total) * 100 : 0;
                    return (
                      <div key={`${it.nome}-${idx}`} className="group">
                        <div className="flex items-center justify-between gap-2 text-xs mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0 h-5 w-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center">{idx + 1}</span>
                            <span className="font-medium text-slate-800 truncate" title={it.nome}>{it.nome}</span>
                          </div>
                          <span className="text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                            <span className="text-emerald-600 font-semibold">↑{fmtNum(it.entradas)}</span>
                            {" · "}
                            <span className="text-red-600 font-semibold">↓{fmtNum(it.saidas)}</span>
                            {" = "}
                            <span className="font-bold text-slate-700">{fmtNum(it.total)}</span>
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                          <div className="h-full bg-emerald-500" style={{ width: `${pct * pctEnt / 100}%` }} title={`Entradas: ${fmtNum(it.entradas)}`} />
                          <div className="h-full bg-red-500" style={{ width: `${pct * (100 - pctEnt) / 100}%` }} title={`Saídas: ${fmtNum(it.saidas)}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <DashChart
                  title={`Por tipo (${movAgg.dias}d)`}
                  type="doughnut"
                  labels={movAgg.porTipo.map(t => t.tipo)}
                  datasets={[{ data: movAgg.porTipo.map(t => t.count) }]}
                />
                <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 text-sm flex items-center gap-2">
                    <CalendarRange className="h-4 w-4 text-purple-600" /> Por dia da semana
                  </div>
                  <div className="p-3">
                    {(() => {
                      const max = Math.max(1, ...movAgg.porDiaSemana);
                      return (
                        <div className="flex items-end justify-between gap-1.5 h-28">
                          {movAgg.porDiaSemana.map((v, idx) => {
                            const h = (v / max) * 100;
                            const isFimSem = idx === 0 || idx === 6;
                            return (
                              <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                                <div className="text-[10px] font-semibold text-slate-500 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">{v}</div>
                                <div className="w-full bg-slate-100 rounded-t flex items-end" style={{ height: "70%" }}>
                                  <div
                                    className={`w-full rounded-t transition-all ${isFimSem ? "bg-slate-300" : "bg-blue-500"}`}
                                    style={{ height: `${h}%` }}
                                    title={`${DIAS_SEMANA_PT[idx]}: ${fmtNum(v)} movs`}
                                  />
                                </div>
                                <div className={`text-[10px] ${isFimSem ? "text-slate-400" : "text-slate-600 font-medium"}`}>{DIAS_SEMANA_PT[idx]}</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Rev. 2360 — Top obras destino (full width, lista limpa) */}
            {movAgg.topObras.length > 0 && (
              <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-emerald-600" /> Obras com mais movimentações (top 8)
                </div>
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  {movAgg.topObras.map((o, idx) => {
                    const maxTotal = movAgg.topObras[0]?.total || 1;
                    const pct = (o.total / maxTotal) * 100;
                    return (
                      <div key={`${o.nome}-${idx}`}>
                        <div className="flex items-center justify-between gap-2 text-xs mb-1">
                          <span className="font-medium text-slate-800 truncate" title={o.nome}>{o.nome}</span>
                          <span className="text-[11px] text-slate-500 whitespace-nowrap tabular-nums font-semibold">{fmtNum(o.total)}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rev. 2360 — Tabela últimas 15 movs: + colunas Obra/Responsável */}
            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">Últimas 15 movimentações</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left p-2.5">Data</th>
                      <th className="text-left p-2.5">Tipo</th>
                      <th className="text-left p-2.5">Item</th>
                      <th className="text-left p-2.5">Obra</th>
                      <th className="text-left p-2.5">Responsável</th>
                      <th className="text-right p-2.5">Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((movsQ.data || []) as any[]).slice(0, 15).map((m: any) => {
                      const isEntrada = String(m.tipo || "").toLowerCase().includes("entrada");
                      const obraNome = m.obraNome || (m.obraId ? (obrasMap.get(Number(m.obraId)) || `#${m.obraId}`) : "—");
                      return (
                        <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="p-2.5 text-slate-600 whitespace-nowrap tabular-nums">{fmtDate(m.criadoEm)}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${isEntrada ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-red-50 text-red-700 ring-1 ring-red-200"}`}>{m.tipo}</span>
                          </td>
                          <td className="p-2.5 text-slate-800 truncate max-w-[200px]" title={m.itemNome}>{m.itemNome || "—"}</td>
                          <td className="p-2.5 text-slate-700 truncate max-w-[180px]" title={obraNome}>{obraNome}</td>
                          <td className="p-2.5 text-slate-600 truncate max-w-[140px]" title={m.usuarioNome || ""}>{m.usuarioNome || "—"}</td>
                          <td className={`p-2.5 text-right font-semibold tabular-nums ${isEntrada ? "text-emerald-700" : "text-red-700"}`}>
                            {isEntrada ? "+" : "−"}{fmtNum(Math.abs(Number(m.quantidade || 0)))}
                          </td>
                        </tr>
                      );
                    })}
                    {((movsQ.data || []) as any[]).length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">Sem movimentações.</td></tr>}
                  </tbody>
                </table>
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
            {(() => {
              const todos = (propriosQ.data || []) as any[];
              const lista = todos.slice(0, 20);
              const semValor = todos.filter((p: any) => !(Number(p.valorAquisicao) > 0)).length;
              return (
                <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-indigo-100 ring-1 ring-indigo-200 flex items-center justify-center shrink-0">
                        <HardHat className="h-4 w-4 text-indigo-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 leading-tight">Equipamentos cadastrados</div>
                        <div className="text-[11px] text-slate-500">Exibindo {lista.length} de {fmtNum(todos.length)} — mais recentes primeiro</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {semValor > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200 rounded-full px-2 py-0.5">
                          <AlertTriangle className="h-3 w-3" /> {fmtNum(semValor)} sem valor
                        </span>
                      )}
                      <Link href="/equipamentos/proprios"><a className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">Ver todos <ArrowUp className="h-3 w-3 rotate-45" /></a></Link>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-medium">Descrição</th>
                          <th className="text-left px-4 py-2.5 font-medium">Patrimônio</th>
                          <th className="text-left px-4 py-2.5 font-medium">Status</th>
                          <th className="text-right px-4 py-2.5 font-medium">Valor aquisição</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lista.map((p: any) => {
                          const st = statusProprioTheme(p.status);
                          const valor = Number(p.valorAquisicao || 0);
                          const temValor = valor > 0;
                          return (
                            <tr key={p.id} className="border-t border-slate-100 hover:bg-indigo-50/40 transition-colors">
                              <td className="px-4 py-2.5 font-medium text-slate-800">{p.descricao}</td>
                              <td className="px-4 py-2.5">
                                {(p.codigoPatrimonio || p.codigoInterno)
                                  ? <span className="font-mono text-[11px] text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">{p.codigoPatrimonio || p.codigoInterno}</span>
                                  : <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                {temValor
                                  ? <span className="font-semibold text-slate-800">{fmtBRL(valor)}</span>
                                  : <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600"><AlertTriangle className="h-3 w-3" /> Sem valor</span>}
                              </td>
                            </tr>
                          );
                        })}
                        {todos.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-500">Nenhum equipamento próprio cadastrado.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

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
            {/* Rev. 2363 — todos os 8 cards são toggles. Clique = aplica filtro contextual à tabela abaixo. Segundo clique limpa. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <DashKpi label="Ativos" value={fmtNum(locAgg.ativos)} icon={Activity} color="blue"   active={filtroLocCard === "ativos"}       onClick={() => setFiltroLocCard(p => p === "ativos" ? null : "ativos")} />
              <DashKpi label="Custo / mês" value={fmtBRL(locAgg.custoMes)} icon={DollarSign} color="teal"  active={filtroLocCard === "custoMes"}     onClick={() => setFiltroLocCard(p => p === "custoMes" ? null : "custoMes")} sub="ordena por R$/mês" />
              <DashKpi label="Vencendo (30d)" value={fmtNum(locAgg.vencendo30)} icon={Clock} color="orange" active={filtroLocCard === "vencendo30"}   onClick={() => setFiltroLocCard(p => p === "vencendo30" ? null : "vencendo30")} />
              <DashKpi label="Atrasados" value={fmtNum(locAgg.atrasados)} icon={AlertTriangle} color="red" active={filtroLocCard === "atrasados"}    onClick={() => setFiltroLocCard(p => p === "atrasados" ? null : "atrasados")} />
              <DashKpi label="Devolvidos" value={fmtNum(locAgg.devolvidos)} icon={CheckCircle2} color="green" active={filtroLocCard === "devolvidos"}   onClick={() => setFiltroLocCard(p => p === "devolvidos" ? null : "devolvidos")} />
              <DashKpi label="Sem obra vinculada" value={fmtNum(locAgg.semObra)} icon={MapPin} color="orange" sub="vincule em lote" active={filtroLocCard === "semObra"} onClick={() => setFiltroLocCard(p => p === "semObra" ? null : "semObra")} />
              <DashKpi label="Fornecedores" value={fmtNum(locAgg.porFornecedor.length)} icon={Building2} color="purple" active={filtroLocCard === "fornecedores"} onClick={() => setFiltroLocCard(p => p === "fornecedores" ? null : "fornecedores")} sub="agrupa por locadora" />
              <DashKpi label="Obras atendidas" value={fmtNum(locAgg.porObra.filter(o => o.nome !== "— sem obra —").length)} icon={MapPin} color="indigo" active={filtroLocCard === "obras"} onClick={() => setFiltroLocCard(p => p === "obras" ? null : "obras")} sub="agrupa por obra" />
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

            {/* Rev. 2363 — painel contextual: troca de fonte + título + colunas conforme card clicado.
                Sem filtro → mantém o comportamento original (vencendo 30d). */}
            {(() => {
              const todos = (locadosQ.data || []) as any[];
              const HOJE = new Date(); HOJE.setHours(0, 0, 0, 0);
              const fim = (l: any) => l?.dataFimPrevista ? new Date(l.dataFimPrevista) : null;
              const isFornOrObra = filtroLocCard === "fornecedores" || filtroLocCard === "obras";
              type Cfg = { titulo: string; icon: any; iconColor: string; list: any[]; emptyMsg: string; orderBy?: "valor" | "fim" };
              const cfgMap: Record<Exclude<FiltroLocCard, "fornecedores" | "obras">, Cfg> = {
                ativos:     { titulo: "Locações ativas (em uso)",          icon: Activity,       iconColor: "text-blue-600",   list: todos.filter(l => l.status === "em_uso"),                                              emptyMsg: "Nenhuma locação ativa." },
                custoMes:   { titulo: "Locações ativas — ordenado por custo mensal", icon: DollarSign, iconColor: "text-teal-600", list: todos.filter(l => l.status === "em_uso" && Number(l.valorMensal || 0) > 0),     emptyMsg: "Nenhuma locação ativa com valor mensal." , orderBy: "valor"},
                vencendo30: { titulo: "Locações vencendo em até 30 dias",  icon: Clock,          iconColor: "text-orange-600", list: locAgg.vencendo,                                                                      emptyMsg: "Nenhuma locação vencendo no período. 👌", orderBy: "fim" },
                atrasados:  { titulo: "Locações em atraso",                icon: AlertTriangle,  iconColor: "text-red-600",    list: todos.filter(l => l.status === "atrasado" || (l.status === "em_uso" && fim(l) && fim(l)! < HOJE)), emptyMsg: "Nenhuma locação atrasada. 👌", orderBy: "fim" },
                devolvidos: { titulo: "Locações devolvidas",               icon: CheckCircle2,   iconColor: "text-green-600",  list: todos.filter(l => l.status === "devolvido"),                                          emptyMsg: "Nenhuma devolução registrada." },
                semObra:    { titulo: "Locações ativas sem obra vinculada", icon: MapPin,       iconColor: "text-orange-600", list: todos.filter(l => l.status === "em_uso" && !l.obraId),                               emptyMsg: "Todas as locações ativas estão vinculadas a uma obra. 👌" },
              };
              const cfgDefault: Cfg = cfgMap.vencendo30;
              // Code review fix Rev. 2363: pra fornecedores/obras, header
              // próprio (título/ícone/cor) em vez de reaproveitar o default
              // "vencendo 30d" que induzia leitura errada.
              const cfgAgrupado: Record<"fornecedores" | "obras", Cfg> = {
                fornecedores: { titulo: "Locações ativas agrupadas por fornecedor (locadora)", icon: Building2, iconColor: "text-purple-600", list: [], emptyMsg: "Sem fornecedores." },
                obras:        { titulo: "Locações ativas agrupadas por obra",                  icon: MapPin,   iconColor: "text-indigo-600", list: [], emptyMsg: "Sem obras." },
              };
              const cfg: Cfg = !filtroLocCard ? cfgDefault : (isFornOrObra ? cfgAgrupado[filtroLocCard as "fornecedores" | "obras"] : cfgMap[filtroLocCard as keyof typeof cfgMap]);
              // Aplica ordenação opcional
              let listaOrd = [...cfg.list];
              if (cfg.orderBy === "valor") listaOrd.sort((a, b) => Number(b.valorMensal || 0) - Number(a.valorMensal || 0));
              if (cfg.orderBy === "fim") listaOrd.sort((a, b) => {
                const fa = a.dataFimPrevista ? new Date(a.dataFimPrevista).getTime() : Infinity;
                const fb = b.dataFimPrevista ? new Date(b.dataFimPrevista).getTime() : Infinity;
                return fa - fb;
              });
              const Icon = cfg.icon;
              return (
                <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 flex items-center justify-between gap-3 flex-wrap">
                    <span className="flex items-center gap-2"><Icon className={`h-4 w-4 ${cfg.iconColor}`} /> {cfg.titulo}{!isFornOrObra && listaOrd.length > 0 && <span className="text-xs font-normal text-slate-500">({fmtNum(listaOrd.length)} {listaOrd.length === 1 ? "item" : "itens"}{listaOrd.length > 25 ? `, exibindo 25` : ""})</span>}</span>
                    <div className="flex items-center gap-2">
                      {filtroLocCard && (
                        <button onClick={() => setFiltroLocCard(null)} className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition" title="Limpar filtro">
                          Limpar filtro <X className="h-3 w-3" />
                        </button>
                      )}
                      <Link href="/equipamentos/locados"><a className="text-xs text-blue-600 hover:underline">Abrir lista →</a></Link>
                    </div>
                  </div>
                  {isFornOrObra ? (
                    // Modo agregado por fornecedor / obra
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                          <tr>
                            <th className="text-left p-2">{filtroLocCard === "fornecedores" ? "Fornecedor (locadora)" : "Obra"}</th>
                            <th className="text-right p-2">Unidades ativas</th>
                            <th className="text-right p-2">Custo mensal</th>
                            <th className="text-right p-2">% do total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(filtroLocCard === "fornecedores" ? locAgg.porFornecedor : locAgg.porObra).map((g: any) => {
                            const pct = locAgg.custoMes > 0 ? (g.custo / locAgg.custoMes) * 100 : 0;
                            return (
                              <tr key={g.nome} className="border-t border-slate-100 hover:bg-slate-50">
                                <td className="p-2 text-slate-800">{g.nome}</td>
                                <td className="p-2 text-right tabular-nums text-slate-700">{fmtNum(g.qtd)}</td>
                                <td className="p-2 text-right tabular-nums text-slate-800 font-medium">{fmtBRL(g.custo)}</td>
                                <td className="p-2 text-right tabular-nums text-slate-500">{pct.toFixed(1)}%</td>
                              </tr>
                            );
                          })}
                          {(filtroLocCard === "fornecedores" ? locAgg.porFornecedor : locAgg.porObra).length === 0 && (
                            <tr><td colSpan={4} className="p-6 text-center text-slate-500">Sem dados.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                          <tr><th className="text-left p-2">Equipamento</th><th className="text-left p-2">Fornecedor</th><th className="text-left p-2">Obra</th><th className="text-left p-2">Fim previsto</th><th className="text-right p-2">R$/mês</th></tr>
                        </thead>
                        <tbody>
                          {listaOrd.slice(0, 25).map((l: any) => {
                            const fimD = fim(l);
                            const atrasado = fimD && fimD < HOJE && l.status !== "devolvido";
                            return (
                              <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                                <td className="p-2 text-slate-800">{l.descricao}</td>
                                <td className="p-2 text-slate-700">{l.fornecedorNome || "—"}</td>
                                <td className="p-2 text-slate-700">{l.obraId ? (obrasMap.get(Number(l.obraId)) || `#${l.obraId}`) : "—"}</td>
                                <td className={`p-2 font-medium ${atrasado ? "text-red-700" : "text-amber-700"}`}>{fmtDate(l.dataFimPrevista)}</td>
                                <td className="p-2 text-right tabular-nums">{fmtBRL(Number(l.valorMensal || 0))}</td>
                              </tr>
                            );
                          })}
                          {listaOrd.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">{cfg.emptyMsg}</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

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
                      // Rev. 2336 — célula clicável (drill-down) com indicador discreto
                      const cellBtn = (content: any, metrica: MetricaLoc, disabled = false) => (
                        <button
                          onClick={() => !disabled && setDetalheLoc({ mesKey: m.key, mesLabel: m.label, metrica })}
                          disabled={disabled}
                          className={`group inline-flex items-center gap-1.5 -mx-1 px-1 py-0.5 rounded-md transition ${disabled ? "cursor-default opacity-60" : "hover:bg-emerald-50 hover:ring-1 hover:ring-emerald-200 cursor-pointer"}`}
                          title={disabled ? "Sem registros nesse mês" : `Ver detalhes — ${m.label}`}>
                          {content}
                          {!disabled && <Eye className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 transition" />}
                        </button>
                      );
                      return (
                        <tr key={m.key} className="border-t border-slate-100 hover:bg-slate-50/60 transition">
                          <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">{m.label}</td>
                          <td className="p-2.5">{cellBtn(<DeltaCell value={ini} prev={prevIni} accent="text-emerald-700" />, "ini", !ini)}</td>
                          <td className="p-2.5">{cellBtn(<DeltaCell value={dev} prev={prevDev} accent="text-red-700" />, "dev", !dev)}</td>
                          <td className="p-2.5">{cellBtn(<DeltaCell value={saldo} prev={prevSaldo} accent={saldo >= 0 ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"} />, "saldo", !ini && !dev)}</td>
                          <td className="p-2.5">{cellBtn(<DeltaCell value={monthlyAgg.locadosCustoIniciado[m.key]} prev={prevCusto} money />, "custo", !ini)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Rev. 2365 — Análise IA "Comprar vs Continuar Alugando" (migrada do /equipamentos/locados).
                Inclui o KPI 0-100% de gasto mensal que vale a pena comprar. */}
            <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-amber-50 to-white px-5 py-4 border-b border-amber-100 flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="bg-amber-100 text-amber-700 rounded-lg p-2 shrink-0"><Scale className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900">Análise IA · Comprar vs Continuar Alugando</h3>
                    <p className="text-xs text-slate-600 mt-0.5">Estima o preço de compra novo (mercado BR) de cada equipamento em locação e calcula payback vs aluguel mensal atual.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {resultadoAnaliseCA && !analiseCAMut.isPending && (
                    <button
                      onClick={() => companyId && analiseCAMut.mutate({ companyId, maxDescricoes: 80 })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-white hover:bg-amber-50 ring-1 ring-amber-300 rounded-lg transition"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Re-analisar
                    </button>
                  )}
                  <button
                    onClick={() => companyId && analiseCAMut.mutate({ companyId, maxDescricoes: 80 })}
                    disabled={!companyId || analiseCAMut.isPending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow disabled:opacity-50"
                  >
                    {analiseCAMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {resultadoAnaliseCA ? "Atualizar análise" : "Gerar análise IA agora"}
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Estado 1: nunca rodou */}
                {!resultadoAnaliseCA && !analiseCAMut.isPending && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900 space-y-2">
                    <div className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4" /> Como funciona</div>
                    <ul className="list-disc pl-5 space-y-1 text-amber-800">
                      <li>O ERP agrupa os equipamentos <b>em uso</b> por descrição (até 80 descrições com maior gasto mensal).</li>
                      <li>A IA estima o preço de compra (item NOVO, R$, mercado BR) — faixa min/médio/max.</li>
                      <li>Calculamos <b>payback</b> (preço ÷ aluguel mensal) e <b>economia anual</b> (12×aluguel − preço de compra).</li>
                      <li>Recomendação: <b className="text-emerald-700">COMPRAR JÁ</b> (payback ≤6m) · <b className="text-emerald-600">COMPRAR</b> (≤12m) · <b className="text-amber-700">AVALIAR</b> (≤24m) · <b className="text-slate-700">MANTER LOCAÇÃO</b> (&gt;24m).</li>
                    </ul>
                    <div className="text-[11px] text-amber-700/80 pt-1">⚠ Estimativa baseada no conhecimento da IA (sem busca ao vivo na web). Use como ponto de partida pra cotação real.</div>
                  </div>
                )}

                {/* Estado 2: carregando */}
                {analiseCAMut.isPending && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-600">
                    <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
                    <div className="text-sm font-medium">Consultando IA para estimar preços de mercado…</div>
                    <div className="text-xs text-slate-400">Isso pode levar de 30s a 2min dependendo da quantidade de descrições.</div>
                  </div>
                )}

                {/* Estado 3: resultado */}
                {resultadoAnaliseCA && !analiseCAMut.isPending && (() => {
                  const r = resultadoAnaliseCA;
                  const itensFiltrados = r.itens.filter(it => {
                    if (filtroRecAnalise === "comprar") return it.recomendacao === "COMPRAR_JA" || it.recomendacao === "COMPRAR";
                    if (filtroRecAnalise === "avaliar") return it.recomendacao === "AVALIAR";
                    if (filtroRecAnalise === "manter") return it.recomendacao === "MANTER_LOCACAO";
                    return true;
                  });
                  const cntComprar = r.itens.filter(i => i.recomendacao === "COMPRAR_JA" || i.recomendacao === "COMPRAR").length;
                  const cntAvaliar = r.itens.filter(i => i.recomendacao === "AVALIAR").length;
                  const cntManter  = r.itens.filter(i => i.recomendacao === "MANTER_LOCACAO").length;
                  // Rev. 2365 — KPI 0-100%: % do gasto mensal de aluguel que está em
                  // descrições recomendadas pra COMPRAR (urgente + recomendado). É a
                  // métrica que o user pediu: "quanto do meu aluguel já era pra ter comprado".
                  const gastoTotalMes  = r.itens.reduce((s, i) => s + (Number(i.gastoMesTotal) || 0), 0);
                  const gastoComprarMes = r.itens.filter(i => i.recomendacao === "COMPRAR_JA" || i.recomendacao === "COMPRAR")
                    .reduce((s, i) => s + (Number(i.gastoMesTotal) || 0), 0);
                  const pctComprar = gastoTotalMes > 0 ? Math.round((gastoComprarMes / gastoTotalMes) * 100) : 0;
                  const pctTone = pctComprar >= 50 ? "text-emerald-700" : pctComprar >= 25 ? "text-amber-700" : "text-slate-600";
                  const pctRing = pctComprar >= 50 ? "stroke-emerald-500" : pctComprar >= 25 ? "stroke-amber-500" : "stroke-slate-400";
                  // Anel SVG: r=44, circunferência ≈ 276.46
                  const R = 44;
                  const C = 2 * Math.PI * R;
                  const dash = (pctComprar / 100) * C;
                  const recBadge = (rec: AnaliseItem["recomendacao"]) => {
                    const map: Record<typeof rec, { cls: string; label: string }> = {
                      COMPRAR_JA:     { cls: "bg-emerald-600 text-white",                                        label: "COMPRAR JÁ" },
                      COMPRAR:        { cls: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300",          label: "COMPRAR" },
                      AVALIAR:        { cls: "bg-amber-100 text-amber-800 ring-1 ring-amber-300",                label: "AVALIAR" },
                      MANTER_LOCACAO: { cls: "bg-slate-100 text-slate-700 ring-1 ring-slate-300",                label: "MANTER" },
                    };
                    const m = map[rec];
                    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${m.cls}`}>{m.label}</span>;
                  };
                  const confBadge = (c: AnaliseItem["confianca"]) => {
                    const map = { alta: "text-emerald-700", media: "text-amber-700", baixa: "text-red-700" };
                    return <span className={`text-[10px] font-semibold uppercase ${map[c]}`}>{c}</span>;
                  };
                  return (
                    <div className="space-y-4">
                      {r.iaErroMsg && (
                        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div><b>Atenção:</b> {r.iaErroMsg}</div>
                        </div>
                      )}

                      {/* KPIs + Anel 0-100% (destaque máximo, métrica pedida pelo user) */}
                      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4 items-stretch">
                        {/* Anel 0-100% */}
                        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl p-5 flex items-center gap-4">
                          <div className="relative shrink-0">
                            <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
                              <circle cx="60" cy="60" r={R} fill="none" strokeWidth="12" className="stroke-slate-200" />
                              <circle
                                cx="60" cy="60" r={R} fill="none" strokeWidth="12"
                                strokeLinecap="round"
                                strokeDasharray={`${dash} ${C}`}
                                className={`${pctRing} transition-all duration-700`}
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <div className={`text-3xl font-bold tabular-nums ${pctTone}`}>{pctComprar}%</div>
                              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">do aluguel</div>
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-wider text-amber-700 font-bold">% do gasto mensal que vale a pena comprar</div>
                            <div className="text-sm text-slate-700 mt-1">
                              Você gasta <b className="tabular-nums">{fmtBRL(gastoTotalMes)}/mês</b> nas {fmtNum(r.totalAnalisado)} descrições analisadas.
                            </div>
                            <div className="text-sm text-slate-700 mt-0.5">
                              Desse total, <b className={`tabular-nums ${pctTone}`}>{fmtBRL(gastoComprarMes)}/mês</b> está em itens onde a IA recomenda <b>comprar</b> (payback ≤ 12 meses).
                            </div>
                          </div>
                        </div>

                        {/* KPIs auxiliares */}
                        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-emerald-700 font-bold"><ShoppingCart className="h-3 w-3" />Recomendado comprar</div>
                            <div className="text-2xl font-bold text-emerald-800 mt-1 tabular-nums">{fmtNum(cntComprar)}</div>
                            <div className="text-[11px] text-emerald-700/80">de {fmtNum(r.totalAnalisado)} descrições</div>
                          </div>
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-amber-700 font-bold"><TrendingDown className="h-3 w-3" />Economia anual potencial</div>
                            <div className="text-xl font-bold text-amber-800 mt-1 tabular-nums truncate" title={fmtBRL(r.economiaAnualPotencial)}>{fmtBRL(r.economiaAnualPotencial)}</div>
                            <div className="text-[11px] text-amber-700/80">se comprar todos recomendados</div>
                          </div>
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-blue-700 font-bold"><DollarSign className="h-3 w-3" />Investimento necessário</div>
                            <div className="text-xl font-bold text-blue-800 mt-1 tabular-nums truncate" title={fmtBRL(r.investimentoTotalRecomendado)}>{fmtBRL(r.investimentoTotalRecomendado)}</div>
                            <div className="text-[11px] text-blue-700/80">à vista, novo, sem frete</div>
                          </div>
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-600 font-bold"><AlertTriangle className="h-3 w-3" />Avaliar / Manter</div>
                            <div className="text-2xl font-bold text-slate-700 mt-1 tabular-nums">{fmtNum(cntAvaliar)} / {fmtNum(cntManter)}</div>
                            <div className="text-[11px] text-slate-500">descrições sem ganho claro</div>
                          </div>
                        </div>
                      </div>

                      {/* Filter pills */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-600">Filtrar:</span>
                        {[
                          { k: "",        label: `Todos (${r.totalAnalisado})`,           cls: "bg-slate-100 text-slate-800 ring-slate-300" },
                          { k: "comprar", label: `Recomendado comprar (${cntComprar})`,  cls: "bg-emerald-100 text-emerald-800 ring-emerald-300" },
                          { k: "avaliar", label: `Avaliar (${cntAvaliar})`,              cls: "bg-amber-100 text-amber-800 ring-amber-300" },
                          { k: "manter",  label: `Manter locação (${cntManter})`,        cls: "bg-slate-100 text-slate-700 ring-slate-300" },
                        ].map(o => (
                          <button key={o.k} onClick={() => setFiltroRecAnalise(o.k as any)}
                            className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition ring-1 ${
                              filtroRecAnalise === o.k ? `${o.cls} shadow-sm` : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                            }`}>
                            {o.label}
                          </button>
                        ))}
                      </div>

                      {/* Tabela */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs">
                            <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-[10px]">
                              <tr>
                                <th className="text-left px-3 py-2">Descrição</th>
                                <th className="text-right px-2 py-2">Qtd</th>
                                <th className="text-right px-2 py-2">Aluguel/un/mês</th>
                                <th className="text-right px-2 py-2">Preço estim./un</th>
                                <th className="text-right px-2 py-2">Investir total</th>
                                <th className="text-right px-2 py-2">Payback</th>
                                <th className="text-right px-2 py-2">Economia/ano</th>
                                <th className="text-center px-2 py-2">Recomendação</th>
                                <th className="text-left px-3 py-2">Canal · Confiança</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {itensFiltrados.length === 0 && (
                                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Nenhuma descrição neste filtro.</td></tr>
                              )}
                              {itensFiltrados.map((it) => (
                                <tr key={it.descricao} className="hover:bg-slate-50/60">
                                  <td className="px-3 py-2 max-w-[280px]">
                                    <div className="font-medium text-slate-800 truncate" title={it.descricao}>{it.descricao}</div>
                                    {it.categoria && <div className="text-[10px] text-slate-400 truncate">{it.categoria}</div>}
                                  </td>
                                  <td className="px-2 py-2 text-right tabular-nums text-slate-700">{fmtNum(it.qtd)}</td>
                                  <td className="px-2 py-2 text-right tabular-nums text-slate-700">{fmtBRL(it.aluguelUnMes)}</td>
                                  <td className="px-2 py-2 text-right tabular-nums">
                                    <div className="text-slate-900 font-semibold">{it.precoMedio > 0 ? fmtBRL(it.precoMedio) : "—"}</div>
                                    {it.precoMedio > 0 && (
                                      <div className="text-[10px] text-slate-400">{fmtBRL(it.precoMin)} – {fmtBRL(it.precoMax)}</div>
                                    )}
                                  </td>
                                  <td className="px-2 py-2 text-right tabular-nums text-slate-700">{it.investimentoCompra != null && it.investimentoCompra > 0 ? fmtBRL(it.investimentoCompra) : "—"}</td>
                                  <td className="px-2 py-2 text-right tabular-nums">
                                    {it.paybackMeses != null ? (
                                      <span className={`font-semibold ${it.paybackMeses <= 6 ? "text-emerald-700" : it.paybackMeses <= 12 ? "text-emerald-600" : it.paybackMeses <= 24 ? "text-amber-700" : "text-slate-500"}`}>
                                        {it.paybackMeses.toFixed(1)} m
                                      </span>
                                    ) : <span className="text-slate-400">—</span>}
                                  </td>
                                  <td className="px-2 py-2 text-right tabular-nums">
                                    {it.economiaAnual != null ? (
                                      <span className={`font-semibold ${it.economiaAnual > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                                        {(it.economiaAnual > 0 ? "+" : "") + fmtBRL(it.economiaAnual)}
                                      </span>
                                    ) : <span className="text-slate-400">—</span>}
                                  </td>
                                  <td className="px-2 py-2 text-center">{recBadge(it.recomendacao)}</td>
                                  <td className="px-3 py-2 text-slate-600 max-w-[200px]">
                                    <div className="truncate text-[11px]" title={it.canalTipico}>{it.canalTipico || "—"}</div>
                                    <div className="text-[10px]">{confBadge(it.confianca)}</div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 italic">
                        Fonte: {r.fonte}. Gerado em {r.geradoEm ? new Date(r.geradoEm).toLocaleString("pt-BR") : "—"}. Economia anual = 12 × aluguel mensal total − investimento de compra (ignora valor residual, custo de capital e manutenção).
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Rev. 2336 — Modal drill-down de Locações mês a mês */}
      {detalheLoc && (() => {
        const list = (locadosQ.data || []) as any[];
        const inMonth = (d: any) => monthKey(d) === detalheLoc.mesKey;
        // Constrói linhas com tag pra cada métrica.
        // IMPORTANTE: usar a MESMA chave de bucket do monthlyAgg (dataInicio || criadoEm)
        // pra ini/custo/saldo, senão a contagem do modal diverge da célula clicada.
        const rows: Array<{ l: any; tag: "ini" | "dev"; data: any }> = [];
        if (detalheLoc.metrica === "ini" || detalheLoc.metrica === "custo") {
          for (const l of list) {
            const di = l.dataInicio || l.criadoEm;
            if (inMonth(di)) rows.push({ l, tag: "ini", data: di });
          }
        } else if (detalheLoc.metrica === "dev") {
          for (const l of list) if (inMonth(l.dataDevolucao)) rows.push({ l, tag: "dev", data: l.dataDevolucao });
        } else { // saldo: ini ∪ dev
          for (const l of list) {
            const di = l.dataInicio || l.criadoEm;
            if (inMonth(di)) rows.push({ l, tag: "ini", data: di });
            if (inMonth(l.dataDevolucao)) rows.push({ l, tag: "dev", data: l.dataDevolucao });
          }
        }
        const buscaNorm = detalheBusca.trim().toLowerCase();
        const filtradas = buscaNorm
          ? rows.filter(({ l }) => `${l.descricao || ""} ${l.fornecedorNome || ""} ${l.codigoPatrimonioFornecedor || ""} ${l.obraId ? obrasMap.get(Number(l.obraId)) || "" : ""}`.toLowerCase().includes(buscaNorm))
          : rows;
        const totalUnid = rows.length;
        const totalIni = rows.filter(r => r.tag === "ini").length;
        const totalDev = rows.filter(r => r.tag === "dev").length;
        const custoIni = rows.filter(r => r.tag === "ini").reduce((s, r) => s + (Number(r.l.valorMensal) || 0), 0);
        const obrasUnicas = new Set<number>();
        for (const r of rows) if (r.l.obraId) obrasUnicas.add(Number(r.l.obraId));
        const metricaCfg: Record<MetricaLoc, { titulo: string; icone: any; gradient: string; sub: string }> = {
          ini:   { titulo: "Locações iniciadas",   icone: TrendingUp,   gradient: "from-emerald-600 via-teal-600 to-cyan-700",  sub: "equipamentos cujo contrato começou neste mês" },
          dev:   { titulo: "Devoluções",            icone: TrendingDown, gradient: "from-rose-600 via-red-600 to-orange-600",    sub: "equipamentos devolvidos neste mês" },
          saldo: { titulo: "Movimentação líquida",  icone: ArrowLeftRight, gradient: "from-indigo-600 via-violet-600 to-fuchsia-600", sub: "iniciadas e devolvidas neste mês" },
          custo: { titulo: "Custo mensal iniciado", icone: DollarSign,   gradient: "from-amber-600 via-orange-600 to-red-600",   sub: "custo das locações iniciadas neste mês" },
        };
        const cfg = metricaCfg[detalheLoc.metrica];
        const Icon = cfg.icone;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDetalheLoc(null)}>
            {/* Rev. 2357 — `max-h-[88dvh]` em vez de `90vh`: no iOS Safari
                a barra de URL dinâmica encolhe o viewport visível e o
                `vh` (medido pelo viewport "completo") empurrava o header
                pra fora da tela, escondendo o X de fechar. `dvh` respeita
                a chrome atual. Fallback `vh` pra browsers antigos. */}
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[88vh] max-h-[88dvh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Header gradient */}
              <div className={`relative overflow-hidden bg-gradient-to-br ${cfg.gradient} text-white`}>
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(255,255,255,0.2) 0%, transparent 50%)" }} />
                <div className="relative px-5 py-4 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 backdrop-blur-sm rounded-xl p-2.5 ring-1 ring-white/30">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-widest text-white/80 font-semibold">{detalheLoc.mesLabel}</div>
                      <h2 className="text-xl font-bold tracking-tight">{cfg.titulo}</h2>
                      <p className="text-xs text-white/80 mt-0.5">{cfg.sub}</p>
                    </div>
                  </div>
                  <button onClick={() => setDetalheLoc(null)} className="bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-xl p-2 ring-1 ring-white/30 transition" title="Fechar">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* KPI strip + busca */}
              <div className="border-b border-slate-200 bg-slate-50/60 px-5 py-3 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Iniciadas</div>
                    <div className="text-xl font-bold text-emerald-700 mt-0.5">{fmtNum(totalIni)}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Devolvidas</div>
                    <div className="text-xl font-bold text-red-700 mt-0.5">{fmtNum(totalDev)}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Custo iniciado</div>
                    <div className="text-xl font-bold text-amber-700 mt-0.5">{fmtBRL(custoIni)}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Obras envolvidas</div>
                    <div className="text-xl font-bold text-indigo-700 mt-0.5">{fmtNum(obrasUnicas.size)}</div>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    autoFocus
                    value={detalheBusca}
                    onChange={e => setDetalheBusca(e.target.value)}
                    placeholder="Filtrar por descrição, fornecedor, patrimônio, obra…"
                    className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition" />
                </div>
              </div>

              {/* Lista */}
              <div className="flex-1 overflow-auto">
                {filtradas.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    <Truck className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <div className="font-medium">Nenhum equipamento encontrado.</div>
                    {buscaNorm && <div className="text-xs mt-1">Ajuste o filtro de busca acima.</div>}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gradient-to-b from-slate-50 to-slate-50/90 backdrop-blur text-[11px] text-slate-500 uppercase tracking-wide z-10">
                      <tr className="border-b border-slate-200">
                        <th className="text-left p-2.5 pl-5">Evento</th>
                        <th className="text-left p-2.5">Equipamento</th>
                        <th className="text-left p-2.5">Patrim.</th>
                        <th className="text-left p-2.5">Fornecedor</th>
                        <th className="text-left p-2.5">Obra</th>
                        <th className="text-left p-2.5 whitespace-nowrap">Data</th>
                        <th className="text-right p-2.5 pr-5 whitespace-nowrap">R$/mês</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtradas.map(({ l, tag, data }, idx) => (
                        <tr key={`${l.id}-${tag}-${idx}`} className="border-t border-slate-100 hover:bg-emerald-50/30 transition">
                          <td className="p-2.5 pl-5">
                            {tag === "ini" ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                <TrendingUp className="h-3 w-3" /> Iniciada
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                                <TrendingDown className="h-3 w-3" /> Devolvida
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-800 font-medium max-w-[280px] truncate" title={l.descricao}>{l.descricao}</td>
                          <td className="p-2.5 text-slate-600 font-mono text-xs"><span className="inline-flex items-center gap-1"><Hash className="h-3 w-3 text-slate-400" />{l.codigoPatrimonioFornecedor || "—"}</span></td>
                          <td className="p-2.5 text-slate-700">{l.fornecedorNome || <span className="text-slate-400 italic">sem fornecedor</span>}</td>
                          <td className="p-2.5 text-slate-700">
                            {l.obraId ? (
                              <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3 text-slate-400" />{obrasMap.get(Number(l.obraId)) || `#${l.obraId}`}</span>
                            ) : <span className="text-slate-400 italic">— sem obra —</span>}
                          </td>
                          <td className="p-2.5 text-slate-600 whitespace-nowrap">{fmtDate(data)}</td>
                          <td className="p-2.5 pr-5 text-right text-slate-800 font-medium whitespace-nowrap">{tag === "ini" ? fmtBRL(Number(l.valorMensal) || 0) : <span className="text-slate-400">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer — Rev. 2357: botão "Fechar" explícito no rodapé
                  além do X do header (que pode estar fora da viewport
                  visível no iPad quando a URL bar do Safari está expandida). */}
              <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-3 flex items-center justify-between gap-3 text-xs text-slate-600">
                <div className="min-w-0 flex-1">
                  Mostrando <b className="text-slate-900">{filtradas.length}</b> de <b className="text-slate-900">{totalUnid}</b> {totalUnid === 1 ? "registro" : "registros"}
                  {buscaNorm && <span className="ml-1 text-slate-500">(filtrado por "{detalheBusca}")</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/equipamentos/locados`}>
                    <a className="inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 font-medium hover:underline" onClick={() => setDetalheLoc(null)}>
                      Abrir Equipamentos Locados →
                    </a>
                  </Link>
                  <button
                    onClick={() => setDetalheLoc(null)}
                    className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg px-3 py-1.5 transition shadow-sm"
                    title="Fechar (Esc)"
                  >
                    <X className="h-3.5 w-3.5" /> Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </DashboardLayout>
  );
}
