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
  Eye, EyeOff, BarChart3, Loader2, FileDown, Settings, Undo2, Send, MapPin, Truck, Ban, Info, Lock, Download, ShieldCheck, Ruler, PenLine, Clock3, XCircle,
  UserRound, Link2, BadgeCheck, Mail, Check,
  CheckCircle2, FilePlus, Camera, Paperclip, Wallet,
} from "lucide-react";
import { gerarContratoAssinadoPdf } from "@/lib/contratoAssinadoPdf";
import { buildContratoPreviewSrcDoc } from "@/lib/contratoSrcDoc";
import { buildAnexoSections } from "@/lib/contratoAnexoPages";
import { toast } from "sonner";
import { formatNumeroOcDisplay } from "@shared/numeroOc";
import { OcMiniDialog } from "@/components/compras/ItemCatalogo";
import { useAuth } from "@/_core/hooks/useAuth";
import { useModule } from "@/contexts/ModuleContext";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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

type Tab = "itens" | "medicoes" | "comparativo" | "documentos" | "documento" | "fd" | "aditivos";

export default function ContratoDetalheWrapper() {
  const [, params] = useRoute("/terceiros/contratos/:id");
  const id = parseInt(params?.id || "0");
  return <ContratoDetalheInner key={id} routeId={id} />;
}

function ContratoDetalheInner({ routeId }: { routeId: number }) {
  const [, navigate] = useLocation();
  const { activeModule } = useModule();
  const emModuloMedicoes = activeModule === "medicao-terceiros";
  const id = routeId;
  const urlParams = new URLSearchParams(window.location.search);
  const medicaoIdFromUrl = urlParams.get("medicao") ? parseInt(urlParams.get("medicao")!) : null;
  const tabFromUrl = urlParams.get("tab") as Tab | null;
  const validTabs: Tab[] = ["itens", "medicoes", "comparativo", "documentos", "documento", "fd"];
  const [tab, setTab] = useState<Tab>(
    tabFromUrl && validTabs.includes(tabFromUrl) && !(emModuloMedicoes && tabFromUrl === "documento") ? tabFromUrl
    : medicaoIdFromUrl ? "medicoes"
    : emModuloMedicoes ? "medicoes"
    : "documento"
  );
  const [showGerarMedicao, setShowGerarMedicao] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [editingDates, setEditingDates] = useState(false);
  const [editDI, setEditDI] = useState("");
  const [editDT, setEditDT] = useState("");
  const [editingCriterios, setEditingCriterios] = useState(false);
  const [critForm, setCritForm] = useState({ diaMedicao: 25, diaPagamento: 10, prazoAprovacaoDias: 5, prazoEmissaoNf: 3, prazoLiberacaoOp: 5, documentacaoNecessaria: "", pagamentoConformeRecebimento: 0 });
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7));
  const [medicaoDataInicio, setMedicaoDataInicio] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [newDoc, setNewDoc] = useState({ tipo: "INSS", descricao: "", competencia: "", dataVencimento: "", bloqueiaPagemento: false });
  const [descExpanded, setDescExpanded] = useState(false);
  const [editingNatureza, setEditingNatureza] = useState(false);
  const [editingObjeto, setEditingObjeto] = useState(false);
  const [editObjetoValue, setEditObjetoValue] = useState("");

  // Documento tab state
  const [textoEditado, setTextoEditado] = useState<string | null>(null);
  const [obsRevisao, setObsRevisao] = useState("");
  const [showRevisoes, setShowRevisoes] = useState(false);
  const [confirmarMain, setConfirmarMain] = useState<ConfirmState>(null);
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

  // Ao abrir o modal da 1ª medição, semeia o INÍCIO com a data de início da obra/contrato
  // (`contrato.dataInicio`). O FIM é sempre derivado do "Dia da Medição" do contrato (corte em/
  // após o início), então não precisa ser semeado aqui. Início segue editável.
  useEffect(() => {
    if (!showGerarMedicao || !contrato) return;
    if ((contrato.medicoes?.length || 0) > 0) return; // medições seguintes são calculadas, não vêm do state
    const inicioObra = contrato.dataInicio
      ? contrato.dataInicio.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    setMedicaoDataInicio(inicioObra);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGerarMedicao]);

  // No módulo de Medições a aba de gestão "Contrato" (documento) não existe — bloqueia URLs antigas (?tab=documento)
  useEffect(() => {
    if (emModuloMedicoes && tab === "documento") setTab("medicoes");
  }, [emModuloMedicoes, tab]);

  const recalcularDatasMut = trpc.terceiroContratos.recalcularDatasCronograma.useMutation({
    onSuccess: (r) => { toast.success(`Datas atualizadas do cronograma${r.usouEap ? " (via EAP)" : " (todas atividades)"}: ${fmtDate(r.dataInicio)} → ${fmtDate(r.dataTermino)}`); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const atualizarContratoMut = trpc.terceiroContratos.atualizarContrato.useMutation({
    onSuccess: () => { toast.success("Contrato atualizado!"); utils.terceiroContratos.getContrato.invalidate({ id }); setEditingDates(false); setEditingCriterios(false); setEditingDocDate(null); setEditingNatureza(false); setEditingObjeto(false); },
    onError: (e) => toast.error(e.message),
  });

  const excluirMedicaoMut = trpc.terceiroContratos.excluirMedicao.useMutation({
    onSuccess: (res: any) => {
      const nAd = Number(res?.aditivosExcluidos || 0);
      const vRev = Number(res?.valorAditivoRevertido || 0);
      toast.success(nAd > 0
        ? `Medição excluída — ${nAd} aditivo(s) originado(s) por ela também ${nAd > 1 ? "foram excluídos" : "foi excluído"}${vRev > 0.01 ? ` e ${vRev.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} revertidos do contrato` : ""}.`
        : "Medição excluída");
      utils.terceiroContratos.getContrato.invalidate({ id });
      utils.terceiroContratos.listarAditivos.invalidate({ contratoId: id, companyId: contrato?.companyId });
    },
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

  // Rev. 4817 — encerramento com devolução da sobra p/ Realocação de Verba
  const [showEncerrar, setShowEncerrar] = useState(false);
  const encerrarContratoMut = trpc.terceiroContratos.encerrarContrato.useMutation({
    onSuccess: (res: any) => {
      const sobra = Number(res?.sobra || 0);
      toast.success(sobra > 0.01
        ? `Contrato encerrado — sobra de ${sobra.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} creditada na Realocação de Verba (Compras).`
        : "Contrato encerrado — sem sobra a devolver.");
      utils.terceiroContratos.getContrato.invalidate({ id });
      setShowEncerrar(false);
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


  const removerItemMut = trpc.terceiroContratos.removerItem.useMutation({
    onSuccess: () => { toast.success("Item removido"); utils.terceiroContratos.getContrato.invalidate({ id }); },
  });

  const relinkEapMut = trpc.terceiroContratos.relinkEapItens.useMutation({
    onSuccess: (data) => { toast.success(data.msg); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  // Task #86 — criação MANUAL da medição (sem cruzamento automático do planejamento).
  const criarMedicaoManualMut = trpc.terceiroContratos.criarMedicaoManual.useMutation({
    onSuccess: () => {
      toast.success("Medição criada. Lance o medido do período por item na planilha.");
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

  // Rev. 3079 — Medição de Terceiros: config (3 níveis) + FD do período + 3 níveis de aprovação.
  const { data: medCfg } = trpc.medicaoConfig.getConfig.useQuery(
    { companyId: (contrato as any)?.companyId ?? 0 },
    { enabled: !!(contrato as any)?.companyId },
  );
  const { data: fdsTerceiro } = trpc.terceiroContratos.listarFdsTerceiro.useQuery(
    { contratoId: id, companyId: (contrato as any)?.companyId ?? 0 },
    { enabled: tab === "medicoes" && id > 0 && !!(contrato as any)?.companyId },
  );
  const invalidarMedicoes = () => { utils.terceiroContratos.getContrato.invalidate({ id }); utils.terceiroContratos.listarFdsTerceiro.invalidate({ contratoId: id, companyId: (contrato as any)?.companyId ?? 0 }); };
  // Rev. 4832 — padrão da OBRA p/ condição de pagamento (contrato null = herda a obra)
  const { data: obraPadrao } = trpc.obras.getById.useQuery(
    { id: (contrato as any)?.obraId ?? 0 },
    { enabled: !!(contrato as any)?.obraId },
  );
  // Rev. 4814 — contador p/ a aba "Aditivos" na barra de navegação
  const { data: aditivosTopo } = trpc.terceiroContratos.listarAditivos.useQuery(
    { contratoId: id, companyId: (contrato as any)?.companyId ?? 0 },
    { enabled: id > 0 && !!(contrato as any)?.companyId },
  );
  const aprovarGestorMut = trpc.terceiroContratos.aprovarNivelGestor.useMutation({
    onSuccess: () => { toast.success("Aprovado pelo gestor da obra — aguardando sócio adm."); invalidarMedicoes(); },
    onError: (e) => toast.error(e.message),
  });
  const aprovarSocioMut = trpc.terceiroContratos.aprovarNivelSocio.useMutation({
    onSuccess: () => { toast.success("Aprovado pelo sócio adm — financeiro a pagar liberado!"); invalidarMedicoes(); },
    onError: (e) => toast.error(e.message),
  });
  const criarFdTerceiroMut = trpc.terceiroContratos.criarFdTerceiro.useMutation({
    onSuccess: () => { toast.success("FD lançado na medição."); invalidarMedicoes(); },
    onError: (e) => toast.error(e.message),
  });
  const excluirFdTerceiroMut = trpc.terceiroContratos.excluirFdTerceiro.useMutation({
    onSuccess: () => { toast.success("FD removido."); invalidarMedicoes(); },
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
    onError: (e) => toast.error(e.message),
  });
  // Rev. 5055 — opção de GERAR LINK de assinatura além do e-mail (pedido do usuário).
  const [fcSignModo, setFcSignModo] = useState<"email" | "link">("email");
  const enviarEnvelopeContratoMut = trpc.integrasign.enviarParaAssinatura.useMutation({ onError: (e) => toast.error(e.message) });
  const [contratoLinksEnvId, setContratoLinksEnvId] = useState<number | null>(null);
  const contratoLinksEnv = trpc.integrasign.getEnvelope.useQuery(
    { companyId: contrato?.companyId ?? 0, id: contratoLinksEnvId ?? 0 },
    { enabled: !!contratoLinksEnvId && !!contrato, refetchInterval: 5000 },
  );
  const reenviarEmailContratoMut = trpc.integrasign.reenviarNotificacao.useMutation({ onError: (e) => toast.error(e.message) });
  // Recuperável: se a criação deu certo mas o ENVIO falhou, guarda o id do
  // rascunho e o retry só reenvia (não cria envelope duplicado).
  const envRascunhoRef = useRef<number | null>(null);
  const handleCriarEnvelopeContrato = async () => {
    const empNome = (contrato as any).empresa?.razaoSocial || "";
    try {
      const env: any = envRascunhoRef.current != null
        ? { id: envRascunhoRef.current }
        : await criarEnvelopeMut.mutateAsync({
        companyId: contrato.companyId,
        contratoTerceiroId: id,
        obraId: contrato.obraId || undefined,
        titulo: `${contrato.numeroContrato} — ${empNome}`.trim(),
        descricao: contrato.descricao || undefined,
        textoContrato: textoAtual || undefined,
        signatarios: fcSignSignatarios.map((s, i) => ({ ...s, ordemAssinatura: i + 1, empresaNome: s.empresaNome || empNome })),
      });
      envRascunhoRef.current = env.id;
      await enviarEnvelopeContratoMut.mutateAsync({ companyId: contrato.companyId, envelopeId: env.id, enviarEmail: fcSignModo === "email" } as any);
      envRascunhoRef.current = null;
      setShowFcSignModal(false);
      if (fcSignModo === "link") {
        setContratoLinksEnvId(env.id);
        toast.success("Links de assinatura ativos! Copie e envie para cada signatário.");
      } else {
        toast.success("Envelope enviado! Os signatários foram notificados por e-mail.");
        navigate(`/integrasign?envelope=${env.id}`);
      }
    } catch { /* onError já mostrou o toast */ }
  };

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

  const contratoAssinadoDoc = (contrato as any)?.assinaturaStatus === "concluido";
  // Rev. 5054 — pedido do user (IMG_5554): o documento no detalhe deve ter a
  // formatação EXATAMENTE igual ao template da Central / prévia da cotação.
  // Renderiza o HTML do servidor (mesmo motor buildFcDocument da prévia) em vez
  // da aproximação linha-a-linha em texto puro. Texto puro segue como fonte do
  // FcSign/PDF e como fallback (template legado sem HTML ou edição manual).
  const docHtmlQ = trpc.terceiroContratos.documentoHtml.useQuery(
    { contratoId: id },
    // refetchOnWindowFocus off: um refetch trocava a identidade de anexosContrato
    // e CANCELAVA a renderização dos anexos no meio (iPad: trocar de app/print).
    { enabled: tab === "documento" && id > 0 && !!contrato && !contratoAssinadoDoc && !textoEditado, staleTime: 5 * 60_000, refetchOnWindowFocus: false },
  );
  // Rev. 5054 — anexos (proposta, projetos, cronograma, outros) renderizados
  // DENTRO do documento após as assinaturas, igual à prévia da cotação
  // (pedido do user IMG_5555: "Cadê os anexos?").
  const [docAnexoSections, setDocAnexoSections] = useState<Array<{ titulo: string; subtitulo?: string; pages: string[] }> | null>(null);
  const [docAnexoStatus, setDocAnexoStatus] = useState<"idle" | "renderizando" | "ok" | "erro">("idle");
  // Chave ESTÁVEL: identidade do objeto anexosContrato muda a cada refetch do RQ
  // e reiniciava/cancelava a renderização (páginas de PDF levam vários segundos).
  const [docAnexoTentativa, setDocAnexoTentativa] = useState(0);
  const docAnexoKey = `${docAnexoTentativa}|${(docHtmlQ.data as any)?.propostaUrl ?? ""}|${JSON.stringify((docHtmlQ.data as any)?.anexosContrato ?? null)}`;
  const docAnexoDadosRef = useRef<any>(null);
  docAnexoDadosRef.current = docHtmlQ.data;
  useEffect(() => {
    let cancel = false;
    setDocAnexoSections(null);
    const dados = docAnexoDadosRef.current;
    if (!(dados as any)?.propostaUrl) { setDocAnexoStatus("idle"); return; }
    setDocAnexoStatus("renderizando");
    (async () => {
      try {
        const sections = await buildAnexoSections(dados, () => cancel);
        if (cancel) return;
        if (sections) { setDocAnexoSections(sections); setDocAnexoStatus("ok"); }
        else setDocAnexoStatus("erro");
      } catch (e) {
        console.error("[ContratoDetalhe] Falha ao renderizar anexos:", e);
        if (!cancel) setDocAnexoStatus("erro");
      }
    })();
    return () => { cancel = true; };
  }, [docAnexoKey]);
  const [docLogoDataUrl, setDocLogoDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    setDocLogoDataUrl(null);
    const logoUrl = String((docHtmlQ.data as any)?.docMeta?.empresa?.logoUrl || "");
    if (!logoUrl) return;
    (async () => {
      try {
        // iframe sandboxed (origem opaca, sem cookie) não carrega /uploads autenticado
        const blob = await fetch(logoUrl).then(r => { if (!r.ok) throw new Error("logo"); return r.blob(); });
        const dataUrl = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(blob); });
        if (!cancel && dataUrl.startsWith("data:image/")) setDocLogoDataUrl(dataUrl);
      } catch { /* fallback: URL absoluta no builder */ }
    })();
    return () => { cancel = true; };
  }, [(docHtmlQ.data as any)?.docMeta?.empresa?.logoUrl]);

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
      <div className="p-5 pt-0 space-y-5 max-w-5xl mx-auto">
        {/* Rev. 4799 — barra fixa: cabeçalho + abas ficam SEMPRE no topo;
            o conteúdo rola por baixo (pedido do usuário, navegação no iPad). */}
        <div className="sticky top-14 z-30 -mx-5 px-5 pt-3 pb-0 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm space-y-2">
        {/* Header */}
        <div className="flex items-start gap-3">
          <button onClick={() => navigate("/terceiros/contratos")} className="p-2 hover:bg-gray-100 rounded-lg mt-0.5 shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {contrato.numeroContrato && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">{contrato.numeroContrato}</span>}
              {(() => {
                // A tag de assinatura segue a regra ADESIVA do envelope FCSign (assinaturaStatus),
                // NÃO o `status` cru — que pode ficar congelado em "aguardando_assinaturas" mesmo
                // após o contrato já ter sido assinado. Mostrar o cru aqui confunde o usuário.
                const rawStatus = contrato.status as string | undefined;
                const ass = (contrato as any).assinaturaStatus as string | null | undefined;
                const ehEtapaAssinatura = rawStatus === "aguardando_assinaturas" || rawStatus === "em_assinatura" || rawStatus === "rascunho";
                if (ass === "concluido") {
                  return <Badge className="text-xs border bg-emerald-100 text-emerald-800 border-emerald-200 inline-flex items-center gap-1"><CheckCircle className="w-3 h-3" />Assinado</Badge>;
                }
                if (ehEtapaAssinatura) {
                  return <Badge className="text-xs border bg-amber-100 text-amber-800 border-amber-200 inline-flex items-center gap-1"><Clock className="w-3 h-3" />Falta assinatura</Badge>;
                }
                return <Badge className={`text-xs border ${STATUS_MEDICAO[rawStatus || "ativo"]?.cls || ""}`}>{rawStatus}</Badge>;
              })()}
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
            !emModuloMedicoes ? (
              <Button onClick={() => setShowGerarMedicao(true)} className="gap-2 bg-blue-600 hover:bg-blue-700 shrink-0">
                <ClipboardCheck className="w-4 h-4" /> Nova Medição
              </Button>
            ) : null
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

        {/* Tabs — dentro da barra fixa */}
        <div className="flex overflow-x-auto">
          {((emModuloMedicoes
            ? (["medicoes", "aditivos", "itens", "comparativo", "documentos"] as Tab[])
            : (["documento", "itens", "medicoes", "aditivos", "comparativo", "documentos"] as Tab[])
          ).concat(
            (contrato.naturezaIncluiMaterial || (contrato.fdMaterialRegistros?.length || 0) > 0) ? (["fd"] as Tab[]) : []
          )).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t === "itens" ? `Itens (${contrato.itens.length})` :
               t === "medicoes" ? `Medições (${contrato.medicoes.length})` :
               t === "aditivos" ? <span className="flex items-center gap-1.5"><FilePlus className="w-3.5 h-3.5" />Aditivos ({(aditivosTopo || []).length})</span> :
               t === "comparativo" ? <span className="flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Comparativo</span> :
               t === "documentos" ? `Docs (${contrato.documentos.length})` :
               t === "fd" ? <span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" />FD ({contrato.fdMaterialRegistros?.length || 0})</span> :
               <span className="flex items-center gap-1.5"><FileEdit className="w-3.5 h-3.5" />Contrato</span>}
            </button>
          ))}
        </div>
        </div>

        {/* Contexto enxuto p/ medição — só no módulo de Medição de Terceiros */}
        {emModuloMedicoes && (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {contrato.descricao && (
              <span className="flex items-center gap-1.5 text-gray-600 min-w-0">
                <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="truncate max-w-[460px]" title={contrato.descricao}>{contrato.descricao}</span>
              </span>
            )}
            <span className="flex items-center gap-1.5 text-gray-600">
              <ClipboardCheck className="w-4 h-4 text-gray-400 shrink-0" />
              Dia da Medição: <strong className="text-gray-800">Dia {(contrato as any).diaMedicao ?? 25}</strong>
            </span>
          </div>
        )}

        {/* Rev. 4798 — layout enxuto: os blocos gerais do contrato (objeto,
            vigência, critérios, portal, resumo, barras) só aparecem na aba
            "Contrato". Nas outras abas (Medições, Itens…) fica só o conteúdo
            da aba — pedido do usuário: "quando clico em Medições, só medições". */}
        {tab === "documento" && (<>
        {/* Ações de Admin Master — cancelamento (soft) e exclusão definitiva (hard) */}
        {isMaster && !emModuloMedicoes && (
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

        {/* Rev. 4817 — Encerrar contrato: sobra volta como crédito p/ Realocação de Verba */}
        {!emModuloMedicoes && (contrato.status === "ativo" || contrato.status === "concluido") && (
          <div className="flex items-center gap-3 flex-wrap rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2">
            <span className="text-[11px] text-emerald-800">
              <strong>Encerrar contrato:</strong> fecha o contrato e devolve a verba não medida como <strong>crédito na Realocação de Verba</strong> (útil em contratos com área estimada).
            </span>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-100 ml-auto"
              onClick={() => setShowEncerrar(true)}>
              <ClipboardCheck className="w-3.5 h-3.5" /> Encerrar contrato
            </Button>
          </div>
        )}

        {/* Objeto do Contrato — escopo resumido e legível, editável p/ padronização */}
        {!emModuloMedicoes && (
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
        )}

        {/* Vigência do Contrato — destaque */}
        {!emModuloMedicoes && (() => {
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
        {!emModuloMedicoes && (() => {
          const dm = (contrato as any).diaMedicao ?? 25;
          const dp = (contrato as any).diaPagamento ?? 10;
          const pa = (contrato as any).prazoAprovacaoDias ?? 5;
          const pnf = (contrato as any).prazoEmissaoNf ?? 3;
          const plop = (contrato as any).prazoLiberacaoOp ?? 5;
          const docNec = (contrato as any).documentacaoNecessaria || "";
          // Rev. 4832 — tri-state: valor do contrato; se null, herda o padrão da obra
          // (mesma precedência do título automático no Contas a Pagar).
          const confReceb = Number((contrato as any).pagamentoConformeRecebimento ?? (obraPadrao as any)?.terceiroPagamentoConformeRecebimento ?? 0) === 1;

          const etapas = [
            { num: 1, titulo: "Medição Física", desc: `Dia ${dm} de cada mês — levantamento e conferência do avanço físico`, icon: "📏", cor: "bg-blue-500" },
            { num: 2, titulo: "Aprovação da Medição", desc: `Até ${pa} dias úteis após medição — aprovação pelo gestor do contrato`, icon: "✅", cor: "bg-green-500" },
            { num: 3, titulo: "Documentação", desc: docNec || "Envio de NF, certidões e documentação comprobatória", icon: "📄", cor: "bg-amber-500" },
            { num: 4, titulo: "Emissão da NF", desc: `Até ${pnf} dias úteis após aprovação — liberação para emissão da nota fiscal`, icon: "🧾", cor: "bg-purple-500" },
            { num: 5, titulo: "Liberação da OP", desc: `Até ${plop} dias úteis após NF — liberação da Ordem de Pagamento`, icon: "💰", cor: "bg-emerald-500" },
            { num: 6, titulo: "Pagamento", desc: confReceb ? "Conforme recebimento da medição do cliente — sem dia fixo" : `Dia ${dp} do mês subsequente — crédito em conta`, icon: "🏦", cor: "bg-indigo-500" },
          ];

          return (
            <div className="rounded-xl border-2 border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Critérios de Medição e Pagamento</span>
                </div>
                {!editingCriterios && !contratoAssinado && (
                  <button
                    onClick={() => {
                      setCritForm({ diaMedicao: dm, diaPagamento: dp, prazoAprovacaoDias: pa, prazoEmissaoNf: pnf, prazoLiberacaoOp: plop, documentacaoNecessaria: docNec, pagamentoConformeRecebimento: confReceb ? 1 : 0 });
                      setEditingCriterios(true);
                    }}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 hover:underline"
                  >
                    <Settings className="w-3 h-3" /> Configurar
                  </button>
                )}
                {!editingCriterios && contratoAssinado && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Lock className="w-3 h-3" /> Travado após assinatura
                  </span>
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
                      <Input type="number" min={1} max={31} className="mt-1 text-sm" value={critForm.diaPagamento} disabled={critForm.pagamentoConformeRecebimento === 1} onChange={e => setCritForm(f => ({ ...f, diaPagamento: parseInt(e.target.value) || 10 }))} />
                    </div>
                  </div>
                  <label className="flex items-start gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg cursor-pointer">
                    <input type="checkbox" className="mt-0.5" checked={critForm.pagamentoConformeRecebimento === 1}
                      onChange={e => setCritForm(f => ({ ...f, pagamentoConformeRecebimento: e.target.checked ? 1 : 0 }))} />
                    <span className="text-xs text-indigo-900 leading-relaxed">
                      <span className="font-semibold">Pagamento conforme recebimento do cliente</span> — este contrato não tem dia fixo de pagamento: o título entra no Contas a Pagar com vencimento previsto no fim do mês seguinte e é pago quando a medição do cliente for recebida.
                    </span>
                  </label>
                  <div>
                    <Label className="text-xs text-gray-600">Documentação Necessária para Liberação</Label>
                    <textarea className="w-full mt-1 text-sm border rounded-lg p-2 min-h-[80px] resize-y" placeholder="Ex: Nota Fiscal, CND FGTS, CND INSS, Certidão Trabalhista, Boletim de Medição assinado..."
                      value={critForm.documentacaoNecessaria} onChange={e => setCritForm(f => ({ ...f, documentacaoNecessaria: e.target.value }))} />
                  </div>
                  <div className="flex gap-2 p-3 bg-blue-50 rounded-lg">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-blue-900/80 leading-relaxed">
                      O <span className="font-semibold">Dia da Medição</span> é a data de corte do período e pode variar por obra. Defina-o antes de enviar o contrato para assinatura — depois de assinado fica travado. Ao alterá-lo, o período das próximas medições se ajusta automaticamente.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingCriterios(false)}><X className="w-3 h-3 mr-1" /> Cancelar</Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={atualizarContratoMut.isPending || contratoAssinado}
                      onClick={() => atualizarContratoMut.mutate({
                        id, companyId: contrato.companyId,
                        diaMedicao: critForm.diaMedicao,
                        diaPagamento: critForm.diaPagamento,
                        prazoAprovacaoDias: critForm.prazoAprovacaoDias,
                        prazoEmissaoNf: critForm.prazoEmissaoNf,
                        prazoLiberacaoOp: critForm.prazoLiberacaoOp,
                        documentacaoNecessaria: critForm.documentacaoNecessaria,
                        pagamentoConformeRecebimento: critForm.pagamentoConformeRecebimento,
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
                      { label: "Dia do Pagamento", value: confReceb ? "Conf. recebimento" : `Dia ${dp}` },
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
        {!emModuloMedicoes && (() => {
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
        {!emModuloMedicoes && showVariacao && (
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
        </>)}

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
          <MedicoesTab contrato={contrato} id={id} emModuloMedicoes={emModuloMedicoes} aprovarMut={aprovarMut} rejeitarMut={rejeitarMut} cancelarAprovacaoMut={cancelarAprovacaoMut} recalcularMut={recalcularMut} excluirMedicaoMut={excluirMedicaoMut} editarMedicaoItemMut={editarMedicaoItemMut} removerMedicaoItemMut={removerMedicaoItemMut} initialMedicaoId={medicaoIdFromUrl} setShowGerarMedicao={setShowGerarMedicao} medCfg={medCfg} fdsTerceiro={fdsTerceiro} aprovarGestorMut={aprovarGestorMut} aprovarSocioMut={aprovarSocioMut} criarFdTerceiroMut={criarFdTerceiroMut} excluirFdTerceiroMut={excluirFdTerceiroMut} />
        )}

        {/* Tab: Aditivos (Rev. 4814) */}
        {tab === "aditivos" && (
          <AditivosTab contrato={contrato} />
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
                  anexoProposta: (contrato as any)?.propostaUrl ? { url: (contrato as any).propostaUrl, nome: (contrato as any).propostaNome } : null,
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
                    // Rev. 5005 — o servidor injeta Financeiro e Sócio Administrador
                    // deterministicamente; ordem final: Contratado → Gestor do Projeto →
                    // Financeiro → Sócio Administrador (testemunhas opcionais no meio).
                    setFcSignSignatarios([
                      { papel: "fornecedor", ordemAssinatura: 1, nome: emp?.responsavelNome || emp?.razaoSocial || "", email: emp?.email || "", cpfCnpj: emp?.cnpj || "", cargo: "Representante Legal", empresaNome: emp?.razaoSocial || "" },
                      { papel: "gestor_projeto", ordemAssinatura: 2, nome: (contrato as any).obraResponsavel || "", email: (contrato as any).obraResponsavelEmail || "", cpfCnpj: "", cargo: "Gestor de Projeto", empresaNome: "FC Engenharia" },
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
              {(contrato as any).propostaUrl && (
                <button
                  type="button"
                  className="text-[11px] text-emerald-700 flex items-center gap-1 hover:underline"
                  title="Proposta comercial do fornecedor — anexada automaticamente ao final do PDF do contrato (Anexo I)"
                  onClick={() => window.open((contrato as any).propostaUrl, "_blank", "noopener")}
                >
                  <Paperclip className="w-3 h-3" />
                  Anexo I: {(contrato as any).propostaNome || "Proposta Comercial"}
                </button>
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
            ) : (docHtmlQ.data as any)?.html && !textoEditado && !contratoAssinadoDoc ? (
              /* Rev. 5054 — formatação 100% fiel ao template da Central / prévia da
                 cotação: mesmo motor buildFcDocument, HTML preenchido no servidor. */
              <div className="bg-gray-100 rounded-xl p-4 sm:p-8">
                {/* Rev. 5054 — status VISÍVEL dos anexos (antes falhava/cancelava em silêncio) */}
                {docAnexoStatus === "renderizando" && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    Renderizando anexos (proposta, projetos...) — eles aparecem no fim do documento em alguns segundos.
                  </div>
                )}
                {docAnexoStatus === "erro" && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    <span>Não foi possível renderizar os anexos dentro do documento.</span>
                    <button
                      className="underline font-medium"
                      onClick={() => { setDocAnexoTentativa(t => t + 1); }}
                    >
                      Tentar de novo
                    </button>
                    {(docHtmlQ.data as any)?.propostaUrl && (
                      <button className="underline font-medium" onClick={() => window.open((docHtmlQ.data as any).propostaUrl, "_blank", "noopener")}>Abrir proposta</button>
                    )}
                  </div>
                )}
                {docAnexoStatus === "ok" && !!docAnexoSections?.length && (
                  <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
                    {docAnexoSections.length} anexo{docAnexoSections.length > 1 ? "s" : ""} incluído{docAnexoSections.length > 1 ? "s" : ""} no fim do documento: {docAnexoSections.map(s => s.titulo.split("—")[0].trim()).join(", ")}
                  </div>
                )}
                <iframe
                  title="Documento do contrato"
                  className="w-full bg-white rounded-sm shadow-xl border border-gray-300"
                  style={{ minHeight: "calc(100vh - 300px)" }}
                  sandbox=""
                  srcDoc={buildContratoPreviewSrcDoc(docHtmlQ.data, docAnexoSections ?? undefined, docLogoDataUrl, (user as any)?.name || (user as any)?.email)}
                />
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

                          if (/^\{\{FLUXOGRAMA_PAGAMENTO\}\}$/.test(trimmed) || /^MEDIÇÃO \(dia .*→.*PAGAMENTO/.test(trimmed)) {
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

                    {/* Assinaturas — Rev. 5005: 4 obrigatórias na ordem Contratado →
                        Gestor do Projeto → Financeiro → Sócio Administrador; 2 testemunhas opcionais */}
                    <div className="border-t border-gray-300 px-[72px] py-6 mt-auto relative z-10">
                      <div className="grid grid-cols-2 gap-20 mt-4">
                        <div className="text-center">
                          <div className="mt-16 pt-2 border-t border-gray-500">
                            <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">1. Contratada</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{contrato.empresa?.razaoSocial || "—"}</p>
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="mt-16 pt-2 border-t border-gray-500">
                            <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">2. Gestor do Projeto</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{(contrato as any).obraResponsavel || "—"}</p>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-20">
                        <div className="text-center">
                          <div className="mt-16 pt-2 border-t border-gray-500">
                            <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">3. Financeiro</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{(contrato as any).testemunhaFinanceiro || "—"}</p>
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="mt-16 pt-2 border-t border-gray-500">
                            <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">4. Sócio Administrador</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{cd?.razaoSocial || "—"}</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-10">
                        <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-4">Testemunhas <span className="font-normal text-gray-400 normal-case">(opcional)</span></p>
                        <div className="grid grid-cols-2 gap-20">
                          <div className="text-center">
                            <div className="mt-8 pt-2 border-t border-gray-400">
                              <p className="text-[10px] text-gray-700 font-medium">_______________</p>
                              <p className="text-[9px] text-gray-400 mt-0.5">Testemunha 1 — Nome / CPF</p>
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="mt-8 pt-2 border-t border-gray-400">
                              <p className="text-[10px] text-gray-700 font-medium">_______________</p>
                              <p className="text-[9px] text-gray-400 mt-0.5">Testemunha 2 — Nome / CPF</p>
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
                        onClick={() => setConfirmarMain({ title: `Restaurar versão v${rev.versao}?`, description: "O texto do contrato voltará para esta versão.", actionLabel: "Restaurar", onConfirm: () => { restaurarMut.mutate({ contratoId: id, revisaoId: rev.id }); setShowRevisoes(false); } })}
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
                        <Label className="text-[10px] text-gray-400">Email{fcSignModo === "link" ? " (opcional)" : ""}</Label>
                        <Input className="h-8 text-xs" type="email" placeholder={fcSignModo === "link" ? "opcional — assina pelo link" : ""} value={sig.email} onChange={e => { const arr = [...fcSignSignatarios]; arr[idx] = { ...arr[idx], email: e.target.value }; setFcSignSignatarios(arr); }} />
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

              {/* Rev. 5055 — como notificar: e-mail automático OU links p/ compartilhar */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className={`rounded-xl border p-2.5 text-left transition ${fcSignModo === "email" ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100" : "border-gray-200 bg-white hover:border-gray-300"}`}
                  onClick={() => setFcSignModo("email")}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-800"><Send className="w-3.5 h-3.5 text-indigo-600" /> Enviar por e-mail</span>
                  <span className="block mt-0.5 text-[10px] text-gray-500">Cada signatário recebe o convite automaticamente.</span>
                </button>
                <button
                  className={`rounded-xl border p-2.5 text-left transition ${fcSignModo === "link" ? "border-teal-400 bg-teal-50 ring-2 ring-teal-100" : "border-gray-200 bg-white hover:border-gray-300"}`}
                  onClick={() => setFcSignModo("link")}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-800"><Link2 className="w-3.5 h-3.5 text-teal-600" /> Gerar links</span>
                  <span className="block mt-0.5 text-[10px] text-gray-500">Você copia o link de cada um e envia por onde quiser (WhatsApp etc). E-mail fica opcional.</span>
                </button>
              </div>

              <div className="flex gap-3 mt-5 justify-end">
                <Button variant="outline" onClick={() => setShowFcSignModal(false)}>Cancelar</Button>
                <Button
                  className={`gap-2 ${fcSignModo === "link" ? "bg-teal-600 hover:bg-teal-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
                  disabled={criarEnvelopeMut.isPending || enviarEnvelopeContratoMut.isPending || fcSignSignatarios.some(s => !s.nome || (fcSignModo === "email" && !s.email))}
                  onClick={handleCriarEnvelopeContrato}
                >
                  {(criarEnvelopeMut.isPending || enviarEnvelopeContratoMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : fcSignModo === "link" ? <Link2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  {fcSignModo === "link" ? "Criar e gerar links" : "Criar Envelope"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Rev. 5055 — Links de assinatura do CONTRATO (assinar na hora, copiar link, WhatsApp) */}
        <Dialog open={!!contratoLinksEnvId} onOpenChange={(o) => { if (!o) setContratoLinksEnvId(null); }}>
          <DialogContent className="max-w-lg p-0 gap-0 overflow-y-auto max-h-[92dvh] rounded-2xl">
            <div className="bg-gradient-to-br from-[#0f2027] via-[#1B2A4A] to-teal-800 px-5 pt-5 pb-4 text-white">
              <h2 className="text-base font-bold flex items-center gap-2"><Link2 className="w-4 h-4" /> Links de assinatura</h2>
              <p className="text-[11px] text-teal-100 mt-0.5">Contrato {contrato.numeroContrato} — envie o link de cada signatário por onde preferir. A ordem de assinatura é respeitada.</p>
            </div>
            <div className="p-4 space-y-2.5">
              {contratoLinksEnv.isLoading && <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-teal-600" /></div>}
              {(() => {
                const sigs: any[] = ((contratoLinksEnv.data as any)?.signatarios || []);
                const obrig = [...sigs].sort((a: any, b: any) => a.ordemAssinatura - b.ordemAssinatura);
                const atualId = obrig.find((s: any) => s.papel !== "testemunha" && s.status !== "assinado")?.id ?? null;
                const papelLbl = (s: any) => s.cargo || (s.papel === "fornecedor" ? "Fornecedor" : s.papel === "diretor" ? "Sócio Administrador" : s.papel === "testemunha" ? "Testemunha" : "Contratante");
                return obrig.map((s: any, i: number) => {
                  const assinado = s.status === "assinado";
                  const ehAtual = s.id === atualId || s.papel === "testemunha";
                  const link = `${window.location.origin}/integrasign/assinar/${s.token}`;
                  const zapTxt = encodeURIComponent(`Olá, ${s.nome}! Segue o link para conferir e assinar o contrato ${contrato.numeroContrato} digitalmente pelo FCSign:\n\n${link}`);
                  return (
                    <div key={s.id} className={`rounded-2xl border bg-white p-3.5 ${ehAtual && !assinado ? "border-teal-300 ring-2 ring-teal-100" : assinado ? "border-emerald-200" : "border-slate-200 opacity-70"}`}>
                      <div className="flex items-center gap-2.5">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${assinado ? "bg-emerald-500" : ehAtual ? "bg-teal-600" : "bg-slate-300"}`}>
                          {assinado ? <Check className="w-4 h-4" /> : i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 break-words leading-tight">{s.nome}</p>
                          <p className="text-[11px] text-slate-500">{papelLbl(s)}{s.email ? ` · ${s.email}` : " · sem e-mail (assina pelo link)"}</p>
                        </div>
                        {assinado && <span className="text-[10px] font-medium text-emerald-600">Assinado ✓</span>}
                        {!assinado && !ehAtual && <span className="text-[10px] text-slate-400">aguarda a vez</span>}
                      </div>
                      {!assinado && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          <Button size="sm" className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white" disabled={!ehAtual}
                            title={ehAtual ? "Colher a assinatura agora, neste aparelho" : "Ainda não é a vez desta pessoa"}
                            onClick={() => window.open(link, "_blank", "noopener")}>
                            <PenLine className="w-3.5 h-3.5 mr-1" /> Assinar agora
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs"
                            onClick={async () => { try { await navigator.clipboard.writeText(link); toast.success("Link copiado!"); } catch { toast.error("Não foi possível copiar"); } }}>
                            <Link2 className="w-3.5 h-3.5 mr-1" /> Copiar link
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs border-green-300 text-green-700 hover:bg-green-50"
                            onClick={() => window.open(`https://wa.me/?text=${zapTxt}`, "_blank", "noopener")}>
                            <Send className="w-3.5 h-3.5 mr-1" /> WhatsApp
                          </Button>
                          {s.email && (
                            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={reenviarEmailContratoMut.isPending}
                              onClick={async () => {
                                try {
                                  await reenviarEmailContratoMut.mutateAsync({ companyId: contrato.companyId, signatarioId: s.id });
                                  toast.success("Convite enviado por e-mail!");
                                  contratoLinksEnv.refetch();
                                } catch { /* onError já avisou */ }
                              }}>
                              <Send className="w-3.5 h-3.5 mr-1" /> E-mail
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
              {(contratoLinksEnv.data as any)?.status === "concluido" && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 font-medium">Todas as assinaturas concluídas! 🎉</div>
              )}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate(`/integrasign?envelope=${contratoLinksEnvId}`)}>Abrir no FcSign</Button>
                <Button size="sm" className="flex-1 bg-slate-800 hover:bg-slate-900" onClick={() => setContratoLinksEnvId(null)}>Fechar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
              // Início: 1ª medição = data de início da obra (editável); seguintes = dia seguinte ao fim anterior.
              const inicioEfetivo = isFirst ? medicaoDataInicio : (autoInicio || medicaoDataInicio);
              // Fim = SEMPRE o "Dia da Medição" do contrato (corte em/ após o início) — respeita o contrato.
              const fimEfetivo = cutoffOnOrAfterISO(diaMed, inicioEfetivo);
              const periodoCalc = inicioEfetivo.slice(0, 7);
              return (
                <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
                  {/* Cabeçalho destacado */}
                  <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 pt-5 pb-6 text-white">
                    <div className="flex items-center gap-1.5 text-blue-100 text-[11px] font-semibold uppercase tracking-wide mb-2">
                      <ClipboardCheck className="w-3.5 h-3.5" /> Nova Medição
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
                        A medição é criada zerada (rascunho). Depois você lança o medido do período por item na planilha e, se quiser, faz o levantamento de campo (projeto/plantas).
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
                        <Label htmlFor="medicao-data-fim" className="text-[11px] text-gray-400 mb-1 block font-normal">Fim (Dia da Medição)</Label>
                        <div id="medicao-data-fim" className="h-11 flex items-center gap-2 px-3 bg-gray-50 rounded-md text-sm font-medium text-gray-700 border">
                          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />{fimEfetivo.split("-").reverse().join("/")}
                        </div>
                      </div>
                    </div>
                    {!isFirst && (
                      <p className="text-xs text-gray-400 mt-2">Período calculado automaticamente: início no dia seguinte à medição anterior, fim no Dia da Medição definido no contrato (dia {diaMed}).</p>
                    )}
                    {isFirst && (
                      <p className="text-xs text-gray-400 mt-2">Início na data de início da obra; fim no Dia da Medição definido no contrato (dia {diaMed}). Ajuste o início se necessário.</p>
                    )}
                    {contrato.docsComPendencia > 0 && (
                      <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg text-yellow-700 text-xs mt-4">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>Existem {contrato.docsComPendencia} documento(s) pendentes. A medição será gerada mas poderá ser bloqueada para pagamento.</span>
                      </div>
                    )}

                    {criarMedicaoManualMut.isPending && (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Criando medição...
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                          <div className="bg-blue-600 h-2.5 rounded-full" style={{ animation: "progress-indeterminate 1.5s ease-in-out infinite" }} />
                        </div>
                        <style>{`@keyframes progress-indeterminate { 0% { width: 10%; margin-left: 0; } 50% { width: 60%; margin-left: 20%; } 100% { width: 10%; margin-left: 90%; } }`}</style>
                      </div>
                    )}

                    <div className="flex gap-3 mt-6">
                      <Button variant="outline" className="flex-1 h-11" onClick={() => setShowGerarMedicao(false)} disabled={criarMedicaoManualMut.isPending}>Cancelar</Button>
                      <Button className="flex-1 h-11 bg-blue-600 hover:bg-blue-700" disabled={criarMedicaoManualMut.isPending}
                        onClick={() => criarMedicaoManualMut.mutate({ contratoId: id, companyId: contrato.companyId, periodo: periodoCalc, dataInicio: inicioEfetivo, dataFim: fimEfetivo, criadoPor: "Responsável" })}>
                        <ClipboardCheck className="w-4 h-4 mr-2" />{criarMedicaoManualMut.isPending ? "Criando..." : "Criar Medição"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Rev. 4828 — diálogo "Editar Medição" REMOVIDO (pedido do usuário):
            edição manual de período/status abria margem para erro; o status
            anda só pelos botões do fluxo de aprovação. */}

        {/* Rev. 4817 — Diálogo Encerrar contrato */}
        {showEncerrar && (() => {
          const medidoTotal = (contrato.itens || []).reduce((s: number, i: any) => s + (Number(i.valorMedidoAcumulado) || 0), 0);
          const sobraEstimada = Math.max(0, (Number(contrato.valorTotal) || 0) - medidoTotal);
          return (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowEncerrar(false)}>
              <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-emerald-600" /> Encerrar contrato {contrato.numeroContrato}</h3>
                <div className="text-sm text-gray-600 space-y-2">
                  <p>Contratado: <strong>{BRL(contrato.valorTotal)}</strong> · Medido acumulado: <strong>{BRL(medidoTotal)}</strong></p>
                  {sobraEstimada > 0.01 ? (
                    <p className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-emerald-700 text-xs">
                      Sobra de <strong>{BRL(sobraEstimada)}</strong> será creditada na <strong>Realocação de Verba</strong> (Compras) como "Economia Contrato: {contrato.numeroContrato}".
                    </p>
                  ) : (
                    <p className="rounded-lg bg-gray-50 border border-gray-200 p-2.5 text-gray-500 text-xs">Sem sobra a devolver — o contrato foi medido integralmente.</p>
                  )}
                  <p className="text-xs text-gray-400">Medições novas ficam bloqueadas. Se um aditivo for aprovado depois, o contrato reabre e o crédito é estornado automaticamente.</p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowEncerrar(false)}>Voltar</Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" disabled={encerrarContratoMut.isPending}
                    onClick={() => encerrarContratoMut.mutate({ id, companyId: contrato.companyId })}>
                    {encerrarContratoMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
                    Confirmar encerramento
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}

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
        <ConfirmBox state={confirmarMain} onClose={() => setConfirmarMain(null)} />
      </div>
    </DashboardLayout>
  );
}

// Rev. 4803 — confirmação bonita (substitui o confirm() nativo, que no iPad
// mostra o endereço do site em cima da mensagem).
type ConfirmState = { title: string; description?: string; actionLabel: string; destructive?: boolean; onConfirm: () => void } | null;
function ConfirmBox({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  return (
    <AlertDialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent className="max-w-md rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-gray-900">
            {state?.destructive ? <AlertTriangle className="w-5 h-5 text-red-500" /> : <Info className="w-5 h-5 text-blue-500" />}
            {state?.title}
          </AlertDialogTitle>
          {state?.description && (
            <AlertDialogDescription className="text-sm text-gray-500 break-words">{state.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={state?.destructive ? "bg-red-600 hover:bg-red-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}
            onClick={() => { const fn = state?.onConfirm; onClose(); fn && fn(); }}>
            {state?.actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MedicoesTab({ contrato, id, emModuloMedicoes, aprovarMut, rejeitarMut, cancelarAprovacaoMut, recalcularMut, excluirMedicaoMut, editarMedicaoItemMut, removerMedicaoItemMut, initialMedicaoId, setShowGerarMedicao, medCfg, fdsTerceiro, aprovarGestorMut, aprovarSocioMut, criarFdTerceiroMut, excluirFdTerceiroMut }: any) {
  const assinado = (contrato as any).assinaturaStatus === "concluido";
  // Rev. 4818 — aditivos vinculados à medição: aviso no excluir (cascata)
  const { data: aditivosDoContrato } = trpc.terceiroContratos.listarAditivos.useQuery(
    { contratoId: id, companyId: contrato?.companyId },
    { enabled: !!contrato?.companyId },
  );
  const descExcluirMedicao = (m: any) => {
    const vinculados = (aditivosDoContrato || []).filter((a: any) => a.medicaoId === m.id);
    const base = m.status === "aprovada" ? "Os valores acumulados serão revertidos. " : "";
    if (vinculados.length === 0) return `${base}Esta ação não pode ser desfeita.`;
    const soma = vinculados.reduce((s: number, a: any) => s + (Number(a.valorTotal) || 0), 0);
    return `${base}ATENÇÃO: esta medição originou ${vinculados.length} aditivo(s) (${soma.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Eles serão EXCLUÍDOS junto — o teto do item, o valor do contrato e o consumo da Realocação de Verba serão desfeitos. Esta ação não pode ser desfeita.`;
  };
  const tresNiveis = (medCfg?.aprovacaoTresNiveis ?? 1) === 1;
  const fdsAll: any[] = fdsTerceiro?.fds || [];
  const [expandedMedicao, setExpandedMedicao] = useState<number | null>(initialMedicaoId ?? null);
  // Rev. 4800 — lista de medições enxuta: observações/aprovações/FD abrem em popup
  const [detalheMedicaoId, setDetalheMedicaoId] = useState<number | null>(null);
  const medicaoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialMedicaoId && medicaoRef.current) {
      setTimeout(() => medicaoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    }
  }, [initialMedicaoId]);
  const [rejeicaoModal, setRejeicaoModal] = useState<{ id: number; numero: number } | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [confirmar, setConfirmar] = useState<ConfirmState>(null);
  // Rev. 4859 — destravar medição PAGA (LGPD/ISO 9001): só admin master com senha;
  // o servidor faz a volta completa (estorna baixa → remove título → desaprova).
  const { user: userTab } = useAuth();
  const isMaster = userTab?.role === "admin_master";
  const [destravar, setDestravar] = useState<{ id: number; numero: string } | null>(null);
  const [senhaDestravar, setSenhaDestravar] = useState("");
  // Rev. 4803 — quem fez a medição SOLICITA a aprovação (rascunho → aguardando gestor)
  const solicitarAprovacaoMut = trpc.terceiroContratos.solicitarAprovacaoMedicao.useMutation({
    onSuccess: () => { toast.success("Aprovação solicitada! A medição aguarda o gestor da obra."); utilsAd.terceiroContratos.getContrato.invalidate({ id: contrato.id }); },
    onError: (e: any) => toast.error(e.message),
  });
  // Rev. 4802 — Aditivos de contrato (excedente de medição)
  const utilsAd = trpc.useUtils();
  const { data: aditivos } = trpc.terceiroContratos.listarAditivos.useQuery(
    { contratoId: contrato.id, companyId: contrato.companyId },
    { enabled: !!contrato?.id && !!contrato?.companyId },
  );
  const invalidarAditivos = () => {
    utilsAd.terceiroContratos.listarAditivos.invalidate({ contratoId: contrato.id, companyId: contrato.companyId });
    utilsAd.terceiroContratos.getContrato.invalidate({ id: contrato.id });
  };
  const [aditivoDialog, setAditivoDialog] = useState<{ item: any; medicaoId: number } | null>(null);
  const [aditivoRejeicao, setAditivoRejeicao] = useState<{ id: number; numero: number } | null>(null);
  const [aditivoMotivoRej, setAditivoMotivoRej] = useState("");
  const aprovarAdGestorMut = trpc.terceiroContratos.aprovarAditivoGestor.useMutation({
    onSuccess: () => { toast.success("Aditivo aprovado pelo gestor da obra — aguardando sócio adm."); invalidarAditivos(); },
    onError: (e: any) => toast.error(e.message),
  });
  const aprovarAdSocioMut = trpc.terceiroContratos.aprovarAditivoSocio.useMutation({
    onSuccess: () => { toast.success("Aditivo aprovado! Quantidade e valor somados ao contrato."); invalidarAditivos(); },
    onError: (e: any) => toast.error(e.message),
  });
  const rejeitarAditivoMut = trpc.terceiroContratos.rejeitarAditivo.useMutation({
    onSuccess: () => { toast.success("Aditivo rejeitado."); setAditivoRejeicao(null); setAditivoMotivoRej(""); invalidarAditivos(); },
    onError: (e: any) => toast.error(e.message),
  });
  const [editingItem, setEditingItem] = useState<{ id: number; valor: string } | null>(null);
  // Task #86 — lançamento manual do medido do período por item, em BRL pt-BR (V.Período).
  const [editingValor, setEditingValor] = useState<{ id: number; valor: string } | null>(null);
  const valorSubmitGuard = useRef(false);
  const maskValorBRL = (s: string) => (parseInt((s || "").replace(/\D/g, "") || "0", 10) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const parseValorBRL = (s: string) => parseInt((s || "").replace(/\D/g, "") || "0", 10) / 100;
  // Dedupe Enter+blur: o Enter dispara blur do input, evitando mutação dupla.
  const submitValorPeriodo = (itemId: number, medicaoId: number, companyId: number, valorStr: string) => {
    if (valorSubmitGuard.current) return;
    valorSubmitGuard.current = true;
    editarMedicaoItemMut.mutate({ medicaoItemId: itemId, medicaoId, companyId, valorMedidoPeriodo: parseValorBRL(valorStr) });
    setEditingValor(null);
  };
  const [recalcResult, setRecalcResult] = useState<any>(null);
  // Task #86 — sub-abas DENTRO da medição expandida (Planilha de Medição / Levantamento), por medição.
  const [medSubTab, setMedSubTab] = useState<Record<number, "planilha" | "levantamento">>({});
  const [, navigate] = useLocation();
  // Rev. 3090 (T005) — Levantamento de campo OBRIGATÓRIO da medição de terceiros.
  // A engine de levantamento (PDF/plantas + escala + contornos + fotos) é a MESMA do
  // módulo de cliente, distinguida por origem="terceiro" (IDs de contrato colidem).
  const utilsMed = trpc.useUtils();
  const criarLevantamentoMut = trpc.medicao.criarCampo.useMutation();
  const vincularLevantamentoMut = trpc.terceiroContratos.vincularLevantamentoMedicao.useMutation();
  const abrirLevantamento = (campoId: number) => navigate(`/medicao/${contrato.id}/levantamento/${campoId}?origem=terceiro`);
  const fazerLevantamento = (m: any) => {
    criarLevantamentoMut.mutate(
      { companyId: contrato.companyId, contratoId: contrato.id, origem: "terceiro", titulo: `Medição ${String(m.numero).padStart(2, "0")}` },
      {
        onSuccess: (campo: any) => {
          vincularLevantamentoMut.mutate(
            { id: m.id, companyId: contrato.companyId, levantamentoCampoId: campo.id },
            {
              onSuccess: () => { utilsMed.terceiroContratos.getContrato.invalidate({ id: contrato.id }); abrirLevantamento(campo.id); },
              onError: (e: any) => toast.error(e?.message || "Erro ao vincular levantamento à medição."),
            },
          );
        },
        onError: (e: any) => toast.error(e?.message || "Erro ao criar levantamento de campo."),
      },
    );
  };
  const levantando = criarLevantamentoMut.isPending || vincularLevantamentoMut.isPending;
  // Rev. 4800 — fim do "espelho só-leitura": esta aba É o espaço oficial de
  // trabalho das medições do contrato (pedido do usuário). O módulo dedicado
  // (/terceiros/medicoes) segue existindo como PAINEL central de todos os
  // contratos — fica só um atalho discreto pra lá.
  const modoEdicao = true;

  const banner = emModuloMedicoes ? null : (
    <div className="flex justify-end">
      <button type="button" className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-blue-600"
        onClick={() => navigate("/terceiros/medicoes")}>
        <ExternalLink className="w-3 h-3" /> Painel de Medições (todos os contratos)
      </button>
    </div>
  );

  if (contrato.medicoes.length === 0) {
    return (
      <div className="space-y-3">
        {banner}
        <div className="py-10 text-center text-sm">
        <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-30 text-gray-400" />
        <p className="text-gray-400 mb-4">Nenhuma medição gerada para este contrato.</p>
        {assinado && modoEdicao ? (
          <Button onClick={() => setShowGerarMedicao(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <ClipboardCheck className="w-4 h-4" /> Nova Medição
          </Button>
        ) : !assinado ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <Clock className="w-3.5 h-3.5" />
            {(contrato as any).assinaturaStatus
              ? "Conclua a assinatura do contrato (FcSign) para gerar medições."
              : "Envie o contrato para assinatura antes de gerar medições."}
          </span>
        ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {banner}
      {assinado && modoEdicao && (
        <div className="flex justify-end">
          <Button onClick={() => setShowGerarMedicao(true)} size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700">
            <ClipboardCheck className="w-4 h-4" /> Nova Medição
          </Button>
        </div>
      )}
      <RetencaoTecnicaCard contrato={contrato} modoEdicao={modoEdicao} />
      {(aditivos || []).length > 0 && (
        <AditivosCard
          aditivos={aditivos || []}
          modoEdicao={modoEdicao}
          onAprovarGestor={(a: any) => aprovarAdGestorMut.mutate({ id: a.id, companyId: contrato.companyId, aprovadoPor: "Gestor da Obra" })}
          onAprovarSocio={(a: any) => aprovarAdSocioMut.mutate({ id: a.id, companyId: contrato.companyId, aprovadoPor: "Sócio Administrador" })}
          onRejeitar={(a: any) => setAditivoRejeicao({ id: a.id, numero: a.numero })}
          isPending={aprovarAdGestorMut.isPending || aprovarAdSocioMut.isPending}
        />
      )}
      {contrato.medicoes.map((m: any) => {
        // Rev. 4801 — status "Paga" derivado ao vivo do Financeiro (baixas do título)
        const pagto = (m as any).pagamento;
        const st = pagto?.pago ? STATUS_MEDICAO.paga : (STATUS_MEDICAO[m.status || "rascunho"] || STATUS_MEDICAO.rascunho);
        const isExpanded = expandedMedicao === m.id;
        const isEditable = m.status !== "paga";
        const isPreApproval = m.status === "aguardando_aprovacao" || m.status === "rascunho";
        const editavel = isEditable && modoEdicao; // Rev. 3082 (T007) — gate de edição da aba-espelho
        const mostrarRemover = isPreApproval && modoEdicao;
        const itens = m.itens || [];
        const subTab = medSubTab[m.id] || "planilha";

        return (
          <div key={m.id} ref={m.id === initialMedicaoId ? medicaoRef : undefined} className={`bg-white rounded-xl border overflow-hidden ${m.id === initialMedicaoId ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-200"}`}>
            <div className="px-4 py-3">
              {/* Rev. 4800 — linha enxuta: só "Medição NN" + status; tudo o mais
                  (observações, aprovações, FD, ações) abre no popup de detalhes. */}
              {/* Rev. 4859 — REGRA DE OURO: nada sobrepõe. A linha QUEBRA em blocos
                  (flex-wrap) quando não cabe; cada selo desce inteiro p/ a linha de baixo. */}
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 flex-1 basis-64 cursor-pointer" onClick={() => setExpandedMedicao(isExpanded ? null : m.id)}>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                  <span className="font-semibold text-gray-900 whitespace-nowrap">Medição {String(m.numero).padStart(2, "0")}</span>
                  {Number((m as any).revisao || 0) > 0 && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5" title={`Revisada${(m as any).revisadoPorNome ? ` por ${(m as any).revisadoPorNome}` : ""}${(m as any).revisadoEm ? ` em ${fmtDate(String((m as any).revisadoEm).slice(0, 10))}` : ""}`}>
                      REV. {Number((m as any).revisao)}
                    </span>
                  )}
                  <Badge className={`text-xs border ${st.cls}`}>{st.label}</Badge>
                  {m.geradoAutomaticamente && <Badge className="text-xs border bg-purple-100 text-purple-700 border-purple-200"><Zap className="w-3 h-3 mr-1" />Auto</Badge>}
                  {/* Rev. 4859 — legenda no alerta (pedido do usuário): triângulo sozinho não diz nada */}
                  {m.alertaDivergencia && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-1.5 py-0.5 whitespace-nowrap flex-shrink-0" title={String(m.alertaDivergencia)}>
                      <AlertTriangle className="w-3 h-3" />Diverge do cronograma
                    </span>
                  )}
                  {m.motivoRejeicao && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-1.5 py-0.5 whitespace-nowrap flex-shrink-0" title={String(m.motivoRejeicao)}>
                      <AlertTriangle className="w-3 h-3" />Rejeitada
                    </span>
                  )}
                  <span className="text-xs text-gray-400 hidden sm:inline whitespace-nowrap">{m.dataInicio && m.dataFim ? `${fmtDate(m.dataInicio)} a ${fmtDate(m.dataFim)}` : m.periodo}</span>
                  {/* Rev. 4859 — rastro do Financeiro SEMPRE visível (pedido do usuário:
                      "como sei que foi pro financeiro pagar?"): aprovou → selo com o
                      título no Contas a Pagar e o vencimento; pagou → selo verde. */}
                  {pagto?.pago ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5 whitespace-nowrap flex-shrink-0">
                      <CheckCircle className="w-3 h-3" />Paga em {fmtDate(pagto.dataPagamento)}{pagto.formaPagamento ? ` • ${pagto.formaPagamento}` : ""}
                    </span>
                  ) : pagto?.parcial ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 whitespace-nowrap flex-shrink-0">Pago parcial: {BRL(pagto.valorPago)}</span>
                  ) : pagto && (pagto as any).statusTitulo && (pagto as any).statusTitulo !== "cancelado" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5 whitespace-nowrap flex-shrink-0" title={`Título de ${BRL((pagto as any).valorTitulo)} lançado no Contas a Pagar`}>
                      <DollarSign className="w-3 h-3" />No Contas a Pagar{(pagto as any).vencimento ? ` • vence ${fmtDate((pagto as any).vencimento)}` : ""}
                    </span>
                  ) : null}
                  {/* Rev. 4859 — comprovante da baixa visível direto na linha (pedido do
                      usuário: ver imagem/PDF sem caçar no Financeiro). Abre em nova aba. */}
                  {(pagto?.pago || pagto?.parcial) && (pagto?.baixas || []).filter((b: any) => b.comprovanteUrl).map((b: any, i: number) => (
                    <a key={i} href={b.comprovanteUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-white border border-emerald-300 rounded-full px-1.5 py-0.5 whitespace-nowrap flex-shrink-0 hover:bg-emerald-50 underline underline-offset-2"
                      title={`Comprovante da baixa de ${fmtDate(b.data)} — ${BRL(b.valor)}`}>
                      <Paperclip className="w-3 h-3" />Comprovante{(pagto?.baixas || []).filter((x: any) => x.comprovanteUrl).length > 1 ? ` ${i + 1}` : ""}
                    </a>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Rev. 4859 — na linha mostra o VALOR A SER PAGO (líquido), não o
                      medido bruto (pedido do usuário: "hoje está uma confusão").
                      Prioridade: valor do título no Contas a Pagar; senão, líquido
                      calculado = medido − retenções − descontos − FD. */}
                  <span className="text-xs text-gray-500 hidden sm:inline mr-0.5 whitespace-nowrap">Medido <strong className="text-gray-700">{BRL(m.valorMedido)}</strong></span>
                  <span className="text-xs text-red-600 hidden sm:inline mr-0.5 whitespace-nowrap" title="A pagar = medido − retenções − descontos − FD">
                    A pagar <strong className="text-red-600">{BRL(
                      (pagto as any)?.valorTitulo != null && (pagto as any)?.statusTitulo && (pagto as any)?.statusTitulo !== "cancelado"
                        ? (pagto as any).valorTitulo
                        : Math.max(0,
                            Number(m.valorMedido ?? 0)
                            - Number(m.retencaoTecnica ?? 0) - Number(m.retencaoISS ?? 0)
                            - Number(m.retencaoINSS ?? 0) - Number(m.retencaoIRRF ?? 0)
                            - Number(m.outrasRetencoes ?? 0) - Number(m.descontos ?? 0)
                            - Number(m.fdTotalAbatido ?? 0))
                    )}</strong>
                  </span>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setDetalheMedicaoId(m.id)}>
                    <Eye className="w-3 h-3" /> Detalhes
                  </Button>
                  {/* Rev. 4803 — ações direto na linha (pedido: excluir/editar/cancelar sem caçar no popup) */}
                  {modoEdicao && (m.status === "rascunho" || m.status === "rejeitada") && (
                    <Button size="sm" className="h-7 gap-1 text-xs bg-blue-600 hover:bg-blue-700" title="Enviar a medição para aprovação do gestor da obra"
                      disabled={solicitarAprovacaoMut.isPending}
                      onClick={() => setConfirmar({ title: `Solicitar aprovação da Medição ${String(m.numero).padStart(2, "0")}?`, description: "Ela vai para o gestor da obra e depois para o sócio administrador.", actionLabel: "Solicitar Aprovação", onConfirm: () => solicitarAprovacaoMut.mutate({ id: m.id, companyId: contrato.companyId }) })}>
                      {solicitarAprovacaoMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      <span className="hidden md:inline">Solicitar Aprovação</span>
                    </Button>
                  )}
                  {/* Rev. 4828 — botão "Editar medição" REMOVIDO (pedido do usuário):
                      período/status não são editáveis à mão; o status anda só
                      pelos botões do fluxo (Solicitar Aprovação → Aprovar). */}
                  {/* Rev. 4859 — LGPD/ISO 9001: medição PAGA (baixa ativa no Financeiro)
                      é IMUTÁVEL. Some o cancelar/excluir e entra o cadeado com o
                      caminho inverso (estornar baixa → cancelar aprovação → alterar). */}
                  {(pagto?.pago || pagto?.parcial) ? (<>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2 py-1 whitespace-nowrap flex-shrink-0"
                      title="Medição paga é imutável (LGPD/ISO 9001). Só o admin master, com a senha dele, pode destravar — o sistema estorna a baixa e desfaz a aprovação na ordem correta.">
                      <Lock className="w-3 h-3" /><span className="hidden md:inline">Travada — paga</span>
                    </span>
                    {isMaster && modoEdicao && (
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-slate-600 border-slate-300 hover:bg-slate-50"
                        title="Destravar com a senha do admin master: estorna a baixa, remove o título e cancela a aprovação (volta completa do sistema)"
                        onClick={() => { setSenhaDestravar(""); setDestravar({ id: m.id, numero: String(m.numero).padStart(2, "0") }); }}>
                        <ShieldCheck className="w-3 h-3" /><span className="hidden md:inline">Destravar</span>
                      </Button>
                    )}
                  </>) : (<>
                  {modoEdicao && m.status === "aprovada" && (
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-orange-600 border-orange-200 hover:bg-orange-50" title="Cancelar aprovação"
                      disabled={cancelarAprovacaoMut.isPending}
                      onClick={() => setConfirmar({ title: `Cancelar aprovação da Medição ${String(m.numero).padStart(2, "0")}?`, description: 'A medição voltará para "Aguardando Aprovação" e os valores acumulados serão recalculados.', actionLabel: "Cancelar Aprovação", onConfirm: () => cancelarAprovacaoMut.mutate({ id: m.id, companyId: contrato.companyId }) })}>
                      <Undo2 className="w-3 h-3" /><span className="hidden md:inline">Cancelar Aprovação</span>
                    </Button>
                  )}
                  {modoEdicao && m.status !== "paga" && (
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-600 border-red-200 hover:bg-red-50" title="Excluir medição"
                      disabled={excluirMedicaoMut.isPending}
                      onClick={() => setConfirmar({ title: `Excluir Medição ${String(m.numero).padStart(2, "0")}?`, description: descExcluirMedicao(m), actionLabel: "Excluir", destructive: true, onConfirm: () => excluirMedicaoMut.mutate({ id: m.id, contratoId: id, companyId: contrato.companyId }) })}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                  </>)}
                </div>
              </div>
            </div>

            <Dialog open={detalheMedicaoId === m.id} onOpenChange={(o) => { if (!o) setDetalheMedicaoId(null); }}>
              <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto p-0 gap-0 [&>button]:text-white [&>button]:opacity-80">
                {/* Rev. 4801 — popup moderno: header escuro com progresso, tiles, timeline */}
                <div className="bg-gradient-to-br from-slate-800 via-slate-800 to-blue-900 px-5 pt-5 pb-4 text-white">
                  <DialogHeader>
                    <DialogTitle className="flex flex-wrap items-center gap-2 text-white">
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 flex-shrink-0"><ClipboardCheck className="w-5 h-5 text-blue-300" /></span>
                      Medição {String(m.numero).padStart(2, "0")}
                      <Badge className={`text-xs border ${st.cls}`}>{st.label}</Badge>
                      {Number((m as any).revisao || 0) > 0 && (
                        <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 border border-amber-400/40 rounded-full px-1.5 py-0.5">REV. {Number((m as any).revisao)}</span>
                      )}
                      {m.geradoAutomaticamente && <Badge className="text-xs border bg-purple-500/20 text-purple-200 border-purple-400/40"><Zap className="w-3 h-3 mr-1" />Auto</Badge>}
                    </DialogTitle>
                  </DialogHeader>
                  <p className="text-xs text-slate-300 mt-1 ml-11">
                    {m.dataInicio && m.dataFim ? `${fmtDate(m.dataInicio)} a ${fmtDate(m.dataFim)}` : m.periodo}{m.dataReferencia ? ` • Ref: ${fmtDate(m.dataReferencia)}` : ""}
                  </p>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[11px] text-slate-300">
                      <span>Avanço global do contrato</span>
                      <span className="font-bold text-white text-sm">{Number(m.percentualGlobal).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/15 mt-1.5 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-300 transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, Number(m.percentualGlobal) || 0))}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 mt-4">
                    {[
                      ["Medido no período", BRL(m.valorMedido), "text-cyan-300"],
                      ["Acumulado", BRL(m.valorAcumulado), "text-blue-200"],
                      ["% do contrato", `${Number(m.percentualGlobal).toFixed(1)}%`, "text-emerald-300"],
                    ].map(([l, v, c]) => (
                      <div key={l as string} className="rounded-xl bg-white/10 border border-white/10 px-3 py-2.5">
                        <p className="text-[10px] text-slate-300">{l}</p>
                        <p className={`text-base font-bold break-words ${c}`}>{v}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-5 space-y-4">
                {pagto?.pago && (
                  <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-3.5">
                    <p className="text-sm text-emerald-800 font-bold flex items-center gap-2"><CheckCircle className="w-4 h-4" />Paga pelo Financeiro — {BRL(pagto.valorPago)}</p>
                    <div className="mt-2 space-y-1.5">
                      {(pagto.baixas || []).map((b: any, i: number) => (
                        <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-emerald-700 bg-white/60 rounded-lg px-2.5 py-1.5 border border-emerald-100">
                          <span className="font-semibold">{fmtDate(b.data)}</span>
                          <span className="font-bold">{BRL(b.valor)}</span>
                          {b.formaPagamento && <span className="capitalize">{String(b.formaPagamento).replace(/_/g, " ")}</span>}
                          {b.conta && <span className="text-emerald-600 break-words">{b.conta}</span>}
                          {b.comprovanteUrl && (/^https?:\/\//i.test(b.comprovanteUrl) || String(b.comprovanteUrl).startsWith("/uploads/")) && <a href={b.comprovanteUrl} target="_blank" rel="noreferrer" className="font-semibold underline text-emerald-800">Ver comprovante</a>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pagto?.parcial && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                    <p className="text-sm text-amber-800 font-bold">Pagamento parcial: {BRL(pagto.valorPago)} de {BRL(pagto.valorTitulo)}</p>
                    <div className="h-1.5 rounded-full bg-amber-200/70 mt-2 overflow-hidden">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, (pagto.valorPago / Math.max(pagto.valorTitulo, 0.01)) * 100)}%` }} />
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {(pagto.baixas || []).map((b: any, i: number) => (
                        <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-amber-700 bg-white/60 rounded-lg px-2.5 py-1.5 border border-amber-100">
                          <span className="font-semibold">{fmtDate(b.data)}</span>
                          <span className="font-bold">{BRL(b.valor)}</span>
                          {b.formaPagamento && <span className="capitalize">{String(b.formaPagamento).replace(/_/g, " ")}</span>}
                          {b.conta && <span className="break-words">{b.conta}</span>}
                          {b.comprovanteUrl && (/^https?:\/\//i.test(b.comprovanteUrl) || String(b.comprovanteUrl).startsWith("/uploads/")) && <a href={b.comprovanteUrl} target="_blank" rel="noreferrer" className="font-semibold underline text-amber-800">Ver comprovante</a>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {m.alertaDivergencia && (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-orange-500 mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Comparativo com o avanço da obra</p>
                    <p className="text-xs text-orange-700 break-words leading-relaxed">{m.alertaDivergencia}</p>
                  </div>
                )}
                {/* Rev. 4827 — aviso PERMANENTE: desconto de FD foi excluído desta
                    medição; segue visível em todos os status, inclusive aprovada. */}
                {(m as any).fdExclusaoAlerta && (
                  <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-red-600 mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Existem FDs pendentes</p>
                    <p className="text-xs text-red-700 break-words leading-relaxed whitespace-pre-line">{(m as any).fdExclusaoAlerta}</p>
                  </div>
                )}
                {m.motivoRejeicao && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-red-500 mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Rejeitada{(m as any).rejeitadoPor ? ` por ${(m as any).rejeitadoPor}` : ""}{(m as any).rejeitadoEm ? ` em ${fmtDate((m as any).rejeitadoEm)}` : ""}</p>
                    <p className="text-xs text-red-600 break-words">{m.motivoRejeicao}</p>
                  </div>
                )}
                {tresNiveis && m.status !== "rejeitada" && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2.5">Fluxo de aprovação</p>
                    <div className="space-y-0">
                      {[
                        { lab: "Medido", done: true, who: m.criadoPor, when: m.criadoEm },
                        { lab: "Gestor da Obra", done: (m.nivelAprovacao ?? 0) >= 1 || m.status === "aprovada" || m.status === "paga", who: m.gestorAprovadoPor, when: m.gestorAprovadoEm },
                        { lab: "Sócio Adm", done: (m.nivelAprovacao ?? 0) >= 2 || m.status === "aprovada" || m.status === "paga", who: m.socioAprovadoPor, when: m.socioAprovadoEm },
                        ...(pagto?.pago ? [{ lab: "Paga pelo Financeiro", done: true, who: pagto.conta, when: pagto.dataPagamento }] : []),
                      ].map((s: any, i: number, arr: any[]) => (
                        <div key={i} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${s.done ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                              {s.done ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                            </span>
                            {i < arr.length - 1 && <span className={`w-0.5 flex-1 min-h-[14px] ${s.done ? "bg-emerald-300" : "bg-gray-200"}`} />}
                          </div>
                          <div className="pb-3">
                            <p className={`text-xs font-semibold ${s.done ? "text-gray-800" : "text-gray-400"}`}>{s.lab}</p>
                            {(s.who || s.when) && <p className="text-[11px] text-gray-400 break-words">{s.who || ""}{s.when ? ` • ${fmtDate(String(s.when).slice(0, 10))}` : ""}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!tresNiveis && m.aprovadoPor && (
                  <p className="text-xs text-gray-400">Aprovado por <span className="font-medium">{m.aprovadoPor}</span> em {fmtDate(m.aprovadoEm)}</p>
                )}
                {m.observacoes && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Observações</p>
                    <p className="text-xs text-gray-600 break-words leading-relaxed">{m.observacoes}</p>
                  </div>
                )}
                {m.levantamentoCampoId && (
                  <Badge variant="outline" className="gap-1 text-xs text-blue-700 border-blue-200 bg-blue-50">
                    <Ruler className="w-3 h-3" /> Levantamento vinculado
                  </Badge>
                )}
                <FdMedicaoPanel
                  medicao={m}
                  contrato={contrato}
                  fds={fdsAll.filter((f: any) => f.medicaoId === m.id)}
                  criarFdTerceiroMut={criarFdTerceiroMut}
                  excluirFdTerceiroMut={excluirFdTerceiroMut}
                  readOnly={!modoEdicao}
                />
                {/* Rev. 4830 — comparativo INLINE abaixo da medição (pedido do usuário) */}
                {recalcResult && recalcResult.medicaoId === m.id && (
                  <ComparativoObraSection r={recalcResult} m={m} onClose={() => setRecalcResult(null)} />
                )}
                {modoEdicao && (
                <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                  {(m.status === "rascunho" || m.status === "rejeitada") && (
                    <Button size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700 text-xs"
                      disabled={solicitarAprovacaoMut.isPending}
                      onClick={() => setConfirmar({ title: `Solicitar aprovação da Medição ${String(m.numero).padStart(2, "0")}?`, description: "Ela vai para o gestor da obra e depois para o sócio administrador.", actionLabel: "Solicitar Aprovação", onConfirm: () => solicitarAprovacaoMut.mutate({ id: m.id, companyId: contrato.companyId }) })}>
                      <Send className="w-3 h-3" /> Solicitar Aprovação
                    </Button>
                  )}
                  {m.status === "aguardando_aprovacao" && !tresNiveis && (
                    <>
                      <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-xs" onClick={() => aprovarMut.mutate({ id: m.id, companyId: contrato.companyId, aprovadoPor: "Responsável" })}>
                        <CheckCircle className="w-3 h-3" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => { setRejeicaoModal({ id: m.id, numero: String(m.numero).padStart(2, "0") }); setMotivoRejeicao(""); }}>
                        Rejeitar
                      </Button>
                    </>
                  )}
                  {m.status === "aguardando_aprovacao" && tresNiveis && (
                    <>
                      {(m.nivelAprovacao ?? 0) < 1 ? (
                        <Button size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700 text-xs" disabled={aprovarGestorMut.isPending}
                          onClick={() => aprovarGestorMut.mutate({ id: m.id, companyId: contrato.companyId, aprovadoPor: "Gestor da Obra" })}>
                          <CheckCircle className="w-3 h-3" /> Aprovar (Gestor)
                        </Button>
                      ) : (
                        <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-xs" disabled={aprovarSocioMut.isPending}
                          onClick={() => setConfirmar({ title: `Liberar pagamento da Medição ${String(m.numero).padStart(2, "0")}?`, description: "Isso aprova em definitivo e gera o financeiro a pagar.", actionLabel: "Liberar Pagamento", onConfirm: () => aprovarSocioMut.mutate({ id: m.id, companyId: contrato.companyId, aprovadoPor: "Sócio Adm" }) })}>
                          <CheckCircle className="w-3 h-3" /> Liberar (Sócio Adm)
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => { setRejeicaoModal({ id: m.id, numero: String(m.numero).padStart(2, "0") }); setMotivoRejeicao(""); }}>
                        Rejeitar
                      </Button>
                    </>
                  )}
                  {/* Rev. 4859 — LGPD/ISO 9001: paga (baixa ativa) = imutável; caminho
                      inverso: estornar baixa no Financeiro → cancelar aprovação. */}
                  {(pagto?.pago || pagto?.parcial) && (<>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2 py-1"
                      title="Medição paga é imutável (LGPD/ISO 9001). Só o admin master, com a senha dele, pode destravar.">
                      <Lock className="w-3 h-3" /> Travada — paga
                    </span>
                    {isMaster && (
                      <Button size="sm" variant="outline" className="gap-1 text-xs text-slate-600 border-slate-300 hover:bg-slate-50"
                        title="Destravar com a senha do admin master: estorna a baixa, remove o título e cancela a aprovação (volta completa do sistema)"
                        onClick={() => { setSenhaDestravar(""); setDestravar({ id: m.id, numero: String(m.numero).padStart(2, "0") }); }}>
                        <ShieldCheck className="w-3 h-3" /> Destravar
                      </Button>
                    )}
                  </>)}
                  {m.status === "aprovada" && !(pagto?.pago || pagto?.parcial) && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs text-orange-600 border-orange-200 hover:bg-orange-50"
                      disabled={cancelarAprovacaoMut.isPending}
                      onClick={() => setConfirmar({ title: `Cancelar aprovação da Medição ${String(m.numero).padStart(2, "0")}?`, description: 'A medição voltará para "Aguardando Aprovação" e os valores acumulados serão recalculados.', actionLabel: "Cancelar Aprovação", onConfirm: () => cancelarAprovacaoMut.mutate({ id: m.id, companyId: contrato.companyId }) })}>
                      <Undo2 className="w-3 h-3" /> Cancelar Aprovação
                    </Button>
                  )}
                  {(m.status === "aguardando_aprovacao" || m.status === "rascunho") && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                      disabled={recalcularMut.isPending}
                      title="Cruza o medido com o avanço do cronograma da obra (consultivo — não altera o medido)"
                      onClick={() => recalcularMut.mutate({ medicaoId: m.id, companyId: contrato.companyId }, { onSuccess: (data: any) => {
                        setRecalcResult({ ...data, medicaoId: m.id });
                        if (data?.alertaDivergencia) toast.warning(data.alertaDivergencia);
                        else toast.success("Medido compatível com o avanço da obra.");
                        setTimeout(() => document.getElementById(`comparativo-obra-${m.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
                      } })}>
                      <BarChart3 className={`w-3 h-3 ${recalcularMut.isPending ? "animate-pulse" : ""}`} /> Comparar c/ Avanço da Obra
                      {/* Rev. 4831 — % de avanço da obra (0–100%) direto no botão após comparar */}
                      {recalcResult && recalcResult.medicaoId === m.id && (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[10px]">{Number(recalcResult.avancoObraGlobal ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
                      )}
                    </Button>
                  )}
                  {/* Rev. 4828 — botão "Editar" removido (fluxo automatizado; status só pelos botões) */}
                  {m.status !== "paga" && !(pagto?.pago || pagto?.parcial) && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                      disabled={excluirMedicaoMut.isPending}
                      onClick={() => setConfirmar({ title: `Excluir Medição ${String(m.numero).padStart(2, "0")}?`, description: descExcluirMedicao(m), actionLabel: "Excluir", destructive: true, onConfirm: () => excluirMedicaoMut.mutate({ id: m.id, contratoId: id, companyId: contrato.companyId }) })}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                )}
                </div>
              </DialogContent>
            </Dialog>

            {isExpanded && (
              <div className="border-t border-gray-100">
                <div className="flex items-center gap-1 px-3 pt-2 bg-gray-50/60 border-b border-gray-100">
                  {([["planilha", "Planilha de Medição", ClipboardCheck], ["levantamento", "Levantamento", Ruler]] as const).map(([key, label, Icon]) => (
                    <button
                      key={key}
                      onClick={() => setMedSubTab(s => ({ ...s, [m.id]: key }))}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${subTab === key ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                    >
                      <Icon className="w-3.5 h-3.5" />{label}
                    </button>
                  ))}
                </div>

                {subTab === "planilha" ? (
                  itens.length > 0 ? (<>
                    <div className="overflow-x-auto">
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
                      <th className="px-2 py-2 text-center w-[70px] bg-blue-50/70 text-blue-700">% Período</th>
                      <th className="px-2 py-2 text-right w-[95px] bg-blue-50/70 text-blue-700" title="Quantidade medida no período, conforme levantamento">Qtd. Medida</th>
                      <th className="px-2 py-2 text-right w-[90px] bg-blue-50/70 text-blue-700">V.Período</th>
                      <th className="px-2 py-2 text-center w-[110px]" title="Avanço físico acumulado do item">% Medido</th>
                      <th className="px-2 py-2 text-right w-[90px]">V.Acum.</th>
                      {mostrarRemover && <th className="px-2 py-2 text-center w-[35px]"></th>}
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
                              const colCount = isPreApproval ? 13 : 12;
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
                            <td className="px-2 py-2 text-center bg-blue-50/40">
                              {editavel && isEditingThis ? (
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
                                  className={`font-semibold ${percPeriodo > 0 ? "text-blue-700" : "text-gray-400"} ${editavel ? "cursor-pointer hover:underline" : ""}`}
                                  onClick={() => editavel && setEditingItem({ id: item.id, valor: percPeriodo.toFixed(1) })}
                                  title={item.editadoManualmente ? `Avanço físico real: ${Number(item.percentualFisicoReal || 0).toFixed(1)}% — Editado manualmente` : undefined}
                                >
                                  +{percPeriodo.toFixed(1)}%
                                  {item.editadoManualmente && <AlertTriangle className="w-3 h-3 inline ml-0.5 text-orange-500" />}
                                </span>
                              )}
                            </td>
                            {/* Rev. 4795 — Qtd. Medida no período (conforme levantamento) */}
                            <td className="px-2 py-2 text-right bg-blue-50/40 whitespace-nowrap">
                              {percPeriodo > 0 && Number(item.quantidade || 0) > 0 ? (
                                <>
                                  <div className="font-semibold text-blue-700 tabular-nums">
                                    {(Number(item.quantidade) * percPeriodo / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                                    {item.unidade ? ` ${item.unidade}` : ""}
                                  </div>
                                  <div className="text-[10px] text-gray-400 tabular-nums">
                                    de {Number(item.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{item.unidade ? ` ${item.unidade}` : ""}
                                  </div>
                                </>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right text-gray-600 bg-blue-50/40">
                              {editavel && editingValor?.id === item.id ? (
                                <div className="flex items-center gap-1 justify-end">
                                  <span className="text-gray-400 text-[10px]">R$</span>
                                  <input
                                    inputMode="numeric"
                                    className="w-24 text-right border rounded px-1 py-0.5 text-xs"
                                    value={editingValor.valor}
                                    onChange={e => setEditingValor({ ...editingValor, valor: maskValorBRL(e.target.value) })}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") {
                                        submitValorPeriodo(item.id, m.id, contrato.companyId, editingValor.valor);
                                      } else if (e.key === "Escape") { valorSubmitGuard.current = true; setEditingValor(null); }
                                    }}
                                    onBlur={() => submitValorPeriodo(item.id, m.id, contrato.companyId, editingValor.valor)}
                                    autoFocus
                                  />
                                </div>
                              ) : (
                                <span
                                  className={editavel ? "cursor-pointer hover:underline" : ""}
                                  onClick={() => { if (editavel) { valorSubmitGuard.current = false; setEditingValor({ id: item.id, valor: maskValorBRL(String(Math.round(Number(item.valorMedidoPeriodo || 0) * 100))) }); } }}
                                  title={editavel ? "Clique para lançar o valor medido do período (R$)" : undefined}
                                >
                                  {BRL(item.valorMedidoPeriodo)}
                                </span>
                              )}
                              {(parseFloat((item as any).valorMatPeriodo ?? "0") > 0 || parseFloat((item as any).valorMdoPeriodo ?? "0") > 0) && (
                                <div className="flex flex-col items-end gap-0 mt-0.5">
                                  <span className="text-[9px] text-blue-500 font-medium">MAT {BRL((item as any).valorMatPeriodo)}</span>
                                  <span className="text-[9px] text-orange-500 font-medium">MDO {BRL((item as any).valorMdoPeriodo)}</span>
                                </div>
                              )}
                            </td>
                            {/* Rev. 4795 — % Médio (avanço acumulado) com barra de progresso */}
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 min-w-[36px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500" style={{ width: `${Math.min(100, percAcumulado)}%` }} />
                                </div>
                                <span className={`text-[11px] font-semibold tabular-nums ${percAcumulado >= 100 ? "text-emerald-600" : "text-gray-700"}`}>{percAcumulado.toFixed(1)}%</span>
                              </div>
                              {percAcumulado > 0 && Number(item.quantidade || 0) > 0 && (
                                <div className="text-[10px] text-gray-400 text-right tabular-nums mt-0.5 whitespace-nowrap">
                                  {(Number(item.quantidade) * percAcumulado / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{item.unidade ? ` ${item.unidade}` : ""} acum.
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right font-semibold text-gray-900">
                              {BRL(item.valorAcumulado)}
                              {(parseFloat((item as any).valorMatAcumulado ?? "0") > 0 || parseFloat((item as any).valorMdoAcumulado ?? "0") > 0) && (
                                <div className="flex flex-col items-end gap-0 mt-0.5">
                                  <span className="text-[9px] text-blue-500 font-medium">MAT {BRL((item as any).valorMatAcumulado)}</span>
                                  <span className="text-[9px] text-orange-500 font-medium">MDO {BRL((item as any).valorMdoAcumulado)}</span>
                                </div>
                              )}
                            </td>
                            {mostrarRemover && (
                              <td className="px-2 py-2 text-center">
                                <button onClick={() => setConfirmar({ title: "Remover este item da medição?", actionLabel: "Remover", destructive: true, onConfirm: () => removerMedicaoItemMut.mutate({ medicaoItemId: item.id, medicaoId: m.id, companyId: contrato.companyId }) })}
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
                      <td />
                      <td className="px-2 py-2 text-right text-gray-900">{BRL(m.valorAcumulado)}</td>
                      {mostrarRemover && <td />}
                    </tr>
                  </tfoot>
                    </table>
                    </div>
                    {/* Rev. 4802 — excedente medido além do contratado → fluxo de Aditivo */}
                    {(() => {
                      const excedentes = itens.filter((it: any) => Number(it.quantidadeExcedente || 0) > 0.0001);
                      if (excedentes.length === 0) return null;
                      return (
                        <div className="mx-4 mb-3 space-y-2">
                          {excedentes.map((it: any) => {
                            const adDoItem = (aditivos || []).filter((a: any) => a.contratoItemId === it.contratoItemId);
                            const pendente = adDoItem.find((a: any) => a.status === "pendente");
                            const qtdExc = Number(it.quantidadeExcedente || 0);
                            return (
                              <div key={it.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500" />
                                <span className="flex-1 min-w-[200px] break-words">
                                  <strong>{qtdExc.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{it.unidade ? ` ${it.unidade}` : ""}</strong> medidos <strong>além do contratado</strong> em "{it.descricao}" — fora do valor a pagar até virar aditivo.
                                </span>
                                {pendente ? (
                                  <Badge variant="outline" className="text-[10px] text-purple-700 border-purple-300 bg-purple-50">Aditivo #{pendente.numero} aguardando aprovação</Badge>
                                ) : modoEdicao && editavel ? (
                                  <Button size="sm" className="h-7 gap-1 text-[11px] bg-amber-600 hover:bg-amber-700"
                                    onClick={() => setAditivoDialog({ item: it, medicaoId: m.id })}>
                                    <FilePlus className="w-3 h-3" /> Gerar Aditivo
                                  </Button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    <RetencoesSec m={m} contrato={contrato} isEditable={editavel} fdRows={fdsAll.filter((f: any) => f.medicaoId === m.id)} />
                  </>) : (
                    <div className="p-4 text-center text-xs text-gray-400">
                      Itens da medição não carregados. Expanda para ver detalhes.
                    </div>
                  )
                ) : (
                  <div className="p-4 space-y-3">
                    <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-800">
                      <Ruler className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>Levantamento de campo sobre o projeto (PDF/plantas): demarque áreas, volumes, perímetros e contagens vinculados a esta medição. O resultado pode alimentar a planilha.</span>
                    </div>
                    {m.levantamentoCampoId ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="gap-1 text-xs text-blue-700 border-blue-200 bg-blue-50">
                          <Ruler className="w-3 h-3" /> Levantamento de campo vinculado
                        </Badge>
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => abrirLevantamento(m.levantamentoCampoId)}>
                          <ExternalLink className="w-3 h-3" /> Abrir ferramenta de levantamento
                        </Button>
                      </div>
                    ) : modoEdicao && m.status !== "aprovada" && m.status !== "paga" ? (
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-blue-700 border-blue-200 hover:bg-blue-50"
                        disabled={levantando}
                        onClick={() => fazerLevantamento(m)}>
                        {levantando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ruler className="w-3 h-3" />}
                        Fazer levantamento de campo (projeto/plantas)
                      </Button>
                    ) : (
                      <p className="text-xs text-gray-400">Nenhum levantamento de campo vinculado a esta medição.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <ConfirmBox state={confirmar} onClose={() => setConfirmar(null)} />

      {aditivoDialog && (
        <AditivoDialog
          contrato={contrato}
          item={aditivoDialog.item}
          medicaoId={aditivoDialog.medicaoId}
          onClose={() => setAditivoDialog(null)}
          onCreated={() => { setAditivoDialog(null); invalidarAditivos(); }}
        />
      )}

      {aditivoRejeicao && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setAditivoRejeicao(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900">Rejeitar Aditivo #{aditivoRejeicao.numero}</h3>
            <div>
              <Label className="text-xs">Motivo da rejeição</Label>
              <textarea className="w-full mt-1 border border-gray-200 rounded-lg p-3 text-sm min-h-[80px]" placeholder="Descreva o motivo..."
                value={aditivoMotivoRej} onChange={e => setAditivoMotivoRej(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setAditivoRejeicao(null)}>Cancelar</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" disabled={aditivoMotivoRej.trim().length < 5 || rejeitarAditivoMut.isPending}
                onClick={() => rejeitarAditivoMut.mutate({ id: aditivoRejeicao.id, companyId: contrato.companyId, motivo: aditivoMotivoRej.trim(), rejeitadoPor: "Responsável" })}>
                Confirmar Rejeição
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Rev. 4859 — destravar medição PAGA: só admin master com senha; o servidor
          faz a volta completa (estorna baixa → remove título → cancela aprovação). */}
      <Dialog open={!!destravar} onOpenChange={v => { if (!v) setDestravar(null); }}>
        <DialogContent className="border-slate-300 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-slate-800 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Destravar Medição {destravar?.numero} (paga)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">Medição paga é imutável (LGPD/ISO 9001).</p>
              <p>Com a sua senha de admin master, o sistema fará a <strong>volta completa</strong>, na ordem correta:</p>
              <p>1. Estorna a baixa do pagamento no Contas a Pagar;<br />2. Remove o título do Financeiro;<br />3. Cancela a aprovação (a medição volta para "Aguardando Aprovação" como nova revisão).</p>
              <p>Nada é apagado sem esse caminho — o histórico do estorno fica registrado.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Senha do admin master <span className="text-red-500">*</span></Label>
              <Input type="password" placeholder="Confirme sua senha" value={senhaDestravar} onChange={e => setSenhaDestravar(e.target.value)} className="text-sm" />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDestravar(null)} disabled={cancelarAprovacaoMut.isPending}>Voltar</Button>
            <Button
              className="bg-slate-700 hover:bg-slate-600 text-white gap-1.5"
              disabled={!senhaDestravar || cancelarAprovacaoMut.isPending}
              onClick={() => destravar && cancelarAprovacaoMut.mutate({ id: destravar.id, companyId: contrato.companyId, senhaMaster: senhaDestravar }, { onSuccess: () => setDestravar(null) })}
            >
              {cancelarAprovacaoMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Destravar e Desfazer Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

    </div>
  );
}

// Rev. 4830 — Comparativo com o Avanço da Obra, INLINE abaixo da medição.
// Item a item (medido × cliente × obra) + parecer técnico completo por escrito.
function ComparativoObraSection({ r, m, onClose }: { r: any; m: any; onClose: () => void }) {
  const fmtP = (v: any) => Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const acima = (r.divergencias || []).filter((d: any) => d.tipo === "acima");
  const abaixo = (r.divergencias || []).filter((d: any) => d.tipo === "abaixo");
  const avancoObra = Number(r.avancoObraGlobal ?? 0);
  const medidoGlobal = Number(r.percentualGlobal ?? 0);
  const saldoGlobal = avancoObra - medidoGlobal;
  const numeroMed = String(m.numero ?? "").padStart(2, "0");

  // Parecer técnico por extenso (boletim de medição — caráter consultivo)
  const paragrafos: string[] = [];
  paragrafos.push(
    `Procedeu-se ao cruzamento do Boletim de Medição nº ${numeroMed} com o avanço físico apurado no cronograma da obra. ` +
    `O valor medido no período é de R$ ${Number(r.valorMedido ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}, ` +
    `o que representa ${fmtP(medidoGlobal)}% do valor contratado (acumulado). ` +
    `O avanço físico da obra, ponderado pelo valor dos itens vinculados ao cronograma, encontra-se em ${fmtP(avancoObra)}%.`
  );
  paragrafos.push(
    `Dos ${(r.itens || []).length} item(ns) da planilha de medição, ${r.vinculados ?? 0} está(ão) vinculado(s) a atividades do cronograma` +
    `${(r.naoVinculados ?? 0) > 0 ? ` e ${r.naoVinculados} permanece(m) sem vínculo — para esses, o comparativo físico não pôde ser apurado` : ""}. ` +
    `Adotou-se tolerância de 3 (três) pontos percentuais entre o medido acumulado e o avanço físico, margem usual para absorver defasagens de apropriação entre a data da medição e a última atualização do cronograma.`
  );
  if (acima.length > 0) {
    paragrafos.push(
      `Constatou-se medição ACIMA do avanço físico da obra em ${acima.length} item(ns): ` +
      acima.map((d: any) => `${d.descricao} (medido ${fmtP(d.medidoAcum)}% × obra ${fmtP(d.avancoObra)}%)`).join("; ") + ". " +
      `Medição superior ao avanço físico pode indicar antecipação de faturamento em relação ao serviço efetivamente executado, ou cronograma desatualizado. Recomenda-se verificação in loco antes da aprovação e, se for o caso, a atualização do avanço no Planejamento.`
    );
  }
  if (abaixo.length > 0) {
    paragrafos.push(
      `Constatou-se medição ABAIXO do avanço físico da obra em ${abaixo.length} item(ns): ` +
      abaixo.map((d: any) => `${d.descricao} (medido ${fmtP(d.medidoAcum)}% × obra ${fmtP(d.avancoObra)}%)`).join("; ") + ". " +
      `Medição inferior ao avanço físico pode indicar serviço executado e ainda não medido (saldo a apropriar em boletins futuros) ou execução por terceiros/administração direta na mesma atividade.`
    );
  }
  if (acima.length === 0 && abaixo.length === 0) {
    paragrafos.push(
      `Não foram identificadas divergências acima da tolerância: o medido acumulado é compatível com o avanço físico registrado no cronograma da obra.`
    );
  }
  if (r.temMedicaoCliente) {
    paragrafos.push(
      `A obra possui controle de medição junto ao cliente (módulo Medição); o percentual "Cliente" na tabela corresponde ao acumulado medido com o contratante para a mesma atividade/EAP, permitindo aferir o equilíbrio entre o que se paga ao terceiro e o que se recebe do cliente.`
    );
  }
  paragrafos.push(
    `Este comparativo tem caráter exclusivamente CONSULTIVO: não altera o valor medido, não bloqueia o fluxo de aprovação e fica registrado como referência no boletim. O valor devido ao contratado permanece o apurado na planilha de medição${(m.status === "aguardando_aprovacao") ? ", pendente de aprovação" : ""}.`
  );

  return (
    <div id={`comparativo-obra-${m.id}`} className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700 flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4" /> Comparativo com o Avanço da Obra
        </p>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-500" onClick={onClose}><X className="w-3.5 h-3.5" /></Button>
      </div>

      {/* Avanço da obra em destaque — 0% a 100% */}
      <div>
        <div className="flex items-end justify-between mb-1">
          <p className="text-sm font-medium text-gray-700">Avanço da Obra (cronograma)</p>
          <p className="text-2xl font-bold text-blue-700">{fmtP(avancoObra)}%</p>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, avancoObra))}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5"><span>0%</span><span>100%</span></div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-blue-100 p-3 text-center">
          <p className="text-xs text-blue-600 font-medium">Valor Medido (período)</p>
          <p className="text-lg font-bold text-blue-800">R$ {Number(r.valorMedido ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-lg border border-emerald-100 p-3 text-center">
          <p className="text-xs text-emerald-600 font-medium">% Medido do Contrato</p>
          <p className="text-lg font-bold text-emerald-800">{fmtP(medidoGlobal)}%</p>
        </div>
        <div className={`bg-white rounded-lg border p-3 text-center ${saldoGlobal < 0 ? "border-red-200" : "border-gray-200"}`}>
          <p className="text-xs text-gray-500 font-medium">Saldo (Obra − Medido)</p>
          <p className={`text-lg font-bold ${saldoGlobal < 0 ? "text-red-600" : "text-gray-800"}`}>{saldoGlobal > 0 ? "+" : ""}{fmtP(saldoGlobal)} p.p.</p>
          <p className="text-[10px] text-gray-400">{saldoGlobal < 0 ? "medido acima da obra" : saldoGlobal > 0 ? "saldo de obra a medir" : "em equilíbrio"}</p>
        </div>
      </div>

      {/* Item a item */}
      {Array.isArray(r.itens) && r.itens.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">Item</th>
                  <th className="text-right px-2 py-1.5 font-medium">Obra</th>
                  {r.temMedicaoCliente && <th className="text-right px-2 py-1.5 font-medium">Cliente</th>}
                  <th className="text-right px-2 py-1.5 font-medium">Medido</th>
                  <th className="text-right px-2 py-1.5 font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {r.itens.map((i: any, idx: number) => {
                  const temObra = i.avancoObra !== null && i.avancoObra !== undefined;
                  const saldo = temObra ? Number(i.avancoObra) - Number(i.medidoAcum ?? 0) : null;
                  const diverge = saldo !== null && Math.abs(saldo) > 3;
                  return (
                    <tr key={idx} className="border-t border-gray-100">
                      <td className="px-2 py-1.5 text-gray-700 break-words">{i.eapCodigo ? <span className="text-gray-400 mr-1">{i.eapCodigo}</span> : null}{i.descricao}</td>
                      <td className="px-2 py-1.5 text-right text-gray-700">{temObra ? `${fmtP(i.avancoObra)}%` : "—"}</td>
                      {r.temMedicaoCliente && <td className="px-2 py-1.5 text-right text-gray-700">{i.medidoCliente !== null && i.medidoCliente !== undefined ? `${fmtP(i.medidoCliente)}%` : "—"}</td>}
                      <td className={`px-2 py-1.5 text-right font-semibold ${diverge ? (saldo! < 0 ? "text-red-600" : "text-amber-600") : "text-gray-800"}`}>{fmtP(i.medidoAcum)}%</td>
                      <td className={`px-2 py-1.5 text-right font-semibold ${saldo === null ? "text-gray-400" : saldo < -3 ? "text-red-600" : saldo > 3 ? "text-amber-600" : "text-gray-700"}`}>{saldo === null ? "—" : `${saldo > 0 ? "+" : ""}${fmtP(saldo)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-400 px-2 py-1 border-t border-gray-100">Obra = avanço do cronograma · Cliente = medido com o cliente (módulo Medição) · Medido = acumulado desta medição do terceiro · Saldo = Obra − Medido (p.p.). Vermelho = medido acima da obra; âmbar = obra à frente do medido (&gt; 3 pontos).</p>
        </div>
      )}

      {r.naoVinculados > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-700 mb-1">Itens não vinculados (sem Item correspondente):</p>
          <ul className="text-xs text-amber-600 space-y-0.5">
            {(r.itens || []).filter((i: any) => !i.vinculado).map((i: any, idx: number) => (
              <li key={idx}>• {i.descricao} {i.eapCodigo ? `(Item: ${i.eapCodigo})` : "(sem código Item)"}</li>
            ))}
          </ul>
          <p className="text-xs text-amber-500 mt-2">Vincule esses itens ao cronograma na aba "Itens" usando o botão "Vincular Item" para que os avanços sejam puxados automaticamente.</p>
        </div>
      )}

      {/* Parecer técnico completo */}
      <div className="bg-white rounded-lg border border-gray-200 p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Parecer e Recomendação</p>
        <div className="space-y-2">
          {paragrafos.map((t, i) => (
            <p key={i} className="text-xs text-gray-600 leading-relaxed break-words text-justify">{t}</p>
          ))}
        </div>
      </div>
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

function RetencoesSec({ m, contrato, isEditable, fdRows = [] }: { m: any; contrato: any; isEditable: boolean; fdRows?: any[] }) {
  // Rev. 4802 — card de descontos clicável: lista ponto a ponto (o que e quando).
  const fdTotal = fdRows.reduce((s: number, f: any) => s + (Number(f.valor) || 0), 0);
  const [fdListOpen, setFdListOpen] = useState(false);
  // Rev. 4803 — rastreabilidade: clicar na OC do desconto abre o pedido de compra completo.
  const [ocDialogId, setOcDialogId] = useState<number | null>(null);
  const fdRegistros: any[] = contrato.fdMaterialRegistros || [];
  // OCs referenciadas por uma linha de desconto automático (o nº da OC está na descrição).
  const ocsDaLinha = (f: any): any[] => {
    if ((f.tipo || "fd") !== "fd") return [];
    const desc = String(f.descricao || "");
    const hits = fdRegistros.filter((r: any) => r.numeroOc && desc.includes(r.numeroOc));
    return hits.length > 0 ? hits : (f.origem === "auto" ? fdRegistros : []);
  };
  const [editingDescontos, setEditingDescontos] = useState(false);
  const [editingConfig, setEditingConfig] = useState(false);
  const [descontos, setDescontos] = useState(Number(m.descontos || 0));
  const [obsRetencao, setObsRetencao] = useState(m.observacoesRetencao || "");
  const [pdfLoading, setPdfLoading] = useState(false);
  // Rev. 4793 — assinatura digital do boletim via FCSign (sem papel)
  // Rev. 4851 — fluxo repensado (pedido do usuário): até 4 assinaturas
  // (contratada, elaborador, gestor se for outra pessoa, sócio administrador
  // automático), e-mail OPCIONAL (sem e-mail assina por link ou pelo pop-up de
  // pendências no próprio sistema), envio automático ao criar (gera os links).
  const { user: usuarioLogado } = useAuth();
  const [fcsignOpen, setFcsignOpen] = useState(false);
  const [gestorMesmo, setGestorMesmo] = useState(true);
  // Rev. 4854 — tela de COLHER assinaturas (na hora, por link/WhatsApp ou e-mail)
  const [colherEnvId, setColherEnvId] = useState<number | null>(null);
  const [fcsignSigs, setFcsignSigs] = useState<{ nome: string; email: string }[]>([
    { nome: contrato.empresa?.responsavelNome || contrato.empresa?.razaoSocial || "", email: contrato.empresa?.email || "" },
    { nome: (usuarioLogado as any)?.name || (usuarioLogado as any)?.nome || "", email: (usuarioLogado as any)?.email || "" },
    { nome: "", email: "" },
  ]);
  const [, navigate] = useLocation();

  const [percConfig, setPercConfig] = useState({
    percISS: String(Number(contrato.percISS || 0)),
    percINSS: String(Number(contrato.percINSS || 0)),
    percIRRF: String(Number(contrato.percIRRF || 0)),
    percOutrasRetencoes: String(Number(contrato.percOutrasRetencoes || 0)),
    percRetencaoTecnica: String(Number(contrato.percRetencaoTecnica || 0)),
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
  const parsePct = (s: string) => Math.min(100, Math.max(0, parseFloat(String(s).replace(",", ".")) || 0));

  const criarEnvelopeMut = trpc.integrasign.criarEnvelope.useMutation();
  const enviarEnvelopeMut = trpc.integrasign.enviarParaAssinatura.useMutation();
  // Rev. 4854 — colher assinaturas: envelope ao vivo (atualiza a cada 5s enquanto aberto)
  const colherEnv = trpc.integrasign.getEnvelope.useQuery(
    { companyId: contrato.companyId, id: colherEnvId ?? 0 },
    { enabled: !!colherEnvId, refetchInterval: 5000 }
  );
  const reenviarEmailMut = trpc.integrasign.reenviarNotificacao.useMutation();
  // Rev. 4857 — botão único: envelope existente da medição comanda o botão
  // (enviar 1x → "Ver assinaturas" → concluído → cancelar só Admin Master).
  const envMedicao = trpc.integrasign.envelopePorMedicao.useQuery(
    { companyId: contrato.companyId, medicaoTerceiroId: m.id },
    { refetchInterval: colherEnvId ? false : 30000 }
  );
  const ehMaster = (usuarioLogado as any)?.role === "admin_master";
  const cancelarEnvMut = trpc.integrasign.cancelarEnvelope.useMutation({
    onSuccess: () => { toast.success("Assinatura cancelada. Agora é possível ajustar e reenviar."); envMedicao.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const solicitarCancMut = trpc.integrasign.solicitarCancelamento.useMutation({
    onSuccess: (r: any) => toast.success(`Solicitação enviada ao Admin Master (${r?.notificados ?? ""} avisado(s)).`),
    onError: (e: any) => toast.error(e.message),
  });
  const handleFcsign = async () => {
    const [contratada, elaborador, gestor] = fcsignSigs;
    if (!contratada.nome.trim()) { toast.error("Informe o nome do responsável da contratada."); return; }
    if (!elaborador.nome.trim()) { toast.error("Informe o nome de quem elaborou a medição."); return; }
    if (!gestorMesmo && !gestor.nome.trim()) { toast.error("Informe o nome do gestor do contrato (ou marque que é a mesma pessoa)."); return; }
    const emailOk = (s: string) => !s.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
    if (!emailOk(contratada.email) || !emailOk(elaborador.email) || (!gestorMesmo && !emailOk(gestor.email))) {
      toast.error("E-mail inválido (deixe em branco para assinar por link)."); return;
    }
    // Rev. 4857 — iPad/Safari derruba a conexão às vezes ("The string did not
    // match the expected pattern") mesmo com o servidor tendo gravado. O backend
    // agora é IDEMPOTENTE (reusa envelope ativo da medição), então o retry é seguro.
    const ehErroTransporte = (msg: string) => {
      const m = (msg || "").toLowerCase();
      return !m || ["did not match the expected pattern", "load failed", "failed to fetch", "networkerror", "network connection", "aborted", "timed out", "operation couldn't be completed"].some((p) => m.includes(p));
    };
    const comRetry = async <T,>(fn: () => Promise<T>): Promise<T> => {
      try { return await fn(); } catch (e: any) {
        if (ehErroTransporte(e?.message)) { await new Promise((r) => setTimeout(r, 800)); return await fn(); }
        throw e;
      }
    };
    try {
      const env: any = await comRetry(() => criarEnvelopeMut.mutateAsync({
        companyId: contrato.companyId,
        medicaoTerceiroId: m.id,
        obraId: contrato.obraId ?? undefined,
        titulo: "auto",
        signatarios: [
          { papel: "fornecedor", ordemAssinatura: 1, nome: contratada.nome.trim(), email: contratada.email.trim(), cargo: "Representante Legal", empresaNome: contrato.empresa?.razaoSocial || undefined },
          { papel: "gestor_projeto", ordemAssinatura: 2, nome: elaborador.nome.trim(), email: elaborador.email.trim(), cargo: "Elaborador da Medição", empresaNome: "Contratante" },
          ...(!gestorMesmo ? [{ papel: "gestor_projeto" as const, ordemAssinatura: 3, nome: gestor.nome.trim(), email: gestor.email.trim(), cargo: "Gestor do Contrato", empresaNome: "Contratante" }] : []),
        ],
      } as any));
      // Rev. 4854 — NÃO envia nada automaticamente (pedido do usuário): só
      // ativa os links e abre a tela de COLHER assinaturas — lá o usuário
      // escolhe por signatário: assinar na hora, link/WhatsApp ou e-mail.
      await comRetry(() => enviarEnvelopeMut.mutateAsync({ companyId: contrato.companyId, envelopeId: env.id, enviarEmail: false } as any));
      setFcsignOpen(false);
      setColherEnvId(env.id);
      envMedicao.refetch();
      toast.success("Links de assinatura ativos! Agora é só colher as assinaturas.");
    } catch (e: any) {
      toast.error(ehErroTransporte(e?.message)
        ? "Falha de conexão do iPad/Safari. Tente de novo — o sistema não cria duplicatas."
        : (e?.message || "Erro ao criar/enviar envelope"));
    }
  };

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
  // Rev. 4801 — o Líquido do rodapé abate também os descontos de FD/EPI/etc. da medição
  const valorLiquido = valorBruto - totalRet - descontos - fdTotal;

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

  // Rev. 4802 — pedido do usuário: NÃO baixar automaticamente. Abre o PDF numa
  // aba de visualização; lá o usuário decide se baixa (Safari/iPad mostra o
  // preview nativo com botão de compartilhar/baixar).
  // Detalhe iOS: a aba precisa ser aberta ANTES do fetch (window.open depois de
  // um await é bloqueado como popup pelo Safari).
  const handlePdf = async () => {
    setPdfLoading(true);
    const win = window.open("about:blank", "_blank");
    // Rev. 4896 — Poka-Yoke visual: a aba abre com uma tela de carregamento com
    // % de 0 a 100 (nada de "about:blank" parecendo erro). O PDF só é exibido
    // quando chega a 100%.
    let setPct: (p: number) => void = () => {};
    if (win && !win.closed) {
      try {
        win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Gerando Boletim de Medição…</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{margin:0;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#f4f6fa;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(27,42,74,.12);padding:40px 48px;text-align:center;max-width:340px}
  .t{color:#1B2A4A;font-weight:700;font-size:16px;margin:0 0 6px}
  .s{color:#64748b;font-size:12px;margin:0 0 22px}
  .bar{height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden}
  .fill{height:100%;width:0%;background:linear-gradient(90deg,#2563eb,#3b82f6);border-radius:999px;transition:width .35s ease}
  .pct{color:#2563eb;font-weight:700;font-size:22px;margin-top:14px}
</style></head><body><div class="card">
  <p class="t">Gerando Boletim de Medição</p>
  <p class="s">Aguarde — o PDF abrirá automaticamente ao chegar em 100%.</p>
  <div class="bar"><div class="fill" id="f"></div></div>
  <div class="pct" id="p">0%</div>
</div></body></html>`);
        win.document.close();
        setPct = (p: number) => {
          try {
            const f = win.document.getElementById("f"); const el = win.document.getElementById("p");
            if (f) (f as any).style.width = `${Math.round(p)}%`;
            if (el) el.textContent = `${Math.round(p)}%`;
          } catch { /* aba fechada */ }
        };
      } catch { /* noop */ }
    }
    // Progresso simulado (fetch tRPC não expõe progresso real): sobe rápido até
    // ~90% e trava; 100% só quando o PDF realmente chegou.
    let pct = 0;
    const timer = setInterval(() => {
      pct = Math.min(90, pct + (pct < 40 ? 7 : pct < 70 ? 4 : 1.5));
      setPct(pct);
    }, 350);
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
      clearInterval(timer);
      setPct(100);
      // pequena pausa para o usuário VER o 100% antes do PDF abrir
      await new Promise((r) => setTimeout(r, 400));
      if (win && !win.closed) win.location.href = url;
      else window.open(url, "_blank"); // fallback (pode ser bloqueado, mas tenta)
      // não revogar já — a aba ainda vai carregar o blob; libera depois.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      clearInterval(timer);
      try { win?.close(); } catch { /* noop */ }
      toast.error(e.message || "Erro ao gerar PDF");
    }
    setPdfLoading(false);
  };

  const hasPerc = pISS > 0 || pINSS > 0 || pIRRF > 0 || pOutras > 0 || pRetTecnica > 0;

  return (
    <div className="border-t border-gray-100 p-4 space-y-3">
      {/* Rev. 4827 — aviso permanente de FD excluído, também no bloco de descontos */}
      {(m as any).fdExclusaoAlerta && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-red-600 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Existem FDs pendentes</p>
          <p className="text-[11px] text-red-700 break-words leading-relaxed whitespace-pre-line">{(m as any).fdExclusaoAlerta}</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Retenções e Descontos</h4>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={handlePdf} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />} Gerar PDF
          </Button>
          {/* Rev. 4857 — botão único conforme o estado do envelope da medição */}
          {!envMedicao.data ? (
            <Button size="sm" className="gap-1 text-xs bg-blue-700 hover:bg-blue-800 text-white" disabled={envMedicao.isLoading} onClick={() => setFcsignOpen(true)}>
              <PenLine className="w-3 h-3" /> Assinar no FCSign
            </Button>
          ) : envMedicao.data.status !== "concluido" ? (
            <Button size="sm" className="gap-1 text-xs bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setColherEnvId(envMedicao.data!.id)}>
              <Clock3 className="w-3 h-3" /> Assinaturas pendentes ({envMedicao.data.assinados}/{envMedicao.data.total})
            </Button>
          ) : ehMaster ? (
            <Button size="sm" variant="outline" className="gap-1 text-xs border-red-300 text-red-600 hover:bg-red-50"
              disabled={cancelarEnvMut.isPending}
              onClick={() => {
                const motivo = window.prompt("Documento ASSINADO por todos. Cancelar libera ajustes na medição, mas invalida as assinaturas. Motivo do cancelamento:");
                if (motivo?.trim()) cancelarEnvMut.mutate({ companyId: contrato.companyId, envelopeId: envMedicao.data!.id, motivo: motivo.trim() } as any);
              }}>
              <XCircle className="w-3 h-3" /> Cancelar assinatura
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-1 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
              disabled={solicitarCancMut.isPending}
              onClick={() => {
                const motivo = window.prompt("Documento assinado e encerrado — só o Admin Master pode cancelar. Descreva o motivo para solicitar o cancelamento:");
                if (motivo?.trim()) solicitarCancMut.mutate({ companyId: contrato.companyId, envelopeId: envMedicao.data!.id, motivo: motivo.trim() } as any);
              }}>
              <ShieldCheck className="w-3 h-3" /> Assinado — solicitar cancelamento
            </Button>
          )}
        </div>
      </div>

      {/* Rev. 4852 — dialog repaginado: rota de assinaturas em timeline colorida */}
      <Dialog open={fcsignOpen} onOpenChange={setFcsignOpen}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-y-auto max-h-[92dvh] rounded-2xl">
          <div className="bg-gradient-to-br from-[#1B2A4A] via-[#22376b] to-blue-700 px-5 pt-5 pb-4 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5 text-white text-base">
                <span className="rounded-xl bg-white/15 p-2 backdrop-blur-sm"><PenLine className="w-4 h-4" /></span>
                Assinatura digital do boletim
              </DialogTitle>
            </DialogHeader>
            <p className="mt-2 text-[11px] leading-relaxed text-blue-100/90 break-words">
              Fluxo sem papel, com hash e trilha de auditoria. Cada pessoa assina na sua vez — quem
              tem acesso ao sistema recebe o aviso ao entrar e assina por lá mesmo.
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-blue-50">
              <Link2 className="w-3 h-3" /> E-mail opcional — sem e-mail, assina pelo link (pode encaminhar)
            </div>
          </div>

          <div className="px-5 py-4 space-y-0 bg-slate-50/60">
            {[
              { titulo: "Contratada", sub: "Confere e assina o valor líquido", idx: 0, mostra: true, Icon: Building2, ring: "ring-orange-200", chip: "bg-orange-500", faixa: "border-l-orange-400", txt: "text-orange-700" },
              { titulo: "Quem elaborou a medição", sub: "Responde pela planilha medida", idx: 1, mostra: true, Icon: UserRound, ring: "ring-blue-200", chip: "bg-blue-600", faixa: "border-l-blue-500", txt: "text-blue-700" },
              { titulo: "Gestor do contrato", sub: "Valida a medição do terceiro", idx: 2, mostra: !gestorMesmo, Icon: BadgeCheck, ring: "ring-violet-200", chip: "bg-violet-600", faixa: "border-l-violet-500", txt: "text-violet-700" },
            ].map(({ titulo, sub, idx, mostra, Icon, ring, chip, faixa, txt }, pos) => (
              <div key={idx} className={mostra ? "relative pl-9 pb-3" : "hidden"}>
                {/* trilho vertical */}
                <span className="absolute left-[13px] top-7 bottom-0 w-px bg-slate-300" aria-hidden />
                <span className={`absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full ${chip} text-white text-[11px] font-bold shadow ring-4 ${ring}`}>
                  {gestorMesmo ? pos + 1 : idx + 1}
                </span>
                <div className={`rounded-xl border border-slate-200 border-l-4 ${faixa} bg-white p-3 shadow-sm space-y-1.5`}>
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 ${txt}`} />
                    <span className={`text-xs font-semibold ${txt}`}>{titulo}</span>
                    <span className="ml-auto text-[10px] text-slate-400">{sub}</span>
                  </div>
                  <Input
                    className="bg-white"
                    placeholder="Nome completo"
                    value={fcsignSigs[idx].nome}
                    onChange={(e) => setFcsignSigs(s => s.map((x, i) => i === idx ? { ...x, nome: e.target.value } : x))}
                  />
                  <Input
                    type="email"
                    className="bg-white"
                    placeholder="E-mail (opcional)"
                    value={fcsignSigs[idx].email}
                    onChange={(e) => setFcsignSigs(s => s.map((x, i) => i === idx ? { ...x, email: e.target.value } : x))}
                  />
                  {idx === 1 && (
                    <label className="flex items-center gap-2 pt-1 text-xs text-slate-600 cursor-pointer select-none">
                      <input type="checkbox" checked={gestorMesmo} onChange={(e) => setGestorMesmo(e.target.checked)} className="h-4 w-4 accent-blue-700" />
                      O gestor do contrato é a mesma pessoa
                    </label>
                  )}
                </div>
              </div>
            ))}

            {/* Sócio administrador — automático */}
            <div className="relative pl-9">
              <span className="absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white shadow ring-4 ring-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5" />
              </span>
              <div className="rounded-xl border border-emerald-200 border-l-4 border-l-emerald-500 bg-emerald-50/70 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                  Sócio administrador
                  <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700">automático</span>
                </div>
                <p className="mt-0.5 text-[11px] text-emerald-700/90">Assinatura final de liberação — aprova a medição e libera o pagamento.</p>
              </div>
            </div>
          </div>

          <div className="px-5 pb-5 pt-1 bg-slate-50/60">
            <Button
              className="w-full h-11 rounded-xl bg-gradient-to-r from-[#1B2A4A] to-blue-700 hover:from-[#16233f] hover:to-blue-800 text-white shadow-md"
              onClick={handleFcsign}
              disabled={criarEnvelopeMut.isPending || enviarEnvelopeMut.isPending}
            >
              {(criarEnvelopeMut.isPending || enviarEnvelopeMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <PenLine className="w-4 h-4 mr-1.5" />}
              Criar e gerar links de assinatura
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rev. 4854 — COLHER ASSINATURAS: assinar na hora, link/WhatsApp ou e-mail */}
      <Dialog open={!!colherEnvId} onOpenChange={(o) => { if (!o) setColherEnvId(null); }}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-y-auto max-h-[92dvh] rounded-2xl">
          <div className="bg-gradient-to-br from-[#0f2027] via-[#1B2A4A] to-teal-800 px-5 pt-5 pb-4 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5 text-white text-base">
                <span className="rounded-xl bg-white/15 p-2 backdrop-blur-sm"><PenLine className="w-4 h-4" /></span>
                Colher assinaturas
              </DialogTitle>
            </DialogHeader>
            <p className="mt-2 text-[11px] leading-relaxed text-teal-100/90 break-words">
              Nada foi enviado ainda. Para cada pessoa você escolhe: <b>assinar agora</b> (se estiver
              aqui com você), mandar o <b>link pelo WhatsApp</b> ou disparar por <b>e-mail</b>. A ordem é
              respeitada — o próximo só assina depois do anterior.
            </p>
          </div>

          <div className="px-5 py-4 space-y-2.5 bg-slate-50/60">
            {colherEnv.isLoading && <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-teal-600" /></div>}
            {(() => {
              const sigs: any[] = ((colherEnv.data as any)?.signatarios || []);
              const obrig = sigs.filter((s: any) => s.papel !== "testemunha").sort((a: any, b: any) => a.ordemAssinatura - b.ordemAssinatura);
              const atualId = obrig.find((s: any) => s.status !== "assinado")?.id ?? null;
              const papelLbl = (s: any) => s.cargo || (s.papel === "fornecedor" ? "Contratada" : s.papel === "diretor" ? "Sócio Administrador" : "Contratante");
              return obrig.map((s: any, i: number) => {
                const assinado = s.status === "assinado";
                const ehAtual = s.id === atualId;
                const link = `${window.location.origin}/integrasign/assinar/${s.token}`;
                const zapTxt = encodeURIComponent(`Olá, ${s.nome}! Segue o link para conferir e assinar o boletim de medição digitalmente pelo FCSign:\n\n${link}`);
                return (
                  <div key={s.id} className={`rounded-2xl border bg-white p-3.5 ${ehAtual ? "border-teal-300 ring-2 ring-teal-100" : assinado ? "border-emerald-200" : "border-slate-200 opacity-70"}`}>
                    <div className="flex items-center gap-2.5">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${assinado ? "bg-emerald-500" : ehAtual ? "bg-teal-600" : "bg-slate-300"}`}>
                        {assinado ? <Check className="w-4 h-4" /> : i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 break-words leading-tight">{s.nome}</p>
                        <p className="text-[11px] text-slate-500">{papelLbl(s)}{s.email ? ` · ${s.email}` : " · sem e-mail (assina pelo link)"}</p>
                      </div>
                      {assinado && <span className="text-[10px] font-medium text-emerald-600">Assinado ✓</span>}
                      {!assinado && !ehAtual && <span className="text-[10px] text-slate-400">aguarda a vez</span>}
                    </div>
                    {!assinado && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <Button size="sm" className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white" disabled={!ehAtual}
                          title={ehAtual ? "Colher a assinatura agora, neste aparelho" : "Ainda não é a vez desta pessoa"}
                          onClick={() => window.open(link, "_blank", "noopener")}>
                          <PenLine className="w-3.5 h-3.5 mr-1" /> Assinar agora
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs"
                          onClick={async () => { try { await navigator.clipboard.writeText(link); toast.success("Link copiado!"); } catch { toast.error("Não foi possível copiar"); } }}>
                          <Link2 className="w-3.5 h-3.5 mr-1" /> Copiar link
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => window.open(`https://wa.me/?text=${zapTxt}`, "_blank", "noopener")}>
                          <Send className="w-3.5 h-3.5 mr-1" /> WhatsApp
                        </Button>
                        {s.email && (
                          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={reenviarEmailMut.isPending}
                            onClick={async () => {
                              try {
                                await reenviarEmailMut.mutateAsync({ companyId: contrato.companyId, signatarioId: s.id });
                                colherEnv.refetch();
                                toast.success(`E-mail enviado para ${s.email}`);
                              } catch (e: any) { toast.error(e?.message || "Erro ao enviar e-mail"); }
                            }}>
                            <Mail className="w-3.5 h-3.5 mr-1" /> Enviar e-mail
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
            {(colherEnv.data as any)?.status === "concluido" && (
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-center text-sm font-medium text-emerald-700">
                Todas as assinaturas colhidas — medição aprovada automaticamente! 🎉
              </div>
            )}
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Esta tela atualiza sozinha. Quando alguém assina, o próximo é liberado na hora — e quem
              tem acesso ao sistema também recebe o aviso ao entrar. Na tela de assinatura a pessoa vê
              o documento completo (todas as páginas) e a rubrica dela sai em cada página do PDF.
            </p>
          </div>

          <DialogFooter className="px-5 pb-4 bg-slate-50/60 flex-row gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate(`/integrasign?envelope=${colherEnvId}`)}>
              Abrir no FCSign
            </Button>
            <Button size="sm" className="flex-1 bg-[#1B2A4A] hover:bg-[#22376b] text-white" onClick={() => setColherEnvId(null)}>
              Concluir depois
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <Input type="text" inputMode="decimal" className="text-xs h-7"
                  value={(percConfig as any)[f.key]}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9.,]/g, "");
                    setPercConfig(prev => ({ ...prev, [f.key]: raw }));
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setEditingConfig(false)}>Cancelar</Button>
            <Button size="sm" className="text-xs h-7 gap-1" disabled={salvarConfigMut.isPending}
              onClick={() => salvarConfigMut.mutate({
                contratoId: contrato.id,
                companyId: contrato.companyId,
                percISS: parsePct(percConfig.percISS),
                percINSS: parsePct(percConfig.percINSS),
                percIRRF: parsePct(percConfig.percIRRF),
                percOutrasRetencoes: parsePct(percConfig.percOutrasRetencoes),
                percRetencaoTecnica: parsePct(percConfig.percRetencaoTecnica),
              })}>
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
        <div
          className={`bg-amber-50 rounded-lg p-2.5 ${fdRows.length > 0 ? "cursor-pointer hover:bg-amber-100 transition" : ""}`}
          onClick={() => fdRows.length > 0 && setFdListOpen(v => !v)}
          role={fdRows.length > 0 ? "button" : undefined}
        >
          <div className="text-gray-400 text-[10px] flex items-center gap-1">
            FD / Descontos lançados
            {fdRows.length > 0 && (fdListOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
          </div>
          <div className="font-semibold text-amber-700">{fdTotal > 0 ? `- ${BRL(fdTotal)}` : BRL(0)}</div>
          {fdRows.length > 0 && <div className="text-[10px] text-gray-400 mt-0.5">{fdListOpen ? "toque para ocultar" : `${fdRows.length} lançamento(s) — toque para ver`}</div>}
        </div>
        <div className="bg-blue-50 rounded-lg p-2.5">
          <div className="text-gray-400 text-[10px]">Valor Líquido</div>
          <div className="font-bold text-blue-700">{BRL(valorLiquido)}</div>
        </div>
        {fdListOpen && fdRows.length > 0 && (
          <div className="col-span-2 md:col-span-5 bg-white border border-amber-200 rounded-lg p-2 space-y-1">
            <div className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Descontos deste período — ponto a ponto</div>
            {[...fdRows].sort((a: any, b: any) => String(a.dataFd || "").localeCompare(String(b.dataFd || "")) || (a.id - b.id)).map((f: any) => {
              const td = TIPO_DESCONTO[f.tipo || "fd"] || TIPO_DESCONTO.outro;
              return (
                <div key={f.id} className="flex items-start gap-2 text-[11px] border-b border-gray-50 last:border-0 pb-1 last:pb-0">
                  <span className="text-gray-400 whitespace-nowrap">{f.dataFd ? fmtDate(String(f.dataFd).slice(0, 10)) : "—"}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${td.cls} whitespace-nowrap`}>{td.label}</span>
                  <span className="text-gray-700 break-words min-w-0 flex-1">
                    {f.descricao}
                    {f.origem === "auto" && <span className="text-gray-400"> (automático)</span>}
                    {f.origem === "avulso" && <span className="text-gray-400"> (lançado fora da medição)</span>}
                    {ocsDaLinha(f).length > 0 && (
                      <span className="inline-flex flex-wrap gap-1 ml-1.5 align-middle">
                        {ocsDaLinha(f).map((r: any) => (
                          <button
                            key={r.id}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                            onClick={(e) => { e.stopPropagation(); setOcDialogId(r.id); }}
                            title="Ver pedido de compra"
                          >
                            {r.numeroOc ? formatNumeroOcDisplay(r.numeroOc) : `OC #${r.id}`} <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold text-amber-700 whitespace-nowrap">- {BRL(Number(f.valor) || 0)}</span>
                </div>
              );
            })}
            <div className="flex justify-end text-[11px] font-bold text-amber-800 pt-1">Total: - {BRL(fdTotal)}</div>
          </div>
        )}
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
      {ocDialogId != null && (
        <OcMiniDialog companyId={contrato.companyId} ordemId={ocDialogId} onClose={() => setOcDialogId(null)} />
      )}
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

// Rev. 3079 — Painel de FD do período da medição (Terceiros · a pagar).
// FD manual lançado por medição; soma OBRIGATORIAMENTE abate o valor a pagar (líquido).
// Rev. 4801 — conta-corrente de descontos do terceiro (FD, EPI, ferramental, insumo, outro)
// Rev. 4801 — liberação da retenção técnica: aparece quando o contrato tem
// retenção (%) configurada; abate automaticamente os débitos pendentes
// (FD/EPI/insumo) e gera o título do líquido no Contas a Pagar.
// Rev. 4802 — lista de aditivos do contrato com aprovação em 2 níveis (gestor → sócio adm).
// Rev. 4814 — aba "Aditivos": lista numerada (Aditivo #1, #2…) + apropriação do
// orçamento por item (contratado × aditivos), p/ acompanhar se a OR estourou.
function AditivosTab({ contrato }: { contrato: any }) {
  const utils = trpc.useUtils();
  const { data: aditivos } = trpc.terceiroContratos.listarAditivos.useQuery(
    { contratoId: contrato.id, companyId: contrato.companyId },
    { enabled: !!contrato?.id && !!contrato?.companyId },
  );
  const invalidar = () => {
    utils.terceiroContratos.listarAditivos.invalidate({ contratoId: contrato.id, companyId: contrato.companyId });
    utils.terceiroContratos.getContrato.invalidate({ id: contrato.id });
  };
  const [rejeicao, setRejeicao] = useState<{ id: number; numero: number } | null>(null);
  const [motivoRej, setMotivoRej] = useState("");
  const aprovarGestorMut = trpc.terceiroContratos.aprovarAditivoGestor.useMutation({
    onSuccess: () => { toast.success("Aditivo aprovado pelo gestor da obra — aguardando sócio adm."); invalidar(); },
    onError: (e: any) => toast.error(e.message),
  });
  const aprovarSocioMut = trpc.terceiroContratos.aprovarAditivoSocio.useMutation({
    onSuccess: () => { toast.success("Aditivo aprovado! Quantidade e valor somados ao contrato."); invalidar(); },
    onError: (e: any) => toast.error(e.message),
  });
  const rejeitarMut = trpc.terceiroContratos.rejeitarAditivo.useMutation({
    onSuccess: () => { toast.success("Aditivo rejeitado."); setRejeicao(null); setMotivoRej(""); invalidar(); },
    onError: (e: any) => toast.error(e.message),
  });

  const nBR = (v: any, d = 2) => Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  // Apropriação por item do contrato: contratado × aditivos (aprovados/pendentes).
  // Obs.: aditivo APROVADO já foi somado ao item do contrato; o "contratado
  // original" é o atual MENOS os aprovados, p/ mostrar a evolução da OR.
  const linhas = (contrato.itens || []).map((it: any) => {
    const doItem = (aditivos || []).filter((a: any) => a.contratoItemId === it.id);
    const aprovadosQtd = doItem.filter((a: any) => a.status === "aprovado").reduce((s: number, a: any) => s + Number(a.quantidade || 0), 0);
    const aprovadosVal = doItem.filter((a: any) => a.status === "aprovado").reduce((s: number, a: any) => s + Number(a.valorTotal || 0), 0);
    const pendentesQtd = doItem.filter((a: any) => a.status === "pendente").reduce((s: number, a: any) => s + Number(a.quantidade || 0), 0);
    const pendentesVal = doItem.filter((a: any) => a.status === "pendente").reduce((s: number, a: any) => s + Number(a.valorTotal || 0), 0);
    const qtdAtual = Number(it.quantidade || 0); // já inclui aditivos aprovados
    const valAtual = Number(it.valorTotal || 0);
    const qtdOriginal = Math.max(0, qtdAtual - aprovadosQtd);
    const valOriginal = Math.max(0, valAtual - aprovadosVal);
    const acrescimoPct = valOriginal > 0 ? ((aprovadosVal + pendentesVal) / valOriginal) * 100 : 0;
    return { it, doItem, aprovadosQtd, aprovadosVal, pendentesQtd, pendentesVal, qtdOriginal, valOriginal, qtdAtual, valAtual, acrescimoPct };
  });
  const temAlgum = linhas.some((l: any) => l.doItem.length > 0);

  return (
    <div className="space-y-4">
      {/* Apropriação do orçamento */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Apropriação do orçamento (contratado × aditivos)</h4>
          <p className="text-[11px] text-gray-400 mt-0.5">Acompanhe, item a item, quanto a OR original cresceu com aditivos — aprovado soma no contrato; pendente ainda não.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-2 py-2 font-medium text-right">Contratado (OR)</th>
                <th className="px-2 py-2 font-medium text-right">Aditivos aprovados</th>
                <th className="px-2 py-2 font-medium text-right">Pendentes</th>
                <th className="px-2 py-2 font-medium text-right">Total c/ aditivos</th>
                <th className="px-4 py-2 font-medium text-right">Acréscimo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {linhas.map(({ it, aprovadosQtd, aprovadosVal, pendentesQtd, pendentesVal, qtdOriginal, valOriginal, qtdAtual, valAtual, acrescimoPct }: any) => (
                <tr key={it.id} className={acrescimoPct > 0 ? "bg-purple-50/30" : ""}>
                  <td className="px-4 py-2">
                    <span className="font-mono text-gray-400 mr-1">{it.eapCodigo}</span>
                    <span className="text-gray-700">{it.descricao}</span>
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{nBR(qtdOriginal)} {it.unidade}<div className="text-[10px] text-gray-400">{BRL(valOriginal)}</div></td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{aprovadosQtd > 0 ? <>+{nBR(aprovadosQtd)} {it.unidade}<div className="text-[10px] text-emerald-600">{BRL(aprovadosVal)}</div></> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{pendentesQtd > 0 ? <>+{nBR(pendentesQtd)} {it.unidade}<div className="text-[10px] text-amber-600">{BRL(pendentesVal)}</div></> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap font-semibold text-gray-800">{nBR(qtdAtual + pendentesQtd)} {it.unidade}<div className="text-[10px] text-gray-500 font-normal">{BRL(valAtual + pendentesVal)}</div></td>
                  <td className={`px-4 py-2 text-right whitespace-nowrap font-semibold ${acrescimoPct > 0 ? "text-purple-700" : "text-gray-300"}`}>{acrescimoPct > 0 ? `+${nBR(acrescimoPct, 1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lista de aditivos (Aditivo #1, #2, …) */}
      {(aditivos || []).length > 0 ? (
        <AditivosCard
          aditivos={aditivos || []}
          modoEdicao={true}
          onAprovarGestor={(a: any) => aprovarGestorMut.mutate({ id: a.id, companyId: contrato.companyId, aprovadoPor: "Gestor da Obra" })}
          onAprovarSocio={(a: any) => aprovarSocioMut.mutate({ id: a.id, companyId: contrato.companyId, aprovadoPor: "Sócio Adm" })}
          onRejeitar={(a: any) => setRejeicao({ id: a.id, numero: a.numero })}
          isPending={aprovarGestorMut.isPending || aprovarSocioMut.isPending}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 py-10 text-center text-gray-400 text-sm">
          <FilePlus className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Nenhum aditivo neste contrato ainda.
          {!temAlgum && <><br />O excedente medido além do contratado aparece na aba Medições com o botão "Gerar Aditivo".</>}
        </div>
      )}

      {rejeicao && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRejeicao(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900">Rejeitar Aditivo #{rejeicao.numero}</h3>
            <div>
              <Label className="text-xs">Motivo da rejeição</Label>
              <textarea className="w-full mt-1 border border-gray-200 rounded-lg p-3 text-sm min-h-[80px]" placeholder="Descreva o motivo..."
                value={motivoRej} onChange={e => setMotivoRej(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setRejeicao(null)}>Cancelar</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" disabled={motivoRej.trim().length < 5 || rejeitarMut.isPending}
                onClick={() => rejeitarMut.mutate({ id: rejeicao.id, companyId: contrato.companyId, motivo: motivoRej.trim(), rejeitadoPor: "Responsável" })}>
                Confirmar Rejeição
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AditivosCard({ aditivos, modoEdicao, onAprovarGestor, onAprovarSocio, onRejeitar, isPending }: {
  aditivos: any[]; modoEdicao: boolean;
  onAprovarGestor: (a: any) => void; onAprovarSocio: (a: any) => void; onRejeitar: (a: any) => void;
  isPending: boolean;
}) {
  const STATUS_AD: Record<string, { label: string; cls: string }> = {
    pendente: { label: "Aguardando aprovação", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    aprovado: { label: "Aprovado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    rejeitado: { label: "Rejeitado", cls: "bg-red-50 text-red-600 border-red-200" },
  };
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  // Rev. 4816 — data/hora no padrão brasileiro, fuso de Brasília
  const fmtDataHoraBR = (ts: any) => {
    if (!ts) return "";
    const d = ts instanceof Date ? ts : new Date(String(ts).includes("T") ? String(ts) : String(ts).replace(" ", "T") + (String(ts).endsWith("Z") ? "" : "Z"));
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às");
  };
  return (
    <div className="bg-white rounded-xl border border-purple-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-purple-50/60 border-b border-purple-100 flex items-center gap-2">
        <FilePlus className="w-4 h-4 text-purple-600" />
        <h4 className="text-xs font-semibold text-purple-800 uppercase tracking-wide">Aditivos do Contrato</h4>
        <span className="text-[10px] text-purple-500">({aditivos.length})</span>
      </div>
      <div className="divide-y divide-gray-50">
        {aditivos.map((a: any) => {
          const st = STATUS_AD[a.status] || STATUS_AD.pendente;
          return (
            <div key={a.id} className="px-4 py-3 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-900 text-sm">Aditivo #{a.numero}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.cls}`}>{st.label}</span>
                <span className="text-xs text-gray-400">{a.criadoEm ? fmtDate(String(a.criadoEm).slice(0, 10)) : ""}</span>
                <span className="ml-auto font-bold text-purple-700 text-sm">+ {BRL(a.valorTotal)}</span>
              </div>
              <div className="text-xs text-gray-600 break-words">
                {a.item?.eapCodigo && <span className="font-mono text-gray-400 mr-1">{a.item.eapCodigo}</span>}
                {a.item?.descricao || `Item #${a.contratoItemId}`} — <strong>{Number(a.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{a.item?.unidade ? ` ${a.item.unidade}` : ""}</strong> × {BRL(a.valorUnitario)}
              </div>
              <div className="text-[11px] text-gray-500 break-words"><strong>Justificativa:</strong> {a.justificativa}</div>
              {/* Rev. 4817 — fonte de verba do aditivo */}
              {(() => {
                const vTotal = Number(a.valorTotal || 0);
                const coberto = Number(a.valorCoberto || 0);
                if (a.status === "aprovado") {
                  if (coberto >= vTotal - 0.01 && coberto > 0) return <div className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 inline-block">Verba: coberto pela Realocação ({BRL(coberto)})</div>;
                  if (coberto > 0.01) return <div className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 inline-block">Verba: cobertura parcial — {BRL(coberto)} da Realocação · {BRL(vTotal - coberto)} sem cobertura (prejuízo consciente)</div>;
                  return <div className="text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1 inline-block">Sem fonte de verba — prejuízo consciente aprovado pelo sócio ({BRL(vTotal)})</div>;
                }
                if (a.status === "pendente") {
                  return <div className="text-[10px] text-gray-500">Fonte indicada: {a.fonteVerba === "verba_extra" ? "verba extra (sem realocação)" : "saldo de Realocação de Verba (registrado na aprovação do sócio)"}</div>;
                }
                return null;
              })()}
              {/* Rev. 4816 — trilha de auditoria: quem solicitou e quem aprovou, com data/hora de Brasília */}
              <div className="rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-1.5 space-y-0.5 text-[10px] text-gray-500">
                <div><span className="font-semibold text-gray-600">Solicitado por:</span> {a.criadoPor || "—"}{a.criadoEm ? ` · ${fmtDataHoraBR(a.criadoEm)}` : ""}</div>
                {a.nivelAprovacao >= 1 && (
                  <div className="text-emerald-700"><span className="font-semibold">Aprovado (Gestor da Obra):</span> {a.gestorAprovadoPor || "—"}{a.gestorAprovadoEm ? ` · ${fmtDataHoraBR(a.gestorAprovadoEm)}` : ""}</div>
                )}
                {a.nivelAprovacao >= 2 && (
                  <div className="text-emerald-700"><span className="font-semibold">Aprovado (Sócio Adm):</span> {a.socioAprovadoPor || "—"}{a.socioAprovadoEm ? ` · ${fmtDataHoraBR(a.socioAprovadoEm)}` : ""}</div>
                )}
                {a.status === "rejeitado" && (
                  <div className="text-red-600"><span className="font-semibold">Rejeitado por:</span> {a.rejeitadoPor || "—"}{a.rejeitadoEm ? ` · ${fmtDataHoraBR(a.rejeitadoEm)}` : ""}</div>
                )}
              </div>
              {a.status === "rejeitado" && a.motivoRejeicao && (
                <div className="text-[11px] text-red-600 break-words"><strong>Motivo da rejeição:</strong> {a.motivoRejeicao}</div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {a.fotoUrl && (
                  <button className="text-[11px] text-blue-600 hover:underline flex items-center gap-1" onClick={() => setFotoPreview(a.fotoUrl)}>
                    <Camera className="w-3 h-3" /> Ver foto
                  </button>
                )}
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span className={a.nivelAprovacao >= 1 ? "text-emerald-600 font-semibold" : ""}>Gestor {a.nivelAprovacao >= 1 ? `✓ ${a.gestorAprovadoPor || ""}` : "pendente"}</span>
                  <span>·</span>
                  <span className={a.nivelAprovacao >= 2 ? "text-emerald-600 font-semibold" : ""}>Sócio Adm {a.nivelAprovacao >= 2 ? `✓ ${a.socioAprovadoPor || ""}` : "pendente"}</span>
                </div>
                {modoEdicao && a.status === "pendente" && (
                  <div className="ml-auto flex gap-1.5">
                    {(a.nivelAprovacao ?? 0) < 1 ? (
                      <Button size="sm" className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700" disabled={isPending} onClick={() => onAprovarGestor(a)}>Aprovar (Gestor)</Button>
                    ) : (
                      <Button size="sm" className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700" disabled={isPending} onClick={() => onAprovarSocio(a)}>Aprovar (Sócio Adm)</Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-[11px] text-red-600 border-red-200 hover:bg-red-50" onClick={() => onRejeitar(a)}>Rejeitar</Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {fotoPreview && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setFotoPreview(null)}>
          <img src={fotoPreview} alt="Foto do aditivo" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

// Rev. 4802 — formulário de criação do aditivo: quantidade + preço (pré-preenchidos),
// justificativa e foto OBRIGATÓRIAS (poka-yoke: acréscimo fundamentado).
function AditivoDialog({ contrato, item, medicaoId, onClose, onCreated }: {
  contrato: any; item: any; medicaoId: number; onClose: () => void; onCreated: () => void;
}) {
  // Rev. 4815 — números no padrão BR (vírgula decimal, milhar com ponto)
  const fmtBR = (v: number, d = 2) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const [qtd, setQtd] = useState(fmtBR(Number(item.quantidadeExcedente || 0)));
  const [precoUnit, setPrecoUnit] = useState(fmtBR(Number(item.valorUnitario || 0)));
  const [justificativa, setJustificativa] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Parse BR-aware: remove pontos de milhar, vírgula vira decimal
  const parseNum = (s: string) => parseFloat(String(s).replace(/\./g, "").replace(",", ".")) || 0;
  const total = Math.round(parseNum(qtd) * parseNum(precoUnit) * 100) / 100;

  const criarMut = trpc.terceiroContratos.criarAditivo.useMutation({
    onSuccess: () => { toast.success("Aditivo criado! Enviado para aprovação (gestor + sócio adm)."); onCreated(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleFoto = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipo", "aditivo-terceiro");
      fd.append("companyId", String(contrato.companyId));
      const r = await fetch("/api/upload/sst-document", { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error((err as any)?.error ?? "Falha no upload"); }
      const { url } = await r.json();
      setFotoUrl(url);
      toast.success("Foto anexada!");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar foto.");
    } finally { setUploading(false); }
  };

  // Rev. 4817 — fonte de verba: saldo da Realocação (Compras) da obra
  const [fonteVerba, setFonteVerba] = useState<"realocacao" | "verba_extra">("realocacao");
  const { data: saldos } = trpc.compras.getSaldosRealocacaoGeral.useQuery(
    { companyId: contrato.companyId, obraId: contrato.obraId ?? undefined },
    { enabled: !!contrato?.companyId },
  );
  const saldoDisponivel = Number((saldos as any)?.sobrasDisponivelReal ?? 0);
  const totalEstimado = Math.round(parseNum(qtd) * parseNum(precoUnit) * 100) / 100;
  const cobertura: "total" | "parcial" | "nenhuma" = saldoDisponivel >= totalEstimado - 0.01 && saldoDisponivel > 0 ? "total" : saldoDisponivel > 0.01 ? "parcial" : "nenhuma";

  const podeEnviar = parseNum(qtd) > 0 && justificativa.trim().length >= 15 && !!fotoUrl && !criarMut.isPending;

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        {/* Rev. 4904 — layout v2 (a pedido do usuário): sem header gradiente.
            Passos numerados 1-2-3, item em card com barra roxa, estimativa ao
            lado dos inputs, alertas com ícone/cor e radio-cards de verba. */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-800"><FilePlus className="w-4 h-4" /> Gerar Aditivo de Contrato</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border-l-4 border-purple-400 bg-purple-50/60 p-3 break-words">
            <div className="text-xs text-gray-800 font-medium">
              {item.eapCodigo && <span className="font-mono text-[10px] text-purple-700 mr-1.5">{item.eapCodigo}</span>}
              {item.descricao}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
              <span className="text-gray-500">Contratado: <b className="text-gray-700 tabular-nums">{Number(item.quantidade || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{item.unidade ? ` ${item.unidade}` : ""}</b></span>
              <span className="text-amber-700">Excedente medido: <b className="tabular-nums">{Number(item.quantidadeExcedente || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{item.unidade ? ` ${item.unidade}` : ""}</b></span>
            </div>
          </div>

          {/* Passo 1 — quantidade e valor */}
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-gray-800 mb-2">
              <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">1</span>
              Quantidade e valor
            </p>
            <div className="grid grid-cols-2 gap-2 pl-7">
              <div>
                <Label className="text-xs text-gray-500">Quantidade{item.unidade ? ` (${item.unidade})` : ""}</Label>
                <Input inputMode="decimal" value={qtd} onChange={e => setQtd(e.target.value)}
                  onBlur={() => setQtd(fmtBR(parseNum(qtd)))} className="text-sm h-9 mt-1 tabular-nums" />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Preço unitário</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-gray-400 pointer-events-none">R$</span>
                  <Input inputMode="decimal" value={precoUnit} onChange={e => setPrecoUnit(e.target.value)}
                    onBlur={() => setPrecoUnit(fmtBR(parseNum(precoUnit)))} className="text-sm h-9 pl-9 tabular-nums" />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">Preço do contrato pré-preenchido</p>
              </div>
            </div>
            <div className="pl-7 mt-2 flex items-center justify-between rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
              <span className="text-[11px] text-gray-500">Estimativa do aditivo</span>
              <span className="font-bold text-purple-700 tabular-nums">R$ {fmtBR(total)}</span>
            </div>
          </div>

          {/* Passo 2 — justificativa + foto */}
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-gray-800 mb-2">
              <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">2</span>
              Justificativa e evidência
            </p>
            <div className="pl-7 space-y-2.5">
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-gray-500">Por que estourou? (obrigatória)</Label>
                  <span className={`text-[10px] tabular-nums ${justificativa.trim().length >= 15 ? "text-emerald-600" : "text-gray-400"}`}>
                    {justificativa.trim().length >= 15 ? <span className="inline-flex items-center gap-0.5"><Check className="w-3 h-3" /> ok</span> : `${justificativa.trim().length}/15`}
                  </span>
                </div>
                <Textarea rows={3} className="text-sm mt-1 resize-none" placeholder="Fundamente o motivo do acréscimo (mín. 15 caracteres)..."
                  value={justificativa} onChange={e => setJustificativa(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${fotoUrl ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-gray-300 bg-white text-gray-600 hover:border-purple-300 hover:text-purple-700"}`}>
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : fotoUrl ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
                  <span className="font-medium">{fotoUrl ? "Foto anexada — trocar" : "Foto do acréscimo (obrigatória)"}</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFoto(f); e.target.value = ""; }} />
                </label>
                {fotoUrl && <img src={fotoUrl} alt="Foto" className="h-10 w-10 object-cover rounded-lg border border-emerald-200" />}
              </div>
            </div>
          </div>

          {/* Passo 3 — fonte de verba (Rev. 4817: nunca bloqueia; o sócio decide vendo) */}
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-gray-800 mb-2">
              <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">3</span>
              De onde vem a verba?
            </p>
            <div className="pl-7 space-y-2">
              <div className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] leading-snug ${cobertura === "total" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : cobertura === "parcial" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-red-50 border-red-200 text-red-600"}`}>
                {saldos !== undefined && (cobertura === "total"
                  ? <CheckCircle2 className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />)}
                <span>
                  {saldos === undefined ? "Consultando saldo de realocação da obra..." :
                   cobertura === "total" ? <>Saldo de Realocação disponível: <strong>{BRL(saldoDisponivel)}</strong> — cobre este aditivo.</> :
                   cobertura === "parcial" ? <>Saldo de Realocação disponível: <strong>{BRL(saldoDisponivel)}</strong> — cobre só parte do aditivo ({BRL(total)}). O restante fica sem cobertura.</> :
                   <>Sem saldo de realocação disponível na obra. Se aprovado, o aditivo entra <strong>sem fonte de verba (prejuízo consciente)</strong>.</>}
                </span>
              </div>
              <label className={`flex items-start gap-2 text-[11px] cursor-pointer rounded-lg border p-2.5 transition-colors ${fonteVerba === "realocacao" ? "border-purple-400 bg-purple-50/60 ring-1 ring-purple-200" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                <input type="radio" name="fonteVerba" className="mt-0.5 accent-purple-600" checked={fonteVerba === "realocacao"} onChange={() => setFonteVerba("realocacao")} />
                <span className="text-gray-700"><strong>Consumir do saldo de Realocação de Verba</strong> — na aprovação do sócio, a realocação é registrada automaticamente no Compras (até onde o saldo alcançar).</span>
              </label>
              <label className={`flex items-start gap-2 text-[11px] cursor-pointer rounded-lg border p-2.5 transition-colors ${fonteVerba === "verba_extra" ? "border-purple-400 bg-purple-50/60 ring-1 ring-purple-200" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                <input type="radio" name="fonteVerba" className="mt-0.5 accent-purple-600" checked={fonteVerba === "verba_extra"} onChange={() => setFonteVerba("verba_extra")} />
                <span className="text-gray-700"><strong>Verba extra (sem realocação)</strong> — decisão consciente: o valor entra fora do pote de realocação e fica marcado nos relatórios.</span>
              </label>
            </div>
          </div>

          <div className="flex items-start gap-1.5 text-[11px] text-violet-700 border-t border-gray-100 pt-2.5">
            <ShieldCheck className="w-3.5 h-3.5 mt-px flex-shrink-0" />
            <span>Aprovação em 2 níveis: gestor da obra e <strong>sócio administrador (obrigatório)</strong>. Aprovado, a quantidade e o valor somam no contrato e o excedente libera para medição.</span>
          </div>
          {!podeEnviar && !criarMut.isPending && (
            <p className="text-[10px] text-gray-400 flex items-center gap-1"><Info className="w-3 h-3 flex-shrink-0" />
              Para enviar: {[parseNum(qtd) <= 0 && "quantidade", justificativa.trim().length < 15 && "justificativa (mín. 15)", !fotoUrl && "foto"].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" className="bg-purple-600 hover:bg-purple-700 gap-1.5" disabled={!podeEnviar}
            onClick={() => criarMut.mutate({
              companyId: contrato.companyId,
              contratoId: contrato.id,
              contratoItemId: item.contratoItemId,
              medicaoId,
              quantidade: parseNum(qtd),
              valorUnitario: parseNum(precoUnit),
              justificativa: justificativa.trim(),
              fotoUrl: fotoUrl!,
              fonteVerba,
            })}>
            {criarMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Enviar para aprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RetencaoTecnicaCard({ contrato, modoEdicao }: { contrato: any; modoEdicao: boolean }) {
  const utils = trpc.useUtils();
  const [confirmando, setConfirmando] = useState(false);
  const perc = Number(contrato.percRetencaoTecnica) || 0;
  const lib = contrato.retencaoLiberacao;
  const meds = contrato.medicoes || [];
  const fechadas = meds.filter((m: any) => m.status === "aprovada" || m.status === "paga");
  const abertas = meds.filter((m: any) => m.status === "rascunho" || m.status === "aguardando_aprovacao");
  const retAcumulada = Math.round(fechadas.reduce((s: number, m: any) => s + (Number(m.valorMedido) || 0) * perc / 100, 0) * 100) / 100;
  const debitoPendente = Number(contrato.fdPendenteTotal) || 0;
  const liberarMut = trpc.terceiroContratos.liberarRetencaoTecnica.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Retenção liberada: ${BRL(d.liquido)} a pagar${d.abatido > 0 ? ` (débitos abatidos: ${BRL(d.abatido)})` : ""}.`);
      setConfirmando(false);
      utils.terceiroContratos.getContrato.invalidate();
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao liberar retenção."),
  });
  if (perc <= 0 || fechadas.length === 0) return null;
  if (lib?.liberada) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-800 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        Retenção técnica ({perc}%) já liberada — título de {BRL(Number(lib.valor) || 0)} no Contas a Pagar.
      </div>
    );
  }
  if (!modoEdicao) return null;
  const liquidoPrevisto = Math.max(0, Math.round((retAcumulada - Math.min(debitoPendente, retAcumulada)) * 100) / 100);
  return (
    <div className="bg-white border border-purple-200 rounded-xl px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-semibold text-purple-800">Retenção técnica ({perc}%):</span>{" "}
          <span className="text-gray-700">{BRL(retAcumulada)} acumulada em {fechadas.length} medição(ões)</span>
          {debitoPendente > 0.01 && <span className="text-amber-700"> • débitos pendentes: {BRL(debitoPendente)}</span>}
        </div>
        <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50"
          disabled={abertas.length > 0 || liberarMut.isPending}
          onClick={() => setConfirmando(true)}>
          Liberar Retenção
        </Button>
      </div>
      {abertas.length > 0 && (
        <p className="text-xs text-gray-400">Finalize as medições em rascunho/aguardando aprovação para liberar a retenção.</p>
      )}
      {confirmando && (
        <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 text-sm space-y-2">
          <p className="text-gray-700">
            Liberar agora? Débitos pendentes ({BRL(Math.min(debitoPendente, retAcumulada))}) serão abatidos automaticamente
            e o líquido de <b>{BRL(liquidoPrevisto)}</b> vira título no Contas a Pagar.
            {debitoPendente > retAcumulada + 0.01 && (
              <span className="text-amber-700"> Atenção: sobra débito de {BRL(Math.round((debitoPendente - retAcumulada) * 100) / 100)} mesmo após o abate.</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700" disabled={liberarMut.isPending}
              onClick={() => liberarMut.mutate({ contratoId: contrato.id, companyId: contrato.companyId })}>
              {liberarMut.isPending ? "Liberando..." : "Confirmar liberação"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

const TIPO_DESCONTO: Record<string, { label: string; cls: string }> = {
  fd:          { label: "FD Compra",   cls: "bg-amber-100 text-amber-700 border-amber-200" },
  epi:         { label: "EPI",         cls: "bg-blue-100 text-blue-700 border-blue-200" },
  ferramental: { label: "Ferramental", cls: "bg-purple-100 text-purple-700 border-purple-200" },
  insumo:      { label: "Insumo",      cls: "bg-teal-100 text-teal-700 border-teal-200" },
  outro:       { label: "Outro",       cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

function FdMedicaoPanel({ medicao, contrato, fds, criarFdTerceiroMut, excluirFdTerceiroMut, readOnly }: any) {
  const [open, setOpen] = useState(false);
  const [pendenteAberto, setPendenteAberto] = useState(false);
  const [desc, setDesc] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState("");
  const [tipo, setTipo] = useState("outro");
  const [confirmarFd, setConfirmarFd] = useState<ConfirmState>(null);
  // Rev. 3082 (T007) — readOnly desliga o lançamento/exclusão de FD na aba-espelho.
  const travado = readOnly || medicao.status === "aprovada" || medicao.status === "paga";

  const onlyDigits = (s: string) => s.replace(/\D/g, "");
  const maskBRLInput = (s: string) => (parseInt(onlyDigits(s) || "0", 10) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const parseBRLInput = (s: string) => parseInt(onlyDigits(s) || "0", 10) / 100;

  const totalFd = (fds || []).reduce((s: number, f: any) => s + (Number(f.valor) || 0), 0);
  // Rev. 4859 — o líquido a pagar desconta TAMBÉM as retenções da medição
  // (técnica + ISS/INSS/IRRF/outras + descontos), igual ao título do Financeiro.
  const totalRetencoes = (Number(medicao.retencaoTecnica) || 0) + (Number(medicao.retencaoISS) || 0)
    + (Number(medicao.retencaoINSS) || 0) + (Number(medicao.retencaoIRRF) || 0)
    + (Number(medicao.outrasRetencoes) || 0) + (Number(medicao.descontos) || 0);
  const liquido = Math.max(0, (Number(medicao.valorMedido) || 0) - totalRetencoes - totalFd);

  // Rev. 4798 — débito de FD do contrato ainda não descontado em NENHUMA medição.
  // O sistema avisa sozinho e oferece puxar o desconto; a aprovação fica
  // bloqueada no servidor enquanto houver pendência.
  // Rev. 4801 — pendência vem do servidor (fonte única: inclui débitos avulsos de EPI/insumo).
  const fdPendente = Number(contrato.fdPendenteTotal ?? Math.max(0, (Number(contrato.fdMaterialTotal) || 0) - (Number(contrato.fdAbatidoTotal) || 0)));
  const utils = trpc.useUtils();
  const puxarFdMut = trpc.terceiroContratos.puxarFdPendente.useMutation({
    onSuccess: (r: any) => {
      toast.success(r?.criado ? `Débito de ${BRL(r.pendente)} descontado nesta medição.` : "Nenhum débito pendente.");
      utils.terceiroContratos.listarFdsTerceiro.invalidate();
      utils.terceiroContratos.getContrato.invalidate({ id: contrato.id });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const submit = () => {
    if (!desc.trim()) { toast.error("Informe a descrição do FD."); return; }
    if (parseBRLInput(valor) <= 0) { toast.error("Informe um valor de FD maior que zero."); return; }
    if (!data) { toast.error("Informe a data do FD."); return; }
    criarFdTerceiroMut.mutate(
      { companyId: contrato.companyId, contratoId: contrato.id, medicaoId: medicao.id, descricao: desc.trim(), valor: String(parseBRLInput(valor)), dataFd: data, tipo, criadoPor: "Responsável" },
      { onSuccess: () => { setDesc(""); setValor(""); setData(""); setTipo("outro"); setOpen(false); } },
    );
  };

  return (
    <div className="mt-3 ml-6 mr-1 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <ConfirmBox state={confirmarFd} onClose={() => setConfirmarFd(null)} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
          <Truck className="w-3.5 h-3.5" /> Descontos do Período <span className="text-amber-600 font-normal">(FD, EPI, ferramental... — desconta do valor a pagar)</span>
        </div>
        {!travado && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px] text-amber-700 border-amber-300 hover:bg-amber-100" onClick={() => setOpen(o => !o)}>
            <Plus className="w-3 h-3" /> Lançar Desconto
          </Button>
        )}
      </div>

      {/* Rev. 4800 — banner discreto: o desconto entra sozinho lá embaixo;
          detalhe só aparece se a pessoa quiser clicar. */}
      {fdPendente > 0.01 && (
        <div className="mt-2">
          <button type="button" className="text-[11px] text-amber-700 underline underline-offset-2 hover:text-amber-900"
            onClick={() => setPendenteAberto(o => !o)}>
            Débitos pendentes do contrato (FD, EPI, insumo...): {BRL(fdPendente)} — {pendenteAberto ? "ocultar" : "ver detalhes"}
          </button>
          {pendenteAberto && (
            <div className="mt-1.5 rounded-md border border-amber-200 bg-white p-2.5 text-xs text-gray-600">
              <p>FD de material do contrato ainda não descontado. O sistema desconta sozinho ao gerar/recalcular a medição; a aprovação fica <strong>bloqueada</strong> enquanto houver débito.</p>
              {!travado && (
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px] text-amber-700 border-amber-300 hover:bg-amber-100" disabled={puxarFdMut.isPending}
                    onClick={() => puxarFdMut.mutate({ companyId: contrato.companyId, contratoId: contrato.id, medicaoId: medicao.id })}>
                    {puxarFdMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />} Descontar nesta medição
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {open && !travado && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-end bg-white rounded-md border border-amber-200 p-2">
          <div>
            <Label className="text-[10px] text-gray-500">Tipo</Label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-8 text-xs border border-gray-200 rounded-md px-2 bg-white">
              {Object.entries(TIPO_DESCONTO).filter(([k]) => k !== "fd").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-[10px] text-gray-500">Descrição</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: EPI entregue ao colaborador, insumo do almox..." className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px] text-gray-500">Valor (R$)</Label>
            <Input value={valor} onChange={(e) => setValor(maskBRLInput(e.target.value))} inputMode="numeric" placeholder="0,00" className="h-8 text-xs w-28 text-right" />
          </div>
          <div>
            <Label className="text-[10px] text-gray-500">Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-8 text-xs w-36" />
          </div>
          <Button size="sm" className="h-8 gap-1 text-xs bg-amber-600 hover:bg-amber-700" disabled={criarFdTerceiroMut.isPending} onClick={submit}>
            <Save className="w-3 h-3" /> Salvar
          </Button>
        </div>
      )}

      {(fds || []).length > 0 ? (
        <div className="mt-2 space-y-1">
          {(fds || []).map((f: any) => (
            <div key={f.id} className="flex items-center justify-between gap-2 text-xs bg-white rounded-md border border-amber-100 px-2 py-1.5">
              <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-semibold border rounded-full px-1.5 py-0.5 flex-shrink-0 ${(TIPO_DESCONTO[f.tipo || "fd"] || TIPO_DESCONTO.outro).cls}`}>{(TIPO_DESCONTO[f.tipo || "fd"] || TIPO_DESCONTO.outro).label}</span>
                <span className="font-medium text-gray-800 truncate" title={f.descricao}>{f.descricao}</span>
                <span className="text-gray-400">{fmtDate(f.dataFd)}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-semibold text-amber-700">− {BRL(f.valor)}</span>
                {!travado && (
                  <button className="text-gray-300 hover:text-red-500" disabled={excluirFdTerceiroMut.isPending}
                    onClick={() => setConfirmarFd({ title: "Remover este desconto?", description: `${f.descricao || "Desconto"} — ${BRL(f.valor)}. Ele volta a ficar pendente se veio de débito avulso.`, actionLabel: "Remover", destructive: true, onConfirm: () => excluirFdTerceiroMut.mutate({ id: f.id, companyId: contrato.companyId }) })}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-amber-600/80">Nenhum desconto lançado neste período.</p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs border-t border-amber-200 pt-2">
        <span className="text-gray-500">Medido: <strong className="text-gray-800">{BRL(medicao.valorMedido)}</strong></span>
        {totalRetencoes > 0 && (
          <span className="text-rose-700" title="Retenção técnica + ISS/INSS/IRRF/outras + descontos da medição">Retenções: <strong>− {BRL(totalRetencoes)}</strong></span>
        )}
        <span className="text-amber-700">Total descontos: <strong>− {BRL(totalFd)}</strong></span>
        <span className="text-blue-700">Líquido a pagar: <strong>{BRL(liquido)}</strong></span>
      </div>
    </div>
  );
}
