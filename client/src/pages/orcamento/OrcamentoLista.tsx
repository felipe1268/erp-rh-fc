import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calculator, Upload, Eye, Trash2, FolderOpen, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho:             { label: "Rascunho",      variant: "secondary" },
  aguardando_aprovacao: { label: "Ag. Aprovação", variant: "default" },
  aprovado:             { label: "Aprovado",       variant: "default" },
  fechado:              { label: "Fechado",        variant: "secondary" },
};

export default function OrcamentoLista() {
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [busca, setBusca] = useState("");

  const { data: lista = [], isLoading, refetch } = trpc.orcamento.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const deleteMutation = trpc.orcamento.delete.useMutation({
    onSuccess: () => { toast({ title: "Orçamento excluído com sucesso." }); refetch(); },
    onError: (e) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });

  const filtrado = lista.filter((o: any) => {
    const q = busca.toLowerCase();
    return (
      o.codigo?.toLowerCase().includes(q) ||
      o.cliente?.toLowerCase().includes(q) ||
      o.descricao?.toLowerCase().includes(q) ||
      o.revisao?.toLowerCase().includes(q)
    );
  });

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <FolderOpen className="h-6 w-6 text-cyan-400" />
              Orçamentos
            </h1>
            <p className="text-zinc-400 mt-1">
              {filtrado.length} orçamento{filtrado.length !== 1 ? "s" : ""} encontrado{filtrado.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-2 text-zinc-400">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Link href="/orcamento/importar">
              <Button size="sm" className="gap-2 bg-cyan-600 hover:bg-cyan-700">
                <Upload className="h-4 w-4" /> Importar Planilha
              </Button>
            </Link>
          </div>
        </div>

        {/* Busca */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Buscar por código, cliente..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500"
          />
        </div>

        {/* Lista */}
        {isLoading ? (
          <p className="text-zinc-500 text-sm text-center py-12">Carregando...</p>
        ) : !filtrado.length ? (
          <div className="py-16 text-center">
            <Calculator className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500">
              {busca ? "Nenhum orçamento encontrado para essa busca." : "Nenhum orçamento importado ainda."}
            </p>
            {!busca && (
              <Link href="/orcamento/importar">
                <Button size="sm" className="mt-4 bg-cyan-600 hover:bg-cyan-700">
                  <Upload className="h-3 w-3 mr-1" /> Importar primeiro orçamento
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtrado.map((orc: any) => {
              const st = STATUS_LABELS[orc.status] ?? { label: orc.status, variant: "secondary" as const };
              const bdi = orc.bdiPercentual ? `BDI ${(parseFloat(orc.bdiPercentual) * 100).toFixed(2)}%` : "";
              const meta = orc.metaPercentual ? `Meta −${(parseFloat(orc.metaPercentual) * 100).toFixed(0)}%` : "";
              return (
                <Card key={orc.id} className="border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 transition-colors">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white text-sm truncate">{orc.codigo}</span>
                          {orc.revisao && <span className="text-xs text-cyan-400 font-mono">{orc.revisao}</span>}
                          <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1 truncate">{orc.descricao || "—"}</p>
                        <div className="flex gap-3 mt-2 text-xs text-zinc-500 flex-wrap">
                          {orc.cliente && <span>Cliente: {orc.cliente}</span>}
                          {orc.local && <span>Local: {orc.local}</span>}
                          {bdi && <span className="text-amber-400">{bdi}</span>}
                          {meta && <span className="text-purple-400">{meta}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-emerald-400">
                          {formatBRL(parseFloat(orc.totalVenda || "0"))}
                        </div>
                        <div className="text-xs text-zinc-500">venda</div>
                        <div className="text-xs text-amber-300 mt-0.5">
                          {formatBRL(parseFloat(orc.totalCusto || "0"))} custo
                        </div>
                        <div className="text-xs text-purple-300">
                          {formatBRL(parseFloat(orc.totalMeta || "0"))} meta
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                          onClick={() => navigate(`/orcamento/${orc.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-zinc-600 hover:text-red-400"
                              disabled={orc.status === "fechado"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-zinc-900 border-zinc-700">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-white">Excluir orçamento?</AlertDialogTitle>
                              <AlertDialogDescription className="text-zinc-400">
                                O orçamento "{orc.codigo}" será excluído permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-zinc-700">Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => deleteMutation.mutate({ id: orc.id })}
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
