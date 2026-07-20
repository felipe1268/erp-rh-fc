import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { nowBrasilia } from "@/lib/dateUtils";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import FullScreenDialog from "@/components/FullScreenDialog";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { formatCPF, formatMoeda, fmtNum, formatMoedaInput, parseMoedaBR } from "@/lib/formatters";
import { removeAccents } from "@/lib/searchUtils";
import {
  Briefcase, Plus, Search, DollarSign, AlertTriangle, FileText,
  Trash2, Eye, X, Clock, CheckCircle2, RefreshCw, Calendar, Pencil,
  Users, TrendingUp, FileSignature, Ban, Send, Printer, Upload, FolderOpen,
  ExternalLink, File, XCircle, Award, Loader2, Check, Settings2,
  ShieldCheck, Paperclip, FileMinus2, Sparkles, GitBranch, RotateCw,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PeriodSelectorCard, { MonthDotStatus } from "@/components/PeriodSelectorCard";
import FCSignPJSendDialog from "@/components/FCSignPJSendDialog";
import FCSignAvisoEncerramentoPJDialog from "@/components/FCSignAvisoEncerramentoPJDialog";
import { buildContratoPjSignHtml } from "@/lib/contratoPjDocument";
import { useDocumentMargins } from "@/hooks/useDocumentMargins";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function formatCNPJ(v: string | null | undefined) {
  if (!v) return "-";
  const n = v.replace(/\D/g, "");
  if (n.length !== 14) return v;
  return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/** Rev. 4462 — Retorna lista dos campos obrigatórios faltando para enviar à assinatura. */
function contratoFaltando(c: any): string[] {
  const f: string[] = [];
  if (!c.cnpjPrestador || c.cnpjPrestador.replace(/\D/g, "").length !== 14) f.push("CNPJ");
  if (!c.enderecoPrestador?.trim()) f.push("Endereço");
  const temBanco = !!(c.bancoPrestador?.trim() && c.contaPrestador?.trim());
  const temPix = !!c.pixPrestador?.trim();
  if (!temBanco && !temPix) f.push("Dados Bancários (banco+conta ou PIX)");
  return f;
}

/**
 * Rev. 3262 — Badge do cruzamento prestador × catálogo de Fornecedores.
 * verde = casou por CNPJ; ambar = sugestão por nome (a confirmar);
 * cinza = não cadastrado, com atalho para cadastrar já como prestador.
 */
function FornecedorCadastroBadge({ status, nome, cnpj }: { status?: string; nome?: string | null; cnpj?: string | null }) {
  if (status === "verde") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 text-[11px] font-medium px-2 py-0.5" title={nome ? `Cadastrado: ${nome}` : "Fornecedor cadastrado"}>
        <CheckCircle2 className="h-3 w-3" /> Cadastrado
      </span>
    );
  }
  if (status === "ambar") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-medium px-2 py-0.5" title={nome ? `Sugestão por nome (confirme): ${nome}` : "Sugestão por nome — confirme o cadastro"}>
        <AlertTriangle className="h-3 w-3" /> A confirmar
      </span>
    );
  }
  const cnpjDigits = (cnpj || "").replace(/\D/g, "");
  const href = `/compras/fornecedores${cnpjDigits.length === 14 ? `?novo=${cnpjDigits}` : "?novo=1"}`;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium px-2 py-0.5" title="Prestador sem cadastro no catálogo de Fornecedores">
        <XCircle className="h-3 w-3" /> Não cadastrado
      </span>
      <a href={href} className="text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap" title="Cadastrar este prestador no catálogo de Fornecedores">
        Cadastrar
      </a>
    </span>
  );
}

function getInitials(name: string): string {
  return (name || "?").split(" ").filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join("");
}
function getAvatarColor(name: string): string {
  const palette = ["bg-blue-500","bg-violet-500","bg-emerald-500","bg-orange-500","bg-rose-500","bg-cyan-600","bg-amber-500","bg-indigo-500","bg-teal-500","bg-pink-500"];
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

const STATUS_CONTRATO: Record<string, { label: string; color: string; bg: string }> = {
  pendente_assinatura: { label: "Pendente Assinatura", color: "text-amber-700", bg: "bg-amber-100" },
  ativo: { label: "Ativo", color: "text-green-700", bg: "bg-green-100" },
  suspenso: { label: "Suspenso", color: "text-orange-700", bg: "bg-orange-100" },
  encerrado: { label: "Encerrado", color: "text-gray-700", bg: "bg-gray-100" },
  cancelado: { label: "Cancelado", color: "text-red-700", bg: "bg-red-100" },
};

const STATUS_PAGAMENTO: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: "Pendente", color: "text-amber-700", bg: "bg-amber-100" },
  pago: { label: "Pago", color: "text-green-700", bg: "bg-green-100" },
  cancelado: { label: "Cancelado", color: "text-red-700", bg: "bg-red-100" },
};

export default function ModuloPJ() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const { user } = useAuth();
  const documentMargins = useDocumentMargins();
  const [, navigate] = useLocation();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const [tab, setTab] = useState("contratos");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ativo");
  const [showContratoDialog, setShowContratoDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedContrato, setSelectedContrato] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [editingContratoId, setEditingContratoId] = useState<number | null>(null);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [uploadingAssinado, setUploadingAssinado] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [detailTab, setDetailTab] = useState("info");
  const [novoDocNome, setNovoDocNome] = useState("");
  const [novoDocTipo, setNovoDocTipo] = useState("outro");
  const [motivoAlteracao, setMotivoAlteracao] = useState("");
  const [createdContratoId, setCreatedContratoId] = useState<number | null>(null);
  const [formOrigemTipo, setFormOrigemTipo] = useState<'revisao' | 'renovacao' | null>(null);
  const [formOrigemContrato, setFormOrigemContrato] = useState<any>(null);
  const [fcSignPJContratoId, setFcSignPJContratoId] = useState<number | null>(null);
  const [avisoEncerramentoContratoId, setAvisoEncerramentoContratoId] = useState<number | null>(null);
  const [showNovoDoc, setShowNovoDoc] = useState(false);
  const [uploadingTipo, setUploadingTipo] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState(0);
  const bulkProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objetoTextareaRef = useRef<HTMLTextAreaElement>(null);
  // IA — Gerar cláusula de Objeto do Contrato (Rev. 4425)
  const [objetoIAInput, setObjetoIAInput] = useState("");
  const [objetoIALoading, setObjetoIALoading] = useState(false);
  const [objetoIAProgress, setObjetoIAProgress] = useState(0);
  // Rev. 4454 — Lookup CNPJ via Receita Federal (BrasilAPI)
  const [cnpjLookupLoading, setCnpjLookupLoading] = useState(false);
  const [cnpjLookupSocios, setCnpjLookupSocios] = useState<Array<{ nome: string; qual: string }>>([]);

  // Mês referência para pagamentos — PeriodSelectorCard (padrão de ouro)
  const [pjAno, setPjAno] = useState(() => new Date().getFullYear());
  const [pjMes, setPjMes] = useState<number | null>(() => new Date().getMonth() + 1);
  const mesRef = pjMes != null ? `${pjAno}-${String(pjMes).padStart(2, "0")}` : undefined;
  // Fallback de mês para dialogs e PDF (usa mês corrente quando "Ano todo" está ativo)
  const mesRefFallback = mesRef ?? `${pjAno}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  // Queries
  // Sempre busca a lista completa do servidor — o filtro de status é aplicado
  // no client (useMemo `filtered`). Assim os contadores no topo refletem os
  // totais reais independente do filtro selecionado.
  const { data: contratos = [], refetch: refetchContratos } = trpc.pj.contratos.list.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId || companyIds?.length > 0 }
  );
  const { data: alertas } = trpc.pj.contratos.alertas.useQuery(
    { companyId },
    { enabled: !!companyId || companyIds?.length > 0 }
  );
  const { data: pagamentos = [], refetch: refetchPagamentos } = trpc.pj.pagamentos.list.useQuery(
    { companyId, mesReferencia: mesRef, ano: pjMes == null ? pjAno : undefined },
    { enabled: (!!companyId || companyIds?.length > 0) && tab === "pagamentos" }
  );
  const { data: rankingFornecedores = [] } = trpc.pj.pagamentos.rankingFornecedores.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: (!!companyId || companyIds?.length > 0) && tab === "pagamentos" && pjMes != null }
  );
  const { data: statusAnualData = [] } = trpc.pj.pagamentos.statusAnual.useQuery(
    { companyId, ano: pjAno },
    { enabled: (!!companyId || companyIds?.length > 0) && tab === "pagamentos" }
  );
  // Rev. 4373 — lê forma de pagamento padrão PJ das Configurações (seção Terceiros)
  const { data: criteriaData = [] } = trpc.criteria.getAll.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  // Rev. 4425 — dados completos do contrato (com empresa) e modelo para prévia
  const { data: contratoByIdData } = (trpc as any).pj.contratos.getById.useQuery(
    { id: selectedContrato?.id || 0 },
    { enabled: showDetailDialog && !!selectedContrato?.id }
  );
  const { data: modeloContratoData } = trpc.pj.modeloContrato.useQuery(
    { companyId: selectedContrato?.companyId || companyId },
    { enabled: showDetailDialog && !!(selectedContrato?.companyId || companyId) }
  );
  const defaultFormaPgto = (criteriaData as any[]).find(c => c.chave === "terceiros_pj_forma_pagamento")?.valor || "PIX";
  const { data: empList = [] } = trpc.employees.list.useQuery({ companyId, companyIds, excludeTerminated: true }, { enabled: !!companyId || companyIds?.length > 0 });
  // IDs com contrato vigente (ativo ou pendente_assinatura) — não podem receber novo contrato
  const empIdsComContratoVigente = useMemo(
    () => new Set(
      (contratos as any[])
        .filter(c => c.status === "ativo" || c.status === "pendente_assinatura")
        .map(c => c.employeeId)
    ),
    [contratos]
  );
  const pjEmployees = useMemo(
    () => (empList as any[]).filter((e: any) =>
      e.tipoContrato === "PJ" &&
      !["Desligado", "Lista_Negra", "Inativo"].includes(e.status) &&
      !e.deletedAt
    ),
    [empList]
  );
  // Lista disponível para novo contrato: só quem não tem contrato ativo ou pendente
  const pjEmployeesSemContrato = useMemo(
    () => pjEmployees.filter((e: any) => !empIdsComContratoVigente.has(e.id)),
    [pjEmployees, empIdsComContratoVigente]
  );
  // Rev. 4371: dots coloridos do PeriodSelectorCard por status do mês
  const monthStatus = useMemo((): Record<number, MonthDotStatus> => {
    const m: Record<number, MonthDotStatus> = {};
    for (const s of statusAnualData as any[]) m[s.mes] = s.status as MonthDotStatus;
    return m;
  }, [statusAnualData]);

  // Mutations
  const createContrato = trpc.pj.contratos.create.useMutation({
    onSuccess: (data: any) => { refetchContratos(); toast.success(`Contrato ${data.numeroContrato} criado!`); setCreatedContratoId(data.id); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateContrato = trpc.pj.contratos.update.useMutation({
    onSuccess: (data: any) => { refetchContratos(); toast.success(`Contrato atualizado! (Rev. ${data.revisao || '—'})`); setShowContratoDialog(false); setEditingContratoId(null); setForm({}); setMotivoAlteracao(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const gerarClausulaObjetoMut = trpc.pj.contratos.gerarClausulaObjetoIA.useMutation({
    onSuccess: (data) => { setForm((f: any) => ({ ...f, objetoContrato: data.clausula })); toast.success("Cláusula gerada com sucesso!"); },
    onError: (e: any) => toast.error(e.message || "Erro ao gerar cláusula"),
  });
  // Rev. 4454 — Consulta CNPJ na Receita Federal via BrasilAPI e preenche campos
  const handleCnpjLookup = async (rawCnpj: string) => {
    const digits = (rawCnpj || "").replace(/\D/g, "");
    if (digits.length !== 14) return;
    setCnpjLookupLoading(true);
    setCnpjLookupSocios([]);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!res.ok) throw new Error("CNPJ não encontrado na Receita Federal");
      const data = await res.json();
      const partes = [data.logradouro, data.numero, data.complemento, data.bairro].filter(Boolean);
      const endereco = partes.join(", ");
      const cepFmt = (data.cep || "").replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2");
      setForm((f: any) => ({
        ...f,
        razaoSocialPrestador: data.razao_social || f.razaoSocialPrestador || "",
        enderecoPrestador: endereco || f.enderecoPrestador || "",
        cidadePrestador: data.municipio || f.cidadePrestador || "",
        estadoPrestador: data.uf || f.estadoPrestador || "",
        cepPrestador: cepFmt || f.cepPrestador || "",
      }));
      const socios = (data.qsa || []).map((s: any) => ({
        nome: s.nome_socio || s.nome || "",
        qual: s.qualificacao_socio || s.qualificacao || "",
      })).filter((s: any) => s.nome);
      setCnpjLookupSocios(socios);
      toast.success("Dados da empresa preenchidos pela Receita Federal!");
    } catch (e: any) {
      toast.error(e.message || "Não foi possível consultar o CNPJ");
    } finally {
      setCnpjLookupLoading(false);
    }
  };

  const handleGerarClausulaPJ = () => {
    if (!objetoIAInput.trim()) return;
    setObjetoIAProgress(0);
    setObjetoIALoading(true);
    const iv = setInterval(() => setObjetoIAProgress(p => Math.min(p + Math.floor(Math.random() * 12 + 5), 88)), 700);
    gerarClausulaObjetoMut.mutateAsync({ companyId, descricao: objetoIAInput.trim() })
      .finally(() => {
        clearInterval(iv);
        setObjetoIAProgress(100);
        setTimeout(() => { setObjetoIALoading(false); setObjetoIAProgress(0); }, 700);
      });
  };
  const insertTag = (tag: string) => {
    const el = objetoTextareaRef.current;
    if (!el) { setForm(f => ({ ...f, objetoContrato: (f.objetoContrato || "") + tag })); return; }
    const start = el.selectionStart ?? (form.objetoContrato || "").length;
    const end   = el.selectionEnd   ?? start;
    const prev  = form.objetoContrato || "";
    const next  = prev.slice(0, start) + tag + prev.slice(end);
    setForm(f => ({ ...f, objetoContrato: next }));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length); });
  };

  const deleteContrato = trpc.pj.contratos.delete.useMutation({
    onSuccess: () => { refetchContratos(); toast.success("Contrato excluído!"); },
  });
  const cancelarContrato = trpc.pj.contratos.cancelar.useMutation({
    onSuccess: () => { refetchContratos(); toast.success("Contrato cancelado. O prestador pode receber um novo contrato."); },
    onError: (e: any) => toast.error(e.message),
  });
  const criarRevisaoMutation = (trpc as any).pj.contratos.criarRevisao.useMutation({
    onSuccess: (data: any) => { refetchContratos(); setCreatedContratoId(data.id); toast.success(`Revisão Rev. ${data.revisao} criada! Contrato ${data.numeroContrato} aguardando assinatura.`); },
    onError: (e: any) => toast.error(e.message),
  });
  const renovarMutation = (trpc as any).pj.contratos.renovar.useMutation({
    onSuccess: (data: any) => { refetchContratos(); setCreatedContratoId(data.id); toast.success(`Renovação criada! Contrato ${data.numeroContrato} aguardando assinatura.`); },
    onError: (e: any) => toast.error(e.message),
  });
  const gerarMensal = trpc.pj.pagamentos.gerarMensal.useMutation({
    onSuccess: (data: any) => {
      refetchPagamentos();
      const novas = data?.medicoesCriadas || 0;
      if (novas > 0) {
        toast.success(`${novas} medição(ões) criada(s) em ${data.contratosProcessados} contrato(s).`);
      } else {
        toast.success(`Tudo em dia: ${data?.totalContratos || 0} contrato(s) ativos já tinham todas as previsões.`);
      }
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao sincronizar previsões."),
  });
  const deletePagamento = trpc.pj.pagamentos.delete.useMutation({
    onSuccess: () => { refetchPagamentos(); toast.success("Lançamento excluído!"); },
  });

  // Rev. 4375 — operações em lote
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Rev. 4376 — ajuste de percentuais em lote (todos os contratos ativos)
  const [showAjusteDialog, setShowAjusteDialog] = useState(false);
  const [ajusteForm, setAjusteForm] = useState<{ percAdiant?: number; diaAdiant?: number; diaFech?: number }>({});
  const [ajusteConfirming, setAjusteConfirming] = useState(false);
  const [folhaMedicaoTab, setFolhaMedicaoTab] = useState<"1" | "2">("1");
  // Rev. 4377 — Aprovação de medições com NF + envio para Contas a Pagar
  const [showAprovarDialog, setShowAprovarDialog] = useState(false);
  const [aprovarTarget, setAprovarTarget] = useState<any>(null);
  const [aprovarNfFile, setAprovarNfFile] = useState<File | null>(null);
  const [aprovarEnviarFin, setAprovarEnviarFin] = useState(true);
  const [aprovarDragging, setAprovarDragging] = useState(false);
  // Rev. 4376 — descrição por medição (persistida em localStorage por empresa+mês)
  const obsKey = `pj_obs_${companyId}_${mesRef}`;
  const [obs1a, setObs1a] = useState(() => {
    try { return localStorage.getItem(`${obsKey}_1`) || ""; } catch { return ""; }
  });
  const [obs2a, setObs2a] = useState(() => {
    try { return localStorage.getItem(`${obsKey}_2`) || ""; } catch { return ""; }
  });
  useEffect(() => { try { localStorage.setItem(`${obsKey}_1`, obs1a); } catch {} }, [obs1a, obsKey]);
  useEffect(() => { try { localStorage.setItem(`${obsKey}_2`, obs2a); } catch {} }, [obs2a, obsKey]);
  const bulkUpdatePercentuais = trpc.pj.contratos.bulkUpdatePercentuais.useMutation({
    onSuccess: (d: any) => {
      refetchContratos();
      setShowAjusteDialog(false);
      toast.success(`${d.updated} contrato(s) atualizado(s).`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkDelete = trpc.pj.pagamentos.bulkDelete.useMutation({
    onSuccess: (d: any) => { refetchPagamentos(); setSelectedIds(new Set()); toast.success(`${d.deleted} lançamento(s) excluído(s).`); },
    onError: (e: any) => toast.error(e.message),
  });
  const bulkAprovar = (trpc as any).pj.pagamentos.bulkAprovar.useMutation({
    onMutate: () => {
      setBulkProgress(0);
      let pct = 0;
      bulkProgressRef.current = setInterval(() => {
        pct = Math.min(pct + 3, 90);
        setBulkProgress(pct);
      }, 200);
    },
    onSuccess: (d: any) => {
      if (bulkProgressRef.current) clearInterval(bulkProgressRef.current);
      setBulkProgress(100);
      setTimeout(() => setBulkProgress(0), 800);
      refetchPagamentos();
      setSelectedIds(new Set());
      if (d.errors?.length) toast.error(`${d.approved} aprovado(s), ${d.errors.length} erro(s).`);
      else toast.success(`${d.approved} medição(ões) aprovada(s) e enviada(s) para Contas a Pagar!`);
    },
    onError: (e: any) => {
      if (bulkProgressRef.current) clearInterval(bulkProgressRef.current);
      setBulkProgress(0);
      toast.error(e.message);
    },
  });
  const cancelarAprovacao = (trpc as any).pj.pagamentos.cancelarAprovacao.useMutation({
    onSuccess: () => { refetchPagamentos(); toast.success("Aprovação cancelada e removida do Contas a Pagar."); },
    onError: (e: any) => toast.error(e.message),
  });
  const aprovarComNF = (trpc as any).pj.pagamentos.aprovarComNF.useMutation({
    onSuccess: (d: any) => {
      refetchPagamentos();
      setShowAprovarDialog(false);
      setAprovarTarget(null);
      setAprovarNfFile(null);
      toast.success(d.nfUrl
        ? "Medição aprovada com NF e enviada para o financeiro!"
        : aprovarEnviarFin ? "Medição aprovada e enviada para o financeiro!" : "Medição aprovada!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const uploadContratoAssinado = trpc.pj.contratos.uploadContrato.useMutation({
    onSuccess: (data: any) => {
      refetchContratos();
      if (selectedContrato) setSelectedContrato((prev: any) => ({ ...prev, contratoAssinadoUrl: data.url }));
      toast.success("Contrato assinado enviado com sucesso!");
      setUploadingAssinado(false);
    },
    onError: (e: any) => { toast.error(e.message); setUploadingAssinado(false); },
  });

  const { data: pjDocs = [], refetch: refetchDocs } = trpc.pj.documentos.list.useQuery(
    { employeeId: selectedContrato?.employeeId || 0, companyId },
    { enabled: showDetailDialog && !!selectedContrato?.employeeId && companyId > 0 }
  );

  const uploadDocPJ = trpc.pj.documentos.upload.useMutation({
    onSuccess: () => { refetchDocs(); toast.success("Documento enviado!"); setUploadingDoc(false); setUploadingTipo(null); setNovoDocNome(""); setNovoDocTipo("outro"); setShowNovoDoc(false); },
    onError: (e: any) => { toast.error(e.message); setUploadingDoc(false); setUploadingTipo(null); },
  });

  const deleteDocPJ = trpc.pj.documentos.delete.useMutation({
    onSuccess: () => { refetchDocs(); toast.success("Documento removido!"); },
  });

  // Auto-fill: último contrato do prestador selecionado (CNPJ, Razão Social, dados bancários)
  const { data: lastContratoData } = trpc.pj.contratos.getLastByEmployee.useQuery(
    { employeeId: form.employeeId || 0, companyId },
    { enabled: !!form.employeeId && !editingContratoId && companyId > 0 }
  );
  // Rev. 4428 — Auto-fill: perfil do prestador em RH (dados bancários + salário base)
  const { data: prestadorEmpData } = trpc.employees.getById.useQuery(
    { id: form.employeeId || 0, companyId },
    { enabled: !!form.employeeId && !editingContratoId && companyId > 0 }
  );
  // Mescla as duas fontes: perfil RH tem prioridade nos dados bancários (mais atualizado);
  // último contrato tem prioridade em CNPJ/Razão Social (não ficam no perfil RH).
  useEffect(() => {
    if (!editingContratoId && form.employeeId && (lastContratoData !== undefined || prestadorEmpData !== undefined)) {
      const emp = prestadorEmpData as any;
      setForm((prev: any) => ({
        ...prev,
        // CNPJ/Razão Social: vêm do último contrato (não existem no perfil CLT/PJ)
        cnpjPrestador: prev.cnpjPrestador || (lastContratoData as any)?.cnpjPrestador || "",
        razaoSocialPrestador: prev.razaoSocialPrestador || (lastContratoData as any)?.razaoSocialPrestador || "",
        objetoContrato: prev.objetoContrato || (lastContratoData as any)?.objetoContrato || "",
        // Dados bancários: perfil RH primeiro, depois último contrato como fallback
        bancoPrestador: prev.bancoPrestador || emp?.bancoNome || emp?.banco || (lastContratoData as any)?.bancoPrestador || "",
        agenciaPrestador: prev.agenciaPrestador || emp?.agencia || (lastContratoData as any)?.agenciaPrestador || "",
        contaPrestador: prev.contaPrestador || emp?.conta || (lastContratoData as any)?.contaPrestador || "",
        pixPrestador: prev.pixPrestador || emp?.chavePix || (lastContratoData as any)?.pixPrestador || "",
        formaPagamento: prev.formaPagamento || (lastContratoData as any)?.formaPagamento || "",
        // Valor mensal: salário base do perfil RH primeiro, depois último contrato.
        // parseMoedaBR converte "2.600" (BR) → 2600 antes de stringify, evitando
        // que parseFloat("2.600") leia 2.6 na exibição do campo.
        valorMensal: prev.valorMensal || (emp?.salarioBase ? String(parseMoedaBR(String(emp.salarioBase)) || "") : "") || (lastContratoData as any)?.valorMensal || "",
      }));
    }
  }, [lastContratoData, prestadorEmpData]);

  // Revisões ISO do contrato em detalhe
  const { data: revisoes = [] } = trpc.pj.contratos.revisoes.useQuery(
    { contractId: selectedContrato?.id || 0 },
    { enabled: showDetailDialog && !!selectedContrato?.id && detailTab === "revisoes" }
  );

  // Relatório PJ para exportação PDF (só mês específico, não "Ano todo")
  const { data: relatorio } = trpc.pj.relatorioPJ.useQuery(
    { companyId, mesReferencia: mesRefFallback },
    { enabled: (!!companyId || companyIds?.length > 0) && tab === "pagamentos" && pjMes != null }
  );

  function handlePreviewContrato() {
    if (!contratoByIdData) { toast.error("Aguarde os dados do contrato carregarem."); return; }
    const modeloHtml = (modeloContratoData as any)?.modeloHtml || null;
    const html = buildContratoPjSignHtml({
      contrato: contratoByIdData,
      modelo: "",
      modeloHtml,
      contratanteNome: "FELIPE COSTA ALVES",
      geradoPor: user?.name || user?.username || "Sistema",
      margins: documentMargins,
    });
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 800);
    }
  }

  function exportarPDF() {
    if (!relatorio || !relatorio.prestadores.length) {
      toast.error("Nenhum dado para exportar neste mês.");
      return;
    }
    const mesLabel = mesRef.split("-").reverse().join("/");
    const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
    const fmtCPF = (v: string) => v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    
    let html = `<html><head><meta charset="utf-8"><title>Relatório PJ - ${mesLabel}</title>
    <style>
      @media print { body { margin: 0; } }
      body { font-family: Arial, sans-serif; font-size: 11px; color: #333; padding: 20px; }
      h1 { font-size: 18px; color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; }
      h2 { font-size: 14px; color: #1e3a5f; margin-top: 20px; }
      .header-info { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 10px; color: #666; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th { background: #1e3a5f; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
      td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 10px; }
      tr:nth-child(even) { background: #f8f9fa; }
      .total-row { font-weight: bold; background: #e8f0fe !important; }
      .prestador-header { background: #f0f4ff; padding: 8px; margin-top: 12px; border-left: 3px solid #1e3a5f; }
      .resumo-box { display: inline-block; background: #f0f4ff; padding: 8px 16px; margin: 4px; border-radius: 4px; text-align: center; }
      .resumo-valor { font-size: 16px; font-weight: bold; color: #1e3a5f; }
      .resumo-label { font-size: 9px; color: #666; }
      .page-break { page-break-before: always; }
    </style></head><body>`;
    
    html += `<h1>Relatório Consolidado PJ — ${mesLabel}</h1>`;
    html += `<div class="header-info"><span>Gerado em: ${nowBrasilia()}</span><span>${relatorio.totais.qtdPrestadores} prestador(es) • ${relatorio.totais.qtdLancamentos} lançamento(s)</span></div>`;
    
    // Resumo geral
    html += `<div style="text-align:center;margin:16px 0;">`;
    html += `<div class="resumo-box"><div class="resumo-label">1ª Medição (40%)</div><div class="resumo-valor">${fmt(relatorio.totais.adiantamento)}</div></div>`;
    html += `<div class="resumo-box"><div class="resumo-label">2ª Medição (60%)</div><div class="resumo-valor">${fmt(relatorio.totais.fechamento)}</div></div>`;
    if (relatorio.totais.bonificacao > 0) html += `<div class="resumo-box"><div class="resumo-label">Bonificações</div><div class="resumo-valor">${fmt(relatorio.totais.bonificacao)}</div></div>`;
    html += `<div class="resumo-box" style="background:#1e3a5f;"><div class="resumo-label" style="color:#aaa;">TOTAL GERAL</div><div class="resumo-valor" style="color:white;font-size:20px;">${fmt(relatorio.totais.geral)}</div></div>`;
    html += `</div>`;
    
    // Detalhamento por prestador
    for (const p of relatorio.prestadores) {
      html += `<div class="prestador-header"><strong>${p.nome}</strong> — ${p.razaoSocial} • CNPJ: ${p.cnpj} • CPF: ${fmtCPF(p.cpf)} • Valor Mensal: ${fmt(parseFloat(p.valorMensal || "0"))}</div>`;
      html += `<table><thead><tr><th>Tipo</th><th>Descrição</th><th>Valor</th><th>Status</th><th>Dt. Pagamento</th></tr></thead><tbody>`;
      for (const pg of p.pagamentos) {
        const tipoLabel = pg.tipo === "adiantamento" ? "1ª Medição" : pg.tipo === "fechamento" ? "2ª Medição" : "Bonificação";
        const statusLabel = pg.status === "pago" ? "✓ Pago" : pg.status === "pendente" ? "○ Pendente" : pg.status;
        html += `<tr><td>${tipoLabel}</td><td>${pg.descricao || "-"}</td><td style="text-align:right">${fmt(parseFloat(pg.valor || "0"))}</td><td>${statusLabel}</td><td>${pg.dataPagamento ? new Date(pg.dataPagamento + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</td></tr>`;
      }
      html += `<tr class="total-row"><td colspan="2">SUBTOTAL</td><td style="text-align:right">${fmt(p.totalGeral)}</td><td colspan="2"></td></tr>`;
      html += `</tbody></table>`;
    }
    
    html += `<div style="margin-top:30px;padding-top:10px;border-top:1px solid #ccc;font-size:8px;color:#888;text-align:center;line-height:1.6">`;
    html += `<p><strong>Documento gerado por:</strong> ${user?.name || user?.username || 'Usuário não identificado'} | <strong>Data/Hora:</strong> ${nowBrasilia()} | <strong>Sistema:</strong> FC Gestão Integrada</p>`;
    html += `<p style="font-size:7px;color:#aaa;margin-top:4px">Este documento contém dados pessoais protegidos pela Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD). É proibida a reprodução, distribuição ou compartilhamento sem autorização.</p>`;
    html += `</div></body></html>`;
    
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    }
  }

  // Employee search
  const [empSearch, setEmpSearch] = useState("");
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const selectedEmp = pjEmployees.find((e: any) => e.id === form.employeeId);
  const filteredEmps = pjEmployeesSemContrato.filter((e: any) => {
    if (!empSearch) return true;
    const s = removeAccents(empSearch);
    const codigo = (e.codigoInterno || "").toLowerCase();
    return (e.nomeCompleto || "").toLowerCase().includes(s) || (e.cpf || "").replace(/\D/g, "").includes(s.replace(/\D/g, "")) || codigo.includes(s);
  });

  // Filtered contratos (busca textual + filtro de status — ambos client-side)
  const filtered = useMemo(() => {
    return (contratos as any[]).filter((c: any) => {
      if (statusFilter !== "todos" && c.status !== statusFilter) return false;
      if (search) {
        const s = removeAccents(search);
        if (!(c.employeeName || "").toLowerCase().includes(s) && !(c.cnpjPrestador || "").includes(s) && !(c.numeroContrato || "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [contratos, search, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    const list = contratos as any[];
    const ativos = list.filter(c => c.status === "ativo");
    const totalValor = ativos.reduce((s, c) => s + parseFloat(c.valorMensal || "0"), 0);
    return {
      total: list.length,
      ativos: ativos.length,
      pendentes: list.filter(c => c.status === "pendente_assinatura").length,
      encerrados: list.filter(c => c.status === "encerrado").length,
      cancelados: list.filter(c => c.status === "cancelado").length,
      totalMensal: totalValor,
      semAssinatura: ativos.filter(c => !c.contratoAssinadoUrl && !(c as any).fcSignDocumentUrl).length,
    };
  }, [contratos]);

  const _buildFormFromContrato = (c: any) => ({
    employeeId: c.employeeId,
    cnpjPrestador: c.cnpjPrestador || "",
    razaoSocialPrestador: c.razaoSocialPrestador || "",
    objetoContrato: c.objetoContrato || "",
    dataInicio: c.dataInicio?.slice(0, 10) || "",
    dataFim: c.dataFim?.slice(0, 10) || "",
    valorMensal: c.valorMensal || "",
    percentualAdiantamento: c.percentualAdiantamento ?? 50,
    percentualFechamento: c.percentualFechamento ?? 50,
    diaAdiantamento: c.diaAdiantamento ?? 15,
    diaFechamento: c.diaFechamento ?? 5,
    formaPagamento: c.formaPagamento || "",
    observacoes: c.observacoes || "",
    bancoPrestador: c.bancoPrestador || "",
    agenciaPrestador: c.agenciaPrestador || "",
    contaPrestador: c.contaPrestador || "",
    pixPrestador: c.pixPrestador || "",
    enderecoPrestador: c.enderecoPrestador || "",
    cidadePrestador: c.cidadePrestador || "",
    estadoPrestador: c.estadoPrestador || "",
    cepPrestador: c.cepPrestador || "",
    sociosPrestador: c.sociosPrestador || "",
  });

  const openCriarRevisao = (c: any) => {
    setFormOrigemTipo('revisao');
    setFormOrigemContrato(c);
    setEditingContratoId(null);
    setCreatedContratoId(null);
    setCnpjLookupSocios([]);
    setMotivoAlteracao(`Substituição do contrato ${c.numeroContrato} (cancelado)`);
    setForm(_buildFormFromContrato(c));
    setShowContratoDialog(true);
  };

  const openRenovar = (c: any) => {
    const oldStart = new Date((c.dataInicio || "").slice(0, 10) + "T00:00:00");
    const oldEnd   = new Date((c.dataFim   || "").slice(0, 10) + "T00:00:00");
    const duration = oldEnd.getTime() - oldStart.getTime();
    const newStart = new Date(oldEnd.getTime() + 86400000);
    const newEnd   = new Date(newStart.getTime() + duration);
    const toISO    = (d: Date) => d.toISOString().slice(0, 10);
    setFormOrigemTipo('renovacao');
    setFormOrigemContrato(c);
    setEditingContratoId(null);
    setCreatedContratoId(null);
    setCnpjLookupSocios([]);
    setMotivoAlteracao(`Renovação do contrato ${c.numeroContrato}`);
    setForm({ ..._buildFormFromContrato(c), dataInicio: toISO(newStart), dataFim: toISO(newEnd) });
    setShowContratoDialog(true);
  };

  const openEditContrato = (c: any) => {
    setEditingContratoId(c.id);
    setMotivoAlteracao("");
    setCreatedContratoId(null);
    setCnpjLookupSocios([]);
    setForm({
      employeeId: c.employeeId,
      cnpjPrestador: c.cnpjPrestador || "",
      razaoSocialPrestador: c.razaoSocialPrestador || "",
      objetoContrato: c.objetoContrato || "",
      dataInicio: c.dataInicio?.slice(0, 10) || "",
      dataFim: c.dataFim?.slice(0, 10) || "",
      renovacaoAutomatica: c.renovacaoAutomatica || 0,
      valorMensal: c.valorMensal || "",
      percentualAdiantamento: c.percentualAdiantamento ?? 50,
      percentualFechamento: c.percentualFechamento ?? 50,
      diaAdiantamento: c.diaAdiantamento || 15,
      diaFechamento: c.diaFechamento || 5,
      formaPagamento: c.formaPagamento || "",
      observacoes: c.observacoes || "",
      bancoPrestador: c.bancoPrestador || "",
      agenciaPrestador: c.agenciaPrestador || "",
      contaPrestador: c.contaPrestador || "",
      pixPrestador: c.pixPrestador || "",
      // Rev. 4454 — endereço e sócios
      enderecoPrestador: c.enderecoPrestador || "",
      cidadePrestador: c.cidadePrestador || "",
      estadoPrestador: c.estadoPrestador || "",
      cepPrestador: c.cepPrestador || "",
    });
    setShowContratoDialog(true);
  };

  const _formPayload = () => ({
    cnpjPrestador: form.cnpjPrestador,
    razaoSocialPrestador: form.razaoSocialPrestador,
    objetoContrato: form.objetoContrato,
    dataInicio: form.dataInicio,
    dataFim: form.dataFim,
    valorMensal: form.valorMensal,
    percentualAdiantamento: form.percentualAdiantamento ?? 50,
    percentualFechamento: form.percentualFechamento ?? 50,
    diaAdiantamento: form.diaAdiantamento ?? 15,
    diaFechamento: form.diaFechamento ?? 5,
    formaPagamento: form.formaPagamento || undefined,
    observacoes: form.observacoes,
    bancoPrestador: form.bancoPrestador || undefined,
    agenciaPrestador: form.agenciaPrestador || undefined,
    contaPrestador: form.contaPrestador || undefined,
    pixPrestador: form.pixPrestador || undefined,
    enderecoPrestador: form.enderecoPrestador || undefined,
    cidadePrestador: form.cidadePrestador || undefined,
    estadoPrestador: form.estadoPrestador || undefined,
    cepPrestador: form.cepPrestador || undefined,
    sociosPrestador: cnpjLookupSocios.length > 0 ? JSON.stringify(cnpjLookupSocios) : (form.sociosPrestador || undefined),
  });

  const handleSubmitContrato = () => {
    if (!form.dataInicio || !form.dataFim || !form.valorMensal) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    if (formOrigemTipo === 'revisao' && formOrigemContrato) {
      criarRevisaoMutation.mutate({
        parentId: formOrigemContrato.id,
        companyId, companyIds,
        ..._formPayload(),
        motivoRevisao: motivoAlteracao || undefined,
      });
      return;
    }
    if (formOrigemTipo === 'renovacao' && formOrigemContrato) {
      renovarMutation.mutate({
        parentId: formOrigemContrato.id,
        companyId, companyIds,
        ..._formPayload(),
      });
      return;
    }
    if (editingContratoId) {
      updateContrato.mutate({
        id: editingContratoId,
        cnpjPrestador: form.cnpjPrestador,
        razaoSocialPrestador: form.razaoSocialPrestador,
        objetoContrato: form.objetoContrato,
        dataInicio: form.dataInicio,
        dataFim: form.dataFim,
        renovacaoAutomatica: form.renovacaoAutomatica || 0,
        valorMensal: form.valorMensal,
        percentualAdiantamento: form.percentualAdiantamento ?? 50,
        percentualFechamento: form.percentualFechamento ?? 50,
        diaAdiantamento: form.diaAdiantamento ?? 15,
        diaFechamento: form.diaFechamento ?? 5,
        observacoes: form.observacoes,
        motivoAlteracao: motivoAlteracao || undefined,
        bancoPrestador: form.bancoPrestador || undefined,
        agenciaPrestador: form.agenciaPrestador || undefined,
        contaPrestador: form.contaPrestador || undefined,
        pixPrestador: form.pixPrestador || undefined,
        formaPagamento: form.formaPagamento || undefined,
        // Rev. 4454
        enderecoPrestador: form.enderecoPrestador || undefined,
        cidadePrestador: form.cidadePrestador || undefined,
        estadoPrestador: form.estadoPrestador || undefined,
        cepPrestador: form.cepPrestador || undefined,
        sociosPrestador: cnpjLookupSocios.length > 0 ? JSON.stringify(cnpjLookupSocios) : (form.sociosPrestador || undefined),
      });
    } else {
      if (!form.employeeId) { toast.error("Selecione o prestador"); return; }
      createContrato.mutate({ companyId, companyIds, employeeId: form.employeeId,
        cnpjPrestador: form.cnpjPrestador,
        razaoSocialPrestador: form.razaoSocialPrestador,
        objetoContrato: form.objetoContrato,
        dataInicio: form.dataInicio,
        dataFim: form.dataFim,
        renovacaoAutomatica: form.renovacaoAutomatica || 0,
        valorMensal: form.valorMensal,
        percentualAdiantamento: form.percentualAdiantamento ?? 50,
        percentualFechamento: form.percentualFechamento ?? 50,
        diaAdiantamento: form.diaAdiantamento ?? 15,
        diaFechamento: form.diaFechamento ?? 5,
        observacoes: form.observacoes,
        bancoPrestador: form.bancoPrestador || undefined,
        agenciaPrestador: form.agenciaPrestador || undefined,
        contaPrestador: form.contaPrestador || undefined,
        pixPrestador: form.pixPrestador || undefined,
        formaPagamento: form.formaPagamento || undefined,
        // Rev. 4454
        enderecoPrestador: form.enderecoPrestador || undefined,
        cidadePrestador: form.cidadePrestador || undefined,
        estadoPrestador: form.estadoPrestador || undefined,
        cepPrestador: form.cepPrestador || undefined,
        sociosPrestador: cnpjLookupSocios.length > 0 ? JSON.stringify(cnpjLookupSocios) : (form.sociosPrestador || undefined),
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Briefcase className="h-6 w-6 text-purple-600" />
              Módulo PJ — Contratos e Pagamentos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestão de contratos PJ — Folha 40/60, bonificações e alertas de vencimento
            </p>
          </div>
        </div>

        {/* Stats — Rev. 4412 */}
        {(() => {
          const semContrato = alertas?.pjsSemContrato?.length ?? 0;
          type KpiItem = {
            label: string; value: number | string; icon: any;
            color: string; iconBg: string; cardBg: string; border: string;
            alert?: boolean; onClick?: () => void;
          };
          const kpis: KpiItem[] = [
            {
              label: "Total", value: stats.total,
              icon: Briefcase, color: "text-slate-600", iconBg: "bg-slate-100", cardBg: "bg-white", border: "border-slate-200",
              onClick: () => setStatusFilter("todos"),
            },
            {
              label: "Ativos", value: stats.ativos,
              icon: CheckCircle2, color: "text-green-600", iconBg: "bg-green-100", cardBg: "bg-white", border: "border-green-300",
              onClick: () => setStatusFilter("ativo"),
            },
            {
              label: "Pendentes", value: stats.pendentes,
              icon: Clock, color: "text-amber-600", iconBg: "bg-amber-100", cardBg: "bg-white", border: "border-amber-300",
              onClick: () => setStatusFilter("pendente_assinatura"),
            },
            {
              label: "Encerrados", value: stats.encerrados,
              icon: Ban, color: "text-slate-500", iconBg: "bg-slate-100", cardBg: "bg-white", border: "border-slate-200",
              onClick: () => setStatusFilter("encerrado"),
            },
            {
              label: "Cancelados", value: stats.cancelados,
              icon: XCircle,
              color: stats.cancelados > 0 ? "text-red-600" : "text-slate-400",
              iconBg: stats.cancelados > 0 ? "bg-red-100" : "bg-slate-100",
              cardBg: stats.cancelados > 0 ? "bg-red-50" : "bg-white",
              border: stats.cancelados > 0 ? "border-red-300" : "border-slate-200",
              onClick: () => setStatusFilter("cancelado"),
            },
            {
              label: "Sem Assinatura", value: stats.semAssinatura,
              icon: FileSignature,
              color: stats.semAssinatura > 0 ? "text-orange-600" : "text-slate-400",
              iconBg: stats.semAssinatura > 0 ? "bg-orange-100" : "bg-slate-100",
              cardBg: stats.semAssinatura > 0 ? "bg-orange-50" : "bg-white",
              border: stats.semAssinatura > 0 ? "border-orange-300" : "border-slate-200",
              alert: stats.semAssinatura > 0,
              onClick: stats.semAssinatura > 0 ? () => setStatusFilter("ativo") : undefined,
            },
            {
              label: "Custo / Mês", value: formatMoeda(stats.totalMensal),
              icon: DollarSign, color: "text-purple-600", iconBg: "bg-purple-100", cardBg: "bg-white", border: "border-purple-300",
            },
          ];
          const custoCard = kpis.find(k => k.label === "Custo / Mês");
          const countCards = kpis.filter(k => k.label !== "Custo / Mês");
          return (
            <div className="flex flex-col gap-3">
              {/* Linha superior: cards de contagem */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {countCards.map((k) => (
                  <div
                    key={k.label}
                    onClick={k.onClick}
                    className={`rounded-xl border ${k.border} ${k.cardBg} px-4 py-4 flex flex-col items-center text-center gap-2 transition-shadow ${k.onClick ? "cursor-pointer hover:shadow-md active:scale-[0.98]" : ""}`}
                  >
                    <div className={`w-9 h-9 rounded-full ${k.iconBg} flex items-center justify-center shrink-0`}>
                      <k.icon className={`w-4.5 h-4.5 ${k.color}`} />
                    </div>
                    <p className={`text-3xl font-extrabold leading-none ${k.color}`}>{k.value}</p>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 leading-tight">{k.label}</p>
                  </div>
                ))}
              </div>
              {/* Card de custo — faixa larga */}
              {custoCard && (
                <div className={`rounded-xl border ${custoCard.border} ${custoCard.cardBg} px-6 py-4 flex items-center justify-between gap-4`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${custoCard.iconBg} flex items-center justify-center shrink-0`}>
                      <custoCard.icon className={`w-5 h-5 ${custoCard.color}`} />
                    </div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{custoCard.label}</p>
                  </div>
                  <p className={`text-3xl font-extrabold ${custoCard.color}`}>{custoCard.value}</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Alerts */}
        {alertas && ((alertas.vencendo?.length || 0) > 0 || (alertas.vencidos?.length || 0) > 0 || (alertas.pjsSemContrato?.length || 0) > 0) && (
          <div className="space-y-2">
            {(alertas.vencidos?.length || 0) > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-red-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> {alertas.vencidos.length} Contrato(s) Vencido(s) — Ação necessária
                </p>
                <div className="mt-2 space-y-1">
                  {alertas.vencidos.map((v: any) => (
                    <p key={v.id} className="text-xs text-red-700">
                      <span className="font-medium">{v.employeeName}</span> — Venceu em {formatDate(v.dataFim)}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {(alertas.vencendo?.length || 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> {alertas.vencendo.length} Contrato(s) Vencendo nos Próximos 30 Dias
                </p>
                <div className="mt-2 space-y-1">
                  {alertas.vencendo.map((v: any) => (
                    <p key={v.id} className="text-xs text-amber-700">
                      <span className="font-medium">{v.employeeName}</span> — Vence em {formatDate(v.dataFim)} — {formatMoeda(v.valorMensal)}/mês
                    </p>
                  ))}
                </div>
              </div>
            )}
            {(alertas.pjsSemContrato?.length || 0) > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> {alertas.pjsSemContrato.length} PJ(s) Sem Contrato Ativo
                </p>
                <div className="mt-2 space-y-1">
                  {alertas.pjsSemContrato.map((v: any) => (
                    <p key={v.id} className="text-xs text-blue-700">
                      <span className="font-medium">{v.nome}</span> — {v.cargo}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="contratos"><FileSignature className="h-4 w-4 mr-1" /> Contratos</TabsTrigger>
            <TabsTrigger value="pagamentos"><DollarSign className="h-4 w-4 mr-1" /> Folha PJ</TabsTrigger>
          </TabsList>

          {/* Contratos */}
          <TabsContent value="contratos">
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome, CNPJ ou nº contrato..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente_assinatura">Pendente Assinatura</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" title="Ajustar percentuais de todos os contratos ativos" onClick={() => { setAjusteForm({}); setShowAjusteDialog(true); }}>
                <Settings2 className="h-4 w-4" />
              </Button>
              <Button onClick={() => { setForm({ formaPagamento: defaultFormaPgto }); setCreatedContratoId(null); setMotivoAlteracao(""); setEditingContratoId(null); setShowContratoDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Novo Contrato
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="p-3 text-left font-medium">Nº Contrato</th>
                        <th className="p-3 text-center font-medium">Rev.</th>
                        <th className="p-3 text-left font-medium">Prestador</th>
                        <th className="p-3 text-left font-medium">CNPJ</th>
                        <th className="p-3 text-left font-medium">Vigência</th>
                        <th className="p-3 text-center font-medium">Vencimento</th>
                        <th className="p-3 text-right font-medium">Valor Mensal</th>
                        <th className="p-3 text-center font-medium">Adiant./Fech.</th>
                        <th className="p-3 text-center font-medium">Status</th>
                        <th className="p-3 text-center font-medium">Contrato</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">Nenhum contrato encontrado</td></tr>
                      ) : filtered.map((c: any) => {
                        const st = STATUS_CONTRATO[c.status] || STATUS_CONTRATO.ativo;
                        return (
                          <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="p-3 font-mono text-xs font-semibold">{c.numeroContrato}</td>
                            <td className="p-3 text-center">
                              <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Rev.{c.revisao || '01'}</span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {c.employeeFotoUrl ? (
                                  <img src={c.employeeFotoUrl} alt={c.employeeName} className="h-7 w-7 rounded-full object-cover flex-shrink-0 ring-1 ring-muted" />
                                ) : (
                                  <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0 ring-1 ring-muted">
                                    {(c.employeeName || "?").charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <div className="font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(c.employeeId)}>{c.employeeName}</div>
                                  <div className="text-xs text-muted-foreground">{c.razaoSocialPrestador || c.employeeCargo}</div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-xs font-mono">{formatCNPJ(c.cnpjPrestador)}</td>
                            <td className="p-3 text-xs">{formatDate(c.dataInicio)} — {formatDate(c.dataFim)}</td>
                            <td className="p-3 text-center">
                              {(() => {
                                if (!c.dataFim) return <span className="text-xs text-slate-400">Indeterminado</span>;
                                const hoje = new Date(); hoje.setHours(0,0,0,0);
                                const fim = new Date(c.dataFim + "T00:00:00");
                                const dias = Math.round((fim.getTime() - hoje.getTime()) / 86400000);
                                if (dias < 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Encerrado</span>;
                                if (dias === 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">Vence hoje</span>;
                                if (dias <= 15) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">faltam {dias}d</span>;
                                if (dias <= 30) return <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">faltam {dias}d</span>;
                                if (dias <= 60) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">faltam {dias}d</span>;
                                return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">faltam {dias}d</span>;
                              })()}
                            </td>
                            <td className="p-3 text-right font-bold">{formatMoeda(c.valorMensal)}</td>
                            <td className="p-3 text-center text-xs">
                              <span className="text-amber-600">{c.percentualAdiantamento ?? 50}%</span>
                              <span className="mx-1">/</span>
                              <span className="text-green-600">{c.percentualFechamento ?? 50}%</span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                            </td>
                            <td className="p-3 text-center">
                              {(() => {
                                const signedUrl = c.contratoAssinadoUrl || (c as any).fcSignDocumentUrl;
                                if (signedUrl) {
                                  return (
                                    <button
                                      title="Ver contrato assinado"
                                      onClick={() => window.open(signedUrl, "_blank")}
                                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                      Assinado
                                    </button>
                                  );
                                }
                                return (
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium bg-red-50 text-red-500 border border-red-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    Sem assinatura
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Detalhes" onClick={() => { setSelectedContrato(c); setShowDetailDialog(true); }}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-500" title="Editar contrato" onClick={() => openEditContrato(c)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {(() => {
                                  const signedUrl = c.contratoAssinadoUrl || (c as any).fcSignDocumentUrl;
                                  if (signedUrl) {
                                    return (
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" title="Ver contrato assinado (FCSign)" onClick={() => window.open(signedUrl, "_blank")}>
                                        <Eye className="h-3.5 w-3.5" />
                                      </Button>
                                    );
                                  }
                                  const faltando = contratoFaltando(c);
                                  if (faltando.length > 0) {
                                    return (
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-500"
                                        title={`Dados incompletos — preencha antes de assinar: ${faltando.join(", ")}`}
                                        onClick={() => toast.warning(`Preencha antes de enviar para assinatura: ${faltando.join(", ")}`)}>
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                      </Button>
                                    );
                                  }
                                  return (
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" title="Enviar para assinatura (FCSign)" onClick={() => setFcSignPJContratoId(c.id)}>
                                      <Send className="h-3.5 w-3.5" />
                                    </Button>
                                  );
                                })()}
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-orange-500" title="Enviar Aviso de Encerramento (FCSign)" onClick={() => setAvisoEncerramentoContratoId(c.id)}>
                                  <FileMinus2 className="h-3.5 w-3.5" />
                                </Button>
                                {c.status === "pendente_assinatura" && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600" onClick={() => { updateContrato.mutate({ id: c.id, status: "ativo" }); }}>
                                    Ativar
                                  </Button>
                                )}
                                {c.status === "cancelado" && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-purple-600" title="Criar Revisão — novo contrato substituto com Rev. incrementada (ISO 9001)" onClick={() => openCriarRevisao(c)}>
                                    <GitBranch className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {(c.status === "ativo" || c.status === "encerrado") && c.dataFim && (() => {
                                  const diasRestantes = Math.ceil((new Date(c.dataFim.slice(0,10) + "T00:00:00").getTime() - Date.now()) / 86400000);
                                  if (diasRestantes <= 60) {
                                    return (
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-700" title={diasRestantes <= 0 ? "Renovar contrato vencido" : `Renovar — vence em ${diasRestantes} dia(s)`} onClick={() => openRenovar(c)}>
                                        <RotateCw className="h-3.5 w-3.5" />
                                      </Button>
                                    );
                                  }
                                  return null;
                                })()}
                                {(c.status === "ativo" || c.status === "pendente_assinatura") && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" title="Cancelar contrato (libera o prestador para novo contrato)" onClick={() => { if (confirm(`Cancelar o contrato ${c.numeroContrato}?\n\nO contrato ficará registrado como "Cancelado" e o prestador poderá receber um novo contrato.`)) cancelarContrato.mutate({ id: c.id }); }}>
                                    <Ban className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir contrato?")) deleteContrato.mutate({ id: c.id }); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Folha PJ (Pagamentos) */}
          <TabsContent value="pagamentos">
            {/* Rev. 4371: PeriodSelectorCard — padrão de ouro mês/ano */}
            <PeriodSelectorCard
              ano={pjAno} mes={pjMes}
              onAno={v => { setPjAno(v); setSelectedIds(new Set()); }}
              onMes={v => { setPjMes(v); setSelectedIds(new Set()); }}
              onAnoTodo={() => { setPjMes(null); setSelectedIds(new Set()); }}
              monthStatus={monthStatus}
              showLegend
              className="mb-4"
            />
            <div className="flex gap-2 mb-4 flex-wrap">
              <Button variant="outline" onClick={() => gerarMensal.mutate({ companyId, companyIds })} disabled={gerarMensal.isPending} title="Sincroniza previsões de medições para todos os contratos PJ ativos (idempotente).">
                <RefreshCw className={`h-4 w-4 mr-2 ${gerarMensal.isPending ? "animate-spin" : ""}`} /> Sincronizar Previsões
              </Button>
              <Button variant="outline" onClick={() => exportarPDF()} disabled={!(pagamentos as any[]).length || pjMes == null} title={pjMes == null ? "Selecione um mês para exportar PDF" : ""}>
                <Printer className="h-4 w-4 mr-2" /> Exportar PDF
              </Button>
            </div>

            {/* Resumo do mês */}
            {(pagamentos as any[]).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-amber-600 uppercase font-semibold">1ª Medição</p>
                    <p className="text-xl font-bold text-amber-700">
                      {formatMoeda((pagamentos as any[]).filter(p => p.tipo === "adiantamento").reduce((s: number, p: any) => s + parseFloat(p.valor || "0"), 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-green-600 uppercase font-semibold">2ª Medição</p>
                    <p className="text-xl font-bold text-green-700">
                      {formatMoeda((pagamentos as any[]).filter(p => p.tipo === "fechamento").reduce((s: number, p: any) => s + parseFloat(p.valor || "0"), 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 border-purple-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-purple-600 uppercase font-semibold">Total Mês</p>
                    <p className="text-xl font-bold text-purple-700">
                      {formatMoeda((pagamentos as any[]).reduce((s: number, p: any) => s + parseFloat(p.valor || "0"), 0))}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Barra de ações em lote */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-3">
                <span className="text-sm font-medium text-blue-800">{selectedIds.size} selecionado(s)</span>
                <Button size="sm" variant="outline"
                  className="relative h-8 text-xs text-blue-700 border-blue-300 hover:bg-blue-50 overflow-hidden min-w-[140px]"
                  disabled={bulkAprovar.isPending}
                  onClick={() => {
                    const pendentes = Array.from(selectedIds).filter(id =>
                      (pagamentos as any[]).find((p: any) => p.id === id && p.status === 'pendente')
                    );
                    if (!pendentes.length) { toast.error("Nenhum lançamento pendente selecionado."); return; }
                    bulkAprovar.mutate({ ids: pendentes, companyId });
                  }}>
                  {bulkAprovar.isPending && (
                    <span className="absolute inset-0 bg-blue-400/20 transition-all duration-200 rounded"
                      style={{ width: `${bulkProgress}%` }} />
                  )}
                  <span className="relative flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {bulkAprovar.isPending ? `Aprovando... ${bulkProgress}%` : `Aprovar selecionados`}
                  </span>
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs text-red-700 border-red-300 hover:bg-red-50"
                  onClick={() => { if (confirm(`Excluir ${selectedIds.size} lançamento(s)?`)) bulkDelete.mutate({ ids: Array.from(selectedIds) }); }}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir selecionados
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs ml-auto" onClick={() => setSelectedIds(new Set())}>
                  Limpar seleção
                </Button>
              </div>
            )}

            {/* Rev. 4376 — Sub-abas: 1ª Medição / 2ª Medição */}
            {/* Seletor de sub-aba */}
            <div className="flex gap-0 mb-4 rounded-xl overflow-hidden border border-muted bg-muted/30 w-fit">
              {(["1", "2"] as const).map(tab => {
                const isActive = folhaMedicaoTab === tab;
                const isAmbar = tab === "1";
                const total = (pagamentos as any[])
                  .filter(p => tab === "1" ? p.tipo === "adiantamento" : p.tipo !== "adiantamento")
                  .reduce((s: number, p: any) => s + parseFloat(p.valor || "0"), 0);
                return (
                  <button key={tab} type="button"
                    onClick={() => setFolhaMedicaoTab(tab)}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all ${
                      isActive
                        ? isAmbar
                          ? "bg-amber-500 text-white shadow-sm"
                          : "bg-green-600 text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}>
                    <span>{tab === "1" ? "1ª Medição" : "2ª Medição"}</span>
                    {total > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isActive ? "bg-white/20 text-white" : isAmbar ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                        {formatMoeda(total)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {(pagamentos as any[]).length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nenhuma medição para {pjMes != null ? mesRef : String(pjAno)}. Novos contratos já geram as previsões automaticamente — para contratos antigos use "Sincronizar Previsões".
                </CardContent>
              </Card>
            ) : (() => {
              const isAdiant = folhaMedicaoTab === "1";
              const itens = (pagamentos as any[]).filter(p => isAdiant ? p.tipo === "adiantamento" : p.tipo !== "adiantamento");
              const totalGrupo = itens.reduce((s: number, p: any) => s + parseFloat(p.valor || "0"), 0);
              const allSelected = itens.length > 0 && itens.every((p: any) => selectedIds.has(p.id));
              // Mapa: contractId+mesReferencia → tem NF na 1ª medição?
              const primeiraComNF = new Set<string>(
                (pagamentos as any[])
                  .filter((p: any) => p.tipo === "adiantamento" && p.nfUrl)
                  .map((p: any) => `${p.contractId}_${p.mesReferencia}`)
              );
              return (
                <Card className={`border-2 ${isAdiant ? "border-amber-200" : "border-green-200"}`}>
                  <CardHeader className={`pb-3 pt-3 px-4 ${isAdiant ? "bg-amber-50" : "bg-green-50"} rounded-t-lg`}>
                    <div className="flex items-center justify-between mb-2">
                      <CardTitle className={`text-sm font-semibold ${isAdiant ? "text-amber-800" : "text-green-800"}`}>
                        📋 {isAdiant ? "1ª Medição do Mês" : "2ª Medição do Mês"}
                        <span className="ml-2 font-normal text-xs opacity-70">{itens.length} lançamento(s)</span>
                      </CardTitle>
                      <span className={`text-base font-bold ${isAdiant ? "text-amber-700" : "text-green-700"}`}>{formatMoeda(totalGrupo)}</span>
                    </div>
                    <input type="text" maxLength={120}
                      value={isAdiant ? obs1a : obs2a}
                      onChange={e => isAdiant ? setObs1a(e.target.value) : setObs2a(e.target.value)}
                      placeholder={isAdiant ? "Observação da 1ª medição..." : "Observação da 2ª medição..."}
                      className={`w-full text-xs rounded-lg border px-3 py-1.5 bg-white/70 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 ${isAdiant ? "border-amber-200 focus:ring-amber-400 text-amber-900" : "border-green-200 focus:ring-green-400 text-green-900"}`}
                    />
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="p-3 w-8">
                              <input type="checkbox" className="rounded" checked={allSelected}
                                onChange={e => {
                                  const next = new Set(selectedIds);
                                  if (e.target.checked) itens.forEach((p: any) => next.add(p.id));
                                  else itens.forEach((p: any) => next.delete(p.id));
                                  setSelectedIds(next);
                                }} />
                            </th>
                            <th className="p-3 text-left font-medium">Prestador</th>
                            <th className="p-3 text-left font-medium">Fornecedor</th>
                            <th className="p-3 text-left font-medium">Descrição</th>
                            <th className="p-3 text-right font-medium">Valor</th>
                            <th className="p-3 text-left font-medium">Data</th>
                            <th className="p-3 text-left font-medium">Forma Pgto</th>
                            <th className="p-3 text-center font-medium">Status</th>
                            <th className="p-3 text-center font-medium">NF</th>
                            <th className="p-3 text-center font-medium">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itens.map((p: any) => {
                            const st = STATUS_PAGAMENTO[p.status] || STATUS_PAGAMENTO.pendente;
                            return (
                              <tr key={p.id} className={`border-b last:border-0 hover:bg-muted/20 ${selectedIds.has(p.id) ? "bg-blue-50" : ""}`}>
                                <td className="p-3">
                                  <input type="checkbox" className="rounded" checked={selectedIds.has(p.id)}
                                    onChange={e => {
                                      const next = new Set(selectedIds);
                                      if (e.target.checked) next.add(p.id); else next.delete(p.id);
                                      setSelectedIds(next);
                                    }} />
                                </td>
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    {p.employeeFotoUrl ? (
                                      <img src={p.employeeFotoUrl} alt={p.employeeName} className="h-7 w-7 rounded-full object-cover flex-shrink-0 ring-1 ring-muted" />
                                    ) : (
                                      <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0 ring-1 ring-muted">
                                        {(p.employeeName || "?").charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <span className="font-medium leading-tight">{p.employeeName}</span>
                                  </div>
                                </td>
                                <td className="p-3">
                                  <FornecedorCadastroBadge status={p.fornecedorStatus} nome={p.fornecedorNome} cnpj={p.cnpjPrestador} />
                                </td>
                                <td className="p-3 text-xs">{
                                  p.tipo === 'adiantamento'
                                    ? `1ª Medição — ${(p.mesReferencia ?? '').split('-').reverse().join('/')}`
                                    : p.tipo === 'fechamento'
                                    ? `2ª Medição — ${(p.mesReferencia ?? '').split('-').reverse().join('/')}`
                                    : p.descricao || '-'
                                }</td>
                                <td className="p-3 text-right font-bold">{formatMoeda(p.valor)}</td>
                                <td className="p-3 text-xs">
                                  {p.dataPagamento ? (
                                    <span className="text-green-700">Pago em {formatDate(p.dataPagamento)}</span>
                                  ) : p.dataPrevista ? (
                                    <span className="text-muted-foreground">Previsto: {formatDate(p.dataPrevista)}</span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="p-3 text-xs text-muted-foreground">
                                  {p.formaPagamento || <span className="text-muted-foreground/50">—</span>}
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                                </td>
                                <td className="p-3 text-center">
                                  {p.nfUrl ? (
                                    <a href={p.nfUrl} target="_blank" rel="noreferrer" title={p.nfNome || "Ver NF"} className="inline-flex items-center justify-center gap-1 text-xs text-purple-700 font-medium hover:underline">
                                      <Paperclip className="h-3 w-3" /> NF
                                    </a>
                                  ) : !isAdiant && !primeiraComNF.has(`${p.contractId}_${p.mesReferencia}`) ? (
                                    <span className="inline-flex items-center gap-1 text-xs text-red-600 font-semibold" title="Nem a 1ª nem a 2ª medição tem NF — obrigatória em pelo menos uma">
                                      ⚠️ NF necessária
                                    </span>
                                  ) : (
                                    <span className="text-xs text-amber-600 font-medium" title="Nota fiscal não anexada">
                                      Sem NF
                                    </span>
                                  )}
                                </td>
                                <td className="p-3">
                                  <div className="flex items-center justify-center gap-1 flex-wrap">
                                    {p.aprovadoEm ? (
                                      <>
                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                                          <Check className="h-3 w-3" /> Aprovado
                                        </span>
                                        <Button size="sm" variant="ghost"
                                          className="h-7 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                          title="Cancelar aprovação e remover do Contas a Pagar"
                                          disabled={cancelarAprovacao.isPending}
                                          onClick={() => { if (confirm("Cancelar aprovação e remover do Contas a Pagar?")) cancelarAprovacao.mutate({ id: p.id, companyId }); }}>
                                          <XCircle className="h-3.5 w-3.5 mr-1" /> Cancelar
                                        </Button>
                                      </>
                                    ) : p.status === "pendente" ? (
                                      <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600" title="Aprovar e enviar para Contas a Pagar" onClick={() => { setAprovarTarget(p); setAprovarNfFile(null); setAprovarEnviarFin(true); setShowAprovarDialog(true); }}>
                                        <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Aprovar
                                      </Button>
                                    ) : null}
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir?")) deletePagamento.mutate({ id: p.id }); }}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Rev. 3262 — Ranking por fornecedor (somatório histórico em BRL) */}
            {(rankingFornecedores as any[]).length > 0 && (
              <Card className="mt-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Award className="h-5 w-5 text-purple-600" />
                    Ranking por fornecedor
                    <span className="text-xs font-normal text-muted-foreground">(somatório histórico — recebido em destaque; mês {mesRef} sinalizado)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="p-3 text-left font-medium w-10">#</th>
                          <th className="p-3 text-left font-medium">Prestador</th>
                          <th className="p-3 text-left font-medium">Fornecedor cadastrado</th>
                          <th className="p-3 text-right font-medium">Recebido (histórico)</th>
                          <th className="p-3 text-right font-medium">Total lançado</th>
                          <th className="p-3 text-right font-medium">No mês ({mesRef})</th>
                          <th className="p-3 text-center font-medium">Lançs.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(rankingFornecedores as any[]).map((r: any, i: number) => (
                          <tr key={r.employeeId} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="p-3 text-muted-foreground">{i + 1}</td>
                            <td className="p-3 font-medium">{r.employeeName}</td>
                            <td className="p-3">
                              <FornecedorCadastroBadge status={r.fornecedorStatus} nome={r.fornecedorNome} cnpj={r.cnpjPrestador} />
                            </td>
                            <td className="p-3 text-right font-bold text-green-700">{formatMoeda(r.totalRecebido)}</td>
                            <td className="p-3 text-right text-muted-foreground">{formatMoeda(r.totalHistorico)}</td>
                            <td className="p-3 text-right">
                              {r.totalMes > 0 ? (
                                <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 font-semibold px-2 py-0.5">{formatMoeda(r.totalMes)}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="p-3 text-center text-muted-foreground">{r.qtd}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/40 font-semibold">
                          <td className="p-3" colSpan={3}>Total geral</td>
                          <td className="p-3 text-right text-green-700">{formatMoeda((rankingFornecedores as any[]).reduce((s, r) => s + (r.totalRecebido || 0), 0))}</td>
                          <td className="p-3 text-right">{formatMoeda((rankingFornecedores as any[]).reduce((s, r) => s + (r.totalHistorico || 0), 0))}</td>
                          <td className="p-3 text-right text-purple-700">{formatMoeda((rankingFornecedores as any[]).reduce((s, r) => s + (r.totalMes || 0), 0))}</td>
                          <td className="p-3 text-center">{(rankingFornecedores as any[]).reduce((s, r) => s + (r.qtd || 0), 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Detail Dialog */}
        {selectedContrato && (
          <FullScreenDialog open={showDetailDialog} onClose={() => { setShowDetailDialog(false); setSelectedContrato(null); setDetailTab("info"); }} title={`Contrato ${selectedContrato.numeroContrato}`} icon={<FileSignature className="h-5 w-5 text-white" />}>
            <div className="w-full max-w-3xl mx-auto space-y-4">

              <div className="flex justify-end gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="gap-2" onClick={handlePreviewContrato} disabled={!contratoByIdData}>
                  <Printer className="h-4 w-4" /> Pré-visualizar
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => { setShowDetailDialog(false); openEditContrato(selectedContrato); }}>
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              </div>

              {/* Rev. 4462 — Banner de dados obrigatórios faltando para assinatura */}
              {(() => {
                const src = contratoByIdData || selectedContrato;
                const faltando = src ? contratoFaltando(src) : [];
                if (faltando.length === 0) return null;
                return (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-800">Contrato incompleto — envio para assinatura bloqueado</p>
                      <p className="text-xs text-amber-700 mt-0.5 break-words">
                        Preencha os seguintes dados antes de enviar para assinatura: <strong>{faltando.join(", ")}</strong>.
                      </p>
                    </div>
                    <Button size="sm" variant="outline"
                      className="border-amber-400 text-amber-700 hover:bg-amber-100 text-xs shrink-0"
                      onClick={() => { setShowDetailDialog(false); openEditContrato(selectedContrato); }}>
                      Preencher agora
                    </Button>
                  </div>
                );
              })()}

              {/* Tabs */}
              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="info" className="flex-1">Informações</TabsTrigger>

                  <TabsTrigger value="documentos" className="flex-1"><FolderOpen className="h-3.5 w-3.5 mr-1" />Documentos</TabsTrigger>
                  <TabsTrigger value="revisoes" className="flex-1">Revisões ISO</TabsTrigger>
                </TabsList>

                {/* Aba Info */}
                <TabsContent value="info" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/30 rounded-lg p-4">
                      <p className="text-xs text-muted-foreground uppercase">Prestador</p>
                      <p className="font-semibold text-lg">{selectedContrato.employeeName}</p>
                      <p className="text-sm text-muted-foreground">{selectedContrato.razaoSocialPrestador}</p>
                      <p className="text-sm text-muted-foreground">{formatCNPJ(selectedContrato.cnpjPrestador)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-4">
                      <p className="text-xs text-muted-foreground uppercase">Status</p>
                      <p className="font-semibold text-lg">{STATUS_CONTRATO[selectedContrato.status]?.label}</p>
                      <p className="text-sm text-muted-foreground">Vigência: {formatDate(selectedContrato.dataInicio)} — {formatDate(selectedContrato.dataFim)}</p>
                    </div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <p className="text-xs text-purple-600 uppercase font-semibold mb-2">Valores e Pagamento</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-purple-700">{formatMoeda(selectedContrato.valorMensal)}</p>
                        <p className="text-xs text-muted-foreground">Valor Mensal</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-amber-600">
                          {formatMoeda(parseFloat(selectedContrato.valorMensal || "0") * (selectedContrato.percentualAdiantamento ?? 50) / 100)}
                        </p>
                        <p className="text-xs text-muted-foreground">1ª Medição ({selectedContrato.percentualAdiantamento ?? 50}%) — Dia {selectedContrato.diaAdiantamento ?? 15}</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-green-600">
                          {formatMoeda(parseFloat(selectedContrato.valorMensal || "0") * (selectedContrato.percentualFechamento ?? 50) / 100)}
                        </p>
                        <p className="text-xs text-muted-foreground">2ª Medição ({selectedContrato.percentualFechamento ?? 50}%) — Dia {selectedContrato.diaFechamento ?? 5}</p>
                      </div>
                    </div>
                  </div>
                  {selectedContrato.objetoContrato && (
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-xs text-blue-600 uppercase font-semibold">Objeto do Contrato</p>
                      <p className="text-sm mt-1 whitespace-pre-wrap break-words">{selectedContrato.objetoContrato}</p>
                    </div>
                  )}
                  {selectedContrato.observacoes && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-600 uppercase font-semibold">Observações</p>
                      <p className="text-sm mt-1">{selectedContrato.observacoes}</p>
                    </div>
                  )}
                </TabsContent>

                {/* Aba Documentos */}
                <TabsContent value="documentos" className="space-y-4 mt-4">
                  {(() => {
                    const DOCS_OBRIGATORIOS = [
                      { tipo: "contrato_social", label: "Contrato Social",         desc: "Contrato social da empresa prestadora" },
                      { tipo: "rg",              label: "RG",                      desc: "RG do sócio/representante legal" },
                      { tipo: "cpf",             label: "CPF",                     desc: "CPF do sócio/representante legal" },
                    ];
                    const tiposObrigatorios = DOCS_OBRIGATORIOS.map(d => d.tipo);
                    const outrosDocs = (pjDocs as any[]).filter((d: any) => !tiposObrigatorios.includes(d.tipo));

                    return (
                      <div className="border rounded-lg p-5 space-y-5">
                        <div>
                          <p className="text-sm font-semibold">Documentos do Prestador</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Documentos obrigatórios e adicionais da empresa prestadora.</p>
                        </div>

                        {/* SLOTS OBRIGATÓRIOS */}
                        <div className="space-y-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Documentos Obrigatórios</p>
                          {DOCS_OBRIGATORIOS.map((slot) => {
                            const existente = (pjDocs as any[]).find((d: any) => d.tipo === slot.tipo);
                            const isUploading = uploadingTipo === slot.tipo;
                            return (
                              <div key={slot.tipo} className={`flex items-center gap-3 p-3 border rounded-lg ${existente ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${existente ? "bg-emerald-100" : "bg-slate-100"}`}>
                                  {existente
                                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    : <File className="h-4 w-4 text-slate-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold">{slot.label}</p>
                                  <p className="text-xs text-muted-foreground">{existente ? existente.nome : slot.desc}</p>
                                </div>
                                {existente ? (
                                  <div className="flex gap-1 shrink-0">
                                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Abrir" onClick={() => window.open(existente.url, "_blank")}>
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Remover" onClick={() => { if (confirm(`Remover ${slot.label}?`)) deleteDocPJ.mutate({ id: existente.id }); }}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ) : (
                                  <label className="shrink-0 cursor-pointer">
                                    <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      setUploadingTipo(slot.tipo);
                                      const reader = new FileReader();
                                      reader.onload = () => {
                                        const base64 = (reader.result as string).split(",")[1];
                                        uploadDocPJ.mutate({
                                          companyId,
                                          employeeId: selectedContrato.employeeId,
                                          contractId: selectedContrato.id,
                                          nome: slot.label,
                                          tipo: slot.tipo,
                                          fileBase64: base64,
                                          fileName: file.name,
                                        });
                                      };
                                      reader.readAsDataURL(file);
                                    }} />
                                    <div className={`flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded-md text-xs font-medium transition-colors ${isUploading ? "border-blue-300 text-blue-600" : "border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400"}`}>
                                      {isUploading ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Enviando…</> : <><Upload className="h-3.5 w-3.5" /> Enviar</>}
                                    </div>
                                  </label>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* OUTROS DOCUMENTOS */}
                        {outrosDocs.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Outros Documentos</p>
                            {outrosDocs.map((doc: any) => (
                              <div key={doc.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/20">
                                <File className="h-4 w-4 text-blue-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{doc.nome}</p>
                                  <p className="text-xs text-muted-foreground">{doc.tipo} • {doc.criadoPor} • {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("pt-BR") : "-"}</p>
                                </div>
                                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => window.open(doc.url, "_blank")}>
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 shrink-0" onClick={() => { if (confirm("Remover documento?")) deleteDocPJ.mutate({ id: doc.id }); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* ADICIONAR DOCUMENTO EXTRA */}
                        {!showNovoDoc ? (
                          <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full justify-center border-dashed" onClick={() => setShowNovoDoc(true)}>
                            <Plus className="h-3.5 w-3.5" /> Adicionar outro documento
                          </Button>
                        ) : (
                          <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium uppercase text-muted-foreground">Novo Documento</p>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setShowNovoDoc(false); setNovoDocNome(""); setNovoDocTipo("outro"); }}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Input placeholder="Nome do documento" value={novoDocNome} onChange={e => setNovoDocNome(e.target.value)} className="text-sm" />
                              <Select value={novoDocTipo} onValueChange={setNovoDocTipo}>
                                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="contrato_social">Contrato Social</SelectItem>
                                  <SelectItem value="rg">RG</SelectItem>
                                  <SelectItem value="cpf">CPF</SelectItem>
                                  <SelectItem value="cnpj">CNPJ</SelectItem>
                                  <SelectItem value="comprovante_endereco">Comprov. Endereço</SelectItem>
                                  <SelectItem value="das">DAS / Guia</SelectItem>
                                  <SelectItem value="nota_fiscal">Nota Fiscal</SelectItem>
                                  <SelectItem value="seguro">Apólice Seguro</SelectItem>
                                  <SelectItem value="contrato_assinado">Contrato Assinado</SelectItem>
                                  <SelectItem value="outro">Outro</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <label className={`block cursor-pointer ${!novoDocNome ? "opacity-50 pointer-events-none" : ""}`}>
                              <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx" className="hidden" onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file || !novoDocNome) return;
                                setUploadingDoc(true);
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const base64 = (reader.result as string).split(",")[1];
                                  uploadDocPJ.mutate({
                                    companyId,
                                    employeeId: selectedContrato.employeeId,
                                    contractId: selectedContrato.id,
                                    nome: novoDocNome,
                                    tipo: novoDocTipo,
                                    fileBase64: base64,
                                    fileName: file.name,
                                  });
                                };
                                reader.readAsDataURL(file);
                              }} />
                              <div className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-3 transition-colors ${uploadingDoc ? "border-blue-300 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/50"}`}>
                                {uploadingDoc
                                  ? <><RefreshCw className="h-4 w-4 animate-spin text-blue-500" /><span className="text-xs text-blue-600">Enviando...</span></>
                                  : <><Upload className="h-4 w-4 text-gray-400" /><span className="text-xs text-gray-600">{novoDocNome ? "Clique para selecionar o arquivo" : "Informe o nome do documento antes"}</span></>
                                }
                              </div>
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </TabsContent>

                {/* Aba Revisões ISO */}
                <TabsContent value="revisoes" className="space-y-4 mt-4">
                  <div className="border rounded-lg p-5 space-y-4">
                    <div>
                      <p className="text-sm font-semibold">Controle de Revisões ISO</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Histórico de todas as revisões do contrato conforme padrão ISO. Cada alteração relevante gera uma nova revisão numerada.</p>
                    </div>
                    {(revisoes as any[]).length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        Nenhuma revisão registrada
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(revisoes as any[]).map((rev: any, i: number) => (
                          <div key={rev.id} className={`flex gap-4 p-3 rounded-lg border ${i === 0 ? "bg-blue-50 border-blue-200" : "bg-muted/20 border-transparent"}`}>
                            <div className="shrink-0 flex flex-col items-center">
                              <div className={`text-xs font-bold font-mono px-2 py-1 rounded ${i === 0 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-700"}`}>
                                Rev.{rev.revisaoNum}
                              </div>
                              {i < (revisoes as any[]).length - 1 && <div className="w-px flex-1 bg-gray-200 mt-2" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{rev.motivo || "Alteração de contrato"}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {rev.criadoPor} — {rev.criadoEm ? new Date(rev.criadoEm).toLocaleString("pt-BR") : "-"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Revisão atual:</span>{" "}
                        <span className="font-mono font-bold text-blue-700">Rev.{selectedContrato?.revisao || '01'}</span>
                        {selectedContrato?.revisaoMotivo && <span className="ml-2 text-gray-500">— {selectedContrato.revisaoMotivo}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Modelo do contrato: <code className="bg-muted px-1 rounded text-xs">server/routers/pjContracts.ts → MODELO_CONTRATO_PJ</code>
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </FullScreenDialog>
        )}

        {/* Create / Edit Contrato Dialog — layout 2 colunas Rev. 4454 */}
        <FullScreenDialog open={showContratoDialog} onClose={() => { setShowContratoDialog(false); setEditingContratoId(null); setForm({}); setMotivoAlteracao(""); setCreatedContratoId(null); setFormOrigemTipo(null); setFormOrigemContrato(null); }} title={editingContratoId ? "Editar Contrato PJ" : formOrigemTipo === 'revisao' ? "Criar Revisão de Contrato PJ" : formOrigemTipo === 'renovacao' ? "Renovar Contrato PJ" : "Novo Contrato PJ"} icon={<FileSignature className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-7xl mx-auto">

            {/* ═══ FASE 1 — Seleção de prestador (apenas novo contrato) ═══ */}
            {!form.employeeId && !editingContratoId && (
              <div className="space-y-6">
                <div className="text-center pt-2">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-100 mb-3">
                    <Users className="h-7 w-7 text-blue-600" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Selecionar Prestador PJ</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {pjEmployeesSemContrato.length === 0
                      ? "Todos os prestadores PJ já possuem contrato ativo ou pendente de assinatura"
                      : <><span className="font-semibold text-blue-700">{pjEmployeesSemContrato.length}</span> prestador(es) disponível(is) para novo contrato</>}
                  </p>
                </div>
                {pjEmployeesSemContrato.length > 0 && (
                  <div className="relative max-w-sm mx-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <input
                      autoFocus
                      value={empSearch}
                      onChange={e => setEmpSearch(e.target.value)}
                      placeholder="Buscar por nome ou CPF..."
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white shadow-sm"
                    />
                  </div>
                )}
                {filteredEmps.length === 0 ? (
                  <div className="text-center py-14">
                    <div className="text-5xl mb-3">👥</div>
                    <p className="text-gray-500 font-medium text-sm">
                      {pjEmployeesSemContrato.length === 0
                        ? "Todos os prestadores PJ já possuem contrato ativo ou pendente de assinatura."
                        : `Nenhum resultado para "${empSearch}"`}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {filteredEmps.map((e: any) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => { setForm({ ...form, employeeId: e.id }); setEmpSearch(""); }}
                        className="group flex flex-col items-center gap-2.5 p-4 rounded-2xl border border-gray-200 bg-white hover:border-blue-400 hover:shadow-lg hover:bg-blue-50/40 transition-all duration-150 text-center w-full"
                      >
                        <div className={`h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0 shadow-sm ${getAvatarColor(e.nomeCompleto || "")}`}>
                          {getInitials(e.nomeCompleto || "")}
                        </div>
                        <div className="w-full min-w-0">
                          <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2 break-words">{e.nomeCompleto}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{formatCPF(e.cpf)}</p>
                          {e.codigoInterno && <p className="text-[10px] text-blue-600 font-bold mt-0.5">{e.codigoInterno}</p>}
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${e.status === "Ativo" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {e.status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ═══ FASE 2 — Formulário (prestador selecionado ou editando) ═══ */}
            {(form.employeeId || editingContratoId) && (<>

            {/* Banner de origem (revisão / renovação) */}
            {formOrigemTipo && formOrigemContrato && !createdContratoId && (
              <div className={`mb-4 p-3 rounded-xl border flex items-start gap-3 ${formOrigemTipo === 'revisao' ? "bg-purple-50 border-purple-200" : "bg-green-50 border-green-200"}`}>
                {formOrigemTipo === 'revisao'
                  ? <GitBranch className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                  : <RotateCw className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${formOrigemTipo === 'revisao' ? "text-purple-900" : "text-green-900"}`}>
                    {formOrigemTipo === 'revisao' ? "Criando revisão do contrato" : "Renovando contrato"}{" "}
                    <span className="font-mono">{formOrigemContrato.numeroContrato}</span>
                    {" "}— Rev.{String(parseInt(formOrigemContrato.revisao || '01', 10) + 1).padStart(2, '0')}
                  </p>
                  <p className={`text-xs mt-0.5 ${formOrigemTipo === 'revisao' ? "text-purple-600" : "text-green-600"}`}>
                    {formOrigemTipo === 'revisao'
                      ? `Dados herdados do contrato cancelado (Rev.${formOrigemContrato.revisao || '01'}). Ajuste o que for necessário antes de salvar.`
                      : `Vigência anterior: ${formatDate(formOrigemContrato.dataInicio)} → ${formatDate(formOrigemContrato.dataFim)}. O contrato original será encerrado automaticamente.`}
                  </p>
                </div>
              </div>
            )}

            {/* Banner pós-criação */}
            {createdContratoId && !editingContratoId && (
              <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Contrato criado com sucesso!</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Adicione documentos na aba Documentos conforme necessário.</p>
                </div>
              </div>
            )}

            {/* Banner prestador selecionado */}
            {!editingContratoId && selectedEmp && (
              <div className="mb-4 flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm ${getAvatarColor(selectedEmp.nomeCompleto || "")}`}>
                  {getInitials(selectedEmp.nomeCompleto || "")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-blue-900 truncate">{selectedEmp.nomeCompleto}</p>
                  <p className="text-xs text-blue-500 font-mono">{formatCPF(selectedEmp.cpf)}</p>
                </div>
                {!createdContratoId && (
                  <Button size="sm" variant="outline" className="shrink-0 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                    onClick={() => setForm({ ...form, employeeId: undefined })}>
                    Trocar prestador
                  </Button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

              {/* ── COLUNA ESQUERDA: Dados cadastrais ── */}
              <div className="space-y-4">

                {/* § 1 — Prestador: apenas em edição (novo contrato usa Fase 1 com cards) */}
                {editingContratoId && (
                  <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b">
                      <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">1</div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-700">Prestador de Serviços</p>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-3 border rounded-xl px-3 py-2.5 bg-gray-50">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 ${getAvatarColor(selectedEmp?.nomeCompleto || "")}`}>
                          {getInitials(selectedEmp?.nomeCompleto || "")}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{selectedEmp?.nomeCompleto || "—"}</p>
                          <p className="text-xs text-gray-500 font-mono">{formatCPF(selectedEmp?.cpf || "")}</p>
                        </div>
                        <span className="ml-auto text-xs text-gray-400 italic shrink-0">não editável</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* § 2 — Dados da Empresa Contratada (CNPJ lookup) */}
                <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b">
                    <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">2</div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-700">Dados da Empresa Contratada</p>
                    {cnpjLookupLoading && <span className="ml-auto text-[10px] text-blue-600 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Consultando Receita Federal...</span>}
                  </div>
                  <div className="p-4 space-y-3">
                    {/* CNPJ + Razão Social lado a lado */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">CNPJ</label>
                        <div className="flex gap-1.5">
                          <Input
                            value={form.cnpjPrestador || ""}
                            onChange={e => {
                              const val = e.target.value;
                              setForm({ ...form, cnpjPrestador: val });
                              const digits = val.replace(/\D/g, "");
                              if (digits.length === 14) handleCnpjLookup(digits);
                            }}
                            placeholder="00.000.000/0000-00"
                            className="flex-1 font-mono text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => handleCnpjLookup(form.cnpjPrestador || "")}
                            disabled={cnpjLookupLoading || (form.cnpjPrestador || "").replace(/\D/g, "").length !== 14}
                            title="Buscar dados na Receita Federal"
                            className="inline-flex items-center justify-center h-10 w-10 rounded-md border bg-background hover:bg-accent disabled:opacity-40 shrink-0 transition-colors"
                          >
                            {cnpjLookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                          </button>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Digite 14 dígitos para busca automática</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Razão Social</label>
                        <Input value={form.razaoSocialPrestador || ""} onChange={e => setForm({ ...form, razaoSocialPrestador: e.target.value })} placeholder="Auto-preenchida pelo CNPJ" />
                      </div>
                    </div>
                    {/* Endereço completo */}
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Endereço</label>
                      <Input value={form.enderecoPrestador || ""} onChange={e => setForm({ ...form, enderecoPrestador: e.target.value })} placeholder="Logradouro, nº, Complemento, Bairro" />
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      <div className="col-span-2">
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Cidade</label>
                        <Input value={form.cidadePrestador || ""} onChange={e => setForm({ ...form, cidadePrestador: e.target.value })} placeholder="Cidade" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">UF</label>
                        <Input value={form.estadoPrestador || ""} onChange={e => setForm({ ...form, estadoPrestador: e.target.value.toUpperCase().slice(0, 2) })} placeholder="SP" maxLength={2} className="text-center font-mono" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-medium text-gray-600 mb-1 block">CEP</label>
                        <Input value={form.cepPrestador || ""} onChange={e => setForm({ ...form, cepPrestador: e.target.value })} placeholder="00000-000" className="font-mono" />
                      </div>
                    </div>
                    {/* Sócios — após lookup */}
                    {cnpjLookupSocios.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Quadro Societário — Receita Federal</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cnpjLookupSocios.map((s, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 text-amber-900 text-xs px-2.5 py-1">
                              <span className="font-medium">{s.nome}</span>
                              {s.qual && <span className="text-amber-600">— {s.qual}</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Sócios salvos anteriormente */}
                    {cnpjLookupSocios.length === 0 && form.sociosPrestador && (() => {
                      try {
                        const saved = JSON.parse(form.sociosPrestador);
                        if (Array.isArray(saved) && saved.length > 0) return (
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                            <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Quadro Societário (salvo) <span className="font-normal text-gray-400">— clique 🔍 para atualizar</span></p>
                            <div className="flex flex-wrap gap-1.5">
                              {saved.map((s: any, i: number) => (
                                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 text-gray-700 text-xs px-2.5 py-1">
                                  <span className="font-medium">{s.nome}</span>
                                  {s.qual && <span className="text-gray-500">— {s.qual}</span>}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      } catch {}
                      return null;
                    })()}
                  </div>
                </div>

                {/* § 3 — Vigência e Valor */}
                <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b">
                    <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">3</div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-700">Vigência e Valor</p>
                  </div>
                  <div className="p-4 grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Data Início *</label>
                      <Input type="date" value={form.dataInicio || ""} onChange={e => setForm({ ...form, dataInicio: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Data Fim *</label>
                      <Input type="date" value={form.dataFim || ""} onChange={e => setForm({ ...form, dataFim: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Valor Mensal (R$) *</label>
                      <Input
                        type="text" inputMode="decimal"
                        value={form.valorMensal ? formatMoedaInput(String(parseFloat(form.valorMensal) || "").replace(".", ",")) : ""}
                        onChange={e => { const fmt = formatMoedaInput(e.target.value); const raw = parseMoedaBR(fmt); setForm({ ...form, valorMensal: raw > 0 ? String(raw) : "" }); }}
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                </div>

                {/* § 4 — Regra de Pagamento */}
                <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-purple-50 border-b border-purple-100">
                    <div className="h-5 w-5 rounded-full bg-purple-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">4</div>
                    <p className="text-xs font-bold uppercase tracking-wider text-purple-800">Regra de Pagamento (Folha PJ)</p>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">% 1ª Medição</label>
                        <Input type="number" min={0} max={100} value={form.percentualAdiantamento ?? ""} placeholder="50"
                          onChange={e => { const v = parseInt(e.target.value); const a = isNaN(v) ? undefined : Math.min(100, Math.max(0, v)); setForm({ ...form, percentualAdiantamento: a, percentualFechamento: a !== undefined ? 100 - a : undefined }); }} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Dia 1ª Medição</label>
                        <Input type="number" min={1} max={31} value={form.diaAdiantamento ?? ""} placeholder="15"
                          onChange={e => { const v = parseInt(e.target.value); setForm({ ...form, diaAdiantamento: isNaN(v) ? undefined : v }); }} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">% 2ª Medição <span className="text-muted-foreground">(auto)</span></label>
                        <Input type="number" value={form.percentualFechamento ?? ""} placeholder="50" readOnly className="bg-muted/40 cursor-not-allowed" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Dia 2ª Medição</label>
                        <Input type="number" min={1} max={31} value={form.diaFechamento ?? ""} placeholder="5"
                          onChange={e => { const v = parseInt(e.target.value); setForm({ ...form, diaFechamento: isNaN(v) ? undefined : v }); }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Forma de Pagamento</label>
                        <Select value={form.formaPagamento || ""} onValueChange={v => setForm({ ...form, formaPagamento: v || undefined })}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PIX">PIX</SelectItem>
                            <SelectItem value="TED">TED</SelectItem>
                            <SelectItem value="Boleto">Boleto</SelectItem>
                            <SelectItem value="Depósito">Depósito</SelectItem>
                            <SelectItem value="Cheque">Cheque</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {form.valorMensal && (
                        <div className="flex items-end pb-1">
                          <div className="text-xs text-purple-700 space-y-0.5">
                            <div>1ª: <strong>{formatMoeda(parseFloat(form.valorMensal) * (form.percentualAdiantamento ?? 50) / 100)}</strong> — dia {form.diaAdiantamento ?? 15}</div>
                            <div>2ª: <strong>{formatMoeda(parseFloat(form.valorMensal) * (form.percentualFechamento ?? 50) / 100)}</strong> — dia {form.diaFechamento ?? 5} (mês seg.)</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* § 5 — Dados Bancários */}
                <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b">
                    <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">5</div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-700">Dados Bancários para Pagamento</p>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Banco</label>
                      <Input value={form.bancoPrestador || ""} onChange={e => setForm({ ...form, bancoPrestador: e.target.value })} placeholder="Ex: Banco do Brasil, Itaú..." />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Agência</label>
                      <Input value={form.agenciaPrestador || ""} onChange={e => setForm({ ...form, agenciaPrestador: e.target.value })} placeholder="0000-0" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Conta Corrente</label>
                      <Input value={form.contaPrestador || ""} onChange={e => setForm({ ...form, contaPrestador: e.target.value })} placeholder="00000-0" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Chave PIX</label>
                      <Input value={form.pixPrestador || ""} onChange={e => setForm({ ...form, pixPrestador: e.target.value })} placeholder="CNPJ, e-mail, celular ou chave aleatória" />
                    </div>
                  </div>
                </div>

                {/* § 6 — Observações + Motivo Alteração */}
                <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b">
                    <div className="h-5 w-5 rounded-full bg-gray-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">6</div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-700">Observações</p>
                  </div>
                  <div className="p-4 space-y-3">
                    <Textarea value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} placeholder="Observações gerais do contrato..." />
                    {editingContratoId && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                        <label className="text-xs font-semibold text-amber-800 block mb-1">Motivo da Alteração (Revisão ISO)</label>
                        <p className="text-[10px] text-amber-600 mb-2">Ao salvar, uma nova revisão ISO será gerada automaticamente.</p>
                        <Input value={motivoAlteracao} onChange={e => setMotivoAlteracao(e.target.value)} placeholder="Ex: Reajuste de valor mensal, correção de data..." className="bg-white" />
                      </div>
                    )}
                  </div>
                </div>

              </div>{/* fim coluna esquerda */}

              {/* ── COLUNA DIREITA: Editor do Contrato ── */}
              <div className="space-y-4">
                <div className="rounded-xl border-2 border-blue-100 bg-white shadow-sm overflow-hidden sticky top-4">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-600">
                    <FileText className="h-4 w-4 text-white shrink-0" />
                    <p className="text-xs font-bold uppercase tracking-wider text-white">Cláusula — Objeto do Contrato</p>
                    <span className="ml-auto text-[10px] text-blue-200">as tags abaixo serão substituídas pelos dados reais</span>
                  </div>
                  <div className="p-4 space-y-3">
                    {/* IA input */}
                    <div className="flex gap-2 items-center">
                      <input
                        value={objetoIAInput}
                        onChange={e => setObjetoIAInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleGerarClausulaPJ(); }}
                        placeholder="Cargo/tipo: Engenheiro de campo, Orçamentista, Mestre de obras..."
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-gray-50 placeholder-gray-400"
                      />
                      <button
                        type="button"
                        onClick={handleGerarClausulaPJ}
                        disabled={!objetoIAInput.trim() || objetoIALoading}
                        className="relative overflow-hidden inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 text-xs font-semibold px-3 py-2 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {objetoIALoading && <span className="absolute inset-0 bg-blue-400/25 transition-all" style={{ width: `${objetoIAProgress}%` }} />}
                        <span className="relative flex items-center gap-1.5">
                          {objetoIALoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {objetoIAProgress}%</> : <><Sparkles className="h-3.5 w-3.5" /> Gerar com IA</>}
                        </span>
                      </button>
                    </div>

                    {/* Textarea */}
                    <Textarea
                      ref={objetoTextareaRef}
                      value={form.objetoContrato || ""}
                      onChange={e => setForm({ ...form, objetoContrato: e.target.value })}
                      rows={12}
                      placeholder="Escreva ou gere a cláusula com IA. Use as tags abaixo para inserir dados do contrato automaticamente."
                      className="bg-gray-50 text-xs leading-relaxed border-gray-200 resize-y font-[inherit]"
                    />
                    {form.objetoContrato && <p className="text-[10px] text-gray-400 text-right">{form.objetoContrato.length} caracteres</p>}

                    {/* Painel de tags */}
                    <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/40 p-3 space-y-2.5">
                      <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">↓ Clique numa tag para inserir no cursor</p>
                      {([
                        { group: "Contratada", headCls: "text-blue-600", btnCls: "border-blue-200 text-blue-700 hover:bg-blue-100", tags: [
                          { tag: "[CONTRATADA_RAZAO_SOCIAL]", label: "Razão Social" },
                          { tag: "[CONTRATADA_CNPJ]",         label: "CNPJ" },
                          { tag: "[CONTRATADA_ENDERECO]",     label: "Endereço" },
                          { tag: "[CONTRATADA_CIDADE]",       label: "Cidade" },
                          { tag: "[CONTRATADA_ESTADO]",       label: "Estado" },
                          { tag: "[CONTRATADA_CEP]",          label: "CEP" },
                          { tag: "[PRESTADOR_NOME]",          label: "Nome Físico" },
                          { tag: "[PRESTADOR_CPF]",           label: "CPF" },
                          { tag: "[DADOS_BANCARIOS_CONTRATADA]", label: "Dados Bancários" },
                        ]},
                        { group: "Contratante", headCls: "text-indigo-600", btnCls: "border-indigo-200 text-indigo-700 hover:bg-indigo-100", tags: [
                          { tag: "[CONTRATANTE_NOME]",          label: "Nome" },
                          { tag: "[CONTRATANTE_CNPJ]",          label: "CNPJ" },
                          { tag: "[CONTRATANTE_ENDERECO]",      label: "Endereço" },
                          { tag: "[CONTRATANTE_CIDADE]",        label: "Cidade" },
                          { tag: "[CONTRATANTE_ESTADO]",        label: "Estado" },
                          { tag: "[CONTRATANTE_REPRESENTANTE]", label: "Representante" },
                        ]},
                        { group: "Contrato", headCls: "text-violet-600", btnCls: "border-violet-200 text-violet-700 hover:bg-violet-100", tags: [
                          { tag: "[VALOR_MENSAL]",            label: "Valor Mensal" },
                          { tag: "[VALOR_EXTENSO]",           label: "Por Extenso" },
                          { tag: "[PERCENTUAL_ADIANTAMENTO]", label: "% 1ª Med." },
                          { tag: "[PERCENTUAL_FECHAMENTO]",   label: "% 2ª Med." },
                          { tag: "[VALOR_ADIANTAMENTO]",      label: "R$ 1ª Med." },
                          { tag: "[VALOR_FECHAMENTO]",        label: "R$ 2ª Med." },
                          { tag: "[DIA_ADIANTAMENTO]",        label: "Dia 1ª Med." },
                          { tag: "[DIA_FECHAMENTO]",          label: "Dia 2ª Med." },
                          { tag: "[DATA_INICIO]",             label: "Início" },
                          { tag: "[DATA_FIM]",                label: "Fim" },
                          { tag: "[DATA_ASSINATURA]",         label: "Assinatura" },
                          { tag: "[PRAZO_VIGENCIA]",          label: "Prazo" },
                          { tag: "[OBJETO_CONTRATO]",         label: "Objeto" },
                          { tag: "[FORO_COMARCA]",            label: "Foro" },
                        ]},
                      ] as { group: string; headCls: string; btnCls: string; tags: { tag: string; label: string }[] }[]).map(({ group, headCls, btnCls, tags }) => (
                        <div key={group}>
                          <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${headCls}`}>{group}</p>
                          <div className="flex flex-wrap gap-1">
                            {tags.map(({ tag, label }) => (
                              <button key={tag} type="button" onClick={() => insertTag(tag)}
                                className={`inline-flex items-center rounded border bg-white text-[10px] font-mono px-1.5 py-0.5 transition-colors ${btnCls}`}
                                title={tag}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>{/* fim coluna direita */}

            </div>{/* fim grid 2 col */}

            {/* Botões de ação */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowContratoDialog(false); setEditingContratoId(null); setForm({}); setMotivoAlteracao(""); setCreatedContratoId(null); }}>
                {createdContratoId ? "Fechar" : "Cancelar"}
              </Button>
              {!createdContratoId && (
                <Button onClick={handleSubmitContrato} disabled={createContrato.isPending || updateContrato.isPending}>
                  {createContrato.isPending || updateContrato.isPending ? "Salvando..." : editingContratoId ? "Salvar Alterações" : "Criar Contrato"}
                </Button>
              )}
            </div>
            </>)}
          </div>
        </FullScreenDialog>

      </div>

      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />



          <PrintFooterLGPD />

        {/* Rev. 4376 — Dialog: Ajuste de percentuais em lote */}
        <Dialog open={showAjusteDialog} onOpenChange={v => { setShowAjusteDialog(v); if (!v) setAjusteConfirming(false); }}>
          <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl">
            {/* Header com gradiente */}
            <div className="bg-gradient-to-br from-purple-600 to-purple-800 px-6 pt-6 pb-5">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-xl p-2">
                  <Settings2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-lg leading-tight">Regra de pagamento</h2>
                  <p className="text-purple-200 text-xs mt-0.5">Aplica a todos os contratos ativos</p>
                </div>
              </div>

              {/* Mini preview dos percentuais no header */}
              {ajusteForm.percAdiant !== undefined && (
                <div className="mt-4 flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2.5">
                  <div className="flex-1 text-center">
                    <p className="text-purple-200 text-xs">1ª Medição</p>
                    <p className="text-white font-bold text-xl">{ajusteForm.percAdiant}%</p>
                  </div>
                  <div className="w-px h-8 bg-white/20" />
                  <div className="flex-1 text-center">
                    <p className="text-purple-200 text-xs">2ª Medição</p>
                    <p className="text-white font-bold text-xl">{100 - ajusteForm.percAdiant}%</p>
                  </div>
                  <div className="w-px h-8 bg-white/20" />
                  <div className="flex-1 text-center">
                    <p className="text-purple-200 text-xs">Total</p>
                    <p className="text-green-300 font-bold text-xl">100%</p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Percentuais */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Percentuais</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">1ª Medição</label>
                    <div className="relative">
                      <Input type="number" min={0} max={100} value={ajusteForm.percAdiant ?? ""} placeholder="50"
                        className="h-12 text-base pr-9 rounded-xl border-2 focus:border-purple-400"
                        onChange={e => {
                          const v = parseInt(e.target.value);
                          setAjusteForm({ ...ajusteForm, percAdiant: isNaN(v) ? undefined : Math.min(100, Math.max(0, v)) });
                        }} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">%</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">2ª Medição <span className="text-xs">(auto)</span></label>
                    <div className="relative">
                      <Input readOnly value={ajusteForm.percAdiant !== undefined ? 100 - ajusteForm.percAdiant : ""}
                        placeholder="50"
                        className="h-12 text-base pr-9 rounded-xl border-2 bg-muted/50 cursor-not-allowed text-muted-foreground" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Separador */}
              <div className="border-t border-dashed" />

              {/* Dias */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Dias de pagamento</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Dia — 1ª Medição</label>
                    <Input type="number" min={1} max={31} value={ajusteForm.diaAdiant ?? ""} placeholder="15"
                      className="h-12 text-base rounded-xl border-2 focus:border-purple-400"
                      onChange={e => { const v = parseInt(e.target.value); setAjusteForm({ ...ajusteForm, diaAdiant: isNaN(v) ? undefined : v }); }} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Dia — 2ª Medição</label>
                    <Input type="number" min={1} max={31}
                      value={ajusteForm.diaFech === 31 ? "" : (ajusteForm.diaFech ?? "")}
                      placeholder={ajusteForm.diaFech === 31 ? "—" : "5"}
                      disabled={ajusteForm.diaFech === 31}
                      className={`h-12 text-base rounded-xl border-2 focus:border-purple-400 ${ajusteForm.diaFech === 31 ? "bg-muted/50 cursor-not-allowed" : ""}`}
                      onChange={e => { const v = parseInt(e.target.value); setAjusteForm({ ...ajusteForm, diaFech: isNaN(v) ? undefined : v }); }} />
                    <button type="button"
                      onClick={() => setAjusteForm({ ...ajusteForm, diaFech: ajusteForm.diaFech === 31 ? undefined : 31 })}
                      className={`w-full text-xs px-3 py-2 rounded-lg border-2 font-medium transition-all ${ajusteForm.diaFech === 31 ? "bg-green-50 border-green-400 text-green-700" : "bg-white border-dashed border-muted-foreground/30 text-muted-foreground hover:border-green-400 hover:text-green-700 hover:bg-green-50"}`}>
                      {ajusteForm.diaFech === 31 ? "✓ Último dia do mês" : "Último dia do mês"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Botão / Confirmação */}
              {ajusteConfirming ? (
                <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 space-y-3">
                  <p className="text-sm font-semibold text-amber-800 text-center">
                    Confirmar aplicação para todos os contratos ativos?
                  </p>
                  <p className="text-xs text-amber-700 text-center">
                    {ajusteForm.percAdiant}% + {100 - ajusteForm.percAdiant!}% · Dia {ajusteForm.diaAdiant ?? 15} e {ajusteForm.diaFech === 31 ? "último dia" : `dia ${ajusteForm.diaFech ?? 5}`}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" className="flex-1 h-10 rounded-xl" onClick={() => setAjusteConfirming(false)}>
                      Voltar
                    </Button>
                    <Button className="flex-1 h-10 rounded-xl bg-purple-600 hover:bg-purple-700" disabled={bulkUpdatePercentuais.isPending}
                      onClick={() => {
                        bulkUpdatePercentuais.mutate({
                          companyId,
                          percentualAdiantamento: ajusteForm.percAdiant!,
                          percentualFechamento: 100 - ajusteForm.percAdiant!,
                          diaAdiantamento: ajusteForm.diaAdiant,
                          diaFechamento: ajusteForm.diaFech,
                        });
                      }}>
                      {bulkUpdatePercentuais.isPending
                        ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Aplicando...</>
                        : "Confirmar"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button className="w-full h-12 rounded-xl bg-purple-600 hover:bg-purple-700 text-base font-semibold shadow-md shadow-purple-200"
                  disabled={ajusteForm.percAdiant === undefined}
                  onClick={() => setAjusteConfirming(true)}>
                  <Settings2 className="h-4 w-4 mr-2" />
                  Aplicar a todos os contratos ativos
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>


        {/* Rev. 4377 — Dialog de aprovação com NF + envio para Contas a Pagar */}
        <Dialog open={showAprovarDialog} onOpenChange={v => { setShowAprovarDialog(v); if (!v) { setAprovarTarget(null); setAprovarNfFile(null); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                Aprovar Medição
              </DialogTitle>
            </DialogHeader>
            {aprovarTarget && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-blue-900">{aprovarTarget.employeeName}</div>
                  <div className="text-blue-700">{aprovarTarget.descricao} — <span className="font-bold">{formatMoeda(parseFloat(aprovarTarget.valor || "0"))}</span></div>
                </div>

                {/* Upload de NF */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Nota Fiscal (opcional)</label>
                  <div
                    onDragOver={e => { e.preventDefault(); setAprovarDragging(true); }}
                    onDragLeave={() => setAprovarDragging(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setAprovarDragging(false);
                      const file = e.dataTransfer.files[0];
                      if (file) setAprovarNfFile(file);
                    }}
                    className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${aprovarDragging ? "border-blue-400 bg-blue-50" : "border-muted-foreground/30 hover:border-blue-300"}`}
                    onClick={() => document.getElementById("aprovar-nf-input")?.click()}
                  >
                    {aprovarNfFile ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-green-700">
                        <Paperclip className="h-4 w-4" />
                        <span className="font-medium break-all">{aprovarNfFile.name}</span>
                        <button type="button" className="text-red-500 hover:text-red-700 ml-1" onClick={e => { e.stopPropagation(); setAprovarNfFile(null); }}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-muted-foreground text-sm">
                        <Paperclip className="h-5 w-5 mx-auto mb-1 opacity-50" />
                        Clique ou arraste o arquivo da NF aqui
                        <div className="text-xs mt-0.5">PDF, JPG ou PNG</div>
                      </div>
                    )}
                  </div>
                  <input
                    id="aprovar-nf-input"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setAprovarNfFile(f); e.target.value = ""; }}
                  />
                </div>

                {/* Toggle financeiro */}
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div
                    onClick={() => setAprovarEnviarFin(v => !v)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${aprovarEnviarFin ? "bg-blue-600" : "bg-muted-foreground/30"}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${aprovarEnviarFin ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                  <span className="text-sm">Enviar automaticamente para <strong>Contas a Pagar</strong></span>
                </label>
                {aprovarEnviarFin && (
                  <p className="text-xs text-muted-foreground -mt-2">
                    O lançamento será criado (ou atualizado) no financeiro como <em>A Pagar</em>. A NF ficará disponível para consulta no Contas a Pagar.
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setShowAprovarDialog(false)}>
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    disabled={aprovarComNF.isPending}
                    onClick={async () => {
                      let nfBase64: string | undefined;
                      let nfNome: string | undefined;
                      if (aprovarNfFile) {
                        nfNome = aprovarNfFile.name;
                        nfBase64 = await new Promise<string>((res, rej) => {
                          const reader = new FileReader();
                          reader.onload = () => res((reader.result as string).split(",")[1]);
                          reader.onerror = rej;
                          reader.readAsDataURL(aprovarNfFile);
                        });
                      }
                      aprovarComNF.mutate({
                        id: aprovarTarget.id,
                        companyId,
                        nfBase64,
                        nfNome,
                        enviarFinanceiro: aprovarEnviarFin,
                      });
                    }}
                  >
                    {aprovarComNF.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Aprovando...</>
                    ) : (
                      <><ShieldCheck className="h-4 w-4 mr-2" />{aprovarEnviarFin ? "Aprovar e Enviar" : "Aprovar"}</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* FCSign — Envio para assinatura digital */}
        {fcSignPJContratoId != null && (
          <FCSignPJSendDialog
            open={fcSignPJContratoId != null}
            onOpenChange={(v) => { if (!v) setFcSignPJContratoId(null); }}
            contratoId={fcSignPJContratoId}
            geradoPor={user?.name || ""}
          />
        )}

        {/* FCSign — Aviso de Encerramento de Contrato PJ */}
        {avisoEncerramentoContratoId != null && (
          <FCSignAvisoEncerramentoPJDialog
            open={avisoEncerramentoContratoId != null}
            onOpenChange={(v) => { if (!v) setAvisoEncerramentoContratoId(null); }}
            contratoId={avisoEncerramentoContratoId}
            geradoPor={user?.name || ""}
          />
        )}
    </DashboardLayout>
  );
}

