import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/hooks/useCompany";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from "recharts";
import { Banknote, ListChecks, CheckCircle2, AlertTriangle, Wallet, Receipt, Clock, BarChart3, Ban, XCircle } from "lucide-react";
import {
  MESES_ABREV, PALETTE, formatBRL, formatBRLCompact, DashHeader, KpiCard, ChartCard, EmptyState, BRLTooltip,
  ComparativoAnual, DetailDialog, DetailColumn,
} from "./_kit";
import { GRUPO_DEVOLUCAO_LABEL } from "@shared/chequeMotivos";

const DESTINO = "/financeiro/cheques";
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "—");

// Cor fixa por situação do cheque (pedido do usuário): pendente=vermelho, compensado=verde, indefinido=âmbar.
const statusColor = (s: string): string | null => {
  const n = String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (n.includes("pend")) return "#ef4444";                          // vermelho
  if (n.includes("compens")) return "#16a34a";                        // verde
  if (n.includes("indefin") || n === "" || n === "-" || n === "—") return "#f59e0b"; // âmbar
  if (n.includes("devolv") || n.includes("susta")) return "#b91c1c";  // vermelho escuro
  return null; // demais → paleta padrão
};
const dataBR = (d?: string) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");

// Rev. 3347 — selo de status COLORIDO p/ o drill-in (e impressão/relatório). Usa a MESMA
// régua de cor dos gráficos (statusColor): pendente=vermelho, compensado=verde, indefinido=âmbar,
// devolvido/sustado=vermelho escuro. `print-color-adjust:exact` inline garante a cor no print/PDF.
const statusPill = (s: string) => {
  const cor = statusColor(s) ?? "#64748b"; // slate fallback
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white whitespace-nowrap"
      style={{ backgroundColor: cor, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as any}
    >
      {cap(s)}
    </span>
  );
};

// Status EFETIVO do cheque — espelha a tela "Controle de Cheques" (FinanceiroCheques: jaCompensado).
// Um cheque com data de compensação preenchida conta como COMPENSADO mesmo que a coluna `status`
// ainda esteja "pendente" (era a causa de "compensados não aparecerem nos gráficos").
const statusEf = (c: any): string =>
  (String(c?.status || "").toLowerCase() === "compensado" || c?.dataCompensacao) ? "compensado" : String(c?.status || "—");

// ── Helpers da Análise gerencial (Rev. 3333) — read-only, client-side ──
// new Date("YYYY-MM-DDT00:00:00") é seguro no iOS (≠ formato com espaço).
const toDate = (s?: string) => { if (!s) return null; const d = new Date(String(s).slice(0, 10) + "T00:00:00"); return isNaN(d.getTime()) ? null : d; };
const diasComp = (c: any): number | null => { const v = toDate(c.dataVencimento), k = toDate(c.dataCompensacao); if (!v || !k) return null; return Math.round((k.getTime() - v.getTime()) / 86400000); };
const parcelasDe = (p?: string): number => { if (!p) return 1; const m = String(p).match(/\/\s*(\d+)/); if (m) { const n = parseInt(m[1], 10); return n > 0 ? n : 1; } return 1; };
const DEVOLVIDOS = new Set(["devolvido", "sustado", "cancelado"]);
const FAIXAS_VALOR = [
  { name: "Até R$ 1 mil", lo: 0, hi: 1000 },
  { name: "R$ 1–5 mil", lo: 1000, hi: 5000 },
  { name: "R$ 5–20 mil", lo: 5000, hi: 20000 },
  { name: "R$ 20–50 mil", lo: 20000, hi: 50000 },
  { name: "Acima de R$ 50 mil", lo: 50000, hi: Infinity },
];
const PRAZO_BUCKETS = [
  { name: "Antecipado", test: (d: number) => d < 0 },
  { name: "No vencimento", test: (d: number) => d === 0 },
  { name: "1–7 dias", test: (d: number) => d >= 1 && d <= 7 },
  { name: "8–30 dias", test: (d: number) => d >= 8 && d <= 30 },
  { name: "+30 dias", test: (d: number) => d > 30 },
];

const COLS: DetailColumn[] = [
  { key: "numeroCheque", label: "Cheque", format: (v) => v || "—" },
  { key: "fornecedorNome", label: "Fornecedor", format: (v) => v || "—" },
  { key: "bancoNome", label: "Banco", format: (v) => v || "—" },
  { key: "dataVencimento", label: "Vencimento", format: (v) => dataBR(v) },
  { key: "dataCompensacao", label: "Compensação", format: (v) => dataBR(v) },
  { key: "status", label: "Status", align: "center", format: (_v, row) => statusPill(statusEf(row)) },
  { key: "valor", label: "Valor", align: "right", brl: true },
];

// ── Cheques DEVOLVIDOS — fonte ÚNICA: conciliação bancária (getConciliacaoReportGeral).
// Os motivos de devolução (sem fundo/sustado/etc.) NÃO existem na tabela de cheques; só
// são detectados no extrato pareando débito (compensação) + crédito (devolução) do mesmo
// cheque. Tudo READ-ONLY — nada concilia/baixa (conciliação só sugestiva).
const devValor = (d: any): number => (Number(d?.valorCents) || 0) / 100;
const devResolvido = (d: any): boolean => d?.resolucao?.tipo === "reapresentado" || d?.resolucao?.tipo === "pix";
const devSituacao = (tipo?: string): string =>
  tipo === "reapresentado" ? "Reapresentado (compensado)" : tipo === "pix" ? "Quitado (PIX/TED)" : "Sem quitação";
const devSituacaoCor = (tipo?: string): string =>
  tipo === "reapresentado" ? "#16a34a" : tipo === "pix" ? "#0ea5e9" : "#ef4444";
const devMotivoLabel = (d: any): string => {
  const g = d?.motivoGrupo as keyof typeof GRUPO_DEVOLUCAO_LABEL | null;
  return g && GRUPO_DEVOLUCAO_LABEL[g] ? GRUPO_DEVOLUCAO_LABEL[g] : "Não informado";
};
const devMotivoCor = (label: string): string =>
  label.startsWith("Sem fundos") ? "#dc2626"
    : label.startsWith("Sustação") ? "#b91c1c"
    : label.startsWith("Impedimento") ? "#f59e0b"
    : label.startsWith("Irregularidade") ? "#a855f7"
    : label.startsWith("Apresentação") ? "#0ea5e9"
    : label.startsWith("Operacional") ? "#64748b"
    : "#94a3b8";
const devPill = (tipo?: string) => (
  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white whitespace-nowrap"
    style={{ backgroundColor: devSituacaoCor(tipo), printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as any}>
    {devSituacao(tipo)}
  </span>
);
const DEV_COLS: DetailColumn[] = [
  { key: "chequeNumero", label: "Cheque", format: (v, row) => v || row?.doc || "—" },
  { key: "fornecedor", label: "Fornecedor / Obra", format: (v, row) => v || row?.obraNome || row?.nf || "—" },
  { key: "motivoTexto", label: "Motivo", format: (v, row) => (v ? `${row?.motivoCodigo ? `${row.motivoCodigo} · ` : ""}${v}` : "—") },
  { key: "dataDebito", label: "Compensação", format: (v) => dataBR(v) },
  { key: "dataCredito", label: "Devolução", format: (v) => dataBR(v) },
  { key: "resolucao", label: "Situação", align: "center", format: (_v, row) => devPill(row?.resolucao?.tipo) },
  { key: "valor", label: "Valor", align: "right", brl: true },
];

export default function DashCheques() {
  const { companyId } = useCompany();
  const [, setLocation] = useLocation();
  const [ano, setAno] = useState(new Date().getFullYear());
  // Filtro mês a mês (0 = ano todo; 1-12 = mês específico). Mesmo padrão da Conciliação Bancária.
  const [mes, setMes] = useState(0);
  const ir = () => setLocation(DESTINO);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const dataInicio = mes === 0 ? `${ano}-01-01` : `${ano}-${pad2(mes)}-01`;
  const dataFim = mes === 0 ? `${ano}-12-31` : `${ano}-${pad2(mes)}-${pad2(new Date(ano, mes, 0).getDate())}`;
  const periodoLabel = mes === 0 ? `${ano}` : `${MESES_ABREV[mes - 1]}/${ano}`;

  // KPIs e conferência: agregados do backend, escopados ao período (mês quando selecionado).
  const { data: resumo, refetch: r1 } = (trpc as any).cheques.resumo.useQuery({ companyId, ano, mes: mes || undefined }, { enabled: !!companyId });
  const { data: verif, refetch: r2 } = (trpc as any).cheques.verificarExtratoResumo.useQuery({ companyId, ano, mes: mes || undefined }, { enabled: !!companyId });
  // Lista do ANO inteiro (limit 2000) — alimenta os gráficos MENSAIS (year-wide por design) e a
  // régua "com dados"; os cards de status/rankings filtram por mês no client (const `cheques`).
  const { data: lista, isLoading, refetch: r3 } = (trpc as any).cheques.listar.useQuery({ companyId, ano, limit: 2000 }, { enabled: !!companyId });
  const { data: listaPrev } = (trpc as any).cheques.listar.useQuery({ companyId, ano: ano - 1, limit: 2000 }, { enabled: !!companyId });
  // Cheques devolvidos — motivos só existem no extrato (conciliação), não na tabela de cheques.
  // Janela = período selecionado (mês ou ano). READ-ONLY (conciliação só sugestiva).
  const { data: devReport, refetch: r4 } = (trpc as any).financial.getConciliacaoReportGeral.useQuery(
    { companyId, dataInicio, dataFim },
    { enabled: !!companyId },
  );
  const refetch = () => { r1(); r2(); r3(); r4(); };

  const rowsResumo: any[] = Array.isArray(resumo) ? resumo : [];
  const chequesAno: any[] = Array.isArray(lista) ? lista : [];
  const chequesPrev: any[] = Array.isArray(listaPrev) ? listaPrev : [];
  // Visão por mês (client-side) p/ os cards de status, rankings e análise gerencial.
  const cheques = useMemo(() => (mes === 0 ? chequesAno : chequesAno.filter((c) => Number(c.mes) === mes)), [chequesAno, mes]);
  // Régua "Com dados / Sem dados" — qualquer cheque no mês marca o dot verde.
  const mesesComDados = useMemo(() => {
    const s = new Set<number>();
    for (const c of chequesAno) { const i = Number(c.mes); if (i >= 1 && i <= 12) s.add(i); }
    return s;
  }, [chequesAno]);

  const [det, setDet] = useState<{ title: string; subtitle?: string; rows: any[] } | null>(null);
  const abrir = (title: string, subtitle: string, list: any[]) => setDet({ title, subtitle, rows: list });
  const [detDev, setDetDev] = useState<{ title: string; subtitle?: string; rows: any[] } | null>(null);
  const abrirDev = (title: string, subtitle: string, list: any[]) => setDetDev({ title, subtitle, rows: list });

  const kpis = useMemo(() => {
    const qtd = rowsResumo.reduce((s, x) => s + (Number(x.qtd) || 0), 0);
    const total = rowsResumo.reduce((s, x) => s + (Number(x.total) || 0), 0);
    return { qtd, total };
  }, [rowsResumo]);

  const serieAtual = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const c of chequesAno) { const m = Number(c.mes) || 0; if (m >= 1 && m <= 12) a[m - 1] += Number(c.valor) || 0; }
    return a;
  }, [chequesAno]);
  const seriePrev = useMemo(() => {
    const a = new Array(12).fill(0);
    for (const c of chequesPrev) { const m = Number(c.mes) || 0; if (m >= 1 && m <= 12) a[m - 1] += Number(c.valor) || 0; }
    return a;
  }, [chequesPrev]);
  const totalPrev = useMemo(() => seriePrev.reduce((s, v) => s + v, 0), [seriePrev]);

  // Agregado por status EFETIVO (vem da LISTA, que traz dataCompensacao) — substitui o resumo
  // do backend (GROUP BY status cru), que classificava compensados-por-data como "Pendente".
  const porStatus = useMemo(() => {
    const m = new Map<string, { value: number; qtd: number }>();
    for (const c of cheques) {
      const k = statusEf(c);
      const cur = m.get(k) || { value: 0, qtd: 0 };
      cur.value += Number(c.valor) || 0; cur.qtd += 1;
      m.set(k, cur);
    }
    return Array.from(m.entries())
      .map(([k, v]) => ({ name: cap(k), value: v.value, qtd: v.qtd, _key: k }))
      .filter((x) => x.value > 0 || x.qtd > 0)
      .sort((a, b) => b.value - a.value);
  }, [cheques]);

  const conferencia = useMemo(() => ([
    { name: "Confere — falta marcar", value: Number(verif?.valorAConferir) || 0, _kind: "confere" },
    { name: "Conferidos no extrato", value: Number(verif?.valorJaConferidos) || 0, _kind: "conferido" },
    { name: "Divergências", value: Number(verif?.valorDivergencias) || 0, _kind: "divergente" },
  ]), [verif]);

  // ── Cheques devolvidos (motivos do extrato) — read-only ──
  const devolvidos = useMemo(() => {
    const arr: any[] = Array.isArray(devReport?.chequesDevolvidos) ? devReport.chequesDevolvidos : [];
    return arr.map((d) => ({ ...d, valor: devValor(d) }));
  }, [devReport]);

  const devStats = useMemo(() => {
    const val = (a: any[]) => a.reduce((s, d) => s + (Number(d.valor) || 0), 0);
    const semFundo = devolvidos.filter((d) => d.motivoGrupo === "sem_fundos");
    const sustados = devolvidos.filter((d) => !!d.motivoSustado);
    const resolvidos = devolvidos.filter((d) => devResolvido(d));
    const pendentes = devolvidos.filter((d) => !devResolvido(d));
    return {
      qtd: devolvidos.length, total: val(devolvidos),
      semFundo, sustados, resolvidos, pendentes,
      valSemFundo: val(semFundo), valSustados: val(sustados), valResolvidos: val(resolvidos), valPendentes: val(pendentes),
    };
  }, [devolvidos]);

  const devPorMotivo = useMemo(() => {
    const m = new Map<string, { value: number; qtd: number }>();
    for (const d of devolvidos) {
      const k = devMotivoLabel(d);
      const cur = m.get(k) || { value: 0, qtd: 0 };
      cur.value += Number(d.valor) || 0; cur.qtd += 1;
      m.set(k, cur);
    }
    return Array.from(m.entries()).map(([name, v]) => ({ name, value: v.value, qtd: v.qtd })).sort((a, b) => b.value - a.value);
  }, [devolvidos]);

  const devPorSituacao = useMemo(() => {
    const order = ["reapresentado", "pix", "pendente"];
    const m = new Map<string, { value: number; qtd: number }>();
    for (const d of devolvidos) {
      const t = devResolvido(d) ? d.resolucao.tipo : "pendente";
      const cur = m.get(t) || { value: 0, qtd: 0 };
      cur.value += Number(d.valor) || 0; cur.qtd += 1;
      m.set(t, cur);
    }
    return order.filter((t) => m.has(t)).map((t) => ({ name: devSituacao(t), value: m.get(t)!.value, qtd: m.get(t)!.qtd, _tipo: t }));
  }, [devolvidos]);

  const porMes = useMemo(() => MESES_ABREV.map((m, i) => ({ mes: m, Valor: serieAtual[i] })), [serieAtual]);

  const topFornecedores = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of cheques) { const k = c.fornecedorNome || "—"; acc[k] = (acc[k] || 0) + (Number(c.valor) || 0); }
    return Object.entries(acc).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
  }, [cheques]);

  // ── Análise gerencial (Rev. 3333) — cortes refinados, 100% client-side/read-only ──
  const stats = useMemo(() => {
    const qtd = cheques.length;
    const total = cheques.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const ticket = qtd > 0 ? total / qtd : 0;
    const devol = cheques.filter((c) => DEVOLVIDOS.has(String(c.status || "").toLowerCase()));
    const valDevol = devol.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const taxaDevol = qtd > 0 ? (devol.length / qtd) * 100 : 0;
    const conc = cheques.filter((c) => Number(c.conciliado) === 1);
    const pctConc = qtd > 0 ? (conc.length / qtd) * 100 : 0;
    let somaDias = 0, nDias = 0;
    for (const c of cheques) { const d = diasComp(c); if (d == null) continue; somaDias += d; nDias++; }
    return { qtd, total, ticket, qtdDevol: devol.length, valDevol, taxaDevol, qtdConc: conc.length, pctConc, prazoMedio: nDias > 0 ? somaDias / nDias : null, nDias };
  }, [cheques]);

  const statusKeys = useMemo(() => {
    const rank = (s: string) => { const t = String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); if (t.includes("compens")) return 0; if (t.includes("pend")) return 1; return 2; };
    return Array.from(new Set(chequesAno.map((c) => statusEf(c)))).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }, [chequesAno]);
  const evolStatus = useMemo(() => {
    const base = MESES_ABREV.map((m) => { const o: any = { mes: m }; statusKeys.forEach((k) => (o[cap(k)] = 0)); return o; });
    for (const c of chequesAno) { const mi = (Number(c.mes) || 0) - 1; if (mi < 0 || mi > 11) continue; base[mi][cap(statusEf(c))] += Number(c.valor) || 0; }
    return base;
  }, [chequesAno, statusKeys]);

  const porBanco = useMemo(() => {
    const acc: Record<string, { value: number; qtd: number }> = {};
    for (const c of cheques) { const k = c.bancoNome || c.bancoCodigo || "—"; (acc[k] ??= { value: 0, qtd: 0 }); acc[k].value += Number(c.valor) || 0; acc[k].qtd++; }
    return Object.entries(acc).map(([name, v]) => ({ name, value: v.value, qtd: v.qtd })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [cheques]);

  const porObra = useMemo(() => {
    const acc: Record<string, { value: number; qtd: number }> = {};
    for (const c of cheques) { const k = c.obraNome || (c.obraId ? `Obra ${c.obraId}` : "Sem obra"); (acc[k] ??= { value: 0, qtd: 0 }); acc[k].value += Number(c.valor) || 0; acc[k].qtd++; }
    return Object.entries(acc).map(([name, v]) => ({ name, value: v.value, qtd: v.qtd })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [cheques]);

  const perfilParcelas = useMemo(() => {
    const acc: Record<number, { qtd: number; value: number }> = {};
    for (const c of cheques) { const n = parcelasDe(c.parcela); (acc[n] ??= { qtd: 0, value: 0 }); acc[n].qtd++; acc[n].value += Number(c.valor) || 0; }
    return Object.entries(acc).map(([n, v]) => ({ n: Number(n), name: Number(n) <= 1 ? "À vista" : `${n}x`, qtd: v.qtd, value: v.value })).sort((a, b) => a.n - b.n);
  }, [cheques]);

  const porFaixa = useMemo(() => FAIXAS_VALOR.map((f) => {
    const itens = cheques.filter((c) => { const v = Number(c.valor) || 0; return v >= f.lo && v < f.hi; });
    return { name: f.name, qtd: itens.length, value: itens.reduce((s, c) => s + (Number(c.valor) || 0), 0), lo: f.lo, hi: f.hi };
  }), [cheques]);

  const prazoBuckets = useMemo(() => {
    const out = PRAZO_BUCKETS.map((b) => ({ name: b.name, qtd: 0 }));
    for (const c of cheques) { const d = diasComp(c); if (d == null) continue; const i = PRAZO_BUCKETS.findIndex((b) => b.test(d)); if (i >= 0) out[i].qtd++; }
    return out;
  }, [cheques]);

  const recorrentes = useMemo(() => {
    const acc: Record<string, { vezes: number; meses: Set<string>; valor: number }> = {};
    for (const c of cheques) { const k = c.fornecedorNome || "—"; (acc[k] ??= { vezes: 0, meses: new Set(), valor: 0 }); acc[k].vezes++; acc[k].meses.add(`${c.ano}-${c.mes}`); acc[k].valor += Number(c.valor) || 0; }
    return Object.entries(acc).map(([name, v]) => ({ name, vezes: v.vezes, meses: v.meses.size, valor: v.valor })).filter((x) => x.vezes > 1).sort((a, b) => b.vezes - a.vezes).slice(0, 12);
  }, [cheques]);

  const semDados = !isLoading && cheques.length === 0 && rowsResumo.length === 0;
  const barClick = (st: any, build: (label: string) => void) => { const l = st?.activeLabel; if (l != null) build(String(l)); };
  const filtraConferencia = (kind: string) => {
    if (kind === "conferido") return cheques.filter((c) => c.extratoConfirmado && Number(c.conciliado) === 1);
    if (kind === "confere") return cheques.filter((c) => c.extratoConfirmado && Number(c.conciliado) !== 1);
    return cheques.filter((c) => c.extratoDivergente);
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        <DashHeader
          theme="violet" icon={Banknote} title="Dashboard · Controle de Cheques"
          subtitle={`Emissão e conferência com o extrato · ${periodoLabel}`} ano={ano} onAno={setAno} onRefresh={refetch}
        />

        {/* ── Seletor de período (mês) — white-card padrão PERÍODO (igual Conciliação Bancária) ── */}
        <div className="rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
          <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Período</span>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Com dados</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />Sem dados</span>
            </div>
          </div>
          <div className="px-4 py-3 grid grid-cols-7 sm:grid-cols-13 gap-1.5">
            <button type="button"
              onClick={() => setMes(0)}
              className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                ${mes === 0
                  ? "border-violet-500 bg-violet-50 text-violet-700 shadow-sm"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"}`}
            >
              <span>Tudo</span>
              <span className="w-1.5 h-1.5 rounded-full bg-transparent" />
            </button>
            {MESES_ABREV.map((m, i) => {
              const numMes = i + 1;
              const isSelected = mes === numMes;
              const dotColor = mesesComDados.has(numMes) ? "bg-emerald-500" : "bg-gray-300";
              return (
                <button key={m} type="button" onClick={() => setMes(numMes)}
                  className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                    ${isSelected
                      ? "border-violet-500 bg-violet-50 text-violet-700 shadow-sm"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"}`}
                >
                  <span>{m}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={ListChecks} label={mes === 0 ? "Cheques no ano" : "Cheques no mês"} value={String(kpis.qtd)} sub={formatBRL(kpis.total)} onClick={ir} />
          <KpiCard icon={CheckCircle2} label="Conferidos no extrato" value={formatBRL(Number(verif?.valorJaConferidos) || 0)} tone="good"
            sub={`${Number(verif?.jaConferidos) || 0} cheques`} onClick={() => abrir("Cheques conferidos no extrato", "Compensados e marcados", filtraConferencia("conferido"))} />
          <KpiCard icon={Wallet} label="Confere — falta marcar" value={formatBRL(Number(verif?.valorAConferir) || 0)} tone="warn"
            sub={`${Number(verif?.aConferir) || 0} cheques`} onClick={() => abrir("Confere — falta marcar", "Batem com o extrato mas não foram marcados", filtraConferencia("confere"))} />
          <KpiCard icon={AlertTriangle} label="Divergências" value={formatBRL(Number(verif?.valorDivergencias) || 0)} tone="bad"
            sub={`${Number(verif?.divergencias) || 0} cheques`} onClick={() => abrir("Divergências com o extrato", "Encontrados no extrato mas não compensados", filtraConferencia("divergente"))} />
        </div>

        {semDados ? (
          <div className="py-20"><EmptyState message={`Nenhum cheque encontrado em ${periodoLabel}.`} /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Cheques por status" subtitle="Clique numa coluna para detalhar" onOpen={ir}>
                {porStatus.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={porStatus} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                      onClick={(st) => barClick(st, (l) => { const b = porStatus.find((x) => x.name === l); if (b) abrir(`Cheques · ${b.name}`, "Por situação", cheques.filter((c) => statusEf(c) === b._key)); })}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} interval={0} />
                      <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                      <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                      <Bar dataKey="value" name="Valor" radius={[4, 4, 0, 0]} maxBarSize={64} className="cursor-pointer">
                        {porStatus.map((s, i) => <Cell key={i} fill={statusColor(s._key) ?? PALETTE[i % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Conferência com o extrato" subtitle="Clique numa barra para ver os cheques" onOpen={ir}>
                <ResponsiveContainer>
                  <BarChart data={conferencia} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                    onClick={(st) => barClick(st, (l) => { const b = conferencia.find((x) => x.name === l); if (b) abrir(`Conferência · ${l}`, "Cheques por estágio de conferência", filtraConferencia(b._kind)); })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} />
                    <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                    <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="value" name="Valor" radius={[4, 4, 0, 0]} maxBarSize={64} className="cursor-pointer">
                      <Cell fill="#f59e0b" /><Cell fill="#10b981" /><Cell fill="#ef4444" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* ───────── Cheques devolvidos por motivo ─────────
                Fonte ÚNICA: conciliação bancária (motivos vivem no extrato, não na tabela
                de cheques). READ-ONLY — nada concilia/baixa (conciliação só sugestiva). */}
            {devolvidos.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <div className="w-9 h-9 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                    <Ban className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base md:text-lg font-bold text-slate-800">Cheques devolvidos</h2>
                    <p className="text-xs text-slate-400">Sem fundo, sustados ou outros motivos · detectados no extrato · {ano} · clique para detalhar</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard icon={AlertTriangle} label={mes === 0 ? "Devolvidos no ano" : "Devolvidos no mês"} value={String(devStats.qtd)} sub={formatBRL(devStats.total)} tone="bad"
                    onClick={() => abrirDev("Cheques devolvidos", `Todos os devolvidos de ${periodoLabel}`, devolvidos)} />
                  <KpiCard icon={Ban} label="Sem fundos" value={String(devStats.semFundo.length)} sub={formatBRL(devStats.valSemFundo)} tone="bad"
                    onClick={() => abrirDev("Cheques sem fundos", "Motivo 11/12 — insuficiência de fundos", devStats.semFundo)} />
                  <KpiCard icon={XCircle} label="Sustados / contraordem" value={String(devStats.sustados.length)} sub={formatBRL(devStats.valSustados)} tone="warn"
                    onClick={() => abrirDev("Cheques sustados / contraordem", "Sustação ou oposição pelo emitente", devStats.sustados)} />
                  <KpiCard icon={CheckCircle2} label="Compensados depois" value={String(devStats.resolvidos.length)} sub={formatBRL(devStats.valResolvidos)} tone="good"
                    onClick={() => abrirDev("Devolvidos já quitados", "Reapresentados ou quitados via PIX/TED", devStats.resolvidos)} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ChartCard title="Devolvidos por motivo" subtitle="Clique numa barra para detalhar" onOpen={ir}>
                    {devPorMotivo.length === 0 ? <EmptyState /> : (
                      <ResponsiveContainer>
                        <BarChart data={devPorMotivo} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                          onClick={(st) => barClick(st, (l) => abrirDev(`Devolvidos · ${l}`, "Por motivo de devolução", devolvidos.filter((x) => devMotivoLabel(x) === l)))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                          <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "#475569" }} />
                          <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                          <Bar dataKey="value" name="Valor" radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer">
                            {devPorMotivo.map((s, i) => <Cell key={i} fill={devMotivoCor(s.name)} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  <ChartCard title="Situação dos devolvidos" subtitle="Compensados depois × sem quitação · clique numa barra" onOpen={ir}>
                    {devPorSituacao.length === 0 ? <EmptyState /> : (
                      <ResponsiveContainer>
                        <BarChart data={devPorSituacao} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                          onClick={(st) => barClick(st, (l) => { const b = devPorSituacao.find((x) => x.name === l); if (b) abrirDev(`Devolvidos · ${l}`, "Por situação de quitação", devolvidos.filter((x) => (devResolvido(x) ? x.resolucao.tipo : "pendente") === b._tipo)); })}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} />
                          <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                          <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                          <Bar dataKey="value" name="Valor" radius={[4, 4, 0, 0]} maxBarSize={64} className="cursor-pointer">
                            {devPorSituacao.map((s, i) => <Cell key={i} fill={devSituacaoCor(s._tipo)} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>
              </>
            )}

            <ChartCard title="Valor de cheques por mês" subtitle="Clique numa barra para ver os cheques do mês" onOpen={ir} height={300}>
              <ResponsiveContainer>
                <BarChart data={porMes} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                  onClick={(st) => barClick(st, (l) => { const mi = MESES_ABREV.indexOf(l) + 1; abrir(`Cheques · ${l}/${ano}`, "Cheques do mês", chequesAno.filter((c) => Number(c.mes) === mi)); })}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={70} />
                  <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="Valor" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={36} className="cursor-pointer" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ComparativoAnual
              title="Comparativo de cheques — mês a mês e ano a ano"
              subtitle={`Valor emitido em ${ano} vs ${ano - 1} · seta verde = caiu · ${ano - 1}: ${formatBRL(totalPrev)}`}
              serieAtual={serieAtual} seriePrev={seriePrev}
              anoAtual={ano} anoPrev={ano - 1} goodWhen="down" valorLabel="Cheques"
              onOpenMes={(i) => abrir(`Cheques · ${MESES_ABREV[i]}/${ano}`, "Cheques do mês", chequesAno.filter((c) => Number(c.mes) === i + 1))}
            />

            <ChartCard title="Top fornecedores (cheques)" subtitle="Clique numa barra para ver os cheques" onOpen={ir} height={Math.max(220, topFornecedores.length * 38)}>
              {topFornecedores.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer>
                  <BarChart data={topFornecedores} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    onClick={(st) => barClick(st, (l) => abrir(`Cheques · ${l}`, "Cheques do fornecedor", cheques.filter((c) => (c.fornecedorNome || "—") === l)))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                    <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: "#475569" }} />
                    <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="value" name="Valor" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* ───────── Análise gerencial refinada (Rev. 3333) ───────── */}
            <div className="flex items-center gap-2 pt-2">
              <div className="w-9 h-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-bold text-slate-800">Análise gerencial</h2>
                <p className="text-xs text-slate-400">Cortes refinados dos cheques de {ano} · clique para detalhar</p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard icon={Receipt} label="Ticket médio" value={formatBRL(stats.ticket)} sub={`${stats.qtd} cheque(s)`} onClick={ir} />
              <KpiCard icon={Clock} label="Prazo médio de compensação"
                value={stats.prazoMedio == null ? "—" : `${Math.round(stats.prazoMedio)} dias`}
                sub={stats.nDias > 0 ? `${stats.nDias} com as 2 datas` : "sem datas suficientes"} />
              <KpiCard icon={AlertTriangle} label="Taxa de devolução" value={`${stats.taxaDevol.toFixed(1)}%`}
                sub={`${stats.qtdDevol} cheque(s) · ${formatBRL(stats.valDevol)}`} tone={stats.qtdDevol > 0 ? "bad" : "good"}
                onClick={() => abrir("Cheques devolvidos/sustados", "Por situação", cheques.filter((c) => DEVOLVIDOS.has(String(c.status || "").toLowerCase())))} />
              <KpiCard icon={CheckCircle2} label="% conciliado" value={`${stats.pctConc.toFixed(0)}%`}
                sub={`${stats.qtdConc} de ${stats.qtd}`} tone="good"
                onClick={() => abrir("Cheques conciliados", "Conciliados com o banco", cheques.filter((c) => Number(c.conciliado) === 1))} />
            </div>

            <ChartCard title="Evolução mensal por status" subtitle="Valor emitido empilhado por situação · clique num segmento (mês + situação) para ver os cheques" onOpen={ir} height={300}>
              {evolStatus.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer>
                  <BarChart data={evolStatus} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="mes" interval={0} tickMargin={6} tick={{ fontSize: 10, fill: "#64748b" }} />
                    <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} width={56} />
                    <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {statusKeys.map((k, i) => (
                      <Bar
                        key={k}
                        dataKey={cap(k)}
                        stackId="st"
                        fill={statusColor(k) ?? PALETTE[i % PALETTE.length]}
                        maxBarSize={38}
                        className="cursor-pointer"
                        onClick={(d: any) => {
                          const l = d?.payload?.mes; if (l == null) return;
                          const mi = MESES_ABREV.indexOf(l) + 1;
                          abrir(`Cheques · ${l}/${ano} · ${cap(k)}`, "Cheques do mês nesta situação",
                            chequesAno.filter((c) => Number(c.mes) === mi && cap(statusEf(c)) === cap(k)));
                        }}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Por banco emissor" subtitle="Clique numa barra para ver os cheques" onOpen={ir} height={Math.max(220, porBanco.length * 38)}>
                {porBanco.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={porBanco} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                      onClick={(st) => barClick(st, (l) => abrir(`Cheques · ${l}`, "Cheques do banco", cheques.filter((c) => (c.bancoNome || c.bancoCodigo || "—") === l)))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#475569" }} />
                      <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                      <Bar dataKey="value" name="Valor" radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer">
                        {porBanco.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Por obra" subtitle="Clique numa barra para ver os cheques" onOpen={ir} height={Math.max(220, porObra.length * 38)}>
                {porObra.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={porObra} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                      onClick={(st) => barClick(st, (l) => abrir(`Cheques · ${l}`, "Cheques da obra", cheques.filter((c) => (c.obraNome || (c.obraId ? `Obra ${c.obraId}` : "Sem obra")) === l)))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tickFormatter={formatBRLCompact} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#475569" }} />
                      <Tooltip content={<BRLTooltip />} cursor={{ fill: "#f1f5f9" }} />
                      <Bar dataKey="value" name="Valor" radius={[0, 4, 4, 0]} maxBarSize={26} className="cursor-pointer">
                        {porObra.map((_, i) => <Cell key={i} fill={PALETTE[(i + 3) % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Perfil de parcelamento" subtitle="À vista × parcelado · nº de cheques" onOpen={ir}>
                {perfilParcelas.length === 0 ? <EmptyState /> : (
                  <ResponsiveContainer>
                    <BarChart data={perfilParcelas} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                      onClick={(st) => barClick(st, (l) => { const p = perfilParcelas.find((x) => x.name === l); if (p) abrir(`Cheques · ${l}`, "Por perfil de parcelamento", cheques.filter((c) => parcelasDe(c.parcela) === p.n)); })}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} width={40} />
                      <Tooltip formatter={(v: any) => [`${v} cheque(s)`, "Quantidade"]} cursor={{ fill: "#f1f5f9" }} />
                      <Bar dataKey="qtd" name="Cheques" radius={[4, 4, 0, 0]} maxBarSize={48} className="cursor-pointer">
                        {perfilParcelas.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Distribuição por faixa de valor" subtitle="Clique numa barra para ver os cheques" onOpen={ir}>
                <ResponsiveContainer>
                  <BarChart data={porFaixa} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                    onClick={(st) => barClick(st, (l) => { const f = porFaixa.find((x) => x.name === l); if (f) abrir(`Cheques · ${l}`, "Por faixa de valor", cheques.filter((c) => { const v = Number(c.valor) || 0; return v >= f.lo && v < f.hi; })); })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b" }} interval={0} angle={-12} textAnchor="end" height={48} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} width={40} />
                    <Tooltip formatter={(v: any) => [`${v} cheque(s)`, "Quantidade"]} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="qtd" name="Cheques" radius={[4, 4, 0, 0]} maxBarSize={48} className="cursor-pointer">
                      {porFaixa.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Prazo de compensação" subtitle="Dias entre vencimento e compensação · clique para detalhar" onOpen={ir}>
                <ResponsiveContainer>
                  <BarChart data={prazoBuckets} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                    onClick={(st) => barClick(st, (l) => { const i = PRAZO_BUCKETS.findIndex((b) => b.name === l); if (i >= 0) abrir(`Cheques · ${l}`, "Por prazo de compensação", cheques.filter((c) => { const d = diasComp(c); return d != null && PRAZO_BUCKETS[i].test(d); })); })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} width={40} />
                    <Tooltip formatter={(v: any) => [`${v} cheque(s)`, "Quantidade"]} cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="qtd" name="Cheques" radius={[4, 4, 0, 0]} maxBarSize={48} className="cursor-pointer">
                      {prazoBuckets.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Fornecedores recorrentes" subtitle="Mais de um cheque no ano · vezes, meses e valor" onOpen={ir} height={320}>
                {recorrentes.length === 0 ? <EmptyState message={`Nenhum fornecedor recorrente em ${periodoLabel}.`} /> : (
                  <div className="h-full overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-100 z-10">
                        <tr>
                          <th className="text-left font-semibold text-slate-600 px-3 py-2">Fornecedor</th>
                          <th className="text-right font-semibold text-slate-600 px-3 py-2">Vezes</th>
                          <th className="text-right font-semibold text-slate-600 px-3 py-2">Meses</th>
                          <th className="text-right font-semibold text-slate-600 px-3 py-2">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recorrentes.map((r, i) => (
                          <tr key={i} className="odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/50 transition-colors cursor-pointer"
                            onClick={() => abrir(`Cheques · ${r.name}`, "Cheques do fornecedor", cheques.filter((c) => (c.fornecedorNome || "—") === r.name))}>
                            <td className="px-3 py-2 text-slate-700 truncate max-w-[220px]">{r.name}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.vezes}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.meses}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatBRL(r.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ChartCard>
            </div>
          </>
        )}

        <DetailDialog
          open={!!det} onOpenChange={(o) => !o && setDet(null)}
          title={det?.title || ""} subtitle={det?.subtitle}
          columns={COLS} rows={det?.rows || []} totalKey="valor" onGoTo={ir}
        />

        <DetailDialog
          open={!!detDev} onOpenChange={(o) => !o && setDetDev(null)}
          title={detDev?.title || ""} subtitle={detDev?.subtitle}
          columns={DEV_COLS} rows={detDev?.rows || []} totalKey="valor" onGoTo={ir}
        />
      </div>
    </DashboardLayout>
  );
}
