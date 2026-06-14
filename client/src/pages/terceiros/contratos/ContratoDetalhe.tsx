import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { naturezaInfo, NATUREZA_CONTRATO } from "@shared/terceiroNatureza";
import FluxogramaPagamento from "./FluxogramaPagamento";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Plus, FileCheck, AlertTriangle, CheckCircle,
  ChevronRight, ChevronDown, Building2, Calendar, DollarSign, FileText,
  Zap, ClipboardCheck, X, TrendingUp, TrendingDown, Minus,
  FileEdit, Save, Clock, RefreshCw, History, ExternalLink, Trash2, Pencil, FolderOpen,
  Eye, EyeOff, BarChart3, Loader2, FileDown, Settings, Undo2, Send, MapPin, Truck, Ban, Info, Lock, Download, ShieldCheck
} from "lucide-react";
import { gerarContratoAssinadoPdf } from "@/lib/contratoAssinadoPdf";
import { toast } from "sonner";
import { formatNumeroOcDisplay } from "@shared/numeroOc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const BRL = (v: any) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

function papelLabelContrato(p: string) {
  const m: Record<string, string> = {
    fornecedor: "Fornecedor / Contratada",
    gestor_projeto: "Gestor do Projeto",
    financeiro: "Financeiro",
    diretor: "Diretor",
    testemunha: "Testemunha",
  };
  return m[p] || p;
}
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

// ── Helpers de período de medição (respeitam o "Dia da Medição" do contrato) ──
// Soma N dias a uma data ISO "YYYY-MM-DD" via UTC (sem bug de fuso iOS).
const addDaysISO = (s: string, n: number): string => {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
// Data de corte da medição = "Dia da Medição" do mês (mês 1-based),
// clampado ao último dia do mês (ex.: dia 31 em fevereiro → 28/29).
const cutoffMedicaoISO = (diaMedicao: number, year: number, month1: number): string => {
  const ultimoDia = new Date(year, month1, 0).getDate();
  const d = Math.min(Math.max(diaMedicao || 25, 1), ultimoDia);
  return `${year}-${String(month1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
// Próximo corte (no dia da medição) em ou após a data de início informada.
const cutoffOnOrAfterISO = (diaMedicao: number, inicioISO: string): string => {
  let y = Number(inicioISO.slice(0, 4));
  let m = Number(inicioISO.slice(5, 7));
  let corte = cutoffMedicaoISO(diaMedicao, y, m);
  if (corte < inicioISO) {
    m += 1; if (m > 12) { m = 1; y += 1; }
    corte = cutoffMedicaoISO(diaMedicao, y, m);
  }
  return corte;
};

const STATUS_MEDICAO: Record<string, { label: string; cls: string }> = {
  rascunho:           { label: "Rascunho",            cls: "bg-gray-100 text-gray-600 border-gray-200" },
  aguardando_aprovacao:{ label: "Aguard. Aprovação",  cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  aprovada:           { label: "Aprovada",             cls: "bg-green-100 text-green-800 border-green-200" },
  paga:               { label: "Paga",                 cls: "bg-blue-100 text-blue-800 border-blue-200" },
  rejeitada:          { label: "Rejeitada",            cls: "bg-red-100 text-red-800 border-red-200" },
};

const STATUS_DOC: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "bg-red-100 text-red-700 border-red-200" },
  enviado:  { label: "Enviado",  cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  aprovado: { label: "Aprovado", cls: "bg-green-100 text-green-700 border-green-200" },
  vencido:  { label: "Vencido",  cls: "bg-orange-100 text-orange-700 border-orange-200" },
};

type Tab = "itens" | "medicoes" | "comparativo" | "documentos" | "documento" | "fd";

export default function ContratoDetalheWrapper() {
  const [, params] = useRoute("/terceiros/contratos/:id");
  const id = parseInt(params?.id || "0");
  return <ContratoDetalheInner key={id} routeId={id} />;
}

function ContratoDetalheInner({ routeId }: { routeId: number }) {
  const [, navigate] = useLocation();
  const id = routeId;
  const urlParams = new URLSearchParams(window.location.search);
  const medicaoIdFromUrl = urlParams.get("medicao") ? parseInt(urlParams.get("medicao")!) : null;
  const tabFromUrl = urlParams.get("tab") as Tab | null;
  const validTabs: Tab[] = ["itens", "medicoes", "comparativo", "documentos", "documento", "fd"];
  const [tab, setTab] = useState<Tab>(
    tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl
    : medicaoIdFromUrl ? "medicoes"
    : "documento"
  );
  const [showGerarMedicao, setShowGerarMedicao] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [editingDates, setEditingDates] = useState(false);
  const [editDI, setEditDI] = useState("");
  const [editDT, setEditDT] = useState("");
  const [editingCriterios, setEditingCriterios] = useState(false);
  const [critForm, setCritForm] = useState({ diaMedicao: 25, diaPagamento: 10, prazoAprovacaoDias: 5, prazoEmissaoNf: 3, prazoLiberacaoOp: 5, documentacaoNecessaria: "" });
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7));
  const [medicaoDataInicio, setMedicaoDataInicio] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [medicaoDataFim, setMedicaoDataFim] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const [newDoc, setNewDoc] = useState({ tipo: "INSS", descricao: "", competencia: "", dataVencimento: "", bloqueiaPagemento: false });
  const [editMedicao, setEditMedicao] = useState<{ id: number; periodo: string; dataReferencia: string; observacoes: string; status: string } | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [editingNatureza, setEditingNatureza] = useState(false);
  const [editingObjeto, setEditingObjeto] = useState(false);
  const [editObjetoValue, setEditObjetoValue] = useState("");

  // Documento tab state
  const [textoEditado, setTextoEditado] = useState<string | null>(null);
  const [obsRevisao, setObsRevisao] = useState("");
  const [showRevisoes, setShowRevisoes] = useState(false);
  const [showObsModal, setShowObsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [editingDocDate, setEditingDocDate] = useState<"inicio" | "termino" | null>(null);
  const [editDocDateValue, setEditDocDateValue] = useState("");

  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const [showCancelContrato, setShowCancelContrato] = useState(false);
  const [showExcluirContrato, setShowExcluirContrato] = useState(false);
  const [contratoMotivo, setContratoMotivo] = useState("");
  const [contratoSenha, setContratoSenha] = useState("");

  const utils = trpc.useUtils();
  const { data: contrato, isLoading } = trpc.terceiroContratos.getContrato.useQuery(
    { id },
    {
      enabled: id > 0,
      // Rev. 3064 — o status de assinatura muda FORA-DE-BANDA (os signatários assinam por link
      // público em outra sessão), então re-busca ao focar a janela p/ o dono ver a conclusão e o
      // gate de Medições liberar SEM precisar de hard-refresh.
      refetchOnWindowFocus: true,
    },
  );

  // Ao abrir o modal da 1ª medição, semeia o período conforme os critérios do contrato
  // (Dia da Medição): fim = corte do mês corrente; início = dia seguinte ao corte do mês anterior.
  // Sem isso, o padrão caía em "1º → último dia do mês", divergindo do contrato. Editável.
  useEffect(() => {
    if (!showGerarMedicao || !contrato) return;
    if ((contrato.medicoes?.length || 0) > 0) return; // medições seguintes são calculadas, não vêm do state
    const diaMed = (contrato as any).diaMedicao ?? 25;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1; // 1-based
    const fim = cutoffMedicaoISO(diaMed, y, m);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    const inicio = addDaysISO(cutoffMedicaoISO(diaMed, py, pm), 1);
    setMedicaoDataInicio(inicio);
    setMedicaoDataFim(fim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGerarMedicao]);

  const recalcularDatasMut = trpc.terceiroContratos.recalcularDatasCronograma.useMutation({
    onSuccess: (r) => { toast.success(`Datas atualizadas do cronograma${r.usouEap ? " (via EAP)" : " (todas atividades)"}: ${fmtDate(r.dataInicio)} → ${fmtDate(r.dataTermino)}`); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const atualizarContratoMut = trpc.terceiroContratos.atualizarContrato.useMutation({
    onSuccess: () => { toast.success("Contrato atualizado!"); utils.terceiroContratos.getContrato.invalidate({ id }); setEditingDates(false); setEditingCriterios(false); setEditingDocDate(null); setEditingNatureza(false); setEditingObjeto(false); },
    onError: (e) => toast.error(e.message),
  });

  const excluirMedicaoMut = trpc.terceiroContratos.excluirMedicao.useMutation({
    onSuccess: () => { toast.success("Medição excluída"); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const cancelarContratoMut = trpc.terceiroContratos.cancelarContratoMaster.useMutation({
    onSuccess: (res: any) => {
      const partes: string[] = [];
      if (res?.medicoesCanceladas) partes.push(`${res.medicoesCanceladas} medição(ões)`);
      if (res?.ocsCanceladas) partes.push(`${res.ocsCanceladas} OC(s)`);
      if (res?.financeirosCancelados) partes.push(`${res.financeirosCancelados} lançamento(s) não pago(s)`);
      toast.success(`Contrato cancelado${partes.length ? " — também: " + partes.join(", ") : ""}.`);
      utils.terceiroContratos.getContrato.invalidate({ id });
      setShowCancelContrato(false); setContratoMotivo(""); setContratoSenha("");
    },
    onError: (e) => toast.error(e.message),
  });

  const excluirContratoMut = trpc.terceiroContratos.excluirContrato.useMutation({
    onSuccess: () => {
      toast.success("Contrato excluído definitivamente.");
      setShowExcluirContrato(false); setContratoMotivo(""); setContratoSenha("");
      navigate("/terceiros/contratos");
    },
    onError: (e) => toast.error(e.message),
  });

  const editarMedicaoMut = trpc.terceiroContratos.editarMedicao.useMutation({
    onSuccess: () => { toast.success("Medição atualizada"); setEditMedicao(null); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const removerItemMut = trpc.terceiroContratos.removerItem.useMutation({
    onSuccess: () => { toast.success("Item removido"); utils.terceiroContratos.getContrato.invalidate({ id }); },
  });

  const relinkEapMut = trpc.terceiroContratos.relinkEapItens.useMutation({
    onSuccess: (data) => { toast.success(data.msg); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const gerarMedicaoMut = trpc.terceiroContratos.gerarMedicao.useMutation({
    onSuccess: (data) => {
      if (data.itensNaoVinculados && data.itensNaoVinculados.length > 0) {
        toast.warning(`Medição gerada, mas ${data.itensNaoVinculados.length} item(ns) sem vínculo ao cronograma (avanço = 0%): ${data.itensNaoVinculados.slice(0, 3).join(", ")}${data.itensNaoVinculados.length > 3 ? "..." : ""}`, { duration: 8000 });
      } else {
        toast.success("Medição gerada com base no avanço físico!");
      }
      setShowGerarMedicao(false); setTab("medicoes"); utils.terceiroContratos.getContrato.invalidate({ id });
    },
    onError: (e) => toast.error(e.message),
  });

  const aprovarMut = trpc.terceiroContratos.aprovarMedicao.useMutation({
    onSuccess: () => { toast.success("Medição aprovada!"); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const rejeitarMut = trpc.terceiroContratos.rejeitarMedicao.useMutation({
    onSuccess: () => { toast.success("Medição rejeitada"); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const cancelarAprovacaoMut = trpc.terceiroContratos.cancelarAprovacao.useMutation({
    onSuccess: () => { toast.success("Aprovação cancelada — medição voltou para aguardando aprovação"); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const recalcularMut = trpc.terceiroContratos.recalcularMedicao.useMutation({
    onSuccess: (data) => { toast.success(`Medição recalculada! Valor medido: R$ ${Number(data.valorMedido).toFixed(2)} (${Number(data.percentualGlobal).toFixed(1)}%)`); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const editarMedicaoItemMut = trpc.terceiroContratos.editarMedicaoItem.useMutation({
    onSuccess: () => { utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const removerMedicaoItemMut = trpc.terceiroContratos.removerMedicaoItem.useMutation({
    onSuccess: (data) => { toast.success(`Item removido (${data.restantes} restantes)`); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const criarDocMut = trpc.terceiroContratos.criarDocumento.useMutation({
    onSuccess: () => { toast.success("Documento criado!"); setShowAddDoc(false); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const atualizarDocMut = trpc.terceiroContratos.atualizarDocumento.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); utils.terceiroContratos.getContrato.invalidate({ id }); },
  });

  const gerarTextoMut = trpc.terceiroContratos.gerarTextoContrato.useMutation({
    onSuccess: (r) => { toast.success(`Contrato gerado — v${r.versao}`); setTextoEditado(r.texto); utils.terceiroContratos.getContrato.invalidate({ id }); utils.terceiroContratos.listarRevisoes.invalidate({ contratoId: id }); },
    onError: (e) => toast.error(e.message),
  });

  const salvarTextoMut = trpc.terceiroContratos.salvarTextoContrato.useMutation({
    onSuccess: (r) => { toast.success(`Contrato salvo — v${r.versao}`); setShowObsModal(false); setObsRevisao(""); setTextoEditado(null); utils.terceiroContratos.getContrato.invalidate({ id }); utils.terceiroContratos.listarRevisoes.invalidate({ contratoId: id }); },
    onError: (e) => toast.error(e.message),
  });

  const [showFcSignModal, setShowFcSignModal] = useState(false);
  const [fcSignSignatarios, setFcSignSignatarios] = useState([
    { papel: "fornecedor" as const, ordemAssinatura: 1, nome: "", email: "", cpfCnpj: "", cargo: "Representante Legal", empresaNome: "" },
    { papel: "gestor_projeto" as const, ordemAssinatura: 2, nome: "", email: "", cpfCnpj: "", cargo: "Gestor de Projeto", empresaNome: "FC Engenharia" },
  ]);

  const criarEnvelopeMut = trpc.integrasign.criarEnvelope.useMutation({
    onSuccess: (r) => { toast.success("Envelope criado no FcSign!"); setShowFcSignModal(false); navigate(`/integrasign?envelope=${r.id}`); },
    onError: (e) => toast.error(e.message),
  });

  const restaurarMut = trpc.terceiroContratos.restaurarRevisao.useMutation({
    onSuccess: (r) => { toast.success(`Revisão restaurada — v${r.versao}`); setTextoEditado(null); utils.terceiroContratos.getContrato.invalidate({ id }); utils.terceiroContratos.listarRevisoes.invalidate({ contratoId: id }); },
    onError: (e) => toast.error(e.message),
  });

  const { data: revisoes = [] } = trpc.terceiroContratos.listarRevisoes.useQuery(
    { contratoId: id },
    { enabled: tab === "documento" && id > 0 }
  );

  const contratoAssinado = (contrato as any)?.assinaturaStatus === "concluido";
  const { data: pdfAssinadoData, isFetching: isFetchingPdfAssinado } =
    trpc.integrasign.getContratoAssinadoPdfData.useQuery(
      { companyId: (contrato as any)?.companyId, contratoTerceiroId: id },
      { enabled: tab === "documento" && id > 0 && contratoAssinado && !!(contrato as any)?.companyId },
    );

  const textoAtual = textoEditado ?? contrato?.textoContrato ?? null;

  // Rev. 3065 — o módulo Terceiros é SÓ visualizar/assinar/baixar (o template é editado em
  // Configurações › Contrato Terceiros). Quando o contrato ainda não tem texto e não está
  // assinado, gera-se o documento automaticamente a partir do template — sem botão "Gerar".
  const autoGerarTentadoRef = useRef(false);
  useEffect(() => {
    if (
      tab === "documento" &&
      id > 0 &&
      !!contrato &&
      !contratoAssinado &&
      !(contrato as any)?.textoContrato &&
      !autoGerarTentadoRef.current &&
      !gerarTextoMut.isPending
    ) {
      autoGerarTentadoRef.current = true;
      gerarTextoMut.mutate({ contratoId: id });
    }
  }, [tab, id, contrato, contratoAssinado, gerarTextoMut]);

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center h-64 text-gray-400">Carregando...</div></DashboardLayout>;
  if (!contrato) return <DashboardLayout><div className="p-8 text-center text-gray-400">Contrato não encontrado</div></DashboardLayout>;

  const pct = contrato.percentualMedidoGlobal || 0;
  const pctPago = Number(contrato.valorTotal) > 0 ? (Number(contrato.valorPago) / Number(contrato.valorTotal)) * 100 : 0;
  const valOrc = Number(contrato.valorOrcamento ?? 0);
  const valFec = Number(contrato.valorTotal ?? 0);
  const variacao = valFec - valOrc;
  const variacaoPct = valOrc > 0 ? (variacao / valOrc) * 100 : 0;
  const showVariacao = valOrc > 0;

  return (
    <DashboardLayout>
      <div className="p-5 space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start gap-3">
          <button onClick={() => navigate("/terceiros/contratos")} className="p-2 hover:bg-gray-100 rounded-lg mt-0.5 shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {contrato.numeroContrato && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">{contrato.numeroContrato}</span>}
              <Badge className={`text-xs border ${STATUS_MEDICAO[contrato.status || "ativo"]?.cls || ""}`}>{contrato.status}</Badge>
              {editingNatureza ? (
                <Select
                  value={(contrato as any).naturezaContrato || "mao_de_obra"}
                  onValueChange={(v) => atualizarContratoMut.mutate({ id, companyId: contrato.companyId, naturezaContrato: v as any })}
                >
                  <SelectTrigger className="h-7 text-xs w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(NATUREZA_CONTRATO).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                (() => {
                  const nt = naturezaInfo((contrato as any).naturezaContrato);
                  return (
                    <button onClick={() => setEditingNatureza(true)} title="Clique para alterar a natureza do contrato">
                      <Badge className={`text-xs border cursor-pointer hover:opacity-80 ${nt.cls}`}>
                        {nt.label}<Pencil className="w-2.5 h-2.5 ml-1" />
                      </Badge>
                    </button>
                  );
                })()
              )}
              {contrato.docsComPendencia > 0 && (
                <Badge className="text-xs border bg-red-100 text-red-700 border-red-200">
                  <AlertTriangle className="w-3 h-3 mr-1" />{contrato.docsComPendencia} doc(s) pendente(s)
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-x-4 gap-y-1 text-sm text-gray-700 flex-wrap">
              <span className="flex items-center gap-1.5 font-semibold">
                <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                {contrato.empresa?.nomeFantasia || contrato.empresa?.razaoSocial || "—"}
              </span>
              {contrato.obraNome && (
                <span className="flex items-center gap-1 text-gray-500">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" /> {contrato.obraNome}
                </span>
              )}
            </div>
          </div>
          {(contrato as any).assinaturaStatus === "concluido" ? (
            <Button onClick={() => setShowGerarMedicao(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 shrink-0">
              <Zap className="w-4 h-4" /> Gerar Medição
            </Button>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              {(contrato as any).assinaturaStatus ? (
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Assinatura {(contrato as any).assinaturaStatus === "em_andamento" ? "em andamento" : (contrato as any).assinaturaStatus === "rascunho" ? "pendente de envio" : (contrato as any).assinaturaStatus}
                </span>
              ) : (
                <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  Envie para assinatura antes de gerar medições
                </span>
              )}
            </div>
          )}
        </div>

        {/* Ações de Admin Master — cancelamento (soft) e exclusão definitiva (hard) */}
        {isMaster && (
          <div className="flex items-center gap-2 flex-wrap rounded-xl border border-red-200 bg-red-50/40 px-3 py-2">
            <span className="text-[10px] uppercase font-semibold tracking-wide text-red-600 flex items-center gap-1 mr-1">
              <Ban className="w-3.5 h-3.5" /> Admin Master
            </span>
            {contrato.status !== "cancelado" && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5 border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => { setContratoMotivo(""); setContratoSenha(""); setShowCancelContrato(true); }}
              >
                <Ban className="w-3.5 h-3.5" /> Cancelar contrato
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 border-red-400 text-red-800 hover:bg-red-100"
              onClick={() => { setContratoMotivo(""); setContratoSenha(""); setShowExcluirContrato(true); }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Excluir definitivamente
            </Button>
          </div>
        )}

        {/* Objeto do Contrato — escopo resumido e legível, editável p/ padronização */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Objeto do Contrato</p>
            {!editingObjeto && (
              <button
                onClick={() => { setEditObjetoValue(contrato.descricao || ""); setEditingObjeto(true); }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
              >
                <Pencil className="w-3 h-3" /> Editar
              </button>
            )}
          </div>
          {editingObjeto ? (
            <div className="space-y-2">
              <Textarea
                value={editObjetoValue}
                onChange={(e) => setEditObjetoValue(e.target.value.slice(0, 500))}
                rows={3}
                maxLength={500}
                placeholder="Descreva o objeto do contrato (ex.: Forro de Gesso)…"
                className="text-sm"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">{editObjetoValue.length}/500</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditingObjeto(false)}>Cancelar</Button>
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={atualizarContratoMut.isPending || !editObjetoValue.trim()}
                    onClick={() => atualizarContratoMut.mutate({ id, companyId: contrato.companyId, descricao: editObjetoValue.trim() })}
                  >
                    <Save className="w-3.5 h-3.5 mr-1" /> Salvar
                  </Button>
                </div>
              </div>
            </div>
          ) : contrato.descricao ? (
            <>
              <p className={`text-sm text-gray-700 leading-relaxed whitespace-pre-line ${descExpanded ? "" : "line-clamp-2"}`}>
                {contrato.descricao}
              </p>
              {(contrato.descricao.length > 130) && (
                <button
                  onClick={() => setDescExpanded(v => !v)}
                  className="mt-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {descExpanded ? "Ver menos" : "Ver mais"}
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 italic">Sem objeto definido. Clique em "Editar" para padronizar.</p>
          )}
        </div>

        {/* Vigência do Contrato — destaque */}
        {(() => {
          const ini = contrato.dataInicio;
          const fim = contrato.dataTermino;
          const diasVigencia = ini && fim ? Math.ceil((new Date(fim + "T00:00:00").getTime() - new Date(ini + "T00:00:00").getTime()) / 86400000) : null;
          const hoje = new Date();
          const diasRestantes = fim ? Math.ceil((new Date(fim + "T00:00:00").getTime() - hoje.getTime()) / 86400000) : null;
          const pctDecorrido = ini && fim && diasVigencia && diasVigencia > 0
            ? Math.min(100, Math.max(0, ((Date.now() - new Date(ini + "T00:00:00").getTime()) / (diasVigencia * 86400000)) * 100))
            : 0;
          const corBorda = diasRestantes !== null && diasRestantes <= 15 ? "border-red-300 bg-red-50" : diasRestantes !== null && diasRestantes <= 30 ? "border-amber-300 bg-amber-50" : "border-blue-200 bg-blue-50";
          const corBarra = diasRestantes !== null && diasRestantes <= 15 ? "bg-red-500" : diasRestantes !== null && diasRestantes <= 30 ? "bg-amber-500" : "bg-blue-500";
          return (
            <div className={`rounded-xl border-2 p-4 ${corBorda}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Vigência do Contrato</span>
                </div>
                <div className="flex items-center gap-2">
                  {!editingDates && (
                    <button
                      onClick={() => { setEditDI(ini || ""); setEditDT(fim || ""); setEditingDates(true); }}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 hover:underline"
                    >
                      <Pencil className="w-3 h-3" /> Editar Datas
                    </button>
                  )}
                  <button
                    onClick={() => recalcularDatasMut.mutate({ contratoId: id, companyId: contrato.companyId })}
                    disabled={recalcularDatasMut.isPending}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
                    title="Recalcular datas a partir do cronograma"
                  >
                    <RefreshCw className={`w-3 h-3 ${recalcularDatasMut.isPending ? "animate-spin" : ""}`} />
                    {recalcularDatasMut.isPending ? "Calculando..." : "Atualizar do Cronograma"}
                  </button>
                </div>
              </div>
              {editingDates ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-gray-600">Data de Início (Elaboração)</Label>
                      <Input type="date" className="mt-1 text-sm" value={editDI} onChange={e => setEditDI(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600">Data de Término (Última data do cronograma)</Label>
                      <Input type="date" className="mt-1 text-sm" value={editDT} onChange={e => setEditDT(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingDates(false)}><X className="w-3 h-3 mr-1" /> Cancelar</Button>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={atualizarContratoMut.isPending}
                      onClick={() => atualizarContratoMut.mutate({ id, companyId: contrato.companyId, dataInicio: editDI || undefined, dataTermino: editDT || undefined })}>
                      <Save className="w-3 h-3 mr-1" /> Salvar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-[10px] text-gray-500 uppercase font-medium">Início</p>
                      <p className="text-lg font-bold text-gray-900">{ini ? fmtDate(ini) : "—"}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-500 uppercase font-medium">Término</p>
                      <p className="text-lg font-bold text-gray-900">{fim ? fmtDate(fim) : "—"}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-500 uppercase font-medium">Duração</p>
                      <p className="text-lg font-bold text-gray-900">{diasVigencia !== null ? `${diasVigencia} dias` : "—"}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-500 uppercase font-medium">Restam</p>
                      <p className={`text-lg font-bold ${diasRestantes !== null && diasRestantes <= 15 ? "text-red-600" : diasRestantes !== null && diasRestantes <= 30 ? "text-amber-600" : "text-blue-700"}`}>
                        {diasRestantes !== null ? (diasRestantes <= 0 ? "Encerrado" : `${diasRestantes} dias`) : "—"}
                      </p>
                    </div>
                  </div>
                  {ini && fim && diasVigencia && diasVigencia > 0 && (
                    <div className="mt-3">
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${corBarra}`} style={{ width: `${pctDecorrido}%` }} />
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1 text-right">{pctDecorrido.toFixed(0)}% decorrido</p>
                    </div>
                  )}
                  {(contrato as any).cronogramaRevisaoInfo && (
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100">
                      <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span>
                        Revisão do cronograma considerada:{" "}
                        <span className="font-semibold text-gray-700">
                          {(contrato as any).cronogramaRevisaoInfo.isBaseline ? "Baseline " : ""}
                          (Rev {String((contrato as any).cronogramaRevisaoInfo.numero).padStart(2, "0")})
                        </span>
                        {(contrato as any).cronogramaRevisaoInfo.descricao && (
                          <span className="text-gray-400"> — {(contrato as any).cronogramaRevisaoInfo.descricao}</span>
                        )}
                        <span className="ml-2 text-gray-400">
                          Data: {fmtDate((contrato as any).cronogramaRevisaoInfo.dataRevisao)}
                        </span>
                      </span>
                      <Badge className="text-[9px] bg-green-50 text-green-600 border-green-200 ml-auto">
                        {(contrato as any).cronogramaRevisaoInfo.status}
                      </Badge>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* Critérios de Medição e Pagamento */}
        {(() => {
          const dm = (contrato as any).diaMedicao ?? 25;
          const dp = (contrato as any).diaPagamento ?? 10;
          const pa = (contrato as any).prazoAprovacaoDias ?? 5;
          const pnf = (contrato as any).prazoEmissaoNf ?? 3;
          const plop = (contrato as any).prazoLiberacaoOp ?? 5;
          const docNec = (contrato as any).documentacaoNecessaria || "";

          const etapas = [
            { num: 1, titulo: "Medição Física", desc: `Dia ${dm} de cada mês — levantamento e conferência do avanço físico`, icon: "📏", cor: "bg-blue-500" },
            { num: 2, titulo: "Aprovação da Medição", desc: `Até ${pa} dias úteis após medição — aprovação pelo gestor do contrato`, icon: "✅", cor: "bg-green-500" },
            { num: 3, titulo: "Documentação", desc: docNec || "Envio de NF, certidões e documentação comprobatória", icon: "📄", cor: "bg-amber-500" },
            { num: 4, titulo: "Emissão da NF", desc: `Até ${pnf} dias úteis após aprovação — liberação para emissão da nota fiscal`, icon: "🧾", cor: "bg-purple-500" },
            { num: 5, titulo: "Liberação da OP", desc: `Até ${plop} dias úteis após NF — liberação da Ordem de Pagamento`, icon: "💰", cor: "bg-emerald-500" },
            { num: 6, titulo: "Pagamento", desc: `Dia ${dp} do mês subsequente — crédito em conta`, icon: "🏦", cor: "bg-indigo-500" },
          ];

          return (
            <div className="rounded-xl border-2 border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Critérios de Medição e Pagamento</span>
                </div>
                {!editingCriterios && (
                  <button
                    onClick={() => {
                      setCritForm({ diaMedicao: dm, diaPagamento: dp, prazoAprovacaoDias: pa, prazoEmissaoNf: pnf, prazoLiberacaoOp: plop, documentacaoNecessaria: docNec });
                      setEditingCriterios(true);
                    }}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 hover:underline"
                  >
                    <Settings className="w-3 h-3" /> Configurar
                  </button>
                )}
              </div>

              {editingCriterios ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-gray-600">Dia da Medição (do mês)</Label>
                      <Input type="number" min={1} max={31} className="mt-1 text-sm" value={critForm.diaMedicao} onChange={e => setCritForm(f => ({ ...f, diaMedicao: parseInt(e.target.value) || 25 }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600">Prazo Aprovação (dias úteis)</Label>
                      <Input type="number" min={1} max={30} className="mt-1 text-sm" value={critForm.prazoAprovacaoDias} onChange={e => setCritForm(f => ({ ...f, prazoAprovacaoDias: parseInt(e.target.value) || 5 }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600">Prazo Emissão NF (dias úteis)</Label>
                      <Input type="number" min={1} max={30} className="mt-1 text-sm" value={critForm.prazoEmissaoNf} onChange={e => setCritForm(f => ({ ...f, prazoEmissaoNf: parseInt(e.target.value) || 3 }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600">Prazo Liberação OP (dias úteis)</Label>
                      <Input type="number" min={1} max={30} className="mt-1 text-sm" value={critForm.prazoLiberacaoOp} onChange={e => setCritForm(f => ({ ...f, prazoLiberacaoOp: parseInt(e.target.value) || 5 }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600">Dia do Pagamento (do mês)</Label>
                      <Input type="number" min={1} max={31} className="mt-1 text-sm" value={critForm.diaPagamento} onChange={e => setCritForm(f => ({ ...f, diaPagamento: parseInt(e.target.value) || 10 }))} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">Documentação Necessária para Liberação</Label>
                    <textarea className="w-full mt-1 text-sm border rounded-lg p-2 min-h-[80px] resize-y" placeholder="Ex: Nota Fiscal, CND FGTS, CND INSS, Certidão Trabalhista, Boletim de Medição assinado..."
                      value={critForm.documentacaoNecessaria} onChange={e => setCritForm(f => ({ ...f, documentacaoNecessaria: e.target.value }))} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingCriterios(false)}><X className="w-3 h-3 mr-1" /> Cancelar</Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={atualizarContratoMut.isPending}
                      onClick={() => atualizarContratoMut.mutate({
                        id, companyId: contrato.companyId,
                        diaMedicao: critForm.diaMedicao,
                        diaPagamento: critForm.diaPagamento,
                        prazoAprovacaoDias: critForm.prazoAprovacaoDias,
                        prazoEmissaoNf: critForm.prazoEmissaoNf,
                        prazoLiberacaoOp: critForm.prazoLiberacaoOp,
                        documentacaoNecessaria: critForm.documentacaoNecessaria,
                      })}>
                      <Save className="w-3 h-3 mr-1" /> Salvar Critérios
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                    {[
                      { label: "Dia da Medição", value: `Dia ${dm}` },
                      { label: "Prazo Aprovação", value: `${pa} dias úteis` },
                      { label: "Prazo Emissão NF", value: `${pnf} dias úteis` },
                      { label: "Prazo Liberação OP", value: `${plop} dias úteis` },
                      { label: "Dia do Pagamento", value: `Dia ${dp}` },
                    ].map((k, i) => (
                      <div key={i} className="text-center bg-gray-50 rounded-lg p-2 border border-gray-100">
                        <p className="text-[10px] text-gray-500 uppercase font-medium">{k.label}</p>
                        <p className="text-sm font-bold text-gray-800">{k.value}</p>
                      </div>
                    ))}
                  </div>

                  {docNec && (
                    <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Documentação Necessária</p>
                      <p className="text-sm text-amber-900 whitespace-pre-wrap">{docNec}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">Fluxograma do Processo</p>
                    <div className="relative">
                      {etapas.map((e, i) => (
                        <div key={i} className="flex items-start gap-3 mb-0 last:mb-0">
                          <div className="flex flex-col items-center">
                            <div className={`w-8 h-8 rounded-full ${e.cor} text-white flex items-center justify-center text-xs font-bold shadow-sm`}>{e.num}</div>
                            {i < etapas.length - 1 && <div className="w-0.5 h-8 bg-gray-200" />}
                          </div>
                          <div className="pt-1 pb-3">
                            <p className="text-sm font-semibold text-gray-800">{e.icon} {e.titulo}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{e.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* Acesso ao Portal do Terceiro */}
        {(() => {
          const pl = (contrato as any).portalLogin;
          const empresaNome = contrato.empresa?.nomeFantasia || contrato.empresa?.razaoSocial || "—";
          return (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <ExternalLink className="h-5 w-5 text-indigo-600" />
                <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Acesso ao Portal do Terceiro</span>
              </div>
              {pl ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                    <p className="text-[10px] text-indigo-500 uppercase font-medium mb-1">Login (CNPJ)</p>
                    <p className="text-sm font-mono font-bold text-indigo-800">{pl.cnpj}</p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                    <p className="text-[10px] text-indigo-500 uppercase font-medium mb-1">Senha</p>
                    <p className="text-sm font-bold text-indigo-800">{pl.primeiroAcesso ? "Senha provisória (trocar no 1o acesso)" : "Definida pelo usuário"}</p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                    <p className="text-[10px] text-indigo-500 uppercase font-medium mb-1">Link do Portal</p>
                    <p className="text-sm font-mono text-indigo-700 break-all">{window.location.origin}/portal/login</p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                    <p className="text-[10px] text-indigo-500 uppercase font-medium mb-1">Status</p>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${pl.ativo ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        {pl.ativo ? "Ativo" : "Inativo"}
                      </span>
                      {pl.ultimoLogin && <span className="text-xs text-gray-500">Último acesso: {fmtDate(pl.ultimoLogin)}</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-gray-400 text-sm">
                  <p>Nenhum acesso ao portal criado para <strong>{empresaNome}</strong>.</p>
                  <p className="text-xs mt-1">Crie o acesso em Terceiros &gt; Empresas Terceiras &gt; selecione a empresa &gt; "Criar Acesso Portal".</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Resumo financeiro */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(contrato.naturezaIncluiMaterial && Number(contrato.fdMaterialTotal || 0) > 0
            ? [
                { label: "Valor Fechado (Contrato)", value: BRL(contrato.valorTotal), color: "text-gray-900", sub: null },
                { label: "Material em FD", value: `− ${BRL(contrato.fdMaterialTotal)}`, color: "text-amber-700", sub: "desconta do contrato" },
                { label: "Líquido Mão de Obra", value: BRL(contrato.valorLiquidoMdo), color: "text-blue-700", sub: "contrato − FD" },
                { label: "Total Pago", value: BRL(contrato.valorPago), color: "text-green-700", sub: `${pctPago.toFixed(1)}%` },
              ]
            : [
                { label: "Valor Fechado (Contrato)", value: BRL(contrato.valorTotal), color: "text-gray-900", sub: null },
                { label: "Medido Acumulado", value: BRL(contrato.valorMedidoAcumulado), color: "text-blue-700", sub: `${(contrato.percentualMedidoGlobal || 0).toFixed(1)}%` },
                { label: "Total Pago", value: BRL(contrato.valorPago), color: "text-green-700", sub: `${pctPago.toFixed(1)}%` },
                { label: "Saldo a Liberar", value: BRL(contrato.saldoALiberar), color: contrato.saldoALiberar > 0 ? "text-yellow-700" : "text-gray-400", sub: null },
              ]
          ).map((k, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
              <p className="text-xs text-gray-500">{k.label}</p>
              <p className={`text-base font-bold ${k.color}`}>{k.value}</p>
              {k.sub && <p className="text-xs text-gray-400">{k.sub}</p>}
            </div>
          ))}
        </div>

        {/* Orçamento vs Fechado */}
        {showVariacao && (
          <div className={`rounded-xl border p-4 flex items-center gap-4 ${
            variacao > 0 ? "bg-red-50 border-red-200" :
            variacao < 0 ? "bg-green-50 border-green-200" :
            "bg-gray-50 border-gray-200"
          }`}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              variacao > 0 ? "bg-red-500" : variacao < 0 ? "bg-green-500" : "bg-gray-300"
            }`}>
              {variacao > 0 ? <TrendingUp className="w-5 h-5 text-white" /> :
               variacao < 0 ? <TrendingDown className="w-5 h-5 text-white" /> :
               <Minus className="w-5 h-5 text-white" />}
            </div>
            <div className="flex-1">
              <p className={`font-semibold text-sm ${variacao > 0 ? "text-red-700" : variacao < 0 ? "text-green-700" : "text-gray-600"}`}>
                {variacao > 0 ? `Acima do orçamento — ${BRL(variacao)} (+${Math.abs(variacaoPct).toFixed(1)}%)` :
                 variacao < 0 ? `Economia vs orçamento — ${BRL(Math.abs(variacao))} (${Math.abs(variacaoPct).toFixed(1)}% abaixo)` :
                 "Dentro do orçamento"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Valor Orçado: <strong>{BRL(valOrc)}</strong> → Valor Fechado: <strong>{BRL(valFec)}</strong>
              </p>
            </div>
          </div>
        )}

        {/* Barras de progresso */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Avanço Físico (medido)</span><span>{pct.toFixed(1)}%</span></div>
            <div className="h-2 bg-gray-100 rounded-full"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} /></div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Execução Financeira (pago)</span><span>{pctPago.toFixed(1)}%</span></div>
            <div className="h-2 bg-gray-100 rounded-full"><div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(pctPago, 100)}%` }} /></div>
          </div>
          {pctPago > pct + 0.1 && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 p-2 rounded-lg">
              <AlertTriangle className="w-4 h-4" /> Pagamento maior que o avanço físico medido — verificar!
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {((["documento", "itens", "medicoes", "comparativo", "documentos"] as Tab[]).concat(
            (contrato.naturezaIncluiMaterial || (contrato.fdMaterialRegistros?.length || 0) > 0) ? (["fd"] as Tab[]) : []
          )).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
              {t === "itens" ? `Itens (${contrato.itens.length})` :
               t === "medicoes" ? `Medições (${contrato.medicoes.length})` :
               t === "comparativo" ? <span className="flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Comparativo</span> :
               t === "documentos" ? `Docs (${contrato.documentos.length})` :
               t === "fd" ? <span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" />FD ({contrato.fdMaterialRegistros?.length || 0})</span> :
               <span className="flex items-center gap-1.5"><FileEdit className="w-3.5 h-3.5" />Contrato</span>}
            </button>
          ))}
        </div>

        {/* Tab: Itens */}
        {tab === "itens" && (
          <div className="space-y-3">
            <div className="flex justify-end gap-2">
              {contrato.itens.length > 0 && contrato.itens.some((it: any) => !it.eapCodigo) && (
                <Button variant="outline" size="sm" className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50" disabled={relinkEapMut.isPending}
                  onClick={() => relinkEapMut.mutate({ contratoId: id })}>
                  <RefreshCw className={`w-4 h-4 ${relinkEapMut.isPending ? "animate-spin" : ""}`} /> Vincular Item
                </Button>
              )}
            </div>

            {contrato.itens.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhum item — os itens do contrato vêm definidos do módulo de Compras.
                <br />Acréscimos devem ser tratados como SEC (Serviços Extras Contratuais), vinculados a este contrato mas com rastreabilidade separada.
              </div>
            ) : (<ItemsTreeTable contrato={contrato} id={id} pct={pct} removerItemMut={removerItemMut} />)}
          </div>
        )}

        {/* Tab: Medições */}
        {tab === "medicoes" && (
          <MedicoesTab contrato={contrato} id={id} aprovarMut={aprovarMut} rejeitarMut={rejeitarMut} cancelarAprovacaoMut={cancelarAprovacaoMut} recalcularMut={recalcularMut} excluirMedicaoMut={excluirMedicaoMut} editarMedicaoItemMut={editarMedicaoItemMut} removerMedicaoItemMut={removerMedicaoItemMut} setEditMedicao={setEditMedicao} initialMedicaoId={medicaoIdFromUrl} setShowGerarMedicao={setShowGerarMedicao} />
        )}

        {/* Tab: Comparativo */}
        {tab === "comparativo" && (
          <ComparativoTab contrato={contrato} id={id} />
        )}

        {/* Tab: FD (Faturamento Direto de material) */}
        {tab === "fd" && (
          <FdTab contrato={contrato} />
        )}

        {/* Tab: Documentos */}
        {tab === "documentos" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowAddDoc(!showAddDoc)}>
                <Plus className="w-4 h-4" /> Adicionar Documento
              </Button>
            </div>

            {showAddDoc && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={newDoc.tipo} onValueChange={v => setNewDoc(f => ({ ...f, tipo: v }))}>
                      <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["INSS", "FGTS", "CND", "folha_pagamento", "seguro", "ASO", "NR", "outro"].map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Competência (AAAA-MM)</Label><Input className="mt-1 text-sm" placeholder="2025-03" value={newDoc.competencia} onChange={e => setNewDoc(f => ({ ...f, competencia: e.target.value }))} /></div>
                  <div><Label className="text-xs">Descrição</Label><Input className="mt-1 text-sm" value={newDoc.descricao} onChange={e => setNewDoc(f => ({ ...f, descricao: e.target.value }))} /></div>
                  <div><Label className="text-xs">Vencimento</Label><Input type="date" className="mt-1 text-sm" value={newDoc.dataVencimento} onChange={e => setNewDoc(f => ({ ...f, dataVencimento: e.target.value }))} /></div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={newDoc.bloqueiaPagemento} onChange={e => setNewDoc(f => ({ ...f, bloqueiaPagemento: e.target.checked }))} className="rounded" />
                  Bloquear pagamento se pendente
                </label>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowAddDoc(false)}>Cancelar</Button>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={criarDocMut.isPending}
                    onClick={() => criarDocMut.mutate({
                      contratoId: id, companyId: contrato.companyId, empresaTerceiraId: contrato.empresaTerceiraId,
                      tipo: newDoc.tipo, descricao: newDoc.descricao || undefined,
                      competencia: newDoc.competencia || undefined, dataVencimento: newDoc.dataVencimento || undefined,
                      bloqueiaPagemento: newDoc.bloqueiaPagemento,
                    })}>
                    Criar
                  </Button>
                </div>
              </div>
            )}

            {contrato.documentos.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">
                <FileCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhum documento obrigatório cadastrado
              </div>
            ) : contrato.documentos.map(doc => {
              const st = STATUS_DOC[doc.status || "pendente"] || STATUS_DOC.pendente;
              return (
                <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">{doc.tipo}</span>
                      {doc.competencia && <span className="text-xs text-gray-400 font-mono">{doc.competencia}</span>}
                      <Badge className={`text-xs border ${st.cls}`}>{st.label}</Badge>
                      {doc.bloqueiaPagemento && <Badge className="text-xs border bg-red-50 text-red-600 border-red-200">Bloqueia pag.</Badge>}
                    </div>
                    {doc.descricao && <p className="text-xs text-gray-400 mt-0.5">{doc.descricao}</p>}
                    {doc.dataVencimento && <p className="text-xs text-gray-400 mt-0.5">Vence: {fmtDate(doc.dataVencimento)}</p>}
                  </div>
                  <div className="flex gap-2">
                    {doc.status === "pendente" && (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => atualizarDocMut.mutate({ id: doc.id, status: "aprovado", validadoPor: "Responsável" })}>
                        <CheckCircle className="w-3 h-3 mr-1" /> Validar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab: Contrato */}
        {tab === "documento" && (() => {
          const cd = (contrato as any).companyData;
          const autoFilledValues = new Set<string>();
          if (cd?.razaoSocial) autoFilledValues.add(cd.razaoSocial);
          if (cd?.cnpj) autoFilledValues.add(cd.cnpj);
          if (contrato.empresa?.razaoSocial) autoFilledValues.add(contrato.empresa.razaoSocial);
          if (contrato.empresa?.cnpj) autoFilledValues.add(contrato.empresa.cnpj);
          if (contrato.numeroContrato) autoFilledValues.add(contrato.numeroContrato);
          if (contrato.descricao) autoFilledValues.add(contrato.descricao);
          if (contrato.valorTotal && Number(contrato.valorTotal) > 0) autoFilledValues.add(BRL(contrato.valorTotal));
          
          if (contrato.empresa?.logradouro) {
            const endEmpresa = [contrato.empresa.logradouro, contrato.empresa.numero, contrato.empresa.bairro, contrato.empresa.cidade, contrato.empresa.estado].filter(Boolean).join(", ");
            if (endEmpresa) autoFilledValues.add(endEmpresa);
          }
          if (contrato.empresa?.responsavelNome) autoFilledValues.add(contrato.empresa.responsavelNome);
          if ((contrato as any).obraNome) autoFilledValues.add((contrato as any).obraNome);

          const fmtDI = contrato.dataInicio ? fmtDate(contrato.dataInicio) : null;
          const fmtDT = contrato.dataTermino ? fmtDate(contrato.dataTermino) : null;
          const datesAreSame = fmtDI && fmtDT && fmtDI === fmtDT;

          const prazoPattern = /iniciados?\s+em\s+(\d{2}\/\d{2}\/\d{4})\s+e\s+conclu[ií]dos?\s+at[ée]\s+(\d{2}\/\d{2}\/\d{4})/i;

          const saveDocDateInline = (tipo: "inicio" | "termino", newIso: string) => {
            const oldFormatted = tipo === "inicio" ? fmtDI : fmtDT;
            const newFormatted = fmtDate(newIso);
            let updatedText: string | undefined;
            if (oldFormatted && textoAtual) {
              updatedText = textoAtual.replace(prazoPattern, (match, d1, d2) => {
                if (tipo === "inicio") return match.replace(d1, newFormatted);
                return match.replace(d2, newFormatted);
              });
              if (updatedText === textoAtual) {
                updatedText = undefined;
              }
            }
            atualizarContratoMut.mutate({
              id,
              companyId: contrato.companyId,
              ...(tipo === "inicio" ? { dataInicio: newIso } : { dataTermino: newIso }),
              ...(updatedText ? { textoContrato: updatedText } : {}),
            });
            if (updatedText) setTextoEditado(null);
            setEditingDocDate(null);
          };

          const renderDateSpan = (part: string, tipo: "inicio" | "termino", key: number) => {
            if (editingDocDate === tipo) {
              return (
                <span key={key} className="inline-flex items-center gap-1">
                  <input
                    type="date"
                    className="border border-blue-400 rounded px-1.5 py-0.5 text-[12px] bg-white shadow-sm focus:ring-2 focus:ring-blue-300 outline-none"
                    value={editDocDateValue}
                    onChange={e => setEditDocDateValue(e.target.value)}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter" && editDocDateValue) saveDocDateInline(tipo, editDocDateValue);
                      if (e.key === "Escape") setEditingDocDate(null);
                    }}
                  />
                  <button
                    onClick={() => editDocDateValue && saveDocDateInline(tipo, editDocDateValue)}
                    className="text-green-600 hover:text-green-800 p-0.5"
                    title="Salvar"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setEditingDocDate(null)}
                    className="text-gray-400 hover:text-gray-600 p-0.5"
                    title="Cancelar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              );
            }
            return (
              <span
                key={key}
                className="bg-blue-50 text-blue-700 border-b-2 border-blue-400 px-0.5 rounded-sm font-medium cursor-pointer hover:bg-blue-100 hover:border-blue-600 transition-colors"
                title={`Clique para editar a data de ${tipo === "inicio" ? "início" : "término"}`}
                onClick={() => {
                  const iso = tipo === "inicio" ? contrato.dataInicio : contrato.dataTermino;
                  setEditDocDateValue(iso?.slice(0, 10) || "");
                  setEditingDocDate(tipo);
                }}
              >
                <Pencil className="w-3 h-3 inline mr-0.5 opacity-50" />{part}
              </span>
            );
          };

          const highlightAutoFilled = (text: string, lineCtx?: string): any => {
            const isPrazoLine = prazoPattern.test(lineCtx || text);

            if (isPrazoLine && (fmtDI || fmtDT)) {
              const match = (lineCtx || text).match(prazoPattern);
              if (match) {
                const result: any[] = [];
                let remaining = text;
                let keyIdx = 0;

                const processDate = (dateStr: string, tipo: "inicio" | "termino") => {
                  const idx = remaining.indexOf(dateStr);
                  if (idx === -1) return;
                  if (idx > 0) {
                    const before = remaining.slice(0, idx);
                    result.push(...highlightNonDate(before, keyIdx));
                    keyIdx += 10;
                  }
                  result.push(renderDateSpan(dateStr, tipo, keyIdx++));
                  remaining = remaining.slice(idx + dateStr.length);
                };

                if (datesAreSame) {
                  const firstIdx = remaining.indexOf(fmtDI!);
                  if (firstIdx !== -1) {
                    if (firstIdx > 0) {
                      result.push(...highlightNonDate(remaining.slice(0, firstIdx), keyIdx));
                      keyIdx += 10;
                    }
                    result.push(renderDateSpan(fmtDI!, "inicio", keyIdx++));
                    remaining = remaining.slice(firstIdx + fmtDI!.length);
                    const secondIdx = remaining.indexOf(fmtDT!);
                    if (secondIdx !== -1) {
                      if (secondIdx > 0) {
                        result.push(...highlightNonDate(remaining.slice(0, secondIdx), keyIdx));
                        keyIdx += 10;
                      }
                      result.push(renderDateSpan(fmtDT!, "termino", keyIdx++));
                      remaining = remaining.slice(secondIdx + fmtDT!.length);
                    }
                  }
                } else {
                  if (fmtDI) processDate(fmtDI, "inicio");
                  if (fmtDT) processDate(fmtDT, "termino");
                }

                if (remaining) {
                  result.push(...highlightNonDate(remaining, keyIdx));
                }
                return result;
              }
            }

            return highlightNonDate(text, 0);
          };

          const highlightNonDate = (text: string, startKey: number): any[] => {
            if (autoFilledValues.size === 0) return [text];
            const escaped = [...autoFilledValues].filter(v => v && v.length > 2).map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            if (escaped.length === 0) return [text];
            const regex = new RegExp(`(${escaped.join("|")})`, "g");
            const parts = text.split(regex);
            if (parts.length === 1) return [text];
            return parts.map((part, i) =>
              autoFilledValues.has(part)
                ? <span key={startKey + i} className="bg-blue-50 text-blue-700 border-b-2 border-blue-300 px-0.5 rounded-sm font-medium" title="Preenchido automaticamente">{part}</span>
                : part
            );
          };

          if (contratoAssinado) {
            const baixarOuAbrir = async (modo: "download" | "abrir") => {
              if (isFetchingPdfAssinado) { toast.info("Carregando contrato assinado..."); return; }
              const d: any = pdfAssinadoData;
              if (!d?.envelope) { toast.error("Contrato assinado indisponível para gerar o PDF."); return; }
              // iOS: abrir a janela DENTRO do gesto do clique, antes do await
              const janela = modo === "abrir" ? window.open("", "_blank") : null;
              try {
                await gerarContratoAssinadoPdf({
                  titulo: d.envelope.titulo || contrato.numeroContrato || "Contrato",
                  textoContrato: d.envelope.textoContrato || textoAtual || "",
                  hash: d.envelope.hashDocumento || "",
                  modo,
                  janela,
                  signatarios: (d.todosSignatarios || []).map((s: any) => ({
                    nome: s.nome,
                    papelLabel: papelLabelContrato(s.papel),
                    status: s.status,
                    dataAssinatura: s.dataAssinatura,
                    cpfCnpj: s.cpfCnpj,
                    cargo: s.cargo,
                    assinaturaImagem: s.assinaturaImagem,
                    rubricaImagem: s.rubricaImagem,
                    hashAssinatura: s.hashAssinatura,
                    ipAddress: s.ipAddress,
                    latitude: s.latitude,
                    longitude: s.longitude,
                    geoAccuracy: s.geoAccuracy,
                    dispositivoInfo: s.dispositivoInfo,
                    nomeConfirmado: s.nomeConfirmado,
                    cpfCnpjConfirmado: s.cpfCnpjConfirmado,
                    termoAceito: s.termoAceito,
                    dataVisualizacao: s.dataVisualizacao,
                  })),
                });
              } catch (e: any) {
                try { janela?.close(); } catch { /* noop */ }
                toast.error(e?.message || "Falha ao gerar o PDF do contrato assinado.");
              }
            };
            const assinantes: any[] = (pdfAssinadoData as any)?.todosSignatarios || [];
            return (
              <div className="space-y-4">
                <div className="bg-white border border-emerald-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" /> Contrato assinado — edição bloqueada
                      </p>
                      <p className="text-xs text-emerald-700/80">
                        Este contrato foi assinado por todas as partes via FcSign. O documento final, com todas as
                        autenticações, está disponível para visualização e download.
                      </p>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="flex flex-wrap gap-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 h-9 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        disabled={isFetchingPdfAssinado || !pdfAssinadoData}
                        onClick={() => baixarOuAbrir("abrir")}
                      >
                        {isFetchingPdfAssinado
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Eye className="w-4 h-4" />}
                        Visualizar contrato
                      </Button>
                      <Button
                        size="sm"
                        className="gap-2 h-9 bg-emerald-600 hover:bg-emerald-700"
                        disabled={isFetchingPdfAssinado || !pdfAssinadoData}
                        onClick={() => baixarOuAbrir("download")}
                      >
                        {isFetchingPdfAssinado
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Download className="w-4 h-4" />}
                        Baixar PDF
                      </Button>
                    </div>

                    {(pdfAssinadoData as any)?.envelope?.hashDocumento && (
                      <p className="text-[11px] text-gray-400 font-mono break-all">
                        SHA-256: {(pdfAssinadoData as any).envelope.hashDocumento}
                      </p>
                    )}

                    {assinantes.length > 0 && (
                      <div className="border border-gray-100 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                          <FileCheck className="w-3.5 h-3.5" /> Assinaturas ({assinantes.length})
                        </div>
                        <div className="divide-y divide-gray-100">
                          {assinantes.map((s) => (
                            <div key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-700 truncate">
                                  {s.nome || "—"}
                                  <span className="text-xs text-gray-400 ml-2">({papelLabelContrato(s.papel)})</span>
                                </p>
                                {s.cpfCnpj && <p className="text-[11px] text-gray-400 font-mono">{s.cpfCnpj}</p>}
                              </div>
                              <div className="text-right shrink-0">
                                {s.status === "assinado" || s.dataAssinatura ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    {s.dataAssinatura ? fmtDate(s.dataAssinatura) : "Assinado"}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-gray-400">{s.status || "—"}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {isFetchingPdfAssinado && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando documento assinado...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          return (
          <div className="space-y-4">
            {/* Rev. 3065 — Toolbar SOMENTE visualizar / assinar / baixar. O template (texto,
                cláusulas e layout) é editado em Configurações › Contrato Terceiros; aqui o
                documento é apenas gerado automaticamente e enviado p/ assinatura. */}
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm flex-wrap">
              {textoAtual && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 h-8 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                  disabled={!textoAtual || criarEnvelopeMut.isPending}
                  onClick={() => {
                    const emp = (contrato as any).empresa;
                    setFcSignSignatarios([
                      { papel: "fornecedor", ordemAssinatura: 1, nome: emp?.responsavelNome || emp?.razaoSocial || "", email: emp?.email || "", cpfCnpj: emp?.cnpj || "", cargo: "Representante Legal", empresaNome: emp?.razaoSocial || "" },
                      { papel: "gestor_projeto", ordemAssinatura: 2, nome: (contrato as any).obraResponsavel || "", email: "", cpfCnpj: "", cargo: "Gestor de Projeto", empresaNome: "FC Engenharia" },
                    ]);
                    setShowFcSignModal(true);
                  }}
                >
                  <Send className="w-3.5 h-3.5" />
                  Enviar p/ FcSign
                </Button>
              )}
              <span className="text-[11px] text-gray-400 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Documento gerado pelo template — edição centralizada em Configurações › Contrato Terceiros
              </span>
              {(contrato as any).versaoTexto > 0 && (
                <span className="text-[11px] text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  v{(contrato as any).versaoTexto}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-50 border border-blue-300" />
                  Dados automáticos
                </div>
              </div>
            </div>

            {!textoAtual ? (
              <div className="py-20 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                {gerarTextoMut.isPending ? (
                  <>
                    <Loader2 className="w-10 h-10 mx-auto mb-4 text-blue-400 animate-spin" />
                    <p className="text-gray-500 text-base font-medium mb-1">Gerando documento...</p>
                    <p className="text-gray-400 text-sm">Preenchendo o template com os dados deste contrato</p>
                  </>
                ) : (
                  <>
                    <FileEdit className="w-14 h-14 mx-auto mb-4 text-gray-300" />
                    <p className="text-gray-500 text-base font-medium mb-1">Documento ainda não gerado</p>
                    <p className="text-gray-400 text-sm mb-5">O contrato é montado automaticamente a partir do template (configurado em Configurações › Contrato Terceiros).</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={gerarTextoMut.isPending}
                      onClick={() => { autoGerarTentadoRef.current = true; gerarTextoMut.mutate({ contratoId: id }); }}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Tentar novamente
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex justify-center">
                {/* Folha A4 */}
                <div className="bg-gray-100 rounded-xl p-8 w-full flex justify-center" style={{ minHeight: "calc(100vh - 320px)" }}>
                  <div className="w-full max-w-[794px] bg-white shadow-xl rounded-sm border border-gray-300 relative overflow-hidden" style={{ minHeight: "1123px" }}>
                    {/* Marca d'água */}
                    {cd?.docMarcaDaguaUrl && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                        <img
                          src={cd.docMarcaDaguaUrl}
                          alt=""
                          className="w-[400px] h-auto"
                          style={{ opacity: Number(cd.docMarcaDaguaOpacidade) || 0.06 }}
                        />
                      </div>
                    )}
                    {/* Cabeçalho */}
                    <div className="border-b border-gray-300 px-[72px] py-8 flex items-center justify-between relative z-10">
                      {(() => {
                        const showFallback = !cd?.logoUrl || logoError;
                        if (showFallback) {
                          return (
                            <div className="flex items-center gap-3">
                              <Building2 className="w-10 h-10 text-gray-300" />
                              <div>
                                <p className="text-sm font-bold text-gray-700">{cd?.razaoSocial || cd?.nomeFantasia || "Empresa"}</p>
                                {cd?.cnpj && <p className="text-[10px] text-gray-400 font-mono">{cd.cnpj}</p>}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <img
                            src={cd.logoUrl}
                            alt="Logo"
                            className="h-16 object-contain"
                            onError={() => setLogoError(true)}
                          />
                        );
                      })()}
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400 uppercase tracking-[0.15em] font-semibold">Contrato</p>
                        <p className="text-base font-bold text-gray-800">{contrato.numeroContrato}</p>
                        {(contrato as any).versaoTexto > 0 && <p className="text-[10px] text-gray-400 mt-0.5">Versão {(contrato as any).versaoTexto}</p>}
                      </div>
                    </div>

                    {/* Corpo do contrato */}
                    <div className="px-[72px] py-10 relative z-10" style={{ fontFamily: "'Times New Roman', 'Georgia', serif" }}>
                      {(() => {
                        const lines = textoAtual.split("\n");
                        return lines.map((line, idx) => {
                          const trimmed = line.trim();
                          if (!trimmed) return <div key={idx} className="h-3" />;

                          if (/^\{\{FLUXOGRAMA_PAGAMENTO\}\}$/.test(trimmed)) {
                            const c = contrato as any;
                            return (
                              <FluxogramaPagamento
                                key={idx}
                                diaMedicao={c?.diaMedicao}
                                prazoAprovacao={c?.prazoAprovacaoDias}
                                prazoEmissaoNf={c?.prazoEmissaoNf}
                                prazoLiberacaoOp={c?.prazoLiberacaoOp}
                                diaPagamento={c?.diaPagamento}
                              />
                            );
                          }

                          const isClausula = /^CL[ÁA]USULA\s/i.test(trimmed);
                          const isTitulo = /^CONTRATO\s+DE\s+/i.test(trimmed);
                          const isAlinea = /^[a-z]\)\s/.test(trimmed);
                          const isSubClausulaTitle = /^\d+\.\d+\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(trimmed) && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}/.test(trimmed.split(/\s+/)[1] || "");
                          const isSubItem = /^\d+\.\d+[\s.]/.test(trimmed) && !isSubClausulaTitle;
                          const isNumericItem = /^\d+\.\s/.test(trimmed);
                          const isBullet = /^[•●▪▸►-]\s/.test(trimmed);
                          const isSeparator = /^[-|]+$/.test(trimmed.replace(/\s/g, ""));
                          const isTableRow = trimmed.includes(" | ") && !isSeparator;
                          const isSectionHeader = /^ESCOPO DETALHADO|^QUADRO|^TABELA|^RESUMO DOS PRAZOS/i.test(trimmed);

                          if (isTitulo) {
                            return (
                              <h1 key={idx} className="text-[15px] font-bold text-gray-900 text-center mb-8 uppercase tracking-wider leading-tight">
                                {highlightAutoFilled(trimmed)}
                              </h1>
                            );
                          }
                          if (isClausula) {
                            return (
                              <h2 key={idx} className="text-[13px] font-bold text-gray-900 mt-8 mb-3 uppercase tracking-wide">
                                {highlightAutoFilled(trimmed)}
                              </h2>
                            );
                          }
                          if (isSectionHeader) {
                            return (
                              <p key={idx} className="text-[12px] font-bold text-gray-700 mt-6 mb-2 uppercase tracking-wide">
                                {trimmed}
                              </p>
                            );
                          }
                          if (isSeparator) {
                            return <div key={idx} className="border-t border-gray-300 my-0.5" />;
                          }
                          if (isTableRow) {
                            const cells = trimmed.split("|").map(c => c.trim());
                            const isHeader = /^EAP|^Item|^Código/i.test(cells[0] || "");
                            return (
                              <div key={idx} className={`flex text-[10px] font-mono py-0.5 ${isHeader ? "font-bold text-gray-700 bg-gray-50 border-b border-gray-300" : "text-gray-600"}`}>
                                <span className="w-[80px] flex-shrink-0 px-1">{cells[0] || ""}</span>
                                <span className="flex-1 min-w-0 px-1 break-words">{highlightAutoFilled(cells[1] || "")}</span>
                                <span className="w-[40px] flex-shrink-0 px-1 text-center">{cells[2] || ""}</span>
                                <span className="w-[65px] flex-shrink-0 px-1 text-right">{highlightAutoFilled(cells[3] || "")}</span>
                                <span className="w-[90px] flex-shrink-0 px-1 text-right">{highlightAutoFilled(cells[4] || "")}</span>
                                <span className="w-[90px] flex-shrink-0 px-1 text-right font-medium">{highlightAutoFilled(cells[5] || "")}</span>
                              </div>
                            );
                          }
                          if (isSubClausulaTitle) {
                            return (
                              <p key={idx} className="text-[12.5px] font-semibold text-gray-900 leading-[1.8] mt-4 mb-1.5 pl-3">
                                {highlightAutoFilled(trimmed)}
                              </p>
                            );
                          }
                          if (isAlinea) {
                            return (
                              <p key={idx} className="text-[12px] text-gray-700 leading-[1.8] mb-2 pl-10 pr-4 text-justify">
                                {highlightAutoFilled(trimmed)}
                              </p>
                            );
                          }
                          if (isBullet) {
                            return (
                              <p key={idx} className="text-[12px] text-gray-700 leading-[1.7] mb-0.5 pl-12 pr-4">
                                {highlightAutoFilled(trimmed)}
                              </p>
                            );
                          }
                          if (isSubItem) {
                            return (
                              <p key={idx} className="text-[12.5px] text-gray-800 leading-[1.8] mb-1 pl-6">
                                {highlightAutoFilled(trimmed)}
                              </p>
                            );
                          }
                          if (isNumericItem) {
                            return (
                              <p key={idx} className="text-[12.5px] text-gray-800 leading-[1.8] mb-1.5 pl-3">
                                {highlightAutoFilled(trimmed)}
                              </p>
                            );
                          }
                          return (
                            <p key={idx} className="text-[12.5px] text-gray-800 leading-[1.8] mb-2 text-justify">
                              {highlightAutoFilled(trimmed)}
                            </p>
                          );
                        });
                      })()}
                    </div>

                    {/* Assinaturas */}
                    <div className="border-t border-gray-300 px-[72px] py-6 mt-auto relative z-10">
                      <div className="grid grid-cols-2 gap-20 mt-4">
                        <div className="text-center">
                          <div className="mt-16 pt-2 border-t border-gray-500">
                            <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Contratante</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{cd?.razaoSocial || "—"}</p>
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="mt-16 pt-2 border-t border-gray-500">
                            <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Contratada</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{contrato.empresa?.razaoSocial || "—"}</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-10">
                        <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-4">Testemunhas</p>
                        <div className="grid grid-cols-2 gap-20">
                          <div className="text-center">
                            <div className="mt-8 pt-2 border-t border-gray-400">
                              <p className="text-[10px] text-gray-700 font-medium">{(contrato as any).testemunhaFinanceiro || "_______________"}</p>
                              <p className="text-[9px] text-gray-400 mt-0.5">Responsável Financeiro</p>
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="mt-8 pt-2 border-t border-gray-400">
                              <p className="text-[10px] text-gray-700 font-medium">{(contrato as any).obraResponsavel || "_______________"}</p>
                              <p className="text-[9px] text-gray-400 mt-0.5">Gestor de Projeto</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Rodapé do documento */}
                    {cd?.docRodapeTexto && (
                      <div className="border-t border-gray-200 px-[72px] py-3 text-center relative z-10">
                        {cd.docRodapeTexto.split("\n").map((line: string, i: number) => (
                          <p key={i} className="text-[8px] text-gray-400 leading-tight italic">{line}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* Modal: Histórico de revisões */}
        {showRevisoes && revisoes.length > 0 && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <History className="w-5 h-5 text-gray-500" />
                  Histórico de Revisões
                </h2>
                <button onClick={() => setShowRevisoes(false)} className="text-gray-400 hover:text-gray-600 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {revisoes.map((rev: any) => (
                  <div key={rev.id} className="bg-gray-50 rounded-lg border border-gray-100 p-3 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono font-bold text-blue-600">v{rev.versao}</span>
                      <button
                        onClick={() => { if (confirm(`Restaurar versão v${rev.versao}?`)) { restaurarMut.mutate({ contratoId: id, revisaoId: rev.id }); setShowRevisoes(false); } }}
                        className="text-[11px] text-gray-400 hover:text-blue-600 transition-colors flex items-center gap-1"
                      >
                        <Undo2 className="w-3 h-3" /> Restaurar
                      </button>
                    </div>
                    {rev.observacao && <p className="text-[11px] text-gray-600 leading-snug">{rev.observacao}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      {rev.criadoPor && <span className="text-[10px] text-gray-400">por {rev.criadoPor}</span>}
                      <span className="text-[10px] text-gray-300">{rev.criadoEm ? new Date(rev.criadoEm).toLocaleString("pt-BR") : ""}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                <Button variant="outline" size="sm" className="w-full" onClick={() => setShowRevisoes(false)}>Fechar</Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Enviar para FcSign */}
        {showFcSignModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
              <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
                <Send className="w-5 h-5 text-indigo-600" />
                Enviar para FcSign
              </h2>
              <p className="text-sm text-gray-500 mb-3">
                O contrato <span className="font-semibold text-gray-700">{contrato.numeroContrato}</span> será enviado para assinatura eletrônica.
                Configure os signatários abaixo.
              </p>
              <div className="mb-4 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>O <span className="font-semibold">Sócio Administrador</span> definido em Configurações → Sócios é adicionado automaticamente como signatário do contrato.</span>
              </div>

              <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                {fcSignSignatarios.map((sig, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {idx + 1}º Signatário — {sig.papel === "fornecedor" ? "Fornecedor" : sig.papel === "gestor_projeto" ? "Gestor" : sig.papel === "financeiro" ? "Financeiro" : sig.papel === "diretor" ? "Diretor" : "Testemunha"}
                      </span>
                      {fcSignSignatarios.length > 2 && (
                        <button className="text-red-400 hover:text-red-600 text-xs" onClick={() => setFcSignSignatarios(prev => prev.filter((_, i) => i !== idx))}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-gray-400">Nome</Label>
                        <Input className="h-8 text-xs" value={sig.nome} onChange={e => { const arr = [...fcSignSignatarios]; arr[idx] = { ...arr[idx], nome: e.target.value }; setFcSignSignatarios(arr); }} />
                      </div>
                      <div>
                        <Label className="text-[10px] text-gray-400">Email</Label>
                        <Input className="h-8 text-xs" type="email" value={sig.email} onChange={e => { const arr = [...fcSignSignatarios]; arr[idx] = { ...arr[idx], email: e.target.value }; setFcSignSignatarios(arr); }} />
                      </div>
                      <div>
                        <Label className="text-[10px] text-gray-400">CPF/CNPJ</Label>
                        <Input className="h-8 text-xs" value={sig.cpfCnpj} onChange={e => { const arr = [...fcSignSignatarios]; arr[idx] = { ...arr[idx], cpfCnpj: e.target.value }; setFcSignSignatarios(arr); }} />
                      </div>
                      <div>
                        <Label className="text-[10px] text-gray-400">Cargo</Label>
                        <Input className="h-8 text-xs" value={sig.cargo} onChange={e => { const arr = [...fcSignSignatarios]; arr[idx] = { ...arr[idx], cargo: e.target.value }; setFcSignSignatarios(arr); }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                onClick={() => setFcSignSignatarios(prev => [...prev, { papel: "testemunha" as const, ordemAssinatura: prev.length + 1, nome: "", email: "", cpfCnpj: "", cargo: "Testemunha", empresaNome: "" }])}
              >
                <Plus className="w-3 h-3" /> Adicionar signatário
              </button>

              <div className="flex gap-3 mt-5 justify-end">
                <Button variant="outline" onClick={() => setShowFcSignModal(false)}>Cancelar</Button>
                <Button
                  className="bg-indigo-600 hover:bg-indigo-700 gap-2"
                  disabled={criarEnvelopeMut.isPending || fcSignSignatarios.some(s => !s.nome || !s.email)}
                  onClick={() => {
                    const empNome = (contrato as any).empresa?.razaoSocial || "";
                    criarEnvelopeMut.mutate({
                      companyId: contrato.companyId,
                      contratoTerceiroId: id,
                      obraId: contrato.obraId || undefined,
                      titulo: `${contrato.numeroContrato} — ${empNome}`.trim(),
                      descricao: contrato.descricao || undefined,
                      textoContrato: textoAtual || undefined,
                      signatarios: fcSignSignatarios.map((s, i) => ({ ...s, ordemAssinatura: i + 1, empresaNome: s.empresaNome || empNome })),
                    });
                  }}
                >
                  {criarEnvelopeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Criar Envelope
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Gerar Medição */}
        {showGerarMedicao && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            {(() => {
              const proximoNumero = (contrato.medicoes?.length || 0) + 1;
              const numStr = String(proximoNumero).padStart(2, "0");
              const isFirst = proximoNumero === 1;
              const diaMed = (contrato as any).diaMedicao ?? 25;
              const ultimaMedicao = contrato.medicoes?.length > 0
                ? [...contrato.medicoes].sort((a: any, b: any) => (b.numero || 0) - (a.numero || 0))[0]
                : null;
              const autoInicio = ultimaMedicao?.dataFim
                ? addDaysISO(ultimaMedicao.dataFim.slice(0, 10), 1)
                : null;
              const inicioEfetivo = isFirst ? medicaoDataInicio : (autoInicio || medicaoDataInicio);
              // Fim = "Dia da Medição" do contrato (corte em/ após o início) — respeita o contrato.
              const autoFim = cutoffOnOrAfterISO(diaMed, inicioEfetivo);
              const fimEfetivo = isFirst ? medicaoDataFim : autoFim;
              const periodoCalc = inicioEfetivo.slice(0, 7);
              return (
                <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
                  {/* Cabeçalho destacado */}
                  <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 pt-5 pb-6 text-white">
                    <div className="flex items-center gap-1.5 text-blue-100 text-[11px] font-semibold uppercase tracking-wide mb-2">
                      <Zap className="w-3.5 h-3.5" /> Gerar Medição Automática
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-3xl font-bold leading-none">Medição {numStr}</h2>
                      {!isFirst && ultimaMedicao?.dataFim && (
                        <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                          Continuação da {String(ultimaMedicao.numero).padStart(2, "0")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-6">
                    {/* Explicação */}
                    <div className="flex gap-2.5 p-3 bg-blue-50 rounded-xl mb-5">
                      <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <p className="text-[13px] text-blue-900/80 leading-relaxed">
                        O sistema busca o avanço físico atual de cada atividade no planejamento e calcula o valor a medir automaticamente.
                      </p>
                    </div>

                    {/* Período */}
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Período da Medição</span>
                    <div className="mt-2 flex items-end gap-2">
                      <div className="flex-1 min-w-0">
                        <Label htmlFor="medicao-data-inicio" className="text-[11px] text-gray-400 mb-1 block font-normal">Início</Label>
                        {isFirst ? (
                          <Input id="medicao-data-inicio" className="h-11" type="date" value={medicaoDataInicio} onChange={e => setMedicaoDataInicio(e.target.value)} />
                        ) : (
                          <div id="medicao-data-inicio" className="h-11 flex items-center gap-2 px-3 bg-gray-50 rounded-md text-sm font-medium text-gray-700 border">
                            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />{inicioEfetivo.split("-").reverse().join("/")}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0 mb-3" />
                      <div className="flex-1 min-w-0">
                        <Label htmlFor="medicao-data-fim" className="text-[11px] text-gray-400 mb-1 block font-normal">Fim</Label>
                        {isFirst ? (
                          <Input id="medicao-data-fim" className="h-11" type="date" value={medicaoDataFim} onChange={e => setMedicaoDataFim(e.target.value)} />
                        ) : (
                          <div id="medicao-data-fim" className="h-11 flex items-center gap-2 px-3 bg-gray-50 rounded-md text-sm font-medium text-gray-700 border">
                            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />{fimEfetivo.split("-").reverse().join("/")}
                          </div>
                        )}
                      </div>
                    </div>
                    {!isFirst && (
                      <p className="text-xs text-gray-400 mt-2">Período calculado automaticamente: início no dia seguinte à medição anterior, fim no Dia da Medição definido no contrato (dia {diaMed}).</p>
                    )}
                    {isFirst && (
                      <p className="text-xs text-gray-400 mt-2">Período sugerido conforme o Dia da Medição do contrato (dia {diaMed}). Ajuste se necessário.</p>
                    )}
                    {contrato.docsComPendencia > 0 && (
                      <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg text-yellow-700 text-xs mt-4">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>Existem {contrato.docsComPendencia} documento(s) pendentes. A medição será gerada mas poderá ser bloqueada para pagamento.</span>
                      </div>
                    )}

                    {gerarMedicaoMut.isPending && (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Gerando medição...
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                          <div className="bg-blue-600 h-2.5 rounded-full" style={{ animation: "progress-indeterminate 1.5s ease-in-out infinite" }} />
                        </div>
                        <p className="text-xs text-gray-400">Vinculando itens ao planejamento e calculando avanço físico...</p>
                        <style>{`@keyframes progress-indeterminate { 0% { width: 10%; margin-left: 0; } 50% { width: 60%; margin-left: 20%; } 100% { width: 10%; margin-left: 90%; } }`}</style>
                      </div>
                    )}

                    <div className="flex gap-3 mt-6">
                      <Button variant="outline" className="flex-1 h-11" onClick={() => setShowGerarMedicao(false)} disabled={gerarMedicaoMut.isPending}>Cancelar</Button>
                      <Button className="flex-1 h-11 bg-blue-600 hover:bg-blue-700" disabled={gerarMedicaoMut.isPending}
                        onClick={() => gerarMedicaoMut.mutate({ contratoId: id, companyId: contrato.companyId, periodo: periodoCalc, dataInicio: inicioEfetivo, dataFim: fimEfetivo, criadoPor: "Responsável" })}>
                        <Zap className="w-4 h-4 mr-2" />{gerarMedicaoMut.isPending ? "Gerando..." : "Gerar Medição"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {editMedicao && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h2 className="text-lg font-bold mb-4">Editar Medição</h2>
              <div className="space-y-3">
                <div>
                  <Label className="text-sm">Período (AAAA-MM)</Label>
                  <Input className="mt-1" value={editMedicao.periodo} onChange={e => setEditMedicao(prev => prev ? { ...prev, periodo: e.target.value } : null)} />
                </div>
                <div>
                  <Label className="text-sm">Data de Referência</Label>
                  <Input type="date" className="mt-1" value={editMedicao.dataReferencia} onChange={e => setEditMedicao(prev => prev ? { ...prev, dataReferencia: e.target.value } : null)} />
                </div>
                <div>
                  <Label className="text-sm">Observações</Label>
                  <Input className="mt-1" value={editMedicao.observacoes} onChange={e => setEditMedicao(prev => prev ? { ...prev, observacoes: e.target.value } : null)} placeholder="Observações..." />
                </div>
                <div>
                  <Label className="text-sm">Status</Label>
                  <Select value={editMedicao.status} onValueChange={v => setEditMedicao(prev => prev ? { ...prev, status: v } : null)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                      <SelectItem value="aguardando_aprovacao">Aguardando Aprovação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-3 mt-5 justify-end">
                <Button variant="outline" onClick={() => setEditMedicao(null)}>Cancelar</Button>
                <Button className="bg-blue-600 hover:bg-blue-700" disabled={editarMedicaoMut.isPending}
                  onClick={() => editarMedicaoMut.mutate({
                    id: editMedicao.id,
                    companyId: contrato.companyId,
                    periodo: editMedicao.periodo,
                    dataReferencia: editMedicao.dataReferencia || null,
                    observacoes: editMedicao.observacoes || null,
                    status: editMedicao.status as "rascunho" | "aguardando_aprovacao",
                  })}>
                  <Save className="w-4 h-4 mr-2" />{editarMedicaoMut.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Diálogo — Cancelar contrato (Admin Master, soft cascade) */}
        <Dialog open={showCancelContrato} onOpenChange={v => { if (!v) setShowCancelContrato(false); }}>
          <DialogContent className="border-red-200 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
            <DialogHeader>
              <DialogTitle className="text-red-700 flex items-center gap-2">
                <Ban className="h-5 w-5" /> Cancelar contrato (Admin Master)
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 space-y-1">
                <p className="font-semibold">Esta ação irá (preservando o histórico):</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Marcar o contrato como <strong>Cancelado</strong></li>
                  <li>Cancelar as <strong>medições não pagas</strong> e as <strong>OCs vinculadas</strong> não recebidas</li>
                  <li>Cancelar os <strong>lançamentos financeiros NÃO pagos</strong> (pagos ficam intactos)</li>
                </ul>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Motivo do cancelamento <span className="text-red-500">*</span></Label>
                <Textarea placeholder="Descreva o motivo (mín. 5 caracteres)" value={contratoMotivo} onChange={e => setContratoMotivo(e.target.value)} rows={3} className="text-sm resize-none" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Senha do master <span className="text-red-500">*</span></Label>
                <Input type="password" placeholder="Confirme sua senha" value={contratoSenha} onChange={e => setContratoSenha(e.target.value)} className="text-sm" />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setShowCancelContrato(false)} disabled={cancelarContratoMut.isPending}>Voltar</Button>
              <Button
                className="bg-red-600 hover:bg-red-500 text-white gap-1.5"
                disabled={contratoMotivo.trim().length < 5 || !contratoSenha || cancelarContratoMut.isPending}
                onClick={() => cancelarContratoMut.mutate({ id, companyId: contrato.companyId, motivo: contratoMotivo.trim(), password: contratoSenha })}
              >
                {cancelarContratoMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                Confirmar Cancelamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Diálogo — Excluir contrato definitivamente (Admin Master, hard delete) */}
        <Dialog open={showExcluirContrato} onOpenChange={v => { if (!v) setShowExcluirContrato(false); }}>
          <DialogContent className="border-red-300 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
            <DialogHeader>
              <DialogTitle className="text-red-800 flex items-center gap-2">
                <Trash2 className="h-5 w-5" /> Excluir contrato definitivamente
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div className="rounded-lg bg-red-100 border border-red-300 p-3 text-xs text-red-900 space-y-1">
                <p className="font-semibold">ATENÇÃO — ação irreversível.</p>
                <p>O contrato, suas medições, itens e documentos serão <strong>apagados permanentemente</strong>. Esta operação não pode ser desfeita. Para apenas encerrar preservando o histórico, use "Cancelar contrato".</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Motivo da exclusão <span className="text-red-500">*</span></Label>
                <Textarea placeholder="Descreva o motivo (mín. 5 caracteres)" value={contratoMotivo} onChange={e => setContratoMotivo(e.target.value)} rows={3} className="text-sm resize-none" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Senha do master <span className="text-red-500">*</span></Label>
                <Input type="password" placeholder="Confirme sua senha" value={contratoSenha} onChange={e => setContratoSenha(e.target.value)} className="text-sm" />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setShowExcluirContrato(false)} disabled={excluirContratoMut.isPending}>Voltar</Button>
              <Button
                className="bg-red-700 hover:bg-red-600 text-white gap-1.5"
                disabled={contratoMotivo.trim().length < 5 || !contratoSenha || excluirContratoMut.isPending}
                onClick={() => excluirContratoMut.mutate({ id, companyId: contrato.companyId, motivo: contratoMotivo.trim(), password: contratoSenha })}
              >
                {excluirContratoMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Excluir Definitivamente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

function MedicoesTab({ contrato, id, aprovarMut, rejeitarMut, cancelarAprovacaoMut, recalcularMut, excluirMedicaoMut, editarMedicaoItemMut, removerMedicaoItemMut, setEditMedicao, initialMedicaoId, setShowGerarMedicao }: any) {
  const assinado = (contrato as any).assinaturaStatus === "concluido";
  const [expandedMedicao, setExpandedMedicao] = useState<number | null>(initialMedicaoId ?? null);
  const medicaoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialMedicaoId && medicaoRef.current) {
      setTimeout(() => medicaoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    }
  }, [initialMedicaoId]);
  const [rejeicaoModal, setRejeicaoModal] = useState<{ id: number; numero: number } | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [editingItem, setEditingItem] = useState<{ id: number; valor: string } | null>(null);
  const [recalcResult, setRecalcResult] = useState<any>(null);

  if (contrato.medicoes.length === 0) {
    return (
      <div className="py-10 text-center text-sm">
        <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-30 text-gray-400" />
        <p className="text-gray-400 mb-4">Nenhuma medição gerada para este contrato.</p>
        {assinado ? (
          <Button onClick={() => setShowGerarMedicao(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Zap className="w-4 h-4" /> Gerar Medição
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <Clock className="w-3.5 h-3.5" />
            {(contrato as any).assinaturaStatus
              ? "Conclua a assinatura do contrato (FcSign) para gerar medições."
              : "Envie o contrato para assinatura antes de gerar medições."}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {assinado && (
        <div className="flex justify-end">
          <Button onClick={() => setShowGerarMedicao(true)} size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Zap className="w-4 h-4" /> Gerar Medição
          </Button>
        </div>
      )}
      {contrato.medicoes.map((m: any) => {
        const st = STATUS_MEDICAO[m.status || "rascunho"] || STATUS_MEDICAO.rascunho;
        const isExpanded = expandedMedicao === m.id;
        const isEditable = m.status !== "paga";
        const isPreApproval = m.status === "aguardando_aprovacao" || m.status === "rascunho";
        const itens = m.itens || [];

        return (
          <div key={m.id} ref={m.id === initialMedicaoId ? medicaoRef : undefined} className={`bg-white rounded-xl border overflow-hidden ${m.id === initialMedicaoId ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-200"}`}>
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => setExpandedMedicao(isExpanded ? null : m.id)}>
                  <div className="flex items-center gap-2 mb-1">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <span className="font-semibold text-gray-900">Medição {String(m.numero).padStart(2, "0")}{m.dataInicio && m.dataFim ? ` — ${fmtDate(m.dataInicio)} a ${fmtDate(m.dataFim)}` : ` — ${m.periodo}`}</span>
                    <Badge className={`text-xs border ${st.cls}`}>{st.label}</Badge>
                    {m.geradoAutomaticamente && <Badge className="text-xs border bg-purple-100 text-purple-700 border-purple-200"><Zap className="w-3 h-3 mr-1" />Auto</Badge>}
                  </div>
                  <div className="text-xs text-gray-500 ml-6">
                    Ref: {fmtDate(m.dataReferencia)} • Medido: {BRL(m.valorMedido)} • Acumulado: {BRL(m.valorAcumulado)} • {Number(m.percentualGlobal).toFixed(1)}% global
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {m.status === "aguardando_aprovacao" && (
                    <>
                      <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-xs" onClick={() => aprovarMut.mutate({ id: m.id, companyId, aprovadoPor: "Responsável" })}>
                        <CheckCircle className="w-3 h-3" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => { setRejeicaoModal({ id: m.id, numero: String(m.numero).padStart(2, "0") }); setMotivoRejeicao(""); }}>
                        Rejeitar
                      </Button>
                    </>
                  )}
                  {m.status === "aprovada" && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs text-orange-600 border-orange-200 hover:bg-orange-50"
                      disabled={cancelarAprovacaoMut.isPending}
                      onClick={() => { if (confirm(`Cancelar aprovação da Medição ${String(m.numero).padStart(2, "0")}? A medição voltará para "Aguardando Aprovação" e os valores acumulados serão recalculados.`)) cancelarAprovacaoMut.mutate({ id: m.id, companyId: contrato.companyId }); }}>
                      <Undo2 className="w-3 h-3" /> Cancelar Aprovação
                    </Button>
                  )}
                  {(m.status === "aguardando_aprovacao" || m.status === "rascunho") && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                      disabled={recalcularMut.isPending}
                      onClick={() => recalcularMut.mutate({ medicaoId: m.id, companyId: contrato.companyId }, { onSuccess: (data: any) => setRecalcResult(data) })}>
                      <RefreshCw className={`w-3 h-3 ${recalcularMut.isPending ? "animate-spin" : ""}`} /> Recalcular
                    </Button>
                  )}
                  {isPreApproval && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs"
                      onClick={() => setEditMedicao({ id: m.id, periodo: m.periodo, dataReferencia: m.dataReferencia || "", observacoes: m.observacoes || "", status: m.status || "rascunho" })}>
                      <Pencil className="w-3 h-3" /> Editar
                    </Button>
                  )}
                  {m.status !== "paga" && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                      disabled={excluirMedicaoMut.isPending}
                      onClick={() => { if (confirm(`Excluir Medição ${String(m.numero).padStart(2, "0")}? ${m.status === "aprovada" ? "Os valores acumulados serão revertidos." : ""}`)) excluirMedicaoMut.mutate({ id: m.id, contratoId: id, companyId: contrato.companyId }); }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>

              {m.aprovadoPor && <p className="text-xs text-gray-400 mt-2 ml-6">Aprovado por <span className="font-medium">{m.aprovadoPor}</span> em {fmtDate(m.aprovadoEm)}</p>}
              {m.alertaDivergencia && (
                <div className="mt-2 ml-6 p-2.5 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-xs text-orange-700 font-medium"><AlertTriangle className="w-3.5 h-3.5 inline mr-1.5 text-orange-500" />{m.alertaDivergencia}</p>
                </div>
              )}
              {m.motivoRejeicao && (
                <div className="mt-2 ml-6 p-2 bg-red-50 rounded-lg border border-red-100">
                  <p className="text-xs text-red-600"><AlertTriangle className="w-3 h-3 inline mr-1" />Rejeitada{(m as any).rejeitadoPor ? ` por ${(m as any).rejeitadoPor}` : ""}{(m as any).rejeitadoEm ? ` em ${fmtDate((m as any).rejeitadoEm)}` : ""}</p>
                  <p className="text-xs text-red-500 mt-0.5">{m.motivoRejeicao}</p>
                </div>
              )}
            </div>

            {isExpanded && itens.length > 0 && (<>
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-xs min-w-[900px]">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="px-3 py-2 text-left w-[80px]">Item</th>
                      <th className="px-3 py-2 text-left">Atividade</th>
                      <th className="px-2 py-2 text-center w-[45px]">Unid.</th>
                      <th className="px-2 py-2 text-right w-[55px]">Qtd.</th>
                      <th className="px-2 py-2 text-right w-[80px]">V.Unit.</th>
                      <th className="px-2 py-2 text-right w-[80px]">V.Total</th>
                      <th className="px-2 py-2 text-center w-[55px] border-l border-gray-200">Ant.%</th>
                      <th className="px-2 py-2 text-center w-[70px]">% Período</th>
                      <th className="px-2 py-2 text-center w-[55px]">Acum.%</th>
                      <th className="px-2 py-2 text-right w-[90px]">V.Período</th>
                      <th className="px-2 py-2 text-right w-[90px]">V.Acum.</th>
                      {isPreApproval && <th className="px-2 py-2 text-center w-[35px]"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const hierMap = new Map<string, any>();
                      (contrato.itensHierarchy || []).forEach((h: any) => hierMap.set(h.eapCodigo, h));

                      const sorted = [...itens].sort((a: any, b: any) => (a.eapCodigo || "").localeCompare(b.eapCodigo || "", undefined, { numeric: true }));

                      const renderedGroups = new Set<string>();
                      const rows: React.ReactNode[] = [];

                      sorted.forEach((item: any) => {
                        const eap = item.eapCodigo || "";
                        if (eap) {
                          const parts = eap.split(".");
                          for (let depth = 1; depth < parts.length; depth++) {
                            const parentEap = parts.slice(0, depth).join(".");
                            if (!renderedGroups.has(parentEap)) {
                              renderedGroups.add(parentEap);
                              const h = hierMap.get(parentEap);
                              const nivel = depth;
                              const isTopLevel = nivel === 1;
                              const colCount = isPreApproval ? 12 : 11;
                              rows.push(
                                <tr key={`grp-${parentEap}`}
                                  className={`${isTopLevel ? "bg-slate-100 border-l-[3px] border-l-amber-500" : "bg-gray-50/70"} ${isTopLevel && rows.length > 0 ? "border-t-2 border-t-gray-200" : ""}`}>
                                  <td className="px-3 py-1.5 font-mono text-gray-500 text-[11px]">{parentEap}</td>
                                  <td colSpan={colCount - 1} className="px-3 py-1.5">
                                    <div className="flex items-center" style={{ paddingLeft: `${(nivel - 1) * 16}px` }}>
                                      <ChevronDown className="w-3.5 h-3.5 text-gray-400 mr-1.5 flex-shrink-0" />
                                      <span className={`font-semibold ${isTopLevel ? "text-gray-800 text-[12px]" : "text-gray-700 text-[11px]"}`}>
                                        {h?.nome || `Nível ${parentEap}`}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }
                          }
                        }

                        const isEditingThis = editingItem?.id === item.id;
                        const percAnterior = Number(item.percentualAcumuladoAnterior || 0);
                        const percPeriodo = Number(item.percentualMedidoPeriodo || 0);
                        const percAcumulado = Number(item.percentualAvancoFisico || 0);
                        const itemDepth = eap ? eap.split(".").length : 0;

                        rows.push(
                          <tr key={item.id} className="hover:bg-blue-50/30 border-b border-gray-50">
                            <td className="px-3 py-2 font-mono text-[10px] text-gray-400 align-top">{eap}</td>
                            <td className="px-3 py-2">
                              <div style={{ paddingLeft: `${Math.max(0, (itemDepth - 1) * 16)}px` }} className="text-gray-800">
                                {item.descricao}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center text-gray-500">{item.unidade || "-"}</td>
                            <td className="px-2 py-2 text-right text-gray-500">{Number(item.quantidade || 0).toFixed(2)}</td>
                            <td className="px-2 py-2 text-right text-gray-500">{BRL(item.valorUnitario)}</td>
                            <td className="px-2 py-2 text-right text-gray-700 font-medium">{BRL(item.valorTotalItem)}</td>
                            <td className="px-2 py-2 text-center text-gray-500 border-l border-gray-100">{percAnterior.toFixed(1)}%</td>
                            <td className="px-2 py-2 text-center">
                              {isEditable && isEditingThis ? (
                                <div className="flex items-center gap-1 justify-center">
                                  <input
                                    type="number" step="0.1" min="0" max={100 - percAnterior}
                                    className="w-16 text-center border rounded px-1 py-0.5 text-xs"
                                    value={editingItem.valor}
                                    onChange={e => setEditingItem({ ...editingItem, valor: e.target.value })}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") {
                                        editarMedicaoItemMut.mutate({ medicaoItemId: item.id, medicaoId: m.id, companyId: contrato.companyId, percentualMedidoPeriodo: parseFloat(editingItem.valor) || 0 });
                                        setEditingItem(null);
                                      } else if (e.key === "Escape") setEditingItem(null);
                                    }}
                                    autoFocus
                                  />
                                  <span className="text-gray-400">%</span>
                                </div>
                              ) : (
                                <span
                                  className={`font-semibold ${percPeriodo > 0 ? "text-blue-700" : "text-gray-400"} ${isEditable ? "cursor-pointer hover:underline" : ""}`}
                                  onClick={() => isEditable && setEditingItem({ id: item.id, valor: percPeriodo.toFixed(1) })}
                                  title={item.editadoManualmente ? `Avanço físico real: ${Number(item.percentualFisicoReal || 0).toFixed(1)}% — Editado manualmente` : undefined}
                                >
                                  +{percPeriodo.toFixed(1)}%
                                  {item.editadoManualmente && <AlertTriangle className="w-3 h-3 inline ml-0.5 text-orange-500" />}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center font-semibold text-gray-700">{percAcumulado.toFixed(1)}%</td>
                            <td className="px-2 py-2 text-right text-gray-600">{BRL(item.valorMedidoPeriodo)}</td>
                            <td className="px-2 py-2 text-right font-semibold text-gray-900">{BRL(item.valorAcumulado)}</td>
                            {isPreApproval && (
                              <td className="px-2 py-2 text-center">
                                <button onClick={() => { if (confirm("Remover este item da medição?")) removerMedicaoItemMut.mutate({ medicaoItemId: item.id, medicaoId: m.id }); }}
                                  className="text-red-300 hover:text-red-500 p-0.5">
                                  <X className="w-3 h-3" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      });
                      return rows;
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-xs">
                      <td className="px-3 py-2 text-right text-gray-600" colSpan={9}>Total Período</td>
                      <td className="px-2 py-2 text-right text-blue-700">{BRL(m.valorMedido)}</td>
                      <td className="px-2 py-2 text-right text-gray-900">{BRL(m.valorAcumulado)}</td>
                      {isPreApproval && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <RetencoesSec m={m} contrato={contrato} isEditable={isEditable} />
            </>)}

            {isExpanded && itens.length === 0 && (
              <div className="border-t border-gray-100 p-4 text-center text-xs text-gray-400">
                Itens da medição não carregados. Expanda para ver detalhes.
              </div>
            )}
          </div>
        );
      })}

      {rejeicaoModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRejeicaoModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900">Rejeitar Medição #{rejeicaoModal.numero}</h3>
            <div>
              <Label className="text-xs">Motivo da rejeição</Label>
              <textarea className="w-full mt-1 border border-gray-200 rounded-lg p-3 text-sm min-h-[80px]" placeholder="Descreva o motivo..."
                value={motivoRejeicao} onChange={e => setMotivoRejeicao(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setRejeicaoModal(null)}>Cancelar</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" disabled={!motivoRejeicao.trim() || rejeitarMut.isPending}
                onClick={() => { rejeitarMut.mutate({ id: rejeicaoModal.id, companyId, motivo: motivoRejeicao, rejeitadoPor: "Responsável" }); setRejeicaoModal(null); }}>
                Confirmar Rejeição
              </Button>
            </div>
          </div>
        </div>
      )}

      {recalcularMut.isPending && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
              <h3 className="font-semibold text-gray-900">Recalculando medição...</h3>
            </div>
            <p className="text-sm text-gray-500">Buscando avanços do cronograma e vinculando itens ao planejamento.</p>
            <div className="mt-3 w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: "70%" }} />
            </div>
          </div>
        </div>
      )}

      {recalcResult && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setRecalcResult(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" /> Resultado do Recálculo
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-600 font-medium">Valor Medido</p>
                <p className="text-lg font-bold text-blue-800">R$ {Number(recalcResult.valorMedido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-xs text-emerald-600 font-medium">% Global</p>
                <p className="text-lg font-bold text-emerald-800">{Number(recalcResult.percentualGlobal).toFixed(1)}%</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Itens vinculados ao cronograma:</span><span className={`font-semibold ${recalcResult.vinculados > 0 ? "text-green-600" : "text-red-600"}`}>{recalcResult.vinculados}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Itens sem vínculo:</span><span className={`font-semibold ${recalcResult.naoVinculados > 0 ? "text-amber-600" : "text-green-600"}`}>{recalcResult.naoVinculados}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">EAPs no planejamento:</span><span className="font-semibold text-gray-700">{recalcResult.totalEaps}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Atividades com avanço:</span><span className="font-semibold text-gray-700">{recalcResult.totalAvancos}</span></div>
            </div>
            {recalcResult.naoVinculados > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-amber-700 mb-1">Itens não vinculados (sem Item correspondente):</p>
                <ul className="text-xs text-amber-600 space-y-0.5">
                  {recalcResult.itens.filter((i: any) => !i.vinculado).map((i: any, idx: number) => (
                    <li key={idx}>• {i.descricao} {i.eapCodigo ? `(Item: ${i.eapCodigo})` : "(sem código Item)"}</li>
                  ))}
                </ul>
                <p className="text-xs text-amber-500 mt-2">Vincule esses itens ao cronograma na aba "Itens" usando o botão "Vincular Item" para que os avanços sejam puxados automaticamente.</p>
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setRecalcResult(null)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FdTab({ contrato }: { contrato: any }) {
  const registros: any[] = contrato.fdMaterialRegistros || [];
  const fdTotal = Number(contrato.fdMaterialTotal || 0);
  const valorContrato = Number(contrato.valorTotal || 0);
  const valorLiquidoMdo = Number(contrato.valorLiquidoMdo ?? valorContrato);
  const incluiMaterial = !!contrato.naturezaIncluiMaterial;
  const modalidadeLabel: Record<string, string> = {
    fd_cliente: "FD Cliente", fd_terceiro: "FD Terceiro", fd_fc: "FD FC", normal: "Normal",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <Truck className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-amber-700">
          <p className="font-medium text-amber-800">Faturamento Direto (material)</p>
          <p className="mt-0.5">
            OCs de Compras marcadas como FD para este fornecedor/obra. O material faturado direto é
            <strong> descontado</strong> do valor do contrato — o saldo de Mão de Obra é o líquido.
            {!incluiMaterial && " Este contrato é só de Mão de Obra; FDs abaixo são informativos e não abatem o valor."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <p className="text-xs text-gray-500">Valor Fechado (Contrato)</p>
          <p className="text-base font-bold text-gray-900">{BRL(valorContrato)}</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-3 shadow-sm">
          <p className="text-xs text-amber-600">Material em FD (desconta)</p>
          <p className="text-base font-bold text-amber-700">− {BRL(fdTotal)}</p>
          <p className="text-xs text-gray-400">{registros.length} OC(s)</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-3 shadow-sm">
          <p className="text-xs text-blue-600">Líquido de Mão de Obra</p>
          <p className="text-base font-bold text-blue-700">{BRL(valorLiquidoMdo)}</p>
          {incluiMaterial && <p className="text-xs text-gray-400">contrato − FD</p>}
        </div>
      </div>

      {registros.length === 0 ? (
        <div className="py-10 text-center text-gray-400 text-sm">
          <Truck className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Nenhuma OC de Faturamento Direto vinculada a este fornecedor/obra.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium">OC</th>
                <th className="text-left px-3 py-2 font-medium">Fornecedor</th>
                <th className="text-left px-3 py-2 font-medium">Modalidade</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Vínculo</th>
                <th className="text-left px-3 py-2 font-medium">Data</th>
                <th className="text-right px-3 py-2 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {registros.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{r.numeroOc ? formatNumeroOcDisplay(r.numeroOc) : `#${r.id}`}</td>
                  <td className="px-3 py-2">{r.fornecedorNome || "—"}</td>
                  <td className="px-3 py-2 text-xs">{modalidadeLabel[r.modalidadeFd || "normal"] || r.modalidadeFd || "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {(() => {
                      const st = String(r.status || "—");
                      const cls = ["entregue", "entregue_parcial", "concluida", "recebido"].includes(st)
                        ? "bg-green-100 text-green-700"
                        : st === "aprovada" || st === "gerada"
                        ? "bg-blue-100 text-blue-700"
                        : st === "cancelada"
                        ? "bg-red-100 text-red-600"
                        : "bg-gray-100 text-gray-500";
                      return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{st.replace(/_/g, " ")}</span>;
                    })()}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.vinculo === "contrato"
                      ? <span className="text-green-600">Contrato</span>
                      : <span className="text-gray-400">Obra+Forn.</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{fmtDate(r.data)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-amber-700">{BRL(r.valor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td className="px-3 py-2 text-xs text-gray-500" colSpan={6}>Total FD</td>
                <td className="px-3 py-2 text-right text-amber-700">{BRL(fdTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function ComparativoTab({ contrato, id }: { contrato: any; id: number }) {
  const [historyItem, setHistoryItem] = useState<{ contratoItemId: number; descricao: string } | null>(null);
  const historyQuery = trpc.terceiroContratos.historicoMedicaoItem.useQuery(
    { contratoId: id, contratoItemId: historyItem?.contratoItemId || 0 },
    { enabled: !!historyItem }
  );

  const itens = contrato.itens || [];
  const hasDivergence = itens.some((i: any) => i.divergencia !== null && Math.abs(i.divergencia) > 5);
  const valorPago = Number(contrato.valorPago || 0);

  return (
    <div className="space-y-4">
      {hasDivergence && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Divergências detectadas</p>
            <p className="text-xs text-amber-600 mt-0.5">Alguns itens têm diferença significativa ({">"}5%) entre avanço físico e financeiro.</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1e3a5f] text-white">
              <th className="px-3 py-2.5 text-left font-semibold" rowSpan={2}>Item</th>
              <th className="px-3 py-2.5 text-right font-semibold" rowSpan={2}>Valor Contrato</th>
              <th className="px-3 py-2 text-center font-semibold border-l border-white/20" colSpan={2}>Físico</th>
              <th className="px-3 py-2 text-center font-semibold border-l border-white/20" colSpan={2}>Medido</th>
              <th className="px-3 py-2 text-center font-semibold border-l border-white/20" colSpan={2}>Pago</th>
              <th className="px-3 py-2 text-center font-semibold border-l border-white/20" rowSpan={2}>Δ</th>
              <th className="px-3 py-2 text-center font-semibold" rowSpan={2}></th>
            </tr>
            <tr className="bg-[#2a4a6f] text-white/80 text-[10px]">
              <th className="px-3 py-1 text-center border-l border-white/20">%</th>
              <th className="px-3 py-1 text-right">R$</th>
              <th className="px-3 py-1 text-center border-l border-white/20">%</th>
              <th className="px-3 py-1 text-right">R$</th>
              <th className="px-3 py-1 text-center border-l border-white/20">%</th>
              <th className="px-3 py-1 text-right">R$</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {itens.map((item: any) => {
              const valorTotal = Number(item.valorTotal || 0);
              const avancoFisico = item.avancoFisicoReal;
              const percFinanceiro = item.percentualFinanceiro || 0;
              const valorMedido = Number(item.valorMedidoAcumulado || 0);
              const percPago = valorTotal > 0 ? (valorPago > 0 ? Math.min((valorMedido / valorTotal) * (valorPago / Number(contrato.valorTotal || 1)), 1) * 100 : 0) : 0;
              const valorItemPago = (percPago / 100) * valorTotal;
              const div = item.divergencia;
              const hasDivItem = div !== null && Math.abs(div) > 5;

              return (
                <tr key={item.id} className={`hover:bg-blue-50/30 ${hasDivItem ? "bg-amber-50/40" : ""}`}>
                  <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate" title={item.descricao}>{item.descricao}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{BRL(valorTotal)}</td>
                  <td className="px-3 py-2 text-center border-l border-gray-100">
                    {avancoFisico !== null ? (
                      <span className="font-medium text-green-700">{avancoFisico.toFixed(1)}%</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">
                    {avancoFisico !== null ? BRL((avancoFisico / 100) * valorTotal) : "—"}
                  </td>
                  <td className="px-3 py-2 text-center border-l border-gray-100">
                    <span className="font-medium text-blue-700">{percFinanceiro.toFixed(1)}%</span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">{BRL(valorMedido)}</td>
                  <td className="px-3 py-2 text-center border-l border-gray-100">
                    <span className="text-gray-500">{percPago.toFixed(1)}%</span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">{BRL(valorItemPago)}</td>
                  <td className="px-3 py-2 text-center border-l border-gray-100">
                    {div !== null ? (
                      <span className={`font-semibold ${Math.abs(div) > 5 ? (div > 0 ? "text-red-600" : "text-amber-600") : "text-green-600"}`}>
                        {div > 0 ? <TrendingUp className="w-3 h-3 inline mr-0.5" /> : div < 0 ? <TrendingDown className="w-3 h-3 inline mr-0.5" /> : <Minus className="w-3 h-3 inline mr-0.5" />}
                        {div > 0 ? "+" : ""}{div.toFixed(1)}%
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => setHistoryItem({ contratoItemId: item.id, descricao: item.descricao })}
                      className="text-gray-400 hover:text-blue-600 p-0.5" title="Histórico">
                      <History className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold text-xs">
              <td className="px-3 py-2 text-right">Total</td>
              <td className="px-3 py-2 text-right">{BRL(contrato.valorTotal)}</td>
              <td className="px-3 py-2" colSpan={2}></td>
              <td className="px-3 py-2 text-center border-l border-gray-100">{Number(contrato.percentualMedidoGlobal || 0).toFixed(1)}%</td>
              <td className="px-3 py-2 text-right">{BRL(contrato.valorMedidoAcumulado)}</td>
              <td className="px-3 py-2 text-center border-l border-gray-100"></td>
              <td className="px-3 py-2 text-right">{BRL(valorPago)}</td>
              <td className="px-3 py-2" colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {historyItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setHistoryItem(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-gray-900">Histórico de Medição</h3>
                <p className="text-xs text-gray-500 mt-0.5">{historyItem.descricao}</p>
              </div>
              <button onClick={() => setHistoryItem(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>

            {historyQuery.isLoading ? (
              <div className="py-6 text-center text-gray-400 text-sm">Carregando...</div>
            ) : historyQuery.data && historyQuery.data.length > 0 ? (
              <div className="space-y-2">
                {historyQuery.data.map((h: any, idx: number) => {
                  const st = STATUS_MEDICAO[h.status || "rascunho"] || STATUS_MEDICAO.rascunho;
                  return (
                    <div key={idx} className="flex items-center gap-3 p-2 border border-gray-100 rounded-lg">
                      <div className="flex-shrink-0 w-16 text-center">
                        <span className="text-xs font-bold text-gray-700">Med #{h.numero}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500">{h.periodo}</span>
                          <Badge className={`text-[10px] border ${st.cls}`}>{st.label}</Badge>
                        </div>
                        <div className="flex gap-4 mt-1 text-xs">
                          <span className="text-blue-700 font-medium">+{h.percentualPeriodo.toFixed(1)}%</span>
                          <span className="text-gray-600">= {h.percentualAcumulado.toFixed(1)}% acum.</span>
                          <span className="text-gray-500">{BRL(h.valorPeriodo)}</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 w-20">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(h.percentualAcumulado, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-gray-400 text-sm">Nenhuma medição encontrada para este item.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RetencoesSec({ m, contrato, isEditable }: { m: any; contrato: any; isEditable: boolean }) {
  const [editingDescontos, setEditingDescontos] = useState(false);
  const [editingConfig, setEditingConfig] = useState(false);
  const [descontos, setDescontos] = useState(Number(m.descontos || 0));
  const [obsRetencao, setObsRetencao] = useState(m.observacoesRetencao || "");
  const [pdfLoading, setPdfLoading] = useState(false);

  const [percConfig, setPercConfig] = useState({
    percISS: Number(contrato.percISS || 0),
    percINSS: Number(contrato.percINSS || 0),
    percIRRF: Number(contrato.percIRRF || 0),
    percOutrasRetencoes: Number(contrato.percOutrasRetencoes || 0),
    percRetencaoTecnica: Number(contrato.percRetencaoTecnica || 0),
  });

  const utils = trpc.useUtils();
  const salvarRetMut = trpc.terceiroContratos.salvarRetencoes.useMutation({
    onSuccess: () => { toast.success("Descontos salvos"); setEditingDescontos(false); utils.terceiroContratos.getContrato.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const salvarConfigMut = trpc.terceiroContratos.salvarRetencaoConfig.useMutation({
    onSuccess: () => { toast.success("Configuração de retenções salva"); setEditingConfig(false); utils.terceiroContratos.getContrato.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const valorBruto = Number(m.valorMedido || 0);
  const pISS = Number(contrato.percISS || 0);
  const pINSS = Number(contrato.percINSS || 0);
  const pIRRF = Number(contrato.percIRRF || 0);
  const pOutras = Number(contrato.percOutrasRetencoes || 0);
  const pRetTecnica = Number(contrato.percRetencaoTecnica || 0);

  const retISS = valorBruto * pISS / 100;
  const retINSS = valorBruto * pINSS / 100;
  const retIRRF = valorBruto * pIRRF / 100;
  const retOutras = valorBruto * pOutras / 100;
  const retTecnica = valorBruto * pRetTecnica / 100;
  const totalRet = retISS + retINSS + retIRRF + retOutras + retTecnica;
  const valorLiquido = valorBruto - totalRet - descontos;

  const retTecnicaAcumulada = pRetTecnica > 0
    ? (contrato.medicoes || [])
        .filter((med: any) => med.status === "aprovada" || med.status === "paga")
        .reduce((acc: number, med: any) => acc + Number(med.valorMedido || 0) * pRetTecnica / 100, 0)
    : 0;

  const handleSaveDescontos = () => {
    salvarRetMut.mutate({
      medicaoId: m.id,
      companyId: contrato.companyId,
      retencaoISS: retISS,
      retencaoINSS: retINSS,
      retencaoIRRF: retIRRF,
      outrasRetencoes: retOutras,
      retencaoTecnica: retTecnica,
      descontos,
      observacoesRetencao: obsRetencao,
    });
  };

  const handlePdf = async () => {
    setPdfLoading(true);
    try {
      const inputPayload = { json: { medicaoId: m.id, companyId: contrato.companyId } };
      const res = await fetch(`/api/trpc/terceiroContratos.gerarPdfMedicao?input=${encodeURIComponent(JSON.stringify(inputPayload))}`);
      const json = await res.json();
      const data = json?.result?.data?.json || json?.result?.data;
      if (!data?.base64) throw new Error("PDF não gerado");
      const byteChars = atob(data.base64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || "medicao.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF gerado com sucesso");
    } catch (e: any) { toast.error(e.message || "Erro ao gerar PDF"); }
    setPdfLoading(false);
  };

  const hasPerc = pISS > 0 || pINSS > 0 || pIRRF > 0 || pOutras > 0 || pRetTecnica > 0;

  return (
    <div className="border-t border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Retenções e Descontos</h4>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={handlePdf} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />} Gerar PDF
          </Button>
        </div>
      </div>

      {!hasPerc && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          Nenhum percentual de retenção configurado neste contrato.
          <button className="ml-2 text-amber-900 font-semibold underline" onClick={() => setEditingConfig(true)}>
            Configurar agora
          </button>
        </div>
      )}

      {editingConfig && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-600 mb-1">Configuração de Retenções do Contrato (%)</div>
          <div className="grid grid-cols-5 gap-3">
            {[
              { key: "percISS", label: "ISS %" },
              { key: "percINSS", label: "INSS %" },
              { key: "percIRRF", label: "IRRF %" },
              { key: "percOutrasRetencoes", label: "Outras %" },
              { key: "percRetencaoTecnica", label: "Ret. Técnica %" },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-[10px] text-gray-500">{f.label}</Label>
                <Input type="number" step="0.01" min="0" max="100" className="text-xs h-7"
                  value={(percConfig as any)[f.key]}
                  onChange={e => setPercConfig(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setEditingConfig(false)}>Cancelar</Button>
            <Button size="sm" className="text-xs h-7 gap-1" disabled={salvarConfigMut.isPending}
              onClick={() => salvarConfigMut.mutate({ contratoId: contrato.id, companyId: contrato.companyId, ...percConfig })}>
              <Save className="w-3 h-3" /> Salvar Config
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
        <div className="bg-gray-50 rounded-lg p-2.5">
          <div className="text-gray-400 text-[10px]">Valor Bruto</div>
          <div className="font-semibold text-gray-900">{BRL(valorBruto)}</div>
        </div>
        <div className="bg-red-50 rounded-lg p-2.5">
          <div className="text-gray-400 text-[10px] flex items-center gap-1">
            Retenções
            {hasPerc && !editingConfig && (
              <button className="text-gray-300 hover:text-gray-500" onClick={() => setEditingConfig(true)} title="Configurar %">
                <Settings className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="font-semibold text-red-600">{totalRet > 0 ? `- ${BRL(totalRet)}` : BRL(0)}</div>
          {hasPerc && (
            <div className="text-[10px] text-gray-400 mt-0.5 space-y-px">
              {pISS > 0 && <div>ISS {pISS}%: {BRL(retISS)}</div>}
              {pINSS > 0 && <div>INSS {pINSS}%: {BRL(retINSS)}</div>}
              {pIRRF > 0 && <div>IRRF {pIRRF}%: {BRL(retIRRF)}</div>}
              {pOutras > 0 && <div>Outras {pOutras}%: {BRL(retOutras)}</div>}
              {pRetTecnica > 0 && <div>Ret. Técnica {pRetTecnica}%: {BRL(retTecnica)} *</div>}
            </div>
          )}
        </div>
        <div className="bg-orange-50 rounded-lg p-2.5">
          <div className="text-gray-400 text-[10px] flex items-center gap-1">
            Descontos
            {isEditable && !editingDescontos && (
              <button className="text-gray-300 hover:text-gray-500" onClick={() => setEditingDescontos(true)} title="Editar descontos">
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
          {editingDescontos ? (
            <div className="flex items-center gap-1 mt-0.5">
              <Input type="number" step="0.01" min="0" className="text-xs h-6 w-24"
                value={descontos}
                onChange={e => setDescontos(parseFloat(e.target.value) || 0)}
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter") handleSaveDescontos();
                  if (e.key === "Escape") setEditingDescontos(false);
                }}
              />
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingDescontos(false)}>
                <X className="w-3 h-3" />
              </Button>
              <Button size="sm" className="h-6 px-2 text-[10px]" disabled={salvarRetMut.isPending} onClick={handleSaveDescontos}>
                <Save className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div className="font-semibold text-orange-600">{descontos > 0 ? `- ${BRL(descontos)}` : BRL(0)}</div>
          )}
        </div>
        <div className="bg-blue-50 rounded-lg p-2.5">
          <div className="text-gray-400 text-[10px]">Valor Líquido</div>
          <div className="font-bold text-blue-700">{BRL(valorLiquido)}</div>
        </div>
        {pRetTecnica > 0 && (
          <div className="col-span-5 bg-amber-50 border border-amber-200 rounded p-2 text-[10px] text-amber-700 space-y-0.5">
            <div className="font-semibold">* Retenção Técnica ({pRetTecnica}%) — liberada somente após a última medição do contrato.</div>
            <div>Esta medição: {BRL(retTecnica)} | Acumulado aprovado no contrato: <span className="font-bold">{BRL(retTecnicaAcumulada)}</span></div>
          </div>
        )}
        {obsRetencao && (
          <div className="col-span-5 text-[10px] text-gray-400">Obs.: {obsRetencao}</div>
        )}
      </div>
    </div>
  );
}

function ItemsTreeTable({ contrato, id, pct, removerItemMut }: { contrato: any; id: number; pct: number; removerItemMut: any }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const hierarchy: any[] = (contrato as any).itensHierarchy || [];
  const hasHierarchy = hierarchy.length > 0;

  const toggle = (eap: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(eap)) next.delete(eap);
      else next.add(eap);
      return next;
    });
  };

  const isHidden = (eap: string) => {
    if (!eap) return false;
    const parts = eap.split(".");
    for (let i = 1; i < parts.length; i++) {
      const ancestor = parts.slice(0, i).join(".");
      if (collapsed.has(ancestor)) return true;
    }
    return false;
  };

  type Row = { type: "grupo"; eapCodigo: string; nome: string; nivel: number }
           | { type: "item"; item: any; nivel: number };

  const buildRows = (): Row[] => {
    if (!hasHierarchy) {
      return contrato.itens.map((item: any) => ({ type: "item" as const, item, nivel: 0 }));
    }

    const itemsByEap = new Map<string, any[]>();
    const itemsNoEap: any[] = [];
    for (const it of contrato.itens) {
      const eap = (it as any).eapCodigo;
      if (eap) {
        if (!itemsByEap.has(eap)) itemsByEap.set(eap, []);
        itemsByEap.get(eap)!.push(it);
      } else {
        itemsNoEap.push(it);
      }
    }

    const allEaps = [...new Set([...hierarchy.map((h: any) => h.eapCodigo), ...contrato.itens.map((it: any) => it.eapCodigo).filter(Boolean)])] as string[];
    allEaps.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const rows: Row[] = [];
    const groupsPlaced = new Set<string>();

    for (const eap of allEaps) {
      const grupo = hierarchy.find((h: any) => h.eapCodigo === eap);
      if (grupo && !groupsPlaced.has(eap)) {
        groupsPlaced.add(eap);
        rows.push({ type: "grupo", eapCodigo: grupo.eapCodigo, nome: grupo.nome, nivel: grupo.nivel });
      }
      const items = itemsByEap.get(eap);
      if (items) {
        for (const it of items) {
          rows.push({ type: "item", item: it, nivel: it.atividadeNivel ?? (eap ? eap.split(".").length : 0) });
        }
      }
    }

    for (const it of itemsNoEap) {
      rows.push({ type: "item" as const, item: it, nivel: 0 });
    }

    return rows;
  };

  const rows = buildRows();

  const minNivel = hasHierarchy
    ? Math.min(...hierarchy.map((h: any) => h.nivel ?? h.eapCodigo.split(".").length), ...contrato.itens.map((it: any) => it.eapCodigo ? it.eapCodigo.split(".").length : 99))
    : 0;

  const hasChildren = (eap: string) => {
    return rows.some(r => {
      const re = r.type === "grupo" ? r.eapCodigo : (r.item?.eapCodigo || "");
      return re !== eap && re.startsWith(eap + ".");
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#1e3a5f] text-white text-xs">
            <th className="px-4 py-2.5 text-left font-semibold w-[130px]">Item</th>
            <th className="px-4 py-2.5 text-left font-semibold">Descrição</th>
            <th className="px-4 py-2.5 text-center font-semibold w-[60px]">Un</th>
            <th className="px-4 py-2.5 text-right font-semibold w-[100px]">Qtd</th>
            <th className="px-4 py-2.5 text-right font-semibold w-[100px]">Total</th>
            <th className="px-4 py-2.5 text-center font-semibold w-[60px]">%</th>
            <th className="px-4 py-2.5 text-center font-semibold w-[40px]"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            if (row.type === "grupo") {
              if (isHidden(row.eapCodigo)) return null;
              const depth = (row.nivel ?? row.eapCodigo.split(".").length) - minNivel;
              const indent = depth * 24;
              const isCollapsed = collapsed.has(row.eapCodigo);
              const expandable = hasChildren(row.eapCodigo);
              return (
                <tr key={`g-${row.eapCodigo}`} className="border-b border-gray-100 bg-gray-50/50 hover:bg-gray-100/50 cursor-pointer" onClick={() => expandable && toggle(row.eapCodigo)}>
                  <td className="px-4 py-2">
                    <div style={{ paddingLeft: indent }} className="flex items-center gap-1">
                      {expandable && (
                        isCollapsed
                          ? <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                          : <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      )}
                      <span className="font-mono text-xs font-semibold text-gray-700">{row.eapCodigo}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-bold text-gray-900 uppercase text-xs tracking-wide">{row.nome}:</span>
                  </td>
                  <td colSpan={5} />
                </tr>
              );
            }

            const item = row.item;
            const eap = item.eapCodigo || "";
            if (isHidden(eap)) return null;

            const depth = hasHierarchy ? ((row.nivel ?? 0) - minNivel) * 24 : 0;
            return (
              <tr key={item.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                <td className="px-4 py-2">
                  <div style={{ paddingLeft: Math.max(0, depth) }}>
                    <span className="font-mono text-xs text-gray-500">{eap || "—"}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className="text-gray-800">{item.descricao}</span>
                </td>
                <td className="px-4 py-2 text-center text-gray-500">{item.unidade || "—"}</td>
                <td className="px-4 py-2 text-right text-gray-700 font-mono">{Number(item.quantidade).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2 text-right font-semibold text-gray-900">{BRL(item.valorTotal)}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-xs font-semibold ${Number(item.percentualMedidoAcumulado) >= 100 ? "text-green-700" : Number(item.percentualMedidoAcumulado) > 0 ? "text-blue-700" : "text-gray-400"}`}>
                    {Number(item.percentualMedidoAcumulado).toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <button onClick={(e) => { e.stopPropagation(); removerItemMut.mutate({ id: item.id, contratoId: id }); }} className="text-red-300 hover:text-red-500 p-0.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 border-t border-gray-200">
            <td colSpan={4} className="px-4 py-2.5 text-right font-semibold text-gray-700 text-xs">Total</td>
            <td className="px-4 py-2.5 text-right font-bold text-gray-900">{BRL(contrato.valorTotal)}</td>
            <td className="px-4 py-2.5 text-center font-bold text-blue-700 text-xs">{pct.toFixed(1)}%</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
