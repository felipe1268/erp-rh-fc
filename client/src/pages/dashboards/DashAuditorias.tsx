import { useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { Bar, Doughnut } from "react-chartjs-2";
import "@/components/ChartSetup";
import { CHART_COLORS, CHART_PALETTE, defaultBarOptions, defaultDoughnutOptions } from "@/components/ChartSetup";
import { DashboardFilters, StatCard, EmptyDashboard } from "@/components/DashboardFilters";
import { trpc } from "@/lib/trpc";
import { Loader2, ClipboardCheck } from "lucide-react";

export default function DashAuditorias() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId;
  const [year, setYear] = useState(new Date().getFullYear());
  const cid = companyId ? Number(companyId) : 0;
  const { data, isLoading } = trpc.dashboards.auditorias.useQuery(
    { companyId: cid, year },
    { enabled: cid > 0 }
  );

  if (!companyId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-6 w-6 text-teal-500" />
          <h1 className="text-2xl font-bold">Dashboard Auditorias</h1>
        </div>
        <DashboardFilters selectedCompany={companyId} setSelectedCompany={() => {}} selectedYear={year} setSelectedYear={setYear} />
        <EmptyDashboard />
      </div>
    );
  }

  const totalAuditorias = data?.statusDist.reduce((s, v) => s + v.value, 0) ?? 0;
  const realizadas = data?.statusDist.find(s => s.label === "Conforme")?.value ?? 0;
  const emAberto = data?.statusDist.find(s => s.label === "Pendente")?.value ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-6 w-6 text-teal-500" />
        <h1 className="text-2xl font-bold">Dashboard Auditorias</h1>
      </div>
      <DashboardFilters selectedCompany={companyId} setSelectedCompany={() => {}} selectedYear={year} setSelectedYear={setYear} />

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <EmptyDashboard message="Nenhum dado encontrado." />
      ) : (
        <>
          {/* Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard title="Realizadas" value={realizadas} color="text-green-600" />
            <StatCard title="Em Aberto" value={emAberto} color="text-amber-500" />
            <StatCard title="Total NC" value={data.totalNC} color="text-red-500" />
            <StatCard title="NC Resolvidas" value={data.ncResolvidas} color="text-green-600" />
          </div>

          {/* NC Progress */}
          {data.totalNC > 0 ? (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Resolução de Não Conformidades</h3>
              <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                <div
                  className="h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{
                    width: `${Math.round((data.ncResolvidas / data.totalNC) * 100)}%`,
                    backgroundColor: CHART_COLORS.green,
                  }}
                >
                  {data.ncResolvidas} / {data.totalNC} ({Math.round((data.ncResolvidas / data.totalNC) * 100)}%)
                </div>
              </div>
            </div>
          ) : null}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Auditorias */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Status das Auditorias</h3>
              <div style={{ height: 280 }}>
                <Doughnut
                  data={{
                    labels: data.statusDist.map(s => s.label),
                    datasets: [{
                      data: data.statusDist.map(s => s.value),
                      backgroundColor: [CHART_COLORS.green, CHART_COLORS.red, CHART_COLORS.amber, CHART_COLORS.slate],
                    }],
                  }}
                  options={defaultDoughnutOptions}
                />
              </div>
            </div>

            {/* Por Tipo */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Auditorias por Tipo</h3>
              <div style={{ height: 280 }}>
                <Bar
                  data={{
                    labels: data.porTipo.map(t => t.label),
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

          {/* Desvios Status */}
          {data.desviosStatus.length > 0 ? (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Status dos Desvios</h3>
              <div style={{ height: 280 }}>
                <Doughnut
                  data={{
                    labels: data.desviosStatus.map(s => s.label),
                    datasets: [{
                      data: data.desviosStatus.map(s => s.value),
                      backgroundColor: CHART_PALETTE.slice(0, data.desviosStatus.length),
                    }],
                  }}
                  options={defaultDoughnutOptions}
                />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
