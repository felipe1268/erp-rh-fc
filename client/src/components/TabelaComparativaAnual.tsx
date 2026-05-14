import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import DashChart from "@/components/DashChart";
import {
  TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight, X,
  AlertTriangle, CheckCircle2, Info, Sparkles, Lightbulb, BarChart3,
  CalendarDays, Activity, Loader2,
} from "lucide-react";

const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export type CompMes = { mes: string; resumo: any | null };

export type LinhaInd = {
  chave: string;
  label: string;
  unidade?: string;
  icone: any;
  cor: "blue" | "orange" | "red" | "yellow" | "green" | "purple" | "teal" | "pink";
  lowerIsBetter: boolean;
  pegar: (r: any) => number;
  format: (v: number) => string;
  alertaPct?: number;
  alertaAbsoluto?: (v: number, ref?: any) => boolean;
  hint?: string;
  acoes?: string[];
};

function fmtMesCurto(m: string) {
  const [y, mo] = m.split("-");
  return `${MESES_PT[parseInt(mo) - 1]}/${y.slice(2)}`;
}
function pct(a: number, b: number) {
  if (!b) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 1000) / 10;
}

export const COR_CLASSES: Record<string, { iconText: string; bg: string; iconOnBg: string; chip: string; chartStroke: string; chartFill: string; gradient: string }> = {
  blue:   { iconText: "text-blue-500",     bg: "bg-blue-100",     iconOnBg: "text-blue-600",   chip: "bg-blue-100 text-blue-800 border-blue-300",       chartStroke: "#3b82f6", chartFill: "rgba(59,130,246,0.10)",  gradient: "from-blue-500 to-indigo-600" },
  orange: { iconText: "text-orange-500",   bg: "bg-orange-100",   iconOnBg: "text-orange-600", chip: "bg-orange-100 text-orange-800 border-orange-300", chartStroke: "#f59e0b", chartFill: "rgba(245,158,11,0.10)",  gradient: "from-orange-500 to-amber-600" },
  red:    { iconText: "text-red-500",      bg: "bg-red-100",      iconOnBg: "text-red-600",    chip: "bg-red-100 text-red-800 border-red-300",          chartStroke: "#dc2626", chartFill: "rgba(220,38,38,0.10)",   gradient: "from-red-500 to-rose-600" },
  yellow: { iconText: "text-amber-500",    bg: "bg-amber-100",    iconOnBg: "text-amber-600",  chip: "bg-amber-100 text-amber-800 border-amber-300",    chartStroke: "#f59e0b", chartFill: "rgba(245,158,11,0.10)",  gradient: "from-amber-500 to-yellow-600" },
  green:  { iconText: "text-emerald-500",  bg: "bg-emerald-100",  iconOnBg: "text-emerald-600",chip: "bg-emerald-100 text-emerald-800 border-emerald-300", chartStroke: "#10b981", chartFill: "rgba(16,185,129,0.10)", gradient: "from-emerald-500 to-green-600" },
  purple: { iconText: "text-purple-500",   bg: "bg-purple-100",   iconOnBg: "text-purple-600", chip: "bg-purple-100 text-purple-800 border-purple-300", chartStroke: "#8b5cf6", chartFill: "rgba(139,92,246,0.10)",  gradient: "from-purple-500 to-violet-600" },
  teal:   { iconText: "text-teal-500",     bg: "bg-teal-100",     iconOnBg: "text-teal-600",   chip: "bg-teal-100 text-teal-800 border-teal-300",       chartStroke: "#14b8a6", chartFill: "rgba(20,184,166,0.10)",  gradient: "from-teal-500 to-cyan-600" },
  pink:   { iconText: "text-pink-500",     bg: "bg-pink-100",     iconOnBg: "text-pink-600",   chip: "bg-pink-100 text-pink-800 border-pink-300",       chartStroke: "#ec4899", chartFill: "rgba(236,72,153,0.10)",  gradient: "from-pink-500 to-rose-600" },
};
const corOf = (c: string) => COR_CLASSES[c] || COR_CLASSES.blue;

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

function computeStats(valores: (number | null)[]) {
  const valid = valores.map((v, i) => v == null ? null : { v, i }).filter(Boolean) as { v: number; i: number }[];
  if (!valid.length) return null;
  const vals = valid.map(x => x.v);
  const max = valid.reduce((a, b) => b.v > a.v ? b : a);
  const min = valid.reduce((a, b) => b.v < a.v ? b : a);
  const media = vals.reduce((a, b) => a + b, 0) / vals.length;
  const last = valid[valid.length - 1];
  const first = valid[0];
  const tendenciaPct = first.v ? ((last.v - first.v) / first.v) * 100 : 0;
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
  const stats = computeStats(valores);
  if (!stats) return [];
  const out: { tipo: "good" | "bad" | "neutral"; texto: string }[] = [];
  const fmt = ind.format;
  const mesNome = (i: number) => fmtMesCurto(meses[i].mes);
  if (Math.abs(stats.tendenciaPct) > 5) {
    const subindo = stats.tendenciaPct > 0;
    const ruim = ind.lowerIsBetter ? subindo : !subindo;
    out.push({ tipo: ruim ? "bad" : "good", texto: `Tendência geral ${subindo ? "de alta" : "de queda"} de ${Math.abs(stats.tendenciaPct).toFixed(1)}% comparando ${mesNome(stats.first.i)} (${fmt(stats.first.v)}) com ${mesNome(stats.last.i)} (${fmt(stats.last.v)}).` });
  }
  if (stats.max.v !== stats.min.v) {
    out.push({ tipo: ind.lowerIsBetter ? "bad" : "good", texto: `Maior valor do ano em ${mesNome(stats.max.i)}: ${fmt(stats.max.v)}.` });
    out.push({ tipo: ind.lowerIsBetter ? "good" : "bad", texto: `Menor valor do ano em ${mesNome(stats.min.i)}: ${fmt(stats.min.v)}.` });
  }
  if (stats.maiorAlta.pct > 25) {
    out.push({ tipo: ind.lowerIsBetter ? "bad" : "good", texto: `Maior alta mensal: +${stats.maiorAlta.pct.toFixed(1)}% de ${mesNome(stats.maiorAlta.de)} → ${mesNome(stats.maiorAlta.para)}.` });
  }
  if (stats.maiorQueda.pct < -25) {
    out.push({ tipo: !ind.lowerIsBetter ? "bad" : "good", texto: `Maior queda mensal: ${stats.maiorQueda.pct.toFixed(1)}% de ${mesNome(stats.maiorQueda.de)} → ${mesNome(stats.maiorQueda.para)}.` });
  }
  const desvioUlt = stats.media ? ((stats.last.v - stats.media) / stats.media) * 100 : 0;
  if (Math.abs(desvioUlt) > 30) {
    const ruim = ind.lowerIsBetter ? desvioUlt > 0 : desvioUlt < 0;
    out.push({ tipo: ruim ? "bad" : "good", texto: `Mês atual (${mesNome(stats.last.i)}) está ${desvioUlt > 0 ? "acima" : "abaixo"} da média do ano (${fmt(stats.media)}) em ${Math.abs(desvioUlt).toFixed(0)}%.` });
  }
  return out;
}

type Linha = { ind: LinhaInd; valores: (number | null)[]; atual: number | null; delta: number | null; piorou: boolean; atencao: boolean };

function IndicadorDetalheModal({ open, onClose, indIdx, setIndIdx, linhas, meses }: {
  open: boolean; onClose: () => void;
  indIdx: number; setIndIdx: (i: number) => void;
  linhas: Linha[]; meses: CompMes[];
}) {
  const linha = linhas[indIdx];
  if (!linha) return null;
  const { ind, valores, atual, atencao } = linha;
  const stats = computeStats(valores);
  const insights = gerarInsights(valores, meses, ind);
  const Icon = ind.icone || Activity;
  const cc = corOf(ind.cor);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[98vw] max-w-[1280px] h-[95vh] max-h-[95vh] p-0 gap-0 overflow-hidden flex flex-col">
        <div className={`bg-gradient-to-r ${cc.gradient} text-white p-4 sm:p-6 flex items-center gap-4 shrink-0`}>
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
            <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-white text-lg sm:text-xl font-bold truncate">{ind.label}</DialogTitle>
            {ind.hint && <p className="text-white/85 text-xs sm:text-sm mt-0.5">{ind.hint}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-9 w-9" onClick={() => setIndIdx((indIdx - 1 + linhas.length) % linhas.length)} title="Indicador anterior" aria-label="Indicador anterior"><ChevronLeft className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-9 w-9" onClick={() => setIndIdx((indIdx + 1) % linhas.length)} title="Próximo indicador" aria-label="Próximo indicador"><ChevronRight className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-9 w-9" onClick={onClose} aria-label="Fechar análise"><X className="h-5 w-5" /></Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5 bg-slate-50/40">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm">
              <div className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">Mês atual</div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 tabular-nums">{atual == null ? "—" : ind.format(atual)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{fmtMesCurto(meses[meses.length - 1].mes)}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm">
              <div className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">Média do ano</div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 tabular-nums">{stats ? ind.format(stats.media) : "—"}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{valores.filter(v => v != null).length} meses</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm">
              <div className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">Maior valor</div>
              <div className={`text-xl sm:text-2xl font-bold mt-1 tabular-nums ${ind.lowerIsBetter ? "text-rose-700" : "text-emerald-700"}`}>{stats ? ind.format(stats.max.v) : "—"}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{stats ? fmtMesCurto(meses[stats.max.i].mes) : "—"}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm">
              <div className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">Menor valor</div>
              <div className={`text-xl sm:text-2xl font-bold mt-1 tabular-nums ${ind.lowerIsBetter ? "text-emerald-700" : "text-rose-700"}`}>{stats ? ind.format(stats.min.v) : "—"}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{stats ? fmtMesCurto(meses[stats.min.i].mes) : "—"}</div>
            </div>
          </div>

          <Card className="bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-slate-600" />
                Evolução mensal
                <span className={`ml-auto inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 ${cc.chip}`}>
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

          {insights.length > 0 && (
            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-blue-600" />Insights da série</CardTitle>
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

        <div className="border-t bg-white px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
          <Button variant="outline" size="sm" onClick={() => setIndIdx((indIdx - 1 + linhas.length) % linhas.length)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> <span className="truncate max-w-[160px]">{linhas[(indIdx - 1 + linhas.length) % linhas.length].ind.label}</span>
          </Button>
          <span className="text-xs text-slate-500 hidden sm:block">{indIdx + 1} de {linhas.length} indicadores</span>
          <Button variant="outline" size="sm" onClick={() => setIndIdx((indIdx + 1) % linhas.length)}>
            <span className="truncate max-w-[160px]">{linhas[(indIdx + 1) % linhas.length].ind.label}</span> <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TabelaComparativaAnual({
  meses, indicadores, isLoading, titulo, subtitulo,
}: {
  meses: CompMes[];
  indicadores: LinhaInd[];
  isLoading?: boolean;
  titulo?: string;
  subtitulo?: string;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  if (isLoading) {
    return (
      <Card className="bg-white">
        <CardContent className="py-10 flex items-center justify-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando comparativo anual…
        </CardContent>
      </Card>
    );
  }
  if (!meses || meses.length === 0) return null;

  const linhas: Linha[] = indicadores.map(ind => {
    const valores = meses.map(m => {
      if (!m.resumo) return null;
      const v = ind.pegar(m.resumo);
      return Number.isFinite(v) ? Number(v) : null;
    });
    const atual = valores[valores.length - 1];
    const ant = valores.length > 1 ? valores[valores.length - 2] : null;
    const delta = (atual != null && ant != null) ? pct(atual, ant) : null;
    const piorou = delta != null ? (ind.lowerIsBetter ? delta > 0 : delta < 0) : false;
    let atencao = false;
    if (atual != null) {
      if (ind.alertaAbsoluto && ind.alertaAbsoluto(atual, meses[meses.length - 1].resumo)) atencao = true;
      else if (delta != null && ind.alertaPct && Math.abs(delta) >= ind.alertaPct && piorou) atencao = true;
    }
    return { ind, valores, atual, delta, piorou, atencao };
  });

  const qtdAtencao = linhas.filter(l => l.atencao).length;
  const tit = titulo || "Tendência mês-a-mês";
  const sub = subtitulo || `${fmtMesCurto(meses[0].mes)} a ${fmtMesCurto(meses[meses.length - 1].mes)} · clique numa linha para análise aprofundada`;

  return (
    <Card className="bg-white border-slate-200">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              {tit}
              {qtdAtencao > 0 ? (
                <span className="text-[10px] uppercase font-bold bg-amber-100 text-amber-800 border border-amber-300 rounded-full px-2 py-0.5">{qtdAtencao} observar</span>
              ) : (
                <span className="text-[10px] uppercase font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full px-2 py-0.5">Tudo OK</span>
              )}
            </CardTitle>
            <p className="text-[12px] text-slate-500 mt-0.5">{sub}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5"><TrendingUp className="h-3 w-3" /> Melhora</span>
            <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5"><TrendingDown className="h-3 w-3" /> Piora</span>
            <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 border border-slate-200 rounded-full px-2 py-0.5"><Minus className="h-3 w-3" /> Estável</span>
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Mês ref</span>
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2 py-0.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Observar</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {/* Mobile: cards stacked */}
        <div className="md:hidden space-y-2">
          {linhas.map((l, idx) => {
            const Icon = l.ind.icone || Activity;
            const cc = corOf(l.ind.cor);
            return (
              <button key={l.ind.chave} onClick={() => setOpenIdx(idx)} className={`w-full text-left rounded-lg border p-3 ${l.atencao ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"} hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`} aria-label={`Abrir análise de ${l.ind.label}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md ${cc.bg}`}><Icon className={`h-4 w-4 ${cc.iconOnBg}`} /></span>
                  <span className="text-sm font-semibold text-slate-800 flex-1">{l.ind.label}</span>
                  {l.atencao && <span className="text-[9px] uppercase font-bold bg-amber-200 text-amber-900 rounded px-1.5 py-0.5">Observar</span>}
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="text-xl font-bold tabular-nums text-slate-900">{l.atual == null ? "—" : l.ind.format(l.atual)}</div>
                  {l.delta != null && Math.abs(l.delta) >= 0.1 && (
                    <span className={`text-xs font-semibold inline-flex items-center gap-0.5 ${l.piorou ? "text-red-600" : "text-emerald-600"}`}>
                      {l.delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {l.delta > 0 ? "+" : ""}{l.delta.toFixed(1)}%
                    </span>
                  )}
                  <div className="ml-auto"><Sparkline values={l.valores} lowerIsBetter={l.ind.lowerIsBetter} w={64} h={22} /></div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b">
                <th className="text-left py-2 pr-3 font-semibold">Indicador</th>
                {meses.map((m, i) => (
                  <th key={m.mes} className={`text-right py-2 px-2 font-semibold ${i === meses.length - 1 ? "text-blue-700" : ""}`}>{fmtMesCurto(m.mes)}</th>
                ))}
                <th className="text-center py-2 px-2 font-semibold">δ vs ant.</th>
                <th className="text-center py-2 px-2 font-semibold">Tendência</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, idx) => {
                const Icon = l.ind.icone || Activity;
                const cc = corOf(l.ind.cor);
                return (
                  <tr key={l.ind.chave}
                    onClick={() => setOpenIdx(idx)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenIdx(idx); } }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Abrir análise de ${l.ind.label}`}
                    className={`border-b last:border-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${l.atencao ? "bg-amber-50/50 hover:bg-amber-50" : "hover:bg-slate-50"}`}>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md ${cc.bg} shrink-0`}><Icon className={`h-4 w-4 ${cc.iconOnBg}`} /></span>
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800 leading-tight">{l.ind.label}</span>
                          {l.atencao && <span className="text-[10px] font-bold uppercase text-amber-700 leading-tight">Observar</span>}
                        </div>
                      </div>
                    </td>
                    {l.valores.map((v, i) => (
                      <td key={i} className={`text-right py-2 px-2 tabular-nums ${i === l.valores.length - 1 ? "font-bold text-blue-900" : "text-slate-700"}`}>
                        {v == null ? <span className="text-slate-300">—</span> : l.ind.format(v)}
                      </td>
                    ))}
                    <td className="text-center py-2 px-2">
                      {l.delta == null || Math.abs(l.delta) < 0.1 ? (
                        <span className="inline-flex items-center text-slate-400 text-xs"><Minus className="h-3 w-3" /></span>
                      ) : (
                        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${l.piorou ? "text-red-600" : "text-emerald-600"}`}>
                          {l.delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {l.delta > 0 ? "+" : ""}{l.delta.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="text-center py-2 px-2"><Sparkline values={l.valores} lowerIsBetter={l.ind.lowerIsBetter} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>

      {openIdx != null && (
        <IndicadorDetalheModal
          open={openIdx != null}
          onClose={() => setOpenIdx(null)}
          indIdx={openIdx}
          setIndIdx={setOpenIdx as any}
          linhas={linhas}
          meses={meses}
        />
      )}
    </Card>
  );
}
