import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, CreditCard,
  ArrowUpRight, ArrowDownRight, RefreshCw, Calendar, BarChart2
} from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { Link } from "wouter";

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function getMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function FinanceiroDashboard() {
  const { companyId } = useCompany();
  const [mes, setMes] = useState(getMesAtual());

  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: summary, isLoading, refetch } = (trpc as any).financial.getDashboardSummary.useQuery(
    { companyId, mesCompetencia: mes },
    { enabled: !!companyId }
  );

  const { data: taxObrigacoes } = (trpc as any).financial.getTaxObligations.useQuery(
    { companyId, status: "a_pagar" },
    { enabled: !!companyId }
  );

  const { data: aReceber } = (trpc as any).financial.getContasAReceber.useQuery(
    { companyId, vencimentoAte: new Date().toISOString().split("T")[0] },
    { enabled: !!companyId }
  );

  const kpiCards = [
    {
      label: "Receita do Mês",
      value: summary?.receitaMes ?? 0,
      icon: TrendingUp,
      color: "text-green-600",
      bg: "bg-green-50",
      positive: true,
    },
    {
      label: "Despesa do Mês",
      value: summary?.despesaMes ?? 0,
      icon: TrendingDown,
      color: "text-red-500",
      bg: "bg-red-50",
      positive: false,
    },
    {
      label: "Resultado do Mês",
      value: summary?.resultadoMes ?? 0,
      icon: BarChart2,
      color: (summary?.resultadoMes ?? 0) >= 0 ? "text-blue-600" : "text-red-600",
      bg: "bg-blue-50",
      positive: (summary?.resultadoMes ?? 0) >= 0,
    },
    {
      label: "Total a Receber",
      value: summary?.totalAReceber ?? 0,
      icon: ArrowUpRight,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      positive: true,
    },
    {
      label: "Total a Pagar",
      value: summary?.totalAPagar ?? 0,
      icon: ArrowDownRight,
      color: "text-orange-600",
      bg: "bg-orange-50",
      positive: false,
    },
    {
      label: "Vencidos",
      value: summary?.totalVencidos ?? 0,
      icon: AlertTriangle,
      color: "text-red-700",
      bg: "bg-red-100",
      positive: false,
    },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Financeiro</h1>
            <p className="text-sm text-gray-500 mt-1">Visão consolidada da saúde financeira da empresa</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger className="w-40">
                <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meses.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />Atualizar
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <p className="text-xs text-gray-500 mb-1">{card.label}</p>
                  <p className={`text-lg font-bold ${card.color}`}>
                    {isLoading ? "..." : formatBRL(card.value)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Atalhos rápidos */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { href: "/financeiro/lancamentos", label: "Lançamentos", icon: DollarSign, desc: "Receitas e despesas" },
            { href: "/financeiro/dre", label: "DRE", icon: BarChart2, desc: "Demonstrativo de resultado" },
            { href: "/financeiro/obrigacoes-fiscais", label: "Obrigações Fiscais", icon: AlertTriangle, desc: "Guias e impostos" },
            { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", icon: TrendingUp, desc: "Projeção de caixa" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{item.label}</p>
                      <p className="text-xs text-gray-500">{item.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Obrigações vencendo */}
        {taxObrigacoes && taxObrigacoes.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                Obrigações Fiscais Pendentes
                <Badge variant="destructive" className="ml-2">{taxObrigacoes.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {taxObrigacoes.slice(0, 5).map((ob: any) => (
                  <div key={ob.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{ob.tipo.toUpperCase().replace(/_/g, " ")}</p>
                      <p className="text-xs text-gray-500">Venc.: {ob.dataVencimento} • Comp.: {ob.mesCompetencia}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-orange-700">{formatBRL(Number(ob.valorTotal))}</p>
                      <Badge variant="outline" className="text-xs border-orange-300 text-orange-700">
                        {new Date(ob.dataVencimento) < new Date() ? "VENCIDO" : "A PAGAR"}
                      </Badge>
                    </div>
                  </div>
                ))}
                {taxObrigacoes.length > 5 && (
                  <Link href="/financeiro/obrigacoes-fiscais">
                    <p className="text-xs text-blue-600 text-center pt-1 cursor-pointer hover:underline">
                      Ver todas ({taxObrigacoes.length}) obrigações →
                    </p>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contas vencidas a receber */}
        {aReceber && aReceber.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-red-500" />
                Contas Vencidas a Receber
                <Badge variant="destructive" className="ml-2">{aReceber.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {aReceber.slice(0, 5).map((conta: any) => (
                  <div key={conta.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{conta.descricao ?? conta.obraNome ?? "—"}</p>
                      <p className="text-xs text-gray-500">Venc.: {conta.dataVencimento} • Atraso: {conta.diasAtraso} dias</p>
                    </div>
                    <p className="text-sm font-bold text-red-700">{formatBRL(Number(conta.valorPrevisto))}</p>
                  </div>
                ))}
                {aReceber.length > 5 && (
                  <Link href="/financeiro/contas-a-receber">
                    <p className="text-xs text-blue-600 text-center pt-1 cursor-pointer hover:underline">
                      Ver todas ({aReceber.length}) →
                    </p>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
