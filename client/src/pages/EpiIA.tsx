import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Sparkles, Brain, ArrowRight, AlertTriangle, Info, CheckCircle2,
  Package, Building2, TrendingUp, RefreshCw, Clock
} from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

export default function EpiIA() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();

  const ultimaQ = trpc.epiAvancado.ultimaAnaliseIA.useQuery({ companyId, companyIds }, { enabled: !!companyId || companyIds?.length > 0 });
  const analisesQ = trpc.epiAvancado.analisesIAList.useQuery({ companyId, companyIds }, { enabled: !!companyId || companyIds?.length > 0 });
  const analisarMut = trpc.epiAvancado.analisarEstoqueIA.useMutation({
    onSuccess: (data) => {
      if (data.erro) {
        toast.error(data.erro);
      } else {
        toast.success("Análise concluída!");
        ultimaQ.refetch();
        analisesQ.refetch();
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const ultima = ultimaQ.data;
  const analise = ultima?.sugestoes as any;
  const [showHistorico, setShowHistorico] = useState(false);

  const prioridadeCor: Record<string, string> = {
    alta: "bg-red-100 text-red-700 border-red-200",
    media: "bg-amber-100 text-amber-700 border-amber-200",
    baixa: "bg-blue-100 text-blue-700 border-blue-200",
  };

  const tipoCor: Record<string, string> = {
    critico: "text-red-600",
    atencao: "text-amber-600",
    info: "text-blue-600",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1B3A5C] flex items-center gap-2">
            <Brain className="h-5 w-5" /> IA — Análise de Estoque
          </h2>
          <p className="text-sm text-muted-foreground">Análise inteligente do estoque com sugestões de transferência entre obras</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHistorico(!showHistorico)}>
            <Clock className="h-4 w-4 mr-1" /> Histórico
          </Button>
          <Button onClick={() => analisarMut.mutate({ companyId })} disabled={analisarMut.isPending}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700">
            {analisarMut.isPending ? (
              <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Analisando...</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-1" /> Nova Análise</>
            )}
          </Button>
        </div>
      </div>

      {analisarMut.isPending && (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="py-6 text-center">
            <Brain className="h-10 w-10 text-purple-600 mx-auto mb-3 animate-pulse" />
            <p className="font-semibold text-purple-700">Analisando estoque de todas as obras...</p>
            <p className="text-sm text-purple-600 mt-1">A IA está verificando estoques, mínimos configurados e distribuição entre obras.</p>
          </CardContent>
        </Card>
      )}

      {!analise && !analisarMut.isPending && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="font-semibold">Nenhuma análise realizada ainda</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Nova Análise" para que a IA avalie o estoque de EPIs.</p>
          </CardContent>
        </Card>
      )}

      {analise && !analisarMut.isPending && (
        <>
          {/* Indicadores */}
          {analise.indicadores && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="border-red-200 bg-red-50/50">
                <CardContent className="py-3 text-center">
                  <AlertTriangle className="h-5 w-5 text-red-600 mx-auto mb-1" />
                  <p className="text-xl font-bold text-red-700">{analise.indicadores.obrasComFalta}</p>
                  <p className="text-[10px] text-red-600">Obras com falta</p>
                </CardContent>
              </Card>
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="py-3 text-center">
                  <Package className="h-5 w-5 text-amber-600 mx-auto mb-1" />
                  <p className="text-xl font-bold text-amber-700">{analise.indicadores.obrasComExcesso}</p>
                  <p className="text-[10px] text-amber-600">Obras com excesso</p>
                </CardContent>
              </Card>
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="py-3 text-center">
                  <TrendingUp className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                  <p className="text-xl font-bold text-blue-700">{analise.indicadores.itensAbaixoMinimo}</p>
                  <p className="text-[10px] text-blue-600">Abaixo do mínimo</p>
                </CardContent>
              </Card>
              <Card className="border-green-200 bg-green-50/50">
                <CardContent className="py-3 text-center">
                  <Sparkles className="h-5 w-5 text-green-600 mx-auto mb-1" />
                  <p className="text-xl font-bold text-green-700">{analise.indicadores.sugestoesGeradas}</p>
                  <p className="text-[10px] text-green-600">Sugestões</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Resumo */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-600" /> Resumo da Análise
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{analise.resumo}</p>
              {ultima?.createdAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Análise realizada em: {new Date(ultima.createdAt).toLocaleString("pt-BR")}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Alertas */}
          {analise.alertas && analise.alertas.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Alertas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {analise.alertas.map((alerta: any, idx: number) => (
                  <div key={idx} className={`flex items-start gap-2 text-sm ${tipoCor[alerta.tipo] || ""}`}>
                    {alerta.tipo === "critico" ? <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> :
                      alerta.tipo === "atencao" ? <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> :
                        <Info className="h-4 w-4 shrink-0 mt-0.5" />}
                    <span>{alerta.mensagem}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Sugestões */}
          {analise.sugestoes && analise.sugestoes.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" /> Sugestões de Ação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {analise.sugestoes.map((sug: any, idx: number) => (
                  <div key={idx} className={`border rounded-lg p-3 ${prioridadeCor[sug.prioridade] || "bg-gray-50"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] capitalize">{sug.acao}</Badge>
                        <span className="font-semibold text-sm">{sug.epi}</span>
                        <span className="text-xs">x{sug.quantidade}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        Prioridade: {sug.prioridade}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs mt-1">
                      <Building2 className="h-3 w-3" />
                      <span>{sug.origem}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span>{sug.destino}</span>
                    </div>
                    <p className="text-xs mt-1 opacity-80">{sug.justificativa}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Histórico */}
      {showHistorico && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Histórico de Análises</CardTitle>
          </CardHeader>
          <CardContent>
            {(analisesQ.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma análise anterior.</p>
            ) : (
              <div className="space-y-2">
                {(analisesQ.data ?? []).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between border-b pb-2 text-sm">
                    <div>
                      <p className="font-medium">{a.resultado?.substring(0, 80)}...</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString("pt-BR")}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{a.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
