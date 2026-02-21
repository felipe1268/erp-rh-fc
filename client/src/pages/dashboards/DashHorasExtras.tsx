import { useState, useMemo } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import "@/components/ChartSetup";
import { CHART_COLORS, CHART_PALETTE, MONTHS_PT, defaultBarOptions, defaultDoughnutOptions, defaultHBarOptions } from "@/components/ChartSetup";
import { DashboardFilters, StatCard, EmptyDashboard } from "@/components/DashboardFilters";
import { trpc } from "@/lib/trpc";
import { Loader2, Clock, DollarSign, TrendingUp, Users, AlertTriangle, Trophy, Building2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCurrency = (v: number) => `R$ ${fmt(v)}`;

export default function DashHorasExtras() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId;
  const [year, setYear] = useState(new Date().getFullYear());
  const cid = companyId ? Number(companyId) : 0;
  const { data, isLoading } = trpc.dashboards.horasExtras.useQuery(
    { companyId: cid, year },
    { enabled: cid > 0 }
  );

  if (!companyId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-orange-500" />
          <h1 className="text-2xl font-bold">Dashboard Horas Extras</h1>
        </div>
        <DashboardFilters selectedCompany={companyId} setSelectedCompany={() => {}} selectedYear={year} setSelectedYear={setYear} />
        <EmptyDashboard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Clock className="h-6 w-6 text-orange-500" />
        <h1 className="text-2xl font-bold">Dashboard Horas Extras</h1>
        <Badge variant="outline" className="text-orange-600 border-orange-300">{year}</Badge>
      </div>
      <DashboardFilters selectedCompany={companyId} setSelectedCompany={() => {}} selectedYear={year} setSelectedYear={setYear} />
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <EmptyDashboard />
      ) : (
        <DashContent data={data} year={year} />
      )}
    </div>
  );
}

function DashContent({ data, year }: { data: any; year: number }) {
  const r = data.resumo;

  // Evolução mensal - gráfico de linha
  const evolucaoData = {
    labels: MONTHS_PT,
    datasets: [
      {
        label: "Horas Extras",
        data: data.evolucaoMensal.map((m: any) => m.horas),
        borderColor: CHART_COLORS.orange,
        backgroundColor: "rgba(249, 115, 22, 0.1)",
        fill: true,
        tension: 0.3,
        pointRadius: 5,
        pointBackgroundColor: CHART_COLORS.orange,
      },
      {
        label: "Custo (R$ centenas)",
        data: data.evolucaoMensal.map((m: any) => Math.round(m.valor / 100)),
        borderColor: CHART_COLORS.red,
        backgroundColor: "rgba(239, 68, 68, 0.05)",
        fill: false,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: CHART_COLORS.red,
        borderDash: [5, 5],
      },
    ],
  };

  const evolucaoOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top" as const, labels: { usePointStyle: true, font: { size: 12 } } },
      datalabels: { display: false },
    },
    scales: {
      y: { beginAtZero: true, ticks: { color: "#6B7280", font: { size: 11 } }, grid: { color: "#E5E7EB" } },
      x: { ticks: { color: "#6B7280", font: { size: 11 } }, grid: { display: false } },
    },
  };

  // HE por setor/obra - barras horizontais
  const setorData = {
    labels: data.rankingSetor.slice(0, 8).map((s: any) => s.setor.length > 20 ? s.setor.slice(0, 20) + "..." : s.setor),
    datasets: [{
      label: "Custo HE (R$)",
      data: data.rankingSetor.slice(0, 8).map((s: any) => Math.round(s.valor)),
      backgroundColor: CHART_PALETTE.slice(0, 8),
      borderRadius: 4,
    }],
  };

  const hbarCurrencyOptions = {
    ...defaultHBarOptions,
    plugins: {
      ...defaultHBarOptions.plugins,
      datalabels: {
        ...defaultHBarOptions.plugins.datalabels,
        formatter: (v: number) => v > 0 ? `R$ ${v.toLocaleString("pt-BR")}` : "",
      },
    },
  };

  // HE por setor - horas
  const setorHorasData = {
    labels: data.rankingSetor.slice(0, 8).map((s: any) => s.setor.length > 20 ? s.setor.slice(0, 20) + "..." : s.setor),
    datasets: [{
      label: "Horas Extras",
      data: data.rankingSetor.slice(0, 8).map((s: any) => Math.round(s.horas * 10) / 10),
      backgroundColor: CHART_COLORS.blue,
      borderRadius: 4,
    }],
  };

  // Distribuição por percentual de acréscimo
  const pctData = {
    labels: data.percentuais.map((p: any) => `${p.percentual}%`),
    datasets: [{
      data: data.percentuais.map((p: any) => p.count),
      backgroundColor: [CHART_COLORS.orange, CHART_COLORS.red, CHART_COLORS.gold, CHART_COLORS.purple, CHART_COLORS.cyan],
    }],
  };

  // Impacto HE vs Folha
  const impactoData = {
    labels: ["Folha Bruta", "Custo HE"],
    datasets: [{
      data: [r.totalFolhaBruto, r.totalValor],
      backgroundColor: [CHART_COLORS.blue, CHART_COLORS.red],
    }],
  };

  // Top 10 campeões - barras
  const top10 = data.rankingPessoa.slice(0, 10);
  const campeaoData = {
    labels: top10.map((p: any) => p.nome.split(" ").slice(0, 2).join(" ")),
    datasets: [{
      label: "Horas Extras",
      data: top10.map((p: any) => Math.round(p.horas * 10) / 10),
      backgroundColor: top10.map((_: any, i: number) =>
        i === 0 ? CHART_COLORS.red : i === 1 ? CHART_COLORS.orange : i === 2 ? CHART_COLORS.gold : CHART_COLORS.blue
      ),
      borderRadius: 4,
    }],
  };

  // Mês com mais HE
  const mesPico = data.evolucaoMensal.reduce((max: any, m: any) => m.horas > max.horas ? m : max, { horas: 0, mes: "" });
  const mesPicoLabel = mesPico.mes ? MONTHS_PT[parseInt(mesPico.mes.split("-")[1]) - 1] : "-";

  return (
    <div className="space-y-6">
      {/* KPIs Principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard title="Total Horas Extras" value={`${fmt(r.totalHoras)}h`} color="text-orange-600" />
        <StatCard title="Custo Total HE" value={fmtCurrency(r.totalValor)} color="text-red-600" />
        <StatCard title="Pessoas com HE" value={String(r.pessoasComHE)} color="text-blue-600" />
        <StatCard title="Média HE/Pessoa" value={`${fmt(r.mediaHorasPorPessoa)}h`} color="text-purple-600" />
        <StatCard title="% HE sobre Folha" value={`${fmt(r.percentualHEsobreFolha)}%`} color="text-amber-600" alert={r.percentualHEsobreFolha > 10} />
        <StatCard title="Mês Pico" value={mesPicoLabel} color="text-yellow-600" />
      </div>

      {/* Evolução Mensal */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-orange-500" />
          Evolução Mensal de Horas Extras — {year}
        </h3>
        <div style={{ height: 300 }}>
          <Line data={evolucaoData} options={evolucaoOptions} />
        </div>
      </Card>

      {/* Ranking Campeões + Impacto Financeiro */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top 10 Campeões */}
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Top 10 — Campeões de Horas Extras
          </h3>
          <div style={{ height: 350 }}>
            <Bar data={campeaoData} options={{
              ...defaultBarOptions,
              plugins: {
                ...defaultBarOptions.plugins,
                datalabels: {
                  ...defaultBarOptions.plugins.datalabels,
                  formatter: (v: number) => v > 0 ? `${v}h` : "",
                },
              },
            }} />
          </div>
        </Card>

        {/* Impacto HE vs Folha */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-red-500" />
            Impacto Financeiro
          </h3>
          <div style={{ height: 220 }}>
            <Doughnut data={impactoData} options={defaultDoughnutOptions} />
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Folha Bruta Total:</span>
              <span className="font-semibold">{fmtCurrency(r.totalFolhaBruto)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Custo HE Total:</span>
              <span className="font-semibold text-red-600">{fmtCurrency(r.totalValor)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground font-medium">% HE sobre Folha:</span>
              <span className="font-bold text-amber-600">{fmt(r.percentualHEsobreFolha)}%</span>
            </div>
          </div>
        </Card>
      </div>

      {/* HE por Obra/Setor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-500" />
            Custo HE por Obra/Setor
          </h3>
          <div style={{ height: 300 }}>
            <Bar data={setorData} options={hbarCurrencyOptions} />
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            Horas Extras por Obra/Setor
          </h3>
          <div style={{ height: 300 }}>
            <Bar data={setorHorasData} options={{
              ...defaultHBarOptions,
              plugins: {
                ...defaultHBarOptions.plugins,
                datalabels: {
                  ...defaultHBarOptions.plugins.datalabels,
                  formatter: (v: number) => v > 0 ? `${v}h` : "",
                },
              },
            }} />
          </div>
        </Card>
      </div>

      {/* Distribuição % Acréscimo + Tabela Detalhada */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Distribuição por % Acréscimo</h3>
          <div style={{ height: 250 }}>
            <Doughnut data={pctData} options={defaultDoughnutOptions} />
          </div>
        </Card>

        {/* Tabela detalhada dos setores */}
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold mb-4">Detalhamento por Obra/Setor</h3>
          <div className="overflow-auto max-h-[300px]">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Obra/Setor</th>
                  <th className="p-2 text-center">Pessoas</th>
                  <th className="p-2 text-right">Horas</th>
                  <th className="p-2 text-right">Custo</th>
                  <th className="p-2 text-right">Média/Pessoa</th>
                </tr>
              </thead>
              <tbody>
                {data.rankingSetor.map((s: any, i: number) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="p-2 font-medium">{s.setor}</td>
                    <td className="p-2 text-center">{s.pessoas}</td>
                    <td className="p-2 text-right">{fmt(s.horas)}h</td>
                    <td className="p-2 text-right text-red-600 font-medium">{fmtCurrency(s.valor)}</td>
                    <td className="p-2 text-right">{fmtCurrency(s.pessoas > 0 ? s.valor / s.pessoas : 0)}</td>
                  </tr>
                ))}
                {data.rankingSetor.length === 0 ? (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Nenhuma hora extra registrada</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Ranking Completo de Pessoas */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-orange-500" />
          Ranking Completo — Horas Extras por Pessoa
        </h3>
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="p-2 text-center w-12">#</th>
                <th className="p-2 text-left">Funcionário</th>
                <th className="p-2 text-left">Cargo</th>
                <th className="p-2 text-left">Setor/Obra</th>
                <th className="p-2 text-right">Valor/Hora</th>
                <th className="p-2 text-right">Horas Extras</th>
                <th className="p-2 text-right">Registros</th>
                <th className="p-2 text-right">Custo Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rankingPessoa.map((p: any, i: number) => (
                <tr key={p.employeeId} className={`border-b hover:bg-muted/30 ${i < 3 ? "bg-amber-50/50" : ""}`}>
                  <td className="p-2 text-center">
                    {i === 0 ? <span className="text-lg">🥇</span> :
                     i === 1 ? <span className="text-lg">🥈</span> :
                     i === 2 ? <span className="text-lg">🥉</span> :
                     <span className="text-muted-foreground">{i + 1}</span>}
                  </td>
                  <td className="p-2 font-medium">{p.nome}</td>
                  <td className="p-2 text-muted-foreground">{p.cargo}</td>
                  <td className="p-2">{p.setor}</td>
                  <td className="p-2 text-right">R$ {p.valorHora}</td>
                  <td className="p-2 text-right font-semibold text-orange-600">{fmt(p.horas)}h</td>
                  <td className="p-2 text-right">{p.registros}</td>
                  <td className="p-2 text-right font-semibold text-red-600">{fmtCurrency(p.valor)}</td>
                </tr>
              ))}
              {data.rankingPessoa.length === 0 ? (
                <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhuma hora extra registrada</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Resumo Mensal Detalhado */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Resumo Mensal — {year}</h3>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-left">Mês</th>
                <th className="p-2 text-right">Registros</th>
                <th className="p-2 text-right">Horas</th>
                <th className="p-2 text-right">Custo</th>
                <th className="p-2 text-center">Tendência</th>
              </tr>
            </thead>
            <tbody>
              {data.evolucaoMensal.map((m: any, i: number) => {
                const prev = i > 0 ? data.evolucaoMensal[i - 1] : null;
                const trend = prev ? m.valor - prev.valor : 0;
                return (
                  <tr key={m.mes} className={`border-b hover:bg-muted/30 ${m.horas > 0 ? "" : "opacity-50"}`}>
                    <td className="p-2 font-medium">{MONTHS_PT[i]}</td>
                    <td className="p-2 text-right">{m.registros}</td>
                    <td className="p-2 text-right">{m.horas > 0 ? `${fmt(m.horas)}h` : "-"}</td>
                    <td className="p-2 text-right font-medium">{m.valor > 0 ? fmtCurrency(m.valor) : "-"}</td>
                    <td className="p-2 text-center">
                      {m.horas > 0 && prev && prev.horas > 0 ? (
                        trend > 0 ? (
                          <span className="inline-flex items-center text-red-500 text-xs"><ArrowUpRight className="h-3 w-3" /> +{fmt(trend)}</span>
                        ) : trend < 0 ? (
                          <span className="inline-flex items-center text-green-500 text-xs"><ArrowDownRight className="h-3 w-3" /> {fmt(trend)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/50 font-semibold">
              <tr>
                <td className="p-2">Total</td>
                <td className="p-2 text-right">{r.totalRegistros}</td>
                <td className="p-2 text-right text-orange-600">{fmt(r.totalHoras)}h</td>
                <td className="p-2 text-right text-red-600">{fmtCurrency(r.totalValor)}</td>
                <td className="p-2 text-center">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
