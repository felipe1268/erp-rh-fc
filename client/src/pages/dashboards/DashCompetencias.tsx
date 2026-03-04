import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CalendarDays, DollarSign, TrendingUp, TrendingDown, Users, Wallet,
  Building2, AlertTriangle, CheckCircle, Clock, ArrowLeft, Lock, Unlock,
  BarChart3, Shield, Banknote
} from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_COLORS: Record<string, string> = {
  aberta: "bg-blue-100 text-blue-800",
  ponto_importado: "bg-yellow-100 text-yellow-800",
  aferida: "bg-orange-100 text-orange-800",
  vale_gerado: "bg-purple-100 text-purple-800",
  pagamento_simulado: "bg-indigo-100 text-indigo-800",
  consolidada: "bg-green-100 text-green-800",
  travada: "bg-gray-100 text-gray-800",
};

const STATUS_LABELS: Record<string, string> = {
  aberta: "Aberta",
  ponto_importado: "Ponto Importado",
  aferida: "Aferida",
  vale_gerado: "Vale Gerado",
  pagamento_simulado: "Pagamento Simulado",
  consolidada: "Consolidada",
  travada: "Travada",
};

export default function DashCompetencias() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const { data, isLoading } = trpc.dashboards.competenciasAnual.useQuery(
    { companyId, ano },
    { enabled: companyId > 0 }
  );

  const years = useMemo(() => {
    const cur = new Date().getFullYear();
    return [cur - 2, cur - 1, cur, cur + 1];
  }, []);

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </DashboardLayout>
  );

  const d = data as any;
  const kpis = d?.kpis || {};
  const periodos = d?.periodos || [];
  const evolucao = d?.evolucaoMensal || [];
  const inconsistencias = d?.inconsistencias || [];
  const custoObra = d?.custoObra || [];

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
            <h1 className="text-2xl font-bold tracking-tight">Dashboard de Competências</h1>
            <p className="text-muted-foreground text-sm mt-1">Visão consolidada de todas as competências — {ano}</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <PrintActions title={`Dashboard Competências ${ano}`} />
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashKpi label="Total Bruto Anual" value={fmtBRL(kpis.totalBrutoAnual || 0)} color="blue" icon={DollarSign} />
          <DashKpi label="Total Líquido Anual" value={fmtBRL(kpis.totalLiquidoAnual || 0)} color="green" icon={Wallet} />
          <DashKpi label="Total Descontos" value={fmtBRL(kpis.totalDescontosAnual || 0)} color="red" icon={TrendingDown} />
          <DashKpi label="Benefícios (VA+VT+VR)" value={fmtBRL(kpis.totalBeneficiosAnual || 0)} color="purple" icon={Banknote} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashKpi label="FGTS Anual" value={fmtBRL(kpis.totalFGTSAnual || 0)} color="orange" icon={Shield} />
          <DashKpi label="INSS Anual" value={fmtBRL(kpis.totalINSSAnual || 0)} color="teal" icon={Shield} />
          <DashKpi label="Competências Abertas" value={kpis.competenciasAbertas || 0} color="yellow" icon={Unlock} />
          <DashKpi label="Competências Fechadas" value={kpis.competenciasFechadas || 0} color="slate" icon={Lock} />
        </div>

        {/* Timeline de Competências */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5" /> Timeline de Competências {ano}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {periodos.length > 0 ? (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {periodos.map((p: any) => (
                  <Link key={p.mesReferencia} href={`/gestao-competencias?mes=${p.mesReferencia}`}>
                    <div className="border rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer">
                      <div className="text-center">
                        <div className="text-lg font-bold">{p.mesLabel}</div>
                        <Badge className={`text-[10px] mt-1 ${STATUS_COLORS[p.status] || 'bg-gray-100'}`}>
                          {STATUS_LABELS[p.status] || p.status}
                        </Badge>
                        {p.totalFuncionarios && (
                          <div className="text-xs text-muted-foreground mt-2">
                            <Users className="w-3 h-3 inline mr-1" />{p.totalFuncionarios} func.
                          </div>
                        )}
                        {p.totalLiquido && (
                          <div className="text-xs font-medium text-blue-700 mt-1">
                            {fmtBRL(Number(p.totalLiquido || 0))}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nenhuma competência encontrada para {ano}.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Evolução Mensal - Gráfico de Linha */}
        {evolucao.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashChart
              title="Evolução Salarial Mensal"
              type="line"
              labels={evolucao.map((e: any) => e.mes)}
              datasets={[
                {
                  label: "Bruto",
                  data: evolucao.map((e: any) => e.bruto),
                  borderColor: CHART_PALETTE[0],
                  backgroundColor: CHART_FILL.azul,
                  fill: true,
                  tension: 0.3,
                },
                {
                  label: "Líquido",
                  data: evolucao.map((e: any) => e.liquido),
                  borderColor: CHART_PALETTE[1],
                  backgroundColor: CHART_FILL.verde,
                  fill: true,
                  tension: 0.3,
                },
                {
                  label: "Descontos",
                  data: evolucao.map((e: any) => e.descontos),
                  borderColor: CHART_PALETTE[5],
                  backgroundColor: CHART_FILL.vermelho,
                  fill: true,
                  tension: 0.3,
                },
              ]}
              height={300}
              valueFormatter={(v) => fmtBRL(v)}
              showPercentage={false}
            />
            <DashChart
              title="Encargos & Benefícios Mensal"
              type="bar"
              labels={evolucao.map((e: any) => e.mes)}
              datasets={[
                {
                  label: "FGTS",
                  data: evolucao.map((e: any) => e.fgts),
                  backgroundColor: CHART_PALETTE[2],
                },
                {
                  label: "INSS",
                  data: evolucao.map((e: any) => e.inss),
                  backgroundColor: CHART_PALETTE[4],
                },
                {
                  label: "VA",
                  data: evolucao.map((e: any) => e.va),
                  backgroundColor: CHART_PALETTE[1],
                },
                {
                  label: "VT",
                  data: evolucao.map((e: any) => e.vt),
                  backgroundColor: CHART_PALETTE[3],
                },
                {
                  label: "VR",
                  data: evolucao.map((e: any) => e.vr),
                  backgroundColor: CHART_PALETTE[0],
                },
              ]}
              height={300}
              valueFormatter={(v) => fmtBRL(v)}
              showPercentage={false}
            />
          </div>
        )}

        {/* Funcionários e Horas Extras */}
        {evolucao.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashChart
              title="Funcionários por Mês"
              type="bar"
              labels={evolucao.map((e: any) => e.mes)}
              datasets={[{
                label: "Funcionários",
                data: evolucao.map((e: any) => e.funcionarios),
                backgroundColor: CHART_PALETTE[0],
              }]}
              height={250}
              showPercentage={false}
            />
            <DashChart
              title="Horas Extras Mensal (R$)"
              type="bar"
              labels={evolucao.map((e: any) => e.mes)}
              datasets={[{
                label: "Horas Extras",
                data: evolucao.map((e: any) => e.he),
                backgroundColor: CHART_PALETTE[2],
              }]}
              height={250}
              valueFormatter={(v) => fmtBRL(v)}
              showPercentage={false}
            />
          </div>
        )}

        {/* Inconsistências */}
        {inconsistencias.length > 0 && (
          <DashChart
            title="Inconsistências de Ponto por Mês"
            type="bar"
            labels={inconsistencias.map((i: any) => i.mes)}
            datasets={[
              {
                label: "Total Registros",
                data: inconsistencias.map((i: any) => i.total),
                backgroundColor: CHART_PALETTE[0],
              },
              {
                label: "Inconsistentes",
                data: inconsistencias.map((i: any) => i.inconsistentes),
                backgroundColor: SEMANTIC_COLORS.negativo,
              },
              {
                label: "Resolvidas",
                data: inconsistencias.map((i: any) => i.resolvidas),
                backgroundColor: SEMANTIC_COLORS.positivo,
              },
            ]}
            height={280}
            showPercentage={false}
          />
        )}

        {/* Custo por Obra */}
        {custoObra.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" /> Custo por Obra — {ano}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2">Obra</th>
                      <th className="text-right px-4 py-2">Funcionários</th>
                      <th className="text-right px-4 py-2">Dias Trabalhados</th>
                      <th className="text-right px-4 py-2">Horas Normais</th>
                      <th className="text-right px-4 py-2">Horas Extras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {custoObra.map((o: any) => (
                      <tr key={o.obraId} className="border-t">
                        <td className="px-4 py-2 font-medium">{o.obraNome}</td>
                        <td className="px-4 py-2 text-right">{o.funcionarios}</td>
                        <td className="px-4 py-2 text-right">{o.diasTrabalhados}</td>
                        <td className="px-4 py-2 text-right">{o.horasNormais.toFixed(1)}h</td>
                        <td className="px-4 py-2 text-right text-orange-600">{o.horasExtras.toFixed(1)}h</td>
                      </tr>
                    ))}
                    <tr className="border-t bg-gray-50 font-bold">
                      <td className="px-4 py-2">Total</td>
                      <td className="px-4 py-2 text-right">{custoObra.reduce((s: number, o: any) => s + o.funcionarios, 0)}</td>
                      <td className="px-4 py-2 text-right">{custoObra.reduce((s: number, o: any) => s + o.diasTrabalhados, 0)}</td>
                      <td className="px-4 py-2 text-right">{custoObra.reduce((s: number, o: any) => s + o.horasNormais, 0).toFixed(1)}h</td>
                      <td className="px-4 py-2 text-right text-orange-600">{custoObra.reduce((s: number, o: any) => s + o.horasExtras, 0).toFixed(1)}h</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <PrintFooterLGPD />
      </div>
    </DashboardLayout>
  );
}
