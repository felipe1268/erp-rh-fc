import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";
import { EmpNameWithStatus } from "@/components/EmpStatusBadge";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, Users, Timer, CalendarOff, TrendingDown, TrendingUp, Minus, UserX, ExternalLink, Info, ArrowLeft, X, CalendarX2, CalendarDays, AlertTriangle, CheckCircle2, Maximize2, ChevronLeft, ChevronRight, Activity, Sparkles, Target, BarChart3, Lightbulb, TrendingUp as TrendUpIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState, useMemo } from "react";

// ── helpers ────────────────────────────────────────────────────────────────────
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmtData(d: string) {
  const [ano, mes, dia] = d.split("-");
  const dt = new Date(`${d}T12:00:00Z`);
  const diaSem = DIAS_SEMANA[dt.getDay()];
  return `${diaSem}, ${dia}/${mes}/${ano}`;
}

// ── Modal de detalhe de faltas ─────────────────────────────────────────────────
function FaltasDetalheModal({ entry, onClose }: { entry: any; onClose: () => void }) {
  if (!entry) return null;
  const datas: string[] = entry.faltasDatas ?? [];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[420px] max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarX2 className="h-5 w-5 text-red-500" />
            Dias de Falta — {entry.nome}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="text-sm text-muted-foreground">
            Função: <strong className="text-slate-700">{entry.funcao}</strong>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold">
              {entry.faltasDias} {entry.faltasDias === 1 ? "dia" : "dias"} de falta
            </span>
            <span className="text-xs text-muted-foreground">registrado(s) no sistema</span>
          </div>

          {datas.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-4">
              Nenhuma data disponível — dados do período anterior à atualização.
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 border-b">
                Datas computadas como falta (sem batida de ponto em nenhuma obra):
              </div>
              <ul className="divide-y max-h-[280px] overflow-auto">
                {datas.map((d, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2.5 hover:bg-red-50/50 transition-colors">
                    <CalendarOff className="h-4 w-4 text-red-400 shrink-0" />
                    <span className="text-sm font-medium">{fmtData(d)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground bg-amber-50 border border-amber-200 rounded p-2">
            ⚠️ "Falta" = dia registrado no sistema como ausência (sem horas trabalhadas em nenhuma obra).
            Pode ser falta real, home office sem lançamento, ou dado não importado do Dixi.
          </p>
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Tabela comparativa mês-a-mês (Rev. 1777) ──────────────────────────────────
type CompMes = { mes: string; resumo: any | null };

function fmtMesCurto(m: string) {
  const [y, mo] = m.split("-");
  return `${MESES_PT[parseInt(mo) - 1]}/${y.slice(2)}`;
}
function pct(a: number, b: number) {
  if (!b) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 1000) / 10;
}

// Lookup estático de classes — Tailwind JIT precisa ver a string completa
const COR_CLASSES: Record<string, { iconText: string; bg: string; iconOnBg: string; chip: string; chartStroke: string; chartFill: string; gradient: string }> = {
  blue:   { iconText: "text-blue-500",   bg: "bg-blue-100",    iconOnBg: "text-blue-600",   chip: "bg-blue-100 text-blue-800 border-blue-300",       chartStroke: "#3b82f6", chartFill: "rgba(59,130,246,0.10)",  gradient: "from-blue-500 to-indigo-600" },
  orange: { iconText: "text-orange-500", bg: "bg-orange-100",  iconOnBg: "text-orange-600", chip: "bg-orange-100 text-orange-800 border-orange-300", chartStroke: "#f59e0b", chartFill: "rgba(245,158,11,0.10)",  gradient: "from-orange-500 to-amber-600" },
  red:    { iconText: "text-red-500",    bg: "bg-red-100",     iconOnBg: "text-red-600",    chip: "bg-red-100 text-red-800 border-red-300",          chartStroke: "#dc2626", chartFill: "rgba(220,38,38,0.10)",   gradient: "from-red-500 to-rose-600" },
  yellow: { iconText: "text-amber-500",  bg: "bg-amber-100",   iconOnBg: "text-amber-600",  chip: "bg-amber-100 text-amber-800 border-amber-300",    chartStroke: "#f59e0b", chartFill: "rgba(245,158,11,0.10)",  gradient: "from-amber-500 to-yellow-600" },
  green:  { iconText: "text-emerald-500",bg: "bg-emerald-100", iconOnBg: "text-emerald-600",chip: "bg-emerald-100 text-emerald-800 border-emerald-300", chartStroke: "#10b981", chartFill: "rgba(16,185,129,0.10)", gradient: "from-emerald-500 to-green-600" },
};
const corOf = (c: string) => COR_CLASSES[c] || COR_CLASSES.blue;

// "lowerIsBetter" = métricas em que SUBIR é ruim (faltas, atrasos, % HE, sem registro)
type LinhaInd = {
  chave: string;
  label: string;
  unidade?: string;
  icone: any;
  cor: string; // tailwind base color (blue, orange, red, etc.) p/ ícones e gradient
  lowerIsBetter: boolean;
  pegar: (r: any) => number;
  format: (v: number) => string;
  alertaPct?: number;
  alertaAbsoluto?: (v: number, ref?: any) => boolean;
  hint?: string;
  acoes?: string[]; // recomendações exibidas no modal quando há atenção
};

const INDICADORES: LinhaInd[] = [
  { chave: "horasTrab", label: "Horas Trabalhadas", icone: Clock, cor: "blue", lowerIsBetter: false,
    pegar: r => r.totalHorasTrab, format: v => `${v.toLocaleString("pt-BR")}h`,
    alertaPct: 15, hint: "Queda forte pode indicar perda de produtividade ou apontamento incompleto.",
    acoes: ["Verificar importação Dixi/iPonto do mês.", "Conferir se obras pararam (chuva, feriado prolongado).", "Cruzar com Diário de Obra: dias em que houve trabalho mas sem ponto.", "Validar se houve mudança de jornada (banco de horas, escala 12x36)."] },
  { chave: "horasExtras", label: "Horas Extras", icone: Timer, cor: "orange", lowerIsBetter: true,
    pegar: r => r.totalHorasExtras, format: v => `${v.toLocaleString("pt-BR")}h`,
    alertaPct: 20, hint: "Alta de HE eleva custo de folha — revisar escalas e dimensionamento.",
    acoes: ["Mapear obras com maior volume de HE (Dashboard Horas Extras).", "Avaliar contratação adicional se HE persistente.", "Revisar dimensionamento da equipe vs. cronograma físico.", "Negociar banco de horas com o sindicato."] },
  { chave: "percHE", label: "% HE / Horas Normais", icone: TrendingUp, cor: "orange", lowerIsBetter: true,
    pegar: r => r.percentualHE, format: v => `${v.toFixed(1)}%`,
    alertaAbsoluto: v => v > 5,
    hint: "Acima de 5% sugere déficit estrutural de pessoal (recomendação interna RH/DP).",
    acoes: ["Se > 5% por 3 meses seguidos: déficit estrutural — abrir vaga.", "Comparar com proporção de HE da concorrência (~3-4% no setor).", "Revisar se previsão orçamentária prevê esse % ou se é estouro."] },
  { chave: "faltas", label: "Faltas (dias)", icone: CalendarOff, cor: "red", lowerIsBetter: true,
    pegar: r => r.totalFaltasDias, format: v => `${v.toLocaleString("pt-BR")} d`,
    alertaPct: 25, hint: "Pico de faltas → checar surto, clima, pagamentos, transporte.",
    acoes: ["Cruzar com atestados médicos: surto sazonal (gripe, dengue)?", "Verificar se houve atraso no pagamento que motivou o pico.", "Conferir transporte coletivo (greve, mudança de itinerário).", "Identificar Top 3 funcionários reincidentes para advertência/RH."] },
  { chave: "atrasos", label: "Atrasos (min)", icone: TrendingDown, cor: "yellow", lowerIsBetter: true,
    pegar: r => r.totalAtrasosMinutos ?? 0,
    format: v => { const h = Math.floor(v / 60); const m = v % 60; return h > 0 ? `${h}h${m ? String(m).padStart(2, "0") + "min" : ""}` : `${m}min`; },
    alertaPct: 30, hint: "Já considera tolerância CLT de 10min/dia. Subindo? Reforçar disciplina.",
    acoes: ["Identificar Top 5 reincidentes (Ranking de Atrasos).", "Reforçar comunicado interno de pontualidade.", "Avaliar reposição via banco de horas ou desconto.", "Verificar se mudou horário do transporte da obra."] },
  { chave: "ativos", label: "Funcionários Ativos", icone: Users, cor: "blue", lowerIsBetter: false,
    pegar: r => r.totalFuncionariosAtivos, format: v => `${v}`,
    alertaPct: 10, hint: "Quedas grandes podem refletir desligamentos em massa.",
    acoes: ["Cruzar com Dashboard Aviso Prévio: desligamentos no mês.", "Avaliar turnover: rotatividade saudável < 5% ao mês.", "Verificar se houve fim de obra (encerramento de equipe inteira)."] },
  { chave: "comReg", label: "Com Registro", icone: CheckCircle2, cor: "green", lowerIsBetter: false,
    pegar: r => r.funcionariosComRegistro, format: v => `${v}`,
    alertaPct: 15, hint: "Cobertura caindo → possível falha na importação Dixi/iPonto.",
    acoes: ["Verificar se a importação Dixi rodou em todos os dias do mês.", "Conferir se há funcionário em afastamento prolongado (atestado, férias).", "Validar se relógios das obras estão online."] },
  { chave: "semReg", label: "Sem Registro", icone: UserX, cor: "red", lowerIsBetter: true,
    pegar: r => r.funcionariosSemRegistro, format: v => `${v}`,
    alertaPct: 20,
    alertaAbsoluto: (v, ref) => ref?.totalFuncionariosAtivos > 0 && (v / ref.totalFuncionariosAtivos) > 0.3,
    hint: "Acima de 30% do quadro sem batida → falta de relógio, perda de dados ou férias coletivas.",
    acoes: ["Verificar se houve férias coletivas no período.", "Conferir se relógios físicos estiveram com defeito.", "Listar funcionários sem registro e cruzar com folga/afastamento.", "Se persistente: rever cadastro (funcionário não está mais ativo?)."] },
  { chave: "cobertura", label: "Cobertura (%)", icone: Target, cor: "blue", lowerIsBetter: false,
    pegar: r => r.totalFuncionariosAtivos > 0 ? Math.round((r.funcionariosComRegistro / r.totalFuncionariosAtivos) * 1000) / 10 : 0,
    format: v => `${v.toFixed(1)}%`,
    alertaAbsoluto: v => v < 70,
    hint: "Abaixo de 70% indica baixa adesão / falha na coleta.",
    acoes: ["Meta interna: ≥ 90% de cobertura mensal.", "Se < 70%: investigar falha sistêmica (importação, integração).", "Treinamento de encarregados sobre obrigatoriedade do ponto."] },
];

// ── Sparkline SVG (sem dependências) ──────────────────────────────────────────
function Sparkline({ values, lowerIsBetter, w = 88, h = 26 }: { values: (number | null)[]; lowerIsBetter: boolean; w?: number; h?: number }) {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length < 2) return <span className="text-[10px] text-slate-300">—</span>;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const xy = (v: number, i: number) => [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / range) * (h - 6)];
  const pts = values.map((v, i) => v == null ? null : xy(v, i)).filter(Boolean) as number[][];
  if (pts.length < 2) return <span className="text-[10px] text-slate-300">—</span>;
  const polyPts = pts.map(p => p.join(",")).join(" ");
  const first = valid[0], last = valid[valid.length - 1];
  const trendUp = last > first;
  const piorou = lowerIsBetter ? trendUp : !trendUp;
  const flat = Math.abs(last - first) < 0.001;
  const stroke = flat ? "#94a3b8" : (piorou ? "#dc2626" : "#10b981");
  const fill = flat ? "rgba(148,163,184,0.10)" : (piorou ? "rgba(220,38,38,0.08)" : "rgba(16,185,129,0.08)");
  const areaPts = `${pts[0][0]},${h} ${polyPts} ${pts[pts.length - 1][0]},${h}`;
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polygon points={areaPts} fill={fill} />
      <polyline points={polyPts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 2.2 : 1.4} fill={stroke} />
      ))}
    </svg>
  );
}

// ── Estatísticas/Insights computados para o modal ─────────────────────────────
function computeStats(valores: (number | null)[], ind: LinhaInd) {
  const valid = valores.map((v, i) => v == null ? null : { v, i }).filter(Boolean) as { v: number; i: number }[];
  if (!valid.length) return null;
  const vals = valid.map(x => x.v);
  const max = valid.reduce((a, b) => b.v > a.v ? b : a);
  const min = valid.reduce((a, b) => b.v < a.v ? b : a);
  const media = vals.reduce((a, b) => a + b, 0) / vals.length;
  const last = valid[valid.length - 1];
  const first = valid[0];
  const tendenciaPct = first.v ? ((last.v - first.v) / first.v) * 100 : 0;
  // Maior alta consecutiva
  let maiorAlta = { de: -1, para: -1, pct: 0 };
  let maiorQueda = { de: -1, para: -1, pct: 0 };
  for (let k = 1; k < valid.length; k++) {
    const d = pct(valid[k].v, valid[k - 1].v);
    if (d > maiorAlta.pct) maiorAlta = { de: valid[k - 1].i, para: valid[k].i, pct: d };
    if (d < maiorQueda.pct) maiorQueda = { de: valid[k - 1].i, para: valid[k].i, pct: d };
  }
  return { max, min, media, last, first, tendenciaPct, maiorAlta, maiorQueda };
}

function gerarInsights(valores: (number | null)[], meses: CompMes[], ind: LinhaInd) {
  const stats = computeStats(valores, ind);
  if (!stats) return [];
  const out: { tipo: "good" | "bad" | "neutral"; texto: string }[] = [];
  const fmt = ind.format;
  const mesNome = (i: number) => fmtMesCurto(meses[i].mes);

  // Tendência geral
  if (Math.abs(stats.tendenciaPct) > 5) {
    const subindo = stats.tendenciaPct > 0;
    const ruim = ind.lowerIsBetter ? subindo : !subindo;
    out.push({
      tipo: ruim ? "bad" : "good",
      texto: `Tendência geral ${subindo ? "de alta" : "de queda"} de ${Math.abs(stats.tendenciaPct).toFixed(1)}% comparando ${mesNome(stats.first.i)} (${fmt(stats.first.v)}) com ${mesNome(stats.last.i)} (${fmt(stats.last.v)}).`,
    });
  }
  // Maior pico
  if (stats.max.v !== stats.min.v) {
    out.push({
      tipo: ind.lowerIsBetter ? "bad" : "good",
      texto: `Maior valor do ano em ${mesNome(stats.max.i)}: ${fmt(stats.max.v)}.`,
    });
    out.push({
      tipo: ind.lowerIsBetter ? "good" : "bad",
      texto: `Menor valor do ano em ${mesNome(stats.min.i)}: ${fmt(stats.min.v)}.`,
    });
  }
  // Maior salto
  if (stats.maiorAlta.pct > 25) {
    const ruim = ind.lowerIsBetter;
    out.push({
      tipo: ruim ? "bad" : "good",
      texto: `Maior alta mensal: +${stats.maiorAlta.pct.toFixed(1)}% de ${mesNome(stats.maiorAlta.de)} → ${mesNome(stats.maiorAlta.para)}.`,
    });
  }
  if (stats.maiorQueda.pct < -25) {
    const ruim = !ind.lowerIsBetter;
    out.push({
      tipo: ruim ? "bad" : "good",
      texto: `Maior queda mensal: ${stats.maiorQueda.pct.toFixed(1)}% de ${mesNome(stats.maiorQueda.de)} → ${mesNome(stats.maiorQueda.para)}.`,
    });
  }
  // Outlier vs média (último mês)
  const desvioUlt = stats.media ? ((stats.last.v - stats.media) / stats.media) * 100 : 0;
  if (Math.abs(desvioUlt) > 30) {
    const ruim = ind.lowerIsBetter ? desvioUlt > 0 : desvioUlt < 0;
    out.push({
      tipo: ruim ? "bad" : "good",
      texto: `Mês atual (${mesNome(stats.last.i)}) está ${desvioUlt > 0 ? "acima" : "abaixo"} da média do ano (${fmt(stats.media)}) em ${Math.abs(desvioUlt).toFixed(0)}%.`,
    });
  }
  return out;
}

// ── Modal full-screen de análise aprofundada ──────────────────────────────────
function IndicadorDetalheModal({
  open, onClose, indIdx, setIndIdx, linhas, meses,
}: {
  open: boolean; onClose: () => void;
  indIdx: number; setIndIdx: (i: number) => void;
  linhas: { ind: LinhaInd; valores: (number | null)[]; atual: number | null; delta: number | null; piorou: boolean; atencao: boolean }[];
  meses: CompMes[];
}) {
  const linha = linhas[indIdx];
  if (!linha) return null;
  const { ind, valores, atual, atencao } = linha;
  const stats = computeStats(valores, ind);
  const insights = gerarInsights(valores, meses, ind);
  const Icon = ind.icone || Activity;
  const cc = corOf(ind.cor);
  const grad = cc.gradient;
  const chip = cc.chip;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        resizable={false}
        showCloseButton={false}
        className="w-[100vw] sm:w-[98vw] max-w-none h-[100dvh] sm:h-[96dvh] max-h-[100dvh] sm:max-h-[96dvh] p-0 gap-0 overflow-hidden flex flex-col rounded-none sm:rounded-lg border-0 sm:border"
      >
        {/* Header gradient */}
        <div className={`bg-gradient-to-r ${grad} text-white p-4 sm:p-6 flex items-center gap-4 shrink-0`}>
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
            <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-white text-lg sm:text-xl font-bold truncate">{ind.label}</DialogTitle>
            <p className="text-white/85 text-xs sm:text-sm mt-0.5">{ind.hint}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-9 w-9" onClick={() => setIndIdx((indIdx - 1 + linhas.length) % linhas.length)} title="Indicador anterior" aria-label="Indicador anterior">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-9 w-9" onClick={() => setIndIdx((indIdx + 1) % linhas.length)} title="Próximo indicador" aria-label="Próximo indicador">
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-9 w-9" onClick={onClose} aria-label="Fechar análise">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5 bg-slate-50/40">
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm">
              <div className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">Mês atual</div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {atual == null ? "—" : ind.format(atual)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{fmtMesCurto(meses[meses.length - 1].mes)}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm">
              <div className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">Média do ano</div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {stats ? ind.format(stats.media) : "—"}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{valores.filter(v => v != null).length} meses</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm">
              <div className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">Maior valor</div>
              <div className={`text-xl sm:text-2xl font-bold mt-1 tabular-nums ${ind.lowerIsBetter ? "text-rose-700" : "text-emerald-700"}`}>
                {stats ? ind.format(stats.max.v) : "—"}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{stats ? fmtMesCurto(meses[stats.max.i].mes) : "—"}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm">
              <div className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">Menor valor</div>
              <div className={`text-xl sm:text-2xl font-bold mt-1 tabular-nums ${ind.lowerIsBetter ? "text-emerald-700" : "text-rose-700"}`}>
                {stats ? ind.format(stats.min.v) : "—"}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{stats ? fmtMesCurto(meses[stats.min.i].mes) : "—"}</div>
            </div>
          </div>

          {/* Gráfico de evolução */}
          <Card className="bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-slate-600" />
                Evolução mensal
                <span className={`ml-auto inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 ${chip}`}>
                  {ind.lowerIsBetter ? "Quanto menor, melhor" : "Quanto maior, melhor"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {valores.filter(v => v != null).length < 2 ? (
                <div className="h-[260px] flex flex-col items-center justify-center text-slate-400 gap-2">
                  <BarChart3 className="h-10 w-10 opacity-40" />
                  <span className="text-sm">Dados insuficientes para traçar evolução (mínimo 2 meses).</span>
                </div>
              ) : (
                <DashChart
                  title=""
                  type="line"
                  labels={meses.map(m => fmtMesCurto(m.mes))}
                  datasets={[{
                    label: ind.label,
                    data: valores.map(v => v as any),
                    borderColor: cc.chartStroke,
                    backgroundColor: cc.chartFill,
                    fill: true,
                    tension: 0.3,
                    spanGaps: true,
                  } as any]}
                  height={260}
                />
              )}
            </CardContent>
          </Card>

          {/* Detalhamento mês-a-mês (cards) */}
          <Card className="bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-slate-600" />
                Detalhamento mensal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {valores.map((v, i) => {
                  const ant = i > 0 ? valores[i - 1] : null;
                  const d = (v != null && ant != null) ? pct(v, ant) : null;
                  const piorou = d != null && (ind.lowerIsBetter ? d > 0 : d < 0);
                  const isAtual = i === valores.length - 1;
                  return (
                    <div key={i} className={`rounded-lg border p-2.5 ${isAtual ? "border-blue-300 bg-blue-50/60" : "border-slate-200 bg-white"}`}>
                      <div className={`text-[10px] uppercase font-bold tracking-wide ${isAtual ? "text-blue-700" : "text-slate-500"}`}>
                        {fmtMesCurto(meses[i].mes)} {isAtual && <span className="ml-1">·atual</span>}
                      </div>
                      <div className={`text-base font-bold tabular-nums mt-0.5 ${isAtual ? "text-blue-900" : "text-slate-800"}`}>
                        {v == null ? <span className="text-slate-300">—</span> : ind.format(v)}
                      </div>
                      {d != null && Math.abs(d) >= 0.1 && (
                        <div className={`text-[11px] font-semibold mt-0.5 inline-flex items-center gap-0.5 ${piorou ? "text-red-600" : "text-emerald-600"}`}>
                          {d > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {d > 0 ? "+" : ""}{d.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Rev. 1779b — Funcionários por mês (rastreio de "meliantes") */}
          <Card className="bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-600" />
                Funcionários por mês — {ind.label}
                <span className="ml-auto text-[10px] text-slate-500 font-normal">
                  {ind.chave === "ativos" ? "amostra de até 30" :
                   (ind.chave === "semReg" || ind.chave === "cobertura") ? "ativos sem nenhuma batida" :
                   "top 10 por mês"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {meses.map((m, mi) => {
                  const topAll: any[] = (m.resumo as any)?.topPorIndicador?.[ind.chave] || [];
                  const isAtual = mi === meses.length - 1;
                  const totalIndicador = m.resumo ? ind.pegar(m.resumo) : null;
                  return (
                    <div key={mi} className={`rounded-lg border p-3 ${isAtual ? "border-blue-300 bg-blue-50/40" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[11px] font-bold uppercase tracking-wide ${isAtual ? "text-blue-700" : "text-slate-600"}`}>
                          {fmtMesCurto(m.mes)} {isAtual && <span className="ml-1 text-blue-600">·atual</span>}
                        </span>
                        {totalIndicador != null && (
                          <span className="text-[11px] text-slate-500 tabular-nums">
                            total: <span className="font-semibold text-slate-700">{ind.format(totalIndicador)}</span>
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-slate-400">{topAll.length} func.</span>
                      </div>
                      {topAll.length === 0 ? (
                        <div className="text-[12px] text-slate-400 italic py-1">Sem dados de funcionários neste mês.</div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                          {topAll.map((f, fi) => (
                            <div key={`${f.employeeId}-${fi}`} className={`flex items-start gap-2 px-2 py-1.5 rounded-md border ${f.isDesligado ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}>
                              <span className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                                fi === 0 ? "bg-amber-200 text-amber-800" :
                                fi === 1 ? "bg-slate-200 text-slate-700" :
                                fi === 2 ? "bg-orange-200 text-orange-800" :
                                "bg-slate-100 text-slate-500"
                              }`}>{fi + 1}</span>
                              <div className="min-w-0 flex-1">
                                <div className={`text-[12px] font-semibold leading-tight truncate ${f.isDesligado ? "text-slate-500 line-through" : "text-slate-800"}`} title={f.nome}>
                                  {f.nome}
                                </div>
                                <div className="text-[10px] text-slate-500 truncate" title={f.funcao}>{f.funcao}</div>
                                {f.extra && (
                                  <div className="text-[10px] text-slate-600 mt-0.5 leading-tight">{f.extra}</div>
                                )}
                              </div>
                              {(ind.chave !== "semReg" && ind.chave !== "cobertura" && ind.chave !== "ativos") && (
                                <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-700">
                                  {ind.chave === "atrasos" ? "" :
                                   ind.chave === "percHE" ? `${f.valor.toFixed(1)}%` :
                                   ind.chave === "faltas" ? `${f.valor}d` :
                                   `${f.valor.toFixed(1)}h`}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Insights automáticos */}
          {insights.length > 0 && (
            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  Insights da série
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {insights.map((ins, i) => (
                  <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg text-sm ${
                    ins.tipo === "bad" ? "bg-red-50 border border-red-200 text-red-900" :
                    ins.tipo === "good" ? "bg-emerald-50 border border-emerald-200 text-emerald-900" :
                    "bg-slate-50 border border-slate-200 text-slate-800"
                  }`}>
                    {ins.tipo === "bad" ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> :
                     ins.tipo === "good" ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> :
                     <Info className="h-4 w-4 mt-0.5 shrink-0" />}
                    <span>{ins.texto}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recomendações de ação (se há atenção ou ações cadastradas) */}
          {ind.acoes && ind.acoes.length > 0 && (
            <Card className={atencao ? "border-amber-300 bg-amber-50/40" : "bg-white"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lightbulb className={`h-4 w-4 ${atencao ? "text-amber-600" : "text-slate-600"}`} />
                  {atencao ? "Recomendações de ação" : "Boas práticas"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {ind.acoes.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${atencao ? "bg-amber-200 text-amber-800" : "bg-slate-200 text-slate-700"}`}>{i + 1}</span>
                      <span className="leading-snug">{a}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer com nav */}
        <div className="border-t bg-white px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
          <Button variant="outline" size="sm" onClick={() => setIndIdx((indIdx - 1 + linhas.length) % linhas.length)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> {linhas[(indIdx - 1 + linhas.length) % linhas.length].ind.label}
          </Button>
          <span className="text-xs text-slate-500 hidden sm:block">{indIdx + 1} de {linhas.length} indicadores</span>
          <Button variant="outline" size="sm" onClick={() => setIndIdx((indIdx + 1) % linhas.length)}>
            {linhas[(indIdx + 1) % linhas.length].ind.label} <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Tabela comparativa principal ──────────────────────────────────────────────
function TabelaComparativa({ data, isLoading, mesAtual }: { data: { meses: CompMes[] } | null | undefined; isLoading: boolean; mesAtual: string }) {
  const [modalIdx, setModalIdx] = useState<number | null>(null);

  if (isLoading) return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Tendência mês-a-mês</CardTitle></CardHeader>
      <CardContent className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></CardContent>
    </Card>
  );
  if (!data || !data.meses.length) return null;

  const meses = data.meses;
  const atualIdx = meses.length - 1;
  const anteriorIdx = atualIdx - 1;

  const linhas = INDICADORES.map(ind => {
    const valores = meses.map(m => m.resumo ? ind.pegar(m.resumo) : null);
    const atual = valores[atualIdx];
    const ant = anteriorIdx >= 0 ? valores[anteriorIdx] : null;
    const delta = (atual != null && ant != null) ? pct(atual, ant) : null;
    const piorou = (delta != null) && (ind.lowerIsBetter ? delta > 0 : delta < 0);
    const alertaPct = piorou && ind.alertaPct != null && Math.abs(delta!) >= ind.alertaPct;
    const alertaAbs = atual != null && ind.alertaAbsoluto?.(atual, meses[atualIdx].resumo);
    const atencao = !!(alertaPct || alertaAbs);
    return { ind, valores, atual, delta, piorou, atencao };
  });

  const corDelta = (l: typeof linhas[0]) => {
    if (l.delta == null || Math.abs(l.delta) < 0.1) return "text-slate-500";
    return l.piorou ? "text-red-600" : "text-emerald-600";
  };
  const IconDelta = ({ d, piorou }: { d: number | null; piorou: boolean }) => {
    if (d == null || Math.abs(d) < 0.1) return <Minus className="h-3.5 w-3.5 text-slate-400" />;
    if (d > 0) return piorou ? <TrendingUp className="h-3.5 w-3.5 text-red-600" /> : <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />;
    return piorou ? <TrendingDown className="h-3.5 w-3.5 text-red-600" /> : <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />;
  };

  const totalAtencao = linhas.filter(l => l.atencao).length;

  return (
    <>
    <Card className="border-slate-200 overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-slate-50 via-blue-50/40 to-indigo-50/30 border-b">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <TrendUpIcon className="h-4 w-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-800">Tendência mês-a-mês</div>
              <div className="text-[11px] font-normal text-slate-500">Janeiro a {fmtMesCurto(meses[atualIdx].mes)} · clique para análise aprofundada</div>
            </div>
          </div>
          {totalAtencao > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-2.5 py-1">
              <AlertTriangle className="h-3 w-3" />
              {totalAtencao} para observar
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-300 rounded-full px-2.5 py-1">
              <CheckCircle2 className="h-3 w-3" />
              Tudo dentro do esperado
            </span>
          )}
        </CardTitle>
        {/* Legenda */}
        <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-slate-200/60">
          <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Legenda:</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-700"><TrendingUp className="h-3 w-3 text-emerald-600" /> melhora</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-700"><TrendingDown className="h-3 w-3 text-red-600" /> piora</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-700"><Minus className="h-3 w-3 text-slate-400" /> estável</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-700"><span className="inline-block w-3 h-3 rounded bg-blue-100 border border-blue-300" /> mês de referência</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-700"><span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-300" /> precisa observar</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-500"><Maximize2 className="h-3 w-3" /> clique em qualquer indicador</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* DESKTOP: tabela */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b text-slate-700">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold sticky left-0 bg-slate-50 z-10 min-w-[200px]">Indicador</th>
                {meses.map((m, i) => (
                  <th key={m.mes} className={`text-right px-3 py-2.5 font-semibold whitespace-nowrap ${i === atualIdx ? "bg-blue-100 text-blue-900" : ""}`}>
                    {fmtMesCurto(m.mes)}
                    {i === atualIdx && <div className="text-[9px] font-normal text-blue-700">atual</div>}
                  </th>
                ))}
                <th className="text-center px-2 py-2.5 font-semibold whitespace-nowrap min-w-[100px]">Tendência</th>
                <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap">Δ vs ant.</th>
                <th className="text-center px-3 py-2.5 font-semibold whitespace-nowrap">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, idx) => {
                const Icon = l.ind.icone || Activity;
                return (
                  <tr
                    key={l.ind.chave}
                    onClick={() => setModalIdx(idx)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setModalIdx(idx); } }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Abrir análise aprofundada de ${l.ind.label}`}
                    className={`border-b last:border-0 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${l.atencao ? "bg-amber-50/40 hover:bg-amber-100/40" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-3 py-2.5 sticky left-0 bg-inherit z-10 font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${corOf(l.ind.cor).iconText}`} />
                        <span className="truncate">{l.ind.label}</span>
                        {l.ind.hint && (
                          <span title={l.ind.hint}>
                            <Info className="h-3 w-3 text-slate-400 hover:text-slate-600" />
                          </span>
                        )}
                      </div>
                    </td>
                    {l.valores.map((v, i) => (
                      <td key={i} className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${i === atualIdx ? "bg-blue-50/60 font-bold text-blue-900" : "text-slate-700"}`}>
                        {v == null ? <span className="text-slate-300">—</span> : l.ind.format(v)}
                      </td>
                    ))}
                    <td className="px-2 py-2.5 text-center">
                      <Sparkline values={l.valores} lowerIsBetter={l.ind.lowerIsBetter} />
                    </td>
                    <td className={`px-3 py-2.5 text-right whitespace-nowrap font-semibold ${corDelta(l)}`}>
                      <span className="inline-flex items-center gap-1 justify-end">
                        <IconDelta d={l.delta} piorou={l.piorou} />
                        {l.delta == null ? "—" : `${l.delta > 0 ? "+" : ""}${l.delta.toFixed(1)}%`}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {l.atencao ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5">
                          <AlertTriangle className="h-3 w-3" /> Observar
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                          <CheckCircle2 className="h-3 w-3" /> OK
                        </span>
                      )}
                    </td>
                    <td className="pr-3">
                      <Maximize2 className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* MOBILE: cards */}
        <div className="md:hidden divide-y">
          {linhas.map((l, idx) => {
            const Icon = l.ind.icone || Activity;
            return (
              <button
                key={l.ind.chave}
                onClick={() => setModalIdx(idx)}
                className={`w-full text-left p-3 transition-colors ${l.atencao ? "bg-amber-50/40 active:bg-amber-100" : "active:bg-slate-50"}`}
              >
                <div className="flex items-start gap-2.5">
                  <div className={`shrink-0 w-8 h-8 rounded-lg ${corOf(l.ind.cor).bg} flex items-center justify-center`}>
                    <Icon className={`h-4 w-4 ${corOf(l.ind.cor).iconOnBg}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800 truncate">{l.ind.label}</span>
                      {l.atencao && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                    </div>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-lg font-bold text-slate-900 tabular-nums">{l.atual == null ? "—" : l.ind.format(l.atual)}</span>
                      {l.delta != null && Math.abs(l.delta) >= 0.1 && (
                        <span className={`text-xs font-semibold inline-flex items-center gap-0.5 ${corDelta(l)}`}>
                          <IconDelta d={l.delta} piorou={l.piorou} />
                          {l.delta > 0 ? "+" : ""}{l.delta.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">vs {anteriorIdx >= 0 ? fmtMesCurto(meses[anteriorIdx].mes) : "—"}</div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <Sparkline values={l.valores} lowerIsBetter={l.ind.lowerIsBetter} w={64} h={22} />
                    <Maximize2 className="h-3 w-3 text-slate-400" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {totalAtencao > 0 && (
          <div className="px-3 py-2.5 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
            <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span><strong>Toque/clique</strong> em um indicador em destaque para ver gráfico, estatísticas, insights automáticos e recomendações de ação.</span>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Modal de análise */}
    {modalIdx != null && (
      <IndicadorDetalheModal
        open={modalIdx != null}
        onClose={() => setModalIdx(null)}
        indIdx={modalIdx}
        setIndIdx={setModalIdx}
        linhas={linhas}
        meses={meses}
      />
    )}
    </>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function DashCartaoPonto() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const _now = new Date();
  const [ano, setAno] = useState(_now.getFullYear());
  const [mes, setMes] = useState(_now.getMonth() + 1);
  const mesStr = useMemo(() => `${ano}-${String(mes).padStart(2, "0")}`, [ano, mes]);
  const { data, isLoading } = trpc.dashboards.cartaoPonto.useQuery(
    { companyId: queryCompanyId, mesReferencia: mesStr, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  // Rev. 1777 — comparativo do ano corrente (Jan → mês atual)
  const { data: compData, isLoading: compLoading } = trpc.dashboards.cartaoPontoComparativo.useQuery(
    { companyId: queryCompanyId, mesReferencia: mesStr, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const [, navigate] = useLocation();
  const [faltasDetalhe, setFaltasDetalhe] = useState<any>(null);

  const mesLabel = useMemo(() => `${MESES_PT[mes - 1]}/${ano}`, [ano, mes]);

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboards" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /> Voltar aos Dashboards</Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard Cartão de Ponto</h1>
            <p className="text-muted-foreground text-sm mt-1">Análise de frequência, faltas e atrasos — {mesLabel}</p>
          </div>
          <PrintActions title="Dashboard Cartão de Ponto" />
        </div>

        {/* Seletor de período — padrão ERP */}
        <PeriodSelectorCard ano={ano} mes={mes} onAno={setAno} onMes={setMes} />

        {!data ? (
          <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
        ) : (
          <>
            {/* KPIs - Linha 1 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate("/fechamento-ponto")}>
                <DashKpi label="Horas Trabalhadas" value={data.resumo.totalHorasTrab.toLocaleString("pt-BR")} icon={Clock} color="blue" sub={`${data.resumo.totalRegistros} registros`} />
              </div>
              <div className="cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate("/dashboards/horas-extras")}>
                <DashKpi
                  label="Horas Extras"
                  value={data.resumo.totalHorasExtras.toLocaleString("pt-BR")}
                  icon={Timer}
                  color="orange"
                  sub={`${data.resumo.percentualHE}% das horas normais`}
                />
              </div>
              <div className="cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate("/fechamento-ponto")}>
                <DashKpi
                  label="Faltas"
                  value={`${data.resumo.totalFaltasDias} dias`}
                  icon={CalendarOff}
                  color="red"
                />
              </div>
              <div className="cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate("/fechamento-ponto")}>
                <DashKpi
                  label="Atrasos"
                  value={data.resumo.totalAtrasosFormatado || "0h"}
                  icon={TrendingDown}
                  color="yellow"
                  sub="CLT Art.58 §1º (tol. 10min)"
                />
              </div>
            </div>

            {/* KPIs - Linha 2 */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate("/colaboradores")}>
                <DashKpi label="Funcionários Ativos" value={data.resumo.totalFuncionariosAtivos} icon={Users} color="blue" />
              </div>
              <div className="cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate("/fechamento-ponto")}>
                <DashKpi label="Com Registro" value={data.resumo.funcionariosComRegistro} icon={Users} color="green" sub={`${data.resumo.totalFuncionariosAtivos > 0 ? Math.round((data.resumo.funcionariosComRegistro / data.resumo.totalFuncionariosAtivos) * 100) : 0}% do total`} />
              </div>
              <div className="cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate("/fechamento-ponto")}>
                <DashKpi label="Sem Registro" value={data.resumo.funcionariosSemRegistro} icon={UserX} color="red" sub="Sem batida no mês" />
              </div>
            </div>

            {/* Evolução diária */}
            {data.evolucaoDiaria.length > 0 && (
              <DashChart
                title="Horas Trabalhadas por Dia"
                type="line"
                labels={data.evolucaoDiaria.map((d: any) => { const parts = d.data.split("-"); return `${parts[2]}/${parts[1]}`; })}
                datasets={[{
                  label: "Horas",
                  data: data.evolucaoDiaria.map((d: any) => d.horas),
                  borderColor: CHART_PALETTE[0],
                  backgroundColor: CHART_FILL.azul,
                  fill: true,
                  tension: 0.3,
                }]}
                height={280}
              />
            )}

            {/* Horas por dia da semana */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DashChart
                title="Horas por Dia da Semana"
                type="bar"
                labels={data.porDiaSemana.map((d: any) => d.dia)}
                datasets={[{
                  label: "Horas",
                  data: data.porDiaSemana.map((d: any) => d.horas),
                  backgroundColor: [SEMANTIC_COLORS.negativo, CHART_PALETTE[0], CHART_PALETTE[0], CHART_PALETTE[0], CHART_PALETTE[0], CHART_PALETTE[0], SEMANTIC_COLORS.alerta],
                }]}
                height={260}
              />
              <DashChart
                title="Registros por Dia da Semana"
                type="bar"
                labels={data.porDiaSemana.map((d: any) => d.dia)}
                datasets={[{
                  label: "Registros",
                  data: data.porDiaSemana.map((d: any) => d.registros),
                  backgroundColor: CHART_PALETTE[1],
                }]}
                height={260}
              />
            </div>

            {/* Rankings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Ranking de Faltas (em DIAS) — clicável para ver os dias */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CalendarOff className="h-4 w-4 text-red-500" />
                    Ranking de Faltas — Top 10
                    <span className="text-[10px] font-normal text-muted-foreground ml-auto">(clique para ver os dias)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.rankingFaltas.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma falta registrada no período</p>
                  ) : (
                    <div className="space-y-1">
                      {data.rankingFaltas.map((r: any, i: number) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-2 px-2 border-b border-border/50 last:border-0 rounded hover:bg-red-50 cursor-pointer transition-colors"
                          onClick={() => setFaltasDetalhe(r)}
                          title="Clique para ver os dias de falta deste funcionário"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${i < 3 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium"><EmpNameWithStatus nome={r.nome} isDesligado={r.isDesligado} /></p>
                              <p className="text-xs text-muted-foreground">{r.funcao}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-sm font-bold text-red-600">
                              {r.faltasDias === 1 ? "1 dia" : `${r.faltasDias % 1 === 0 ? r.faltasDias : r.faltasDias.toFixed(1)} dias`}
                            </span>
                            <CalendarX2 className="h-3.5 w-3.5 text-red-400" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Ranking de Atrasos (hh:mm com tolerância CLT) */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-amber-500" />
                    Ranking de Atrasos — Top 10
                    <span className="text-[10px] font-normal text-muted-foreground ml-auto flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      CLT Art.58 §1º (tol. 10min/dia)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.rankingAtrasos.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhum atraso acima da tolerância legal</p>
                  ) : (
                    <div className="space-y-1">
                      {data.rankingAtrasos.map((r: any, i: number) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-2 px-2 border-b border-border/50 last:border-0 rounded hover:bg-amber-50 cursor-pointer transition-colors"
                          onClick={() => r.employeeId && navigate(`/fechamento-ponto?funcionario=${r.employeeId}&mes=${mes}`)}
                          title="Clique para ver os registros de ponto deste funcionário"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${i < 3 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium"><EmpNameWithStatus nome={r.nome} isDesligado={r.isDesligado} /></p>
                              <p className="text-xs text-muted-foreground">{r.funcao}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-sm font-bold text-amber-600">{r.atrasosFormatado}</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Tabela comparativa mês-a-mês (Rev. 1777) */}
            <TabelaComparativa data={compData as any} isLoading={compLoading} mesAtual={mes} />

            {/* Nota legal */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>CLT Art. 58, §1º:</strong> Não serão descontadas nem computadas como jornada extraordinária as variações de horário no registro de ponto não excedentes de 5 minutos por marcação, observado o limite máximo de 10 minutos diários. Atrasos de até 10 minutos/dia estão dentro da tolerância legal e não são contabilizados neste dashboard.
              </div>
            </div>
          </>
        )}
      </div>
      <PrintFooterLGPD />

      {/* Modal de detalhe de faltas */}
      {faltasDetalhe && (
        <FaltasDetalheModal entry={faltasDetalhe} onClose={() => setFaltasDetalhe(null)} />
      )}
    </DashboardLayout>
  );
}
