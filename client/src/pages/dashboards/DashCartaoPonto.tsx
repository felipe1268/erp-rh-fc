import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import MonthSelector from "@/components/MonthSelector";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Users, AlertTriangle, Timer, CalendarOff, TrendingDown, UserX, ExternalLink, Info, ArrowLeft } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState, useMemo } from "react";

export default function DashCartaoPonto() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const [mesRef] = useState(() => new Date().toISOString().slice(0, 7));
  const [mes, setMes] = useState(mesRef);
  const { data, isLoading } = trpc.dashboards.cartaoPonto.useQuery({ companyId, mesReferencia: mes }, { enabled: companyId > 0 });
  const [, navigate] = useLocation();

  const mesLabel = useMemo(() => {
    const [y, m] = mes.split("-");
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${meses[parseInt(m) - 1]}/${y}`;
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
                labels={data.evolucaoDiaria.map(d => { const parts = d.data.split("-"); return `${parts[2]}/${parts[1]}`; })}
                datasets={[{
                  label: "Horas",
                  data: data.evolucaoDiaria.map(d => d.horas),
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
                labels={data.porDiaSemana.map(d => d.dia)}
                datasets={[{
                  label: "Horas",
                  data: data.porDiaSemana.map(d => d.horas),
                  backgroundColor: [SEMANTIC_COLORS.negativo, CHART_PALETTE[0], CHART_PALETTE[0], CHART_PALETTE[0], CHART_PALETTE[0], CHART_PALETTE[0], SEMANTIC_COLORS.alerta],
                }]}
                height={260}
              />
              <DashChart
                title="Registros por Dia da Semana"
                type="bar"
                labels={data.porDiaSemana.map(d => d.dia)}
                datasets={[{
                  label: "Registros",
                  data: data.porDiaSemana.map(d => d.registros),
                  backgroundColor: CHART_PALETTE[1],
                }]}
                height={260}
              />
            </div>

            {/* Rankings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Ranking de Faltas (em DIAS) */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CalendarOff className="h-4 w-4 text-red-500" />
                    Ranking de Faltas — Top 10
                    <span className="text-[10px] font-normal text-muted-foreground ml-auto">(em dias)</span>
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
                          onClick={() => r.employeeId && navigate(`/fechamento-ponto?funcionario=${r.employeeId}&mes=${mes}`)}
                          title="Clique para ver os registros de ponto deste funcionário"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${i < 3 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate max-w-[220px]">{r.nome}</p>
                              <p className="text-xs text-muted-foreground">{r.funcao}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-sm font-bold text-red-600">
                              {r.faltasDias === 1 ? "1 dia" : `${r.faltasDias % 1 === 0 ? r.faltasDias : r.faltasDias.toFixed(1)} dias`}
                            </span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
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
                              <p className="text-sm font-medium truncate max-w-[220px]">{r.nome}</p>
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
    </DashboardLayout>
  );
}
