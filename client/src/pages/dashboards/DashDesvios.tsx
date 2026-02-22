import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { AlertOctagon, AlertTriangle, Clock, ShieldCheck, ChevronLeft, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function DashDesvios() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.dashboards.desvios.useQuery({ companyId }, { enabled: !!companyId });

  if (isLoading) return <DashboardLayout><div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded" /><div className="h-64 bg-muted rounded" /></div></DashboardLayout>;

  const r = data?.resumo;
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboards")}><ChevronLeft className="h-4 w-4 mr-1" /> Dashboards</Button>
          <div>
            <h1 className="text-2xl font-bold">Dashboard de Desvios</h1>
            <p className="text-muted-foreground text-sm">Status, tipos, setores e taxa de resolução</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <DashKpi label="Total de Desvios" value={r?.total ?? 0} color="blue" icon={AlertOctagon} />
          <DashKpi label="Abertos" value={r?.abertos ?? 0} color="red" icon={AlertTriangle} />
          <DashKpi label="Em Andamento" value={r?.emAndamento ?? 0} color="orange" icon={Clock} />
          <DashKpi label="Fechados" value={r?.fechados ?? 0} color="green" icon={ShieldCheck} />
          <DashKpi label="Taxa de Resolução" value={`${r?.taxaResolucao ?? 0}%`} color="teal" icon={Percent} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data?.statusDist?.length ?? 0) > 0 && (
            <DashChart title="Desvios por Status" type="doughnut" labels={data!.statusDist!.map((s: any) => s.label)} datasets={[{ data: data!.statusDist!.map((s: any) => s.value), backgroundColor: ["#EF4444", "#F59E0B", "#10B981", "#6B7280"] }]} height={250} />
          )}
          {(data?.tipoDist?.length ?? 0) > 0 && (
            <DashChart title="Desvios por Tipo" type="bar" labels={data!.tipoDist!.map((t: any) => t.label)} datasets={[{ label: "Desvios", data: data!.tipoDist!.map((t: any) => t.value) }]} height={250} />
          )}
        </div>

        {(data?.setorDist?.length ?? 0) > 0 && (
          <DashChart title="Desvios por Setor" type="horizontalBar" labels={data!.setorDist!.map((s: any) => s.label)} datasets={[{ label: "Desvios", data: data!.setorDist!.map((s: any) => s.value) }]} height={Math.max(200, (data!.setorDist!.length ?? 0) * 30)} />
        )}
      </div>
    </DashboardLayout>
  );
}
