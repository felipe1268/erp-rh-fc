import { useState } from "react";
import { Bar } from "react-chartjs-2";
import "@/components/ChartSetup";
import { CHART_COLORS, MONTHS_PT, defaultBarOptions, defaultHBarOptions } from "@/components/ChartSetup";
import { DashboardFilters, StatCard, EmptyDashboard } from "@/components/DashboardFilters";
import { trpc } from "@/lib/trpc";
import { Loader2, HardHat } from "lucide-react";

export default function DashEpi() {
  const [companyId, setCompanyId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const cid = companyId ? Number(companyId) : 0;
  const { data, isLoading } = trpc.dashboards.epi.useQuery(
    { companyId: cid, year },
    { enabled: cid > 0 }
  );

  if (!companyId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <HardHat className="h-6 w-6 text-orange-500" />
          <h1 className="text-2xl font-bold">Dashboard EPI</h1>
        </div>
        <DashboardFilters selectedCompany={companyId} setSelectedCompany={setCompanyId} selectedYear={year} setSelectedYear={setYear} />
        <EmptyDashboard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <HardHat className="h-6 w-6 text-orange-500" />
        <h1 className="text-2xl font-bold">Dashboard EPI</h1>
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
            <StatCard title="Estoque Total" value={data.estoqueTotal} color="text-blue-600" subtitle={`${data.itensEstoque} itens cadastrados`} />
            <StatCard title="CA Vencidos" value={data.caVencidos} color="text-red-500" alert={data.caVencidos > 0} />
            <StatCard
              title="Status Estoque"
              value={data.estoqueTotal > 0 ? "Ativo" : "Sem estoque"}
              color={data.estoqueTotal > 0 ? "text-green-600" : "text-amber-500"}
            />
          </div>

          {/* Movimentação por mês */}
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="font-semibold mb-3">Movimentação de EPI Mês a Mês ({year})</h3>
            <div style={{ height: 300 }}>
              <Bar
                data={{
                  labels: MONTHS_PT,
                  datasets: [{
                    label: "Entregas",
                    data: data.movPorMes.map(m => m.entregas),
                    backgroundColor: CHART_COLORS.blue,
                    borderRadius: 4,
                  }],
                }}
                options={defaultBarOptions}
              />
            </div>
          </div>

          {/* Quantidades por mês */}
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="font-semibold mb-3">Quantidade de EPIs Entregues por Mês ({year})</h3>
            <div style={{ height: 300 }}>
              <Bar
                data={{
                  labels: MONTHS_PT,
                  datasets: [{
                    label: "Quantidade",
                    data: data.movPorMes.map(m => m.quantidade),
                    backgroundColor: CHART_COLORS.gold,
                    borderRadius: 4,
                  }],
                }}
                options={defaultBarOptions}
              />
            </div>
          </div>

          {/* Top EPIs */}
          {data.topEpis.length > 0 ? (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Top EPIs Mais Entregues</h3>
              <div style={{ height: Math.max(200, data.topEpis.length * 30) }}>
                <Bar
                  data={{
                    labels: data.topEpis.map(e => e.label),
                    datasets: [{
                      data: data.topEpis.map(e => e.value),
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
