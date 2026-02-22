import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { ClipboardCheck, AlertTriangle, ShieldCheck, ChevronLeft, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function DashAuditorias() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.dashboards.auditorias.useQuery({ companyId }, { enabled: !!companyId });

  if (isLoading) return <DashboardLayout><div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded" /><div className="h-64 bg-muted rounded" /></div></DashboardLayout>;

  const r = data?.resumo;
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboards")}><ChevronLeft className="h-4 w-4 mr-1" /> Dashboards</Button>
          <div>
            <h1 className="text-2xl font-bold">Dashboard de Auditorias</h1>
            <p className="text-muted-foreground text-sm">Status, não conformidades e tipos de auditoria</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashKpi label="Total Auditorias" value={r?.totalAuditorias ?? 0} color="blue" icon={ClipboardCheck} />
          <DashKpi label="Não Conformidades" value={r?.ncTotal ?? 0} color="orange" icon={FileWarning} />
          <DashKpi label="NC Abertas" value={r?.ncAbertas ?? 0} color="red" icon={AlertTriangle} />
          <DashKpi label="NC Fechadas" value={r?.ncFechadas ?? 0} color="green" icon={ShieldCheck} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data?.resultadoDist?.length ?? 0) > 0 && (
            <DashChart title="Resultado das Auditorias" type="doughnut" labels={data!.resultadoDist!.map((r: any) => r.label)} datasets={[{ data: data!.resultadoDist!.map((r: any) => r.value), backgroundColor: ["#10B981", "#EF4444", "#F59E0B", "#6366F1"] }]} height={250} />
          )}
          {(data?.tipoDist?.length ?? 0) > 0 && (
            <DashChart title="Tipo de Auditoria" type="bar" labels={data!.tipoDist!.map((t: any) => t.label)} datasets={[{ label: "Auditorias", data: data!.tipoDist!.map((t: any) => t.value) }]} height={250} />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
