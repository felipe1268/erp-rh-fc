import { useState } from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import "@/components/ChartSetup";
import { CHART_COLORS, CHART_PALETTE, defaultBarOptions, defaultDoughnutOptions, defaultHBarOptions } from "@/components/ChartSetup";
import { DashboardFilters, StatCard, EmptyDashboard } from "@/components/DashboardFilters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Loader2, TriangleAlert } from "lucide-react";

export default function DashRiscos() {
  const [companyId, setCompanyId] = useState("");
  const [setor, setSetor] = useState("Todos");
  const cid = companyId ? Number(companyId) : 0;
  const { data, isLoading } = trpc.dashboards.riscos.useQuery(
    { companyId: cid, setor: setor === "Todos" ? undefined : setor },
    { enabled: cid > 0 }
  );

  const grauColors: Record<string, string> = {
    Baixo: CHART_COLORS.green,
    Medio: CHART_COLORS.amber,
    Alto: CHART_COLORS.orange,
    Critico: CHART_COLORS.red,
  };

  if (!companyId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <TriangleAlert className="h-6 w-6 text-yellow-500" />
          <h1 className="text-2xl font-bold">Dashboard Riscos</h1>
        </div>
        <DashboardFilters selectedCompany={companyId} setSelectedCompany={setCompanyId} showYear={false} />
        <EmptyDashboard />
      </div>
    );
  }

  const totalRiscos = data?.porTipo.reduce((s, v) => s + v.value, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <TriangleAlert className="h-6 w-6 text-yellow-500" />
        <h1 className="text-2xl font-bold">Dashboard Riscos</h1>
      </div>
      <DashboardFilters selectedCompany={companyId} setSelectedCompany={setCompanyId} showYear={false}>
        <Select value={setor} onValueChange={setSetor}>
          <SelectTrigger className="w-48 bg-card border-border">
            <SelectValue placeholder="Setor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todos os Setores</SelectItem>
            {data?.setores?.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DashboardFilters>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <EmptyDashboard message="Nenhum dado encontrado." />
      ) : (
        <>
          {/* Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard title="Total de Riscos" value={totalRiscos} color="text-foreground" />
            {data.porTipo.map(t => (
              <StatCard key={t.label} title={t.label} value={t.value} />
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Por Tipo */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Riscos Ambientais por Tipo</h3>
              <div style={{ height: 280 }}>
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

            {/* Por Grau */}
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Classificação dos Riscos</h3>
              <div style={{ height: 280 }}>
                <Bar
                  data={{
                    labels: data.porGrau.map(g => g.label),
                    datasets: [{
                      data: data.porGrau.map(g => g.value),
                      backgroundColor: data.porGrau.map(g => grauColors[g.label] || CHART_COLORS.slate),
                      borderRadius: 4,
                    }],
                  }}
                  options={defaultBarOptions}
                />
              </div>
            </div>
          </div>

          {/* Por Setor */}
          {data.porSetor.length > 0 && (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Riscos por Setor</h3>
              <div style={{ height: Math.max(200, data.porSetor.length * 35) }}>
                <Bar
                  data={{
                    labels: data.porSetor.map(s => s.label),
                    datasets: [{
                      data: data.porSetor.map(s => s.value),
                      backgroundColor: CHART_COLORS.blue,
                      borderRadius: 4,
                    }],
                  }}
                  options={defaultHBarOptions}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
