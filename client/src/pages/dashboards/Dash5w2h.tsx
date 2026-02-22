import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { ListChecks, AlertTriangle, ShieldCheck, Clock, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function Dash5w2h() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.dashboards.planos5w2h.useQuery({ companyId }, { enabled: !!companyId });

  if (isLoading) return <DashboardLayout><div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded" /><div className="h-64 bg-muted rounded" /></div></DashboardLayout>;

  const r = data?.resumo;
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboards")}><ChevronLeft className="h-4 w-4 mr-1" /> Dashboards</Button>
          <div>
            <h1 className="text-2xl font-bold">Dashboard 5W2H</h1>
            <p className="text-muted-foreground text-sm">Planos de ação: status, prioridades e taxa de conclusão</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashKpi label="Total de Planos" value={r?.total ?? 0} color="blue" icon={ListChecks} />
          <DashKpi label="Atrasados" value={r?.atrasados ?? 0} color="red" icon={AlertTriangle} />
          <DashKpi label="Concluídos" value={r?.concluidos ?? 0} color="green" icon={ShieldCheck} />
          <DashKpi label="Taxa de Conclusão" value={`${r?.taxaConclusao ?? 0}%`} color="teal" icon={Clock} />
        </div>

        {(data?.statusDist?.length ?? 0) > 0 && (
          <DashChart title="Status dos Planos de Ação" type="doughnut" labels={data!.statusDist!.map((s: any) => s.label)} datasets={[{ data: data!.statusDist!.map((s: any) => s.value), backgroundColor: ["#F59E0B", "#3B82F6", "#10B981", "#6B7280"] }]} height={280} />
        )}
      </div>
    </DashboardLayout>
  );
}
