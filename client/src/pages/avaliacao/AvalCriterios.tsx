import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Plus, CheckCircle, Layers, Clock, Star, Shield } from "lucide-react";

const PILAR_CORES: Record<number, string> = { 1: "#1e3a5f", 2: "#059669", 3: "#D97706" };

export default function AvalCriterios() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const utils = trpc.useUtils();

  const activeRevision = trpc.avaliacao.criterios.getActiveRevision.useQuery({ companyId }, { enabled: companyId > 0 || companyIds.length > 0 });
  const revisions = trpc.avaliacao.criterios.listRevisions.useQuery({ companyId }, { enabled: companyId > 0 || companyIds.length > 0 });

  const createDefault = trpc.avaliacao.criterios.createDefaultRevision.useMutation({
    onSuccess: () => {
      toast.success("Revisão padrão criada com sucesso!");
      utils.avaliacao.criterios.getActiveRevision.invalidate();
      utils.avaliacao.criterios.listRevisions.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const activateRevision = trpc.avaliacao.criterios.activateRevision.useMutation({
    onSuccess: () => {
      toast.success("Revisão ativada!");
      utils.avaliacao.criterios.getActiveRevision.invalidate();
      utils.avaliacao.criterios.listRevisions.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const active = activeRevision.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#0F172A]">Critérios de Avaliação</h2>
        {!active && (
          <Button size="sm" onClick={() => createDefault.mutate({ companyId })} disabled={createDefault.isPending}>
            <Plus className="w-4 h-4 mr-1" /> {createDefault.isPending ? "Criando..." : "Criar Padrão FC"}
          </Button>
        )}
      </div>

      {activeRevision.isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]" /></div>
      ) : !active ? (
        <div className="text-center py-12">
          <Layers className="w-16 h-16 mx-auto mb-4 text-[#94A3B8] opacity-50" />
          <h3 className="text-lg font-medium text-[#475569] mb-2">Nenhum critério configurado</h3>
          <p className="text-sm text-[#94A3B8] mb-4">Clique em "Criar Padrão FC" para gerar os 12 critérios padrão organizados em 3 pilares.</p>
          <Button onClick={() => createDefault.mutate({ companyId })} disabled={createDefault.isPending}>
            <Plus className="w-4 h-4 mr-1" /> Criar Padrão FC Engenharia
          </Button>
        </div>
      ) : (
        <>
          {/* Active Revision Info */}
          <Card className="border-0 shadow-sm bg-gradient-to-r from-[#1e3a5f]/5 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#1e3a5f] flex items-center justify-center">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0F172A]">Revisão v{active.version} — Ativa</p>
                    <p className="text-xs text-[#64748B]">{active.descricao || "Sem descrição"}</p>
                    <p className="text-xs text-[#94A3B8]">Criada por {active.createdBy} em {new Date(active.createdAt).toLocaleDateString("pt-BR")}</p>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-700">Ativa</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Pillars and Criteria */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {active.pillars?.map((pilar: any, pIdx: number) => {
              const cor = PILAR_CORES[pIdx + 1] || "#64748B";
              return (
                <Card key={pilar.id} className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-8 rounded-full" style={{ backgroundColor: cor }} />
                      <div>
                        <CardTitle className="text-sm" style={{ color: cor }}>{pilar.nome}</CardTitle>
                        <p className="text-xs text-[#94A3B8]">{pilar.criteria?.length || 0} critérios</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {pilar.criteria?.map((crit: any, cIdx: number) => (
                        <div key={crit.id} className="flex items-start gap-2 p-2 rounded-lg bg-[#F8FAFC]">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5" style={{ backgroundColor: cor }}>
                            {cIdx + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-[#0F172A]">{crit.nome}</p>
                            {crit.descricao && <p className="text-[10px] text-[#64748B] mt-0.5">{crit.descricao}</p>}
                            {crit.fieldKey && <span className="text-[10px] text-[#94A3B8] font-mono">{crit.fieldKey}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Revision History */}
          {revisions.data && revisions.data.length > 1 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-[#64748B]" /> Histórico de Revisões</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {revisions.data.map((rev: any) => (
                    <div key={rev.id} className="flex items-center gap-3 p-2 rounded-lg border border-[#E2E8F0]">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-[#0F172A]">v{rev.version}</p>
                          {rev.isActive ? (
                            <Badge className="bg-green-100 text-green-700 text-[10px]">Ativa</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Inativa</Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-[#64748B]">{rev.descricao || "—"} • {rev.createdBy}</p>
                      </div>
                      {!rev.isActive && (
                        <Button size="sm" variant="outline" className="text-xs h-7"
                          onClick={() => activateRevision.mutate({ id: rev.id, companyId })}>
                          <CheckCircle className="w-3 h-3 mr-1" /> Ativar
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
