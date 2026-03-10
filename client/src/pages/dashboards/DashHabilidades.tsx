import { CHART_PALETTE, CHART_FILL, getChartColors } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Wrench, Users, Building2, ArrowLeft, BarChart3,
  TrendingUp, AlertTriangle, CheckCircle, Layers, Award
} from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useMemo } from "react";

const NIVEL_LABELS: Record<string, string> = {
  Basico: "Básico",
  Intermediario: "Intermediário",
  Avancado: "Avançado",
};

const NIVEL_COLORS: Record<string, string> = {
  Basico: "#5B8DEF",
  Intermediario: "#F5A962",
  Avancado: "#67C587",
};

export default function DashHabilidades() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryInput = isConstrutoras
    ? { companyId: companyIds[0] || 0, companyIds }
    : { companyId };

  const { data, isLoading } = trpc.skills.dashboardData.useQuery(
    queryInput,
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </DashboardLayout>
  );

  const d = data as any;
  const kpis = d?.kpis || {};
  const byCategory = (d?.byCategory || []) as any[];
  const byLevel = (d?.byLevel || []) as any[];
  const topSkills = (d?.topSkills || []) as any[];
  const byObra = (d?.byObra || []) as any[];

  return (
    <DashboardLayout>
      <div className="space-y-6" id="print-area">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboards" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" /> Voltar aos Dashboards
              </Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="w-6 h-6" /> Dashboard de Habilidades
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Visão consolidada de habilidades e competências técnicas
            </p>
          </div>
          <PrintActions title="Dashboard de Habilidades" />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <DashKpi label="Habilidades Cadastradas" value={kpis.totalSkills || 0} color="blue" icon={Wrench} />
          <DashKpi label="Atribuições Ativas" value={kpis.totalAssignments || 0} color="purple" icon={Award} />
          <DashKpi label="Funcionários c/ Habilidade" value={kpis.totalWithSkill || 0} color="green" icon={Users} />
          <DashKpi label="Funcionários Ativos" value={kpis.totalActive || 0} color="teal" icon={Users} />
          <DashKpi label="Sem Habilidade" value={kpis.totalNoSkill || 0} color="orange" icon={AlertTriangle} />
          <DashKpi label="Cobertura" value={`${kpis.coveragePercent || 0}%`} color="indigo" icon={TrendingUp} />
        </div>

        {/* Charts Row 1: Category Distribution + Level Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {byCategory.length > 0 && (
            <DashChart
              title="Distribuição por Categoria"
              type="doughnut"
              labels={byCategory.map((c: any) => c.categoria || "Sem Categoria")}
              datasets={[{
                label: "Funcionários",
                data: byCategory.map((c: any) => Number(c.qtd)),
                backgroundColor: getChartColors(byCategory.length),
              }]}
              height={300}
              showPercentage={true}
            />
          )}
          {byLevel.length > 0 && (
            <DashChart
              title="Distribuição por Nível"
              type="doughnut"
              labels={byLevel.map((l: any) => NIVEL_LABELS[l.nivel] || l.nivel)}
              datasets={[{
                label: "Atribuições",
                data: byLevel.map((l: any) => Number(l.qtd)),
                backgroundColor: byLevel.map((l: any) => NIVEL_COLORS[l.nivel] || CHART_PALETTE[0]),
              }]}
              height={300}
              showPercentage={true}
            />
          )}
        </div>

        {/* Top Skills Chart */}
        {topSkills.length > 0 && (
          <DashChart
            title="Top 15 Habilidades Mais Atribuídas"
            type="horizontalBar"
            labels={topSkills.map((s: any) => s.nome)}
            datasets={[{
              label: "Funcionários",
              data: topSkills.map((s: any) => Number(s.qtd)),
              backgroundColor: getChartColors(topSkills.length),
            }]}
            height={Math.max(300, topSkills.length * 35)}
            showPercentage={false}
          />
        )}

        {/* Skills per Obra */}
        {byObra.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" /> Habilidades por Obra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2">Obra</th>
                      <th className="text-right px-4 py-2">Func. c/ Habilidade</th>
                      <th className="text-right px-4 py-2">Habilidades Distintas</th>
                      <th className="text-center px-4 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byObra.map((o: any) => (
                      <tr key={o.obraId} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{o.obraNome}</td>
                        <td className="px-4 py-2 text-right">
                          <Badge variant="outline">{Number(o.empComSkill)}</Badge>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Badge variant="outline" className="bg-blue-50">{Number(o.skillsDistintas)}</Badge>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Link href="/relatorios/habilidades-obra">
                            <span className="text-xs text-primary hover:underline cursor-pointer">Ver Detalhes</span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/50 font-bold">
                      <td className="px-4 py-2">Total</td>
                      <td className="px-4 py-2 text-right">
                        {byObra.reduce((s: number, o: any) => s + Number(o.empComSkill), 0)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {byObra.reduce((s: number, o: any) => s + Number(o.skillsDistintas), 0)}
                      </td>
                      <td className="px-4 py-2"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Coverage Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> Análise de Cobertura
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-green-600">{kpis.coveragePercent || 0}%</div>
                <div className="text-sm text-muted-foreground mt-1">dos funcionários possuem ao menos 1 habilidade</div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(kpis.coveragePercent || 0, 100)}%` }}
                  />
                </div>
              </div>
              <div className="border rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {kpis.totalActive > 0 ? (kpis.totalAssignments / kpis.totalActive).toFixed(1) : '0'}
                </div>
                <div className="text-sm text-muted-foreground mt-1">habilidades por funcionário (média)</div>
              </div>
              <div className="border rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-orange-600">{kpis.totalNoSkill || 0}</div>
                <div className="text-sm text-muted-foreground mt-1">funcionários sem nenhuma habilidade</div>
                <Link href="/habilidades/importacao">
                  <span className="text-xs text-primary hover:underline cursor-pointer mt-2 inline-block">
                    Atribuir em Massa
                  </span>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <PrintFooterLGPD />
      </div>
    </DashboardLayout>
  );
}
