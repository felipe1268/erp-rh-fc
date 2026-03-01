import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Building2, Users, ClipboardCheck, AlertTriangle, ShieldCheck, HardHat, TrendingUp, CheckCircle, XCircle, Clock } from "lucide-react";
import { useLocation } from "wouter";

export default function PainelTerceiros() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;
  const [, setLocation] = useLocation();
  const { data: stats, isLoading } = trpc.terceiros.painel.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  if (isLoading || !stats) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
        </div>
      </DashboardLayout>
    );
  }

  const cards = [
    {
      title: "Empresas Terceiras",
      value: stats.empresas.total,
      subtitle: `${stats.empresas.ativas} ativas`,
      icon: Building2,
      color: "bg-orange-500",
      textColor: "text-orange-600",
      bgLight: "bg-orange-50",
      onClick: () => setLocation("/terceiros/empresas"),
    },
    {
      title: "Funcionários Terceiros",
      value: stats.funcionarios.total,
      subtitle: `${stats.funcionarios.aptos} aptos`,
      icon: Users,
      color: "bg-blue-500",
      textColor: "text-blue-600",
      bgLight: "bg-blue-50",
      onClick: () => setLocation("/terceiros/funcionarios"),
    },
    {
      title: "Obrigações do Mês",
      value: stats.obrigacoesMes.total,
      subtitle: `${stats.obrigacoesMes.completas} completas`,
      icon: ClipboardCheck,
      color: "bg-emerald-500",
      textColor: "text-emerald-600",
      bgLight: "bg-emerald-50",
      onClick: () => setLocation("/terceiros/obrigacoes"),
    },
    {
      title: "Alertas Pendentes",
      value: stats.alertasPendentes,
      subtitle: "não resolvidos",
      icon: AlertTriangle,
      color: "bg-red-500",
      textColor: "text-red-600",
      bgLight: "bg-red-50",
      onClick: () => setLocation("/terceiros/alertas"),
    },
  ];

  return (
    <DashboardLayout>
      <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-orange-500 flex items-center justify-center">
            <HardHat className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Módulo Terceiros</h1>
            <p className="text-sm text-muted-foreground">Gestão de empresas terceirizadas e subcontratadas</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <button
              key={card.title}
              onClick={card.onClick}
              className={`${card.bgLight} rounded-xl p-5 text-left transition-all hover:shadow-md hover:scale-[1.02] border border-transparent hover:border-gray-200`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`h-10 w-10 rounded-lg ${card.color} flex items-center justify-center`}>
                  <card.icon className="h-5 w-5 text-white" />
                </div>
                <span className={`text-3xl font-bold ${card.textColor}`}>{card.value}</span>
              </div>
              <h3 className="font-semibold text-sm text-foreground">{card.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{card.subtitle}</p>
            </button>
          ))}
        </div>

        {/* Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Aptidão dos Funcionários */}
          <div className="bg-card rounded-xl border p-5">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-orange-500" />
              Aptidão dos Funcionários Terceiros
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm">Aptos</span>
                </div>
                <span className="font-bold text-emerald-600">{stats.funcionarios.aptos}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm">Inaptos</span>
                </div>
                <span className="font-bold text-red-600">{stats.funcionarios.inaptos}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-sm">Pendentes</span>
                </div>
                <span className="font-bold text-amber-600">{stats.funcionarios.pendentes}</span>
              </div>
              {stats.funcionarios.total > 0 && (
                <div className="mt-3 h-3 rounded-full bg-gray-100 overflow-hidden flex">
                  <div className="bg-emerald-500 h-full" style={{ width: `${(stats.funcionarios.aptos / stats.funcionarios.total) * 100}%` }} />
                  <div className="bg-red-500 h-full" style={{ width: `${(stats.funcionarios.inaptos / stats.funcionarios.total) * 100}%` }} />
                  <div className="bg-amber-400 h-full" style={{ width: `${(stats.funcionarios.pendentes / stats.funcionarios.total) * 100}%` }} />
                </div>
              )}
            </div>
          </div>

          {/* Obrigações do Mês */}
          <div className="bg-card rounded-xl border p-5">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-orange-500" />
              Obrigações Mensais
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm">Completas</span>
                </div>
                <span className="font-bold text-emerald-600">{stats.obrigacoesMes.completas}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Parciais</span>
                </div>
                <span className="font-bold text-blue-600">{stats.obrigacoesMes.parciais}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-sm">Pendentes</span>
                </div>
                <span className="font-bold text-amber-600">{stats.obrigacoesMes.pendentes}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-semibold text-foreground mb-4">Ações Rápidas</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => setLocation("/terceiros/empresas")}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors"
            >
              <Building2 className="h-6 w-6 text-orange-600" />
              <span className="text-xs font-medium text-center">Nova Empresa</span>
            </button>
            <button
              onClick={() => setLocation("/terceiros/funcionarios")}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <Users className="h-6 w-6 text-blue-600" />
              <span className="text-xs font-medium text-center">Novo Funcionário</span>
            </button>
            <button
              onClick={() => setLocation("/terceiros/obrigacoes")}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors"
            >
              <ClipboardCheck className="h-6 w-6 text-emerald-600" />
              <span className="text-xs font-medium text-center">Obrigações</span>
            </button>
            <button
              onClick={() => setLocation("/terceiros/conformidade")}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-purple-50 hover:bg-purple-100 transition-colors"
            >
              <ShieldCheck className="h-6 w-6 text-purple-600" />
              <span className="text-xs font-medium text-center">Conformidade</span>
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
