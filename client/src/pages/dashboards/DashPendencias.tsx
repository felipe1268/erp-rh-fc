import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { AlertTriangle, ShieldCheck, Clock, Flame, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function DashPendencias() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.dashboards.pendencias.useQuery({ companyId }, { enabled: !!companyId });

  if (isLoading) return <DashboardLayout><div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded" /><div className="h-64 bg-muted rounded" /></div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboards")}><ChevronLeft className="h-4 w-4 mr-1" /> Dashboards</Button>
          <div>
            <h1 className="text-2xl font-bold">Dashboard de Pendências</h1>
            <p className="text-muted-foreground text-sm">Visão consolidada de itens que requerem atenção</p>
          </div>
        </div>

        {/* ASOs */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">ASOs (Atestados de Saúde Ocupacional)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DashKpi label="Vencidos" value={data?.asos?.vencidos ?? 0} color="red" icon={AlertTriangle} />
            <DashKpi label="A Vencer (30d)" value={data?.asos?.aVencer30 ?? 0} color="orange" icon={Clock} />
            <DashKpi label="Em Dia" value={data?.asos?.ok ?? 0} color="green" icon={ShieldCheck} />
            <DashKpi label="Total" value={data?.asos?.total ?? 0} color="blue" />
          </div>
        </div>

        {/* Treinamentos */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Treinamentos</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DashKpi label="Vencidos" value={data?.treinamentos?.vencidos ?? 0} color="red" icon={AlertTriangle} />
            <DashKpi label="A Vencer (30d)" value={data?.treinamentos?.aVencer30 ?? 0} color="orange" icon={Clock} />
            <DashKpi label="Em Dia" value={data?.treinamentos?.ok ?? 0} color="green" icon={ShieldCheck} />
            <DashKpi label="Total" value={data?.treinamentos?.total ?? 0} color="blue" />
          </div>
        </div>

        {/* Extintores e Hidrantes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Extintores</h2>
            <div className="grid grid-cols-3 gap-3">
              <DashKpi label="Vencidos" value={data?.extintores?.vencidos ?? 0} color="red" icon={Flame} />
              <DashKpi label="Em Dia" value={data?.extintores?.ok ?? 0} color="green" icon={ShieldCheck} />
              <DashKpi label="Total" value={data?.extintores?.total ?? 0} color="blue" />
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Hidrantes</h2>
            <div className="grid grid-cols-3 gap-3">
              <DashKpi label="Manutenção" value={data?.hidrantes?.manutencao ?? 0} color="orange" icon={Droplets} />
              <DashKpi label="Em Dia" value={data?.hidrantes?.ok ?? 0} color="green" icon={ShieldCheck} />
              <DashKpi label="Total" value={data?.hidrantes?.total ?? 0} color="blue" />
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DashChart
            title="Situação dos ASOs"
            type="doughnut"
            labels={["Vencidos", "A Vencer (30d)", "Em Dia"]}
            datasets={[{ data: [data?.asos?.vencidos ?? 0, data?.asos?.aVencer30 ?? 0, data?.asos?.ok ?? 0], backgroundColor: ["#EF4444", "#F59E0B", "#10B981"] }]}
            height={250}
          />
          <DashChart
            title="Situação dos Treinamentos"
            type="doughnut"
            labels={["Vencidos", "A Vencer (30d)", "Em Dia"]}
            datasets={[{ data: [data?.treinamentos?.vencidos ?? 0, data?.treinamentos?.aVencer30 ?? 0, data?.treinamentos?.ok ?? 0], backgroundColor: ["#EF4444", "#F59E0B", "#10B981"] }]}
            height={250}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
