import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, DollarSign, Users, TrendingUp, Percent, Building2, Briefcase, BarChart3 } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DashHorasExtras() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const [year, setYear] = useState(() => new Date().getFullYear());
  const { data, isLoading } = trpc.dashboards.horasExtras.useQuery({ companyId, year }, { enabled: companyId > 0 });

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
            <h1 className="text-2xl font-bold tracking-tight">Dashboard Horas Extras</h1>
            <p className="text-muted-foreground text-sm mt-1">Análise detalhada de horas extras — {year}</p>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <Label className="text-xs">Ano</Label>
              <Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-28" min={2020} max={2030} />
            </div>
            <PrintActions title="Dashboard Horas Extras" />
          </div>
        </div>

        {!data ? (
          <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <DashKpi label="Total de Horas" value={data.resumo.totalHoras.toLocaleString("pt-BR")} icon={Clock} color="orange" sub={`${data.resumo.totalRegistros} registros`} />
              <DashKpi label="Custo Total HE" value={fmtBRL(data.resumo.totalValor)} icon={DollarSign} color="red" />
              <DashKpi label="Pessoas com HE" value={data.resumo.pessoasComHE} icon={Users} color="blue" />
              <DashKpi label="Média por Pessoa" value={`${data.resumo.mediaHorasPorPessoa}h`} icon={TrendingUp} color="green" sub={fmtBRL(data.resumo.mediaValorPorPessoa)} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
              <DashKpi label="% HE sobre Folha Bruta" value={`${data.resumo.percentualHEsobreFolha}%`} icon={Percent} color="purple" sub={`Folha: ${fmtBRL(data.resumo.totalFolhaBruto)}`} />
              <DashKpi label="Custo HE / Pessoa" value={fmtBRL(data.resumo.mediaValorPorPessoa)} icon={DollarSign} color="teal" sub={`Média de ${data.resumo.mediaHorasPorPessoa}h por pessoa`} />
            </div>

            {/* Evolução Mensal */}
            <DashChart
              title={`Evolução Mensal de Horas Extras — ${year}`}
              type="bar"
              labels={data.evolucaoMensal.map(r => { const [, m] = r.mes.split("-"); const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]; return meses[parseInt(m) - 1]; })}
              datasets={[
                { label: "Horas", data: data.evolucaoMensal.map(r => r.horas), backgroundColor: "#F59E0B" },
              ]}
              height={280}
            />

            <DashChart
              title={`Custo Mensal de Horas Extras — ${year}`}
              type="line"
              labels={data.evolucaoMensal.map(r => { const [, m] = r.mes.split("-"); const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]; return meses[parseInt(m) - 1]; })}
              datasets={[
                { label: "Custo (R$)", data: data.evolucaoMensal.map(r => r.valor), borderColor: "#EF4444", backgroundColor: "rgba(239,68,68,0.1)", fill: true, tension: 0.3 },
              ]}
              height={280}
            />

            {/* Rankings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Por Obra */}
              {data.rankingObra.length > 0 && (
                <DashChart
                  title="Horas Extras por Obra"
                  type="horizontalBar"
                  labels={data.rankingObra.map(r => r.obra.length > 25 ? r.obra.slice(0, 25) + "..." : r.obra)}
                  datasets={[{ label: "Horas", data: data.rankingObra.map(r => r.horas), backgroundColor: "#3B82F6" }]}
                  height={Math.max(200, data.rankingObra.length * 35)}
                />
              )}
              {/* Por Setor */}
              {data.rankingSetor.length > 0 && (
                <DashChart
                  title="Horas Extras por Setor"
                  type="horizontalBar"
                  labels={data.rankingSetor.map(r => r.setor)}
                  datasets={[{ label: "Horas", data: data.rankingSetor.map(r => r.horas), backgroundColor: "#10B981" }]}
                  height={Math.max(200, data.rankingSetor.length * 35)}
                />
              )}
            </div>

            {/* Percentuais */}
            {data.percentuais.length > 0 && (
              <DashChart
                title="Distribuição por Percentual de Acréscimo"
                type="doughnut"
                labels={data.percentuais.map(p => p.percentual)}
                datasets={[{ data: data.percentuais.map(p => p.count), backgroundColor: ["#F59E0B", "#EF4444", "#3B82F6", "#10B981", "#8B5CF6"] }]}
                height={240}
              />
            )}

            {/* Ranking de Pessoas */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  Ranking de Horas Extras por Funcionário (Top 15)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.rankingPessoa.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma hora extra registrada no período</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">#</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Nome</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Função</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Setor</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Horas</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Valor</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Registros</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rankingPessoa.map((r, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3">
                              <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${i < 3 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                            </td>
                            <td className="py-2 pr-3 font-medium truncate max-w-[180px]">{r.nome}</td>
                            <td className="py-2 pr-3 text-muted-foreground text-xs">{r.funcao}</td>
                            <td className="py-2 pr-3 text-muted-foreground text-xs">{r.setor}</td>
                            <td className="py-2 pr-3 text-right font-bold text-orange-600">{r.horas.toLocaleString("pt-BR")}h</td>
                            <td className="py-2 pr-3 text-right font-semibold text-red-600">{fmtBRL(r.valor)}</td>
                            <td className="py-2 text-right text-muted-foreground">{r.registros}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Custo por Obra */}
            {data.rankingObra.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-500" />
                    Custo de Horas Extras por Obra
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Obra</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Horas</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Custo</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Pessoas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rankingObra.map((r, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium">{r.obra}</td>
                            <td className="py-2 pr-3 text-right font-semibold text-orange-600">{r.horas.toLocaleString("pt-BR")}h</td>
                            <td className="py-2 pr-3 text-right font-semibold text-red-600">{fmtBRL(r.valor)}</td>
                            <td className="py-2 text-right text-muted-foreground">{r.pessoas}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
