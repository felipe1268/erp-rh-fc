import DashboardLayout from "@/components/DashboardLayout";
import { DashKpi } from "@/components/DashChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCompany } from "@/contexts/CompanyContext";
import { TriangleAlert, ChevronLeft, Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function DashRiscos() {
  const { selectedCompanyId } = useCompany();
  const [, navigate] = useLocation();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboards")}><ChevronLeft className="h-4 w-4 mr-1" /> Dashboards</Button>
          <div>
            <h1 className="text-2xl font-bold">Dashboard de Riscos</h1>
            <p className="text-muted-foreground text-sm">Riscos ambientais por tipo, grau e setor</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-12 text-center">
            <Construction className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Em Desenvolvimento</h3>
            <p className="text-muted-foreground mt-2">O módulo de riscos ambientais será implementado em breve. Será possível visualizar riscos por tipo (físico, químico, biológico, ergonômico), grau de risco e setor.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
