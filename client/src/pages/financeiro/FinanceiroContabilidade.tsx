// Rev. 3717 — Módulo Contabilidade: controle mensal/anual de envios ao contador + FCSign

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, CheckCircle2, Clock, Send,
  FileText, Download, PenSquare, RefreshCw, Plus, Eye,
  Building2, Archive, Receipt, ShoppingCart, Landmark, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface MesData {
  mes: number;
  label: string;
  futuro: boolean;
  status: string;
  envelopeId: number | null;
  envelopeStatus: string | null;
  enviadoEm: string | null;
  enviadoPorNome: string | null;
  observacoes: string | null;
  contagens: { nfse: number; nfe: number; extratos: number; ocs: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusLabel(s: string) {
  if (s === "futuro") return "Futuro";
  if (s === "pendente") return "Pendente";
  if (s === "enviado") return "Enviado";
  if (s === "assinado") return "Assinado";
  return s;
}

function statusColor(s: string) {
  if (s === "futuro") return "bg-slate-100 text-slate-400 border-slate-200";
  if (s === "pendente") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "enviado") return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "assinado") return "bg-green-50 text-green-700 border-green-200";
  return "bg-slate-50 text-slate-600";
}

function statusDot(s: string) {
  if (s === "futuro") return "bg-slate-300";
  if (s === "pendente") return "bg-amber-400";
  if (s === "enviado") return "bg-blue-500";
  if (s === "assinado") return "bg-green-500";
  return "bg-slate-400";
}

function envelopeStatusBadge(s: string | null) {
  if (!s) return null;
  const map: Record<string, string> = {
    rascunho: "bg-slate-100 text-slate-600",
    ativo: "bg-blue-100 text-blue-700",
    concluido: "bg-green-100 text-green-700",
    cancelado: "bg-red-100 text-red-600",
    recusado: "bg-orange-100 text-orange-700",
  };
  return map[s] ?? "bg-slate-100 text-slate-600";
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s.replace(" ", "T")).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return s; }
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function FinanceiroContabilidade() {
  const { companyId, company } = useCompany();
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mesSel, setMesSel] = useState<number | null>(null);

  // Dialogs
  const [dlgEnvio, setDlgEnvio] = useState(false);
  const [dlgFCSign, setDlgFCSign] = useState(false);

  // Form registrar envio
  const [obsEnvio, setObsEnvio] = useState("");

  // Form FCSign
  const [fcSignatarios, setFcSignatarios] = useState([
    { papel: "diretor" as const, ordemAssinatura: 1, nome: "", email: "", cargo: "Sócio Administrador", empresaNome: "" },
    { papel: "fornecedor" as const, ordemAssinatura: 2, nome: "Pronus Tributário", email: "contabil@pronustributario.com.br", cargo: "Contabilista", empresaNome: "Pronus Tributário" },
  ]);

  const anoQuery = trpc.contabilidade.getAno.useQuery(
    { companyId: companyId!, ano },
    { enabled: !!companyId, staleTime: 30_000 }
  );

  const meses: MesData[] = anoQuery.data ?? [];
  const mesDados = mesSel ? meses.find(m => m.mes === mesSel) ?? null : null;

  // Mutations
  const registrarMut = trpc.contabilidade.registrarEnvio.useMutation({
    onSuccess: () => {
      toast({ title: "Envio registrado com sucesso!" });
      setDlgEnvio(false);
      setObsEnvio("");
      anoQuery.refetch();
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const criarEnvMut = trpc.contabilidade.criarEnvelope.useMutation({
    onSuccess: (data) => {
      toast({ title: "Lista Mestre gerada!", description: `Envelope FCSign #${data.envelopeId} criado para assinatura.` });
      setDlgFCSign(false);
      anoQuery.refetch();
    },
    onError: (e) => toast({ title: "Erro ao criar envelope", description: e.message, variant: "destructive" }),
  });

  const syncEnvMut = trpc.contabilidade.syncEnvelope.useMutation({
    onSuccess: (data) => {
      if (data.ok) toast({ title: "Status atualizado", description: `Envelope: ${data.envelopeStatus}` });
      else toast({ title: data.message ?? "Nenhum envelope" });
      anoQuery.refetch();
    },
  });

  const atualizarMut = trpc.contabilidade.atualizarStatus.useMutation({
    onSuccess: () => { toast({ title: "Status atualizado!" }); anoQuery.refetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── KPIs do ano ────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const enviados = meses.filter(m => m.status === "enviado" || m.status === "assinado").length;
    const assinados = meses.filter(m => m.status === "assinado").length;
    const pendentes = meses.filter(m => m.status === "pendente" && !m.futuro).length;
    return { enviados, assinados, pendentes };
  }, [meses]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleRegistrarEnvio() {
    if (!companyId || !mesSel) return;
    const arquivos = ["Pacote Contador (ZIP)", "Planilha Extrato (XLSX)", "NFS-e Emitidas (HTML)", "NF-e Recebidas (CSV)", "OCs do Período (CSV)"];
    registrarMut.mutate({ companyId, mes: mesSel, ano, arquivos, observacoes: obsEnvio || null });
  }

  function handleCriarEnvelope() {
    if (!companyId || !mesSel || !mesDados) return;
    criarEnvMut.mutate({
      companyId, mes: mesSel, ano,
      nomeEmpresa: company?.nome ?? "FC Engenharia",
      contagens: mesDados.contagens,
      signatarios: fcSignatarios.filter(s => s.nome && s.email),
    });
  }

  function handleDownloadPacote() {
    if (!companyId || !mesSel) return;
    const url = `/api/download/pacote-contador?companyId=${companyId}&mes=${mesSel}&ano=${ano}`;
    window.open(url, "_blank");
  }

  function handleDownloadXlsx() {
    if (!companyId) return;
    const url = `/api/download/contabilidade-xlsx?companyId=${companyId}&mes=${mesSel}&ano=${ano}`;
    window.open(url, "_blank");
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Archive className="w-5 h-5 text-indigo-600" />
              Contabilidade — Controle de Envios
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Registre e acompanhe os documentos enviados ao contador mês a mês
            </p>
          </div>

          {/* Seletor de ano */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAno(a => a - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-3 font-semibold text-slate-800 min-w-[4rem] text-center">{ano}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8"
              disabled={ano >= anoAtual + 1} onClick={() => setAno(a => a + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* KPIs rápidos */}
        <div className="flex gap-4 mt-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
            <span className="text-slate-600">Assinados: <strong className="text-green-700">{kpis.assinados}</strong></span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
            <span className="text-slate-600">Enviados: <strong className="text-blue-700">{kpis.enviados}</strong></span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            <span className="text-slate-600">Pendentes: <strong className="text-amber-700">{kpis.pendentes}</strong></span>
          </div>
          {anoQuery.isFetching && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <RefreshCw className="w-3 h-3 animate-spin" /> Atualizando…
            </span>
          )}
        </div>
      </div>

      {/* Corpo: grid + painel lateral */}
      <div className="flex flex-1 overflow-hidden">
        {/* Grid 12 meses */}
        <div className="flex-1 p-6 overflow-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {anoQuery.isLoading
              ? Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="h-40 bg-white rounded-xl border border-slate-200 animate-pulse" />
                ))
              : meses.map((m) => (
                <button
                  key={m.mes}
                  onClick={() => setMesSel(mesSel === m.mes ? null : m.mes)}
                  className={cn(
                    "text-left rounded-xl border-2 p-4 transition-all hover:shadow-md bg-white",
                    mesSel === m.mes
                      ? "border-indigo-400 shadow-md ring-2 ring-indigo-100"
                      : "border-slate-200 hover:border-slate-300",
                    m.futuro && "opacity-60"
                  )}
                >
                  {/* Mês + status dot */}
                  <div className="flex items-start justify-between mb-3">
                    <span className="font-semibold text-slate-800 text-sm">{m.label}</span>
                    <span className={cn("w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0", statusDot(m.status))} />
                  </div>

                  {/* Badge status */}
                  <div className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border mb-3", statusColor(m.status))}>
                    {m.status === "assinado" && <CheckCircle2 className="w-3 h-3" />}
                    {m.status === "enviado" && <Send className="w-3 h-3" />}
                    {m.status === "pendente" && <Clock className="w-3 h-3" />}
                    {statusLabel(m.status)}
                  </div>

                  {/* Contagens mini */}
                  {!m.futuro && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Receipt className="w-3 h-3" />NFS-e</span>
                        <span className={cn("font-medium", m.contagens.nfse > 0 ? "text-violet-600" : "text-slate-400")}>{m.contagens.nfse}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1"><FileText className="w-3 h-3" />NF-e</span>
                        <span className={cn("font-medium", m.contagens.nfe > 0 ? "text-blue-600" : "text-slate-400")}>{m.contagens.nfe}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Landmark className="w-3 h-3" />Extrato</span>
                        <span className={cn("font-medium", m.contagens.extratos > 0 ? "text-green-600" : "text-slate-400")}>{m.contagens.extratos}</span>
                      </div>
                    </div>
                  )}

                  {/* FCSign badge */}
                  {m.envelopeStatus && (
                    <div className={cn("mt-2 text-xs px-2 py-0.5 rounded-full inline-block", envelopeStatusBadge(m.envelopeStatus))}>
                      FCSign: {m.envelopeStatus}
                    </div>
                  )}
                </button>
              ))}
          </div>
        </div>

        {/* Painel lateral de detalhe */}
        {mesSel && mesDados && (
          <aside className="w-80 xl:w-96 border-l border-slate-200 bg-white overflow-y-auto flex-shrink-0">
            <div className="p-5">
              {/* Header painel */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-800 text-base">
                  {mesDados.label} / {ano}
                </h2>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMesSel(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Status atual */}
              <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium mb-4", statusColor(mesDados.status))}>
                {mesDados.status === "assinado" && <CheckCircle2 className="w-4 h-4" />}
                {mesDados.status === "enviado" && <Send className="w-4 h-4" />}
                {mesDados.status === "pendente" && <Clock className="w-4 h-4" />}
                {statusLabel(mesDados.status)}
                {mesDados.enviadoEm && (
                  <span className="ml-auto text-xs font-normal opacity-80">{fmtDate(mesDados.enviadoEm)}</span>
                )}
              </div>

              {/* Checklist de documentos */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Documentos do Mês</p>
                <div className="space-y-2">
                  <DocItem icon={<Receipt className="w-4 h-4 text-violet-500" />}
                    label="NFS-e Emitidas" count={mesDados.contagens.nfse} ok={mesDados.contagens.nfse > 0} />
                  <DocItem icon={<FileText className="w-4 h-4 text-blue-500" />}
                    label="NF-e Recebidas (SEFAZ)" count={mesDados.contagens.nfe} ok={true} />
                  <DocItem icon={<Landmark className="w-4 h-4 text-green-600" />}
                    label="Extrato Bancário" count={mesDados.contagens.extratos} ok={mesDados.contagens.extratos > 0} />
                  <DocItem icon={<ShoppingCart className="w-4 h-4 text-orange-500" />}
                    label="Ordens de Compra" count={mesDados.contagens.ocs} ok={true} />
                </div>
              </div>

              {/* Downloads */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Downloads</p>
                <div className="space-y-2">
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-sm"
                    onClick={handleDownloadPacote}>
                    <Archive className="w-4 h-4 text-indigo-600" />
                    Pacote Contador (ZIP)
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-sm"
                    onClick={handleDownloadXlsx}>
                    <Download className="w-4 h-4 text-green-600" />
                    Planilha Extrato (XLSX)
                  </Button>
                </div>
              </div>

              {/* Ações de envio */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Registro de Envio</p>
                <div className="space-y-2">
                  {mesDados.status === "pendente" && (
                    <Button size="sm" className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => { setObsEnvio(mesDados.observacoes ?? ""); setDlgEnvio(true); }}>
                      <Send className="w-4 h-4" />
                      Registrar Envio
                    </Button>
                  )}
                  {(mesDados.status === "enviado" || mesDados.status === "pendente") && (
                    <Button size="sm" variant="outline" className="w-full gap-2"
                      onClick={() => atualizarMut.mutate({ companyId: companyId!, mes: mesSel, ano, status: "assinado" })}>
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Marcar como Assinado
                    </Button>
                  )}
                  {mesDados.status === "assinado" && (
                    <Button size="sm" variant="outline" className="w-full gap-2 text-slate-500"
                      onClick={() => atualizarMut.mutate({ companyId: companyId!, mes: mesSel, ano, status: "enviado" })}>
                      Reverter para Enviado
                    </Button>
                  )}
                </div>
                {mesDados.enviadoPorNome && (
                  <p className="text-xs text-slate-400 mt-2">
                    Por: {mesDados.enviadoPorNome}
                  </p>
                )}
                {mesDados.observacoes && (
                  <p className="text-xs text-slate-500 mt-1 italic">{mesDados.observacoes}</p>
                )}
              </div>

              {/* FCSign / Lista Mestre */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Lista Mestre (FCSign)
                </p>

                {mesDados.envelopeId ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 border">
                      <PenSquare className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">Envelope #{mesDados.envelopeId}</p>
                        {mesDados.envelopeStatus && (
                          <span className={cn("text-xs px-1.5 py-0.5 rounded-full", envelopeStatusBadge(mesDados.envelopeStatus))}>
                            {mesDados.envelopeStatus}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs"
                        onClick={() => syncEnvMut.mutate({ companyId: companyId!, mes: mesSel, ano })}
                        disabled={syncEnvMut.isPending}>
                        <RefreshCw className={cn("w-3 h-3", syncEnvMut.isPending && "animate-spin")} />
                        Sync
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs"
                        onClick={() => window.open(`/integrasign/${mesDados.envelopeId}`, "_blank")}>
                        <Eye className="w-3 h-3" />
                        Ver
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400">
                      Gere um protocolo digital com assinatura eletrônica de ambas as partes.
                    </p>
                    <Button size="sm" className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                      onClick={() => setDlgFCSign(true)}>
                      <Plus className="w-4 h-4" />
                      Gerar Lista Mestre (FCSign)
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ── Dialog: Registrar Envio ─────────────────────────────────────────── */}
      <Dialog open={dlgEnvio} onOpenChange={setDlgEnvio}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Envio — {mesDados?.label} / {ano}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600">
              Confirma que os documentos abaixo foram enviados ao contador (Pronus)?
            </p>
            <ul className="text-sm text-slate-700 space-y-1 bg-slate-50 rounded-lg p-3">
              {["Pacote Contador (ZIP)", "Planilha Extrato (XLSX)", "NFS-e Emitidas", "NF-e Recebidas", "OCs do Período"].map(a => (
                <li key={a} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" /> {a}
                </li>
              ))}
            </ul>
            <div>
              <Label className="text-sm">Observações (opcional)</Label>
              <Textarea
                value={obsEnvio}
                onChange={e => setObsEnvio(e.target.value)}
                placeholder="Ex.: Enviado por e-mail às 14h para contabil@pronustributario.com.br"
                className="mt-1 text-sm resize-none h-20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgEnvio(false)}>Cancelar</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              onClick={handleRegistrarEnvio} disabled={registrarMut.isPending}>
              <Send className="w-4 h-4" />
              {registrarMut.isPending ? "Salvando…" : "Confirmar Envio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: FCSign / Lista Mestre ──────────────────────────────────── */}
      <Dialog open={dlgFCSign} onOpenChange={setDlgFCSign}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenSquare className="w-5 h-5 text-indigo-600" />
              Gerar Lista Mestre com FCSign
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600">
              Será criado um <strong>protocolo digital</strong> com a lista de documentos do mês{" "}
              <strong>{mesDados?.label}/{ano}</strong> para coleta de assinatura eletrônica das partes.
            </p>

            {/* Signatários */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Signatários</p>
              <div className="space-y-3">
                {fcSignatarios.map((s, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-500 uppercase">
                        {i + 1}. {s.papel === "diretor" ? "FC Engenharia (Responsável)" : "Contador (Pronus)"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-slate-500">Nome</Label>
                        <Input value={s.nome} onChange={e => {
                          const arr = [...fcSignatarios]; arr[i] = { ...arr[i], nome: e.target.value };
                          setFcSignatarios(arr);
                        }} className="h-8 text-sm mt-0.5" placeholder="Nome completo" />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">E-mail</Label>
                        <Input value={s.email} onChange={e => {
                          const arr = [...fcSignatarios]; arr[i] = { ...arr[i], email: e.target.value };
                          setFcSignatarios(arr);
                        }} className="h-8 text-sm mt-0.5" type="email" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview documentos */}
            {mesDados && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-indigo-700 mb-1">Documentos incluídos no protocolo</p>
                <ul className="text-xs text-indigo-800 space-y-0.5">
                  <li>• NFS-e Emitidas: {mesDados.contagens.nfse} notas</li>
                  <li>• NF-e Recebidas: {mesDados.contagens.nfe} notas</li>
                  <li>• Linhas de extrato bancário: {mesDados.contagens.extratos}</li>
                  <li>• Ordens de Compra: {mesDados.contagens.ocs}</li>
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgFCSign(false)}>Cancelar</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
              onClick={handleCriarEnvelope}
              disabled={criarEnvMut.isPending || fcSignatarios.some(s => !s.nome || !s.email)}>
              <PenSquare className="w-4 h-4" />
              {criarEnvMut.isPending ? "Gerando…" : "Gerar Protocolo FCSign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-componente: Item de documento do checklist ────────────────────────────
function DocItem({
  icon, label, count, ok,
}: { icon: React.ReactNode; label: string; count: number; ok: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm",
      ok ? "bg-green-50 border-green-200" : count === 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"
    )}>
      {icon}
      <span className="flex-1 text-slate-700 text-xs">{label}</span>
      <span className={cn(
        "font-semibold text-xs",
        count > 0 ? "text-slate-800" : "text-slate-400"
      )}>{count}</span>
      {ok
        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
        : <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
      }
    </div>
  );
}
