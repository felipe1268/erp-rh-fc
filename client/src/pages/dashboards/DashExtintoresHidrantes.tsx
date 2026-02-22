import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Flame, Droplets, AlertTriangle, ShieldCheck, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function DashExtintoresHidrantes() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.dashboards.extintoresHidrantes.useQuery({ companyId }, { enabled: !!companyId });

  if (isLoading) return <DashboardLayout><div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded" /><div className="h-64 bg-muted rounded" /></div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboards")}><ChevronLeft className="h-4 w-4 mr-1" /> Dashboards</Button>
          <div>
            <h1 className="text-2xl font-bold">Extintores e Hidrantes</h1>
            <p className="text-muted-foreground text-sm">Status, validade e tipos dos equipamentos de combate a incêndio</p>
          </div>
        </div>

        {/* Extintores */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Flame className="h-4 w-4" /> Extintores</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <DashKpi label="Total" value={data?.extintores?.total ?? 0} color="blue" icon={Flame} />
            <DashKpi label="Vencidos" value={data?.extintores?.vencidos ?? 0} color="red" icon={AlertTriangle} />
            <DashKpi label="Em Dia" value={(data?.extintores?.total ?? 0) - (data?.extintores?.vencidos ?? 0)} color="green" icon={ShieldCheck} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data?.extintores?.tipoDist?.length ?? 0) > 0 && (
            <DashChart title="Extintores por Tipo" type="doughnut" labels={data!.extintores!.tipoDist!.map((t: any) => t.label)} datasets={[{ data: data!.extintores!.tipoDist!.map((t: any) => t.value) }]} height={250} />
          )}
          {(data?.extintores?.statusDist?.length ?? 0) > 0 && (
            <DashChart title="Extintores por Status" type="doughnut" labels={data!.extintores!.statusDist!.map((s: any) => s.label)} datasets={[{ data: data!.extintores!.statusDist!.map((s: any) => s.value), backgroundColor: ["#10B981", "#EF4444", "#F59E0B"] }]} height={250} />
          )}
        </div>

        {/* Hidrantes */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Droplets className="h-4 w-4" /> Hidrantes</h2>
          <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
            <DashKpi label="Total" value={data?.hidrantes?.total ?? 0} color="blue" icon={Droplets} />
            <DashKpi label="Em Manutenção/Inativo" value={(data?.hidrantes?.statusDist ?? []).filter((s: any) => s.label !== "OK").reduce((acc: number, s: any) => acc + s.value, 0)} color="orange" icon={AlertTriangle} />
          </div>
        </div>

        {(data?.hidrantes?.statusDist?.length ?? 0) > 0 && (
          <DashChart title="Hidrantes por Status" type="doughnut" labels={data!.hidrantes!.statusDist!.map((s: any) => s.label)} datasets={[{ data: data!.hidrantes!.statusDist!.map((s: any) => s.value), backgroundColor: ["#10B981", "#F59E0B", "#6B7280"] }]} height={250} />
        )}
      </div>
    </DashboardLayout>
  );
}
