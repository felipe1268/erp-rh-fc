import { useState, useMemo } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import "@/components/ChartSetup";
import { CHART_PALETTE, CHART_COLORS, defaultBarOptions, defaultDoughnutOptions, defaultHBarOptions } from "@/components/ChartSetup";
import { DashboardFilters, StatCard, EmptyDashboard } from "@/components/DashboardFilters";
import { trpc } from "@/lib/trpc";
import { Loader2, Users } from "lucide-react";

export default function DashColaboradores() {
  const [companyId, setCompanyId] = useState("");
  const cid = companyId ? Number(companyId) : 0;
  const { data, isLoading } = trpc.dashboards.colaboradores.useQuery(
    { companyId: cid },
    { enabled: cid > 0 }
  );

  const agePyramid = useMemo(() => {
    if (!data?.ageDist) return null;
    const faixas = ["14-20", "21-25", "26-30", "31-40", "41-50", "51-60", "61+"];
    const mData = faixas.map(f => {
      const found = data.ageDist.filter(a => a.faixa === f && a.sexo === "M");
      return found.reduce((s, a) => s + a.count, 0);
    });
    const fData = faixas.map(f => {
      const found = data.ageDist.filter(a => a.faixa === f && a.sexo === "F");
      return found.reduce((s, a) => s + a.count, 0);
    });
    return {
      labels: faixas,
      datasets: [
        { label: "Masculino", data: mData.map(v => -v), backgroundColor: CHART_COLORS.blue, barPercentage: 0.8 },
        { label: "Feminino", data: fData, backgroundColor: CHART_COLORS.gold, barPercentage: 0.8 },
      ],
    };
  }, [data?.ageDist]);

  if (!companyId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-blue-500" />
          <h1 className="text-2xl font-bold">Dashboard Colaboradores</h1>
        </div>
        <DashboardFilters selectedCompany={companyId} setSelectedCompany={setCompanyId} showYear={false} />
        <EmptyDashboard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-blue-500" />
        <h1 className="text-2xl font-bold">Dashboard Colaboradores</h1>
      </div>
      <DashboardFilters selectedCompany={companyId} setSelectedCompany={setCompanyId} showYear={false} />

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <EmptyDashboard message="Nenhum dado encontrado." />
      ) : (
        <>
          {/* Status Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {data.statusDist.map(s => (
              <StatCard
                key={s.label}
                title={s.label}
                value={s.value}
                color={s.label === "Ativo" ? "text-green-600" : s.label === "Desligado" ? "text-red-500" : "text-foreground"}
              />
            ))}
            <StatCard title="Total" value={data.statusDist.reduce((s, v) => s + v.value, 0)} color="text-blue-600" />
          </div>

          {/* Destaques */}
          {data.destaques && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {data.destaques.maisVelho && (
                <div className="bg-card rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase">Mais Velho</p>
                  <p className="font-semibold text-sm truncate">{data.destaques.maisVelho.nome}</p>
                  <p className="text-xs text-muted-foreground">{String(data.destaques.maisVelho.data)}</p>
                </div>
              )}
              {data.destaques.maisNovo && (
                <div className="bg-card rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase">Mais Novo</p>
                  <p className="font-semibold text-sm truncate">{data.destaques.maisNovo.nome}</p>
                  <p className="text-xs text-muted-foreground">{String(data.destaques.maisNovo.data)}</p>
                </div>
              )}
              {data.destaques.maiorTempo && (
                <div className="bg-card rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase">Maior Tempo</p>
                  <p className="font-semibold text-sm truncate">{data.destaques.maiorTempo.nome}</p>
                  <p className="text-xs text-muted-foreground">Admissão: {String(data.destaques.maiorTempo.data)}</p>
                </div>
              )}
              {data.destaques.menorTempo && (
                <div className="bg-card rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground uppercase">Menor Tempo</p>
                  <p className="font-semibold text-sm truncate">{data.destaques.menorTempo.nome}</p>
                  <p className="text-xs text-muted-foreground">Admissão: {String(data.destaques.menorTempo.data)}</p>
                </div>
              )}
            </div>
          )}

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Pie */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Status dos Colaboradores</h3>
              <div style={{ height: 280 }}>
                <Doughnut
                  data={{
                    labels: data.statusDist.map(s => s.label),
                    datasets: [{
                      data: data.statusDist.map(s => s.value),
                      backgroundColor: CHART_PALETTE.slice(0, data.statusDist.length),
                    }],
                  }}
                  options={defaultDoughnutOptions}
                />
              </div>
            </div>

            {/* Setor Pie */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Colaboradores por Setor</h3>
              <div style={{ height: 280 }}>
                <Doughnut
                  data={{
                    labels: data.setorDist.map(s => s.label),
                    datasets: [{
                      data: data.setorDist.map(s => s.value),
                      backgroundColor: CHART_PALETTE.slice(0, data.setorDist.length),
                    }],
                  }}
                  options={defaultDoughnutOptions}
                />
              </div>
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Função Bar */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Top 10 Funções</h3>
              <div style={{ height: 300 }}>
                <Bar
                  data={{
                    labels: data.funcaoDist.map(f => f.label),
                    datasets: [{
                      data: data.funcaoDist.map(f => f.value),
                      backgroundColor: CHART_COLORS.blue,
                    }],
                  }}
                  options={{
                    ...defaultHBarOptions,
                    plugins: { ...defaultHBarOptions.plugins, datalabels: { ...defaultHBarOptions.plugins.datalabels, font: { size: 10, weight: "bold" as const } } },
                  }}
                />
              </div>
            </div>

            {/* Age Pyramid */}
            {agePyramid && (
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="font-semibold mb-3">Colaboradores por Sexo e Idade</h3>
                <div style={{ height: 300 }}>
                  <Bar
                    data={agePyramid}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      indexAxis: "y" as const,
                      plugins: {
                        legend: { display: true, position: "top" as const },
                        datalabels: {
                          display: true,
                          color: "#374151",
                          font: { size: 10, weight: "bold" as const },
                          formatter: (v: number) => Math.abs(v) > 0 ? Math.abs(v) : "",
                        },
                      },
                      scales: {
                        x: {
                          ticks: {
                            callback: (v: any) => Math.abs(Number(v)),
                            color: "#6B7280",
                          },
                          grid: { color: "#E5E7EB" },
                        },
                        y: {
                          ticks: { color: "#374151", font: { size: 11 } },
                          grid: { display: false },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Charts Row 3 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sexo Pie */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Colaboradores por Sexo</h3>
              <div style={{ height: 250 }}>
                <Doughnut
                  data={{
                    labels: data.sexDist.map(s => s.label),
                    datasets: [{
                      data: data.sexDist.map(s => s.value),
                      backgroundColor: [CHART_COLORS.blue, CHART_COLORS.gold, CHART_COLORS.slate],
                    }],
                  }}
                  options={defaultDoughnutOptions}
                />
              </div>
            </div>

            {/* Tipo Contrato */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Tipo de Contrato</h3>
              <div style={{ height: 250 }}>
                <Doughnut
                  data={{
                    labels: data.contratoDist.map(s => s.label),
                    datasets: [{
                      data: data.contratoDist.map(s => s.value),
                      backgroundColor: CHART_PALETTE.slice(0, data.contratoDist.length),
                    }],
                  }}
                  options={defaultDoughnutOptions}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
