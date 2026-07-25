import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  RefreshCw, TrendingUp, TrendingDown, Minus, AlertCircle, Wallet
} from "lucide-react";
import { isProjecaoOrigem, FINANCEIRO_SOMENTE_REAL } from "@shared/financeiroProjecao";

// ─── Formatadores ─────────────────────────────────────────────────────────────

const MESES_ABR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function BRL(v: number): string {
  if (!v) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function PCT(v: number): string {
  if (!v) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(1).replace(".", ",") + "%";
}

// ─── Rev. 2944 — Efetivo × Projeção (espelha FinanceiroContasAPagar / Rev. 1629) ──
// Rev. 3147 — set movido p/ shared/financeiroProjecao (fonte única client+server).
function isProjecaoDespesa(origem?: string | null): boolean {
  return isProjecaoOrigem(origem);
}

// ─── Rev. 2944 — Categorização de despesa por origem_modulo (dados reais Neon) ──
type DespBucket =
  | "folha" | "beneficios" | "tributos" | "recorrente"
  | "compras" | "frota" | "obras" | "terceiros" | "outros";

const BUCKET_MAP: Record<string, DespBucket> = {
  // Folha & encargos (CLT real + projeções RH)
  folha_rh: "folha", folha_clt: "folha", folha: "folha",
  payroll_agregado: "folha", fechamento_ponto: "folha",
  folha_projetada: "folha", encargos_projetado: "folha",
  decimo_terceiro_projetado: "folha", ferias_projetada: "folha",
  rescisao_projetada: "folha",
  pj: "folha", pagamento_pj: "folha", pj_projetado: "folha",
  pro_labore: "folha", medicao_pj: "folha",
  // Benefícios
  beneficio_vr: "beneficios", beneficio_va: "beneficios",
  beneficio_vr_projetado: "beneficios", beneficio_va_projetado: "beneficios",
  seguro_vida: "beneficios", vale_transporte: "beneficios",
  // Tributos / guias
  guia_tributaria: "tributos",
  // Serviços recorrentes
  recorrente: "recorrente",
  // Compras / materiais
  compras: "compras", compra_oc: "compras", ordem_compra: "compras",
  almoxarifado_saida: "compras", planejamento_compra: "compras",
  // Frota
  frota: "frota", frotas: "frota",
  frota_manutencao: "frota", frota_abastecimento: "frota",
  // Obras / subcontratados (cronograma)
  cronograma_atividade: "obras", medicao_obra: "obras",
  // Terceiros / parceiros
  terceiro_medicao: "terceiros", parceiro_lancamento: "terceiros",
  pagamento_terceiro: "terceiros", contrato_terceiro: "terceiros",
  os_terceiro: "terceiros",
};
function bucketDespesa(origem?: string | null): DespBucket {
  if (!origem) return "outros";
  return BUCKET_MAP[origem] ?? "outros";
}
const FIXAS: DespBucket[]     = ["folha", "beneficios", "tributos", "recorrente"];
const VARIAVEIS: DespBucket[] = ["compras", "frota", "obras", "terceiros", "outros"];
const ALL_BUCKETS: DespBucket[] = [...FIXAS, ...VARIAVEIS];

// ─── Layout ───────────────────────────────────────────────────────────────────

const LABEL_W = 230;  // px — coluna de rótulo
const COL_W   = 128;  // px — coluna de mês (precisa caber R$ 1.730.000,00)
const TOT_W   = 142;  // px — coluna Total

type Natureza = "todos" | "efetivo" | "projecao";

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function FinanceiroFluxoCaixa() {
  const { companyId } = useCompany();
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;

  const [ano, setAno]           = useState(hoje.getFullYear());
  // Rev. 3147 — com a TRAVA "só real" ligada, o escopo trava em "efetivo" (receitas
  // pela trilha medida/faturada, despesas sem projeção); senão começa em "todos".
  const [natureza, setNatureza] = useState<Natureza>(FINANCEIRO_SOMENTE_REAL ? "efetivo" : "todos");
  const [exReceit, setExReceit] = useState(true);
  const [exDesp, setExDesp]     = useState(true);
  const [exFixas, setExFixas]   = useState(true);
  const [exVar, setExVar]       = useState(true);

  // Rev. 2944 — Compõe os 2 endpoints já confiáveis dos módulos irmãos, garantindo
  // que os valores BATAM 1:1 com Contas a Receber e Contas a Pagar (por construção).
  // Rev. 3759 — Receitas = dinheiro REAL recebido/a receber (financial_entries
  // tipo='receita'), espelhando Contas a Receber EXATAMENTE como as Despesas espelham
  // Contas a Pagar. Antes vinha da matriz de Previsão de Faturamento (cronograma), que
  // mostrava o forecast (~R$200k) em vez do caixa real (~R$2,24mi) e não fechava com o
  // extrato. Decisão do usuário (Opção 1): mostrar o dinheiro real, igual às Despesas.
  const receberQ = (trpc as any).financial.getContasAReceberByYear.useQuery(
    { companyId, ano }, { enabled: !!companyId }
  );
  const pagarQ = (trpc as any).financial.getContasAPagarByYear.useQuery(
    { companyId, ano }, { enabled: !!companyId }
  );
  // Saldo inicial (de abertura) das contas bancárias — ancora o Saldo Acumulado no
  // saldo real informado no cadastro da conta, p/ o caixa bater com o extrato (conciliação).
  const contasQ = (trpc as any).folha.listarContasBancarias.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  // Rev. 4577 — "Cheques a compensar" (float): cheques EMITIDOS e ainda pendentes.
  // A despesa JÁ está contada como paga no Contas a Pagar (a obrigação com o
  // fornecedor foi quitada na entrega do cheque); esta linha é INFORMATIVA e
  // mostra QUANDO o dinheiro sai de fato do banco — não soma nas Saídas (senão
  // contaria 2x). Agrupado pelo vencimento ("bom para") de cada cheque.
  const chequesQ = (trpc as any).cheques.pendentesPorVencimento.useQuery(
    { companyId, ano }, { enabled: !!companyId }
  );
  const chequesFloat = useMemo(() => {
    const d = chequesQ.data;
    return {
      porMes: (d?.porMes as number[]) ?? Array(12).fill(0),
      qtdPorMes: (d?.qtdPorMes as number[]) ?? Array(12).fill(0),
      foraDoAno: Number(d?.foraDoAno ?? 0),
      qtdForaDoAno: Number(d?.qtdForaDoAno ?? 0),
    };
  }, [chequesQ.data]);
  const chequesTotalAno = useMemo(
    () => chequesFloat.porMes.reduce((s, v) => s + v, 0),
    [chequesFloat]
  );
  const temCheques = chequesTotalAno > 0 || chequesFloat.foraDoAno > 0;
  const saldoInicialTotal = useMemo(() => {
    const contas: any[] = contasQ.data ?? [];
    return contas.reduce((s, c) => s + (Number(c.saldoInicial) || 0), 0);
  }, [contasQ.data]);

  const isLoading  = receberQ.isLoading || pagarQ.isLoading;
  // Rev. 4577 — cheques entram no isFetching/refetch mas NÃO no isError/isLoading:
  // falha na linha informativa não pode derrubar o Fluxo de Caixa inteiro
  // (aviso inline próprio abaixo da legenda).
  const isFetching = receberQ.isFetching || pagarQ.isFetching || chequesQ.isFetching;
  // Rev. 2944 — basta UM lado falhar p/ entrar em erro: renderizar só metade dos
  // dados (o outro lado zerado) quebraria a promessa de paridade 1:1 e induziria
  // a leitura financeira errada.
  const isError    = receberQ.isError || pagarQ.isError;
  const refetch = () => { receberQ.refetch(); pagarQ.refetch(); chequesQ.refetch(); };

  const meses12 = useMemo(
    () => Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`),
    [ano]
  );

  // ── RECEITAS — espelha Contas a Receber (financial_entries reais, igual às Despesas) ──
  // Rev. 3759 — agrupa os títulos a receber por dataVencimento (mesma régua das
  // Despesas/Contas a Pagar), separando Efetivo × Projeção por origem (isProjecaoOrigem,
  // a MESMA régua do split de Despesas). "— já recebido em caixa" usa o valor realizado
  // dos títulos com status recebido/pago (o que de fato entrou na conta).
  const { recTodos, recEfet, recProj, recReal } = useMemo(() => {
    const rows: any[] = receberQ.data ?? [];
    const recebido = new Set(["recebido", "recebido_total", "recebido_parcial", "pago"]);
    const efet = Array(12).fill(0);
    const proj = Array(12).fill(0);
    const real = Array(12).fill(0);
    for (const c of rows) {
      // Mês = dataVencimento (idêntico ao agrupamento do Contas a Pagar/Receber).
      const key = String(c.dataVencimento ?? "").slice(0, 7);
      const i = meses12.indexOf(key);
      if (i < 0) continue;
      const v = Number(c.valorPrevisto ?? 0) || 0;
      if (isProjecaoOrigem(c.origemModulo)) {
        proj[i] += v;
      } else {
        efet[i] += v;
        if (recebido.has(String(c.status ?? ""))) {
          real[i] += Number(c.valorRealizado ?? c.valorPrevisto ?? 0) || 0;
        }
      }
    }
    const todos = meses12.map((_, i) => efet[i] + proj[i]);
    return { recTodos: todos, recEfet: efet, recProj: proj, recReal: real };
  }, [receberQ.data, meses12]);

  const recVals = useMemo(
    () => natureza === "efetivo" ? recEfet : natureza === "projecao" ? recProj : recTodos,
    [natureza, recEfet, recProj, recTodos]
  );

  // ── DESPESAS — espelha Contas a Pagar (mesmo endpoint, mesmo escopo) ─────────
  const despBuckets = useMemo(() => {
    const rows: any[] = pagarQ.data ?? [];
    const buckets = Object.fromEntries(
      ALL_BUCKETS.map(b => [b, Array(12).fill(0)])
    ) as Record<DespBucket, number[]>;
    for (const c of rows) {
      const proj = isProjecaoDespesa(c.origemModulo);
      if (natureza === "efetivo" && proj) continue;
      if (natureza === "projecao" && !proj) continue;
      // Mês = dataVencimento (idêntico ao agrupamento do Contas a Pagar, que usa
      // só o vencimento e joga linhas sem data em "sem_data"). Manter assim
      // preserva a paridade 1:1; usar um fallback (competência/criação) divergiria.
      const key = String(c.dataVencimento ?? "").slice(0, 7);
      const i = meses12.indexOf(key);
      if (i < 0) continue;
      const v = Number(c.valorPrevisto ?? 0) || 0;
      buckets[bucketDespesa(c.origemModulo)][i] += v;
    }
    return buckets;
  }, [pagarQ.data, natureza, meses12]);

  const fixasVals = meses12.map((_, i) => FIXAS.reduce((s, b) => s + despBuckets[b][i], 0));
  const varVals   = meses12.map((_, i) => VARIAVEIS.reduce((s, b) => s + despBuckets[b][i], 0));
  const despVals  = meses12.map((_, i) => fixasVals[i] + varVals[i]);

  // ── RESULTADO / ACUMULADO / MARGEM ──────────────────────────────────────────
  const resVals = meses12.map((_, i) => recVals[i] - despVals[i]);
  // Saldo Acumulado parte do saldo inicial real das contas (cadastro), não de zero,
  // p/ o caixa bater com o extrato bancário na conciliação.
  let acc = saldoInicialTotal;
  const acumVals = resVals.map(r => { acc += r; return acc; });
  const lucrVals = meses12.map((_, i) => recVals[i] > 0 ? (resVals[i] / recVals[i]) * 100 : 0);

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const totalRec   = sum(recVals);
  const totalDesp  = sum(despVals);
  const totalRes   = totalRec - totalDesp;
  const totalFixas = sum(fixasVals);
  const totalVar   = sum(varVals);
  const lucrAnual  = totalRec > 0 ? (totalRes / totalRec) * 100 : 0;
  const semDados   = totalRec === 0 && totalDesp === 0;

  // Rev. 2945 — Split Efetivo × Projeção INDEPENDENTE do escopo selecionado, para
  // os KPIs deixarem explícito quanto do total é forecast (Projeção do cronograma/
  // folha) vs. real (Efetivo). É a visão "Todos" (R$ totais) decomposta.
  const recEfetTotal = sum(recEfet);
  const recProjTotal = sum(recProj);
  const despSplit = useMemo(() => {
    const rowsP: any[] = pagarQ.data ?? [];
    let efet = 0, proj = 0;
    for (const c of rowsP) {
      const key = String(c.dataVencimento ?? "").slice(0, 7);
      if (meses12.indexOf(key) < 0) continue;
      const v = Number(c.valorPrevisto ?? 0) || 0;
      if (isProjecaoDespesa(c.origemModulo)) proj += v; else efet += v;
    }
    return { efet, proj };
  }, [pagarQ.data, meses12]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function isAtual(colIdx: number) {
    return colIdx + 1 === mesAtual && ano === hoje.getFullYear();
  }

  // ── Estilo de células de detalhe ────────────────────────────────────────────
  type CellVariant = "receita" | "despesa" | "resultado" | "acumulado" | "pct" | "sub";

  function cellStyle(v: number, variant: CellVariant, atualCol: boolean): string {
    const base = "text-right tabular-nums text-xs px-3 py-0 border-l border-slate-100 whitespace-nowrap";
    const bg   = atualCol ? "bg-blue-50/70" : "";
    if (variant === "receita")  return `${base} ${bg} ${v ? "text-emerald-700 font-medium" : "text-slate-300"}`;
    if (variant === "despesa")  return `${base} ${bg} ${v ? "text-rose-700 font-medium" : "text-slate-300"}`;
    if (variant === "resultado")
      return `${base} ${v > 0 ? "bg-emerald-50 text-emerald-800 font-bold" : v < 0 ? "bg-rose-50 text-rose-800 font-bold" : "text-slate-300"} ${atualCol ? "ring-1 ring-inset ring-blue-400" : ""}`;
    if (variant === "acumulado")return `${base} ${bg} ${v > 0 ? "text-emerald-700 font-semibold" : v < 0 ? "text-rose-600 font-semibold" : "text-slate-300"}`;
    if (variant === "pct")      return `${base} ${bg} ${v > 0 ? "text-emerald-700 font-semibold" : v < 0 ? "text-rose-600 font-semibold" : "text-slate-300"}`;
    return `${base} ${bg} ${v ? "text-slate-600" : "text-slate-300"}`;
  }

  // ── Componentes de linha ─────────────────────────────────────────────────────
  function HeaderRow() {
    return (
      <tr className="h-10 bg-slate-100 border-b border-slate-200">
        <th style={{ width: LABEL_W, minWidth: LABEL_W }}
          className="sticky left-0 z-20 bg-slate-100 px-4 text-left text-xs font-semibold text-slate-500 border-r border-slate-200">
          Categoria
        </th>
        {MESES_ABR.map((m, i) => (
          <th key={m} style={{ width: COL_W, minWidth: COL_W }}
            className={`text-center text-xs font-semibold border-l border-slate-200 whitespace-nowrap
              ${isAtual(i) ? "bg-blue-600 text-white" : "text-slate-500"}`}>
            <div>{m}</div>
            {isAtual(i) && <div className="text-[9px] font-normal text-blue-100">atual</div>}
          </th>
        ))}
        <th style={{ width: TOT_W, minWidth: TOT_W }}
          className="text-center text-xs font-bold text-slate-600 border-l-2 border-slate-300 bg-slate-200">
          Total Anual
        </th>
      </tr>
    );
  }

  function GroupRow({ label, vals, total, variant, open, onToggle }: {
    label: string; vals: number[]; total: number;
    variant: "receita" | "despesa"; open: boolean; onToggle: () => void;
  }) {
    const isRec = variant === "receita";
    const bg    = isRec ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900";
    const cellC = isRec ? "text-emerald-800" : "text-rose-800";
    const totBg = isRec ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900";
    const brd   = isRec ? "border-emerald-100" : "border-rose-100";
    return (
      <tr className={`h-10 border-b ${brd}`}>
        <td style={{ width: LABEL_W, minWidth: LABEL_W }}
          className={`sticky left-0 z-10 px-4 text-xs font-bold border-r ${brd} whitespace-nowrap ${bg}`}>
          <button onClick={onToggle} className="flex items-center gap-2 w-full">
            {open ? <ChevronUp className="w-3.5 h-3.5 opacity-60" /> : <ChevronDown className="w-3.5 h-3.5 opacity-60" />}
            {label}
          </button>
        </td>
        {vals.map((v, i) => (
          <td key={i} style={{ width: COL_W, minWidth: COL_W }}
            className={`text-right tabular-nums text-xs px-3 py-0 border-l ${brd} font-semibold whitespace-nowrap ${bg} ${cellC}
              ${isAtual(i) ? "ring-1 ring-inset ring-blue-400" : ""}`}>
            {BRL(v)}
          </td>
        ))}
        <td style={{ width: TOT_W, minWidth: TOT_W }}
          className={`text-right tabular-nums text-xs px-3 font-bold border-l-2 border-slate-300 whitespace-nowrap ${totBg}`}>
          {BRL(total)}
        </td>
      </tr>
    );
  }

  function SubGroupRow({ label, vals, total, open, onToggle }: {
    label: string; vals: number[]; total: number; open: boolean; onToggle: () => void;
  }) {
    return (
      <tr className="h-9 bg-slate-50 border-b border-slate-200">
        <td style={{ width: LABEL_W, minWidth: LABEL_W }}
          className="sticky left-0 z-10 px-4 pl-6 text-xs font-semibold text-slate-600 border-r border-slate-200 whitespace-nowrap bg-slate-50">
          <button onClick={onToggle} className="flex items-center gap-2 w-full">
            {open ? <ChevronUp className="w-3 h-3 opacity-50" /> : <ChevronDown className="w-3 h-3 opacity-50" />}
            {label}
          </button>
        </td>
        {vals.map((v, i) => (
          <td key={i} style={{ width: COL_W, minWidth: COL_W }}
            className={`text-right tabular-nums text-xs px-3 font-semibold text-slate-600 border-l border-slate-200 whitespace-nowrap bg-slate-50
              ${isAtual(i) ? "ring-1 ring-inset ring-blue-400" : ""}`}>
            {BRL(v)}
          </td>
        ))}
        <td style={{ width: TOT_W, minWidth: TOT_W }}
          className="text-right tabular-nums text-xs px-3 font-bold text-slate-700 border-l-2 border-slate-300 whitespace-nowrap bg-slate-100">
          {BRL(total)}
        </td>
      </tr>
    );
  }

  function DetailRow({ label, vals, total, variant = "sub", muted = false }: {
    label: string; vals: number[]; total: number; variant?: CellVariant; muted?: boolean;
  }) {
    return (
      <tr className="h-9 bg-white border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
        <td style={{ width: LABEL_W, minWidth: LABEL_W }}
          className={`sticky left-0 z-10 px-4 pl-9 text-xs border-r border-slate-200 whitespace-nowrap bg-white hover:bg-slate-50/60 ${muted ? "text-slate-400 italic" : "text-slate-600"}`}>
          {label}
        </td>
        {vals.map((v, i) => (
          <td key={i} style={{ width: COL_W, minWidth: COL_W }} className={cellStyle(v, variant, isAtual(i))}>
            {BRL(v)}
          </td>
        ))}
        <td style={{ width: TOT_W, minWidth: TOT_W }}
          className={`text-right tabular-nums text-xs px-3 border-l-2 border-slate-200 whitespace-nowrap bg-slate-50
            ${total ? "text-slate-700 font-semibold" : "text-slate-300"}`}>
          {BRL(total)}
        </td>
      </tr>
    );
  }

  function ResultRow({ label, vals, total, variant }: {
    label: string; vals: number[]; total: number; variant: CellVariant;
  }) {
    const isPct = variant === "pct";
    return (
      <tr className="h-10 border-b border-slate-300">
        <td style={{ width: LABEL_W, minWidth: LABEL_W }}
          className="sticky left-0 z-10 px-4 text-xs font-bold border-r border-slate-600 whitespace-nowrap bg-slate-800 text-slate-100">
          {label}
        </td>
        {vals.map((v, i) => (
          <td key={i} style={{ width: COL_W, minWidth: COL_W }} className={cellStyle(v, variant, isAtual(i))}>
            {isPct ? PCT(v) : BRL(v)}
          </td>
        ))}
        <td style={{ width: TOT_W, minWidth: TOT_W }}
          className={`text-right tabular-nums text-xs px-3 font-bold border-l-2 border-slate-400 whitespace-nowrap
            ${variant === "resultado"
              ? total >= 0 ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"
              : variant === "pct"
              ? total >= 0 ? "bg-slate-100 text-emerald-700" : "bg-slate-100 text-rose-600"
              : "bg-slate-100 text-slate-600"}`}>
          {isPct ? PCT(total) : BRL(total)}
        </td>
      </tr>
    );
  }

  function Separator() {
    return <tr className="h-1.5"><td colSpan={14} className="bg-slate-100 p-0" /></tr>;
  }

  // ── Detalhe de receita conforme o escopo selecionado ─────────────────────────
  const receitaRows: { label: string; vals: number[]; muted?: boolean }[] =
    natureza === "todos"
      ? [
          { label: "Contas a Receber (Efetivo)", vals: recEfet },
          { label: "Receita Projetada", vals: recProj },
        ]
      : natureza === "efetivo"
      ? [
          { label: "Contas a Receber", vals: recEfet },
          { label: "— dos quais já recebido em caixa", vals: recReal, muted: true },
        ]
      : [
          { label: "Receita Projetada", vals: recProj },
        ];

  const NAT_OPTS: { v: Natureza; label: string }[] = [
    { v: "todos", label: "Todos" },
    { v: "efetivo", label: "Efetivo" },
    { v: "projecao", label: "Projeção" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 gap-3">
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="text-slate-500 text-sm">Carregando fluxo de caixa...</span>
        </div>
      </DashboardLayout>
    );
  }

  if (isError) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-2xl mx-auto">
          <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-4 text-sm text-rose-800">
            <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="font-semibold">Não foi possível carregar o fluxo de caixa.</p>
              <p className="text-rose-700/80">Falha ao consultar Contas a Receber e/ou Contas a Pagar.</p>
              <Button variant="outline" size="sm" onClick={refetch} className="h-8 text-xs">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Tentar novamente
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-5 max-w-[1800px] mx-auto">

        {/* ── Cabeçalho ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Fluxo de Caixa</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Espelha Contas a Receber + Contas a Pagar · {ano}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Escopo Efetivo × Projeção (mesma régua do Contas a Pagar) */}
            {/* Rev. 3147 — com a TRAVA "só real" ligada o seletor some (escopo fixo em "efetivo"). */}
            {!FINANCEIRO_SOMENTE_REAL && (
            <div className="flex rounded-lg border border-violet-200 overflow-hidden"
              title="Efetivo = dívida/receita real. Projeção = forecast do cronograma e folha.">
              {NAT_OPTS.map(({ v, label }) => (
                <button key={v} onClick={() => setNatureza(v)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors
                    ${natureza === v ? "bg-violet-600 text-white" : "bg-white text-violet-700 hover:bg-violet-50"}`}>
                  {label}
                </button>
              ))}
            </div>
            )}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
              <button onClick={() => setAno(a => a - 1)} className="text-slate-400 hover:text-slate-700 p-0.5">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold text-slate-800 w-10 text-center">{ano}</span>
              <button onClick={() => setAno(a => a + 1)} className="text-slate-400 hover:text-slate-700 p-0.5">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={refetch} disabled={isFetching} className="h-8 text-xs">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: "Receitas", v: totalRec,
              color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200",
              icon: <TrendingUp className="w-4 h-4 text-emerald-500" />,
              split: natureza === "todos" ? { efet: recEfetTotal, proj: recProjTotal } : null,
            },
            {
              label: "Despesas", v: totalDesp,
              color: "text-rose-700", bg: "bg-rose-50 border-rose-200",
              icon: <TrendingDown className="w-4 h-4 text-rose-500" />,
              split: natureza === "todos" ? { efet: despSplit.efet, proj: despSplit.proj } : null,
            },
            {
              label: "Resultado", v: totalRes,
              color: totalRes >= 0 ? "text-emerald-700" : "text-rose-700",
              bg: totalRes >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200",
              icon: totalRes >= 0
                ? <Wallet className="w-4 h-4 text-emerald-500" />
                : <TrendingDown className="w-4 h-4 text-rose-500" />,
              split: null,
            },
            {
              label: "Margem Líquida", v: null, pct: lucrAnual,
              color: lucrAnual >= 0 ? "text-emerald-700" : "text-rose-600",
              bg: "bg-slate-50 border-slate-200",
              icon: <Minus className="w-4 h-4 text-slate-400" />,
              split: null,
            },
          ].map(({ label, v, pct, color, bg, icon, split }) => (
            <div key={label} className={`rounded-xl border p-4 ${bg}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 font-medium">{label}</span>
                {icon}
              </div>
              <p className={`text-lg font-bold ${color}`}>
                {pct !== undefined ? PCT(pct ?? 0) : BRL(v ?? 0)}
              </p>
              {/* Rev. 2945 — split Efetivo × Projeção (só no escopo "Todos"): deixa
                  explícito quanto do total é forecast (Projeção, violeta) vs. real
                  (Efetivo, sólido). Resolve o "R$ X inflado por projeção". */}
              {split && (
                <div className="grid grid-cols-2 gap-1.5 mt-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-white/70 border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 flex-shrink-0" />
                    Efetivo <span className="font-semibold ml-auto">{BRL(split.efet)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] text-violet-700 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                    Projeção <span className="font-semibold ml-auto">{BRL(split.proj)}</span>
                  </span>
                </div>
              )}
              {label === "Despesas" && (
                <div className="flex gap-3 mt-1.5">
                  <span className="text-[10px] text-slate-500">Fixas: <span className="font-semibold">{BRL(totalFixas)}</span></span>
                  <span className="text-[10px] text-slate-500">Variáveis: <span className="font-semibold">{BRL(totalVar)}</span></span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Aviso sem dados ── */}
        {semDados && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <span>
              Nenhum lançamento encontrado para {ano}
              {natureza !== "todos" && <> no escopo <strong>{natureza === "efetivo" ? "Efetivo" : "Projeção"}</strong></>}.
              {natureza !== "todos" && <> Tente o escopo <button onClick={() => setNatureza("todos")} className="underline font-medium">Todos</button>.</>}
            </span>
          </div>
        )}

        {/* ── Legenda ── */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-400 select-none">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300" />
            mês atual destacado
          </span>
          <span>Receitas = lançamentos de Contas a Receber</span>
          <span>Despesas = lançamentos de Contas a Pagar</span>
          <span><strong>Efetivo</strong> = real · <strong>Projeção</strong> = forecast (cronograma/folha)</span>
          {temCheques && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300" />
              <strong>Cheques a compensar</strong> = caixa comprometido (informativo, já contado nas Saídas)
            </span>
          )}
        </div>

        {/* Rev. 4577 — falha na consulta de cheques NÃO derruba a tela; avisa inline. */}
        {chequesQ.isError && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span>Não foi possível carregar os cheques a compensar — a linha informativa está oculta.
              <button onClick={() => chequesQ.refetch()} className="underline font-medium ml-1">Tentar novamente</button>
            </span>
          </div>
        )}

        {/* ── Matriz ── */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="border-collapse text-xs bg-white"
            style={{ minWidth: LABEL_W + COL_W * 12 + TOT_W }}>
            <thead><HeaderRow /></thead>
            <tbody>

              {/* ══ ENTRADAS (RECEITAS) ══ */}
              <GroupRow
                label="↑  ENTRADAS (RECEITAS)"
                vals={recVals} total={totalRec}
                variant="receita" open={exReceit}
                onToggle={() => setExReceit(v => !v)}
              />
              {exReceit && receitaRows.map((r) => (
                <DetailRow key={r.label} label={r.label} vals={r.vals}
                  total={sum(r.vals)} variant="receita" muted={r.muted} />
              ))}

              <Separator />

              {/* ══ SAÍDAS (DESPESAS) ══ */}
              <GroupRow
                label="↓  SAÍDAS (DESPESAS)"
                vals={despVals} total={totalDesp}
                variant="despesa" open={exDesp}
                onToggle={() => setExDesp(v => !v)}
              />
              {exDesp && (
                <>
                  {/* Fixas */}
                  <SubGroupRow label="Despesas Fixas"
                    vals={fixasVals} total={sum(fixasVals)}
                    open={exFixas} onToggle={() => setExFixas(v => !v)} />
                  {exFixas && (
                    <>
                      <DetailRow label="Folha, Encargos, 13º, Férias & PJ"
                        vals={despBuckets.folha} total={sum(despBuckets.folha)} variant="despesa" />
                      <DetailRow label="Benefícios (VR / VA / Seguro)"
                        vals={despBuckets.beneficios} total={sum(despBuckets.beneficios)} variant="despesa" />
                      <DetailRow label="Tributos & Guias"
                        vals={despBuckets.tributos} total={sum(despBuckets.tributos)} variant="despesa" />
                      <DetailRow label="Serviços Recorrentes"
                        vals={despBuckets.recorrente} total={sum(despBuckets.recorrente)} variant="despesa" />
                    </>
                  )}
                  {/* Variáveis */}
                  <SubGroupRow label="Despesas Variáveis"
                    vals={varVals} total={sum(varVals)}
                    open={exVar} onToggle={() => setExVar(v => !v)} />
                  {exVar && (
                    <>
                      <DetailRow label="Compras / Materiais"
                        vals={despBuckets.compras} total={sum(despBuckets.compras)} variant="despesa" />
                      <DetailRow label="Frota (Abastecimento + Manutenção)"
                        vals={despBuckets.frota} total={sum(despBuckets.frota)} variant="despesa" />
                      <DetailRow label="Obras / Cronograma"
                        vals={despBuckets.obras} total={sum(despBuckets.obras)} variant="despesa" />
                      <DetailRow label="Terceiros / Parceiros"
                        vals={despBuckets.terceiros} total={sum(despBuckets.terceiros)} variant="despesa" />
                      <DetailRow label="Outros"
                        vals={despBuckets.outros} total={sum(despBuckets.outros)} variant="despesa" />
                    </>
                  )}
                </>
              )}

              {/* ══ Rev. 4577 — CHEQUES A COMPENSAR (float, informativo) ══
                  Caixa já COMPROMETIDO: a conta foi baixada como paga (obrigação
                  quitada), mas o débito só bate no extrato quando o cheque compensa.
                  NÃO soma nas Saídas (a despesa já está contada lá). */}
              {temCheques && (
                <tr className="h-9 bg-amber-50/70 border-b border-amber-200">
                  <td style={{ width: LABEL_W, minWidth: LABEL_W }}
                    className="sticky left-0 z-10 px-4 text-xs font-semibold text-amber-800 border-r border-amber-200 whitespace-nowrap bg-amber-50"
                    title="Cheques emitidos ainda não compensados (float). A despesa já está contada nas Saídas — esta linha mostra quando o dinheiro sai de fato do banco.">
                    ⚠ Cheques a compensar <span className="font-normal text-amber-600">(já contado · informativo)</span>
                  </td>
                  {chequesFloat.porMes.map((v, i) => (
                    <td key={i} style={{ width: COL_W, minWidth: COL_W }}
                      className={`text-right tabular-nums text-xs px-3 border-l border-amber-100 whitespace-nowrap
                        ${v ? "text-amber-800 font-semibold" : "text-amber-300"} ${isAtual(i) ? "ring-1 ring-inset ring-blue-400" : ""}`}
                      title={v ? `${chequesFloat.qtdPorMes[i]} cheque(s) pendente(s)` : undefined}>
                      {BRL(v)}
                    </td>
                  ))}
                  <td style={{ width: TOT_W, minWidth: TOT_W }}
                    className="text-right tabular-nums text-xs px-3 font-bold text-amber-900 border-l-2 border-amber-300 whitespace-nowrap bg-amber-100">
                    {BRL(chequesTotalAno)}
                  </td>
                </tr>
              )}

              <Separator />

              {/* ══ RESULTADO / SALDO / MARGEM ══ */}
              <ResultRow label="Resultado do Período"
                vals={resVals} total={totalRes} variant="resultado" />
              <ResultRow label="Saldo Acumulado"
                vals={acumVals} total={acumVals[11] ?? 0} variant="acumulado" />
              <ResultRow label="Margem Líquida %"
                vals={lucrVals} total={lucrAnual} variant="pct" />

            </tbody>
          </table>
        </div>

        {temCheques && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Cheques a compensar (float):</strong> {BRL(chequesTotalAno + chequesFloat.foraDoAno)} em cheques emitidos ainda
              pendentes de compensação. As contas correspondentes já foram baixadas como pagas (a obrigação com o fornecedor foi
              quitada na entrega do cheque) e já estão contadas nas Saídas — a linha em âmbar mostra apenas <em>quando</em> o
              dinheiro sai de fato do extrato bancário. Até lá, o saldo do banco está "inflado" por esse valor.
              {chequesFloat.foraDoAno > 0 && (
                <> Além disso, {BRL(chequesFloat.foraDoAno)} ({chequesFloat.qtdForaDoAno} cheque(s)) têm vencimento fora de {ano} ou sem data.</>
              )}
            </span>
          </div>
        )}

        {saldoInicialTotal !== 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            O Saldo Acumulado parte do saldo inicial das contas bancárias
            (R$ {saldoInicialTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}),
            informado no cadastro de Contas Bancárias, para conciliar com o extrato real.
          </p>
        )}

      </div>
    </DashboardLayout>
  );
}
