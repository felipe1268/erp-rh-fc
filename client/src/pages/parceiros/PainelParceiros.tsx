import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Handshake, Store, Receipt, CreditCard, TrendingUp, CheckCircle, Clock, XCircle, DollarSign } from "lucide-react";
import { useLocation } from "wouter";

export default function PainelParceiros() {
  const { user } = useAuth();
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const [, setLocation] = useLocation();
  const { data: stats, isLoading } = trpc.parceiros.painel.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  if (isLoading || !stats) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
        </div>
      </DashboardLayout>
    );
  }

  const cards = [
    {
      title: "Parceiros Conveniados",
      value: stats.parceiros.total,
      subtitle: `${stats.parceiros.ativos} ativos`,
      icon: Store,
      color: "bg-purple-500",
      textColor: "text-purple-600",
      bgLight: "bg-purple-50",
      onClick: () => setLocation("/parceiros/cadastro"),
    },
    {
      title: "Lançamentos do Mês",
      value: stats.lancamentosMes.total,
      subtitle: `${stats.lancamentosMes.pendentes} pendentes`,
      icon: Receipt,
      color: "bg-blue-500",
      textColor: "text-blue-600",
      bgLight: "bg-blue-50",
      onClick: () => setLocation("/parceiros/lancamentos"),
    },
    {
      title: "Valor Total do Mês",
      value: `R$ ${stats.lancamentosMes.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      subtitle: `${stats.lancamentosMes.aprovados} aprovados`,
      icon: DollarSign,
      color: "bg-emerald-500",
      textColor: "text-emerald-600",
      bgLight: "bg-emerald-50",
      onClick: () => setLocation("/parceiros/guia-descontos"),
    },
    {
      title: "Pagamentos",
      value: stats.pagamentosMes.total,
      subtitle: `${stats.pagamentosMes.pagos} pagos`,
      icon: CreditCard,
      color: "bg-amber-500",
      textColor: "text-amber-600",
      bgLight: "bg-amber-50",
      onClick: () => setLocation("/parceiros/pagamentos"),
    },
  ];

  return (
    <DashboardLayout>
      <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-purple-500 flex items-center justify-center">
            <Handshake className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Portal de Parceiros</h1>
            <p className="text-sm text-muted-foreground">Gestão de convênios e benefícios</p>
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
                <span className={`text-2xl font-bold ${card.textColor}`}>{card.value}</span>
              </div>
              <h3 className="font-semibold text-sm text-foreground">{card.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{card.subtitle}</p>
            </button>
          ))}
        </div>

        {/* Tipo de Convênio */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border p-5">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Store className="h-4 w-4 text-purple-500" />
              Parceiros por Tipo
            </h3>
            <div className="space-y-3">
              {[
                { label: "Farmácia", count: stats.parceiros.porTipo.farmacia, emoji: "💊" },
                { label: "Posto de Combustível", count: stats.parceiros.porTipo.posto, emoji: "⛽" },
                { label: "Restaurante", count: stats.parceiros.porTipo.restaurante, emoji: "🍽️" },
                { label: "Mercado", count: stats.parceiros.porTipo.mercado, emoji: "🛒" },
                { label: "Outros", count: stats.parceiros.porTipo.outros, emoji: "📦" },
              ].filter(t => t.count > 0).map((tipo) => (
                <div key={tipo.label} className="flex items-center justify-between">
                  <span className="text-sm">{tipo.emoji} {tipo.label}</span>
                  <span className="font-bold text-purple-600">{tipo.count}</span>
                </div>
              ))}
              {stats.parceiros.total === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum parceiro cadastrado</p>
              )}
            </div>
          </div>

          <div className="bg-card rounded-xl border p-5">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-purple-500" />
              Lançamentos do Mês
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-sm">Pendentes de Aprovação</span>
                </div>
                <span className="font-bold text-amber-600">{stats.lancamentosMes.pendentes}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm">Aprovados</span>
                </div>
                <span className="font-bold text-emerald-600">{stats.lancamentosMes.aprovados}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm">Rejeitados</span>
                </div>
                <span className="font-bold text-red-600">{stats.lancamentosMes.rejeitados}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-semibold text-foreground mb-4">Ações Rápidas</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button onClick={() => setLocation("/parceiros/cadastro")} className="flex flex-col items-center gap-2 p-4 rounded-lg bg-purple-50 hover:bg-purple-100 transition-colors">
              <Store className="h-6 w-6 text-purple-600" />
              <span className="text-xs font-medium text-center">Novo Parceiro</span>
            </button>
            <button onClick={() => setLocation("/parceiros/lancamentos")} className="flex flex-col items-center gap-2 p-4 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors">
              <Receipt className="h-6 w-6 text-blue-600" />
              <span className="text-xs font-medium text-center">Lançamentos</span>
            </button>
            <button onClick={() => setLocation("/parceiros/guia-descontos")} className="flex flex-col items-center gap-2 p-4 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors">
              <DollarSign className="h-6 w-6 text-emerald-600" />
              <span className="text-xs font-medium text-center">Guia de Descontos</span>
            </button>
            <button onClick={() => setLocation("/parceiros/pagamentos")} className="flex flex-col items-center gap-2 p-4 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors">
              <CreditCard className="h-6 w-6 text-amber-600" />
              <span className="text-xs font-medium text-center">Pagamentos</span>
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
