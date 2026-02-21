import { useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { Bar, Doughnut } from "react-chartjs-2";
import "@/components/ChartSetup";
import { CHART_COLORS, CHART_PALETTE, defaultBarOptions, defaultDoughnutOptions } from "@/components/ChartSetup";
import { DashboardFilters, StatCard, EmptyDashboard } from "@/components/DashboardFilters";
import { trpc } from "@/lib/trpc";
import { Loader2, Flame } from "lucide-react";

export default function DashExtintoresHidrantes() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId;
  const cid = companyId ? Number(companyId) : 0;
  const { data, isLoading } = trpc.dashboards.extintoresHidrantes.useQuery(
    { companyId: cid },
    { enabled: cid > 0 }
  );

  if (!companyId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Flame className="h-6 w-6 text-red-500" />
          <h1 className="text-2xl font-bold">Dashboard Extintores e Hidrantes</h1>
        </div>
        <DashboardFilters selectedCompany={companyId} setSelectedCompany={() => {}} showYear={false} />
        <EmptyDashboard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Flame className="h-6 w-6 text-red-500" />
        <h1 className="text-2xl font-bold">Dashboard Extintores e Hidrantes</h1>
      </div>
      <DashboardFilters selectedCompany={companyId} setSelectedCompany={() => {}} showYear={false} />

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <EmptyDashboard message="Nenhum dado encontrado." />
      ) : (
        <>
          {/* Extintores Cards */}
          <div>
            <h3 className="font-semibold text-lg mb-3 text-muted-foreground">Extintores</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard title="Total" value={data.extintores.total} color="text-foreground" />
              <StatCard title="OK" value={data.extintores.ok} color="text-green-600" />
              <StatCard title="Vencidos" value={data.extintores.vencidos} color="text-red-500" alert={data.extintores.vencidos > 0} />
              <StatCard title="Hidrost. Válidos" value={data.extintores.hidrostaticosValidos} color="text-blue-600" />
            </div>
          </div>

          {/* Hidrantes Cards */}
          <div>
            <h3 className="font-semibold text-lg mb-3 text-muted-foreground">Hidrantes</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <StatCard title="Total" value={data.hidrantes.total} color="text-foreground" />
              <StatCard title="OK" value={data.hidrantes.ok} color="text-green-600" />
              <StatCard title="Vencidos" value={data.hidrantes.vencidos} color="text-red-500" alert={data.hidrantes.vencidos > 0} />
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Extintores */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Status dos Extintores</h3>
              <div style={{ height: 280 }}>
                <Doughnut
                  data={{
                    labels: ["OK", "Vencidos", "Em Manutenção"],
                    datasets: [{
                      data: [
                        data.extintores.ok,
                        data.extintores.vencidos,
                        data.extintores.total - data.extintores.ok - data.extintores.vencidos,
                      ],
                      backgroundColor: [CHART_COLORS.green, CHART_COLORS.red, CHART_COLORS.amber],
                    }],
                  }}
                  options={defaultDoughnutOptions}
                />
              </div>
            </div>

            {/* Status Hidrantes */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Status dos Hidrantes</h3>
              <div style={{ height: 280 }}>
                <Doughnut
                  data={{
                    labels: ["OK", "Vencidos", "Em Manutenção"],
                    datasets: [{
                      data: [
                        data.hidrantes.ok,
                        data.hidrantes.vencidos,
                        data.hidrantes.total - data.hidrantes.ok - data.hidrantes.vencidos,
                      ],
                      backgroundColor: [CHART_COLORS.green, CHART_COLORS.red, CHART_COLORS.amber],
                    }],
                  }}
                  options={defaultDoughnutOptions}
                />
              </div>
            </div>
          </div>

          {/* Tipos de Extintores */}
          {data.extintores.porTipo.length > 0 ? (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Tipos e Cargas dos Extintores</h3>
              <div style={{ height: 280 }}>
                <Bar
                  data={{
                    labels: data.extintores.porTipo.map(t => t.label),
                    datasets: [{
                      data: data.extintores.porTipo.map(t => t.value),
                      backgroundColor: CHART_PALETTE.slice(0, data.extintores.porTipo.length),
                      borderRadius: 4,
                    }],
                  }}
                  options={defaultBarOptions}
                />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
