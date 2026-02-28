import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LayoutDashboard, ClipboardCheck, Users, Star, Settings, FileText,
  TrendingUp, Shield, UserCheck, Layers
} from "lucide-react";

// Sub-modules
import AvalDashboard from "./avaliacao/AvalDashboard";
import EvaluatorPanel from "./avaliacao/EvaluatorPanel";
import AvalAvaliacoes from "./avaliacao/AvalAvaliacoes";
import AvalAvaliadores from "./avaliacao/AvalAvaliadores";
import RaioXFuncionario from "./avaliacao/RaioXFuncionario";
import AvalCriterios from "./avaliacao/AvalCriterios";
import AvalPesquisas from "./avaliacao/AvalPesquisas";
import AvalClima from "./avaliacao/AvalClima";
import AvalAuditoria from "./avaliacao/AvalAuditoria";

const TABS_ADMIN = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "avaliar", label: "Avaliar", icon: ClipboardCheck },
  { id: "avaliacoes", label: "Avaliações", icon: Star },
  { id: "raio-x", label: "Raio-X", icon: UserCheck },
  { id: "avaliadores", label: "Avaliadores", icon: Users },
  { id: "criterios", label: "Critérios", icon: Layers },
  { id: "pesquisas", label: "Pesquisas", icon: FileText },
  { id: "clima", label: "Clima", icon: TrendingUp },
  { id: "auditoria", label: "Auditoria", icon: Shield },
];

const TABS_EVALUATOR = [
  { id: "avaliar", label: "Avaliar", icon: ClipboardCheck },
];

export default function AvaliacaoDesempenho() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "admin_master";
  const tabs = isAdmin ? TABS_ADMIN : TABS_EVALUATOR;
  const defaultTab = isAdmin ? "dashboard" : "avaliar";

  // Read tab from URL params
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab && tabs.some(t => t.id === tab)) {
      setActiveTab(tab);
    }
  }, []);

  // Callback to navigate to Raio-X from Dashboard
  function handleNavigateEmployee(employeeId: number) {
    setActiveTab("raio-x");
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Avaliação de Desempenho</h1>
            <p className="text-sm text-[#64748B]">
              {isAdmin ? "Gerencie avaliações, critérios, pesquisas e acompanhe o desempenho dos colaboradores." : "Avalie os colaboradores da sua equipe."}
            </p>
          </div>
        </div>

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-transparent data-[state=active]:border-[#1e3a5f] data-[state=active]:bg-[#1e3a5f]/5 data-[state=active]:text-[#1e3a5f] text-[#64748B] hover:bg-[#F8FAFC]"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Tab Content */}
          <div className="mt-4">
            <TabsContent value="dashboard" className="mt-0">
              <AvalDashboard onNavigateEmployee={handleNavigateEmployee} />
            </TabsContent>

            <TabsContent value="avaliar" className="mt-0">
              <EvaluatorPanel />
            </TabsContent>

            <TabsContent value="avaliacoes" className="mt-0">
              <AvalAvaliacoes />
            </TabsContent>

            <TabsContent value="raio-x" className="mt-0">
              <RaioXFuncionario />
            </TabsContent>

            <TabsContent value="avaliadores" className="mt-0">
              <AvalAvaliadores />
            </TabsContent>

            <TabsContent value="criterios" className="mt-0">
              <AvalCriterios />
            </TabsContent>

            <TabsContent value="pesquisas" className="mt-0">
              <AvalPesquisas />
            </TabsContent>

            <TabsContent value="clima" className="mt-0">
              <AvalClima />
            </TabsContent>

            <TabsContent value="auditoria" className="mt-0">
              <AvalAuditoria />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
