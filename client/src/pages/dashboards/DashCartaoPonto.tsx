import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import MonthSelector from "@/components/MonthSelector";
import { EmpNameWithStatus } from "@/components/EmpStatusBadge";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, Users, Timer, CalendarOff, TrendingDown, TrendingUp, Minus, UserX, ExternalLink, Info, ArrowLeft, X, CalendarX2, AlertTriangle, CheckCircle2 } from "lucide-react";
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

// "lowerIsBetter" = métricas em que SUBIR é ruim (faltas, atrasos, % HE, sem registro)
type LinhaInd = {
  chave: string;
  label: string;
  unidade?: string;
  lowerIsBetter: boolean;
  pegar: (r: any) => number;
  format: (v: number) => string;
  // limite para acionar atenção (delta % vs mês anterior). null = sempre alerta quando piora.
  alertaPct?: number;
  // valor absoluto que sempre sinaliza atenção, mesmo sem alta
  alertaAbsoluto?: (v: number, ref?: any) => boolean;
  hint?: string;
};

const INDICADORES: LinhaInd[] = [
  { chave: "horasTrab", label: "Horas Trabalhadas", lowerIsBetter: false,
    pegar: r => r.totalHorasTrab, format: v => `${v.toLocaleString("pt-BR")}h`,
    alertaPct: 15, hint: "Queda forte pode indicar perda de produtividade ou apontamento incompleto." },
  { chave: "horasExtras", label: "Horas Extras", unidade: "h", lowerIsBetter: true,
    pegar: r => r.totalHorasExtras, format: v => `${v.toLocaleString("pt-BR")}h`,
    alertaPct: 20, hint: "Alta de HE eleva custo de folha — revisar escalas e dimensionamento." },
  { chave: "percHE", label: "% HE / Horas Normais", lowerIsBetter: true,
    pegar: r => r.percentualHE, format: v => `${v.toFixed(1)}%`,
    alertaAbsoluto: v => v > 5,
    hint: "Acima de 5% sugere déficit estrutural de pessoal (recomendação interna RH/DP)." },
  { chave: "faltas", label: "Faltas (dias)", lowerIsBetter: true,
    pegar: r => r.totalFaltasDias, format: v => `${v.toLocaleString("pt-BR")} d`,
    alertaPct: 25, hint: "Pico de faltas → checar surto, clima, pagamentos, transporte." },
  { chave: "atrasos", label: "Atrasos (min)", lowerIsBetter: true,
    pegar: r => r.totalAtrasosMinutos ?? 0,
    format: v => { const h = Math.floor(v / 60); const m = v % 60; return h > 0 ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m}min`; },
    alertaPct: 30, hint: "Já considera tolerância CLT de 10min/dia. Subindo? Reforçar disciplina." },
  { chave: "ativos", label: "Funcionários Ativos", lowerIsBetter: false,
    pegar: r => r.totalFuncionariosAtivos, format: v => `${v}`,
    alertaPct: 10, hint: "Quedas grandes podem refletir desligamentos em massa." },
  { chave: "comReg", label: "Com Registro", lowerIsBetter: false,
    pegar: r => r.funcionariosComRegistro, format: v => `${v}`,
    alertaPct: 15, hint: "Cobertura caindo → possível falha na importação Dixi/iPonto." },
  { chave: "semReg", label: "Sem Registro", lowerIsBetter: true,
    pegar: r => r.funcionariosSemRegistro, format: v => `${v}`,
    alertaPct: 20,
    alertaAbsoluto: (v, ref) => ref?.totalFuncionariosAtivos > 0 && (v / ref.totalFuncionariosAtivos) > 0.3,
    hint: "Acima de 30% do quadro sem batida → falta de relógio, perda de dados ou férias coletivas." },
  { chave: "cobertura", label: "Cobertura (%)", lowerIsBetter: false,
    pegar: r => r.totalFuncionariosAtivos > 0 ? Math.round((r.funcionariosComRegistro / r.totalFuncionariosAtivos) * 1000) / 10 : 0,
    format: v => `${v.toFixed(1)}%`,
    alertaAbsoluto: v => v < 70,
    hint: "Abaixo de 70% indica baixa adesão / falha na coleta." },
];

function TabelaComparativa({ data, isLoading, mesAtual }: { data: { meses: CompMes[] } | null | undefined; isLoading: boolean; mesAtual: string }) {
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

  // calcular linhas com deltas e flags de atenção
  const linhas = INDICADORES.map(ind => {
    const valores = meses.map(m => m.resumo ? ind.pegar(m.resumo) : null);
    const atual = valores[atualIdx];
    const ant = anteriorIdx >= 0 ? valores[anteriorIdx] : null;
    const delta = (atual != null && ant != null) ? pct(atual, ant) : null;

    const piorou = (delta != null) && (
      ind.lowerIsBetter ? delta > 0 : delta < 0
    );
    const alertaPct = piorou && ind.alertaPct != null && Math.abs(delta!) >= ind.alertaPct;
    const alertaAbs = atual != null && ind.alertaAbsoluto?.(atual, meses[atualIdx].resumo);
    const atencao = !!(alertaPct || alertaAbs);

    return { ind, valores, atual, delta, piorou, atencao };
  });

  const corDelta = (l: typeof linhas[0]) => {
    if (l.delta == null || l.delta === 0) return "text-slate-500";
    return l.piorou ? "text-red-600" : "text-emerald-600";
  };
  const IconDelta = ({ d, piorou }: { d: number | null; piorou: boolean }) => {
    if (d == null) return <Minus className="h-3.5 w-3.5 text-slate-400" />;
    if (Math.abs(d) < 0.1) return <Minus className="h-3.5 w-3.5 text-slate-400" />;
    if (d > 0) return piorou ? <TrendingUp className="h-3.5 w-3.5 text-red-600" /> : <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />;
    return piorou ? <TrendingDown className="h-3.5 w-3.5 text-red-600" /> : <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />;
  };

  const totalAtencao = linhas.filter(l => l.atencao).length;

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3 bg-gradient-to-r from-slate-50 to-blue-50/40 border-b">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          Tendência mês-a-mês — Janeiro a {fmtMesCurto(meses[atualIdx].mes)}
          {totalAtencao > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5">
              <AlertTriangle className="h-3 w-3" />
              {totalAtencao} indicador{totalAtencao > 1 ? "es" : ""} para observar
            </span>
          )}
          {totalAtencao === 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-300 rounded-full px-2 py-0.5">
              <CheckCircle2 className="h-3 w-3" />
              Tudo dentro do esperado
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b text-slate-700">
              <tr>
                <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-slate-50 z-10 min-w-[180px]">Indicador</th>
                {meses.map((m, i) => (
                  <th key={m.mes} className={`text-right px-3 py-2 font-semibold whitespace-nowrap ${i === atualIdx ? "bg-blue-100 text-blue-900" : ""}`}>
                    {fmtMesCurto(m.mes)}
                    {i === atualIdx && <div className="text-[9px] font-normal text-blue-700">atual</div>}
                  </th>
                ))}
                <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">Δ vs mês ant.</th>
                <th className="text-center px-3 py-2 font-semibold whitespace-nowrap">Atenção</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.ind.chave} className={`border-b last:border-0 hover:bg-slate-50/60 ${l.atencao ? "bg-amber-50/40" : ""}`}>
                  <td className="px-3 py-2 sticky left-0 bg-white z-10 font-medium text-slate-800">
                    <div className="flex items-center gap-1.5">
                      {l.ind.label}
                      {l.ind.hint && (
                        <span title={l.ind.hint}>
                          <Info className="h-3 w-3 text-slate-400 hover:text-slate-600 cursor-help" />
                        </span>
                      )}
                    </div>
                  </td>
                  {l.valores.map((v, i) => (
                    <td key={i} className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${i === atualIdx ? "bg-blue-50/60 font-bold text-blue-900" : "text-slate-700"}`}>
                      {v == null ? <span className="text-slate-300">—</span> : l.ind.format(v)}
                    </td>
                  ))}
                  <td className={`px-3 py-2 text-right whitespace-nowrap font-semibold ${corDelta(l)}`}>
                    <span className="inline-flex items-center gap-1 justify-end">
                      <IconDelta d={l.delta} piorou={l.piorou} />
                      {l.delta == null ? "—" : `${l.delta > 0 ? "+" : ""}${l.delta.toFixed(1)}%`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {l.atencao ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5" title={l.ind.hint}>
                        <AlertTriangle className="h-3 w-3" /> Observar
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                        <CheckCircle2 className="h-3 w-3" /> OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalAtencao > 0 && (
          <div className="px-3 py-2 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-900">
            <strong>Como ler:</strong> linhas em destaque (amarelo) merecem investigação — passe o cursor no <Info className="inline h-3 w-3" /> para ver causas comuns. Δ é a variação % vs. {fmtMesCurto(meses[anteriorIdx]?.mes || mesAtual)}.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function DashCartaoPonto() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const [mesRef] = useState(() => new Date().toISOString().slice(0, 7));
  const [mes, setMes] = useState(mesRef);
  const { data, isLoading } = trpc.dashboards.cartaoPonto.useQuery(
    { companyId: queryCompanyId, mesReferencia: mes, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  // Rev. 1777 — comparativo do ano corrente (Jan → mês atual)
  const { data: compData, isLoading: compLoading } = trpc.dashboards.cartaoPontoComparativo.useQuery(
    { companyId: queryCompanyId, mesReferencia: mes, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const [, navigate] = useLocation();
  const [faltasDetalhe, setFaltasDetalhe] = useState<any>(null);

  const mesLabel = useMemo(() => {
    const [y, m] = mes.split("-");
    return `${MESES_PT[parseInt(m) - 1]}/${y}`;
  }, [mes]);

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
          <div className="flex items-center gap-3">
            <MonthSelector value={mes} onChange={setMes} />
            <PrintActions title="Dashboard Cartão de Ponto" />
          </div>
        </div>

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
