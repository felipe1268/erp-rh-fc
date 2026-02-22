import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, Users, AlertTriangle, Timer, CalendarOff, TrendingDown, UserX } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";

export default function DashCartaoPonto() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const [mesRef] = useState(() => new Date().toISOString().slice(0, 7));
  const [mes, setMes] = useState(mesRef);
  const { data, isLoading } = trpc.dashboards.cartaoPonto.useQuery({ companyId, mesReferencia: mes }, { enabled: companyId > 0 });

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
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboards" className="text-sm text-muted-foreground hover:text-foreground">Dashboards</Link>
              <span className="text-muted-foreground">/</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard Cartão de Ponto</h1>
            <p className="text-muted-foreground text-sm mt-1">Análise de frequência, faltas e atrasos — {mesLabel}</p>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <Label className="text-xs">Mês Referência</Label>
              <Input type="month" value={mes} onChange={e => setMes(e.target.value)} className="w-40" />
            </div>
            <PrintActions title="Dashboard Cartão de Ponto" />
          </div>
        </div>

        {!data ? (
          <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <DashKpi label="Horas Trabalhadas" value={data.resumo.totalHorasTrab.toLocaleString("pt-BR")} icon={Clock} color="blue" sub={`${data.resumo.totalRegistros} registros`} />
              <DashKpi label="Horas Extras" value={data.resumo.totalHorasExtras.toLocaleString("pt-BR")} icon={Timer} color="orange" />
              <DashKpi label="Faltas (horas)" value={data.resumo.totalFaltas.toLocaleString("pt-BR")} icon={CalendarOff} color="red" />
              <DashKpi label="Atrasos (horas)" value={data.resumo.totalAtrasos.toLocaleString("pt-BR")} icon={TrendingDown} color="yellow" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <DashKpi label="Funcionários Ativos" value={data.resumo.totalFuncionariosAtivos} icon={Users} color="blue" />
              <DashKpi label="Com Registro" value={data.resumo.funcionariosComRegistro} icon={Users} color="green" sub={`${data.resumo.totalFuncionariosAtivos > 0 ? Math.round((data.resumo.funcionariosComRegistro / data.resumo.totalFuncionariosAtivos) * 100) : 0}% do total`} />
              <DashKpi label="Sem Registro" value={data.resumo.funcionariosSemRegistro} icon={UserX} color="red" sub="Sem batida no mês" />
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
                  borderColor: "#3B82F6",
                  backgroundColor: "rgba(59,130,246,0.1)",
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
                  backgroundColor: ["#EF4444", "#3B82F6", "#3B82F6", "#3B82F6", "#3B82F6", "#3B82F6", "#F59E0B"],
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
                  backgroundColor: "#10B981",
                }]}
                height={260}
              />
            </div>

            {/* Rankings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CalendarOff className="h-4 w-4 text-red-500" />
                    Ranking de Faltas (Top 10)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.rankingFaltas.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma falta registrada no período</p>
                  ) : (
                    <div className="space-y-2">
                      {data.rankingFaltas.map((r, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${i < 3 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                            <div>
                              <p className="text-sm font-medium truncate max-w-[180px]">{r.nome}</p>
                              <p className="text-xs text-muted-foreground">{r.funcao}</p>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-red-600">{r.faltas}h</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-amber-500" />
                    Ranking de Atrasos (Top 10)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.rankingAtrasos.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhum atraso registrado no período</p>
                  ) : (
                    <div className="space-y-2">
                      {data.rankingAtrasos.map((r, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${i < 3 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                            <div>
                              <p className="text-sm font-medium truncate max-w-[180px]">{r.nome}</p>
                              <p className="text-xs text-muted-foreground">{r.funcao}</p>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-amber-600">{r.atrasos}h</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
