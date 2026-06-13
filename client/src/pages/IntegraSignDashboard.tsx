import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "../lib/trpc";
import { useCompany } from "../contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, PenLine, Eye, Send, XCircle, RefreshCw, FileText, Clock, CheckCircle2, AlertTriangle, Shield, ChevronRight, RotateCcw, Trash2, Link2, Check, Pencil, MessageCircle, Crown } from "lucide-react";
import { toast } from "sonner";

function papelLabel(p: string) {
  const m: Record<string, string> = {
    fornecedor: "Fornecedor",
    gestor_projeto: "Gestor",
    financeiro: "Financeiro",
    diretor: "Diretor",
    testemunha: "Testemunha",
  };
  return m[p] || p;
}

function statusConfig(s: string) {
  switch (s) {
    case "rascunho": return { label: "Rascunho", color: "bg-gray-500", icon: FileText };
    case "enviado": return { label: "Enviado", color: "bg-blue-500", icon: Send };
    case "em_andamento": return { label: "Em Andamento", color: "bg-amber-500", icon: Clock };
    case "concluido": return { label: "Concluído", color: "bg-green-600", icon: CheckCircle2 };
    case "recusado": return { label: "Recusado", color: "bg-red-500", icon: XCircle };
    case "cancelado": return { label: "Cancelado", color: "bg-gray-600", icon: XCircle };
    case "expirado": return { label: "Expirado", color: "bg-orange-500", icon: AlertTriangle };
    default: return { label: s, color: "bg-gray-500", icon: FileText };
  }
}

function sigStatusBadge(s: string) {
  switch (s) {
    case "assinado": return <Badge className="bg-green-600 text-white text-xs">Assinado</Badge>;
    case "notificado": return <Badge className="bg-blue-600 text-white text-xs">Notificado</Badge>;
    case "visualizado": return <Badge className="bg-amber-600 text-white text-xs">Visualizado</Badge>;
    case "pendente": return <Badge variant="secondary" className="text-xs">Pendente</Badge>;
    case "recusado": return <Badge className="bg-red-600 text-white text-xs">Recusado</Badge>;
    default: return <Badge variant="secondary" className="text-xs">{s}</Badge>;
  }
}

export default function IntegraSignDashboard() {
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId) || 0;
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [selectedEnvelope, setSelectedEnvelope] = useState<number | null>(null);
  const [location] = useLocation();
  // Auto-seleciona o envelope vindo da query string (?envelope=ID), útil quando
  // o usuário é redirecionado de outras telas após criar o envelope.
  useEffect(() => {
    const qs = typeof window !== "undefined" ? window.location.search : "";
    const m = qs.match(/[?&]envelope=(\d+)/);
    if (m) {
      const id = parseInt(m[1], 10);
      if (!Number.isNaN(id)) setSelectedEnvelope(id);
    }
  }, [location]);
  const [cancelDialog, setCancelDialog] = useState<number | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");

  const envelopes = trpc.integrasign.listarEnvelopes.useQuery(
    { companyId, status: statusFilter === "todos" ? undefined : statusFilter },
    { enabled: companyId > 0 }
  );

  const envelopeDetail = trpc.integrasign.getEnvelope.useQuery(
    { companyId, id: selectedEnvelope! },
    { enabled: !!selectedEnvelope && companyId > 0 }
  );

  const enviarMut = trpc.integrasign.enviarParaAssinatura.useMutation();
  const cancelarMut = trpc.integrasign.cancelarEnvelope.useMutation();
  const excluirMut = trpc.integrasign.excluirEnvelope.useMutation();
  const editarMut = trpc.integrasign.editarEnvelope.useMutation();
  const reenviarMut = trpc.integrasign.reenviarNotificacao.useMutation();
  const novaVersaoMut = trpc.integrasign.criarNovaVersao.useMutation();
  const adicionarSocioMut = trpc.integrasign.adicionarSocioAdministrador.useMutation();
  const [deleteDialog, setDeleteDialog] = useState<number | null>(null);
  const [copiedSigId, setCopiedSigId] = useState<number | null>(null);
  // Rev. 2898 — edição do envelope (título/descrição sempre; corpo só em rascunho).
  const [editDialog, setEditDialog] = useState<any | null>(null);
  const [editTitulo, setEditTitulo] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editTexto, setEditTexto] = useState("");

  function abrirEdicao(env: any) {
    setEditDialog(env);
    setEditTitulo(env.titulo || "");
    setEditDescricao(env.descricao || "");
    setEditTexto(env.textoContrato || "");
  }

  async function handleEditar() {
    if (!editDialog) return;
    const isRascunho = editDialog.status === "rascunho";
    try {
      await editarMut.mutateAsync({
        companyId,
        envelopeId: editDialog.id,
        titulo: editTitulo.trim(),
        descricao: editDescricao,
        ...(isRascunho ? { textoContrato: editTexto } : {}),
      });
      toast.success("Contrato atualizado");
      setEditDialog(null);
      envelopes.refetch();
      if (selectedEnvelope === editDialog.id) envelopeDetail.refetch();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    }
  }

  // Rev. 2828: copiar o link público de assinatura (/integrasign/assinar/:token)
  // p/ enviar manualmente ao signatário (ex.: WhatsApp), sem depender do e-mail.
  function handleCopiarLink(sig: any) {
    if (!sig?.token) {
      toast.error("Este signatário ainda não possui link de assinatura.");
      return;
    }
    const url = `${window.location.origin}/integrasign/assinar/${sig.token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedSigId(sig.id);
      toast.success("Link de assinatura copiado! Envie ao signatário (ex.: WhatsApp).");
      setTimeout(() => setCopiedSigId((c) => (c === sig.id ? null : c)), 2000);
    }).catch(() => toast.error("Não foi possível copiar o link."));
  }

  // Rev. 3042: abre o WhatsApp com a mensagem + link de assinatura prontos,
  // p/ enviar a quem não tem e-mail. wa.me sem número deixa escolher o contato.
  function handleWhatsApp(sig: any, titulo: string) {
    if (!sig?.token) {
      toast.error("Este signatário ainda não possui link de assinatura.");
      return;
    }
    const url = `${window.location.origin}/integrasign/assinar/${sig.token}`;
    const msg = `Olá ${sig.nome}, segue o link para assinatura eletrônica do documento "${titulo}":\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }

  async function handleEnviar(envelopeId: number, enviarEmail = true) {
    try {
      const result = await enviarMut.mutateAsync({ companyId, envelopeId, enviarEmail });
      toast.success(
        enviarEmail
          ? `Envelope enviado! ${result.notificados} signatário(s) notificado(s) por e-mail`
          : "Links gerados! Use os botões WhatsApp / Copiar link de cada signatário para enviar.",
      );
      envelopes.refetch();
      if (selectedEnvelope === envelopeId) envelopeDetail.refetch();
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar");
    }
  }

  async function handleCancelar() {
    if (!cancelDialog || !motivoCancelamento.trim()) return;
    try {
      await cancelarMut.mutateAsync({ companyId, envelopeId: cancelDialog, motivo: motivoCancelamento });
      toast.success("Envelope cancelado");
      setCancelDialog(null);
      setMotivoCancelamento("");
      envelopes.refetch();
      if (selectedEnvelope === cancelDialog) envelopeDetail.refetch();
    } catch (err: any) {
      toast.error(err.message || "Erro ao cancelar");
    }
  }

  async function handleExcluir() {
    if (!deleteDialog) return;
    try {
      await excluirMut.mutateAsync({ companyId, envelopeId: deleteDialog });
      toast.success("Envelope excluído");
      setDeleteDialog(null);
      if (selectedEnvelope === deleteDialog) setSelectedEnvelope(null);
      envelopes.refetch();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    }
  }

  // Rev. 3053 — adiciona o sócio administrador (signatário final) a um contrato
  // criado antes da injeção automática, gerando o link de assinatura dele.
  async function handleAdicionarSocio(envelopeId: number) {
    try {
      const r = await adicionarSocioMut.mutateAsync({ companyId, envelopeId });
      toast.success(`Sócio administrador (${r?.nome || "definido em Configurações"}) adicionado como signatário final. O link de assinatura já está disponível.`);
      envelopes.refetch();
      if (selectedEnvelope === envelopeId) envelopeDetail.refetch();
    } catch (err: any) {
      toast.error(err.message || "Erro ao adicionar sócio administrador");
    }
  }

  async function handleReenviar(signatarioId: number) {
    try {
      await reenviarMut.mutateAsync({ companyId, signatarioId });
      toast.success("Lembrete reenviado com sucesso");
      if (selectedEnvelope) envelopeDetail.refetch();
    } catch (err: any) {
      toast.error(err.message || "Erro ao reenviar");
    }
  }

  async function handleNovaVersao(envelopeId: number) {
    try {
      const result = await novaVersaoMut.mutateAsync({ companyId, envelopeIdAnterior: envelopeId });
      toast.success(`Nova versão (v${result.versao}) criada!`);
      envelopes.refetch();
      setSelectedEnvelope(result.id);
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar nova versão");
    }
  }

  const stats = {
    total: envelopes.data?.length || 0,
    rascunho: envelopes.data?.filter((e: any) => e.status === "rascunho").length || 0,
    enviado: envelopes.data?.filter((e: any) => ["enviado", "em_andamento"].includes(e.status)).length || 0,
    concluido: envelopes.data?.filter((e: any) => e.status === "concluido").length || 0,
    recusado: envelopes.data?.filter((e: any) => e.status === "recusado").length || 0,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PenLine className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">IntegraSign</h1>
            <p className="text-sm text-gray-500">Gestão de Assinaturas Eletrônicas de Contratos</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => envelopes.refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total", value: stats.total, color: "text-gray-700" },
          { label: "Rascunho", value: stats.rascunho, color: "text-gray-500" },
          { label: "Em Andamento", value: stats.enviado, color: "text-blue-600" },
          { label: "Concluídos", value: stats.concluido, color: "text-green-600" },
          { label: "Recusados", value: stats.recusado, color: "text-red-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="enviado">Enviado</SelectItem>
            <SelectItem value="concluido">Concluído</SelectItem>
            <SelectItem value="recusado">Recusado</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Envelopes</CardTitle></CardHeader>
          <CardContent>
            {envelopes.isLoading && (
              <div className="flex justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            )}
            {!envelopes.isLoading && (!envelopes.data || envelopes.data.length === 0) && (
              <p className="text-center text-gray-500 py-8">Nenhum envelope encontrado</p>
            )}
            <ScrollArea className="max-h-[600px]">
              <div className="space-y-2">
                {(envelopes.data || []).map((env: any) => {
                  const cfg = statusConfig(env.status);
                  const Icon = cfg.icon;
                  const assinados = env.signatarios?.filter((s: any) => s.status === "assinado" && s.papel !== "testemunha").length || 0;
                  const totalObrig = env.signatarios?.filter((s: any) => s.papel !== "testemunha").length || 0;

                  return (
                    <div
                      key={env.id}
                      className={`p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition ${
                        selectedEnvelope === env.id ? "border-blue-400 bg-blue-50/30" : ""
                      }`}
                      onClick={() => setSelectedEnvelope(env.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 shrink-0 text-white p-0.5 rounded ${cfg.color}`} />
                            <span className="font-medium text-sm truncate">{env.titulo}</span>
                            {env.versao > 1 && <Badge variant="outline" className="text-xs">v{env.versao}</Badge>}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400">
                              {new Date(env.criadoEm).toLocaleDateString("pt-BR")}
                            </span>
                            {totalObrig > 0 && (
                              <span className="text-xs text-gray-500">{assinados}/{totalObrig} assinado(s)</span>
                            )}
                          </div>
                          {totalObrig > 0 && (
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1.5">
                              <div
                                className="bg-green-500 h-1.5 rounded-full transition-all"
                                style={{ width: `${(assinados / totalObrig) * 100}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-500 hover:text-blue-600"
                            title="Editar"
                            onClick={(e) => { e.stopPropagation(); abrirEdicao(env); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-500 hover:text-red-600"
                            title="Excluir"
                            onClick={(e) => { e.stopPropagation(); setDeleteDialog(env.id); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedEnvelope ? "Detalhes do Envelope" : "Selecione um envelope"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedEnvelope && (
              <div className="text-center py-12 text-gray-400">
                <Eye className="mx-auto h-8 w-8 mb-3" />
                <p>Clique em um envelope para ver detalhes</p>
              </div>
            )}

            {selectedEnvelope && envelopeDetail.isLoading && (
              <div className="flex justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}

            {selectedEnvelope && envelopeDetail.data && (() => {
              const env = envelopeDetail.data;
              const cfg = statusConfig(env.status);

              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${cfg.color} text-white`}>{cfg.label}</Badge>
                    {env.versao > 1 && <Badge variant="outline">Versão {env.versao}</Badge>}
                    {env.hashDocumento && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        SHA-256: {env.hashDocumento.slice(0, 12)}...
                      </span>
                    )}
                  </div>

                  {env.descricao && <p className="text-sm text-gray-600">{env.descricao}</p>}

                  {env.motivoRecusa && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm font-medium text-red-700">Motivo da Recusa:</p>
                      <p className="text-sm text-red-600">{env.motivoRecusa}</p>
                      <p className="text-xs text-red-400 mt-1">Por: {env.recusadoPorNome}</p>
                    </div>
                  )}

                  <div>
                    <h4 className="font-medium text-sm mb-2">Signatários</h4>
                    <div className="space-y-2">
                      {env.signatarios.map((sig: any) => (
                        <div key={sig.id} className="flex flex-col gap-2 p-2 bg-gray-50 rounded">
                          <div className="min-w-0">
                            <span className="text-sm font-medium break-words">{sig.nome}</span>
                            <span className="text-xs text-gray-500 ml-1">({papelLabel(sig.papel)})</span>
                            {sig.dataAssinatura && (
                              <span className="text-xs text-gray-400 ml-2">
                                {new Date(sig.dataAssinatura).toLocaleString("pt-BR")}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap shrink-0">
                            {sigStatusBadge(sig.status)}
                            {sig.token && !["assinado", "recusado"].includes(sig.status) && ["enviado", "em_andamento"].includes(env.status) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleCopiarLink(sig)}
                                title="Copiar link de assinatura para enviar ao signatário"
                              >
                                {copiedSigId === sig.id ? <Check className="h-3 w-3 mr-1 text-green-600" /> : <Link2 className="h-3 w-3 mr-1" />}
                                {copiedSigId === sig.id ? "Copiado" : "Copiar link"}
                              </Button>
                            )}
                            {sig.token && !["assinado", "recusado"].includes(sig.status) && ["enviado", "em_andamento"].includes(env.status) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-green-700 hover:text-green-800"
                                onClick={() => handleWhatsApp(sig, env.titulo)}
                                title="Enviar link de assinatura por WhatsApp"
                              >
                                <MessageCircle className="h-3 w-3 mr-1" />
                                WhatsApp
                              </Button>
                            )}
                            {["notificado", "visualizado", "pendente"].includes(sig.status) && env.status !== "cancelado" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleReenviar(sig.id)}
                                disabled={reenviarMut.isPending}
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Reenviar
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap pt-2">
                    {env.status === "rascunho" && (
                      <>
                        <Button size="sm" onClick={() => handleEnviar(env.id, true)} disabled={enviarMut.isPending}>
                          <Send className="h-4 w-4 mr-1" />
                          Enviar por e-mail
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleEnviar(env.id, false)} disabled={enviarMut.isPending} title="Gera os links sem disparar e-mail — envie por WhatsApp/link">
                          <MessageCircle className="h-4 w-4 mr-1" />
                          Gerar links (WhatsApp)
                        </Button>
                      </>
                    )}
                    {env.contratoTerceiroId && !env.signatarios.some((s: any) => s.papel === "diretor") && !["cancelado", "concluido", "expirado", "recusado"].includes(env.status) && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => handleAdicionarSocio(env.id)}
                        disabled={adicionarSocioMut.isPending}
                        title="Adiciona o sócio administrador (definido em Configurações → Sócios) como assinante final e gera o link de assinatura"
                      >
                        {adicionarSocioMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Crown className="h-4 w-4 mr-1" />}
                        Adicionar sócio administrador
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => abrirEdicao(env)}>
                      <Pencil className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                    {!["concluido", "cancelado"].includes(env.status) && (
                      <Button variant="outline" size="sm" className="text-red-600" onClick={() => setCancelDialog(env.id)}>
                        <XCircle className="h-4 w-4 mr-1" />
                        Cancelar
                      </Button>
                    )}
                    {["recusado", "cancelado"].includes(env.status) && (
                      <Button variant="outline" size="sm" onClick={() => handleNovaVersao(env.id)} disabled={novaVersaoMut.isPending}>
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Nova Versão
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDeleteDialog(env.id)}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Excluir
                    </Button>
                  </div>

                  {env.auditLog && env.auditLog.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm mb-2 mt-4">Histórico de Auditoria</h4>
                      <ScrollArea className="max-h-[250px]">
                        <div className="space-y-1">
                          {env.auditLog.map((log: any) => (
                            <div key={log.id} className="text-xs p-2 bg-gray-50 rounded">
                              <span className="text-gray-400">
                                {new Date(log.criadoEm).toLocaleString("pt-BR")}
                              </span>
                              <span className="mx-2">—</span>
                              <span className="font-medium">{log.acao.replace(/_/g, " ")}</span>
                              {log.detalhes && <p className="text-gray-500 mt-0.5">{log.detalhes}</p>}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!cancelDialog} onOpenChange={() => { setCancelDialog(null); setMotivoCancelamento(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Envelope</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Label>Motivo do cancelamento *</Label>
            <Textarea
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              placeholder="Descreva o motivo..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelDialog(null); setMotivoCancelamento(""); }}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={handleCancelar} disabled={!motivoCancelamento.trim() || cancelarMut.isPending}>
              {cancelarMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Contrato</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            O contrato será removido da lista do IntegraSign. O registro e as assinaturas
            já coletadas continuam preservados no sistema para fins de auditoria.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={handleExcluir} disabled={excluirMut.isPending}>
              {excluirMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Contrato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                value={editTitulo}
                onChange={(e) => setEditTitulo(e.target.value)}
                placeholder="Título do contrato"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={editDescricao}
                onChange={(e) => setEditDescricao(e.target.value)}
                placeholder="Descrição (opcional)"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Texto do contrato</Label>
              {editDialog?.status === "rascunho" ? (
                <Textarea
                  value={editTexto}
                  onChange={(e) => setEditTexto(e.target.value)}
                  placeholder="Corpo do contrato"
                  rows={10}
                  className="font-mono text-xs"
                />
              ) : (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                  O corpo do contrato só pode ser editado enquanto está em rascunho. Para alterar
                  o conteúdo de um contrato já enviado, use "Cancelar" e depois "Nova Versão" — assim
                  as assinaturas já coletadas ficam preservadas.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>
              Voltar
            </Button>
            <Button onClick={handleEditar} disabled={!editTitulo.trim() || editarMut.isPending}>
              {editarMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
