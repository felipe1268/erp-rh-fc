import { useState, useMemo } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import "@/components/ChartSetup";
import { CHART_COLORS, MONTHS_PT, defaultBarOptions, defaultDoughnutOptions } from "@/components/ChartSetup";
import { DashboardFilters, StatCard, EmptyDashboard } from "@/components/DashboardFilters";
import { trpc } from "@/lib/trpc";
import { Loader2, ListChecks } from "lucide-react";

export default function Dash5w2h() {
  const [companyId, setCompanyId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const cid = companyId ? Number(companyId) : 0;
  const { data, isLoading } = trpc.dashboards.planos5w2h.useQuery(
    { companyId: cid, year },
    { enabled: cid > 0 }
  );

  const statusColors: Record<string, string> = {
    Pendente: CHART_COLORS.amber,
    Em_Andamento: CHART_COLORS.blue,
    Concluido: CHART_COLORS.green,
    Cancelado: CHART_COLORS.slate,
  };

  const monthlyData = useMemo(() => {
    if (!data?.porMes) return null;
    const statuses = Array.from(new Set(data.porMes.map(p => p.status)));
    return {
      labels: MONTHS_PT,
      datasets: statuses.map(status => ({
        label: status?.replace("_", " ") || "Sem status",
        data: Array.from({ length: 12 }, (_, i) => {
          const found = data.porMes.find(p => p.mes === i + 1 && p.status === status);
          return found ? found.count : 0;
        }),
        backgroundColor: statusColors[status || ""] || CHART_COLORS.slate,
        borderRadius: 4,
      })),
    };
  }, [data?.porMes]);

  if (!companyId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <ListChecks className="h-6 w-6 text-indigo-500" />
          <h1 className="text-2xl font-bold">Dashboard 5W2H</h1>
        </div>
        <DashboardFilters selectedCompany={companyId} setSelectedCompany={setCompanyId} selectedYear={year} setSelectedYear={setYear} />
        <EmptyDashboard />
      </div>
    );
  }

  const concluidos = data?.statusDist.find(s => s.label === "Concluido")?.value ?? 0;
  const emAberto = data?.statusDist.find(s => s.label === "Pendente")?.value ?? 0;
  const emAndamento = data?.statusDist.find(s => s.label === "Em_Andamento")?.value ?? 0;
  const total = data?.statusDist.reduce((s, v) => s + v.value, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ListChecks className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold">Dashboard 5W2H</h1>
      </div>
      <DashboardFilters selectedCompany={companyId} setSelectedCompany={setCompanyId} selectedYear={year} setSelectedYear={setYear} />

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <EmptyDashboard message="Nenhum dado encontrado." />
      ) : (
        <>
          {/* Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard title="Concluídos" value={concluidos} color="text-green-600" />
            <StatCard title="Em Aberto" value={emAberto} color="text-amber-500" />
            <StatCard title="Em Andamento" value={emAndamento} color="text-blue-500" />
            <StatCard title="Total" value={total} color="text-foreground" />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Pie */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Status dos Planos de Ação</h3>
              <div style={{ height: 280 }}>
                <Doughnut
                  data={{
                    labels: data.statusDist.map(s => (s.label || "").replace("_", " ")),
                    datasets: [{
                      data: data.statusDist.map(s => s.value),
                      backgroundColor: data.statusDist.map(s => statusColors[s.label || ""] || CHART_COLORS.slate),
                    }],
                  }}
                  options={defaultDoughnutOptions}
                />
              </div>
            </div>

            {/* Por mês */}
            {monthlyData && (
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="font-semibold mb-3">Planos por Mês ({year})</h3>
                <div style={{ height: 280 }}>
                  <Bar
                    data={monthlyData}
                    options={{
                      ...defaultBarOptions,
                      plugins: {
                        ...defaultBarOptions.plugins,
                        legend: { display: true, position: "top" as const },
                        datalabels: { display: false },
                      },
                      scales: {
                        ...defaultBarOptions.scales,
                        x: { ...defaultBarOptions.scales.x, stacked: true },
                        y: { ...defaultBarOptions.scales.y, stacked: true },
                      },
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
