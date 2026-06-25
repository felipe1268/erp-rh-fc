// Rev. 3717 — Módulo Contabilidade: controle mensal/anual de envios ao contador
// Layout: padrão white-card com chips de mês (igual Conciliação Bancária)

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, CheckCircle2, Clock, Send,
  FileText, Download, RefreshCw, Archive,
  Receipt, Landmark, ShoppingCart, PenSquare, Plus, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_FULL  = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                     "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

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

function statusDotColor(s: string) {
  if (s === "assinado") return "bg-green-500";
  if (s === "enviado")  return "bg-blue-500";
  if (s === "pendente") return "bg-amber-400";
  return "bg-gray-300";
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  try { return new Date(s.replace(" ", "T")).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" }); }
  catch { return s; }
}

// ── Painel de detalhe do mês ──────────────────────────────────────────────────
function PainelMes({
  mes, dados, ano, companyId, companyNome,
  onClose, onRefetch,
}: {
  mes: number; dados: MesData | null; ano: number;
  companyId: number; companyNome: string;
  onClose: () => void; onRefetch: () => void;
}) {
  const [dlgEnvio, setDlgEnvio] = useState(false);
  const [dlgFCSign, setDlgFCSign] = useState(false);
  const [obsEnvio, setObsEnvio] = useState("");
  const [fcSignatarios, setFcSignatarios] = useState([
    { papel: "diretor" as const, ordemAssinatura: 1, nome: "", email: "", cargo: "Sócio Administrador", empresaNome: companyNome },
    { papel: "fornecedor" as const, ordemAssinatura: 2, nome: "Pronus Tributário", email: "contabil@pronustributario.com.br", cargo: "Contabilista", empresaNome: "Pronus Tributário" },
  ]);

  const registrarMut = trpc.contabilidade.registrarEnvio.useMutation({
    onSuccess: () => { toast({ title: "Envio registrado!" }); setDlgEnvio(false); setObsEnvio(""); onRefetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const criarEnvMut = trpc.contabilidade.criarEnvelope.useMutation({
    onSuccess: (d) => { toast({ title: "Lista Mestre gerada!", description: `Envelope FCSign #${d.envelopeId}` }); setDlgFCSign(false); onRefetch(); },
    onError: (e) => toast({ title: "Erro ao criar envelope", description: e.message, variant: "destructive" }),
  });

  const syncMut = trpc.contabilidade.syncEnvelope.useMutation({
    onSuccess: (d) => { toast({ title: d.ok ? `Status: ${d.envelopeStatus}` : d.message ?? "OK" }); onRefetch(); },
  });

  const atualizarMut = trpc.contabilidade.atualizarStatus.useMutation({
    onSuccess: () => { toast({ title: "Status atualizado!" }); onRefetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (!dados) return null;

  const mesLabel = MESES_FULL[mes - 1];
  const cont = dados.contagens;

  function handleRegistrar() {
    registrarMut.mutate({
      companyId, mes, ano,
      arquivos: ["Pacote Contador (ZIP)", "Planilha Extrato (XLSX)", "NFS-e Emitidas (HTML)", "NF-e Recebidas (CSV)", "OCs do Período (CSV)"],
      observacoes: obsEnvio || null,
    });
  }

  function handleCriarEnvelope() {
    criarEnvMut.mutate({
      companyId, mes, ano,
      nomeEmpresa: companyNome,
      contagens: cont,
      signatarios: fcSignatarios.filter(s => s.nome && s.email),
    });
  }

  return (
    <div className="mt-4 border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
      {/* Header do painel */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className={cn("w-2.5 h-2.5 rounded-full", statusDotColor(dados.status))} />
          <span className="font-semibold text-slate-800">{mesLabel} / {ano}</span>
          <span className="text-xs text-slate-500 capitalize">— {dados.status}</span>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Checklist de documentos */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Documentos do Mês</p>
          <div className="space-y-1.5">
            {[
              { icon: Receipt,      label: "NFS-e Emitidas",    val: cont.nfse,    color: "text-violet-600" },
              { icon: FileText,     label: "NF-e Recebidas",    val: cont.nfe,     color: "text-blue-600" },
              { icon: Landmark,     label: "Linhas de Extrato", val: cont.extratos, color: "text-green-600" },
              { icon: ShoppingCart, label: "Ordens de Compra",  val: cont.ocs,     color: "text-orange-600" },
            ].map(({ icon: Icon, label, val, color }) => (
              <div key={label} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-50">
                <span className="flex items-center gap-1.5 text-sm text-slate-600">
                  <Icon className="w-3.5 h-3.5 text-slate-400" />
                  {label}
                </span>
                <span className={cn("text-sm font-bold", val > 0 ? color : "text-slate-400")}>{val}</span>
              </div>
            ))}
          </div>

          {dados.enviadoEm && (
            <div className="mt-3 text-xs text-slate-500 bg-green-50 border border-green-100 rounded-lg p-2.5">
              <span className="font-medium text-green-700">Enviado em {fmtDate(dados.enviadoEm)}</span>
              {dados.enviadoPorNome && <> por {dados.enviadoPorNome}</>}
              {dados.observacoes && <p className="mt-1 text-slate-600">{dados.observacoes}</p>}
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ações</p>

          {/* Downloads */}
          <div className="space-y-1.5">
            <Button
              variant="outline" size="sm" className="w-full justify-start gap-2 text-sm"
              onClick={() => window.open(`/api/download/pacote-contador?companyId=${companyId}&mes=${mes}&ano=${ano}`, "_blank")}
              disabled={dados.futuro}
            >
              <Download className="w-4 h-4 text-indigo-600" />
              Baixar Pacote Contador (ZIP)
            </Button>
            <Button
              variant="outline" size="sm" className="w-full justify-start gap-2 text-sm"
              onClick={() => window.open(`/api/download/contabilidade-xlsx?companyId=${companyId}&mes=${mes}&ano=${ano}`, "_blank")}
              disabled={dados.futuro}
            >
              <Download className="w-4 h-4 text-green-600" />
              Planilha Extrato Bancário (XLSX)
            </Button>
          </div>

          <Separator />

          {/* Registrar envio */}
          <Button
            size="sm" className="w-full justify-start gap-2 text-sm bg-blue-600 hover:bg-blue-700"
            onClick={() => setDlgEnvio(true)}
            disabled={dados.futuro}
          >
            <Send className="w-4 h-4" />
            {dados.status === "pendente" ? "Registrar Envio ao Contador" : "Atualizar Registro de Envio"}
          </Button>

          {/* FCSign */}
          <Button
            size="sm" variant="outline" className="w-full justify-start gap-2 text-sm border-violet-300 text-violet-700 hover:bg-violet-50"
            onClick={() => setDlgFCSign(true)}
            disabled={dados.futuro}
          >
            <Plus className="w-4 h-4" />
            {dados.envelopeId ? "Novo Envelope FCSign" : "Gerar Lista Mestre (FCSign)"}
          </Button>

          {dados.envelopeId && (
            <Button
              size="sm" variant="ghost" className="w-full justify-start gap-2 text-sm text-slate-600"
              onClick={() => syncMut.mutate({ companyId, mes, ano })}
              disabled={syncMut.isPending}
            >
              <RefreshCw className={cn("w-4 h-4", syncMut.isPending && "animate-spin")} />
              Sincronizar status do envelope
              {dados.envelopeStatus && <span className="ml-auto text-xs text-slate-400">{dados.envelopeStatus}</span>}
            </Button>
          )}

          {/* Alterar status manual */}
          {!dados.futuro && (
            <div className="flex gap-1.5 flex-wrap pt-1">
              {(["pendente","enviado","assinado"] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  disabled={dados.status === s || atualizarMut.isPending}
                  onClick={() => atualizarMut.mutate({ companyId, mes, ano, status: s })}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs font-medium border transition-all",
                    dados.status === s
                      ? "bg-slate-100 text-slate-400 border-slate-200 cursor-default"
                      : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"
                  )}
                >
                  {s === "pendente" ? "Pendente" : s === "enviado" ? "Enviado" : "Assinado"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dialog: Registrar Envio */}
      <Dialog open={dlgEnvio} onOpenChange={setDlgEnvio}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Envio — {mesLabel} / {ano}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-600">
              Confirma o envio dos documentos abaixo ao contador (Pronus Tributário)?
            </p>
            <ul className="text-sm text-slate-700 space-y-0.5 pl-4 list-disc">
              <li>{cont.nfse} NFS-e emitidas</li>
              <li>{cont.nfe} NF-e recebidas</li>
              <li>{cont.extratos} linhas de extrato bancário</li>
              <li>{cont.ocs} ordens de compra</li>
            </ul>
            <div>
              <Label>Observações (opcional)</Label>
              <Textarea value={obsEnvio} onChange={e => setObsEnvio(e.target.value)} rows={3} placeholder="Alguma observação sobre este envio…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgEnvio(false)}>Cancelar</Button>
            <Button onClick={handleRegistrar} disabled={registrarMut.isPending}>
              {registrarMut.isPending ? "Salvando…" : "Confirmar Envio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: FCSign */}
      <Dialog open={dlgFCSign} onOpenChange={setDlgFCSign}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Lista Mestre FCSign — {mesLabel} / {ano}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600">Gera um protocolo de entrega digital com assinatura eletrônica das partes.</p>
            <div className="space-y-3">
              {fcSignatarios.map((s, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase">{i === 0 ? "Signatário 1 — FC Engenharia" : "Signatário 2 — Contabilidade"}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Nome</Label>
                      <Input value={s.nome} onChange={e => setFcSignatarios(arr => arr.map((x,j) => j===i ? {...x,nome:e.target.value} : x))} placeholder="Nome completo" className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">E-mail</Label>
                      <Input type="email" value={s.email} onChange={e => setFcSignatarios(arr => arr.map((x,j) => j===i ? {...x,email:e.target.value} : x))} placeholder="email@exemplo.com" className="h-8 text-sm" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgFCSign(false)}>Cancelar</Button>
            <Button
              onClick={handleCriarEnvelope}
              disabled={criarEnvMut.isPending || fcSignatarios.filter(s => s.nome && s.email).length < 1}
            >
              {criarEnvMut.isPending ? "Gerando…" : "Gerar Envelope"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function FinanceiroContabilidade() {
  const { companyId, company } = useCompany();
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mesSel, setMesSel] = useState<number | null>(null);

  const anoQuery = trpc.contabilidade.getAno.useQuery(
    { companyId: companyId!, ano },
    { enabled: !!companyId, staleTime: 30_000 }
  );

  const meses: MesData[] = anoQuery.data ?? [];
  const mesDados = mesSel ? meses.find(m => m.mes === mesSel) ?? null : null;

  const kpis = useMemo(() => ({
    assinados: meses.filter(m => m.status === "assinado").length,
    enviados:  meses.filter(m => m.status === "enviado").length,
    pendentes: meses.filter(m => m.status === "pendente" && !m.futuro).length,
  }), [meses]);

  return (
    <DashboardLayout>
    <div className="flex flex-col gap-4 p-4 md:p-6 bg-gray-50 min-h-full">

      {/* ── Cabeçalho padrão ───────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Archive className="w-5 h-5 text-indigo-600" />
              Contabilidade — Controle de Envios
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Registre e acompanhe os documentos enviados ao contador mês a mês
            </p>
          </div>
          {anoQuery.isFetching && (
            <span className="flex items-center gap-1 text-xs text-gray-400 mt-1">
              <RefreshCw className="w-3 h-3 animate-spin" /> Atualizando…
            </span>
          )}
        </div>

        {/* KPIs rápidos */}
        <div className="flex flex-wrap gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
            Assinados: <strong className="text-green-700">{kpis.assinados}</strong>
          </span>
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
            Enviados: <strong className="text-blue-700">{kpis.enviados}</strong>
          </span>
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            Pendentes: <strong className="text-amber-700">{kpis.pendentes}</strong>
          </span>
        </div>
      </div>

      {/* ── Seletor de período — padrão white-card ──────────────────────────── */}
      <Card className="border border-gray-200 shadow-sm">
        <CardContent className="p-4">
          {/* Linha 1: Ano + legenda */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setAno(a => a - 1); setMesSel(null); }}
                className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
              <button type="button" onClick={() => { setAno(a => a + 1); setMesSel(null); }}
                disabled={ano >= anoAtual + 1}
                className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Assinado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Enviado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Pendente</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Futuro</span>
            </div>
          </div>

          {/* Linha 2: 12 chips de mês */}
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
            {anoQuery.isLoading
              ? Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
                ))
              : anoQuery.error
              ? <p className="col-span-12 text-sm text-red-500 py-2">Erro ao carregar dados: {anoQuery.error.message}</p>
              : MESES_ABREV.map((abrev, i) => {
                  const num = i + 1;
                  const d = meses.find(m => m.mes === num);
                  const s = d?.status ?? "futuro";
                  const isSelected = mesSel === num;
                  return (
                    <button
                      key={abrev}
                      type="button"
                      onClick={() => setMesSel(isSelected ? null : num)}
                      className={cn(
                        "flex flex-col items-center gap-0.5 py-2 rounded-lg border text-xs font-medium transition-all",
                        isSelected
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      )}
                    >
                      <span>{abrev}</span>
                      <span className={cn("w-1.5 h-1.5 rounded-full", statusDotColor(s))} />
                    </button>
                  );
                })
            }
          </div>
        </CardContent>
      </Card>

      {/* ── Painel de detalhe do mês selecionado ───────────────────────────── */}
      {mesSel !== null && (
        <PainelMes
          mes={mesSel}
          dados={mesDados}
          ano={ano}
          companyId={companyId!}
          companyNome={company?.nome ?? "FC Engenharia"}
          onClose={() => setMesSel(null)}
          onRefetch={() => anoQuery.refetch()}
        />
      )}

      {/* ── Estado vazio (nenhum mês selecionado) ──────────────────────────── */}
      {mesSel === null && !anoQuery.isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Archive className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">Selecione um mês para ver os documentos e registrar o envio ao contador.</p>
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}
