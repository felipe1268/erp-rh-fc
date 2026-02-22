import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { HardHat, Package, AlertTriangle, Calendar, ClipboardList, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function DashEpi() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.dashboards.epi.useQuery({ companyId }, { enabled: !!companyId });

  if (isLoading) return <DashboardLayout><div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded" /><div className="h-64 bg-muted rounded" /></div></DashboardLayout>;

  const r = data?.resumo;
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboards")}><ChevronLeft className="h-4 w-4 mr-1" /> Dashboards</Button>
          <div>
            <h1 className="text-2xl font-bold">Dashboard de EPIs</h1>
            <p className="text-muted-foreground text-sm">Estoque, movimentação e top EPIs entregues</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <DashKpi label="Itens Cadastrados" value={r?.totalItens ?? 0} color="blue" icon={Package} />
          <DashKpi label="Estoque Total" value={r?.estoqueTotal ?? 0} color="green" icon={HardHat} />
          <DashKpi label="Estoque Baixo (≤5)" value={r?.estoqueBaixo ?? 0} color={r?.estoqueBaixo ? "red" : "yellow"} icon={AlertTriangle} />
          <DashKpi label="CA Vencido" value={r?.caVencido ?? 0} color={r?.caVencido ? "red" : "slate"} icon={Calendar} />
          <DashKpi label="Total Entregas" value={r?.totalEntregas ?? 0} color="indigo" icon={ClipboardList} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data?.evolucaoMensal?.length ?? 0) > 0 && (
            <DashChart title="Entregas por Mês" type="bar" labels={data!.evolucaoMensal!.map((m: any) => m.mes)} datasets={[{ label: "Unidades Entregues", data: data!.evolucaoMensal!.map((m: any) => m.qtd) }]} height={250} />
          )}
          {(data?.topEpis?.length ?? 0) > 0 && (
            <DashChart title="Top EPIs Entregues" type="horizontalBar" labels={data!.topEpis!.map((e: any) => e.nome)} datasets={[{ label: "Unidades", data: data!.topEpis!.map((e: any) => e.qtd) }]} height={250} />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
