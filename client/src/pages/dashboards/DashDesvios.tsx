import { useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { Bar, Doughnut } from "react-chartjs-2";
import "@/components/ChartSetup";
import { CHART_COLORS, CHART_PALETTE, defaultBarOptions, defaultDoughnutOptions, defaultHBarOptions } from "@/components/ChartSetup";
import { DashboardFilters, StatCard, EmptyDashboard } from "@/components/DashboardFilters";
import { trpc } from "@/lib/trpc";
import { Loader2, AlertOctagon } from "lucide-react";

export default function DashDesvios() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId;
  const [year, setYear] = useState(new Date().getFullYear());
  const cid = companyId ? Number(companyId) : 0;
  const { data, isLoading } = trpc.dashboards.desvios.useQuery(
    { companyId: cid, year },
    { enabled: cid > 0 }
  );

  if (!companyId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <AlertOctagon className="h-6 w-6 text-orange-500" />
          <h1 className="text-2xl font-bold">Dashboard Desvios</h1>
        </div>
        <DashboardFilters selectedCompany={companyId} setSelectedCompany={() => {}} selectedYear={year} setSelectedYear={setYear} />
        <EmptyDashboard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <AlertOctagon className="h-6 w-6 text-orange-500" />
        <h1 className="text-2xl font-bold">Dashboard Desvios</h1>
      </div>
      <DashboardFilters selectedCompany={companyId} setSelectedCompany={() => {}} selectedYear={year} setSelectedYear={setYear} />

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <EmptyDashboard message="Nenhum dado encontrado." />
      ) : (
        <>
          {/* Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard title="Total de Desvios" value={data.total} color="text-foreground" />
            <StatCard title="Concluídos" value={data.concluidos} color="text-green-600" />
            <StatCard
              title="Taxa de Resolução"
              value={data.total > 0 ? `${Math.round((data.concluidos / data.total) * 100)}%` : "N/A"}
              color="text-blue-600"
            />
          </div>

          {/* Progress bar */}
          {data.total > 0 ? (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Progresso de Resolução</h3>
              <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                <div
                  className="h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{
                    width: `${Math.max(5, Math.round((data.concluidos / data.total) * 100))}%`,
                    backgroundColor: CHART_COLORS.green,
                  }}
                >
                  {data.concluidos} / {data.total}
                </div>
              </div>
            </div>
          ) : null}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Status dos Desvios</h3>
              <div style={{ height: 280 }}>
                <Doughnut
                  data={{
                    labels: data.statusDist.map(s => (s.label || "").replace("_", " ")),
                    datasets: [{
                      data: data.statusDist.map(s => s.value),
                      backgroundColor: [CHART_COLORS.amber, CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.slate],
                    }],
                  }}
                  options={defaultDoughnutOptions}
                />
              </div>
            </div>

            {/* Por Tipo */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Desvios por Tipo</h3>
              <div style={{ height: 280 }}>
                <Bar
                  data={{
                    labels: data.porTipo.map(t => (t.label || "").replace("_", " ")),
                    datasets: [{
                      data: data.porTipo.map(t => t.value),
                      backgroundColor: CHART_PALETTE.slice(0, data.porTipo.length),
                      borderRadius: 4,
                    }],
                  }}
                  options={defaultBarOptions}
                />
              </div>
            </div>
          </div>

          {/* Por Setor */}
          {data.porSetor.length > 0 ? (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Desvios por Setor</h3>
              <div style={{ height: Math.max(200, data.porSetor.length * 35) }}>
                <Bar
                  data={{
                    labels: data.porSetor.map(s => s.label),
                    datasets: [{
                      data: data.porSetor.map(s => s.value),
                      backgroundColor: CHART_COLORS.orange,
                      borderRadius: 4,
                    }],
                  }}
                  options={defaultHBarOptions}
                />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
