import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calculator, Upload, FolderOpen, TrendingDown, DollarSign,
  Target, ArrowRight, Clock, CheckCircle, FileSpreadsheet,
} from "lucide-react";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  rascunho:             { label: "Rascunho",          color: "bg-zinc-500" },
  aguardando_aprovacao: { label: "Ag. Aprovação",     color: "bg-amber-500" },
  aprovado:             { label: "Aprovado",           color: "bg-green-500" },
  fechado:              { label: "Fechado",            color: "bg-blue-600" },
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
      color: "from-cyan-500 to-cyan-600",
    },
    {
      title: "Total Venda",
      value: isLoading ? "..." : formatBRL(data?.totalVenda ?? 0),
      sub: "com BDI",
      icon: DollarSign,
      color: "from-emerald-500 to-emerald-600",
    },
    {
      title: "Total Custo",
      value: isLoading ? "..." : formatBRL(data?.totalCusto ?? 0),
      sub: "custo direto",
      icon: TrendingDown,
      color: "from-amber-500 to-amber-600",
    },
    {
      title: "Total Meta",
      value: isLoading ? "..." : formatBRL(data?.totalMeta ?? 0),
      sub: "compras alvo",
      icon: Target,
      color: "from-purple-500 to-purple-600",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Calculator className="h-6 w-6 text-cyan-400" />
              Orçamento de Obras
            </h1>
            <p className="text-zinc-400 mt-1">
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
              <Button size="sm" className="gap-2 bg-cyan-600 hover:bg-cyan-700">
                <Upload className="h-4 w-4" /> Importar Planilha
              </Button>
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map(kpi => (
            <Card key={kpi.title} className="border-zinc-800 bg-zinc-900/60 backdrop-blur">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide">{kpi.title}</p>
                    <p className="text-xl font-bold text-white mt-1 break-all">{kpi.value}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{kpi.sub}</p>
                  </div>
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${kpi.color} shrink-0`}>
                    <kpi.icon className="h-4 w-4 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Acesso Rápido */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/orcamento/importar">
            <Card className="border-zinc-800 bg-zinc-900/60 cursor-pointer hover:border-cyan-500/50 transition-colors">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-cyan-500/20">
                    <FileSpreadsheet className="h-6 w-6 text-cyan-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">Importar Planilha</p>
                    <p className="text-xs text-zinc-400">Envie um Excel com as abas Orçamento e BDI</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-zinc-500" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/orcamento/lista">
            <Card className="border-zinc-800 bg-zinc-900/60 cursor-pointer hover:border-cyan-500/50 transition-colors">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-purple-500/20">
                    <FolderOpen className="h-6 w-6 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">Ver Orçamentos</p>
                    <p className="text-xs text-zinc-400">Gerencie todos os orçamentos importados</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-zinc-500" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-emerald-500/20">
                  <Target className="h-6 w-6 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-white">Meta de Compras</p>
                  <p className="text-xs text-zinc-400">Preço alvo para negociação com fornecedores</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Orçamentos Recentes */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-zinc-400" />
              Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-zinc-500 py-4 text-center">Carregando...</p>
            ) : !data?.recentes?.length ? (
              <div className="py-8 text-center">
                <Calculator className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">Nenhum orçamento importado ainda.</p>
                <Link href="/orcamento/importar">
                  <Button size="sm" className="mt-3 bg-cyan-600 hover:bg-cyan-700">
                    <Upload className="h-3 w-3 mr-1" /> Importar primeiro orçamento
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {data.recentes.map((orc: any) => {
                  const st = STATUS_LABELS[orc.status] ?? { label: orc.status, color: "bg-zinc-600" };
                  return (
                    <Link key={orc.id} href={`/orcamento/${orc.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 hover:border-zinc-600 cursor-pointer transition-colors">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="h-4 w-4 text-cyan-400" />
                          <div>
                            <p className="text-sm font-medium text-white">{orc.codigo}</p>
                            <p className="text-xs text-zinc-500">{orc.cliente || "—"} · {orc.revisao || "—"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-emerald-400">{formatBRL(parseFloat(orc.totalVenda || "0"))}</p>
                            <p className="text-xs text-zinc-500">venda</p>
                          </div>
                          <span className={`text-xs text-white px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {(data?.total ?? 0) > 5 && (
                  <Link href="/orcamento/lista">
                    <Button variant="ghost" size="sm" className="w-full mt-1 text-zinc-400 hover:text-white">
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
