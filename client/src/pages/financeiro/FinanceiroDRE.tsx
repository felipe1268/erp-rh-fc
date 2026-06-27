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
    { label: "1. RECEITA BRUTA", value: dre.receitaBruta, highlight: "green", info: "Total faturado no período (vendas e serviços), antes de qualquer dedução.",
      drill: { kind: "leaf", linha: "receitaBruta", label: "Receita Bruta", negativo: false } },
    { label: "  (-) Deduções da Receita", value: -dre.deducoes, indent: 1, isNegative: true, info: "Impostos sobre vendas, devoluções e abatimentos que reduzem a receita bruta.",
      drill: { kind: "info", label: "Deduções da Receita", texto: "Não há deduções lançadas neste período. Impostos sobre vendas, devoluções e abatimentos entrariam aqui, reduzindo a receita bruta." } },
    { label: "= RECEITA LÍQUIDA", value: dre.receitaLiquida, isTotal: true, highlight: "blue", info: "Receita bruta menos as deduções. É a base de cálculo de todas as margens.",
      drill: { kind: "composicao", label: "Receita Líquida", value: dre.receitaLiquida, itens: [
        { label: "Receita Bruta", contrib: dre.receitaBruta },
        { label: "(-) Deduções da Receita", contrib: -dre.deducoes },
      ] } },
    { label: "", value: 0, isSeparator: true },
    { label: "  (-) Custos Diretos das Obras", value: -dre.custosObra, indent: 1, isNegative: true, info: "Gastos diretamente ligados à execução das obras: material, mão de obra e subcontratos.",
      drill: { kind: "leaf", linha: "custosObra", label: "Custos Diretos das Obras", negativo: true } },
    { label: "= LUCRO BRUTO", value: dre.lucroBruto, isTotal: true, percentOf: dre.receitaLiquida, highlight: dre.lucroBruto >= 0 ? "green" : "red", info: "Receita líquida menos os custos diretos das obras.",
      drill: { kind: "composicao", label: "Lucro Bruto", value: dre.lucroBruto, itens: [
        { label: "Receita Líquida", contrib: dre.receitaLiquida },
        { label: "(-) Custos Diretos das Obras", contrib: -dre.custosObra },
      ] } },
    { label: "    Margem Bruta", value: dre.margemBruta, indent: 2, info: "Lucro bruto ÷ receita líquida. Mostra quanto sobra após os custos das obras.",
      drill: { kind: "ratio", label: "Margem Bruta", num: dre.lucroBruto, numLabel: "Lucro Bruto", den: dre.receitaLiquida, denLabel: "Receita Líquida", valuePct: dre.margemBruta } },
    { label: "", value: 0, isSeparator: true },
    { label: "  (-) Despesas Fixas", value: -dre.despesasFixas, indent: 1, isNegative: true, info: "Gastos administrativos recorrentes (aluguel, salários do escritório, etc.).",
      drill: { kind: "leaf", linha: "despesasFixas", label: "Despesas Fixas", negativo: true } },
    { label: "  (-) Despesas Variáveis", value: -dre.despesasVariaveis, indent: 1, isNegative: true, info: "Gastos que variam com o nível de atividade (comissões, fretes, etc.).",
      drill: { kind: "leaf", linha: "despesasVariaveis", label: "Despesas Variáveis", negativo: true } },
    { label: "= EBITDA", value: dre.ebitda, isTotal: true, percentOf: dre.receitaLiquida, highlight: dre.ebitda >= 0 ? "green" : "red", info: "Resultado operacional antes de juros, impostos, depreciação e amortização.",
      drill: { kind: "composicao", label: "EBITDA", value: dre.ebitda, itens: [
        { label: "Lucro Bruto", contrib: dre.lucroBruto },
        { label: "(-) Despesas Fixas", contrib: -dre.despesasFixas },
        { label: "(-) Despesas Variáveis", contrib: -dre.despesasVariaveis },
      ] } },
    { label: "    Margem EBITDA", value: dre.margemEbitda, indent: 2, info: "EBITDA ÷ receita líquida. Mede a eficiência operacional do negócio.",
      drill: { kind: "ratio", label: "Margem EBITDA", num: dre.ebitda, numLabel: "EBITDA", den: dre.receitaLiquida, denLabel: "Receita Líquida", valuePct: dre.margemEbitda } },
    { label: "", value: 0, isSeparator: true },
    { label: "  (+) Receitas Financeiras", value: dre.receitasFinanceiras, indent: 1, info: "Juros e rendimentos de aplicações financeiras.",
      drill: { kind: "leaf", linha: "receitasFinanceiras", label: "Receitas Financeiras", negativo: false } },
    { label: "  (-) Despesas Financeiras", value: -dre.despesasFinanceiras, indent: 1, isNegative: true, info: "Juros, tarifas bancárias e IOF pagos no período.",
      drill: { kind: "leaf", linha: "despesasFinanceiras", label: "Despesas Financeiras", negativo: true } },
    { label: "= RESULTADO FINANCEIRO", value: dre.resultadoFinanceiro, isTotal: true, highlight: dre.resultadoFinanceiro >= 0 ? "green" : "red", info: "Receitas financeiras menos despesas financeiras.",
      drill: { kind: "composicao", label: "Resultado Financeiro", value: dre.resultadoFinanceiro, itens: [
        { label: "Receitas Financeiras", contrib: dre.receitasFinanceiras },
        { label: "(-) Despesas Financeiras", contrib: -dre.despesasFinanceiras },
      ] } },
    { label: "", value: 0, isSeparator: true },
    { label: "= LAIR (Antes dos Impostos)", value: dre.lair, isTotal: true, highlight: dre.lair >= 0 ? "green" : "red", info: "Lucro Antes do Imposto de Renda = EBITDA + resultado financeiro.",
      drill: { kind: "composicao", label: "LAIR (Antes dos Impostos)", value: dre.lair, itens: [
        { label: "EBITDA", contrib: dre.ebitda },
        { label: "Resultado Financeiro", contrib: dre.resultadoFinanceiro },
      ] } },
    { label: "  (-) Impostos sobre o Resultado", value: -dre.impostos, indent: 1, isNegative: true, info: "IRPJ, CSLL e demais tributos incidentes sobre o lucro.",
      drill: { kind: "leaf", linha: "impostos", label: "Impostos sobre o Resultado", negativo: true } },
    { label: "= LUCRO LÍQUIDO", value: dre.lucroLiquido, isTotal: true, highlight: dre.lucroLiquido >= 0 ? "green" : "red", info: "Resultado final do período, após todos os custos, despesas e impostos.",
      drill: { kind: "composicao", label: "Lucro Líquido", value: dre.lucroLiquido, itens: [
        { label: "LAIR (Antes dos Impostos)", contrib: dre.lair },
        { label: "(-) Impostos sobre o Resultado", contrib: -dre.impostos },
      ] } },
    { label: "    Margem Líquida", value: dre.margemLiquida, indent: 2, info: "Lucro líquido ÷ receita líquida. É a rentabilidade final do negócio.",
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

        {/* Tabela DRE */}
        <Card className="border-0 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-bold text-gray-900">DRE — {tituloPeriodo}</h2>
            <Badge variant="outline" className="text-[11px] text-gray-500 font-normal">passe o mouse no <Info className="w-3 h-3 mx-1" /> para a legenda</Badge>
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
                            <PopoverContent className="w-64 text-xs text-gray-600 leading-relaxed" align="start">
                              {row.info}
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

        {dre && (
          <p className="text-xs text-gray-400 text-center">
            Dados calculados automaticamente com base nos lançamentos financeiros do período.
            Valores entre parênteses representam saídas/deduções.
          </p>
        )}
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

  if (drill.kind === "info") {
    return (
      <>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <Info className="w-5 h-5 text-orange-500" /> {drill.label}
          </DialogTitle>
          <DialogDescription className="text-gray-500">Composição da linha do DRE</DialogDescription>
        </DialogHeader>
        <div className="px-6 py-8 text-sm text-gray-600 leading-relaxed break-words">{drill.texto}</div>
      </>
    );
  }

  if (drill.kind === "ratio") {
    const pctTxt = `${drill.valuePct.toFixed(1).replace(".", ",")}%`;
    return (
      <>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <Percent className="w-5 h-5 text-orange-500" /> {drill.label}
          </DialogTitle>
          <DialogDescription className="text-gray-500">Como esta margem é calculada</DialogDescription>
        </DialogHeader>
        <div className="px-6 py-6 space-y-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 break-words">{drill.numLabel}</span>
              <span className={`font-semibold tabular-nums ${drill.num >= 0 ? "text-emerald-700" : "text-red-600"}`}>{formatBRL(drill.num)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 break-words">÷ {drill.denLabel}</span>
              <span className="font-semibold tabular-nums text-gray-700">{formatBRL(drill.den)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2.5 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">= {drill.label}</span>
              <span className={`text-base font-extrabold tabular-nums ${drill.valuePct >= 0 ? "text-emerald-600" : "text-red-600"}`}>{pctTxt}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            A margem é a divisão de <strong>{drill.numLabel}</strong> pela <strong>{drill.denLabel}</strong>, expressa em percentual. Clique nas linhas de valor do DRE para ver os lançamentos que compõem cada parcela.
          </p>
        </div>
      </>
    );
  }

  if (drill.kind === "composicao") {
    return (
      <>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <Calculator className="w-5 h-5 text-orange-500" /> {drill.label}
          </DialogTitle>
          <DialogDescription className="text-gray-500">Composição do resultado a partir das linhas anteriores</DialogDescription>
        </DialogHeader>
        <div className="px-6 py-6 space-y-3">
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            {drill.itens.map((it, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 text-sm border-b border-gray-100 last:border-0">
                <span className="text-gray-600 break-words">{it.label}</span>
                <span className={`font-semibold tabular-nums ${it.contrib >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {it.contrib < 0 ? `(${formatBRL(Math.abs(it.contrib))})` : formatBRL(it.contrib)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50/80">
              <span className="text-sm font-bold text-gray-800">= {drill.label}</span>
              <span className={`text-base font-extrabold tabular-nums ${drill.value >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatBRL(drill.value)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Esta linha é um resultado calculado. Para ver os lançamentos individuais, clique nas linhas de receita, custo ou despesa que a compõem.
          </p>
        </div>
      </>
    );
  }

  // kind === "leaf"
  const leaf = drill as Extract<DrillState, { kind: "leaf" }>;
  const d = detalhe.data;
  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
        <DialogTitle className="flex items-center gap-2 text-gray-900">
          <ListTree className="w-5 h-5 text-orange-500" /> {leaf.label}
        </DialogTitle>
        <DialogDescription className="text-gray-500">
          Lançamentos que compõem esta linha no período selecionado
        </DialogDescription>
      </DialogHeader>

      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {detalhe.isLoading ? "Carregando…" : `${(d?.qtdTotal ?? 0).toLocaleString("pt-BR")} lançamento(s)`}
        </span>
        <span className={`text-lg font-extrabold tabular-nums ${leaf.negativo ? "text-red-600" : "text-emerald-600"}`}>
          {leaf.negativo ? `(${formatBRL(d?.total ?? 0)})` : formatBRL(d?.total ?? 0)}
        </span>
      </div>

      <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
        {detalhe.isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        )}
        {detalhe.isError && (
          <div className="rounded-xl border border-red-100 bg-red-50/60 p-4 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="break-words">Não foi possível carregar o detalhamento. {detalhe.error?.message}</span>
          </div>
        )}
        {!detalhe.isLoading && !detalhe.isError && d && (
          <>
            {d.porConta.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Por categoria
                </h4>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  {d.porConta.map((c, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm border-b border-gray-100 last:border-0">
                      <span className="text-gray-600 break-words flex-1 min-w-0 pr-3">
                        {c.conta} <span className="text-gray-400">· {c.qtd}</span>
                      </span>
                      <span className={`font-semibold tabular-nums shrink-0 ${leaf.negativo ? "text-red-600" : "text-emerald-700"}`}>{formatBRL(c.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {d.itens.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5">
                  <ListTree className="w-3.5 h-3.5" /> Lançamentos
                  {d.itensTruncados && <span className="font-normal normal-case text-gray-400">(maiores {d.itens.length.toLocaleString("pt-BR")})</span>}
                </h4>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  {d.itens.map((it) => (
                    <div key={`${it.id}-${it.descricao}`} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                      <div className="min-w-0 flex-1">
                        <p className="text-gray-700 break-words">{it.descricao}</p>
                        <p className="text-xs text-gray-400 break-words">
                          {it.data ? new Date(it.data).toLocaleDateString("pt-BR") : "—"}
                          {it.conta ? ` · ${it.conta}` : ""}
                          {it.contraparte ? ` · ${it.contraparte}` : ""}
                          {it.obraNome ? ` · ${it.obraNome}` : ""}
                        </p>
                      </div>
                      <span className={`font-semibold tabular-nums shrink-0 ${leaf.negativo ? "text-red-600" : "text-emerald-700"}`}>{formatBRL(it.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {d.porConta.length === 0 && d.itens.length === 0 && (
              <div className="py-10 text-center text-sm text-gray-400">Nenhum lançamento nesta linha para o período.</div>
            )}
          </>
        )}
      </div>
    </>
  );
}
