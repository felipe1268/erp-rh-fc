import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { ShieldAlert, Calendar, UserX, Clock, ChevronLeft, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function DashAcidentes() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.dashboards.acidentes.useQuery({ companyId }, { enabled: !!companyId });

  if (isLoading) return <DashboardLayout><div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded" /><div className="h-64 bg-muted rounded" /></div></DashboardLayout>;

  const r = data?.resumo;
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboards")}><ChevronLeft className="h-4 w-4 mr-1" /> Dashboards</Button>
          <div>
            <h1 className="text-2xl font-bold">Dashboard de Acidentes</h1>
            <p className="text-muted-foreground text-sm">Indicadores de segurança e acidentes de trabalho</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <DashKpi label="Total de Acidentes" value={r?.totalAcidentes ?? 0} color={r?.totalAcidentes ? "red" : "green"} icon={ShieldAlert} />
          <DashKpi label="Com Afastamento" value={r?.comAfastamento ?? 0} color="orange" icon={UserX} />
          <DashKpi label="Dias de Afastamento" value={r?.totalAfastamento ?? 0} color="yellow" icon={Calendar} />
          <DashKpi label="Dias Sem Acidente" value={r?.diasSemAcidente ?? "N/A"} color="green" icon={Trophy} sub={r?.ultimoAcidente ? `Último: ${new Date(r.ultimoAcidente + "T00:00:00").toLocaleDateString("pt-BR")}` : undefined} />
          <DashKpi label="Meta" value="365 dias" color="teal" icon={Clock} sub="Sem acidentes" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data?.tipoDist?.length ?? 0) > 0 && (
            <DashChart title="Por Tipo de Acidente" type="doughnut" labels={data!.tipoDist!.map((t: any) => t.label)} datasets={[{ data: data!.tipoDist!.map((t: any) => t.value), backgroundColor: ["#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6"] }]} height={250} />
          )}
          {(data?.gravidadeDist?.length ?? 0) > 0 && (
            <DashChart title="Por Gravidade" type="doughnut" labels={data!.gravidadeDist!.map((g: any) => g.label)} datasets={[{ data: data!.gravidadeDist!.map((g: any) => g.value), backgroundColor: ["#10B981", "#F59E0B", "#EF4444", "#7C3AED"] }]} height={250} />
          )}
        </div>

        {(data?.evolucaoMensal?.length ?? 0) > 0 && (
          <DashChart title="Evolução Mensal de Acidentes" type="bar" labels={data!.evolucaoMensal!.map((m: any) => m.mes)} datasets={[{ label: "Acidentes", data: data!.evolucaoMensal!.map((m: any) => m.count), backgroundColor: "#EF4444" }]} height={250} />
        )}
      </div>
    </DashboardLayout>
  );
}
