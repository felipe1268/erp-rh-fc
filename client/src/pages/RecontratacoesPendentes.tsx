import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { RefreshCw, UserCheck, UserX, ShieldAlert, Clock, AlertTriangle, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

function fmtData(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export default function RecontratacoesPendentes() {
  const [, navigate] = useLocation();
  const { selectedCompanyId, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const utils = trpc.useUtils();

  const [filtroStatus, setFiltroStatus] = useState<string>("pendente");

  const aprovadorQuery = trpc.recontratacao.souAprovador.useQuery({ companyId }, { enabled: companyId > 0 });
  const souAprovador = !!aprovadorQuery.data?.aprovador;

  const listaQuery = trpc.recontratacao.listarSolicitacoes.useQuery(
    { companyId, companyIds, status: filtroStatus === "todas" ? undefined : filtroStatus },
    { enabled: companyId > 0 || (companyIds?.length ?? 0) > 0 },
  );
  const solicitacoes = (listaQuery.data || []) as any[];

  const cardQuery = trpc.recontratacao.cardRecontratados.useQuery(
    { companyId, companyIds },
    { enabled: companyId > 0 || (companyIds?.length ?? 0) > 0 },
  );
  const recontratados = (cardQuery.data?.lista || []) as any[];
  const totalRecontratados = cardQuery.data?.total ?? 0;
  const tempoForaMedio = useMemo(() => {
    const dias = recontratados.map((r: any) => r.tempoForaDias).filter((d: any) => typeof d === "number");
    if (dias.length === 0) return null;
    return Math.round(dias.reduce((a: number, b: number) => a + b, 0) / dias.length);
  }, [recontratados]);

  const [aprovarAlvo, setAprovarAlvo] = useState<any | null>(null);
  const [recusarAlvo, setRecusarAlvo] = useState<any | null>(null);
  const [parecer, setParecer] = useState("");
  const [motivoRecusa, setMotivoRecusa] = useState("");

  const invalidar = () => {
    utils.recontratacao.listarSolicitacoes.invalidate();
    utils.recontratacao.contarPendentes.invalidate();
    utils.recontratacao.cardRecontratados.invalidate();
  };

  const aprovarMut = trpc.recontratacao.aprovar.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Recontratação liberada! Novo colaborador: ${r.codigoInterno || "criado"}.`);
      setAprovarAlvo(null); setParecer("");
      invalidar();
    },
    onError: (e: any) => toast.error("Erro ao liberar: " + e.message),
  });

  const recusarMut = trpc.recontratacao.recusar.useMutation({
    onSuccess: () => {
      toast.success("Recontratação recusada.");
      setRecusarAlvo(null); setMotivoRecusa("");
      invalidar();
    },
    onError: (e: any) => toast.error("Erro ao recusar: " + e.message),
  });

  const pendentes = useMemo(() => solicitacoes.filter((s: any) => s.status === "pendente"), [solicitacoes]);

  const statusBadge = (status: string) => {
    switch (status) {
      case "pendente": return <Badge className="bg-amber-100 text-amber-800 border-amber-300">Pendente</Badge>;
      case "aprovada": return <Badge className="bg-lime-100 text-lime-800 border-lime-300">Aprovada</Badge>;
      case "recusada": return <Badge className="bg-red-100 text-red-700 border-red-300">Recusada</Badge>;
      case "vencida": return <Badge className="bg-gray-100 text-gray-600 border-gray-300">Vencida</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <RefreshCw className="h-6 w-6 text-amber-600" />
              Recontratações Pendentes
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Liberação do sócio (Admin Master) ou suplente autorizado. Nada vira colaborador até a aprovação.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/colaboradores")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Colaboradores
          </Button>
        </div>

        {!souAprovador && (
          <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-4 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-700">Você está em modo de consulta</p>
              <p className="text-xs text-amber-700/80 mt-0.5">
                Apenas o sócio (Admin Master) ou um suplente autorizado pode liberar ou recusar recontratações.
                Você pode acompanhar a fila abaixo. Suplentes são definidos em Configurações · Critérios.
              </p>
            </div>
          </div>
        )}

        {/* Card métrico "Recontratados" — quem JÁ voltou (ficha nova ligada por CPF) */}
        <Card className="border-lime-200 bg-lime-50/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <h2 className="text-base font-semibold flex items-center gap-2 text-lime-800">
                <UserCheck className="h-5 w-5 text-lime-600" /> Recontratados
              </h2>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-lime-800"><span className="font-bold text-lg">{totalRecontratados}</span> total</span>
                {tempoForaMedio != null && (
                  <span className="text-lime-800/80">Tempo fora médio: <span className="font-semibold">{tempoForaMedio} dias</span></span>
                )}
              </div>
            </div>
            {cardQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Carregando...</p>
            ) : recontratados.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma recontratação concluída no período.</p>
            ) : (
              <div className="space-y-1.5">
                {recontratados.slice(0, 8).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 flex-wrap text-sm bg-white/60 rounded-md px-3 py-1.5 border border-lime-100">
                    <div className="flex items-center gap-2 flex-wrap min-w-[220px]">
                      <span className="font-medium">{r.nomeCompleto}</span>
                      {r.codigoInterno && <Badge variant="outline" className="text-xs font-mono">{r.codigoInterno}</Badge>}
                      {r.funcao && <span className="text-xs text-muted-foreground">{r.funcao}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {r.codigoAnterior && <span>Vínculo anterior: {r.codigoAnterior}</span>}
                      {r.tempoForaDias != null && <span>{r.tempoForaDias} dias fora</span>}
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-lime-700 hover:bg-lime-100" onClick={() => navigate(`/raio-x/${r.id}`)}>
                        Raio-X
                      </Button>
                    </div>
                  </div>
                ))}
                {recontratados.length > 8 && (
                  <p className="text-xs text-muted-foreground pt-1">+ {recontratados.length - 8} outros recontratados.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: "pendente", label: "Pendentes" },
            { key: "aprovada", label: "Aprovadas" },
            { key: "recusada", label: "Recusadas" },
            { key: "todas", label: "Todas" },
          ].map(f => (
            <Button
              key={f.key}
              size="sm"
              variant={filtroStatus === f.key ? "default" : "outline"}
              onClick={() => setFiltroStatus(f.key)}
              className={filtroStatus === f.key ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
            >
              {f.label}
              {f.key === "pendente" && pendentes.length > 0 ? ` (${pendentes.length})` : ""}
            </Button>
          ))}
        </div>

        {listaQuery.isLoading ? (
          <div className="text-center py-16 text-gray-400">Carregando solicitações...</div>
        ) : solicitacoes.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-lime-500" />
              Nenhuma solicitação {filtroStatus === "todas" ? "" : `"${filtroStatus}"`} no momento.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {solicitacoes.map((s: any) => {
              const semExperiencia = s.experienciaPermitida === 0;
              const dentroCarencia = s.dentroCarencia === 1;
              return (
                <Card key={s.id} className={semExperiencia ? "border-red-300" : "border-border"}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-[260px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-base">{s.nomeCompleto}</span>
                          {statusBadge(s.status)}
                          {s.mesmaEmpresa === 1
                            ? <Badge variant="outline" className="text-xs">Mesma empresa</Badge>
                            : <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">Outra empresa do grupo</Badge>}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          CPF {s.cpf} · Função pretendida: <span className="font-medium text-foreground">{s.funcao || "—"}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Vínculo anterior: {s.vinculoAnteriorCodigo || "—"}
                          {s.vinculoAnteriorFuncao ? ` · ${s.vinculoAnteriorFuncao}` : ""}
                          {" · desligado em "}{fmtData(s.vinculoAnteriorDesligamento)}
                          {s.diasFora != null ? ` · ${s.diasFora} dias fora` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Solicitado por {s.solicitadoPor} em {fmtData(s.createdAt)}
                          {s.prazoLimite ? ` · prazo até ${fmtData(s.prazoLimite)}` : ""}
                        </div>

                        {(semExperiencia || s.alertaJuridico) && (
                          <div className={`mt-2 rounded-md p-2 text-xs flex items-start gap-2 ${semExperiencia ? "bg-red-50 border border-red-200 text-red-700" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                            <span className="font-medium">{s.alertaJuridico || "Mesma empresa + mesma função: novo contrato SEM período de experiência (CLT/TST)."}</span>
                          </div>
                        )}
                        {dentroCarencia && (
                          <div className="mt-2 rounded-md p-2 text-xs flex items-start gap-2 bg-orange-50 border border-orange-200 text-orange-700">
                            <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                            <span>Dentro do período de carência configurado ({s.carenciaDias ?? "?"} dias). Avalie com atenção.</span>
                          </div>
                        )}
                        {s.observacaoSolicitante && (
                          <div className="mt-2 text-xs text-muted-foreground italic">Obs.: {s.observacaoSolicitante}</div>
                        )}
                        {s.status !== "pendente" && s.parecer && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            Parecer ({s.resolvidoPor || "—"}, {fmtData(s.resolvidoData)}): {s.parecer}
                          </div>
                        )}
                      </div>

                      {s.status === "pendente" && souAprovador && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <Button size="sm" className="bg-lime-600 hover:bg-lime-700 text-white" onClick={() => { setAprovarAlvo(s); setParecer(""); }}>
                            <UserCheck className="h-4 w-4 mr-1" /> Liberar
                          </Button>
                          <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => { setRecusarAlvo(s); setMotivoRecusa(""); }}>
                            <UserX className="h-4 w-4 mr-1" /> Recusar
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Aprovar */}
      <Dialog open={!!aprovarAlvo} onOpenChange={(o) => { if (!o) setAprovarAlvo(null); }}>
        <DialogContent resizable={false} className="p-0 gap-0 overflow-x-hidden w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader className="space-y-0 p-0">
            <div className="bg-gradient-to-r from-emerald-600 to-lime-600 px-5 py-4 text-white">
              <DialogTitle className="flex items-center gap-3 text-white">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <span className="text-base font-semibold leading-tight">Liberar recontratação</span>
              </DialogTitle>
              <DialogDescription className="mt-2 text-[13px] leading-snug text-emerald-50">
                Ao liberar, o ERP cria um colaborador <span className="font-semibold">NOVO</span> (número novo), vinculado ao registro anterior por CPF.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-3 px-5 py-4">
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-sm font-semibold leading-tight break-words">{aprovarAlvo?.nomeCompleto}</p>
              <p className="mt-0.5 text-xs text-muted-foreground break-words">{aprovarAlvo?.funcao || "—"}</p>
            </div>

            {aprovarAlvo?.experienciaPermitida === 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs leading-snug text-amber-800">
                  Este caso <span className="font-semibold">NÃO</span> terá período de experiência (mesma empresa + mesma função).
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Parecer (opcional)</Label>
              <Input value={parecer} onChange={(e) => setParecer(e.target.value)} placeholder="Observação da liberação..." />
            </div>
          </div>

          <DialogFooter className="gap-2 border-t bg-muted/30 px-5 py-3">
            <Button variant="outline" onClick={() => setAprovarAlvo(null)}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={aprovarMut.isPending}
              onClick={() => aprovarAlvo && aprovarMut.mutate({ id: aprovarAlvo.id, companyId: aprovarAlvo.companyId, parecer: parecer || undefined })}
            >
              {aprovarMut.isPending ? "Liberando..." : "Confirmar liberação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recusar */}
      <Dialog open={!!recusarAlvo} onOpenChange={(o) => { if (!o) setRecusarAlvo(null); }}>
        <DialogContent resizable={false} className="p-0 gap-0 overflow-x-hidden w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader className="space-y-0 p-0">
            <div className="bg-gradient-to-r from-red-600 to-rose-600 px-5 py-4 text-white">
              <DialogTitle className="flex items-center gap-3 text-white">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20">
                  <XCircle className="h-5 w-5" />
                </span>
                <span className="text-base font-semibold leading-tight">Recusar recontratação</span>
              </DialogTitle>
              <DialogDescription className="mt-2 text-[13px] leading-snug text-red-50">
                A solicitação será encerrada como recusada. Informe o motivo para o histórico.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-3 px-5 py-4">
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-sm font-semibold leading-tight break-words">{recusarAlvo?.nomeCompleto}</p>
              <p className="mt-0.5 text-xs text-muted-foreground break-words">{recusarAlvo?.funcao || "—"}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Motivo da recusa <span className="text-red-500">*</span></Label>
              <Input value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)} placeholder="Ex.: histórico disciplinar, sem vaga aprovada..." />
            </div>
          </div>

          <DialogFooter className="gap-2 border-t bg-muted/30 px-5 py-3">
            <Button variant="outline" onClick={() => setRecusarAlvo(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={recusarMut.isPending || motivoRecusa.trim().length < 3}
              onClick={() => recusarAlvo && recusarMut.mutate({ id: recusarAlvo.id, companyId: recusarAlvo.companyId, motivo: motivoRecusa.trim() })}
            >
              {recusarMut.isPending ? "Recusando..." : "Confirmar recusa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
