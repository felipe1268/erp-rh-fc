import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calculator, FolderOpen, TrendingDown, DollarSign,
  Target, ArrowRight, Clock, Plus, Building2,
  TrendingUp, BarChart3,
} from "lucide-react";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

const STATUS_LABELS: Record<string, { label: string; color: string; badge: string }> = {
  rascunho:             { label: "Rascunho",      color: "bg-zinc-400",   badge: "secondary" },
  aguardando_aprovacao: { label: "Ag. Aprovação", color: "bg-amber-500",  badge: "default" },
  aprovado:             { label: "Aprovado",       color: "bg-green-500",  badge: "default" },
  fechado:              { label: "Fechado",         color: "bg-blue-600",   badge: "default" },
};

export default function PainelOrcamento() {
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;

  const { data, isLoading } = trpc.orcamento.painel.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const total       = data?.total        ?? 0;
  const totalVenda  = data?.totalVenda   ?? 0;
  const totalCusto  = data?.totalCusto   ?? 0;
  const totalMeta   = data?.totalMeta    ?? 0;
  const margem      = totalVenda > 0 ? (totalVenda - totalCusto) / totalVenda : 0;

  const kpis = [
    {
      title: "Orçamentos",
      value: isLoading ? "..." : String(total),
      sub: "cadastrados",
      icon: FolderOpen,
      bg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      title: "Total Venda",
      value: isLoading ? "..." : formatBRL(totalVenda),
      sub: "com BDI aplicado",
      icon: DollarSign,
      bg: "bg-green-50",
      iconColor: "text-green-600",
    },
    {
      title: "Total Custo",
      value: isLoading ? "..." : formatBRL(totalCusto),
      sub: "custo direto",
      icon: TrendingDown,
      bg: "bg-amber-50",
      iconColor: "text-amber-600",
    },
    {
      title: "Total Meta",
      value: isLoading ? "..." : formatBRL(totalMeta),
      sub: "compras alvo",
      icon: Target,
      bg: "bg-purple-50",
      iconColor: "text-purple-600",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Calculator className="h-6 w-6 text-blue-600" />
              Orçamento de Obras
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Visão geral dos orçamentos da empresa
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/orcamento/lista">
              <Button variant="outline" size="sm" className="gap-2">
                <FolderOpen className="h-4 w-4" /> Ver Orçamentos
              </Button>
            </Link>
            <Link href="/orcamento/importar">
              <Button size="sm" className="gap-2 bg-[#1B2A4A] hover:bg-[#243660]">
                <Plus className="h-4 w-4" /> Novo Orçamento
              </Button>
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map(kpi => (
            <Card key={kpi.title}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{kpi.title}</p>
                    <p className="text-xl font-bold mt-1 break-all">{kpi.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${kpi.bg} shrink-0`}>
                    <kpi.icon className={`h-4 w-4 ${kpi.iconColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Cards informativos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Margem */}
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-emerald-50">
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">Margem Geral</p>
                  <p className="text-xs text-muted-foreground">Percentual sobre o total de venda</p>
                </div>
                <span className="text-lg font-bold text-emerald-600">
                  {isLoading ? "..." : formatPct(margem)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Diferença Venda × Custo */}
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-50">
                  <BarChart3 className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">Resultado Bruto</p>
                  <p className="text-xs text-muted-foreground">Venda menos custo direto</p>
                </div>
                <span className="text-sm font-bold text-blue-600">
                  {isLoading ? "..." : formatBRL(totalVenda - totalCusto)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Meta vs Custo */}
          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-purple-50">
                  <Target className="h-6 w-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">Economia Alvo</p>
                  <p className="text-xs text-muted-foreground">Custo menos meta de compras</p>
                </div>
                <span className="text-sm font-bold text-purple-600">
                  {isLoading ? "..." : formatBRL(totalCusto - totalMeta)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recentes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Orçamentos Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
            ) : !data?.recentes?.length ? (
              <div className="py-10 text-center">
                <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum orçamento cadastrado ainda.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Crie um novo orçamento para começar.
                </p>
                <Link href="/orcamento/importar">
                  <Button size="sm" variant="outline" className="mt-4 gap-2">
                    <Plus className="h-3.5 w-3.5" /> Criar primeiro orçamento
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {data.recentes.map((orc: any) => {
                  const st = STATUS_LABELS[orc.status] ?? { label: orc.status, color: "bg-zinc-400" };
                  const bdi = orc.bdiPercentual ? parseFloat(orc.bdiPercentual) : 0;
                  return (
                    <Link key={orc.id} href={`/orcamento/${orc.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Calculator className="h-4 w-4 text-blue-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{orc.codigo}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {orc.cliente || "—"}{orc.revisao ? ` · ${orc.revisao}` : ""}
                              {orc.local ? ` · ${orc.local}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          {bdi > 0 && (
                            <span className="text-xs text-amber-600 font-medium hidden sm:inline">
                              BDI {(bdi * 100).toFixed(1)}%
                            </span>
                          )}
                          <div className="text-right hidden sm:block">
                            <p className="text-sm font-semibold text-green-600">{formatBRL(parseFloat(orc.totalVenda || "0"))}</p>
                            <p className="text-xs text-muted-foreground">venda</p>
                          </div>
                          <span className={`text-xs text-white px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {(data?.total ?? 0) > 5 && (
                  <Link href="/orcamento/lista">
                    <Button variant="ghost" size="sm" className="w-full mt-1 text-muted-foreground hover:text-foreground">
                      Ver todos os {data?.total} orçamentos <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
}
