import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { GraduationCap, ShieldCheck, AlertTriangle, Clock, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function DashTreinamentos() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.dashboards.treinamentos.useQuery({ companyId }, { enabled: !!companyId });

  if (isLoading) return <DashboardLayout><div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded" /><div className="h-64 bg-muted rounded" /></div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboards")}><ChevronLeft className="h-4 w-4 mr-1" /> Dashboards</Button>
          <div>
            <h1 className="text-2xl font-bold">Dashboard de Treinamentos</h1>
            <p className="text-muted-foreground text-sm">Treinamentos realizados, vencidos e evolução</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashKpi label="Total de Treinamentos" value={data?.total ?? 0} color="blue" icon={GraduationCap} />
          {data?.statusDist?.map((s: any) => (
            <DashKpi key={s.label} label={s.label} value={s.value} color={s.label === "Vencido" ? "red" : s.label.includes("Vencer") ? "orange" : "green"} icon={s.label === "Vencido" ? AlertTriangle : s.label.includes("Vencer") ? Clock : ShieldCheck} />
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DashChart title="Status dos Treinamentos" type="doughnut" labels={data?.statusDist?.map((s: any) => s.label) ?? []} datasets={[{ data: data?.statusDist?.map((s: any) => s.value) ?? [], backgroundColor: ["#10B981", "#EF4444", "#F59E0B"] }]} height={250} />
          <DashChart title="Top Normas" type="horizontalBar" labels={data?.normaDist?.map((n: any) => n.label) ?? []} datasets={[{ label: "Treinamentos", data: data?.normaDist?.map((n: any) => n.value) ?? [] }]} height={250} />
        </div>

        {(data?.evolucaoMensal?.length ?? 0) > 0 && (
          <DashChart title="Evolução Mensal de Treinamentos" type="line" labels={data!.evolucaoMensal!.map((m: any) => m.mes)} datasets={[{ label: "Treinamentos", data: data!.evolucaoMensal!.map((m: any) => m.count), fill: true, tension: 0.3 }]} height={250} />
        )}

        {(data?.vencidos?.length ?? 0) > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Treinamentos Vencidos</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50"><th className="p-2 text-left">Funcionário</th><th className="p-2 text-left">Treinamento</th><th className="p-2 text-left">Norma</th><th className="p-2 text-left">Validade</th></tr></thead>
                  <tbody>
                    {data!.vencidos!.map((v: any) => (
                      <tr key={v.id} className="border-b last:border-0"><td className="p-2 font-medium">{v.funcionario}</td><td className="p-2">{v.nome}</td><td className="p-2"><Badge variant="outline" className="text-xs">{v.norma || "—"}</Badge></td><td className="p-2 text-red-600 font-mono text-xs">{v.dataValidade ? new Date(v.dataValidade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
