import { useState } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import "@/components/ChartSetup";
import { CHART_COLORS, CHART_PALETTE, MONTHS_PT, defaultBarOptions, defaultDoughnutOptions } from "@/components/ChartSetup";
import { DashboardFilters, StatCard, EmptyDashboard } from "@/components/DashboardFilters";
import { trpc } from "@/lib/trpc";
import { Loader2, ShieldAlert } from "lucide-react";

export default function DashAcidentes() {
  const [companyId, setCompanyId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const cid = companyId ? Number(companyId) : 0;
  const { data, isLoading } = trpc.dashboards.acidentes.useQuery(
    { companyId: cid, year },
    { enabled: cid > 0 }
  );

  if (!companyId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-red-500" />
          <h1 className="text-2xl font-bold">Dashboard Acidentes</h1>
        </div>
        <DashboardFilters selectedCompany={companyId} setSelectedCompany={setCompanyId} selectedYear={year} setSelectedYear={setYear} />
        <EmptyDashboard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-red-500" />
        <h1 className="text-2xl font-bold">Dashboard Acidentes</h1>
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
            <StatCard title="Total de Acidentes" value={data.totalAno} color="text-red-500" subtitle={`Ano ${year}`} />
            <StatCard title="Sem Afastamento" value={data.semAfastamento} color="text-amber-500" />
            <StatCard title="Com Afastamento" value={data.comAfastamento} color="text-red-600" />
            <StatCard
              title="Dias sem Acidente"
              value={data.diasSemAcidente !== null ? data.diasSemAcidente : "N/A"}
              color="text-green-600"
              subtitle={`Meta: ${data.metaDias} dias`}
            />
          </div>

          {/* Progresso Meta */}
          {data.diasSemAcidente !== null && (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Meta de Dias sem Acidente</h3>
              <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                <div
                  className="h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{
                    width: `${Math.min(100, (data.diasSemAcidente / data.metaDias) * 100)}%`,
                    backgroundColor: data.diasSemAcidente >= data.metaDias ? CHART_COLORS.green : CHART_COLORS.blue,
                  }}
                >
                  {data.diasSemAcidente} / {data.metaDias} dias ({Math.round((data.diasSemAcidente / data.metaDias) * 100)}%)
                </div>
              </div>
            </div>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Acidentes por mês */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Acidentes por Mês ({year})</h3>
              <div style={{ height: 280 }}>
                <Bar
                  data={{
                    labels: MONTHS_PT,
                    datasets: [{
                      label: "Acidentes",
                      data: data.porMes.map(m => m.count),
                      backgroundColor: CHART_COLORS.red,
                      borderRadius: 4,
                    }],
                  }}
                  options={defaultBarOptions}
                />
              </div>
            </div>

            {/* Por gravidade */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Acidentes por Gravidade</h3>
              <div style={{ height: 280 }}>
                <Doughnut
                  data={{
                    labels: data.porGravidade.map(g => g.label),
                    datasets: [{
                      data: data.porGravidade.map(g => g.value),
                      backgroundColor: [CHART_COLORS.yellow, CHART_COLORS.orange, CHART_COLORS.red, "#7F1D1D"],
                    }],
                  }}
                  options={defaultDoughnutOptions}
                />
              </div>
            </div>
          </div>

          {/* Por tipo */}
          {data.porTipo.length > 0 && (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Acidentes por Tipo</h3>
              <div style={{ height: 250 }}>
                <Doughnut
                  data={{
                    labels: data.porTipo.map(t => t.label),
                    datasets: [{
                      data: data.porTipo.map(t => t.value),
                      backgroundColor: CHART_PALETTE.slice(0, data.porTipo.length),
                    }],
                  }}
                  options={defaultDoughnutOptions}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
