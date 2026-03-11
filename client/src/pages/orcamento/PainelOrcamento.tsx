import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calculator, Upload, FolderOpen, TrendingDown, DollarSign,
  Target, ArrowRight, Clock, FileSpreadsheet,
} from "lucide-react";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  rascunho:             { label: "Rascunho",      color: "bg-zinc-400" },
  aguardando_aprovacao: { label: "Ag. Aprovação", color: "bg-amber-500" },
  aprovado:             { label: "Aprovado",       color: "bg-green-500" },
  fechado:              { label: "Fechado",        color: "bg-blue-600" },
};

export default function PainelOrcamento() {
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;

  const { data, isLoading } = trpc.orcamento.painel.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const kpis = [
    {
      title: "Orçamentos",
      value: isLoading ? "..." : String(data?.total ?? 0),
      sub: "cadastrados",
      icon: FolderOpen,
      bg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      title: "Total Venda",
      value: isLoading ? "..." : formatBRL(data?.totalVenda ?? 0),
      sub: "com BDI",
      icon: DollarSign,
      bg: "bg-green-50",
      iconColor: "text-green-600",
    },
    {
      title: "Total Custo",
      value: isLoading ? "..." : formatBRL(data?.totalCusto ?? 0),
      sub: "custo direto",
      icon: TrendingDown,
      bg: "bg-amber-50",
      iconColor: "text-amber-600",
    },
    {
      title: "Total Meta",
      value: isLoading ? "..." : formatBRL(data?.totalMeta ?? 0),
      sub: "compras alvo",
      icon: Target,
      bg: "bg-purple-50",
      iconColor: "text-purple-600",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Calculator className="h-6 w-6 text-blue-600" />
              Orçamento de Obras
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Importe planilhas Excel e gerencie versões de custo, venda e meta
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/orcamento/lista">
              <Button variant="outline" size="sm" className="gap-2">
                <FolderOpen className="h-4 w-4" /> Ver Orçamentos
              </Button>
            </Link>
            <Link href="/orcamento/importar">
              <Button size="sm" className="gap-2">
                <Upload className="h-4 w-4" /> Importar Planilha
              </Button>
            </Link>
          </div>
        </div>

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/orcamento/importar">
            <Card className="cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-blue-50">
                    <FileSpreadsheet className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">Importar Planilha</p>
                    <p className="text-xs text-muted-foreground">Orçamento e BDI em abas separadas</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/orcamento/lista">
            <Card className="cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-purple-50">
                    <FolderOpen className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">Ver Orçamentos</p>
                    <p className="text-xs text-muted-foreground">Gerencie todos os orçamentos importados</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-green-50">
                  <Target className="h-6 w-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">Meta de Compras</p>
                  <p className="text-xs text-muted-foreground">Preço alvo para negociação com fornecedores</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
            ) : !data?.recentes?.length ? (
              <div className="py-8 text-center">
                <Calculator className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum orçamento importado ainda.</p>
                <Link href="/orcamento/importar">
                  <Button size="sm" className="mt-3">
                    <Upload className="h-3 w-3 mr-1" /> Importar primeiro orçamento
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {data.recentes.map((orc: any) => {
                  const st = STATUS_LABELS[orc.status] ?? { label: orc.status, color: "bg-zinc-400" };
                  return (
                    <Link key={orc.id} href={`/orcamento/${orc.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                        <div className="flex items-center gap-3">
                          <Calculator className="h-4 w-4 text-blue-500" />
                          <div>
                            <p className="text-sm font-medium">{orc.codigo}</p>
                            <p className="text-xs text-muted-foreground">{orc.cliente || "—"} · {orc.revisao || "—"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-green-600">{formatBRL(parseFloat(orc.totalVenda || "0"))}</p>
                            <p className="text-xs text-muted-foreground">venda</p>
                          </div>
                          <span className={`text-xs text-white px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {(data?.total ?? 0) > 5 && (
                  <Link href="/orcamento/lista">
                    <Button variant="ghost" size="sm" className="w-full mt-1 text-muted-foreground hover:text-foreground">
                      Ver todos ({data?.total}) <ArrowRight className="h-3 w-3 ml-1" />
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
