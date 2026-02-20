import { useState } from "react";
import { Bar } from "react-chartjs-2";
import "@/components/ChartSetup";
import { CHART_COLORS, MONTHS_PT, defaultBarOptions, defaultHBarOptions } from "@/components/ChartSetup";
import { DashboardFilters, StatCard, EmptyDashboard } from "@/components/DashboardFilters";
import { trpc } from "@/lib/trpc";
import { Loader2, GraduationCap } from "lucide-react";

export default function DashTreinamentos() {
  const [companyId, setCompanyId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const cid = companyId ? Number(companyId) : 0;
  const { data, isLoading } = trpc.dashboards.treinamentos.useQuery(
    { companyId: cid, year },
    { enabled: cid > 0 }
  );

  if (!companyId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-6 w-6 text-purple-500" />
          <h1 className="text-2xl font-bold">Dashboard Treinamentos</h1>
        </div>
        <DashboardFilters selectedCompany={companyId} setSelectedCompany={setCompanyId} selectedYear={year} setSelectedYear={setYear} />
        <EmptyDashboard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <GraduationCap className="h-6 w-6 text-purple-500" />
        <h1 className="text-2xl font-bold">Dashboard Treinamentos</h1>
      </div>
      <DashboardFilters selectedCompany={companyId} setSelectedCompany={setCompanyId} selectedYear={year} setSelectedYear={setYear} />

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <EmptyDashboard message="Nenhum dado encontrado." />
      ) : (
        <>
          {/* Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="Total de Treinamentos" value={data.totalGeral} color="text-blue-600" />
            <StatCard title="Válidos" value={data.totalValidos} color="text-green-600" />
            <StatCard title="Vencidos" value={data.totalVencidos} color="text-red-500" alert={data.totalVencidos > 0} />
          </div>

          {/* Treinamentos por Mês */}
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="font-semibold mb-3">Treinamentos Realizados por Mês ({year})</h3>
            <div style={{ height: 300 }}>
              <Bar
                data={{
                  labels: MONTHS_PT,
                  datasets: [{
                    label: "Treinamentos",
                    data: data.porMes.map(m => m.count),
                    backgroundColor: CHART_COLORS.blue,
                    borderRadius: 4,
                  }],
                }}
                options={defaultBarOptions}
              />
            </div>
          </div>

          {/* Vencidos por Norma */}
          {data.vencidosPorNorma.length > 0 ? (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Treinamentos Vencidos por Norma</h3>
              <div style={{ height: Math.max(200, data.vencidosPorNorma.length * 30) }}>
                <Bar
                  data={{
                    labels: data.vencidosPorNorma.map(n => n.label),
                    datasets: [{
                      data: data.vencidosPorNorma.map(n => n.value),
                      backgroundColor: CHART_COLORS.red,
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
