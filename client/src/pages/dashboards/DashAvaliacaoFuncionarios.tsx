/**
 * Dashboard Inteligente de Avaliação de Funcionários — Rev. 1971 (Fase 1 MVP).
 *
 * Score Geral 0-100 + 4 sub-scores (Frequência / Saúde / Disciplina / Segurança)
 * computados deterministicamente a partir de dados existentes no ERP.
 * Sem IA, sem ML. Decisão SEMPRE humana (LGPD + CLT).
 *
 * MVP: KPIs gerais + distribuição de classificação + ranking top/bottom + drill
 * individual com observações explicáveis. Próximas fases: pesos configuráveis
 * persistidos, score Físico/Comportamental, IA de recomendação.
 */
import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Trophy, AlertTriangle, Users, ClipboardCheck, Loader2, Info, ShieldCheck,
  Heart, Clock, Gavel, ChevronRight, Award, Search, GraduationCap, History,
  FileBarChart, CalendarClock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
// Rev. 2509 — foto do funcionário ao lado do nome (click amplia via PersonPhoto)
import { PersonPhoto } from "@/components/PersonPhoto";
// Rev. 2624 — análise técnica detalhada do contrato de experiência (Rev. 2622)
import AnaliseExperiencia from "@/components/AnaliseExperiencia";

const PERIODOS = [
  { label: "Últimos 3 meses", value: 3 },
  { label: "Últimos 6 meses", value: 6 },
  { label: "Últimos 12 meses", value: 12 },
  { label: "Últimos 24 meses", value: 24 },
];

const COR_CLASSIF: Record<string, string> = {
  "Excelente": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Bom": "bg-blue-100 text-blue-800 border-blue-300",
  "Atenção": "bg-amber-100 text-amber-800 border-amber-300",
  "Crítico": "bg-orange-100 text-orange-800 border-orange-300",
  "Alto Risco": "bg-red-100 text-red-800 border-red-300",
};

const COR_BG_CLASSIF: Record<string, string> = {
  "Excelente": "#10B981",
  "Bom": "#3B82F6",
  "Atenção": "#F59E0B",
  "Crítico": "#F97316",
  "Alto Risco": "#EF4444",
};

function corScore(score: number): string {
  if (score >= 90) return "text-emerald-700";
  if (score >= 75) return "text-blue-700";
  if (score >= 60) return "text-amber-700";
  if (score >= 40) return "text-orange-700";
  return "text-red-700";
}

function ScoreCircle({ value, size = 56 }: { value: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = value >= 90 ? "#10B981" : value >= 75 ? "#3B82F6" : value >= 60 ? "#F59E0B" : value >= 40 ? "#F97316" : "#EF4444";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} stroke="#E5E7EB" strokeWidth="4" fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth="4" fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className={`absolute text-sm font-bold ${corScore(value)}`}>{value}</span>
    </div>
  );
}

export default function DashAvaliacaoFuncionarios() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyIds = getCompanyIdsForQuery();
  const companyId = isConstrutoras ? (companyIds[0] || 0) : (Number(selectedCompanyId) || 0);

  const [periodoMeses, setPeriodoMeses] = useState(6);
  const [busca, setBusca] = useState("");
  const [drillId, setDrillId] = useState<number | null>(null);
  const [analiseEmpId, setAnaliseEmpId] = useState<number | null>(null); // Rev. 2624

  const { data: resumo, isLoading: loadingResumo } = trpc.avaliacaoFuncionarios.getResumo.useQuery(
    { companyId, periodoMeses },
    { enabled: companyId > 0, refetchOnWindowFocus: false },
  );
  const { data: ranking, isLoading: loadingRanking } = trpc.avaliacaoFuncionarios.getRanking.useQuery(
    { companyId, periodoMeses },
    { enabled: companyId > 0, refetchOnWindowFocus: false },
  );
  const { data: drillData, isLoading: loadingDrill } = trpc.avaliacaoFuncionarios.getScoreFuncionario.useQuery(
    { companyId, employeeId: drillId || 0, periodoMeses },
    { enabled: companyId > 0 && drillId != null, refetchOnWindowFocus: false },
  );

  const top10 = useMemo(() => (ranking || []).slice(0, 10), [ranking]);
  const bottom10 = useMemo(() => [...(ranking || [])].sort((a, b) => a.geral - b.geral).slice(0, 10), [ranking]);
  // Rev. 2624 — colaboradores em período de experiência, ordenados por dias
  // restantes do contrato (mais urgentes primeiro) p/ análise técnica detalhada.
  const emExperiencia = useMemo(
    () =>
      (ranking || [])
        .filter((r: any) => r.emExperiencia && r.experiencia)
        .sort((a: any, b: any) => a.experiencia.diasRestantes - b.experiencia.diasRestantes),
    [ranking],
  );
  const buscaFiltrada = useMemo(() => {
    if (!ranking) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    return ranking.filter((r: any) =>
      r.nome.toLowerCase().includes(q) ||
      (r.funcao || "").toLowerCase().includes(q),
    ).slice(0, 25);
  }, [ranking, busca]);

  if (!companyId) {
    return (
      <DashboardLayout>
        <div className="p-6"><p className="text-slate-600">Selecione uma empresa para visualizar a avaliação.</p></div>
      </DashboardLayout>
    );
  }

  const loading = loadingResumo || loadingRanking;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md">
                <Award className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Avaliação Inteligente de Funcionários</h1>
                <p className="text-sm text-slate-500">Score 0-100 baseado em 6 pilares: frequência, saúde, disciplina, segurança, capacitação e lealdade</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={periodoMeses}
              onChange={e => setPeriodoMeses(Number(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
            >
              {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>

        {/* Disclaimer LGPD */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>Decisão sempre humana.</strong> Os scores são indicadores objetivos baseados em dados do ERP.
            Eles apoiam — mas não substituem — a análise do RH e do gestor. Nunca recomendar desligamento por idade ou por score isolado.
          </span>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span>Calculando scores...</span>
          </div>
        )}

        {/* KPIs — Rev. 2505: 6 pilares (Frequência/Saúde/Disciplina/Segurança/Capacitação/Lealdade) */}
        {!loading && resumo && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500 mb-1">Funcionários avaliados</p>
                  <p className="text-2xl font-bold text-slate-900">{resumo.total}</p>
                </CardContent>
              </Card>
              <Card className="md:col-span-3">
                <CardContent className="p-4 flex items-center gap-4">
                  <ScoreCircle value={resumo.mediaGeral} size={72} />
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Score Médio Geral</p>
                    <p className="text-lg font-semibold text-slate-900">{resumo.mediaGeral}<span className="text-sm text-slate-400 font-normal">/100</span></p>
                    <p className="text-xs text-slate-500 mt-0.5">Média ponderada dos 6 pilares na empresa.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <KpiPilarCard icon={<Clock className="h-4 w-4" />}         label="Frequência"  value={resumo.mediaFrequencia} />
              <KpiPilarCard icon={<Heart className="h-4 w-4" />}         label="Saúde"        value={resumo.mediaSaude} />
              <KpiPilarCard icon={<Gavel className="h-4 w-4" />}         label="Disciplina"   value={resumo.mediaDisciplina} />
              <KpiPilarCard icon={<ShieldCheck className="h-4 w-4" />}   label="Segurança"    value={resumo.mediaSeguranca} />
              <KpiPilarCard icon={<GraduationCap className="h-4 w-4" />} label="Capacitação"  value={resumo.mediaCapacitacao ?? 0} />
              <KpiPilarCard icon={<History className="h-4 w-4" />}       label="Lealdade"     value={resumo.mediaLealdade ?? 0} />
            </div>
          </>
        )}

        {/* Distribuição por Classificação */}
        {!loading && resumo && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-4 w-4" />
                Distribuição por Classificação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(["Excelente", "Bom", "Atenção", "Crítico", "Alto Risco"] as const).map(k => {
                  const n = (resumo.distribuicao as any)[k] || 0;
                  const pct = resumo.total > 0 ? (n / resumo.total) * 100 : 0;
                  return (
                    <div key={k} className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-700 w-24">{k}</span>
                      <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden relative">
                        <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: COR_BG_CLASSIF[k] }} />
                      </div>
                      <span className="text-sm font-semibold text-slate-900 w-20 text-right tabular-nums">{n} ({pct.toFixed(0)}%)</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ranking Top / Bottom */}
        {!loading && ranking && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RankingCard
              title="Top 10 — Maiores Scores"
              icon={<Trophy className="h-4 w-4 text-emerald-600" />}
              rows={top10}
              onClick={setDrillId}
              accent="emerald"
            />
            <RankingCard
              title="Bottom 10 — Maior Atenção"
              icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
              rows={bottom10}
              onClick={setDrillId}
              accent="red"
            />
          </div>
        )}

        {/* Rev. 2624 — Funcionários em Experiência: ranking dos colaboradores em
            período de experiência (mais urgentes primeiro), cada linha abre a
            ANÁLISE TÉCNICA E DETALHADA do contrato (cruza assiduidade, atrasos,
            advertências, atestados, acidentes e histórico → veredito sugerido). */}
        {!loading && ranking && (
          <Card className="border-violet-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-violet-600" />
                Funcionários em Experiência
                <Badge variant="secondary" className="ml-1">{emExperiencia.length}</Badge>
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Clique em "Análise" para a ficha técnica completa do período (subsídio para efetivar, prorrogar ou desligar — decisão sempre humana).
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {emExperiencia.length === 0 ? (
                <p className="text-sm text-slate-500 px-4 sm:px-6 pb-4">Nenhum colaborador em período de experiência nesta empresa.</p>
              ) : (
                <div className="overflow-auto max-h-[480px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Funcionário</TableHead>
                        <TableHead className="hidden sm:table-cell">Função</TableHead>
                        <TableHead className="text-center whitespace-nowrap">Período</TableHead>
                        <TableHead className="text-center">Prazo</TableHead>
                        <TableHead className="text-center">Score</TableHead>
                        <TableHead className="text-right pr-4">Análise</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emExperiencia.map((r: any, i: number) => {
                        const ex = r.experiencia;
                        const venc = ex.urgencia === 'vencido';
                        const urg = ex.urgencia === 'urgente';
                        const aten = ex.urgencia === 'atencao';
                        const prazoCor = venc
                          ? "bg-red-100 text-red-800 border-red-300"
                          : urg
                          ? "bg-orange-100 text-orange-800 border-orange-300"
                          : aten
                          ? "bg-amber-100 text-amber-800 border-amber-300"
                          : "bg-emerald-100 text-emerald-800 border-emerald-300";
                        const prazoTxt = venc
                          ? `Vencido há ${Math.abs(ex.diasRestantes)}d`
                          : ex.diasRestantes === 0
                          ? "Vence hoje"
                          : `Faltam ${ex.diasRestantes}d`;
                        return (
                          <TableRow key={r.employeeId} className="hover:bg-violet-50/40">
                            <TableCell className="text-slate-500 tabular-nums">{i + 1}</TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <PersonPhoto src={r.fotoUrl} alt={r.nome} size="sm" caption={r.funcao || undefined} />
                                <div className="min-w-0">
                                  <p className="text-sm text-slate-900 truncate">{r.nome}</p>
                                  <p className="text-xs text-slate-500 sm:hidden truncate">{r.funcao || '—'}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-slate-600 text-sm">{r.funcao || '—'}</TableCell>
                            <TableCell className="text-center text-xs whitespace-nowrap">
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {ex.status === 'prorrogado' ? '2º período' : ex.tipo === '45_45' ? '45+45' : '30+30'}
                              </Badge>
                              <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">{ex.diasDecorridos}º dia</p>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={`${prazoCor} whitespace-nowrap text-[11px]`}>{prazoTxt}</Badge>
                            </TableCell>
                            <TableCell className="text-center"><ScoreCircle value={r.geral} size={40} /></TableCell>
                            <TableCell className="text-right pr-4">
                              <Button
                                size="sm"
                                onClick={() => setAnaliseEmpId(r.employeeId)}
                                className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 h-8"
                              >
                                <FileBarChart className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Análise</span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Busca livre */}
        {!loading && ranking && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4" />
                Buscar Funcionário
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Digite nome ou função..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="mb-3"
              />
              {busca.trim() && (
                <div className="space-y-1">
                  {buscaFiltrada.length === 0 ? (
                    <p className="text-sm text-slate-500">Nenhum resultado.</p>
                  ) : buscaFiltrada.map((r: any) => (
                    // Rev. 2509 — div+role="button" p/ permitir <PersonPhoto> aninhado.
                    <div
                      key={r.employeeId}
                      role="button"
                      tabIndex={0}
                      onClick={() => setDrillId(r.employeeId)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDrillId(r.employeeId); } }}
                      className="w-full flex items-center justify-between p-2 rounded hover:bg-slate-50 text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <div className="flex items-center gap-2">
                        <ScoreCircle value={r.geral} size={36} />
                        <PersonPhoto src={r.fotoUrl} alt={r.nome} size="sm" caption={r.funcao || undefined} />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{r.nome}</p>
                          <p className="text-xs text-slate-500">{r.funcao}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={COR_CLASSIF[r.classificacao]}>{r.classificacao}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tabela completa */}
        {!loading && ranking && ranking.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Ranking Completo ({ranking.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-10">
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Funcionário</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead className="text-center">Freq.</TableHead>
                      <TableHead className="text-center">Saúde</TableHead>
                      <TableHead className="text-center">Disc.</TableHead>
                      <TableHead className="text-center">Seg.</TableHead>
                      <TableHead className="text-center">Capac.</TableHead>
                      <TableHead className="text-center">Leald.</TableHead>
                      <TableHead className="text-center">Geral</TableHead>
                      <TableHead>Classificação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ranking.map((r: any, i: number) => (
                      <TableRow key={r.employeeId} className="cursor-pointer hover:bg-slate-50" onClick={() => setDrillId(r.employeeId)}>
                        <TableCell className="text-slate-500 tabular-nums">{i + 1}</TableCell>
                        <TableCell className="font-medium text-blue-700 hover:underline">
                          <div className="flex items-center gap-2">
                            <PersonPhoto src={r.fotoUrl} alt={r.nome} size="sm" caption={r.funcao || undefined} />
                            <span>{r.nome}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600 text-sm">{r.funcao || '—'}</TableCell>
                        <TableCell className={`text-center font-medium tabular-nums ${corScore(r.sub.frequencia)}`}>{r.sub.frequencia}</TableCell>
                        <TableCell className={`text-center font-medium tabular-nums ${corScore(r.sub.saude)}`}>{r.sub.saude}</TableCell>
                        <TableCell className={`text-center font-medium tabular-nums ${corScore(r.sub.disciplina)}`}>{r.sub.disciplina}</TableCell>
                        <TableCell className={`text-center font-medium tabular-nums ${corScore(r.sub.seguranca)}`}>{r.sub.seguranca}</TableCell>
                        <TableCell className={`text-center font-medium tabular-nums ${corScore(r.sub.capacitacao ?? 0)}`}>{r.sub.capacitacao ?? 0}</TableCell>
                        <TableCell className={`text-center font-medium tabular-nums ${corScore(r.sub.lealdade ?? 0)}`}>{r.sub.lealdade ?? 0}</TableCell>
                        <TableCell className="text-center"><ScoreCircle value={r.geral} size={42} /></TableCell>
                        <TableCell><Badge variant="outline" className={COR_CLASSIF[r.classificacao]}>{r.classificacao}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rev. 2412 — Drill modernizado seguindo identidade FC (faixa
            azul #1B2A4A no topo, score circle ampliado, sub-cards com
            gradientes por dimensão, dados brutos em tabela legível). */}
        <Dialog open={drillId != null} onOpenChange={(o) => !o && setDrillId(null)}>
          <DialogContent resizable={false} className="w-[calc(100vw-1.5rem)] sm:w-full max-w-3xl p-0 overflow-hidden gap-0 bg-white">
            <DialogHeader className="p-0 space-y-0">
              <div
                className="px-4 sm:px-6 py-4 text-white flex items-center gap-3"
                style={{ background: "linear-gradient(135deg, #1B2A4A 0%, #2E4373 100%)" }}
              >
                <div className="h-10 w-10 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
                  <Award className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-white text-base font-bold uppercase tracking-wider">
                    Score Detalhado
                  </DialogTitle>
                  <DialogDescription className="text-white/75 text-xs mt-0.5 truncate">
                    {drillData ? `${drillData.nome} • ${drillData.funcao || 'sem função'}` : 'Carregando...'}
                  </DialogDescription>
                </div>
                <Badge className="bg-white/15 text-white border-white/20 hover:bg-white/20 font-mono text-[10px] px-2 py-0.5 uppercase tracking-wider">
                  últ. {periodoMeses}m
                </Badge>
              </div>
            </DialogHeader>

            {loadingDrill && (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span className="text-sm">Calculando indicadores…</span>
              </div>
            )}

            {drillData && (
              <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-h-[80vh] sm:max-h-[75vh] overflow-y-auto">
                {/* Hero — score grande + classificação */}
                <div
                  className="relative overflow-hidden rounded-xl border border-slate-200 p-4 sm:p-6"
                  style={{
                    background: `linear-gradient(135deg, ${COR_BG_CLASSIF[drillData.classificacao]}10 0%, #ffffff 60%)`,
                  }}
                >
                  <div
                    className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 -translate-y-12 translate-x-12"
                    style={{ background: COR_BG_CLASSIF[drillData.classificacao] }}
                  />
                  <div className="relative flex flex-col items-center text-center sm:flex-row sm:text-left gap-4 sm:gap-6">
                    <ScoreCircle value={drillData.geral} size={120} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                        Classificação Geral
                      </p>
                      <div className="flex items-center justify-center sm:justify-start gap-2 mb-3">
                        <span
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold border-2"
                          style={{
                            color: COR_BG_CLASSIF[drillData.classificacao],
                            borderColor: COR_BG_CLASSIF[drillData.classificacao],
                            backgroundColor: `${COR_BG_CLASSIF[drillData.classificacao]}15`,
                          }}
                        >
                          {drillData.classificacao}
                        </span>
                      </div>
                      <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        Janela de avaliação: últimos {periodoMeses} meses
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sub-scores em 6 cards coloridos por dimensão (Rev. 2505) */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    6 Dimensões Avaliadas
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                    <SubScoreCard color="blue"    icon={<Clock className="h-4 w-4" />}         label="Frequência"  value={drillData.sub.frequencia} />
                    <SubScoreCard color="rose"    icon={<Heart className="h-4 w-4" />}         label="Saúde"       value={drillData.sub.saude} />
                    <SubScoreCard color="violet"  icon={<Gavel className="h-4 w-4" />}         label="Disciplina"  value={drillData.sub.disciplina} />
                    <SubScoreCard color="emerald" icon={<ShieldCheck className="h-4 w-4" />}   label="Segurança"   value={drillData.sub.seguranca} />
                    <SubScoreCard color="amber"   icon={<GraduationCap className="h-4 w-4" />} label="Capacitação" value={drillData.sub.capacitacao ?? 0} />
                    <SubScoreCard color="indigo"  icon={<History className="h-4 w-4" />}       label="Lealdade"    value={drillData.sub.lealdade ?? 0} />
                  </div>
                </div>

                {drillData.observacoes && drillData.observacoes.length > 0 && (
                  <div className="rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-amber-50/30 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="h-4 w-4 text-amber-700" />
                      <p className="text-sm font-bold text-amber-900 uppercase tracking-wider">
                        Observações automáticas
                      </p>
                    </div>
                    <ul className="text-sm text-amber-950 space-y-1 list-disc pl-5">
                      {drillData.observacoes.map((o: string, i: number) => <li key={i}>{o}</li>)}
                    </ul>
                  </div>
                )}

                {/* Dados brutos — tabela 2 cols por dimensão */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Dados Brutos do Período (auditoria)
                  </p>
                  <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 text-sm">
                    <DadoBrutoRow color="blue" icon={<Clock className="h-3.5 w-3.5" />} label="Frequência">
                      <Stat n={drillData.inputs.frequencia.totalFaltasInjustificadas} label="falta(s)" tone={drillData.inputs.frequencia.totalFaltasInjustificadas > 0 ? 'text-rose-600' : 'text-slate-800'} />
                      <Stat n={drillData.inputs.frequencia.totalAtrasos} label="atraso(s)" tone={drillData.inputs.frequencia.totalAtrasos > 0 ? 'text-amber-600' : 'text-slate-800'} />
                      <Stat n={drillData.inputs.frequencia.totalSaidasAntecipadas} label="saída(s) antecipada(s)" tone={drillData.inputs.frequencia.totalSaidasAntecipadas > 0 ? 'text-amber-600' : 'text-slate-800'} />
                    </DadoBrutoRow>
                    <DadoBrutoRow color="rose" icon={<Heart className="h-3.5 w-3.5" />} label="Saúde">
                      <Stat n={drillData.inputs.saude.countAtestados} label={`atestado(s) · ${drillData.inputs.saude.diasAfastadoAtestado} dias`} />
                      <Stat n={drillData.inputs.saude.countAcidentes} label={`acidente(s) · ${drillData.inputs.saude.diasAfastadoAcidente} dias`} tone={drillData.inputs.saude.countAcidentes > 0 ? 'text-rose-600' : 'text-slate-800'} />
                    </DadoBrutoRow>
                    <DadoBrutoRow color="violet" icon={<Gavel className="h-3.5 w-3.5" />} label="Disciplina">
                      <Stat n={drillData.inputs.disciplina.countAdvertenciasLeves} label="leve(s)" tone={drillData.inputs.disciplina.countAdvertenciasLeves > 0 ? 'text-amber-600' : 'text-slate-800'} />
                      <Stat n={drillData.inputs.disciplina.countAdvertenciasGraves} label="grave(s)" tone={drillData.inputs.disciplina.countAdvertenciasGraves > 0 ? 'text-rose-600' : 'text-slate-800'} />
                      <Stat n={drillData.inputs.disciplina.countSuspensoes} label="suspensão(ões)" tone={drillData.inputs.disciplina.countSuspensoes > 0 ? 'text-rose-600' : 'text-slate-800'} />
                    </DadoBrutoRow>
                    <DadoBrutoRow color="emerald" icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Segurança">
                      <Stat n={drillData.inputs.seguranca.countAcidentesGraves} label="grave(s)" tone={drillData.inputs.seguranca.countAcidentesGraves > 0 ? 'text-rose-600' : 'text-slate-800'} />
                      <Stat n={drillData.inputs.seguranca.countAcidentesLeves} label="leve(s)" tone={drillData.inputs.seguranca.countAcidentesLeves > 0 ? 'text-amber-600' : 'text-slate-800'} />
                      <Stat n={drillData.inputs.seguranca.countAcidentesQuase} label="quase-acidente(s)" tone={drillData.inputs.seguranca.countAcidentesQuase > 0 ? 'text-amber-600' : 'text-slate-800'} />
                      <Stat n={`${drillData.inputs.seguranca.ddsPresentes}/${drillData.inputs.seguranca.ddsConvocados}`} label="DDS" />
                    </DadoBrutoRow>
                    {drillData.inputs.capacitacao && (
                      <DadoBrutoRow color="amber" icon={<GraduationCap className="h-3.5 w-3.5" />} label="Capacitação">
                        <Stat n={drillData.inputs.capacitacao.countTreinamentosValidos} label="treinamento(s) válido(s)" tone={drillData.inputs.capacitacao.countTreinamentosValidos > 0 ? 'text-emerald-600' : 'text-slate-800'} />
                        <Stat n={drillData.inputs.capacitacao.countTreinamentosVencidos} label="vencido(s)" tone={drillData.inputs.capacitacao.countTreinamentosVencidos > 0 ? 'text-amber-600' : 'text-slate-800'} />
                        <Stat n={drillData.inputs.capacitacao.countTreinamentosRecentes} label="no período" />
                      </DadoBrutoRow>
                    )}
                    {drillData.inputs.lealdade && (
                      <DadoBrutoRow color="indigo" icon={<History className="h-3.5 w-3.5" />} label="Lealdade">
                        {(() => {
                          const m = drillData.inputs.lealdade.mesesDeCasa;
                          const anos = Math.floor(m / 12);
                          const restoMeses = m % 12;
                          const txt = anos > 0
                            ? `${anos} ano${anos > 1 ? 's' : ''}${restoMeses > 0 ? ` e ${restoMeses} mês${restoMeses > 1 ? 'es' : ''}` : ''}`
                            : `${m} mês${m !== 1 ? 'es' : ''}`;
                          const adm = drillData.dataAdmissao ? new Date(drillData.dataAdmissao + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
                          return <Stat n={txt} label={`de casa · admitido em ${adm}`} />;
                        })()}
                      </DadoBrutoRow>
                    )}
                  </div>
                </div>
              </div>
            )}

            {drillData && (
              <div className="border-t border-slate-200 bg-slate-50 px-4 sm:px-6 py-3 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500 text-center sm:text-left">
                  Decisão final é sempre humana · LGPD + CLT
                </p>
                <Button
                  onClick={() => setDrillId(null)}
                  className="w-full sm:w-auto text-white hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #1B2A4A 0%, #2E4373 100%)" }}
                >
                  Fechar
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Rev. 2624 — Modal de ANÁLISE TÉCNICA E DETALHADA do contrato de
            experiência (reusa o componente da Rev. 2622). */}
        <AnaliseExperiencia
          employeeId={analiseEmpId}
          companyId={companyId}
          open={!!analiseEmpId}
          onClose={() => setAnaliseEmpId(null)}
        />
      </div>
    </DashboardLayout>
  );
}

function RankingCard({ title, icon, rows, onClick, accent }: { title: string; icon: React.ReactNode; rows: any[]; onClick: (id: number) => void; accent: 'emerald' | 'red' }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">Sem dados.</p>
        ) : (
          <div className="divide-y">
            {rows.map((r, i) => (
              // Rev. 2509 — div+role="button" (não <button>) p/ permitir
              // <PersonPhoto> aninhado (que renderiza <button> quando clickable).
              <div
                key={r.employeeId}
                role="button"
                tabIndex={0}
                onClick={() => onClick(r.employeeId)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(r.employeeId); } }}
                className={`w-full flex items-center justify-between px-4 py-2 text-left hover:bg-${accent}-50 transition cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-semibold text-slate-400 w-6 tabular-nums">{i + 1}</span>
                  <ScoreCircle value={r.geral} size={40} />
                  <PersonPhoto src={r.fotoUrl} alt={r.nome} size="sm" caption={r.funcao || undefined} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{r.nome}</p>
                    <p className="text-xs text-slate-500 truncate">{r.funcao || '—'}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SubScoreBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="p-3 rounded-lg border border-slate-200 bg-white flex items-center gap-3">
      <div className="text-slate-500">{icon}</div>
      <div className="flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`text-xl font-bold ${corScore(value)}`}>{value}<span className="text-xs text-slate-400 font-normal">/100</span></p>
      </div>
    </div>
  );
}

/**
 * Rev. 2412 — Card de sub-score por dimensão usado no drill modernizado.
 * Cor por dimensão (não pelo valor) — frequência=blue, saúde=rose,
 * disciplina=violet, segurança=emerald. Mantém pattern do design system.
 */
const SUBSCORE_COLOR_MAP: Record<string, { ring: string; bg: string; text: string; icon: string; bar: string }> = {
  blue:    { ring: "ring-blue-200",    bg: "bg-blue-50/60",    text: "text-blue-700",    icon: "bg-blue-500",    bar: "bg-blue-500" },
  rose:    { ring: "ring-rose-200",    bg: "bg-rose-50/60",    text: "text-rose-700",    icon: "bg-rose-500",    bar: "bg-rose-500" },
  violet:  { ring: "ring-violet-200",  bg: "bg-violet-50/60",  text: "text-violet-700",  icon: "bg-violet-500",  bar: "bg-violet-500" },
  emerald: { ring: "ring-emerald-200", bg: "bg-emerald-50/60", text: "text-emerald-700", icon: "bg-emerald-500", bar: "bg-emerald-500" },
  amber:   { ring: "ring-amber-200",   bg: "bg-amber-50/60",   text: "text-amber-700",   icon: "bg-amber-500",   bar: "bg-amber-500" },
  indigo:  { ring: "ring-indigo-200",  bg: "bg-indigo-50/60",  text: "text-indigo-700",  icon: "bg-indigo-500",  bar: "bg-indigo-500" },
};

function KpiPilarCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="text-slate-500">{icon}</div>
          <p className="text-xs text-slate-500 truncate">{label}</p>
        </div>
        <p className={`text-2xl font-bold tabular-nums ${corScore(value)}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SubScoreCard({ color, icon, label, value }: { color: keyof typeof SUBSCORE_COLOR_MAP; icon: React.ReactNode; label: string; value: number }) {
  const c = SUBSCORE_COLOR_MAP[color];
  return (
    <div className={`relative overflow-hidden rounded-xl ring-1 ${c.ring} ${c.bg} p-3`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-6 w-6 shrink-0 rounded-md ${c.icon} text-white flex items-center justify-center shadow-sm`}>
          {icon}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600 leading-tight">{label}</p>
      </div>
      <p className={`text-2xl font-extrabold tabular-nums ${c.text}`}>
        {value}
        <span className="text-xs text-slate-400 font-normal">/100</span>
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-white/70 overflow-hidden">
        <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${Math.max(2, value)}%` }} />
      </div>
    </div>
  );
}

function DadoBrutoRow({ color, icon, label, children }: { color: keyof typeof SUBSCORE_COLOR_MAP; icon: React.ReactNode; label: string; children: React.ReactNode }) {
  const c = SUBSCORE_COLOR_MAP[color];
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50 transition">
      <div className={`mt-0.5 h-6 w-6 rounded-md ${c.icon} text-white flex items-center justify-center shadow-sm shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[10px] font-bold uppercase tracking-widest ${c.text}`}>{label}</p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-slate-700 leading-snug">{children}</div>
      </div>
    </div>
  );
}

/**
 * Rev. 2623 — Mini-estatística para os "Dados Brutos": número em destaque
 * (bold + cor de alerta quando > 0) seguido do rótulo, com flex-wrap para
 * caber em telas estreitas (iPad/celular).
 */
function Stat({ n, label, tone = "text-slate-800" }: { n: React.ReactNode; label: string; tone?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`font-bold tabular-nums ${tone}`}>{n}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </span>
  );
}
