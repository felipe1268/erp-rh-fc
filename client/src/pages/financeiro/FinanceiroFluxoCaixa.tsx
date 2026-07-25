import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  RefreshCw, TrendingUp, TrendingDown, AlertCircle, Wallet,
  ArrowDownCircle, ArrowUpCircle, PiggyBank, Lightbulb, HelpCircle,
  AlertTriangle, CheckCircle2, Landmark,
} from "lucide-react";
import { isProjecaoOrigem, FINANCEIRO_SOMENTE_REAL } from "@shared/financeiroProjecao";

// ─── Formatadores ─────────────────────────────────────────────────────────────

const MESES_ABR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function BRL(v: number): string {
  if (!v) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function BRL0(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
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
  folha_rh: "folha", folha_clt: "folha", folha: "folha",
  payroll_agregado: "folha", fechamento_ponto: "folha",
  folha_projetada: "folha", encargos_projetado: "folha",
  decimo_terceiro_projetado: "folha", ferias_projetada: "folha",
  rescisao_projetada: "folha",
  pj: "folha", pagamento_pj: "folha", pj_projetado: "folha",
  pro_labore: "folha", medicao_pj: "folha",
  beneficio_vr: "beneficios", beneficio_va: "beneficios",
  beneficio_vr_projetado: "beneficios", beneficio_va_projetado: "beneficios",
  seguro_vida: "beneficios", vale_transporte: "beneficios",
  guia_tributaria: "tributos",
  recorrente: "recorrente",
  compras: "compras", compra_oc: "compras", ordem_compra: "compras",
  almoxarifado_saida: "compras", planejamento_compra: "compras",
  frota: "frota", frotas: "frota",
  frota_manutencao: "frota", frota_abastecimento: "frota",
  cronograma_atividade: "obras", medicao_obra: "obras",
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

const LABEL_W = 250;  // px — coluna de rótulo
const COL_W   = 128;  // px — coluna de mês
const TOT_W   = 142;  // px — coluna Total

type Natureza = "todos" | "efetivo" | "projecao";

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function FinanceiroFluxoCaixa() {
  const { companyId } = useCompany();
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;

  const [ano, setAno]           = useState(hoje.getFullYear());
  const [natureza, setNatureza] = useState<Natureza>(FINANCEIRO_SOMENTE_REAL ? "efetivo" : "todos");
  const [exReceit, setExReceit] = useState(true);
  const [exDesp, setExDesp]     = useState(true);
  const [exFixas, setExFixas]   = useState(true);
  const [exVar, setExVar]       = useState(true);
  // Rev. 4578 — guia de leitura p/ iniciante (colapsável; começa fechado).
  const [guiaAberto, setGuiaAberto] = useState(false);

  // Rev. 2944 — Compõe os 2 endpoints já confiáveis dos módulos irmãos (paridade 1:1
  // com Contas a Receber / Contas a Pagar, por construção).
  const receberQ = (trpc as any).financial.getContasAReceberByYear.useQuery(
    { companyId, ano }, { enabled: !!companyId }
  );
  const pagarQ = (trpc as any).financial.getContasAPagarByYear.useQuery(
    { companyId, ano }, { enabled: !!companyId }
  );
  const contasQ = (trpc as any).folha.listarContasBancarias.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  // Rev. 4577 — "Cheques a compensar" (float): INFORMATIVO, não soma nas Saídas.
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
  // falha na linha informativa não pode derrubar o Fluxo de Caixa inteiro.
  const isFetching = receberQ.isFetching || pagarQ.isFetching || chequesQ.isFetching;
  const isError    = receberQ.isError || pagarQ.isError;
  const refetch = () => { receberQ.refetch(); pagarQ.refetch(); chequesQ.refetch(); };

  const meses12 = useMemo(
    () => Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`),
    [ano]
  );

  // ── ENTRADAS — espelha Contas a Receber ──────────────────────────────────────
  const { recTodos, recEfet, recProj, recReal } = useMemo(() => {
    const rows: any[] = receberQ.data ?? [];
    const recebido = new Set(["recebido", "recebido_total", "recebido_parcial", "pago"]);
    const efet = Array(12).fill(0);
    const proj = Array(12).fill(0);
    const real = Array(12).fill(0);
    for (const c of rows) {
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

  // ── SAÍDAS — espelha Contas a Pagar ─────────────────────────────────────────
  const despBuckets = useMemo(() => {
    const rows: any[] = pagarQ.data ?? [];
    const buckets = Object.fromEntries(
      ALL_BUCKETS.map(b => [b, Array(12).fill(0)])
    ) as Record<DespBucket, number[]>;
    for (const c of rows) {
      const proj = isProjecaoDespesa(c.origemModulo);
      if (natureza === "efetivo" && proj) continue;
      if (natureza === "projecao" && !proj) continue;
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

  // ── ESTRUTURA DA LITERATURA (Rev. 4578) ─────────────────────────────────────
  // Saldo Inicial do mês → (+) Entradas → (−) Saídas → (=) Geração de Caixa →
  // (=) Saldo Final do mês. O Saldo Inicial de Janeiro é o saldo de abertura
  // das contas bancárias (cadastro); o Saldo Final de um mês é o Inicial do próximo.
  const resVals = meses12.map((_, i) => recVals[i] - despVals[i]);   // geração de caixa
  const saldoIniMes: number[] = [];
  const saldoFimMes: number[] = [];
  {
    let acc = saldoInicialTotal;
    for (let i = 0; i < 12; i++) {
      saldoIniMes.push(acc);
      acc += resVals[i];
      saldoFimMes.push(acc);
    }
  }
  const lucrVals = meses12.map((_, i) => recVals[i] > 0 ? (resVals[i] / recVals[i]) * 100 : 0);

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const totalRec   = sum(recVals);
  const totalDesp  = sum(despVals);
  const totalRes   = totalRec - totalDesp;
  const totalFixas = sum(fixasVals);
  const totalVar   = sum(varVals);
  const lucrAnual  = totalRec > 0 ? (totalRes / totalRec) * 100 : 0;
  const semDados   = totalRec === 0 && totalDesp === 0;
  const saldoFinalAno = saldoFimMes[11] ?? saldoInicialTotal;

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

  // ── INSIGHTS AUTOMÁTICOS (Rev. 4578 — determinísticos, sem IA) ──────────────
  // Poka-Yoke nível 1 (aviso): a tela é de leitura, então o "à prova de erro" aqui
  // é impedir a LEITURA errada — alertas claros sobre meses no vermelho, peso de
  // fixas, float de cheques e diferença entre previsto × já recebido.
  const insights = useMemo(() => {
    const list: { tipo: "alerta" | "atencao" | "ok" | "info"; titulo: string; texto: string }[] = [];
    const mesesComMovimento = meses12
      .map((_, i) => i)
      .filter(i => recVals[i] > 0 || despVals[i] > 0);
    if (mesesComMovimento.length === 0) return list;

    // 1) Saldo final do ano
    if (saldoFinalAno < 0) {
      list.push({
        tipo: "alerta", titulo: "Caixa termina o ano no vermelho",
        texto: `Se tudo se confirmar, o caixa fecha ${ano} em ${BRL0(saldoFinalAno)}. Isso significa que as saídas previstas superam as entradas + o saldo inicial. É preciso antecipar recebimentos, renegociar prazos de pagamento ou buscar reforço de caixa.`,
      });
    } else {
      list.push({
        tipo: "ok", titulo: "Caixa termina o ano no azul",
        texto: `Projeção de fechar ${ano} com ${BRL0(saldoFinalAno)} em caixa (saldo inicial ${BRL0(saldoInicialTotal)} + geração de ${BRL0(totalRes)}).`,
      });
    }

    // 2) Meses com saldo final negativo (quando o dinheiro "falta" no meio do caminho)
    const mesesVermelho = mesesComMovimento.filter(i => saldoFimMes[i] < 0);
    if (mesesVermelho.length > 0) {
      const nomes = mesesVermelho.slice(0, 4).map(i => MESES_ABR[i]).join(", ");
      list.push({
        tipo: "alerta", titulo: `${mesesVermelho.length} mês(es) com caixa negativo`,
        texto: `Em ${nomes}${mesesVermelho.length > 4 ? "…" : ""} o saldo final fica abaixo de zero — mesmo que o ano feche bem, nesses meses faltaria dinheiro. É o famoso "descasamento de prazos": pagamentos vencem antes dos recebimentos.`,
      });
    }

    // 3) Pior e melhor mês de geração de caixa
    let piorI = mesesComMovimento[0], melhorI = mesesComMovimento[0];
    for (const i of mesesComMovimento) {
      if (resVals[i] < resVals[piorI]) piorI = i;
      if (resVals[i] > resVals[melhorI]) melhorI = i;
    }
    if (resVals[piorI] < 0) {
      list.push({
        tipo: "atencao", titulo: `${MESES_FULL[piorI]} é o mês mais apertado`,
        texto: `Nesse mês saem ${BRL0(despVals[piorI])} e entram ${BRL0(recVals[piorI])} — queima de ${BRL0(Math.abs(resVals[piorI]))}. Vale conferir o que dá para remanejar de/para os meses vizinhos.`,
      });
    }
    if (resVals[melhorI] > 0) {
      list.push({
        tipo: "info", titulo: `${MESES_FULL[melhorI]} é o mês mais folgado`,
        texto: `Melhor geração de caixa do ano: ${BRL0(resVals[melhorI])}. Meses assim são a hora de formar reserva para os meses apertados.`,
      });
    }

    // 4) Peso das despesas fixas
    if (totalDesp > 0) {
      const pctFixas = (totalFixas / totalDesp) * 100;
      if (pctFixas >= 50) {
        list.push({
          tipo: "atencao", titulo: `Fixas são ${pctFixas.toFixed(0)}% das saídas`,
          texto: `${BRL0(totalFixas)} saem todo ano independentemente de obra (folha, benefícios, tributos, recorrentes). Quanto maior esse peso, menos flexível o caixa em meses fracos.`,
        });
      }
    }

    // 5) Float de cheques
    if (temCheques) {
      list.push({
        tipo: "atencao", titulo: "O extrato do banco está \"inflado\"",
        texto: `${BRL0(chequesTotalAno + chequesFloat.foraDoAno)} em cheques emitidos ainda não compensaram. Esse dinheiro parece estar no banco, mas já tem dono — não conte com ele para novas decisões.`,
      });
    }

    // 6) Previsto × já recebido (só no escopo efetivo/todos)
    if (natureza !== "projecao") {
      const previstoAteAgora = meses12.reduce((s, _, i) =>
        (ano < hoje.getFullYear() || i + 1 <= mesAtual) ? s + recEfet[i] : s, 0);
      const recebidoAteAgora = meses12.reduce((s, _, i) =>
        (ano < hoje.getFullYear() || i + 1 <= mesAtual) ? s + recReal[i] : s, 0);
      const gap = previstoAteAgora - recebidoAteAgora;
      if (previstoAteAgora > 0 && gap > previstoAteAgora * 0.1) {
        list.push({
          tipo: "atencao", titulo: "Tem recebimento previsto que ainda não caiu",
          texto: `Até agora eram esperados ${BRL0(previstoAteAgora)}, mas só ${BRL0(recebidoAteAgora)} entraram de fato (${BRL0(gap)} em aberto). Cobrança em dia é a forma mais barata de melhorar o caixa.`,
        });
      }
    }

    return list;
  }, [meses12, recVals, despVals, resVals, saldoFimMes, saldoFinalAno, saldoInicialTotal,
      totalRes, totalDesp, totalFixas, temCheques, chequesTotalAno, chequesFloat,
      natureza, recEfet, recReal, ano, mesAtual, hoje]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function isAtual(colIdx: number) {
    return colIdx + 1 === mesAtual && ano === hoje.getFullYear();
  }

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
          O que aconteceu com o dinheiro
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

  function GroupRow({ label, hint, vals, total, variant, open, onToggle }: {
    label: string; hint?: string; vals: number[]; total: number;
    variant: "receita" | "despesa"; open: boolean; onToggle: () => void;
  }) {
    const isRec = variant === "receita";
    const bg    = isRec ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900";
    const cellC = isRec ? "text-emerald-800" : "text-rose-800";
    const totBg = isRec ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900";
    const brd   = isRec ? "border-emerald-100" : "border-rose-100";
    return (
      <tr className={`h-11 border-b ${brd}`}>
        <td style={{ width: LABEL_W, minWidth: LABEL_W }}
          className={`sticky left-0 z-10 px-4 text-xs font-bold border-r ${brd} whitespace-nowrap ${bg}`}>
          <button onClick={onToggle} className="flex items-center gap-2 w-full text-left">
            {open ? <ChevronUp className="w-3.5 h-3.5 opacity-60 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />}
            <span>
              {label}
              {hint && <span className="block text-[10px] font-normal opacity-70">{hint}</span>}
            </span>
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

  function SubGroupRow({ label, hint, vals, total, open, onToggle }: {
    label: string; hint?: string; vals: number[]; total: number; open: boolean; onToggle: () => void;
  }) {
    return (
      <tr className="h-10 bg-slate-50 border-b border-slate-200">
        <td style={{ width: LABEL_W, minWidth: LABEL_W }}
          className="sticky left-0 z-10 px-4 pl-6 text-xs font-semibold text-slate-600 border-r border-slate-200 whitespace-nowrap bg-slate-50">
          <button onClick={onToggle} className="flex items-center gap-2 w-full text-left">
            {open ? <ChevronUp className="w-3 h-3 opacity-50 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 opacity-50 flex-shrink-0" />}
            <span>
              {label}
              {hint && <span className="block text-[10px] font-normal text-slate-400">{hint}</span>}
            </span>
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

  // Rev. 4578 — linha de saldo (Inicial/Final do mês), estilo "extrato".
  function SaldoRow({ label, hint, vals, total, dark = false }: {
    label: string; hint?: string; vals: number[]; total: number; dark?: boolean;
  }) {
    const rowBg = dark ? "bg-slate-800" : "bg-slate-100";
    const lblC  = dark ? "text-slate-100" : "text-slate-600";
    return (
      <tr className={`h-11 border-b ${dark ? "border-slate-600" : "border-slate-200"}`}>
        <td style={{ width: LABEL_W, minWidth: LABEL_W }}
          className={`sticky left-0 z-10 px-4 text-xs font-bold border-r whitespace-nowrap ${rowBg} ${lblC} ${dark ? "border-slate-600" : "border-slate-300"}`}>
          {label}
          {hint && <span className={`block text-[10px] font-normal ${dark ? "text-slate-400" : "text-slate-400"}`}>{hint}</span>}
        </td>
        {vals.map((v, i) => (
          <td key={i} style={{ width: COL_W, minWidth: COL_W }}
            className={`text-right tabular-nums text-xs px-3 font-semibold whitespace-nowrap border-l
              ${dark
                ? `${rowBg} border-slate-700 ${v > 0 ? "text-emerald-300" : v < 0 ? "text-rose-300" : "text-slate-500"}`
                : `${rowBg} border-slate-200 ${v > 0 ? "text-emerald-700" : v < 0 ? "text-rose-600" : "text-slate-400"}`}
              ${isAtual(i) ? "ring-1 ring-inset ring-blue-400" : ""}`}
            title={v < 0 ? "Saldo negativo: neste ponto faltaria dinheiro em caixa" : undefined}>
            {BRL0(v)}{v < 0 && dark ? " ⚠" : ""}
          </td>
        ))}
        <td style={{ width: TOT_W, minWidth: TOT_W }}
          className={`text-right tabular-nums text-xs px-3 font-bold border-l-2 whitespace-nowrap
            ${dark ? "bg-slate-700 border-slate-500" : "bg-slate-200 border-slate-300"}
            ${total >= 0 ? (dark ? "text-emerald-300" : "text-emerald-700") : (dark ? "text-rose-300" : "text-rose-600")}`}>
          {BRL0(total)}
        </td>
      </tr>
    );
  }

  function ResultRow({ label, hint, vals, total, variant }: {
    label: string; hint?: string; vals: number[]; total: number; variant: CellVariant;
  }) {
    const isPct = variant === "pct";
    return (
      <tr className="h-11 border-b border-slate-300">
        <td style={{ width: LABEL_W, minWidth: LABEL_W }}
          className="sticky left-0 z-10 px-4 text-xs font-bold border-r border-slate-600 whitespace-nowrap bg-slate-800 text-slate-100">
          {label}
          {hint && <span className="block text-[10px] font-normal text-slate-400">{hint}</span>}
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

  const INSIGHT_STYLE: Record<string, { bg: string; icon: JSX.Element }> = {
    alerta:  { bg: "bg-rose-50 border-rose-200 text-rose-900",       icon: <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" /> },
    atencao: { bg: "bg-amber-50 border-amber-200 text-amber-900",    icon: <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" /> },
    ok:      { bg: "bg-emerald-50 border-emerald-200 text-emerald-900", icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /> },
    info:    { bg: "bg-blue-50 border-blue-200 text-blue-900",       icon: <Lightbulb className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" /> },
  };

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
              Regime de caixa: Saldo Inicial + Entradas − Saídas = Saldo Final · espelha Contas a Receber e Contas a Pagar · {ano}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setGuiaAberto(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors
                ${guiaAberto ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-700 border-blue-200 hover:bg-blue-50"}`}>
              <HelpCircle className="w-3.5 h-3.5" /> Como ler?
            </button>
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

        {/* ── Guia de leitura (Rev. 4578 — didático p/ iniciante) ── */}
        {guiaAberto && (
          <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 space-y-3 text-xs text-slate-700">
            <p className="font-bold text-blue-900 text-sm flex items-center gap-2">
              <HelpCircle className="w-4 h-4" /> Como ler este Fluxo de Caixa (guia rápido)
            </p>
            <div className="grid md:grid-cols-2 gap-x-6 gap-y-2">
              <p><strong>1. A conta é sempre a mesma:</strong> Saldo Inicial do mês <strong>+ o que entra − o que sai = Saldo Final</strong>. O Saldo Final de um mês vira o Saldo Inicial do mês seguinte — como no seu extrato pessoal.</p>
              <p><strong>2. Entradas</strong> (verde) = dinheiro que entra: recebimentos de clientes (Contas a Receber). <strong>Saídas</strong> (vermelho) = dinheiro que sai: pagamentos (Contas a Pagar).</p>
              <p><strong>3. Fixas × Variáveis:</strong> despesas <em>fixas</em> (folha, benefícios, tributos, recorrentes) acontecem todo mês, com ou sem obra. As <em>variáveis</em> (compras, frota, obras, terceiros) acompanham o ritmo da operação.</p>
              <p><strong>4. Geração de Caixa</strong> = Entradas − Saídas do mês. Positiva = o mês "produziu" dinheiro; negativa = o mês "queimou" dinheiro (e o saldo cai).</p>
              <p><strong>5. Efetivo × Projeção:</strong> Efetivo = títulos reais já lançados. Projeção = previsão automática (cronograma de obras, folha futura). A visão "Todos" soma as duas.</p>
              <p><strong>6. Cheques a compensar (âmbar):</strong> pago ≠ liquidado. A conta já foi quitada na entrega do cheque (por isso já está nas Saídas), mas o dinheiro só sai do banco quando o cheque compensa. A linha âmbar mostra <em>quando</em> isso acontece — ela <strong>não soma de novo</strong>, é só informação.</p>
            </div>
          </div>
        )}

        {/* ── KPIs — a história do ano em 5 cartões, na ordem da literatura ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* 1. Saldo inicial */}
          <div className="rounded-xl border p-4 bg-slate-50 border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 font-medium">1 · Começou com</span>
              <Landmark className="w-4 h-4 text-slate-400" />
            </div>
            <p className={`text-lg font-bold ${saldoInicialTotal >= 0 ? "text-slate-800" : "text-rose-700"}`}>{BRL0(saldoInicialTotal)}</p>
            <p className="text-[10px] text-slate-400 mt-1">Saldo de abertura das contas bancárias</p>
          </div>
          {/* 2. Entradas */}
          <div className="rounded-xl border p-4 bg-emerald-50 border-emerald-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 font-medium">2 · Entrou (+)</span>
              <ArrowUpCircle className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-lg font-bold text-emerald-700">{BRL0(totalRec)}</p>
            <p className="text-[10px] text-slate-500 mt-1">Recebimentos de clientes no ano</p>
            {natureza === "todos" && (
              <p className="text-[10px] text-slate-500 mt-0.5">
                Real: <span className="font-semibold">{BRL0(recEfetTotal)}</span> · Previsto: <span className="font-semibold text-violet-700">{BRL0(recProjTotal)}</span>
              </p>
            )}
          </div>
          {/* 3. Saídas */}
          <div className="rounded-xl border p-4 bg-rose-50 border-rose-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 font-medium">3 · Saiu (−)</span>
              <ArrowDownCircle className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-lg font-bold text-rose-700">{BRL0(totalDesp)}</p>
            <p className="text-[10px] text-slate-500 mt-1">
              Fixas: <span className="font-semibold">{BRL0(totalFixas)}</span> · Variáveis: <span className="font-semibold">{BRL0(totalVar)}</span>
            </p>
            {natureza === "todos" && (
              <p className="text-[10px] text-slate-500 mt-0.5">
                Real: <span className="font-semibold">{BRL0(despSplit.efet)}</span> · Previsto: <span className="font-semibold text-violet-700">{BRL0(despSplit.proj)}</span>
              </p>
            )}
          </div>
          {/* 4. Geração de caixa */}
          <div className={`rounded-xl border p-4 ${totalRes >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 font-medium">4 · Geração de Caixa (=)</span>
              {totalRes >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <TrendingDown className="w-4 h-4 text-rose-500" />}
            </div>
            <p className={`text-lg font-bold ${totalRes >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{BRL0(totalRes)}</p>
            <p className="text-[10px] text-slate-500 mt-1">
              Entradas − Saídas · Margem: <span className={`font-semibold ${lucrAnual >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{PCT(lucrAnual)}</span>
            </p>
          </div>
          {/* 5. Saldo final */}
          <div className={`rounded-xl border p-4 ${saldoFinalAno >= 0 ? "bg-slate-50 border-slate-200" : "bg-rose-50 border-rose-300"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 font-medium">5 · Termina com</span>
              <PiggyBank className={`w-4 h-4 ${saldoFinalAno >= 0 ? "text-slate-400" : "text-rose-500"}`} />
            </div>
            <p className={`text-lg font-bold ${saldoFinalAno >= 0 ? "text-slate-800" : "text-rose-700"}`}>{BRL0(saldoFinalAno)}</p>
            <p className="text-[10px] text-slate-400 mt-1">Saldo projetado p/ 31/Dez/{ano}</p>
            {temCheques && (
              <p className="text-[10px] text-amber-700 mt-0.5" title="Cheques emitidos ainda não compensados — já contados nas Saídas.">
                + {BRL0(chequesTotalAno + chequesFloat.foraDoAno)} "presos" em cheques no banco
              </p>
            )}
          </div>
        </div>

        {/* ── Insights automáticos (determinísticos) ── */}
        {insights.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" /> O que estes números estão dizendo
            </p>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {insights.map((ins, idx) => {
                const st = INSIGHT_STYLE[ins.tipo];
                return (
                  <div key={idx} className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs ${st.bg}`}>
                    {st.icon}
                    <div className="min-w-0">
                      <p className="font-bold break-words">{ins.titulo}</p>
                      <p className="mt-0.5 opacity-80 break-words">{ins.texto}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Aviso sem dados ── */}
        {semDados && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <span>
              Nenhum lançamento encontrado para {ano}
              {natureza !== "todos" && <> no escopo <strong>{natureza === "efetivo" ? "Efetivo" : "Projeção"}</strong></>}.
              {natureza !== "todos" && !FINANCEIRO_SOMENTE_REAL && <> Tente o escopo <button onClick={() => setNatureza("todos")} className="underline font-medium">Todos</button>.</>}
            </span>
          </div>
        )}

        {/* ── Legenda ── */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-400 select-none">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300" />
            mês atual destacado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-300" />
            Entradas = Contas a Receber
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-100 border border-rose-300" />
            Saídas = Contas a Pagar
          </span>
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

        {/* ── Matriz na ordem da literatura ── */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="border-collapse text-xs bg-white"
            style={{ minWidth: LABEL_W + COL_W * 12 + TOT_W }}>
            <thead><HeaderRow /></thead>
            <tbody>

              {/* ══ 1. SALDO INICIAL DO MÊS ══ */}
              <SaldoRow label="Saldo Inicial do Mês"
                hint="com quanto o mês começa (= saldo final do mês anterior)"
                vals={saldoIniMes} total={saldoInicialTotal} />

              <Separator />

              {/* ══ 2. ENTRADAS ══ */}
              <GroupRow
                label="(+) ENTRADAS"
                hint="dinheiro que entra: recebimentos de clientes"
                vals={recVals} total={totalRec}
                variant="receita" open={exReceit}
                onToggle={() => setExReceit(v => !v)}
              />
              {exReceit && receitaRows.map((r) => (
                <DetailRow key={r.label} label={r.label} vals={r.vals}
                  total={sum(r.vals)} variant="receita" muted={r.muted} />
              ))}

              <Separator />

              {/* ══ 3. SAÍDAS ══ */}
              <GroupRow
                label="(−) SAÍDAS"
                hint="dinheiro que sai: pagamentos a fornecedores, folha, tributos…"
                vals={despVals} total={totalDesp}
                variant="despesa" open={exDesp}
                onToggle={() => setExDesp(v => !v)}
              />
              {exDesp && (
                <>
                  <SubGroupRow label="Despesas Fixas"
                    hint="acontecem todo mês, com ou sem obra"
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
                  <SubGroupRow label="Despesas Variáveis"
                    hint="acompanham o ritmo das obras"
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

              <Separator />

              {/* ══ 4. GERAÇÃO DE CAIXA ══ */}
              <ResultRow label="(=) Geração de Caixa do Mês"
                hint="Entradas − Saídas: o mês produziu ou queimou dinheiro?"
                vals={resVals} total={totalRes} variant="resultado" />

              {/* ══ 5. SALDO FINAL DO MÊS ══ */}
              <SaldoRow label="(=) Saldo Final do Mês" dark
                hint="Saldo Inicial + Geração de Caixa · vira o Inicial do mês seguinte"
                vals={saldoFimMes} total={saldoFinalAno} />

              <ResultRow label="Margem de Caixa %"
                hint="quanto de cada R$ recebido sobra no mês"
                vals={lucrVals} total={lucrAnual} variant="pct" />

              {/* ══ Rev. 4577 — CHEQUES A COMPENSAR (float, informativo) ══ */}
              {temCheques && (
                <tr className="h-10 bg-amber-50/70 border-b border-amber-200">
                  <td style={{ width: LABEL_W, minWidth: LABEL_W }}
                    className="sticky left-0 z-10 px-4 text-xs font-semibold text-amber-800 border-r border-amber-200 whitespace-nowrap bg-amber-50"
                    title="Cheques emitidos ainda não compensados (float). A despesa já está contada nas Saídas — esta linha mostra quando o dinheiro sai de fato do banco.">
                    ⚠ Cheques a compensar
                    <span className="block text-[10px] font-normal text-amber-600">informativo · já contado nas Saídas</span>
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

            </tbody>
          </table>
        </div>

        {/* ── Notas de rodapé ── */}
        {temCheques && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Cheques a compensar (float):</strong> {BRL0(chequesTotalAno + chequesFloat.foraDoAno)} em cheques emitidos ainda
              pendentes de compensação. As contas correspondentes já foram baixadas como pagas (a obrigação com o fornecedor foi
              quitada na entrega do cheque) e já estão contadas nas Saídas — a linha em âmbar mostra apenas <em>quando</em> o
              dinheiro sai de fato do extrato bancário. Até lá, o saldo do banco está "inflado" por esse valor.
              {chequesFloat.foraDoAno > 0 && (
                <> Além disso, {BRL0(chequesFloat.foraDoAno)} ({chequesFloat.qtdForaDoAno} cheque(s)) têm vencimento fora de {ano} ou sem data.</>
              )}
            </span>
          </div>
        )}

        {saldoInicialTotal !== 0 && (
          <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
            <Wallet className="w-3.5 h-3.5 mt-px flex-shrink-0 text-slate-400" />
            <span>
              O Saldo Inicial de Janeiro ({BRL0(saldoInicialTotal)}) vem do saldo de abertura informado no cadastro de
              Contas Bancárias, para o fluxo conciliar com o extrato real.
            </span>
          </p>
        )}

      </div>
    </DashboardLayout>
  );
}
