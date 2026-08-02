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
import { Loader2, PenLine, Eye, Send, XCircle, RefreshCw, FileText, Clock, CheckCircle2, AlertTriangle, Shield, ChevronRight, ChevronDown, RotateCcw, Trash2, Link2, Check, Pencil, MessageCircle, Crown, Library, LayoutDashboard, Search, ShieldCheck, ExternalLink, Folder, FolderOpen, Users, HardHat, ShoppingCart, CalendarRange, Handshake } from "lucide-react";
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
  // Rev. 4853 — módulo FCSign: abas Painel × Biblioteca de assinados
  const [aba, setAba] = useState<"painel" | "biblioteca">("painel");
  const [busca, setBusca] = useState("");
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
  // Rev. 4855 — Biblioteca consultiva: TUDO que foi assinado no sistema,
  // catalogado automaticamente por setor e pasta (todas as fontes).
  const biblioteca = trpc.integrasign.bibliotecaAssinados.useQuery(
    { companyId },
    { enabled: companyId > 0 && aba === "biblioteca" }
  );
  const [setorAberto, setSetorAberto] = useState<string | null>(null);
  // Rev. 4856 — controle de assinatura: filtro assinados × pendentes
  const [statusBib, setStatusBib] = useState<"todos" | "assinado" | "pendente">("todos");
  // Minha vez de assinar (mesma fonte do pop-up global)
  const pendentesMe = trpc.integrasign.pendingForCurrentUser.useQuery(undefined, { refetchOnWindowFocus: true });

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

  // Rev. 3068: 1 clique no "Enviar por e-mail" já dispara o e-mail E abre o WhatsApp
  // do 1º signatário pendente (assinatura é sequencial — só o ordemAssinatura 1 é
  // notificado no envio), sem precisar clicar no botão WhatsApp depois. O window.open
  // do WhatsApp roda de forma SÍNCRONA no gesto do clique p/ não ser bloqueado no iPad/Safari.
  function handleEnviarComWhatsApp(env: any) {
    const primeiro =
      (env.signatarios || []).find((s: any) => s.ordemAssinatura === 1 && s.token && !["assinado", "recusado"].includes(s.status))
      || [...(env.signatarios || [])]
          .filter((s: any) => s.token && !["assinado", "recusado"].includes(s.status))
          .sort((a: any, b: any) => (a.ordemAssinatura || 0) - (b.ordemAssinatura || 0))[0];
    if (primeiro?.token) handleWhatsApp(primeiro, env.titulo);
    handleEnviar(env.id, true);
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

  const minhasPendencias = (pendentesMe.data ?? []) as any[];

  return (
    <div className="min-h-full bg-slate-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#0f2027] via-[#1B2A4A] to-teal-800 px-6 pt-6 pb-16 text-white">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm ring-1 ring-white/15"><PenLine className="h-6 w-6 text-teal-300" /></span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">FCSign</h1>
              <p className="text-sm text-teal-100/80">Central de assinaturas e biblioteca de documentos assinados</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white" onClick={() => { envelopes.refetch(); pendentesMe.refetch(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {/* Abas */}
        <div className="mt-5 inline-flex rounded-xl bg-white/10 p-1 backdrop-blur-sm ring-1 ring-white/15">
          {[
            { id: "painel" as const, label: "Painel", Icon: LayoutDashboard },
            { id: "biblioteca" as const, label: "Biblioteca de Assinados", Icon: Library },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition ${
                aba === id ? "bg-white text-[#1B2A4A] shadow" : "text-teal-100/90 hover:bg-white/10"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 -mt-10 pb-8 space-y-5">
        {/* Minha vez de assinar */}
        {minhasPendencias.length > 0 && (
          <div className="rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
              </span>
              Sua vez de assinar ({minhasPendencias.length})
            </div>
            <div className="mt-2 space-y-1.5">
              {minhasPendencias.map((p: any) => (
                <div key={p.signatarioId} className="flex items-center gap-2 rounded-xl bg-white/80 border border-amber-200 px-3 py-2">
                  <FileText className="h-4 w-4 text-amber-600 shrink-0" />
                  <span className="flex-1 min-w-0 text-sm text-slate-800 truncate" title={p.titulo}>{p.titulo}</span>
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white h-8" onClick={() => window.open(`${window.location.origin}/integrasign/assinar/${p.token}`, "_blank", "noopener")}>
                    <PenLine className="h-3.5 w-3.5 mr-1" /> Assinar agora
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {aba === "painel" && (<>
        {/* Cards de status clicáveis (filtram a lista) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total, filtro: "todos", grad: "from-slate-600 to-slate-800", Icon: FileText },
            { label: "Rascunho", value: stats.rascunho, filtro: "rascunho", grad: "from-gray-400 to-gray-600", Icon: Pencil },
            { label: "Em Andamento", value: stats.enviado, filtro: "enviado", grad: "from-blue-500 to-indigo-600", Icon: Clock },
            { label: "Concluídos", value: stats.concluido, filtro: "concluido", grad: "from-emerald-500 to-green-700", Icon: CheckCircle2 },
            { label: "Recusados", value: stats.recusado, filtro: "recusado", grad: "from-rose-500 to-red-700", Icon: XCircle },
          ].map((s) => (
            <button
              key={s.label}
              onClick={() => setStatusFilter(s.filtro)}
              className={`rounded-2xl bg-gradient-to-br ${s.grad} p-3.5 text-left text-white shadow-md transition hover:scale-[1.02] ${
                statusFilter === s.filtro ? "ring-4 ring-teal-300/60" : "opacity-95"
              }`}
            >
              <div className="flex items-center justify-between">
                <s.Icon className="h-4 w-4 opacity-80" />
                <span className="text-2xl font-bold leading-none">{s.value}</span>
              </div>
              <p className="mt-2 text-[11px] font-medium uppercase tracking-wide opacity-90">{s.label}</p>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48 bg-white">
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
                        <Button size="sm" onClick={() => handleEnviarComWhatsApp(env)} disabled={enviarMut.isPending} title="Envia por e-mail e já abre o WhatsApp do 1º signatário com o link de assinatura">
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
      </>)}

      {/* Rev. 4855 — Biblioteca consultiva: pastas por setor, tudo automático */}
      {aba === "biblioteca" && (() => {
        const SETOR_META: Record<string, { Icon: any; cor: string; bg: string }> = {
          "RH & DP": { Icon: Users, cor: "text-indigo-600", bg: "bg-indigo-50 ring-indigo-100" },
          "Segurança do Trabalho": { Icon: HardHat, cor: "text-amber-600", bg: "bg-amber-50 ring-amber-100" },
          "EPI": { Icon: Shield, cor: "text-orange-600", bg: "bg-orange-50 ring-orange-100" },
          "Terceiros & Medições": { Icon: Handshake, cor: "text-teal-600", bg: "bg-teal-50 ring-teal-100" },
          "Planejamento": { Icon: CalendarRange, cor: "text-blue-600", bg: "bg-blue-50 ring-blue-100" },
          "Compras": { Icon: ShoppingCart, cor: "text-emerald-600", bg: "bg-emerald-50 ring-emerald-100" },
        };
        const ORDEM_SETORES = ["RH & DP", "Segurança do Trabalho", "EPI", "Terceiros & Medições", "Planejamento", "Compras"];
        const q = busca.trim().toLowerCase();
        const todos = (biblioteca.data || []) as any[];
        const totAssinados = todos.filter((it) => it.status === "assinado").length;
        const totPendentes = todos.filter((it) => it.status === "pendente").length;
        const filtrados = todos.filter((it) =>
          (statusBib === "todos" || it.status === statusBib) &&
          (!q || [it.titulo, it.setor, it.pasta, ...(it.pessoas || []), ...(it.faltam || [])].join(" ").toLowerCase().includes(q))
        );
        const porSetor = new Map<string, any[]>();
        for (const it of filtrados) {
          if (!porSetor.has(it.setor)) porSetor.set(it.setor, []);
          porSetor.get(it.setor)!.push(it);
        }
        const setores = [
          ...ORDEM_SETORES.filter((s) => porSetor.has(s)),
          ...Array.from(porSetor.keys()).filter((s) => !ORDEM_SETORES.includes(s)),
        ];
        const fmtData = (d: string | null) => {
          if (!d) return "—";
          const s = String(d);
          const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
          return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : s;
        };
        return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9 bg-white"
                placeholder="Buscar em tudo que foi assinado..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <span className="text-xs text-slate-500">
              {filtrados.length} documento(s) · {setores.length} setor(es)
            </span>
          </div>

          {/* Rev. 4856 — controle de assinatura: assinados × pendentes */}
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "todos" as const, label: "Total", n: todos.length, cls: "from-slate-700 to-slate-900" },
              { key: "assinado" as const, label: "Assinados", n: totAssinados, cls: "from-emerald-500 to-green-700" },
              { key: "pendente" as const, label: "Faltam assinar", n: totPendentes, cls: "from-amber-500 to-orange-600" },
            ]).map((c) => (
              <button key={c.key}
                className={`rounded-2xl bg-gradient-to-br ${c.cls} p-3 text-left text-white shadow-sm transition ${statusBib === c.key ? "ring-2 ring-offset-2 ring-teal-400" : "opacity-90 hover:opacity-100"}`}
                onClick={() => setStatusBib(c.key)}>
                <p className="text-xl font-bold leading-none">{c.n}</p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wide opacity-90">{c.label}</p>
              </button>
            ))}
          </div>

          {biblioteca.isLoading && (
            <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
          )}
          {!biblioteca.isLoading && filtrados.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">
              <Library className="mx-auto h-8 w-8 mb-2" />
              {q ? "Nada encontrado com essa busca." : "Nenhum documento assinado ainda — tudo que for assinado em qualquer módulo entra aqui automaticamente."}
            </div>
          )}

          <div className="space-y-3">
            {setores.map((setor) => {
              const meta = SETOR_META[setor] || { Icon: Folder, cor: "text-slate-600", bg: "bg-slate-50 ring-slate-100" };
              const itens = porSetor.get(setor)!;
              const aberto = setorAberto === setor || !!q;
              const pastas = new Map<string, any[]>();
              for (const it of itens) {
                if (!pastas.has(it.pasta)) pastas.set(it.pasta, []);
                pastas.get(it.pasta)!.push(it);
              }
              return (
                <div key={setor} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition"
                    onClick={() => setSetorAberto(aberto && !q ? null : setor)}
                  >
                    <span className={`rounded-xl p-2.5 ring-1 ${meta.bg}`}>
                      {aberto ? <FolderOpen className={`h-5 w-5 ${meta.cor}`} /> : <Folder className={`h-5 w-5 ${meta.cor}`} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{setor}</p>
                      <p className="text-[11px] text-slate-400">{pastas.size} pasta(s) · {itens.length} documento(s)</p>
                    </div>
                    {aberto ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                  </button>
                  {aberto && (
                    <div className="border-t border-slate-100 px-4 pb-4 space-y-3">
                      {Array.from(pastas.entries()).map(([pasta, docs]) => (
                        <div key={pasta} className="pt-3">
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                            <Folder className="h-3.5 w-3.5" /> {pasta} <span className="font-normal">({docs.length})</span>
                          </p>
                          <div className="space-y-1.5">
                            {docs.map((it: any, i: number) => (
                              <div key={`${pasta}-${i}`} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 transition ${it.status === "pendente" ? "border-amber-200 bg-amber-50/60 hover:border-amber-300" : "border-slate-100 bg-slate-50/50 hover:border-teal-200"}`}>
                                {it.status === "pendente"
                                  ? <Clock className="h-4 w-4 shrink-0 text-amber-500" />
                                  : <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-slate-700 break-words leading-snug">{it.titulo}</p>
                                  <p className="text-[10px] text-slate-400 break-words">
                                    {fmtData(it.data)}{it.pessoas?.length ? ` · Assinou: ${it.pessoas.slice(0, 3).join(", ")}${it.pessoas.length > 3 ? ` +${it.pessoas.length - 3}` : ""}` : ""}
                                  </p>
                                  {it.status === "pendente" && (
                                    <p className="text-[10px] font-medium text-amber-600 break-words">
                                      Falta assinar: {(it.faltam || []).slice(0, 4).join(", ") || "—"}{(it.faltam || []).length > 4 ? ` +${it.faltam.length - 4}` : ""}
                                    </p>
                                  )}
                                </div>
                                {it.envelopeId ? (
                                  <Button size="sm" variant="outline" className="h-7 text-[11px] border-teal-200 text-teal-700 hover:bg-teal-50 shrink-0"
                                    onClick={() => { setAba("painel"); setStatusFilter("concluido"); setSelectedEnvelope(it.envelopeId); }}>
                                    <Eye className="h-3 w-3 mr-1" /> Ver
                                  </Button>
                                ) : it.url ? (
                                  <Button size="sm" variant="outline" className="h-7 text-[11px] shrink-0"
                                    onClick={() => window.open(it.url, "_blank", "noopener")}>
                                    <ExternalLink className="h-3 w-3 mr-1" /> Abrir
                                  </Button>
                                ) : (
                                  <span className="text-[10px] text-slate-300 shrink-0">registro</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}

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
    </div>
  );
}
