import { useState, useEffect } from "react";
import { parseAsUTC } from "@/lib/dateUtils";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import {
  BarChart2, TrendingUp, TrendingDown, RefreshCw, ChevronLeft, ChevronRight,
  CalendarDays, Sparkles, Info, BookOpen, ExternalLink, AlertTriangle,
  Lightbulb, Activity, ArrowUpRight, ArrowDownRight, Minus, ShieldCheck,
  ChevronRight as ChevronRightIcon, Layers, ListTree, Calculator, Percent,
  ArrowLeft, Receipt, CheckCircle2, XCircle, Building2, Scale,
} from "lucide-react";

type DRELinhaKey =
  | "receitaBruta" | "receitasFinanceiras" | "custosObra" | "impostos"
  | "despesasFinanceiras" | "despesasFixas" | "despesasVariaveis";

interface ComposicaoItem { label: string; contrib: number; }
type DrillState =
  | { kind: "leaf"; linha: DRELinhaKey; label: string; negativo: boolean }
  | { kind: "composicao"; label: string; value: number; itens: ComposicaoItem[] }
  | { kind: "ratio"; label: string; num: number; numLabel: string; den: number; denLabel: string; valuePct: number }
  | { kind: "info"; label: string; texto: string };

const NAVY = "#1B2A4A";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function formatPct(v: number) {
  return `${(v ?? 0).toFixed(2)}%`;
}
// Cor da NOTA (0-100) por faixa: crítica (vermelho) → atenção (âmbar) →
// boa (azul) → excelente (verde). Espelha a escala de 'saude'.
function notaCor(n: number): string {
  if (n >= 85) return "#059669"; // emerald-600
  if (n >= 60) return "#2563eb"; // blue-600
  if (n >= 40) return "#d97706"; // amber-600
  return "#dc2626"; // red-600
}

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type MesStatus = "sem_dados" | "lancamento" | "consolidado";

interface DRERow {
  label: string;
  value: number;
  indent?: number;
  isSeparator?: boolean;
  isTotal?: boolean;
  isNegative?: boolean;
  percentOf?: number;
  highlight?: "green" | "red" | "blue";
  info?: string;
  exemplos?: { entra: string[]; naoEntra: string[] };
  drill?: DrillState;
}

type Sel =
  | { tipo: "mensal"; mes: number }
  | { tipo: "trimestral"; tri: number }
  | { tipo: "semestral"; sem: number }
  | { tipo: "anual" };

interface Fonte {
  id: string;
  titulo: string;
  autor: string;
  tipo: string;
  url: string;
  nota: string;
}

// Chip clicável que abre a ficha completa da fonte (autor, tipo, nota, link).
function FonteChip({ fonte }: { fonte?: Fonte }) {
  if (!fonte) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 rounded-full border border-[#1B2A4A]/15 bg-[#1B2A4A]/[0.04] px-2 py-0.5 text-[11px] font-medium text-[#1B2A4A] hover:bg-[#1B2A4A]/10 transition-colors">
          <BookOpen className="w-3 h-3 text-orange-500" />
          <span className="max-w-[140px] truncate">{fonte.autor}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 overflow-hidden" align="start">
        <div className="bg-[#1B2A4A] px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <BookOpen className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-300">{fonte.tipo}</span>
          </div>
          <p className="text-sm font-bold text-white leading-snug">{fonte.titulo}</p>
          <p className="text-xs text-white/70 mt-0.5">{fonte.autor}</p>
        </div>
        <div className="p-4">
          <p className="text-xs text-gray-600 leading-relaxed">{fonte.nota}</p>
          <a
            href={fonte.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Abrir fonte
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FonteChips({ ids, map }: { ids: string[]; map: Record<string, Fonte> }) {
  if (!ids?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {ids.map((id) => <FonteChip key={id} fonte={map[id]} />)}
    </div>
  );
}

export default function FinanceiroDRE() {
  const { companyId } = useCompany();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [sel, setSel] = useState<Sel>({ tipo: "mensal", mes: hoje.getMonth() + 1 });

  const tipoPeriodo: "mensal" | "trimestral" | "semestral" | "anual" = sel.tipo;
  const periodo =
    sel.tipo === "anual" ? `${ano}` :
    sel.tipo === "mensal" ? `${ano}-${String(sel.mes).padStart(2, "0")}` :
    sel.tipo === "trimestral" ? `${ano}-${String((sel.tri - 1) * 3 + 1).padStart(2, "0")}` :
    `${ano}-${sel.sem === 1 ? "01" : "07"}`;

  const tituloPeriodo =
    sel.tipo === "anual" ? `${ano} (ano inteiro)` :
    sel.tipo === "mensal" ? `${MESES_PT[sel.mes - 1]}/${ano}` :
    sel.tipo === "trimestral" ? `${sel.tri}º Trimestre/${ano}` :
    `${sel.sem}º Semestre/${ano}`;

  const chipCls = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
      active
        ? "border-orange-500 bg-orange-50 text-orange-700 shadow-sm"
        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
    }`;

  const { data: disp } = (trpc as any).financial.getDREDisponibilidade.useQuery(
    { companyId, ano: `${ano}` },
    { enabled: !!companyId }
  );

  const mesesStatus: Record<number, MesStatus> = {};
  for (let m = 1; m <= 12; m++) {
    const info = disp?.meses?.[m] ?? disp?.meses?.[String(m)];
    const total = Number(info?.n ?? 0);
    const realizado = Number(info?.nRealizado ?? 0);
    mesesStatus[m] = total === 0 ? "sem_dados" : (realizado >= total ? "consolidado" : "lancamento");
  }

  const { data: dre, isLoading, refetch } = (trpc as any).financial.getDRE.useQuery(
    { companyId, periodo, tipoPeriodo },
    { enabled: !!companyId }
  );

  // Análise de IA — sob demanda (botão), por ser uma chamada cara ao modelo.
  // A última análise fica SALVA por período (Rev. 2850): ao abrir a tela ou
  // trocar de período, lemos a versão persistida; o botão regenera/atualiza.
  const analiseMut = (trpc as any).financial.analiseDRE.useMutation();
  const { data: analiseSalva, refetch: refetchSalva } = (trpc as any).financial.getAnaliseDRESalva.useQuery(
    { companyId, periodo, tipoPeriodo },
    { enabled: !!companyId }
  );

  // Rev. 3952 — comparação DRE × saldo bancário para card explicativo
  const { data: bankComp } = (trpc as any).financial.getDREBankComparison.useQuery(
    { companyId, periodo, tipoPeriodo },
    { enabled: !!companyId }
  );
  // Prioriza o resultado recém-gerado SÓ se for do período atualmente
  // selecionado (mutation.data persiste entre renders; ao trocar de período
  // sem refazer, deve cair para a análise SALVA do novo período).
  const mutVars: any = (analiseMut as any).variables;
  const mutMatchesPeriodo = !!analiseMut.data
    && mutVars?.periodo === periodo
    && mutVars?.tipoPeriodo === tipoPeriodo;
  const analise = mutMatchesPeriodo ? analiseMut.data : (analiseSalva ?? undefined);
  const analiseSalvaEm: string | undefined = (analise as any)?.geradoEm;
  const nota: number | null = analise && typeof (analise as any).nota === "number"
    ? Math.max(0, Math.min(100, Math.round((analise as any).nota)))
    : null;
  const fontesMap: Record<string, Fonte> = {};
  (analise?.fontes ?? []).forEach((f: Fonte) => { fontesMap[f.id] = f; });
  const analiseDesatualizada = analise && analise.periodo !== (dre?.periodo ?? periodo);

  const gerarAnalise = () =>
    analiseMut.mutate({ companyId, periodo, tipoPeriodo }, {
      onSuccess: () => { refetchSalva(); },
    });

  // Rev. 2863 — barra de progresso 0→100% da Análise IA. O backend não faz
  // streaming, então animamos uma curva que sobe e desacelera perto de ~95%
  // enquanto a IA processa, completando para 100% ao concluir.
  const [iaProgresso, setIaProgresso] = useState(0);
  const [drill, setDrill] = useState<DrillState | null>(null);
  const IA_FASES = [
    { ate: 30, label: "Lendo os números do DRE" },
    { ate: 60, label: "Comparando com benchmarks do setor" },
    { ate: 85, label: "Calculando a nota de saúde financeira" },
    { ate: 101, label: "Redigindo o diagnóstico" },
  ];
  const iaFase = IA_FASES.find(f => iaProgresso < f.ate) ?? IA_FASES[IA_FASES.length - 1];

  // Sobe enquanto a IA está processando, desacelerando perto do teto (95%).
  useEffect(() => {
    if (!analiseMut.isPending) return;
    setIaProgresso(p => (p > 0 && p < 90 ? p : 5));
    const id = setInterval(() => {
      setIaProgresso(prev => {
        if (prev >= 95) return 95;
        const passo = prev < 50 ? 3.4 : prev < 80 ? 1.6 : 0.6;
        return Math.min(95, prev + passo);
      });
    }, 220);
    return () => clearInterval(id);
  }, [analiseMut.isPending]);

  // Ao concluir, completa para 100% e segura a barra cheia por um instante
  // antes de revelar o resultado.
  useEffect(() => {
    if (analiseMut.isSuccess && !analiseMut.isPending) {
      setIaProgresso(100);
      const t = setTimeout(() => setIaProgresso(0), 1100);
      return () => clearTimeout(t);
    }
  }, [analiseMut.isSuccess, analiseMut.isPending]);

  useEffect(() => {
    if (analiseMut.isError) setIaProgresso(0);
  }, [analiseMut.isError]);

  const rows: DRERow[] = dre ? [
    { label: "1. RECEITA BRUTA", value: dre.receitaBruta, highlight: "green",
      info: "Total faturado no período (medições, contratos e serviços), antes de qualquer dedução.",
      exemplos: {
        entra: ["Medição de obra aprovada e faturada", "Contrato de engenharia executado", "Adiantamento de contrato recebido"],
        naoEntra: ["Compra de terreno → é investimento, vai ao Balanço Patrimonial", "Transferência entre contas da empresa", "Devolução de fornecedor → classifique como 'Outros Ganhos'"],
      },
      drill: { kind: "leaf", linha: "receitaBruta", label: "Receita Bruta", negativo: false } },
    { label: "  (-) Deduções da Receita", value: -dre.deducoes, indent: 1, isNegative: true,
      info: "Impostos sobre vendas, devoluções e abatimentos que reduzem a receita bruta.",
      exemplos: {
        entra: ["ISS incidente sobre o faturamento", "PIS/COFINS em regime cumulativo", "Estorno de medição faturada indevidamente"],
        naoEntra: ["IRPJ e CSLL → vão em 'Impostos sobre o Resultado'", "Multas contratuais → são despesas operacionais"],
      },
      drill: { kind: "info", label: "Deduções da Receita", texto: "Não há deduções lançadas neste período. Impostos sobre vendas, devoluções e abatimentos entrariam aqui, reduzindo a receita bruta." } },
    { label: "= RECEITA LÍQUIDA", value: dre.receitaLiquida, isTotal: true, highlight: "blue",
      info: "Receita bruta menos as deduções. É a base de cálculo de todas as margens.",
      drill: { kind: "composicao", label: "Receita Líquida", value: dre.receitaLiquida, itens: [
        { label: "Receita Bruta", contrib: dre.receitaBruta },
        { label: "(-) Deduções da Receita", contrib: -dre.deducoes },
      ] } },
    { label: "", value: 0, isSeparator: true },
    { label: "  (-) Custos Diretos das Obras", value: -dre.custosObra, indent: 1, isNegative: true,
      info: "Gastos diretamente ligados à execução das obras: material, mão de obra direta e subcontratos.",
      exemplos: {
        entra: ["Material comprado para a obra (via OC)", "Mão de obra direta (CDO — funcionários direto/indireta_obra)", "Subempreitadas e serviços de terceiros em obra", "Aluguel de equipamentos utilizados em canteiro"],
        naoEntra: ["Salário do escritório → vai em Despesas Fixas", "Compra de veículo ou terreno → é investimento (CAPEX)", "IRPJ/CSLL → vão em Impostos sobre o Resultado"],
      },
      drill: { kind: "leaf", linha: "custosObra", label: "Custos Diretos das Obras", negativo: true } },
    { label: "= LUCRO BRUTO", value: dre.lucroBruto, isTotal: true, percentOf: dre.receitaLiquida, highlight: dre.lucroBruto >= 0 ? "green" : "red",
      info: "Receita líquida menos os custos diretos das obras. Quanto sobra antes das despesas administrativas.",
      drill: { kind: "composicao", label: "Lucro Bruto", value: dre.lucroBruto, itens: [
        { label: "Receita Líquida", contrib: dre.receitaLiquida },
        { label: "(-) Custos Diretos das Obras", contrib: -dre.custosObra },
      ] } },
    { label: "    Margem Bruta", value: dre.margemBruta, indent: 2,
      info: "Lucro bruto ÷ receita líquida. Mostra quanto sobra de cada R$ faturado após os custos das obras. No setor de construção civil, margens saudáveis ficam entre 20% e 35%.",
      drill: { kind: "ratio", label: "Margem Bruta", num: dre.lucroBruto, numLabel: "Lucro Bruto", den: dre.receitaLiquida, denLabel: "Receita Líquida", valuePct: dre.margemBruta } },
    { label: "", value: 0, isSeparator: true },
    { label: "  (-) Despesas Fixas", value: -dre.despesasFixas, indent: 1, isNegative: true,
      info: "Gastos administrativos recorrentes que existem independente do volume de obras (folha do escritório, aluguel, etc.).",
      exemplos: {
        entra: ["Aluguel do escritório/sede", "Folha de pagamento administrativo (escritório_central)", "Plano de saúde dos funcionários", "Honorários contábeis, jurídicos e de consultoria"],
        naoEntra: ["Material para obra → vai em Custos Diretos", "Juros de empréstimo → vai em Despesas Financeiras", "Compra de computador ou mobiliário → é investimento (CAPEX)"],
      },
      drill: { kind: "leaf", linha: "despesasFixas", label: "Despesas Fixas", negativo: true } },
    { label: "  (-) Despesas Variáveis", value: -dre.despesasVariaveis, indent: 1, isNegative: true,
      info: "Gastos operacionais que variam com o nível de atividade da empresa.",
      exemplos: {
        entra: ["Combustível e pedágios", "Manutenção de veículos da frota", "Alimentação em obra (refeitório/marmita)", "Marketing, publicidade e eventos"],
        naoEntra: ["Salário fixo → vai em Despesas Fixas", "Material para obra → vai em Custos Diretos", "Compra de terreno, veículo ou equipamento → é CAPEX"],
      },
      drill: { kind: "leaf", linha: "despesasVariaveis", label: "Despesas Variáveis", negativo: true } },
    { label: "= EBITDA", value: dre.ebitda, isTotal: true, percentOf: dre.receitaLiquida, highlight: dre.ebitda >= 0 ? "green" : "red",
      info: "Resultado operacional antes de juros, impostos, depreciação e amortização. Mede a geração de caixa pura do negócio.",
      drill: { kind: "composicao", label: "EBITDA", value: dre.ebitda, itens: [
        { label: "Lucro Bruto", contrib: dre.lucroBruto },
        { label: "(-) Despesas Fixas", contrib: -dre.despesasFixas },
        { label: "(-) Despesas Variáveis", contrib: -dre.despesasVariaveis },
      ] } },
    { label: "    Margem EBITDA", value: dre.margemEbitda, indent: 2,
      info: "EBITDA ÷ receita líquida. Mede a eficiência operacional. Construção civil saudável: 8% a 15%.",
      drill: { kind: "ratio", label: "Margem EBITDA", num: dre.ebitda, numLabel: "EBITDA", den: dre.receitaLiquida, denLabel: "Receita Líquida", valuePct: dre.margemEbitda } },
    { label: "", value: 0, isSeparator: true },
    { label: "  (+) Receitas Financeiras", value: dre.receitasFinanceiras, indent: 1,
      info: "Juros e rendimentos obtidos de aplicações financeiras ou atraso de clientes.",
      exemplos: {
        entra: ["Rendimento de CDB, LCI ou aplicação financeira", "Juros cobrados de cliente por atraso", "Desconto obtido na antecipação de pagamento"],
        naoEntra: ["Receita de medição de obra → vai em Receita Bruta", "Venda de ativo (veículo, equipamento) → 'Outros Ganhos'"],
      },
      drill: { kind: "leaf", linha: "receitasFinanceiras", label: "Receitas Financeiras", negativo: false } },
    { label: "  (-) Despesas Financeiras", value: -dre.despesasFinanceiras, indent: 1, isNegative: true,
      info: "Encargos do uso de capital de terceiros: juros, tarifas bancárias e IOF.",
      exemplos: {
        entra: ["Juros de empréstimo ou financiamento bancário", "Tarifas de manutenção de conta e TED/DOC", "IOF sobre operações de crédito", "Multas e mora bancária"],
        naoEntra: ["Despesas operacionais (aluguel, salários) → vão em Fixas/Variáveis", "IRPJ e CSLL → vão em Impostos sobre o Resultado"],
      },
      drill: { kind: "leaf", linha: "despesasFinanceiras", label: "Despesas Financeiras", negativo: true } },
    { label: "= RESULTADO FINANCEIRO", value: dre.resultadoFinanceiro, isTotal: true, highlight: dre.resultadoFinanceiro >= 0 ? "green" : "red",
      info: "Receitas financeiras menos despesas financeiras. Negativo significa que a empresa paga mais em juros do que rende.",
      drill: { kind: "composicao", label: "Resultado Financeiro", value: dre.resultadoFinanceiro, itens: [
        { label: "Receitas Financeiras", contrib: dre.receitasFinanceiras },
        { label: "(-) Despesas Financeiras", contrib: -dre.despesasFinanceiras },
      ] } },
    { label: "", value: 0, isSeparator: true },
    { label: "= LAIR (Antes dos Impostos)", value: dre.lair, isTotal: true, highlight: dre.lair >= 0 ? "green" : "red",
      info: "Lucro Antes do Imposto de Renda = EBITDA + resultado financeiro.",
      drill: { kind: "composicao", label: "LAIR (Antes dos Impostos)", value: dre.lair, itens: [
        { label: "EBITDA", contrib: dre.ebitda },
        { label: "Resultado Financeiro", contrib: dre.resultadoFinanceiro },
      ] } },
    { label: "  (-) Impostos sobre o Resultado", value: -dre.impostos, indent: 1, isNegative: true,
      info: "IRPJ, CSLL e demais tributos incidentes sobre o lucro.",
      exemplos: {
        entra: ["DAS (Simples Nacional)", "DARF de IRPJ e CSLL (Lucro Real ou Presumido)", "DARF de PIS e COFINS (regime não-cumulativo)"],
        naoEntra: ["ISS sobre faturamento → vai em Deduções da Receita", "INSS patronal e FGTS → vão em Custos Diretos ou Despesas Fixas", "Parcelamento de débito anterior → é passivo, não despesa do período"],
      },
      drill: { kind: "leaf", linha: "impostos", label: "Impostos sobre o Resultado", negativo: true } },
    { label: "= LUCRO LÍQUIDO", value: dre.lucroLiquido, isTotal: true, highlight: dre.lucroLiquido >= 0 ? "green" : "red",
      info: "Resultado final do período, após todos os custos, despesas e impostos. É o que efetivamente sobrou (ou faltou) para a empresa.",
      drill: { kind: "composicao", label: "Lucro Líquido", value: dre.lucroLiquido, itens: [
        { label: "LAIR (Antes dos Impostos)", contrib: dre.lair },
        { label: "(-) Impostos sobre o Resultado", contrib: -dre.impostos },
      ] } },
    { label: "    Margem Líquida", value: dre.margemLiquida, indent: 2,
      info: "Lucro líquido ÷ receita líquida. Rentabilidade final. Construção civil saudável: 5% a 12%.",
      drill: { kind: "ratio", label: "Margem Líquida", num: dre.lucroLiquido, numLabel: "Lucro Líquido", den: dre.receitaLiquida, denLabel: "Receita Líquida", valuePct: dre.margemLiquida } },
  ] : [];

  const isPct = (row: DRERow) => row.label.includes("Margem");

  const saudeMap: Record<string, { label: string; cls: string; dot: string }> = {
    excelente: { label: "Excelente", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    boa: { label: "Boa", cls: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
    atencao: { label: "Atenção", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
    critica: { label: "Crítica", cls: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
  };

  const statusInd: Record<string, { cls: string; Icon: any; txt: string }> = {
    acima: { cls: "text-blue-600 bg-blue-50 border-blue-200", Icon: ArrowUpRight, txt: "Acima do setor" },
    dentro: { cls: "text-emerald-600 bg-emerald-50 border-emerald-200", Icon: Minus, txt: "Dentro do setor" },
    abaixo: { cls: "text-amber-600 bg-amber-50 border-amber-200", Icon: ArrowDownRight, txt: "Abaixo do setor" },
  };

  const sevMap: Record<string, string> = {
    alta: "bg-red-50 text-red-700 border-red-200",
    media: "bg-amber-50 text-amber-700 border-amber-200",
    baixa: "bg-gray-50 text-gray-600 border-gray-200",
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Header navy */}
        <div className="rounded-2xl text-white p-5 sm:p-6 shadow-sm" style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #243a63 100%)` }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center">
                <BarChart2 className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold leading-tight">DRE — Demonstrativo de Resultado</h1>
                <p className="text-sm text-white/70 mt-0.5">Demonstração do Exercício (Lei 6.404/76 art. 187 · CPC 26) com análise inteligente</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="self-start sm:self-auto bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
              <RefreshCw className="w-4 h-4 mr-1.5" /> Atualizar
            </Button>
          </div>
        </div>

        {/* Seletor de período */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setAno(a => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
                <button onClick={() => setAno(a => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Consolidado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados</span>
              </div>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {MESES_ABREV.map((m, i) => {
                const num = i + 1;
                const status = mesesStatus[num];
                const isSelected = sel.tipo === "mensal" && sel.mes === num;
                return (
                  <button
                    key={m}
                    onClick={() => setSel({ tipo: "mensal", mes: num })}
                    className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                      ${isSelected
                        ? "border-orange-500 bg-orange-50 text-orange-700 shadow-sm"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                  >
                    <span>{m}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      status === "consolidado" ? "bg-green-500" :
                      status === "lancamento" ? "bg-blue-500" :
                      "bg-gray-300"
                    }`} />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-0.5">Trimestre</span>
              {[1, 2, 3, 4].map((t) => (
                <button key={`t${t}`} onClick={() => setSel({ tipo: "trimestral", tri: t })} className={chipCls(sel.tipo === "trimestral" && sel.tri === t)}>
                  {t}º Tri
                </button>
              ))}
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide ml-2 mr-0.5">Semestre</span>
              {[1, 2].map((s) => (
                <button key={`s${s}`} onClick={() => setSel({ tipo: "semestral", sem: s })} className={chipCls(sel.tipo === "semestral" && sel.sem === s)}>
                  {s}º Sem
                </button>
              ))}
              <button onClick={() => setSel({ tipo: "anual" })} className={`${chipCls(sel.tipo === "anual")} ml-auto`}>
                <CalendarDays className="w-3.5 h-3.5" /> Ano inteiro ({ano})
              </button>
            </div>
          </CardContent>
        </Card>

        {/* KPIs rápidos */}
        {dre && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {[
              { label: "Receita Líquida", value: dre.receitaLiquida, pct: null, icon: TrendingUp, color: "text-blue-600", ring: "ring-blue-100" },
              { label: "Lucro Bruto", value: dre.lucroBruto, pct: dre.margemBruta, icon: BarChart2, color: dre.lucroBruto >= 0 ? "text-emerald-600" : "text-red-600", ring: dre.lucroBruto >= 0 ? "ring-emerald-100" : "ring-red-100" },
              { label: "EBITDA", value: dre.ebitda, pct: dre.margemEbitda, icon: Activity, color: dre.ebitda >= 0 ? "text-emerald-600" : "text-red-600", ring: dre.ebitda >= 0 ? "ring-emerald-100" : "ring-red-100" },
              { label: "Lucro Líquido", value: dre.lucroLiquido, pct: dre.margemLiquida, icon: dre.lucroLiquido >= 0 ? TrendingUp : TrendingDown, color: dre.lucroLiquido >= 0 ? "text-emerald-600" : "text-red-600", ring: dre.lucroLiquido >= 0 ? "ring-emerald-100" : "ring-red-100" },
            ].map(kpi => {
              const Icon = kpi.icon;
              return (
                <Card key={kpi.label} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`w-7 h-7 rounded-lg bg-gray-50 ring-1 ${kpi.ring} flex items-center justify-center`}>
                        <Icon className={`w-4 h-4 ${kpi.color}`} />
                      </span>
                      <span className="text-xs text-gray-500">{kpi.label}</span>
                    </div>
                    <p className={`text-base sm:text-lg font-bold ${kpi.color} tabular-nums`}>{formatBRL(kpi.value)}</p>
                    {kpi.pct !== null && (
                      <p className="text-[11px] text-gray-400 mt-0.5">Margem {formatPct(kpi.pct)}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Rev. 3952 — Card contexto DRE × Caixa: explica divergência para leigos */}
        {dre && bankComp && (() => {
          const dreNet = dre.lucroLiquido;
          const bankNet = bankComp.bankSaldo;
          const hasBankData = bankComp.bankEntradas > 0 || bankComp.bankSaidas > 0;
          if (!hasBankData) return null;

          const drePos = dreNet >= 0;
          const bankPos = bankNet >= 0;
          const divergente = drePos !== bankPos;

          if (!divergente) {
            return (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-xs text-emerald-800 leading-relaxed">
                  <span className="font-semibold">DRE e caixa estão alinhados</span> — resultado operacional e fluxo bancário apontam na mesma direção para o período.
                  <span className="text-emerald-700"> DRE: <strong>{formatBRL(dreNet)}</strong> · Caixa bancário: <strong>{formatBRL(bankNet)}</strong></span>
                </p>
              </div>
            );
          }

          const dreNegBankPos = !drePos && bankPos;
          return (
            <div className={`rounded-xl border px-5 py-4 space-y-3 ${dreNegBankPos ? "border-blue-100 bg-blue-50/50" : "border-amber-100 bg-amber-50/50"}`}>
              {/* Cabeçalho */}
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${dreNegBankPos ? "bg-blue-100" : "bg-amber-100"}`}>
                  <Scale className={`w-4 h-4 ${dreNegBankPos ? "text-blue-600" : "text-amber-600"}`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-bold ${dreNegBankPos ? "text-blue-900" : "text-amber-900"}`}>
                    {dreNegBankPos
                      ? "Por que o DRE mostra prejuízo se o caixa ficou positivo?"
                      : "Por que o DRE mostra lucro se o caixa caiu?"}
                  </p>
                  <p className={`text-xs mt-0.5 ${dreNegBankPos ? "text-blue-700" : "text-amber-700"}`}>
                    Isso é normal — DRE e saldo bancário medem coisas diferentes
                  </p>
                </div>
              </div>

              {/* Comparativo lado a lado */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white border border-gray-100 px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <BarChart2 className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Resultado DRE</span>
                  </div>
                  <p className={`text-lg font-bold tabular-nums ${drePos ? "text-emerald-600" : "text-red-600"}`}>{formatBRL(dreNet)}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Receitas × Despesas operacionais</p>
                </div>
                <div className="rounded-lg bg-white border border-gray-100 px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Building2 className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Caixa Bancário</span>
                  </div>
                  <p className={`text-lg font-bold tabular-nums ${bankPos ? "text-emerald-600" : "text-red-600"}`}>{formatBRL(bankNet)}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Total entradas − saídas do período</p>
                </div>
              </div>

              {/* Explicação */}
              <div className="rounded-lg bg-white/80 border border-gray-100 px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-gray-700">Por que eles divergem?</p>
                <ul className="text-xs text-gray-600 space-y-1.5 leading-relaxed">
                  {dreNegBankPos ? (
                    <>
                      <li className="flex items-start gap-2"><span className="text-blue-500 font-bold mt-0.5">→</span><span><strong>O DRE só conta operação:</strong> receitas de obras e serviços versus todos os custos e despesas. Se os gastos superaram as receitas, o resultado é negativo — independente do caixa.</span></li>
                      <li className="flex items-start gap-2"><span className="text-blue-500 font-bold mt-0.5">→</span><span><strong>O caixa inclui tudo:</strong> empréstimos recebidos, aportes de sócios, pagamentos de clientes atrasados — dinheiro que entrou no banco mas <em>não é receita operacional</em> e não aparece no DRE.</span></li>
                      <li className="flex items-start gap-2"><span className="text-blue-500 font-bold mt-0.5">→</span><span><strong>Conclusão:</strong> o caixa está positivo porque a empresa recebeu financiamentos ou transferências que sustentaram o saldo. O DRE negativo indica que a <em>operação</em> precisa de atenção.</span></li>
                    </>
                  ) : (
                    <>
                      <li className="flex items-start gap-2"><span className="text-amber-500 font-bold mt-0.5">→</span><span><strong>O DRE registra receitas quando realizadas:</strong> uma obra faturada e recebida entra como receita, mesmo que o dinheiro já tenha saído para pagar fornecedores do mês anterior.</span></li>
                      <li className="flex items-start gap-2"><span className="text-amber-500 font-bold mt-0.5">→</span><span><strong>O caixa pode cair mesmo com lucro</strong> se a empresa fez investimentos (CAPEX), pagou dívidas antigas ou financiamentos, ou teve saídas que não são despesas do DRE.</span></li>
                      <li className="flex items-start gap-2"><span className="text-amber-500 font-bold mt-0.5">→</span><span><strong>Conclusão:</strong> acompanhe o Fluxo de Caixa para entender onde o dinheiro foi — o lucro existe, mas está sendo usado em outros fins.</span></li>
                    </>
                  )}
                </ul>
              </div>

              <p className={`text-[11px] ${dreNegBankPos ? "text-blue-600/70" : "text-amber-600/70"}`}>
                ✓ Os dados estão corretos — não é inconsistência. Use o DRE para avaliar a operação e a Conciliação Bancária para o fluxo de caixa real.
              </p>
            </div>
          );
        })()}

        {/* Tabela DRE */}
        <Card className="border-0 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">DRE — {tituloPeriodo}</h2>
            <Badge variant="outline" className="text-[11px] text-gray-500 font-normal">clique no <Info className="w-3 h-3 mx-1 inline" /> para legenda e exemplos</Badge>
          </div>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            ) : !dre ? (
              <div className="p-10 text-center text-gray-400">Selecione um período para visualizar o DRE.</div>
            ) : (
              <div>
                {rows.map((row, idx) => {
                  if (row.isSeparator) return <div key={idx} className="border-t border-gray-200 my-1" />;
                  const isMargin = isPct(row);
                  const val = row.value;
                  const displayVal = isMargin ? formatPct(val) : formatBRL(Math.abs(val));

                  let textColor = "text-gray-700";
                  if (row.highlight === "green") textColor = "text-emerald-700";
                  if (row.highlight === "red") textColor = "text-red-600";
                  if (row.highlight === "blue") textColor = "text-blue-700";
                  if (isMargin) textColor = val >= 0 ? "text-emerald-600" : "text-red-600";

                  const clickable = !!row.drill;
                  return (
                    <div
                      key={idx}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? () => setDrill(row.drill!) : undefined}
                      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDrill(row.drill!); } } : undefined}
                      title={clickable ? "Clique para ver os valores que compõem esta linha" : undefined}
                      className={`group flex items-center justify-between px-5 py-2.5 ${row.isTotal ? "font-semibold bg-gray-50/80" : ""} ${clickable ? "cursor-pointer hover:bg-orange-50/60 focus:bg-orange-50/60 focus:outline-none" : "hover:bg-orange-50/30"} transition-colors`}
                      style={{ paddingLeft: `${20 + (row.indent ?? 0) * 20}px` }}
                    >
                      <span className={`text-sm flex items-center gap-1.5 ${row.isTotal ? "font-bold text-gray-800" : "text-gray-600"}`}>
                        {row.label}
                        {row.info && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button onClick={(e) => e.stopPropagation()} className="text-gray-300 hover:text-orange-500 transition-colors" aria-label="legenda">
                                <Info className="w-3.5 h-3.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 p-0 overflow-hidden" align="start">
                              <div className="px-3 py-2.5 border-b border-gray-100">
                                <p className="text-xs text-gray-600 leading-relaxed">{row.info}</p>
                              </div>
                              {row.exemplos && (
                                <div className="p-3 space-y-3">
                                  <div>
                                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> Entra aqui
                                    </p>
                                    <ul className="space-y-1">
                                      {row.exemplos.entra.map((ex, i) => (
                                        <li key={i} className="text-[11px] text-gray-600 flex gap-1.5">
                                          <span className="text-emerald-500 shrink-0 mt-0.5">•</span>{ex}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                                      <XCircle className="w-3 h-3" /> Não entra
                                    </p>
                                    <ul className="space-y-1">
                                      {row.exemplos.naoEntra.map((ex, i) => (
                                        <li key={i} className="text-[11px] text-gray-500 flex gap-1.5">
                                          <span className="text-red-400 shrink-0 mt-0.5">•</span>{ex}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              )}
                            </PopoverContent>
                          </Popover>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className={`text-sm font-medium ${textColor} tabular-nums`}>
                          {isMargin ? displayVal : (row.isNegative ? `(${displayVal})` : displayVal)}
                        </span>
                        {clickable && (
                          <ChevronRightIcon className="w-3.5 h-3.5 text-gray-300 group-hover:text-orange-500 transition-colors" />
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Análise de IA — abaixo do DRE */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-orange-50/60 to-transparent">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-orange-500" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                  Análise Inteligente
                  {analise?.saude && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${saudeMap[analise.saude]?.cls ?? ""}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${saudeMap[analise.saude]?.dot ?? "bg-gray-400"}`} /> {saudeMap[analise.saude]?.label ?? analise.saude}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-gray-500">Diagnóstico do resultado com benchmarks do setor de construção e fontes citadas</p>
                {!analiseMut.isPending && analiseSalvaEm && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Salva em {parseAsUTC(analiseSalvaEm).toLocaleString("pt-BR")}
                    {(analise as any)?.geradoPorNome ? ` · por ${(analise as any).geradoPorNome}` : ""}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {nota !== null && !analiseMut.isPending && (
                <div className="flex flex-col items-center" title="Nota geral de saúde financeira (0 a 100)">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center font-extrabold text-base tabular-nums border-4"
                    style={{
                      color: notaCor(nota),
                      borderColor: notaCor(nota),
                      background: `${notaCor(nota)}14`,
                    }}
                  >
                    {nota}
                  </div>
                  <span className="text-[10px] text-gray-400 mt-0.5 font-medium">NOTA /100</span>
                </div>
              )}
              <Button
                size="sm"
                onClick={gerarAnalise}
                disabled={analiseMut.isPending || !dre}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                {analiseMut.isPending ? `Analisando… ${Math.round(iaProgresso)}%` : analise ? "Refazer análise" : "Analisar com IA"}
              </Button>
            </div>
          </div>

          <CardContent className="p-5">
            {analiseMut.isPending || iaProgresso > 0 ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/80 to-amber-50/40 p-5">
                  <div className="flex items-end justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100">
                        <Sparkles className="w-5 h-5 text-orange-500" />
                        {iaProgresso < 100 && (
                          <span className="absolute inset-0 rounded-xl ring-2 ring-orange-300/60 animate-ping" />
                        )}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-gray-900">
                          {iaProgresso >= 100 ? "Análise concluída" : "Analisando com IA…"}
                        </p>
                        <p className="text-xs text-orange-700/80 font-medium">{iaProgresso >= 100 ? "Pronto!" : iaFase.label}</p>
                      </div>
                    </div>
                    <span className="text-2xl font-extrabold tabular-nums text-orange-600 leading-none">
                      {Math.round(iaProgresso)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-orange-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-300 ease-out"
                      style={{ width: `${iaProgresso}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {IA_FASES.map((f, i) => {
                      const ini = i === 0 ? 0 : IA_FASES[i - 1].ate;
                      const feito = iaProgresso >= f.ate || iaProgresso >= 100;
                      const ativo = !feito && iaProgresso >= ini;
                      return (
                        <span
                          key={f.label}
                          className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
                            feito ? "text-emerald-600" : ativo ? "text-orange-600" : "text-gray-400"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            feito ? "bg-emerald-500" : ativo ? "bg-orange-500 animate-pulse" : "bg-gray-300"
                          }`} />
                          {f.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="grid sm:grid-cols-2 gap-3 pt-2">
                    <Skeleton className="h-20 w-full rounded-xl" />
                    <Skeleton className="h-20 w-full rounded-xl" />
                  </div>
                </div>
              </div>
            ) : analiseMut.isError ? (
              <p className="text-sm text-red-600">Não foi possível gerar a análise. Tente novamente em instantes.</p>
            ) : !analise ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  Clique em <span className="font-semibold text-orange-600">Analisar com IA</span> para receber um diagnóstico do resultado de <span className="font-medium">{tituloPeriodo}</span>, comparado aos indicadores do setor de construção e fundamentado em literatura financeira.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {analiseDesatualizada && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    Esta análise é do período <strong>{analise.periodo}</strong>. Refaça para o período selecionado.
                  </div>
                )}

                {/* Resumo executivo */}
                <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    <ShieldCheck className="w-3.5 h-3.5" /> Resumo executivo
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{analise.resumoExecutivo}</p>
                </div>

                {/* Indicadores x setor */}
                {analise.indicadores?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <Activity className="w-3.5 h-3.5" /> Indicadores x setor
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {analise.indicadores.map((ind: any, i: number) => {
                        const st = statusInd[ind.status] ?? statusInd.dentro;
                        const StIcon = st.Icon;
                        return (
                          <div key={i} className="rounded-xl border border-gray-100 p-3.5 hover:border-gray-200 transition-colors">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-gray-800">{ind.nome}</p>
                                <p className="text-lg font-bold tabular-nums" style={{ color: NAVY }}>
                                  {ind.unidade === "%" ? formatPct(ind.valor) : formatBRL(ind.valor)}
                                </p>
                              </div>
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>
                                <StIcon className="w-3 h-3" /> {st.txt}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-1">Setor: <span className="font-medium text-gray-500">{ind.benchmarkSetor}</span></p>
                            <p className="text-xs text-gray-600 leading-relaxed mt-1.5">{ind.leitura}</p>
                            <FonteChips ids={ind.fontes} map={fontesMap} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Riscos + Recomendações */}
                <div className="grid md:grid-cols-2 gap-4">
                  {analise.riscos?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Riscos identificados
                      </div>
                      <div className="space-y-2.5">
                        {analise.riscos.map((r: any, i: number) => (
                          <div key={i} className="rounded-xl border border-gray-100 p-3">
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${sevMap[r.severidade] ?? sevMap.media}`}>{r.severidade}</span>
                              <p className="text-xs text-gray-700 leading-relaxed">{r.texto}</p>
                            </div>
                            <FonteChips ids={r.fontes} map={fontesMap} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {analise.recomendacoes?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        <Lightbulb className="w-3.5 h-3.5 text-orange-500" /> Recomendações
                      </div>
                      <div className="space-y-2.5">
                        {analise.recomendacoes.map((r: any, i: number) => (
                          <div key={i} className="rounded-xl border border-gray-100 p-3">
                            <div className="flex items-start gap-2">
                              <Lightbulb className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
                              <p className="text-xs text-gray-700 leading-relaxed">{r.texto}</p>
                            </div>
                            <FonteChips ids={r.fontes} map={fontesMap} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Todas as fontes citadas */}
                {analise.fontes?.length > 0 && (
                  <div className="pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      <BookOpen className="w-3.5 h-3.5" /> Fontes citadas ({analise.fontes.length})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analise.fontes.map((f: Fonte) => <FonteChip key={f.id} fonte={f} />)}
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-gray-400 italic">
                  Análise gerada por IA com base nos lançamentos do período e em fontes públicas do setor. Use como apoio à decisão, não como aconselhamento contábil/fiscal definitivo.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legenda do modelo contábil — fixo, sempre visível */}
        <div className="rounded-2xl border border-gray-100 bg-gray-50/70 px-5 py-4 space-y-3">
          {/* Título */}
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Sobre este relatório — DRE Gerencial de Caixa
            </span>
          </div>

          {/* Explicação principal */}
          <p className="text-xs text-gray-500 leading-relaxed">
            Este DRE exibe <strong className="text-gray-700">apenas valores efetivamente realizados</strong> —
            pagamentos confirmados (baixados) e recebimentos concluídos.
            Lançamentos com status <em>a pagar</em> ou <em>a receber</em> não aparecem aqui,
            pois ainda não representam fatos consumados.
          </p>

          {/* Comparativo em dois blocos */}
          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            <div className="rounded-xl bg-white border border-gray-100 px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> DRE Gerencial de Caixa (este relatório)
              </p>
              <ul className="text-[11px] text-gray-600 space-y-1 leading-relaxed">
                <li>✔ Mostra o que <strong>realmente entrou e saiu</strong> do caixa</li>
                <li>✔ Ideal para <strong>decisão operacional</strong> do gestor</li>
                <li>✔ Sem distorções de valores previstos ou inadimplências</li>
                <li>✔ Pergunta que responde: <em>"Quanto geramos de resultado real?"</em></li>
              </ul>
            </div>
            <div className="rounded-xl bg-white border border-gray-100 px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" /> DRE Societário de Competência (contábil)
              </p>
              <ul className="text-[11px] text-gray-600 space-y-1 leading-relaxed">
                <li>✔ Exigido por lei (Lei 6.404/76 · CPC 26 · IFRS IAS 1)</li>
                <li>✔ Reconhece receita quando o serviço é <strong>prestado</strong>, não pago</li>
                <li>✔ Inclui contas a receber como receita do período</li>
                <li>✔ Pergunta que responde: <em>"Quanto competiu a este mês?"</em></li>
              </ul>
            </div>
          </div>

          {/* Nota de rodapé */}
          <p className="text-[10px] text-gray-400 leading-relaxed pt-0.5">
            Projeções e lançamentos pendentes ficam visíveis no <strong>Fluxo de Caixa</strong>.
            Valores entre parênteses representam saídas ou deduções.
            Dados calculados automaticamente com base nos lançamentos financeiros do período.
          </p>
        </div>
      </div>

      <Dialog open={!!drill} onOpenChange={(o) => { if (!o) setDrill(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
          {drill && (
            <DrillBody
              drill={drill}
              companyId={companyId}
              periodo={periodo}
              tipoPeriodo={sel.tipo}
            />
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function DrillBody({
  drill, companyId, periodo, tipoPeriodo,
}: {
  drill: DrillState;
  companyId: number | undefined;
  periodo: string;
  tipoPeriodo: "mensal" | "trimestral" | "semestral" | "anual";
}) {
  const isLeaf = drill.kind === "leaf";
  const detalhe = trpc.financial.getDRELinhaDetalhe.useQuery(
    {
      companyId: companyId ?? 0,
      periodo,
      tipoPeriodo,
      linha: isLeaf ? (drill as Extract<DrillState, { kind: "leaf" }>).linha : "receitaBruta",
    },
    { enabled: isLeaf && !!companyId, refetchOnWindowFocus: false },
  );
  // Rev. 3793 — DEVE ficar ANTES dos early returns (Rules of Hooks).
  const [catSel, setCatSel] = useState<string | null>(null);

  if (drill.kind === "info") {
    return (
      <>
        <div className="rounded-t-2xl px-6 pt-6 pb-5 shrink-0"
             style={{ background: "linear-gradient(135deg,#1B2A4A 0%,#243a63 100%)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Info className="w-5 h-5 text-orange-400" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold text-white leading-tight break-words">{drill.label}</DialogTitle>
              <DialogDescription className="text-xs text-white/55 mt-0.5">Composição da linha do DRE</DialogDescription>
            </div>
          </div>
        </div>
        <div className="px-6 py-8 text-sm text-gray-600 leading-relaxed break-words bg-gray-50/40 flex-1">
          {drill.texto}
        </div>
      </>
    );
  }

  if (drill.kind === "ratio") {
    const pctTxt = `${drill.valuePct.toFixed(1).replace(".", ",")}%`;
    const isPos = drill.valuePct >= 0;
    return (
      <>
        <div className="rounded-t-2xl px-6 pt-6 pb-5 shrink-0"
             style={{ background: "linear-gradient(135deg,#1B2A4A 0%,#243a63 100%)" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Percent className="w-5 h-5 text-orange-400" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold text-white leading-tight break-words">{drill.label}</DialogTitle>
              <DialogDescription className="text-xs text-white/55 mt-0.5">Como esta margem é calculada</DialogDescription>
            </div>
          </div>
          <div className="pt-4 border-t border-white/10">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1">Resultado</p>
            <p className={`text-2xl font-black tabular-nums ${isPos ? "text-emerald-400" : "text-red-400"}`}>{pctTxt}</p>
          </div>
        </div>
        <div className="px-6 py-6 space-y-4 bg-gray-50/40 flex-1">
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 text-sm">
              <span className="text-gray-500 break-words">{drill.numLabel}</span>
              <span className={`font-bold tabular-nums ${drill.num >= 0 ? "text-emerald-700" : "text-red-600"}`}>{formatBRL(drill.num)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5 text-sm">
              <span className="text-gray-500 break-words">÷ {drill.denLabel}</span>
              <span className="font-bold tabular-nums text-gray-700">{formatBRL(drill.den)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5 bg-gray-50/80">
              <span className="text-sm font-bold text-gray-800">= {drill.label}</span>
              <span className={`text-base font-extrabold tabular-nums ${isPos ? "text-emerald-600" : "text-red-600"}`}>{pctTxt}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            A margem é a divisão de <strong className="text-gray-600">{drill.numLabel}</strong> pela <strong className="text-gray-600">{drill.denLabel}</strong>, expressa em percentual.
          </p>
        </div>
      </>
    );
  }

  if (drill.kind === "composicao") {
    const isPos = drill.value >= 0;
    return (
      <>
        <div className="rounded-t-2xl px-6 pt-6 pb-5 shrink-0"
             style={{ background: "linear-gradient(135deg,#1B2A4A 0%,#243a63 100%)" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5 text-orange-400" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold text-white leading-tight break-words">{drill.label}</DialogTitle>
              <DialogDescription className="text-xs text-white/55 mt-0.5">Composição do resultado a partir das linhas anteriores</DialogDescription>
            </div>
          </div>
          <div className="pt-4 border-t border-white/10">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1">Resultado</p>
            <p className={`text-2xl font-black tabular-nums ${isPos ? "text-emerald-400" : "text-red-400"}`}>{formatBRL(drill.value)}</p>
          </div>
        </div>
        <div className="px-6 py-6 space-y-4 bg-gray-50/40 flex-1">
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            {drill.itens.map((it, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3.5 text-sm">
                <span className="text-gray-500 break-words">{it.label}</span>
                <span className={`font-bold tabular-nums ${it.contrib >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {it.contrib < 0 ? `(${formatBRL(Math.abs(it.contrib))})` : formatBRL(it.contrib)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3.5 bg-gray-50/80">
              <span className="text-sm font-bold text-gray-800">= {drill.label}</span>
              <span className={`text-base font-extrabold tabular-nums ${isPos ? "text-emerald-600" : "text-red-600"}`}>{formatBRL(drill.value)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Esta linha é um resultado calculado. Clique nas linhas de receita, custo ou despesa que a compõem para ver os lançamentos individuais.
          </p>
        </div>
      </>
    );
  }

  // kind === "leaf"
  const leaf = drill as Extract<DrillState, { kind: "leaf" }>;
  const d = detalhe.data;
  const total = d?.total ?? 0;
  const maxCat = d?.porConta?.length ? Math.max(...d.porConta.map((c: any) => c.total)) : 1;
  const valorCls = leaf.negativo ? "text-red-400" : "text-emerald-400";
  const barCls   = leaf.negativo ? "bg-red-400"   : "bg-emerald-400";

  // Rev. 3793 — drill de categoria: filtrar lançamentos por categoria selecionada.
  const itensCat = catSel != null ? (d?.itens ?? []).filter((it: any) => it.conta === catSel) : [];
  const catInfo  = catSel != null ? (d?.porConta ?? []).find((c: any) => c.conta === catSel) : null;
  const catTotal = catInfo?.total ?? 0;

  // ── Vista de lançamentos de uma categoria (fullscreen dentro do dialog) ──
  if (catSel != null) {
    return (
      <>
        {/* Cabeçalho categoria */}
        <div className="rounded-t-2xl px-5 pt-5 pb-4 shrink-0"
             style={{ background: "linear-gradient(135deg,#1B2A4A 0%,#243a63 100%)" }}>
          <button
            type="button"
            onClick={() => setCatSel(null)}
            className="flex items-center gap-1.5 text-white/60 hover:text-white text-xs font-medium mb-3 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar para {leaf.label}
          </button>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
              <Receipt className="w-4.5 h-4.5 text-orange-400" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-sm font-bold text-white leading-snug break-words">{catSel?.toUpperCase()}</DialogTitle>
              <DialogDescription className="text-xs text-white/55 mt-0.5">
                Lançamentos individuais · {leaf.label}
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-end justify-between gap-4 pt-3 mt-3 border-t border-white/10">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1">Total</p>
              <p className={`text-xl font-black tabular-nums ${valorCls}`}>
                {leaf.negativo ? `(${formatBRL(catTotal)})` : formatBRL(catTotal)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1">Lançamentos</p>
              <p className="text-base font-bold text-white tabular-nums">{itensCat.length.toLocaleString("pt-BR")}</p>
            </div>
          </div>
        </div>

        {/* Lista de lançamentos da categoria */}
        <div className="overflow-y-auto flex-1 bg-gray-50/40">
          {itensCat.length === 0 ? (
            <div className="py-14 text-center">
              <Receipt className="w-8 h-8 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Nenhum lançamento encontrado para esta categoria.</p>
            </div>
          ) : (
            <div className="bg-white divide-y divide-gray-50">
              {itensCat.map((it: any, idx: number) => (
                <div key={`${it.id}-${idx}`}
                     className="flex items-start justify-between gap-3 px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 font-medium break-words leading-snug">
                      {it.descricao || "(Sem descrição)"}
                    </p>
                    <div className="flex flex-wrap gap-x-2 mt-1">
                      {it.data && (
                        <span className="text-[11px] text-gray-500 font-medium">
                          {new Date(it.data).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                      {it.contraparte && (
                        <span className="text-[11px] text-gray-400 truncate max-w-[160px]">{it.contraparte}</span>
                      )}
                      {it.obraNome && (
                        <span className="text-[11px] text-blue-500/80 truncate max-w-[160px]">{it.obraNome}</span>
                      )}
                    </div>
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${leaf.negativo ? "text-red-600" : "text-emerald-700"}`}>
                    {formatBRL(it.valor)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  // ── Vista principal: lista de categorias + todos os lançamentos ──
  return (
    <>
      {/* ── Cabeçalho NAVY ── */}
      <div className="rounded-t-2xl px-6 pt-6 pb-5 shrink-0"
           style={{ background: "linear-gradient(135deg,#1B2A4A 0%,#243a63 100%)" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <ListTree className="w-5 h-5 text-orange-400" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-base font-bold text-white leading-tight break-words">{leaf.label}</DialogTitle>
            <DialogDescription className="text-xs text-white/55 mt-0.5">
              Lançamentos que compõem esta linha no período
            </DialogDescription>
          </div>
        </div>

        {/* KPI inline */}
        <div className="flex items-end justify-between gap-4 pt-4 border-t border-white/10">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1">Total realizado</p>
            {detalhe.isLoading
              ? <div className="h-8 w-40 rounded-lg bg-white/10 animate-pulse" />
              : <p className={`text-2xl font-black tabular-nums ${valorCls}`}>
                  {leaf.negativo ? `(${formatBRL(total)})` : formatBRL(total)}
                </p>
            }
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1">Lançamentos</p>
            {detalhe.isLoading
              ? <div className="h-6 w-16 rounded-lg bg-white/10 animate-pulse" />
              : <p className="text-lg font-bold text-white tabular-nums">
                  {(d?.qtdTotal ?? 0).toLocaleString("pt-BR")}
                </p>
            }
          </div>
        </div>
      </div>

      {/* ── Corpo scrollável ── */}
      <div className="overflow-y-auto flex-1 px-5 py-5 space-y-6 bg-gray-50/40">

        {detalhe.isLoading && (
          <div className="space-y-3 pt-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24 shrink-0" />
              </div>
            ))}
          </div>
        )}

        {detalhe.isError && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="break-words">Não foi possível carregar o detalhamento. {detalhe.error?.message}</span>
          </div>
        )}

        {!detalhe.isLoading && !detalhe.isError && d && (
          <>
            {/* ── Por categoria (clicável) ── */}
            {d.porConta.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Por categoria</span>
                  <span className="text-[10px] text-gray-300 ml-1">· toque para ver os lançamentos</span>
                </div>

                <div className="space-y-2">
                  {d.porConta.map((c: any, i: number) => {
                    const pct = total > 0 ? (c.total / total) * 100 : 0;
                    const barPct = maxCat > 0 ? (c.total / maxCat) * 100 : 0;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCatSel(c.conta)}
                        className="w-full text-left bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-orange-300 hover:shadow-sm active:scale-[0.99] transition-all cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <span className="text-sm text-gray-700 font-medium break-words flex-1 min-w-0 leading-snug">
                            {c.conta?.toUpperCase()}
                          </span>
                          <div className="text-right shrink-0 flex items-center gap-2">
                            <div>
                              <p className={`text-sm font-bold tabular-nums ${leaf.negativo ? "text-red-600" : "text-emerald-700"}`}>
                                {formatBRL(c.total)}
                              </p>
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                {c.qtd} lanç. · {pct.toFixed(1)}%
                              </p>
                            </div>
                            <ChevronRightIcon className="w-4 h-4 text-gray-300 shrink-0" />
                          </div>
                        </div>
                        {/* barra de proporção */}
                        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barCls} transition-all duration-500`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {d.porConta.length === 0 && (
              <div className="py-14 text-center">
                <ListTree className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Nenhum lançamento nesta linha para o período.</p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
