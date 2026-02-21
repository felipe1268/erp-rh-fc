import { useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import "@/components/ChartSetup";
import { DashboardFilters, StatCard, EmptyDashboard } from "@/components/DashboardFilters";
import { trpc } from "@/lib/trpc";
import { Loader2, AlertTriangle } from "lucide-react";

export default function DashPendentes() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId;
  const cid = companyId ? Number(companyId) : 0;
  const { data, isLoading } = trpc.dashboards.pendentes.useQuery(
    { companyId: cid },
    { enabled: cid > 0 }
  );

  if (!companyId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <h1 className="text-2xl font-bold">Dashboard Pendências</h1>
        </div>
        <DashboardFilters selectedCompany={companyId} setSelectedCompany={() => {}} showYear={false} />
        <EmptyDashboard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        <h1 className="text-2xl font-bold">Dashboard Pendências</h1>
      </div>
      <DashboardFilters selectedCompany={companyId} setSelectedCompany={() => {}} showYear={false} />

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <EmptyDashboard message="Nenhum dado encontrado." />
      ) : (
        <>
          {/* ASOs */}
          <div>
            <h3 className="font-semibold text-lg mb-3 text-muted-foreground">ASOs Pendentes</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard title="ASOs Vencidos" value={data.asosVencidos} color="text-red-500" alert={data.asosVencidos > 0} />
              <StatCard title="ASOs a Vencer (30 dias)" value={data.asosAVencer} color="text-amber-500" alert={data.asosAVencer > 0} />
            </div>
          </div>

          {/* Treinamentos */}
          <div>
            <h3 className="font-semibold text-lg mb-3 text-muted-foreground">Treinamentos Pendentes</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard title="Treinamentos Vencidos" value={data.treinamentosVencidos} color="text-red-500" alert={data.treinamentosVencidos > 0} />
              <StatCard title="Treinamentos a Vencer (30 dias)" value={data.treinamentosAVencer} color="text-amber-500" alert={data.treinamentosAVencer > 0} />
            </div>
          </div>

          {/* Auditorias e Desvios */}
          <div>
            <h3 className="font-semibold text-lg mb-3 text-muted-foreground">Auditorias e Desvios</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard title="Auditorias em Aberto" value={data.auditoriasEmAberto} color="text-amber-500" alert={data.auditoriasEmAberto > 0} />
              <StatCard title="Desvios em Aberto" value={data.desviosEmAberto} color="text-amber-500" alert={data.desviosEmAberto > 0} />
              <StatCard title="Ações Atrasadas" value={data.acoesAtrasadas} color="text-red-500" alert={data.acoesAtrasadas > 0} />
            </div>
          </div>

          {/* Extintores e Hidrantes */}
          <div>
            <h3 className="font-semibold text-lg mb-3 text-muted-foreground">Extintores e Hidrantes</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard title="Extintores Vencidos" value={data.extintoresVencidos} color="text-red-500" alert={data.extintoresVencidos > 0} />
              <StatCard title="Hidrantes Vencidos" value={data.hidrantesVencidos} color="text-red-500" alert={data.hidrantesVencidos > 0} />
            </div>
          </div>

          {/* Resumo */}
          <div className="bg-card rounded-lg border border-border p-6">
            <h3 className="font-semibold text-lg mb-3">Resumo Geral</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {Object.entries(data).map(([key, val]) => {
                const labels: Record<string, string> = {
                  asosVencidos: "ASOs Vencidos",
                  asosAVencer: "ASOs a Vencer",
                  treinamentosVencidos: "Trein. Vencidos",
                  treinamentosAVencer: "Trein. a Vencer",
                  auditoriasEmAberto: "Auditorias Abertas",
                  desviosEmAberto: "Desvios Abertos",
                  acoesAtrasadas: "Ações Atrasadas",
                  extintoresVencidos: "Extint. Vencidos",
                  hidrantesVencidos: "Hidrant. Vencidos",
                };
                return (
                  <div key={key} className="flex justify-between items-center py-1 border-b border-border">
                    <span className="text-sm text-muted-foreground">{labels[key] || key}</span>
                    <span className={`font-bold text-lg ${Number(val) > 0 ? "text-red-500" : "text-green-600"}`}>{String(val)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
