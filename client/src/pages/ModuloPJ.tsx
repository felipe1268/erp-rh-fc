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
import FCSignPJSendDialog from "@/components/FCSignPJSendDialog";
import { formatCPF, formatMoeda, fmtNum, formatMoedaInput, parseMoedaBR } from "@/lib/formatters";
import { removeAccents } from "@/lib/searchUtils";
import {
  Briefcase, Plus, Search, DollarSign, AlertTriangle, FileText,
  Trash2, Eye, X, Clock, CheckCircle2, RefreshCw, Calendar, Pencil,
  Users, TrendingUp, FileSignature, Ban, Printer, Upload, FolderOpen,
  ExternalLink, File, XCircle, Award, Loader2, RotateCcw, Check,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PeriodSelectorCard, { MonthDotStatus } from "@/components/PeriodSelectorCard";

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
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const [tab, setTab] = useState("contratos");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ativo");
  const [showContratoDialog, setShowContratoDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showPagamentoDialog, setShowPagamentoDialog] = useState(false);
  const [selectedContrato, setSelectedContrato] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [editingContratoId, setEditingContratoId] = useState<number | null>(null);
  const [pagForm, setPagForm] = useState<any>({});
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [signContratoId, setSignContratoId] = useState<number | null>(null);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [uploadingAssinado, setUploadingAssinado] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [detailTab, setDetailTab] = useState("info");
  const [novoDocNome, setNovoDocNome] = useState("");
  const [novoDocTipo, setNovoDocTipo] = useState("outro");
  const [motivoAlteracao, setMotivoAlteracao] = useState("");
  const [createdContratoId, setCreatedContratoId] = useState<number | null>(null);
  const [showEditClausulas, setShowEditClausulas] = useState(false);
  const [editClausulasTexto, setEditClausulasTexto] = useState("");

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
    { companyId },
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
  const defaultFormaPgto = (criteriaData as any[]).find(c => c.chave === "terceiros_pj_forma_pagamento")?.valor || "PIX";
  const { data: empList = [] } = trpc.employees.list.useQuery({ companyId, companyIds, excludeTerminated: true }, { enabled: !!companyId || companyIds?.length > 0 });
  // IDs com contrato ativo — não podem aparecer para criação de novo contrato
  const empIdsComContratoAtivo = useMemo(
    () => new Set((contratos as any[]).filter(c => c.status === "ativo").map(c => c.employeeId)),
    [contratos]
  );
  const pjEmployees = useMemo(
    () => (empList as any[]).filter((e: any) => e.tipoContrato === "PJ" && e.status === "Ativo" && !e.deletedAt),
    [empList]
  );
  // Lista disponível para novo contrato: só quem não tem contrato ativo
  const pjEmployeesSemContrato = useMemo(
    () => pjEmployees.filter((e: any) => !empIdsComContratoAtivo.has(e.id)),
    [pjEmployees, empIdsComContratoAtivo]
  );
  // Rev. 4371: dots coloridos do PeriodSelectorCard por status do mês
  const monthStatus = useMemo((): Record<number, MonthDotStatus> => {
    const m: Record<number, MonthDotStatus> = {};
    for (const s of statusAnualData as any[]) m[s.mes] = s.status as MonthDotStatus;
    return m;
  }, [statusAnualData]);

  // Mutations
  const createContrato = trpc.pj.contratos.create.useMutation({
    onSuccess: (data: any) => { refetchContratos(); toast.success(`Contrato ${data.numeroContrato} criado!`); setCreatedContratoId(data.id); setForm({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateContrato = trpc.pj.contratos.update.useMutation({
    onSuccess: (data: any) => { refetchContratos(); toast.success(`Contrato atualizado! (Rev. ${data.revisao || '—'})`); setShowContratoDialog(false); setEditingContratoId(null); setForm({}); setMotivoAlteracao(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteContrato = trpc.pj.contratos.delete.useMutation({
    onSuccess: () => { refetchContratos(); toast.success("Contrato excluído!"); },
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
  const createPagamento = trpc.pj.pagamentos.create.useMutation({
    onSuccess: () => { refetchPagamentos(); toast.success("Lançamento criado!"); setShowPagamentoDialog(false); setPagForm({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const updatePagamento = trpc.pj.pagamentos.update.useMutation({
    onSuccess: () => { refetchPagamentos(); toast.success("Pagamento atualizado!"); },
  });
  const deletePagamento = trpc.pj.pagamentos.delete.useMutation({
    onSuccess: () => { refetchPagamentos(); toast.success("Lançamento excluído!"); },
  });

  const { data: modeloPadrao } = trpc.pj.modeloContrato.useQuery();
  const salvarClausulasMut = (trpc as any).pj.salvarClausulas.useMutation({
    onSuccess: () => {
      toast.success("Cláusulas salvas com sucesso!");
      setShowEditClausulas(false);
      refetchContratos();
      if (selectedContrato) {
        setSelectedContrato((prev: any) => ({ ...prev, clausulasCustomizadas: editClausulasTexto }));
      }
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar cláusulas"),
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
    onSuccess: () => { refetchDocs(); toast.success("Documento enviado!"); setUploadingDoc(false); setNovoDocNome(""); setNovoDocTipo("outro"); },
    onError: (e: any) => { toast.error(e.message); setUploadingDoc(false); },
  });

  const deleteDocPJ = trpc.pj.documentos.delete.useMutation({
    onSuccess: () => { refetchDocs(); toast.success("Documento removido!"); },
  });

  // Auto-fill: último contrato do prestador selecionado (para preencher CNPJ/Razão Social)
  const { data: lastContratoData } = trpc.pj.contratos.getLastByEmployee.useQuery(
    { employeeId: form.employeeId || 0, companyId },
    { enabled: !!form.employeeId && !editingContratoId && companyId > 0 }
  );
  useEffect(() => {
    if (!editingContratoId && form.employeeId && lastContratoData) {
      setForm((prev: any) => ({
        ...prev,
        cnpjPrestador: prev.cnpjPrestador || lastContratoData.cnpjPrestador || "",
        razaoSocialPrestador: prev.razaoSocialPrestador || lastContratoData.razaoSocialPrestador || "",
        objetoContrato: prev.objetoContrato || lastContratoData.objetoContrato || "",
      }));
    }
  }, [lastContratoData]);

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
    html += `<div class="resumo-box"><div class="resumo-label">Adiantamento (40%)</div><div class="resumo-valor">${fmt(relatorio.totais.adiantamento)}</div></div>`;
    html += `<div class="resumo-box"><div class="resumo-label">Fechamento (60%)</div><div class="resumo-valor">${fmt(relatorio.totais.fechamento)}</div></div>`;
    if (relatorio.totais.bonificacao > 0) html += `<div class="resumo-box"><div class="resumo-label">Bonificações</div><div class="resumo-valor">${fmt(relatorio.totais.bonificacao)}</div></div>`;
    html += `<div class="resumo-box" style="background:#1e3a5f;"><div class="resumo-label" style="color:#aaa;">TOTAL GERAL</div><div class="resumo-valor" style="color:white;font-size:20px;">${fmt(relatorio.totais.geral)}</div></div>`;
    html += `</div>`;
    
    // Detalhamento por prestador
    for (const p of relatorio.prestadores) {
      html += `<div class="prestador-header"><strong>${p.nome}</strong> — ${p.razaoSocial} • CNPJ: ${p.cnpj} • CPF: ${fmtCPF(p.cpf)} • Valor Mensal: ${fmt(parseFloat(p.valorMensal || "0"))}</div>`;
      html += `<table><thead><tr><th>Tipo</th><th>Descrição</th><th>Valor</th><th>Status</th><th>Dt. Pagamento</th></tr></thead><tbody>`;
      for (const pg of p.pagamentos) {
        const tipoLabel = pg.tipo === "adiantamento" ? "Adiantamento" : pg.tipo === "fechamento" ? "Fechamento" : "Bonificação";
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
    const totalValor = list.filter(c => c.status === "ativo").reduce((s, c) => s + parseFloat(c.valorMensal || "0"), 0);
    return {
      total: list.length,
      ativos: list.filter(c => c.status === "ativo").length,
      pendentes: list.filter(c => c.status === "pendente_assinatura").length,
      encerrados: list.filter(c => c.status === "encerrado").length,
      totalMensal: totalValor,
    };
  }, [contratos]);

  const openEditContrato = (c: any) => {
    setEditingContratoId(c.id);
    setMotivoAlteracao("");
    setCreatedContratoId(null);
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
    });
    setShowContratoDialog(true);
  };

  const handleSubmitContrato = () => {
    if (!form.dataInicio || !form.dataFim || !form.valorMensal) {
      toast.error("Preencha os campos obrigatórios");
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

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="cursor-pointer hover:shadow-md" onClick={() => setStatusFilter("todos")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Total Contratos</p>
              <p className="text-2xl font-bold">{fmtNum(stats.total)}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md border-l-4 border-l-green-500" onClick={() => setStatusFilter("ativo")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Ativos</p>
              <p className="text-2xl font-bold text-green-600">{fmtNum(stats.ativos)}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md border-l-4 border-l-amber-500" onClick={() => setStatusFilter("pendente_assinatura")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Pendentes</p>
              <p className="text-2xl font-bold text-amber-600">{fmtNum(stats.pendentes)}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md border-l-4 border-l-gray-500" onClick={() => setStatusFilter("encerrado")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Encerrados</p>
              <p className="text-2xl font-bold text-gray-600">{fmtNum(stats.encerrados)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Custo Mensal PJ</p>
              <p className="text-2xl font-bold text-purple-600">{formatMoeda(stats.totalMensal)}</p>
            </CardContent>
          </Card>
        </div>

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
                </SelectContent>
              </Select>
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
                        <th className="p-3 text-right font-medium">Valor Mensal</th>
                        <th className="p-3 text-center font-medium">Adiant./Fech.</th>
                        <th className="p-3 text-center font-medium">Status</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">Nenhum contrato encontrado</td></tr>
                      ) : filtered.map((c: any) => {
                        const st = STATUS_CONTRATO[c.status] || STATUS_CONTRATO.ativo;
                        return (
                          <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="p-3 font-mono text-xs font-semibold">{c.numeroContrato}</td>
                            <td className="p-3 text-center">
                              <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Rev.{c.revisao || '01'}</span>
                            </td>
                            <td className="p-3">
                              <div className="font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(c.employeeId)}>{c.employeeName}</div>
                              <div className="text-xs text-muted-foreground">{c.razaoSocialPrestador || c.employeeCargo}</div>
                            </td>
                            <td className="p-3 text-xs font-mono">{formatCNPJ(c.cnpjPrestador)}</td>
                            <td className="p-3 text-xs">{formatDate(c.dataInicio)} — {formatDate(c.dataFim)}</td>
                            <td className="p-3 text-right font-bold">{formatMoeda(c.valorMensal)}</td>
                            <td className="p-3 text-center text-xs">
                              <span className="text-amber-600">{c.percentualAdiantamento ?? 50}%</span>
                              <span className="mx-1">/</span>
                              <span className="text-green-600">{c.percentualFechamento ?? 50}%</span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Detalhes" onClick={() => { setSelectedContrato(c); setShowDetailDialog(true); }}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-500" title="Editar contrato" onClick={() => openEditContrato(c)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-purple-600" title="Visualizar / Imprimir Contrato" onClick={() => window.open(`/contrato-pj/${c.id}`, "_blank")}>
                                  <FileText className="h-3.5 w-3.5" />
                                </Button>
                                {c.status !== "encerrado" && c.status !== "cancelado" && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-indigo-600" title="Enviar para assinatura digital (link FCSign)" onClick={() => { setSignContratoId(c.id); setShowSignDialog(true); }}>
                                    <FileSignature className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {c.status === "pendente_assinatura" && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600" onClick={() => { updateContrato.mutate({ id: c.id, status: "ativo" }); }}>
                                    Ativar
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
              onAno={setPjAno}
              onMes={setPjMes}
              onAnoTodo={() => setPjMes(null)}
              monthStatus={monthStatus}
              showLegend
              className="mb-4"
            />
            <div className="flex gap-2 mb-4 flex-wrap">
              <Button variant="outline" onClick={() => gerarMensal.mutate({ companyId, companyIds })} disabled={gerarMensal.isPending} title="Sincroniza previsões de medições para todos os contratos PJ ativos (idempotente).">
                <RefreshCw className={`h-4 w-4 mr-2 ${gerarMensal.isPending ? "animate-spin" : ""}`} /> Sincronizar Previsões
              </Button>
              <Button onClick={() => { setPagForm({ mesReferencia: mesRefFallback }); setShowPagamentoDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Lançamento Manual
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
                    <p className="text-xs text-amber-600 uppercase font-semibold">Adiantamentos</p>
                    <p className="text-xl font-bold text-amber-700">
                      {formatMoeda((pagamentos as any[]).filter(p => p.tipo === "adiantamento").reduce((s: number, p: any) => s + parseFloat(p.valor || "0"), 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-green-600 uppercase font-semibold">Fechamentos</p>
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

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="p-3 text-left font-medium">Prestador</th>
                        <th className="p-3 text-left font-medium">Fornecedor cadastrado</th>
                        <th className="p-3 text-left font-medium">Tipo</th>
                        <th className="p-3 text-left font-medium">Descrição</th>
                        <th className="p-3 text-right font-medium">Valor</th>
                        <th className="p-3 text-left font-medium">Data</th>
                        <th className="p-3 text-left font-medium">Forma Pgto</th>
                        <th className="p-3 text-center font-medium">Status</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pagamentos as any[]).length === 0 ? (
                        <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">
                          Nenhuma medição para {pjMes != null ? mesRef : String(pjAno)}. Novos contratos já geram as previsões automaticamente — para contratos antigos use "Sincronizar Previsões".
                        </td></tr>
                      ) : (pagamentos as any[]).map((p: any) => {
                        const st = STATUS_PAGAMENTO[p.status] || STATUS_PAGAMENTO.pendente;
                        return (
                          <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="p-3 font-medium">{p.employeeName}</td>
                            <td className="p-3">
                              <FornecedorCadastroBadge status={p.fornecedorStatus} nome={p.fornecedorNome} cnpj={p.cnpjPrestador} />
                            </td>
                            <td className="p-3">
                              <Badge variant={p.tipo === "adiantamento" ? "secondary" : p.tipo === "bonificacao" ? "default" : "outline"}>
                                {p.tipo === "adiantamento" ? "Adiantamento" : p.tipo === "bonificacao" ? "Bonificação" : "Fechamento"}
                              </Badge>
                            </td>
                            <td className="p-3 text-xs">{p.descricao || "-"}</td>
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
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                {p.status === "pendente" && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600" onClick={() => updatePagamento.mutate({ id: p.id, status: "pago", dataPagamento: new Date().toISOString().split("T")[0] })}>
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Pagar
                                  </Button>
                                )}
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

              {/* Botão Gerar Contrato */}
              <div className="flex justify-end gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="gap-2 border-green-300 text-green-700 hover:bg-green-50" onClick={() => {
                  const textoAtual = selectedContrato?.clausulasCustomizadas || modeloPadrao?.modelo || "";
                  setEditClausulasTexto(textoAtual);
                  setShowEditClausulas(true);
                }}>
                  <Pencil className="h-4 w-4" /> Editar Cláusulas
                </Button>
                <Button variant="outline" size="sm" className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50" onClick={() => window.open(`/contrato-pj/${selectedContrato.id}`, "_blank")}>
                  <FileText className="h-4 w-4" /> Gerar / Imprimir Contrato
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => { setShowDetailDialog(false); openEditContrato(selectedContrato); }}>
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              </div>

              {/* Tabs */}
              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="info" className="flex-1">Informações</TabsTrigger>
                  <TabsTrigger value="assinatura" className="flex-1">Contrato Assinado</TabsTrigger>
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
                        <p className="text-xs text-muted-foreground">Adiantamento ({selectedContrato.percentualAdiantamento ?? 50}%) — Dia {selectedContrato.diaAdiantamento ?? 15}</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-green-600">
                          {formatMoeda(parseFloat(selectedContrato.valorMensal || "0") * (selectedContrato.percentualFechamento ?? 50) / 100)}
                        </p>
                        <p className="text-xs text-muted-foreground">Fechamento ({selectedContrato.percentualFechamento ?? 50}%) — Dia {selectedContrato.diaFechamento ?? 5}</p>
                      </div>
                    </div>
                  </div>
                  {selectedContrato.objetoContrato && (
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-xs text-blue-600 uppercase font-semibold">Objeto do Contrato</p>
                      <p className="text-sm mt-1">{selectedContrato.objetoContrato}</p>
                    </div>
                  )}
                  {selectedContrato.observacoes && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-600 uppercase font-semibold">Observações</p>
                      <p className="text-sm mt-1">{selectedContrato.observacoes}</p>
                    </div>
                  )}
                </TabsContent>

                {/* Aba Contrato Assinado */}
                <TabsContent value="assinatura" className="space-y-4 mt-4">
                  <div className="border rounded-lg p-5 space-y-4">
                    <div>
                      <p className="text-sm font-semibold mb-1">Contrato Assinado</p>
                      <p className="text-xs text-muted-foreground mb-3">Após assinar o contrato gerado, envie aqui o arquivo assinado (PDF, DOCX, imagem).</p>

                      {selectedContrato.contratoAssinadoUrl && (
                        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg mb-4">
                          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-green-800">Contrato assinado enviado</p>
                          </div>
                          <Button size="sm" variant="outline" className="gap-1.5 border-green-300 text-green-700 shrink-0" onClick={() => window.open(selectedContrato.contratoAssinadoUrl, "_blank")}>
                            <ExternalLink className="h-3.5 w-3.5" /> Visualizar
                          </Button>
                        </div>
                      )}

                      <label className="cursor-pointer">
                        <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingAssinado(true);
                          const reader = new FileReader();
                          reader.onload = () => {
                            const base64 = (reader.result as string).split(",")[1];
                            uploadContratoAssinado.mutate({
                              id: selectedContrato.id,
                              fileBase64: base64,
                              fileName: file.name,
                              tipoAssinatura: "digital",
                            });
                          };
                          reader.readAsDataURL(file);
                        }} />
                        <div className={`flex items-center justify-center gap-3 border-2 border-dashed rounded-lg p-6 transition-colors ${uploadingAssinado ? "border-blue-300 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer"}`}>
                          {uploadingAssinado ? (
                            <><RefreshCw className="h-5 w-5 animate-spin text-blue-500" /><span className="text-sm text-blue-600">Enviando...</span></>
                          ) : (
                            <><Upload className="h-5 w-5 text-gray-400" /><span className="text-sm text-gray-600">{selectedContrato.contratoAssinadoUrl ? "Substituir contrato assinado" : "Clique para enviar o contrato assinado"}</span></>
                          )}
                        </div>
                      </label>
                    </div>
                  </div>
                </TabsContent>

                {/* Aba Documentos */}
                <TabsContent value="documentos" className="space-y-4 mt-4">
                  <div className="border rounded-lg p-5 space-y-4">
                    <p className="text-sm font-semibold">Documentos do Prestador</p>
                    <p className="text-xs text-muted-foreground">Armazene aqui documentos relacionados ao prestador: RG, CPF, CNPJ, comprovante de endereço, DAS, NF, etc.</p>

                    {/* Upload novo documento */}
                    <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
                      <p className="text-xs font-medium uppercase text-muted-foreground">Novo Documento</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="Nome do documento" value={novoDocNome} onChange={e => setNovoDocNome(e.target.value)} className="text-sm" />
                        <Select value={novoDocTipo} onValueChange={setNovoDocTipo}>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
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
                          {uploadingDoc ? (
                            <><RefreshCw className="h-4 w-4 animate-spin text-blue-500" /><span className="text-xs text-blue-600">Enviando...</span></>
                          ) : (
                            <><Upload className="h-4 w-4 text-gray-400" /><span className="text-xs text-gray-600">{novoDocNome ? "Clique para selecionar o arquivo" : "Informe o nome do documento antes"}</span></>
                          )}
                        </div>
                      </label>
                    </div>

                    {/* Lista de documentos */}
                    {(pjDocs as any[]).length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        <File className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        Nenhum documento cadastrado
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(pjDocs as any[]).map((doc: any) => (
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
                  </div>
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

        {/* Create Contrato Dialog */}
        <FullScreenDialog open={showContratoDialog} onClose={() => { setShowContratoDialog(false); setEditingContratoId(null); setForm({}); setMotivoAlteracao(""); setCreatedContratoId(null); }} title={editingContratoId ? "Editar Contrato PJ" : "Novo Contrato PJ"} icon={<FileSignature className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-3xl mx-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium">Prestador *</label>
                {editingContratoId ? (
                  <div className="flex items-center border rounded-md px-3 py-2 bg-muted/30 text-sm text-foreground">
                    <span className="font-medium">{selectedEmp ? `${selectedEmp.nomeCompleto} — ${formatCPF(selectedEmp.cpf)}` : "—"}</span>
                    <span className="ml-2 text-xs text-muted-foreground">(não pode ser alterado)</span>
                  </div>
                ) : (
                <div className="relative" style={{ zIndex: 60 }}>
                  <div className="flex items-center border rounded-md px-3 py-2 bg-background cursor-pointer hover:bg-muted/30 relative" style={{ zIndex: 61 }} onClick={() => { if (!empDropdownOpen) setEmpDropdownOpen(true); }}>
                    <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
                    {empDropdownOpen ? (
                      <input autoFocus className="flex-1 bg-transparent outline-none text-sm" placeholder="Digite nome, CPF ou código (JFC)..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setEmpDropdownOpen(false); setEmpSearch(''); } }} onClick={e => e.stopPropagation()} />
                    ) : (
                      <span className={`flex-1 text-sm ${selectedEmp ? "text-foreground" : "text-muted-foreground"}`}>
                        {selectedEmp ? `${selectedEmp.nomeCompleto} - ${formatCPF(selectedEmp.cpf)}` : "Selecione um prestador..."}
                      </span>
                    )}
                    {form.employeeId && (
                      <button type="button" className="ml-2 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); setForm({ ...form, employeeId: undefined }); setEmpSearch(""); setEmpDropdownOpen(false); }}>
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {empDropdownOpen && (
                    <>
                      <div className="fixed inset-0" style={{ zIndex: 55 }} onClick={() => { setEmpDropdownOpen(false); setEmpSearch(""); }} />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-xl max-h-64 overflow-y-auto" style={{ zIndex: 62 }}>
                        {filteredEmps.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">
                            {pjEmployees.length === 0
                              ? "Nenhum prestador cadastrado"
                              : pjEmployeesSemContrato.length === 0
                                ? "Todos os prestadores PJ já possuem contrato ativo"
                                : `Nenhum resultado para "${empSearch}"`}
                          </div>
                        ) : filteredEmps.slice(0, 20).map((e: any) => (
                          <div key={e.id} className="px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm flex justify-between" onClick={() => { setForm({ ...form, employeeId: e.id }); setEmpDropdownOpen(false); setEmpSearch(""); }}>
                            <span className="font-medium">{e.nomeCompleto}</span>
                            <span className="text-muted-foreground">
                              {e.codigoInterno && <span className="text-blue-600 font-medium mr-2">{e.codigoInterno}</span>}
                              {formatCPF(e.cpf)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">CNPJ do Prestador</label>
                <Input value={form.cnpjPrestador || ""} onChange={e => setForm({ ...form, cnpjPrestador: e.target.value })} placeholder="00.000.000/0000-00" />
              </div>
              <div>
                <label className="text-sm font-medium">Razão Social do Prestador</label>
                <Input value={form.razaoSocialPrestador || ""} onChange={e => setForm({ ...form, razaoSocialPrestador: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data Início *</label>
                <Input type="date" value={form.dataInicio || ""} onChange={e => setForm({ ...form, dataInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data Fim *</label>
                <Input type="date" value={form.dataFim || ""} onChange={e => setForm({ ...form, dataFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Valor Mensal (R$) *</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.valorMensal ? formatMoedaInput(String(parseFloat(form.valorMensal) || "").replace(".", ",")) : ""}
                  onChange={e => {
                    const fmt = formatMoedaInput(e.target.value);
                    const raw = parseMoedaBR(fmt);
                    setForm({ ...form, valorMensal: raw > 0 ? String(raw) : "" });
                  }}
                  placeholder="0,00"
                />
              </div>
              {/* Renovação automática foi removida: contratos PJ são sempre
                  vigentes pelo período definido (sem renovação automática).
                  As medições previstas para toda a vigência são geradas
                  automaticamente na criação do contrato. */}

              <div className="col-span-2 bg-purple-50 rounded-lg p-4">
                <p className="text-sm font-semibold text-purple-800 mb-3">Regra de Pagamento (Folha PJ)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-medium">% Adiantamento</label>
                    <Input type="number" min={0} max={100} value={form.percentualAdiantamento ?? ""} placeholder="50"
                      onChange={e => { const v = parseInt(e.target.value); setForm({ ...form, percentualAdiantamento: isNaN(v) ? undefined : v }); }} />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Dia Adiantamento</label>
                    <Input type="number" min={1} max={31} value={form.diaAdiantamento ?? ""} placeholder="15"
                      onChange={e => { const v = parseInt(e.target.value); setForm({ ...form, diaAdiantamento: isNaN(v) ? undefined : v }); }} />
                  </div>
                  <div>
                    <label className="text-xs font-medium">% Fechamento</label>
                    <Input type="number" min={0} max={100} value={form.percentualFechamento ?? ""} placeholder="50"
                      onChange={e => { const v = parseInt(e.target.value); setForm({ ...form, percentualFechamento: isNaN(v) ? undefined : v }); }} />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Dia Fechamento</label>
                    <Input type="number" min={1} max={31} value={form.diaFechamento ?? ""} placeholder="5"
                      onChange={e => { const v = parseInt(e.target.value); setForm({ ...form, diaFechamento: isNaN(v) ? undefined : v }); }} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium">Forma de Pagamento</label>
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
                </div>
                {form.valorMensal && (
                  <div className="mt-3 text-xs text-purple-700 flex gap-4 flex-wrap">
                    <span>Adiantamento: <strong>{formatMoeda(parseFloat(form.valorMensal) * (form.percentualAdiantamento ?? 50) / 100)}</strong> — dia {form.diaAdiantamento ?? 15}</span>
                    <span>Fechamento: <strong>{formatMoeda(parseFloat(form.valorMensal) * (form.percentualFechamento ?? 50) / 100)}</strong> — dia {form.diaFechamento ?? 5} (mês seguinte)</span>
                  </div>
                )}
              </div>

              <div className="col-span-2">
                <label className="text-sm font-medium">Objeto do Contrato</label>
                <Textarea value={form.objetoContrato || ""} onChange={e => setForm({ ...form, objetoContrato: e.target.value })} rows={2} placeholder="Descreva o objeto do contrato..." />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Observações</label>
                <Textarea value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} />
              </div>

              {/* Dados Bancários do Prestador */}
              <div className="col-span-2 bg-blue-50 rounded-lg p-4">
                <p className="text-sm font-semibold text-blue-800 mb-3">Dados Bancários da Contratada (para pagamento)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium">Banco</label>
                    <Input value={form.bancoPrestador || ""} onChange={e => setForm({ ...form, bancoPrestador: e.target.value })} placeholder="Ex: Banco do Brasil, Itaú..." />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Agência</label>
                    <Input value={form.agenciaPrestador || ""} onChange={e => setForm({ ...form, agenciaPrestador: e.target.value })} placeholder="0000-0" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Conta Corrente</label>
                    <Input value={form.contaPrestador || ""} onChange={e => setForm({ ...form, contaPrestador: e.target.value })} placeholder="00000-0" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Chave PIX</label>
                    <Input value={form.pixPrestador || ""} onChange={e => setForm({ ...form, pixPrestador: e.target.value })} placeholder="CNPJ, e-mail, celular ou chave aleatória" />
                  </div>
                </div>
              </div>

              {/* Campo Motivo da Alteração (somente ao editar) */}
              {editingContratoId && (
                <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <label className="text-sm font-medium text-amber-800">Motivo da Alteração (Revisão ISO)</label>
                  <p className="text-xs text-amber-600 mb-2">Descreva o motivo desta alteração. Ao salvar, uma nova revisão será gerada automaticamente.</p>
                  <Input
                    value={motivoAlteracao}
                    onChange={e => setMotivoAlteracao(e.target.value)}
                    placeholder="Ex: Reajuste de valor mensal, correção de data de vencimento..."
                    className="bg-white"
                  />
                </div>
              )}
            </div>

            {/* Banner pós-criação: botão Gerar Contrato */}
            {createdContratoId && !editingContratoId && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Contrato criado com sucesso!
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">Visualize, imprima e assine o contrato gerado. Depois, envie o arquivo assinado pelo botão "Detalhes".</p>
                </div>
                <Button variant="default" className="shrink-0 bg-green-700 hover:bg-green-800" onClick={() => window.open(`/contrato-pj/${createdContratoId}`, "_blank")}>
                  <FileText className="h-4 w-4 mr-2" /> Gerar / Imprimir Contrato
                </Button>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowContratoDialog(false); setEditingContratoId(null); setForm({}); setMotivoAlteracao(""); setCreatedContratoId(null); }}>
                {createdContratoId ? "Fechar" : "Cancelar"}
              </Button>
              {!createdContratoId && (
                <Button onClick={handleSubmitContrato} disabled={createContrato.isPending || updateContrato.isPending}>
                  {createContrato.isPending || updateContrato.isPending
                    ? "Salvando..."
                    : editingContratoId ? "Salvar Alterações" : "Criar Contrato"}
                </Button>
              )}
            </div>
          </div>
        </FullScreenDialog>

        {/* Create Pagamento Dialog */}
        <FullScreenDialog open={showPagamentoDialog} onClose={() => { setShowPagamentoDialog(false); setPagForm({}); }} title="Lançamento Manual PJ" icon={<DollarSign className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-2xl mx-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium">Contrato *</label>
                <Select value={String(pagForm.contractId || "")} onValueChange={v => {
                  const c = (contratos as any[]).find(c => c.id === parseInt(v));
                  setPagForm({ ...pagForm, contractId: parseInt(v), employeeId: c?.employeeId });
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione um contrato" /></SelectTrigger>
                  <SelectContent>
                    {(contratos as any[]).filter(c => c.status === "ativo").map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.numeroContrato} — {c.employeeName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Mês Referência *</label>
                <Input type="month" value={pagForm.mesReferencia || mesRefFallback} onChange={e => setPagForm({ ...pagForm, mesReferencia: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Tipo *</label>
                <Select value={pagForm.tipo || ""} onValueChange={v => setPagForm({ ...pagForm, tipo: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adiantamento">Adiantamento</SelectItem>
                    <SelectItem value="fechamento">Fechamento</SelectItem>
                    <SelectItem value="bonificacao">Bonificação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Valor (R$) *</label>
                <Input type="number" step="0.01" value={pagForm.valor || ""} onChange={e => setPagForm({ ...pagForm, valor: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data Prevista</label>
                <Input type="date" value={pagForm.dataPrevista || ""} onChange={e => setPagForm({ ...pagForm, dataPrevista: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Forma de Pagamento</label>
                <Select value={pagForm.formaPagamento || ""} onValueChange={v => setPagForm({ ...pagForm, formaPagamento: v || undefined })}>
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
              <div className="col-span-2">
                <label className="text-sm font-medium">Descrição</label>
                <Input value={pagForm.descricao || ""} onChange={e => setPagForm({ ...pagForm, descricao: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowPagamentoDialog(false); setPagForm({}); }}>Cancelar</Button>
              <Button onClick={() => {
                if (!pagForm.contractId || !pagForm.tipo || !pagForm.valor) { toast.error("Preencha os campos obrigatórios"); return; }
                createPagamento.mutate({ companyId, companyIds, ...pagForm });
              }} disabled={createPagamento.isPending}>
                {createPagamento.isPending ? "Salvando..." : "Criar Lançamento"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      </div>

      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />

      {signContratoId != null && (
        <FCSignPJSendDialog
          open={showSignDialog}
          onOpenChange={(v) => { setShowSignDialog(v); if (!v) setSignContratoId(null); }}
          contratoId={signContratoId}
          geradoPor={user?.name || undefined}
        />
      )}

      {/* DIALOG EDITAR CLÁUSULAS */}
      <Dialog open={showEditClausulas} onOpenChange={setShowEditClausulas}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] flex flex-col" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-gray-900">
              <Pencil className="h-5 w-5 text-green-600" />
              Editar Cláusulas — Contrato {selectedContrato?.numeroContrato}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 overflow-y-auto min-h-0">
            <div className="rounded-lg border-2 border-green-200 bg-green-50 p-3">
              <p className="text-sm text-green-800">
                Edite o texto das cláusulas diretamente abaixo. Placeholders como <code className="bg-green-100 px-1 rounded">[VALOR_MENSAL]</code>, <code className="bg-green-100 px-1 rounded">[DATA_INICIO]</code> etc. são substituídos automaticamente ao visualizar/imprimir.
              </p>
            </div>
            {selectedContrato?.clausulasCustomizadas && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setEditClausulasTexto(modeloPadrao?.modelo || "")}
                  className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 hover:underline"
                >
                  <RotateCcw className="h-3 w-3" /> Restaurar modelo padrão
                </button>
              </div>
            )}
            <textarea
              value={editClausulasTexto}
              onChange={e => setEditClausulasTexto(e.target.value)}
              rows={22}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-y"
              placeholder="Cole ou edite o texto das cláusulas aqui..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 shrink-0">
            <Button variant="outline" onClick={() => setShowEditClausulas(false)} className="text-gray-600">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const textoFinal = editClausulasTexto.trim();
                if (!textoFinal) { toast.error("O texto das cláusulas não pode ser vazio."); return; }
                salvarClausulasMut.mutate({
                  contractId: selectedContrato?.id,
                  companyId,
                  clausulasTexto: textoFinal,
                });
              }}
              disabled={salvarClausulasMut.isPending}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              {salvarClausulasMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                : <><Check className="h-4 w-4" /> Salvar Cláusulas</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
