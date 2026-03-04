import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { formatBRL } from "@/lib/formatBRL";
import {
  Upload, CalendarDays, DollarSign, CreditCard, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle, FileText, Users, Lock, Unlock, Search,
  Eye, Trash2, RefreshCw, ArrowLeft, XCircle, Info, Building2,
  FileSpreadsheet, AlertCircle, ShieldCheck, Clock, TrendingUp,
  Filter, Briefcase, BarChart3, ChevronDown, ChevronUp, Lightbulb, Wrench, ArrowRight, MapPin, Scale,
  HardHat, Ban, User, CheckCircle2, Calculator, Zap, Moon, FileCheck
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import FullScreenDialog from "@/components/FullScreenDialog";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { Textarea } from "@/components/ui/textarea";

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function formatMesAno(mesAno: string): string {
  const [ano, mes] = mesAno.split("-");
  return `${MESES[parseInt(mes, 10) - 1]} ${ano}`;
}

// formatBRL imported from @/lib/formatBRL

function parseBRLNum(val: string | number | null | undefined): number {
  if (!val && val !== 0) return 0;
  if (typeof val === "number") return val;
  const str = String(val).replace(/[R$\s]/g, "").trim();
  if (!str) return 0;
  if (str.includes(",")) {
    return parseFloat(str.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return parseFloat(str) || 0;
}

type ViewMode = "resumo" | "detalhes" | "custos_obra" | "horas_extras" | "verificacao" | "descontos_clt" | "cruzamento_he" | "descontos_epi" | "calculo_vale" | "calculo_pagamento" | "alertas_afericao";

export default function FolhaPagamento() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "admin_master";
  const isMaster = user?.role === "admin_master";
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const now = new Date();
  const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());
  const [mesSelecionado, setMesSelecionado] = useState(now.getMonth() + 1);
  const mesAno = `${anoSelecionado}-${String(mesSelecionado).padStart(2, "0")}`;

  // Upload refs (direto no seletor de arquivos)
  const valeInputRef = useRef<HTMLInputElement>(null);
  const pagInputRef = useRef<HTMLInputElement>(null);
  const decimo1InputRef = useRef<HTMLInputElement>(null);
  const decimo2InputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<"vale" | "pagamento" | "decimo_terceiro_1" | "decimo_terceiro_2" | null>(null);
  const [showConferencia, setShowConferencia] = useState(false);

  // Views
  const [viewMode, setViewMode] = useState<ViewMode>("resumo");
  const [viewLancId, setViewLancId] = useState<number | null>(null);
  const [viewTipo, setViewTipo] = useState<string>("");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterFuncao, setFilterFuncao] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [verificacaoFilter, setVerificacaoFilter] = useState<string>("all");
  // Vinculação manual de obra
  const [selectedSemObra, setSelectedSemObra] = useState<Set<number>>(new Set());
  const [vinculacaoObraId, setVinculacaoObraId] = useState<number | null>(null);
  const [vinculacaoJustificativa, setVinculacaoJustificativa] = useState("");
  const [showVinculacaoPanel, setShowVinculacaoPanel] = useState(false);
  const [heObraFilter, setHeObraFilter] = useState<string>("all");

  // ===== QUERIES =====
  const statusMes = trpc.folha.statusMes.useQuery({ companyId, mesReferencia: mesAno }, { enabled: companyId > 0 });
  const mesesComLanc = trpc.folha.listarMesesComLancamentos.useQuery({ companyId, ano: anoSelecionado }, { enabled: companyId > 0 });
  const lancamentos = trpc.folha.listarLancamentos.useQuery({ companyId, mesReferencia: mesAno }, { enabled: companyId > 0 });
  const itensDetail = trpc.folha.listarItens.useQuery(
    { folhaLancamentoId: viewLancId! },
    { enabled: !!viewLancId && (viewMode === "detalhes" || viewMode === "verificacao"), refetchOnWindowFocus: true }
  );
  const verificacao = trpc.folha.verificacaoCruzada.useQuery(
    { folhaLancamentoId: viewLancId!, companyId, mesReferencia: mesAno },
    { enabled: !!viewLancId && viewMode === "verificacao", refetchOnWindowFocus: true }
  );
  const custosPorObra = trpc.folha.custosPorObra.useQuery(
    { folhaLancamentoId: viewLancId!, companyId, mesReferencia: mesAno },
    { enabled: !!viewLancId && companyId > 0 && viewMode === "custos_obra" }
  );
  const horasExtras = trpc.folha.horasExtrasPorFuncionario.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 && viewMode === "horas_extras" }
  );
  const obrasListQuery = trpc.folha.listarVinculacoesManuais.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 && viewMode === "custos_obra" }
  );
  // Lista de obras para o select de vinculação
  const obrasParaSelect = useMemo(() => {
    if (!custosPorObra.data) return [];
    return custosPorObra.data.obrasResumo.map((o: any) => ({ id: o.obraId, nome: o.obraNome }));
  }, [custosPorObra.data]);

  // ===== PAYROLL ENGINE (Cálculo Interno) =====
  const payrollPeriod = trpc.payrollEngine.getPeriod.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 }
  );
  const [valeResult, setValeResult] = useState<any>(null);
  const [pagamentoResult, setPagamentoResult] = useState<any>(null);
  const [afericaoResult, setAfericaoResult] = useState<any>(null);

  const gerarValeMut = trpc.payrollEngine.gerarVale.useMutation({
    onSuccess: (data) => {
      setValeResult(data);
      setViewMode("calculo_vale");
      toast.success(data.message);
      payrollPeriod.refetch();
    },
    onError: (err) => toast.error(`Erro ao calcular vale: ${err.message}`),
  });
  const simularPagamentoMut = trpc.payrollEngine.simularPagamento.useMutation({
    onSuccess: (data) => {
      setPagamentoResult(data);
      setViewMode("calculo_pagamento");
      toast.success(data.message);
      payrollPeriod.refetch();
    },
    onError: (err) => toast.error(`Erro ao simular pagamento: ${err.message}`),
  });
  const afericaoMut = trpc.payrollEngine.realizarAfericao.useMutation({
    onSuccess: (data) => {
      setAfericaoResult(data);
      if ((data.semRegistro || 0) > 0) {
        toast.warning(`Aferição concluída com ${data.semRegistro} dia(s) sem registro de ponto. Decida se foi erro do relógio ou falta real.`);
        setViewMode("alertas_afericao");
      } else {
        toast.success(data.message);
      }
      payrollPeriod.refetch();
    },
    onError: (err) => toast.error(`Erro na aferição: ${err.message}`),
  });
  const alertasAfericao = trpc.payrollEngine.listarAlertasAfericao.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: !!companyId && !!mesAno }
  );
  const decidirAfericaoMut = trpc.payrollEngine.decidirAfericao.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      alertasAfericao.refetch();
      payrollPeriod.refetch();
    },
    onError: (err) => toast.error(`Erro na decisão: ${err.message}`),
  });
  const decidirValeMut = trpc.payrollEngine.decidirVale.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      // Recalculate vale to refresh the view
      gerarValeMut.mutate({ companyId, mesReferencia: mesAno });
    },
    onError: (err) => toast.error(`Erro ao registrar decisão: ${err.message}`),
  });

  // ===== MUTATIONS =====
  const importarAutoMut = trpc.folha.importarFolhaAuto.useMutation({
    onSuccess: (data) => {
      const parts = [
        `${data.totalFuncionarios} funcionários processados`,
        `${data.match.matched} vinculados`,
        data.match.unmatched > 0 ? `${data.match.unmatched} não encontrados` : null,
        data.match.divergentes > 0 ? `${data.match.divergentes} com divergências` : null,
        data.match.codigosAtualizados > 0 ? `${data.match.codigosAtualizados} códigos cadastrados` : null,
      ].filter(Boolean);

      // Alerta de redirecionamento de mês
      if (data.mesRedirecionado && data.alertaMes) {
        toast.warning(
          <div>
            <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Mês Redirecionado</p>
            <p className="text-sm mt-1">{data.alertaMes}</p>
          </div>,
          { duration: 15000 }
        );
        // Navegar para o mês correto
        if (data.mesDetectado) {
          const [ano, mes] = data.mesDetectado.split("-");
          setAnoSelecionado(parseInt(ano, 10));
          setMesSelecionado(parseInt(mes, 10));
        }
      }

      toast.success(
        <div>
          <p className="font-medium">{parts.join(" | ")}</p>
          <p className="text-xs mt-1 opacity-80">Arquivos: {data.arquivosProcessados.map((f: any) => `${f.tipo}: ${f.registros}`).join(", ")}</p>
        </div>,
        { duration: 8000 }
      );
      statusMes.refetch();
      lancamentos.refetch();
      mesesComLanc.refetch();
      setUploading(null);
    },
    onError: (err) => {
      toast.error(`Erro na importação: ${err.message}`);
      setUploading(null);
    },
  });

  const reprocessarMut = trpc.folha.reprocessarMatch.useMutation({
    onSuccess: (data) => {
      const parts = [
        `Re-match: ${data.matched} vinculados`,
        data.unmatched > 0 ? `${data.unmatched} não encontrados` : null,
        data.divergentes > 0 ? `${data.divergentes} divergentes` : null,
        data.codigosAtualizados > 0 ? `${data.codigosAtualizados} códigos atualizados` : null,
      ].filter(Boolean);
      toast.success(parts.join(" | "), { duration: 6000 });
      itensDetail.refetch();
      statusMes.refetch();
      lancamentos.refetch();
    },
  });

  // ===== ESTADO DO DIALOG DE INCONSISTÊNCIAS =====
  const [showInconsistDialog, setShowInconsistDialog] = useState(false);
  const [inconsistDialogData, setInconsistDialogData] = useState<{message: string, lancId: number} | null>(null);

  const [conferenciaDialog, setConferenciaDialog] = useState<{ show: boolean; lancId: number; message: string }>({ show: false, lancId: 0, message: "" });
  const consolidarMut = trpc.folha.consolidarLancamento.useMutation({
    onSuccess: (data) => {
      if (data.alertaConferencia) {
        // Modo "recomendada" - mostrar dialog para o usuário decidir
        setConferenciaDialog({ show: true, lancId: (consolidarMut.variables as any)?.folhaLancamentoId || 0, message: data.message || "Conferência com contabilidade recomendada." });
      } else {
        toast.success("Lançamento consolidado!"); statusMes.refetch(); lancamentos.refetch(); mesesComLanc.refetch();
      }
    },
    onError: (err) => {
      if (err.message.includes('Consolidação bloqueada') || err.message.includes('inconsistência')) {
        setInconsistDialogData({ message: err.message, lancId: 0 });
        setShowInconsistDialog(true);
      } else if (err.message.includes('sem obra vinculada')) {
        setInconsistDialogData({ message: err.message, lancId: 0 });
        setShowInconsistDialog(true);
      } else if (err.message.includes('OBRIGATÓRIA')) {
        setInconsistDialogData({ message: err.message, lancId: 0 });
        setShowInconsistDialog(true);
      } else {
        toast.error(err.message);
      }
    },
  });
  const desconsolidarMut = trpc.folha.desconsolidarLancamento.useMutation({
    onSuccess: () => { toast.success("Lançamento desconsolidado!"); statusMes.refetch(); lancamentos.refetch(); mesesComLanc.refetch(); },
  });
  const excluirMut = trpc.folha.excluirLancamento.useMutation({
    onSuccess: () => { toast.success("Lançamento excluído!"); statusMes.refetch(); lancamentos.refetch(); mesesComLanc.refetch(); setViewMode("resumo"); },
  });

  const exportarCustosObraMut = trpc.folha.exportarCustosObra.useMutation({
    onSuccess: (data) => {
      if (!data.base64) { toast.error("Nenhum dado para exportar"); return; }
      const byteCharacters = atob(data.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = data.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel exportado com sucesso!");
    },
    onError: (err) => toast.error(`Erro ao exportar: ${err.message}`),
  });

  const vincularObraMut = trpc.folha.vincularObrasManualmente.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.vinculados} funcionário(s) vinculado(s) com sucesso!`);
      custosPorObra.refetch();
      obrasListQuery.refetch();
      setSelectedSemObra(new Set());
      setVinculacaoObraId(null);
      setVinculacaoJustificativa("");
      setShowVinculacaoPanel(false);
    },
    onError: (err) => toast.error(`Erro ao vincular: ${err.message}`),
  });

  const handleVincularObra = () => {
    if (selectedSemObra.size === 0) return toast.error("Selecione pelo menos um funcionário");
    if (!vinculacaoObraId) return toast.error("Selecione uma obra");
    if (vinculacaoJustificativa.trim().length < 5) return toast.error("Justificativa deve ter pelo menos 5 caracteres");
    vincularObraMut.mutate({
      companyId,
      mesReferencia: mesAno,
      obraId: vinculacaoObraId,
      justificativa: vinculacaoJustificativa.trim(),
      employeeIds: Array.from(selectedSemObra),
      atribuidoPor: user?.name || undefined,
    });
  };

  // ===== HANDLERS =====
  const handleFileSelect = useCallback(async (files: FileList | null, tipo: "vale" | "pagamento" | "decimo_terceiro_1" | "decimo_terceiro_2") => {
    if (!files || files.length === 0) return;
    setUploading(tipo);

    const arquivos: Array<{ fileName: string; fileBase64: string; mimeType: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });
      arquivos.push({ fileName: file.name, fileBase64: base64, mimeType: file.type || "application/pdf" });
    }

    importarAutoMut.mutate({
      companyId,
      mesReferencia: mesAno,
      tipoLancamento: tipo,
      arquivos,
    });

    // Reset input
    if (tipo === "vale" && valeInputRef.current) valeInputRef.current.value = "";
    if (tipo === "pagamento" && pagInputRef.current) pagInputRef.current.value = "";
    if (tipo === "decimo_terceiro_1" && decimo1InputRef.current) decimo1InputRef.current.value = "";
    if (tipo === "decimo_terceiro_2" && decimo2InputRef.current) decimo2InputRef.current.value = "";
  }, [companyId, mesAno, importarAutoMut]);

  function openView(mode: ViewMode, lancId?: number, tipo?: string) {
    setViewMode(mode);
    if (lancId) setViewLancId(lancId);
    if (tipo) setViewTipo(tipo);
    setSearchTerm("");
    setFilterStatus("all");
    setFilterFuncao("all");
    setExpandedRows(new Set());
  }

  function toggleRow(id: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function getMonthStatus(mes: number): "sem_dados" | "parcial" | "completo" | "consolidado" {
    const mesRef = `${anoSelecionado}-${String(mes).padStart(2, "0")}`;
    const info = mesesComLanc.data?.[mesRef];
    if (!info) return "sem_dados";
    if (info.vale === "consolidado" && info.pagamento === "consolidado") return "consolidado";
    if (info.vale || info.pagamento) return "completo";
    return "parcial";
  }

  // Filter itens
  const filteredItens = useMemo(() => {
    if (!itensDetail.data) return [];
    let items = [...itensDetail.data];
    if (searchTerm) {
      const term = searchTerm.toUpperCase();
      items = items.filter((i: any) =>
        i.nomeColaborador.toUpperCase().includes(term) ||
        (i.codigoContabil && i.codigoContabil.includes(term)) ||
        (i.funcao && i.funcao.toUpperCase().includes(term))
      );
    }
    if (filterStatus !== "all") items = items.filter((i: any) => i.matchStatus === filterStatus);
    if (filterFuncao !== "all") items = items.filter((i: any) => (i.funcao || "").toUpperCase() === filterFuncao);
    return items;
  }, [itensDetail.data, searchTerm, filterStatus, filterFuncao]);

  // Unique funcoes for filter
  const funcoes = useMemo(() => {
    if (!itensDetail.data) return [];
    const set = new Set<string>();
    itensDetail.data.forEach((i: any) => { if (i.funcao) set.add(i.funcao.toUpperCase()); });
    return Array.from(set).sort();
  }, [itensDetail.data]);

  const vale = statusMes.data?.vale;
  const pagamento = statusMes.data?.pagamento;
  const decimoTerceiro1 = statusMes.data?.decimoTerceiro1;
  const decimoTerceiro2 = statusMes.data?.decimoTerceiro2;
  const isNovembro = mesSelecionado === 11;
  const isDezembro = mesSelecionado === 12;

  // Hidden file inputs for direct upload
  const fileInputs = (
    <>
      <input ref={valeInputRef} type="file" accept=".pdf" multiple className="sr-only"
        onChange={e => handleFileSelect(e.target.files, "vale")} />
      <input ref={pagInputRef} type="file" accept=".pdf" multiple className="sr-only"
        onChange={e => handleFileSelect(e.target.files, "pagamento")} />
      <input ref={decimo1InputRef} type="file" accept=".pdf" multiple className="sr-only"
        onChange={e => handleFileSelect(e.target.files, "decimo_terceiro_1")} />
      <input ref={decimo2InputRef} type="file" accept=".pdf" multiple className="sr-only"
        onChange={e => handleFileSelect(e.target.files, "decimo_terceiro_2")} />
    </>
  );

  // ===== SUB-VIEWS =====
  if (viewMode === "detalhes" && viewLancId) {
    return (
      <DashboardLayout>
      <PrintHeader />
        {fileInputs}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-lg sm:text-xl font-bold">Detalhes — {viewTipo}</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">{formatMesAno(mesAno)} | {filteredItens.length} funcionários</p>
              </div>
            </div>
            <PrintActions title={`Folha de Pagamento - ${viewTipo} - ${formatMesAno(mesAno)}`} />
          </div>

          {/* Stats bar — clicável como filtro */}
          {itensDetail.data && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total", value: itensDetail.data.length, filter: "all", bg: "bg-blue-50", bgActive: "bg-blue-200 ring-2 ring-blue-500", text: "text-blue-700" },
                { label: "Vinculados", value: itensDetail.data.filter((i: any) => i.matchStatus === "matched").length, filter: "matched", bg: "bg-green-50", bgActive: "bg-green-200 ring-2 ring-green-500", text: "text-green-700" },
                { label: "Divergentes", value: itensDetail.data.filter((i: any) => i.matchStatus === "divergente").length, filter: "divergente", bg: "bg-amber-50", bgActive: "bg-amber-200 ring-2 ring-amber-500", text: "text-amber-700" },
                { label: "Não Encontrados", value: itensDetail.data.filter((i: any) => i.matchStatus === "unmatched").length, filter: "unmatched", bg: "bg-red-50", bgActive: "bg-red-200 ring-2 ring-red-500", text: "text-red-700" },
              ].map(c => (
                <button key={c.label} onClick={() => setFilterStatus(filterStatus === c.filter ? "all" : c.filter)}
                  className={`rounded-lg p-3 text-center cursor-pointer transition-all hover:scale-105 hover:shadow-md border-0 ${filterStatus === c.filter ? c.bgActive : c.bg}`}>
                  <p className={`text-xl font-bold ${c.text}`}>{c.value}</p>
                  <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="text" placeholder="Buscar nome, código ou função..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-background" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="all">Todos os Status</option>
              <option value="matched">Vinculados</option>
              <option value="divergente">Divergentes</option>
              <option value="unmatched">Não Encontrados</option>
            </select>
            <select value={filterFuncao} onChange={e => setFilterFuncao(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-background max-w-[200px]">
              <option value="all">Todas as Funções</option>
              {funcoes.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={() => { itensDetail.refetch(); verificacao.refetch(); toast.info("Dados atualizados!"); }}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${itensDetail.isFetching ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button size="sm" variant="outline" onClick={() => reprocessarMut.mutate({ folhaLancamentoId: viewLancId, companyId })}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${reprocessarMut.isPending ? "animate-spin" : ""}`} /> Re-Match
            </Button>
          </div>

          {/* Table */}
          {itensDetail.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left bg-muted/50">
                        <th className="p-2.5 font-medium w-8"></th>
                        <th className="p-2.5 font-medium">Cód.</th>
                        <th className="p-2.5 font-medium">Colaborador</th>
                        <th className="p-2.5 font-medium">Função</th>
                        <th className="p-2.5 font-medium text-center">Status</th>
                        <th className="p-2.5 font-medium text-right">Proventos</th>
                        <th className="p-2.5 font-medium text-right">Descontos</th>
                        <th className="p-2.5 font-medium text-right">Líquido</th>
                        <th className="p-2.5 font-medium">Divergências</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItens.map((item: any) => {
                        const divergencias = item.divergencias ? (typeof item.divergencias === "string" ? JSON.parse(item.divergencias) : item.divergencias) : [];
                        const isExpanded = expandedRows.has(item.id);
                        const proventos = item.proventos ? (typeof item.proventos === "string" ? JSON.parse(item.proventos) : item.proventos) : [];
                        const descontos = item.descontos ? (typeof item.descontos === "string" ? JSON.parse(item.descontos) : item.descontos) : [];
                        return (
                          <tr key={item.id} className="contents">
                            <tr className={`border-b hover:bg-muted/30 cursor-pointer ${
                              item.matchStatus === "unmatched" ? "bg-red-50/50" :
                              item.matchStatus === "divergente" ? "bg-amber-50/50" : ""
                            }`} onClick={() => toggleRow(item.id)}>
                              <td className="p-2.5">
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                              </td>
                              <td className="p-2.5 font-mono text-xs">{item.codigoContabil || "—"}</td>
                              <td className="p-2.5 font-medium text-sm">{item.nomeColaborador}</td>
                              <td className="p-2.5 text-xs text-muted-foreground">{item.funcao || "—"}</td>
                              <td className="p-2.5 text-center">
                                {item.matchStatus === "matched" && <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />}
                                {item.matchStatus === "divergente" && <AlertTriangle className="h-4 w-4 text-amber-600 mx-auto" />}
                                {item.matchStatus === "unmatched" && <XCircle className="h-4 w-4 text-red-600 mx-auto" />}
                              </td>
                              <td className="p-2.5 text-right text-sm">{formatBRL(item.totalProventos)}</td>
                              <td className="p-2.5 text-right text-sm text-red-600">{formatBRL(item.totalDescontos)}</td>
                              <td className="p-2.5 text-right font-bold text-sm">{formatBRL(item.liquido)}</td>
                              <td className="p-2.5">
                                {divergencias.length > 0 ? (
                                  <Badge variant="outline" className="border-red-300 text-red-700 text-xs">{divergencias.length} alerta{divergencias.length > 1 ? "s" : ""}</Badge>
                                ) : item.matchStatus === "unmatched" ? (
                                  <Badge variant="outline" className="border-red-300 text-red-700 text-xs">Não encontrado</Badge>
                                ) : null}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-muted/20 border-b">
                                <td colSpan={9} className="p-4">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Proventos */}
                                    <div>
                                      <h4 className="font-semibold text-xs text-green-700 mb-2 flex items-center gap-1">
                                        <TrendingUp className="h-3.5 w-3.5" /> Proventos
                                      </h4>
                                      {proventos.length > 0 ? proventos.map((p: any, i: number) => (
                                        <div key={i} className="flex justify-between text-xs py-0.5">
                                          <span className="text-muted-foreground">{p.descricao}</span>
                                          <span className="font-medium">{formatBRL(p.valor)}</span>
                                        </div>
                                      )) : <p className="text-xs text-muted-foreground">—</p>}
                                      <div className="border-t mt-1 pt-1 flex justify-between text-xs font-bold">
                                        <span>Total</span>
                                        <span className="text-green-700">{formatBRL(item.totalProventos)}</span>
                                      </div>
                                    </div>
                                    {/* Descontos */}
                                    <div>
                                      <h4 className="font-semibold text-xs text-red-700 mb-2 flex items-center gap-1">
                                        <AlertCircle className="h-3.5 w-3.5" /> Descontos
                                      </h4>
                                      {descontos.length > 0 ? descontos.map((d: any, i: number) => (
                                        <div key={i} className="flex justify-between text-xs py-0.5">
                                          <span className="text-muted-foreground">{d.descricao}</span>
                                          <span className="font-medium text-red-600">{formatBRL(d.valor)}</span>
                                        </div>
                                      )) : <p className="text-xs text-muted-foreground">—</p>}
                                      <div className="border-t mt-1 pt-1 flex justify-between text-xs font-bold">
                                        <span>Total</span>
                                        <span className="text-red-700">{formatBRL(item.totalDescontos)}</span>
                                      </div>
                                    </div>
                                    {/* Info */}
                                    <div>
                                      <h4 className="font-semibold text-xs text-blue-700 mb-2 flex items-center gap-1">
                                        <Info className="h-3.5 w-3.5" /> Informações
                                      </h4>
                                      <div className="space-y-1 text-xs">
                                        <div className="flex justify-between"><span className="text-muted-foreground">Admissão</span><span>{item.dataAdmissao || "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">Salário Base</span><span>{item.salarioBase ? formatBRL(item.salarioBase) : "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">Horas Mensais</span><span>{item.horasMensais || "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">INSS</span><span>{item.valorInss ? formatBRL(item.valorInss) : "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">FGTS</span><span>{item.valorFgts ? formatBRL(item.valorFgts) : "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">IRRF</span><span>{item.valorIrrf ? formatBRL(item.valorIrrf) : "—"}</span></div>
                                      </div>
                                      {divergencias.length > 0 && (
                                        <div className="mt-2 pt-2 border-t">
                                          <h5 className="text-xs font-semibold text-red-700 mb-1">Divergências:</h5>
                                          {divergencias.map((d: string, i: number) => (
                                            <p key={i} className="text-xs text-red-600">{d}</p>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredItens.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">Nenhum item encontrado.</div>
                  )}
                </div>
                {/* Rodapé somatório dinâmico */}
                {filteredItens.length > 0 && (() => {
                  const totalProventos = filteredItens.reduce((s: number, i: any) => s + parseBRLNum(i.totalProventos), 0);
                  const totalDescontos = filteredItens.reduce((s: number, i: any) => s + parseBRLNum(i.totalDescontos), 0);
                  const totalLiquido = filteredItens.reduce((s: number, i: any) => s + parseBRLNum(i.liquido), 0);
                  return (
                    <div className="border-t-2 border-[#1B2A4A] bg-[#1B2A4A]/5 p-4 rounded-b-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#1B2A4A]">TOTAL ({filteredItens.length} funcionários)</span>
                        </div>
                        <div className="flex items-center gap-8">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Proventos</p>
                            <p className="text-sm font-bold text-green-700">{formatBRL(totalProventos)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Descontos</p>
                            <p className="text-sm font-bold text-red-600">{formatBRL(totalDescontos)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Líquido</p>
                            <p className="text-lg font-black text-[#1B2A4A]">{formatBRL(totalLiquido)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </div>
      </DashboardLayout>
    );
  }

  if (viewMode === "custos_obra") {
    return (
      <DashboardLayout>
      <PrintHeader />
        {fileInputs}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-[#1B2A4A]" /> Custos por Obra — {viewTipo === "vale" ? "Vale" : "Pagamento"}
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">{formatMesAno(mesAno)} | Distribuição proporcional</p>
              </div>
            </div>
            <PrintActions title={`Custos por Obra — ${viewTipo === "vale" ? "Vale" : "Pagamento"} — ${formatMesAno(mesAno)}`} showExcel onExportExcel={() => {
              if (!viewLancId) return;
              exportarCustosObraMut.mutate({
                folhaLancamentoId: viewLancId,
                companyId,
                mesReferencia: mesAno,
                tipo: viewTipo,
              });
            }} />
          </div>

          {custosPorObra.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Calculando custos por obra...</div>
          ) : custosPorObra.data && (custosPorObra.data.obrasResumo.length > 0 || custosPorObra.data.semObra) ? (
            <>
              {/* Summary cards */}
              {(() => {
                const rg = (custosPorObra.data as any).resumoGlobal;
                const comp = (custosPorObra.data as any).comparativos;
                const allObras = [...custosPorObra.data.obrasResumo, ...(custosPorObra.data.semObra ? [custosPorObra.data.semObra] : [])];
                const totalFuncs = rg?.totalFuncionarios ?? allObras.reduce((s: number, o: any) => s + (o.funcionarios?.length || 0), 0);
                const totalHN = rg?.totalHorasNormais ?? allObras.reduce((s: number, o: any) => s + (o.totalHoras || 0), 0);
                const totalHE = rg?.totalHorasExtras ?? allObras.reduce((s: number, o: any) => s + (o.totalHE || 0), 0);
                const pctHN = rg?.pctHorasNormais ?? 0;
                const pctHE = rg?.pctHorasExtras ?? 0;
                const VariacaoTag = ({ valor }: { valor: number }) => {
                  if (valor === 0) return <span className="text-xs text-gray-400">—</span>;
                  const isUp = valor > 0;
                  return <span className={`text-xs font-semibold ${isUp ? "text-red-600" : "text-green-600"}`}>{isUp ? "▲" : "▼"} {Math.abs(valor).toFixed(1)}%</span>;
                };
                const mesAnteriorLabel = comp?.mesAnterior?.label ? formatMesAno(comp.mesAnterior.label) : "Mês anterior";
                const anoAnteriorLabel = comp?.anoAnterior?.label ? formatMesAno(comp.anoAnterior.label) : "Ano anterior";
                return (
                  <div className="space-y-3">
                    {/* Cards principais */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className="bg-blue-50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-blue-700">{custosPorObra.data.obrasResumo.length}</p>
                        <p className="text-xs text-muted-foreground">Obras</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-green-700">{formatBRL(custosPorObra.data.totalGeral)}</p>
                        <p className="text-xs text-muted-foreground">Custo Total</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-purple-700">{totalFuncs}</p>
                        <p className="text-xs text-muted-foreground">Funcionários</p>
                      </div>
                      <div className="bg-sky-50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-sky-700">{totalHN.toFixed(1)}h</p>
                        <p className="text-xs text-muted-foreground">Horas Normais <span className="font-semibold">({pctHN}%)</span></p>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-amber-700">{totalHE.toFixed(1)}h</p>
                        <p className="text-xs text-muted-foreground">Horas Extras <span className="font-semibold">({pctHE}%)</span></p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-gray-700">{(totalHN + totalHE).toFixed(1)}h</p>
                        <p className="text-xs text-muted-foreground">Total Horas</p>
                      </div>
                    </div>

                    {/* Comparativos */}
                    {comp && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Mês anterior */}
                        <div className="border rounded-lg p-3 bg-white">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Comparativo com {mesAnteriorLabel}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-sm font-bold">Custo</p>
                              <VariacaoTag valor={comp.mesAnterior.variacaoCusto} />
                              {comp.mesAnterior.custoTotal > 0 && <p className="text-[10px] text-muted-foreground">{formatBRL(String(comp.mesAnterior.custoTotal.toFixed(2)).replace(".", ","))}</p>}
                            </div>
                            <div>
                              <p className="text-sm font-bold">H. Normais</p>
                              <VariacaoTag valor={comp.mesAnterior.variacaoHorasNormais} />
                              {comp.mesAnterior.horasNormais > 0 && <p className="text-[10px] text-muted-foreground">{comp.mesAnterior.horasNormais}h</p>}
                            </div>
                            <div>
                              <p className="text-sm font-bold">H. Extras</p>
                              <VariacaoTag valor={comp.mesAnterior.variacaoHE} />
                              {comp.mesAnterior.horasExtras > 0 && <p className="text-[10px] text-muted-foreground">{comp.mesAnterior.horasExtras}h</p>}
                            </div>
                          </div>
                        </div>
                        {/* Ano anterior */}
                        <div className="border rounded-lg p-3 bg-white">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Comparativo com {anoAnteriorLabel}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-sm font-bold">Custo</p>
                              <VariacaoTag valor={comp.anoAnterior.variacaoCusto} />
                              {comp.anoAnterior.custoTotal > 0 && <p className="text-[10px] text-muted-foreground">{formatBRL(String(comp.anoAnterior.custoTotal.toFixed(2)).replace(".", ","))}</p>}
                            </div>
                            <div>
                              <p className="text-sm font-bold">H. Normais</p>
                              <VariacaoTag valor={comp.anoAnterior.variacaoHorasNormais} />
                              {comp.anoAnterior.horasNormais > 0 && <p className="text-[10px] text-muted-foreground">{comp.anoAnterior.horasNormais}h</p>}
                            </div>
                            <div>
                              <p className="text-sm font-bold">H. Extras</p>
                              <VariacaoTag valor={comp.anoAnterior.variacaoHE} />
                              {comp.anoAnterior.horasExtras > 0 && <p className="text-[10px] text-muted-foreground">{comp.anoAnterior.horasExtras}h</p>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Obra cards */}
              <div className="space-y-3">
                {/* Obras com funcionários */}
                {custosPorObra.data.obrasResumo.map((obra: any) => (
                  <Card key={obra.obraId} className="border-l-4 border-l-[#1B2A4A]">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-base">{obra.obraNome}</h3>
                          <p className="text-xs text-muted-foreground">{obra.funcionarios?.length || 0} funcionários | {(obra.totalHoras || 0).toFixed(1)}h trabalhadas | {(obra.totalHE || 0).toFixed(1)}h extras</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-[#1B2A4A]">{formatBRL(obra.totalCusto)}</p>
                          <p className="text-xs text-muted-foreground">
                            {((parseBRLNum(obra.totalCusto) / Math.max(parseBRLNum(custosPorObra.data.totalGeral), 0.01)) * 100).toFixed(1)}% do total
                          </p>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-[#1B2A4A] h-2 rounded-full" style={{
                          width: `${Math.min(100, (parseBRLNum(obra.totalCusto) / Math.max(parseBRLNum(custosPorObra.data.totalGeral), 0.01)) * 100)}%`
                        }} />
                      </div>
                      {obra.funcionarios && obra.funcionarios.length > 0 && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b text-left">
                                <th className="pb-1 font-medium">Funcionário</th>
                                <th className="pb-1 font-medium">Função</th>
                                <th className="pb-1 font-medium text-right">Horas Trab.</th>
                                <th className="pb-1 font-medium text-right">Horas Extras</th>
                                <th className="pb-1 font-medium text-right">% Aloc.</th>
                                <th className="pb-1 font-medium text-right">Custo Alocado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {obra.funcionarios.map((f: any) => (
                                <tr key={f.id} className="border-b last:border-0">
                                  <td className="py-1.5 font-medium">{f.nome}</td>
                                  <td className="py-1.5 text-muted-foreground">{f.funcao || "—"}</td>
                                  <td className="py-1.5 text-right">{(f.horas || 0).toFixed(1)}h</td>
                                  <td className="py-1.5 text-right">{(f.horasExtras || 0) > 0 ? <span className="text-amber-600 font-medium">{f.horasExtras.toFixed(1)}h</span> : "—"}</td>
                                  <td className="py-1.5 text-right">{f.percentual != null ? <span className="text-blue-600 font-medium">{f.percentual.toFixed(1)}%</span> : "100%"}</td>
                                  <td className="py-1.5 text-right font-bold">{formatBRL(f.custoEstimado)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {/* Seção Sem Obra Vinculada - com vinculação manual */}
                {custosPorObra.data.semObra && (custosPorObra.data.semObra as any).funcionarios?.length > 0 && ((() => {
                  const semObraData = custosPorObra.data.semObra as any;
                  return (
                  <Card className="border-l-4 border-l-amber-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-base flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Sem Obra Vinculada
                          </h3>
                          <p className="text-xs text-muted-foreground">{semObraData.funcionarios.length} funcionários | {(semObraData.totalHoras || 0).toFixed(1)}h trabalhadas</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {!showVinculacaoPanel && (
                            <Button size="sm" variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50" onClick={() => setShowVinculacaoPanel(true)}>
                              <Briefcase className="w-3.5 h-3.5 mr-1" /> Vincular Obra
                            </Button>
                          )}
                          <div className="text-right">
                            <p className="text-xl font-bold text-amber-600">{formatBRL(semObraData.totalCusto)}</p>
                            <p className="text-xs text-muted-foreground">
                              {((parseBRLNum(semObraData.totalCusto) / Math.max(parseBRLNum(custosPorObra.data.totalGeral), 0.01)) * 100).toFixed(1)}% do total
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Painel de vinculação em lote */}
                      {showVinculacaoPanel && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-3">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-semibold text-sm flex items-center gap-1.5">
                              <Briefcase className="w-4 h-4 text-amber-600" />
                              Vincular Funcionários Selecionados a uma Obra
                            </h4>
                            <Button size="sm" variant="ghost" onClick={() => { setShowVinculacaoPanel(false); setSelectedSemObra(new Set()); }}>
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Obra destino *</label>
                              <select
                                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                                value={vinculacaoObraId || ""}
                                onChange={(e) => setVinculacaoObraId(e.target.value ? parseInt(e.target.value) : null)}
                              >
                                <option value="">Selecione a obra...</option>
                                {obrasParaSelect.map((o: any) => (
                                  <option key={o.id} value={o.id}>{o.nome}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Justificativa * (min. 5 caracteres)</label>
                              <input
                                type="text"
                                className="w-full border rounded-md px-3 py-2 text-sm"
                                placeholder="Ex: Funcionário sem ponto no período..."
                                value={vinculacaoJustificativa}
                                onChange={(e) => setVinculacaoJustificativa(e.target.value)}
                              />
                            </div>
                            <div className="flex items-end">
                              <Button
                                size="sm"
                                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                                onClick={handleVincularObra}
                                disabled={vincularObraMut.isPending || selectedSemObra.size === 0}
                              >
                                {vincularObraMut.isPending ? "Vinculando..." : `Vincular ${selectedSemObra.size} selecionado(s)`}
                              </Button>
                            </div>
                          </div>
                          {selectedSemObra.size === 0 && (
                            <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                              <Info className="w-3 h-3" /> Marque os funcionários na tabela abaixo para vinculá-los.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Progress bar */}
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-amber-500 h-2 rounded-full" style={{
                          width: `${Math.min(100, (parseBRLNum(semObraData.totalCusto) / Math.max(parseBRLNum(custosPorObra.data.totalGeral), 0.01)) * 100)}%`
                        }} />
                      </div>

                      {/* Tabela com checkboxes */}
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left">
                              {showVinculacaoPanel && (
                                <th className="pb-1 w-8">
                                  <input
                                    type="checkbox"
                                    className="rounded"
                                    checked={selectedSemObra.size === semObraData.funcionarios.length && semObraData.funcionarios.length > 0}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedSemObra(new Set(semObraData.funcionarios.map((f: any) => f.id)));
                                      } else {
                                        setSelectedSemObra(new Set());
                                      }
                                    }}
                                  />
                                </th>
                              )}
                              <th className="pb-1 font-medium">Funcionário</th>
                              <th className="pb-1 font-medium">Função</th>
                              <th className="pb-1 font-medium text-right">Horas Trab.</th>
                              <th className="pb-1 font-medium text-right">Horas Extras</th>
                              <th className="pb-1 font-medium text-right">% Aloc.</th>
                              <th className="pb-1 font-medium text-right">Custo Alocado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {semObraData.funcionarios.map((f: any) => (
                              <tr key={f.id} className={`border-b last:border-0 ${showVinculacaoPanel ? "cursor-pointer hover:bg-amber-50/50" : ""} ${selectedSemObra.has(f.id) ? "bg-amber-100/50" : ""}`}
                                onClick={() => {
                                  if (!showVinculacaoPanel) return;
                                  setSelectedSemObra(prev => {
                                    const next = new Set(prev);
                                    if (next.has(f.id)) next.delete(f.id); else next.add(f.id);
                                    return next;
                                  });
                                }}
                              >
                                {showVinculacaoPanel && (
                                  <td className="py-1.5 w-8">
                                    <input type="checkbox" className="rounded" checked={selectedSemObra.has(f.id)} readOnly />
                                  </td>
                                )}
                                <td className="py-1.5 font-medium">{f.nome}</td>
                                <td className="py-1.5 text-muted-foreground">{f.funcao || "—"}</td>
                                <td className="py-1.5 text-right">{(f.horas || 0).toFixed(1)}h</td>
                                <td className="py-1.5 text-right">{(f.horasExtras || 0) > 0 ? <span className="text-amber-600 font-medium">{f.horasExtras.toFixed(1)}h</span> : "—"}</td>
                                <td className="py-1.5 text-right">{f.percentual != null ? <span className="text-blue-600 font-medium">{f.percentual.toFixed(1)}%</span> : "100%"}</td>
                                <td className="py-1.5 text-right font-bold">{formatBRL(f.custoEstimado)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })())}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum dado de custos por obra disponível.</p>
              <p className="text-xs text-muted-foreground mt-1">É necessário ter o controle de ponto importado e a folha de pagamento processada.</p>
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  if (viewMode === "horas_extras") {
    return (
      <DashboardLayout>
      <PrintHeader />
        {fileInputs}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-600" /> Horas Extras — {formatMesAno(mesAno)}
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">Análise detalhada de horas extras por funcionário e por obra</p>
              </div>
            </div>
            <PrintActions title={`Horas Extras - ${formatMesAno(mesAno)}`} />
          </div>

          {horasExtras.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Calculando horas extras...</div>
          ) : horasExtras.data ? (
            <>
              {/* Resumo Consolidado */}
              {(() => {
                const funcs = horasExtras.data.funcionarios || [];
                const totalHE = funcs.reduce((s: number, f: any) => s + f.totalHE, 0);
                const totalHE50 = funcs.reduce((s: number, f: any) => s + f.he50, 0);
                const totalHE100 = funcs.reduce((s: number, f: any) => s + f.he100, 0);
                const totalValor = funcs.reduce((s: number, f: any) => s + (f.valorEstimado || 0), 0);
                const totalFuncs = funcs.length;
                const totalObras = horasExtras.data.rankingObras?.length || 0;
                return (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <Card className="border-l-4 border-l-amber-500">
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Total HE</p>
                        <p className="text-xl font-black text-amber-700">{totalHE.toFixed(1)}h</p>
                      </CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-blue-500">
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">HE 50%</p>
                        <p className="text-xl font-black text-blue-700">{totalHE50.toFixed(1)}h</p>
                      </CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-red-500">
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">HE 100%</p>
                        <p className="text-xl font-black text-red-700">{totalHE100.toFixed(1)}h</p>
                      </CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-green-500">
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Custo Estimado</p>
                        <p className="text-xl font-black text-green-700">{formatBRL(totalValor)}</p>
                      </CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-slate-500">
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Funcionários / Obras</p>
                        <p className="text-xl font-black">{totalFuncs} <span className="text-sm font-normal text-muted-foreground">/ {totalObras} obras</span></p>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* Ranking de Obras */}
              {horasExtras.data.rankingObras && horasExtras.data.rankingObras.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-amber-600" /> Ranking de Obras — Horas Extras
                    </h3>
                    <div className="space-y-2">
                      {horasExtras.data.rankingObras.map((obra: any, idx: number) => {
                        const obraKey = obra.obraId ? String(obra.obraId) : "sem";
                        const isActive = heObraFilter === obraKey;
                        return (
                          <button key={obraKey}
                            onClick={() => setHeObraFilter(isActive ? "all" : obraKey)}
                            className={`flex items-center gap-3 w-full text-left rounded-lg p-2 transition-all cursor-pointer ${
                              isActive ? "bg-amber-100 ring-2 ring-amber-500 shadow-sm" : "hover:bg-muted/50"
                            }`}>
                            <span className={`font-bold text-lg w-8 text-center ${idx === 0 ? "text-amber-600" : idx === 1 ? "text-gray-500" : idx === 2 ? "text-orange-700" : "text-muted-foreground"}`}>
                              {idx + 1}º
                            </span>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-sm">{obra.obraNome || "Sem Obra"}</span>
                                <span className="font-bold text-amber-700">{obra.totalHE.toFixed(1)}h</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div className="bg-amber-500 h-2 rounded-full" style={{
                                  width: `${Math.min(100, (obra.totalHE / (horasExtras.data.rankingObras[0]?.totalHE || 1)) * 100)}%`
                                }} />
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{obra.totalHE.toFixed(1)}h extras</p>
                            </div>
                          </button>
                        );
                      })}
                      {heObraFilter !== "all" && (
                        <button onClick={() => setHeObraFilter("all")} className="text-xs text-amber-700 underline mt-1 cursor-pointer">
                          Limpar filtro
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tabela de funcionários */}
              {horasExtras.data.funcionarios && horasExtras.data.funcionarios.length > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <div className="p-4 border-b">
                      <h3 className="font-bold text-sm flex items-center gap-2">
                        <Users className="h-4 w-4" /> Funcionários com Horas Extras
                        {heObraFilter !== "all" && <Badge variant="outline" className="ml-2 text-amber-700 border-amber-300">Filtrado por obra</Badge>}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {(() => {
                          const filtered = heObraFilter === "all" ? horasExtras.data.funcionarios : horasExtras.data.funcionarios.filter((f: any) => {
                            if (heObraFilter === "sem") return !f.obraId;
                            return String(f.obraId) === heObraFilter;
                          });
                          return `${filtered.length} funcionário${filtered.length !== 1 ? "s" : ""}`;
                        })()}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left bg-muted/50">
                            <th className="p-2.5 font-medium">Funcionário</th>
                            <th className="p-2.5 font-medium">Função</th>
                            <th className="p-2.5 font-medium">Obra</th>
                            <th className="p-2.5 font-medium text-right">HE 50%</th>
                            <th className="p-2.5 font-medium text-right">HE 100%</th>
                            <th className="p-2.5 font-medium text-right">Total HE</th>
                            <th className="p-2.5 font-medium text-right">Valor Est.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const funcs = heObraFilter === "all" ? horasExtras.data.funcionarios : horasExtras.data.funcionarios.filter((f: any) => {
                              if (heObraFilter === "sem") return !f.obraId;
                              return String(f.obraId) === heObraFilter;
                            });
                            return funcs.map((f: any) => (
                              <tr key={f.employeeId} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="p-2.5 font-medium">{f.nome}</td>
                                <td className="p-2.5 text-xs text-muted-foreground">{f.funcao || "—"}</td>
                                <td className="p-2.5 text-xs">{f.obraNome || "—"}</td>
                                <td className="p-2.5 text-right">{f.he50 > 0 ? `${f.he50.toFixed(1)}h` : "—"}</td>
                                <td className="p-2.5 text-right">{f.he100 > 0 ? `${f.he100.toFixed(1)}h` : "—"}</td>
                                <td className="p-2.5 text-right font-bold text-amber-700">{f.totalHE.toFixed(1)}h</td>
                                <td className="p-2.5 text-right font-bold">{formatBRL(f.valorEstimado)}</td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                      {/* Rodapé somatório HE */}
                      {horasExtras.data.funcionarios.length > 0 && (() => {
                        const funcs = heObraFilter === "all" ? horasExtras.data.funcionarios : horasExtras.data.funcionarios.filter((f: any) => {
                          if (heObraFilter === "sem") return !f.obraId;
                          return String(f.obraId) === heObraFilter;
                        });
                        const totalHE = funcs.reduce((s: number, f: any) => s + f.totalHE, 0);
                        const totalValor = funcs.reduce((s: number, f: any) => s + (f.valorEstimado || 0), 0);
                        return (
                          <div className="border-t-2 border-amber-600 bg-amber-50 p-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-amber-800">TOTAL ({funcs.length} funcionários)</span>
                              <div className="flex items-center gap-8">
                                <div className="text-right">
                                  <p className="text-xs text-muted-foreground">Total HE</p>
                                  <p className="text-sm font-bold text-amber-700">{totalHE.toFixed(1)}h</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-muted-foreground">Valor Estimado</p>
                                  <p className="text-lg font-black text-amber-800">{formatBRL(totalValor)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              )}

              {(!horasExtras.data.funcionarios || horasExtras.data.funcionarios.length === 0) && (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhuma hora extra registrada neste período.</p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </DashboardLayout>
    );
  }

  if (viewMode === "verificacao" && viewLancId) {
    return (
      <DashboardLayout>
      <PrintHeader />
        {fileInputs}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-green-700" /> Verificação Cruzada
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">{formatMesAno(mesAno)} | Folha × Ponto × Cadastro</p>
              </div>
            </div>
            <PrintActions title={`Verificação Cruzada - ${formatMesAno(mesAno)}`} />
          </div>

          {verificacao.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Processando verificação cruzada...</div>
          ) : verificacao.data ? (
            <>
              {(() => {
                const comPonto = verificacao.data.verificacoes.filter((v: any) => v.ponto).length;
                const semPonto = verificacao.data.verificacoes.filter((v: any) => !v.ponto).length;
                const ok = verificacao.data.totalItens - verificacao.data.totalAlertas;
                const cards = [
                  { key: "all", label: "Total na Folha", value: verificacao.data.totalItens, bg: "bg-blue-50", bgActive: "bg-blue-200 ring-2 ring-blue-500", text: "text-blue-700" },
                  { key: "ok", label: "OK", value: ok, bg: "bg-green-50", bgActive: "bg-green-200 ring-2 ring-green-500", text: "text-green-700" },
                  { key: "alertas", label: "Com Alertas", value: verificacao.data.totalAlertas, bg: verificacao.data.totalAlertas > 0 ? "bg-red-50" : "bg-green-50", bgActive: "bg-red-200 ring-2 ring-red-500", text: verificacao.data.totalAlertas > 0 ? "text-red-600" : "text-green-600" },
                  { key: "comPonto", label: "Com Ponto", value: comPonto, bg: "bg-purple-50", bgActive: "bg-purple-200 ring-2 ring-purple-500", text: "text-purple-700" },
                  { key: "semPonto", label: "Sem Ponto", value: semPonto, bg: "bg-gray-50", bgActive: "bg-gray-300 ring-2 ring-gray-500", text: "text-gray-700" },
                ];
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {cards.map(c => (
                      <button key={c.key} onClick={() => setVerificacaoFilter(verificacaoFilter === c.key ? "all" : c.key)}
                        className={`rounded-lg p-3 text-center cursor-pointer transition-all hover:scale-105 hover:shadow-md border-0 ${verificacaoFilter === c.key && c.key !== "all" ? c.bgActive : c.bg}`}>
                        <p className={`text-xl font-bold ${c.text}`}>{c.value}</p>
                        <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
                      </button>
                    ))}
                  </div>
                );
              })()}

              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left bg-muted/50">
                          <th className="p-2.5 font-medium">Cód.</th>
                          <th className="p-2.5 font-medium">Colaborador</th>
                          <th className="p-2.5 font-medium">Função</th>
                          <th className="p-2.5 font-medium text-center">Match</th>
                          <th className="p-2.5 font-medium text-right">Líquido</th>
                          <th className="p-2.5 font-medium">Sal. Folha</th>
                          <th className="p-2.5 font-medium">Sal. Cadastro</th>
                          <th className="p-2.5 font-medium">Ponto</th>
                          <th className="p-2.5 font-medium">Alertas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verificacao.data.verificacoes.filter((v: any) => {
                          if (verificacaoFilter === "all") return true;
                          if (verificacaoFilter === "ok") return v.alertas.length === 0;
                          if (verificacaoFilter === "alertas") return v.alertas.length > 0;
                          if (verificacaoFilter === "comPonto") return !!v.ponto;
                          if (verificacaoFilter === "semPonto") return !v.ponto;
                          return true;
                        }).map((v: any) => (
                          <tr key={v.id} className={`border-b last:border-0 hover:bg-muted/30 ${v.alertas.length > 0 ? "bg-red-50/30" : ""}`}>
                            <td className="p-2.5 font-mono text-xs">{v.codigo || "—"}</td>
                            <td className="p-2.5 font-medium">{v.nome}</td>
                            <td className="p-2.5 text-xs text-muted-foreground">{v.funcao || "—"}</td>
                            <td className="p-2.5 text-center">
                              {v.matchStatus === "matched" && <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />}
                              {v.matchStatus === "divergente" && <AlertTriangle className="h-4 w-4 text-amber-600 mx-auto" />}
                              {v.matchStatus === "unmatched" && <XCircle className="h-4 w-4 text-red-600 mx-auto" />}
                            </td>
                            <td className="p-2.5 text-right font-bold">{formatBRL(v.liquido)}</td>
                            <td className="p-2.5">{v.salarioFolha ? formatBRL(v.salarioFolha) : "—"}</td>
                            <td className="p-2.5">{v.salarioCadastro ? formatBRL(v.salarioCadastro) : "—"}</td>
                            <td className="p-2.5 text-xs">
                              {v.ponto ? (
                                <span>{v.ponto.diasTrabalhados}d / {v.ponto.totalHoras}h{v.ponto.faltas > 0 && <span className="text-red-600 ml-1">({v.ponto.faltas} faltas)</span>}</span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="p-2.5">
                              {v.alertas.length > 0 ? (
                                <div className="space-y-0.5">
                                  {v.alertas.map((a: string, i: number) => (
                                    <p key={i} className="text-xs text-red-600">{a}</p>
                                  ))}
                                </div>
                              ) : <CheckCircle className="h-4 w-4 text-green-500" />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">Nenhum dado disponível.</div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ===== DESCONTOS EPI VIEW =====
  if (viewMode === "descontos_epi") {
    return (
      <DashboardLayout>
        <PrintHeader />
        {fileInputs}
        <DescontosEPIView companyId={companyId} mesAno={mesAno} onBack={() => setViewMode("resumo")} />
      </DashboardLayout>
    );
  }

  // ===== DESCONTOS CLT VIEW =====
  if (viewMode === "descontos_clt" && viewLancId) {
    return (
      <DashboardLayout>
        <PrintHeader />
        {fileInputs}
        <DescontosCLTView companyId={companyId} mesAno={mesAno} lancamentoId={viewLancId} onBack={() => setViewMode("resumo")} />
      </DashboardLayout>
    );
  }

  // ===== CRUZAMENTO HE VIEW =====
  if (viewMode === "cruzamento_he" && viewLancId) {
    return (
      <DashboardLayout>
        <PrintHeader />
        {fileInputs}
        <CruzamentoHEView companyId={companyId} mesAno={mesAno} lancamentoId={viewLancId} onBack={() => setViewMode("resumo")} />
      </DashboardLayout>
    );
  }

  // ===== CÁLCULO VALE VIEW =====
  if (viewMode === "calculo_vale" && valeResult) {
    const funcionariosComAlerta = valeResult.funcionarios?.filter((f: any) => f.temAlerta) || [];
    const funcionariosSemAlerta = valeResult.funcionarios?.filter((f: any) => !f.temAlerta) || [];
    const totalSemAlerta = funcionariosSemAlerta.reduce((s: number, f: any) => s + (f.valorTotalVale || 0), 0);
    const totalComAlerta = funcionariosComAlerta.reduce((s: number, f: any) => s + (f.valorTotalVale || 0), 0);
    
    return (
      <DashboardLayout>
        <PrintHeader />
        {fileInputs}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Cálculo Interno — Vale / Adiantamento</h1>
                <p className="text-muted-foreground text-sm">{formatMesAno(mesAno)} • {valeResult.totalFuncionarios} funcionários • {valeResult.percentual}% do salário + HE</p>
              </div>
            </div>
            <PrintActions title={`Cálculo Vale - ${formatMesAno(mesAno)}`} />
          </div>

          {/* RESUMO CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-orange-700">{valeResult.totalFuncionarios}</p>
              <p className="text-xs text-muted-foreground">Funcionários</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-orange-700">{formatBRL(valeResult.totalVale)}</p>
              <p className="text-xs text-muted-foreground">Total Vale (Geral)</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{formatBRL(totalSemAlerta)}</p>
              <p className="text-xs text-muted-foreground">Aprovados Automaticamente</p>
            </CardContent></Card>
            <Card className={funcionariosComAlerta.length > 0 ? "border-2 border-amber-400" : ""}><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{funcionariosComAlerta.length}</p>
              <p className="text-xs text-muted-foreground">Com Alerta (Decisão Pendente)</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{valeResult.diasUteis}</p>
              <p className="text-xs text-muted-foreground">Dias Úteis</p>
            </CardContent></Card>
          </div>

          {/* ALERTAS - DECISÃO DO USUÁRIO */}
          {funcionariosComAlerta.length > 0 && (
            <Card className="border-2 border-amber-400 bg-amber-50/50">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-amber-500 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-base text-amber-800">Funcionários com Alerta — Decisão Necessária</p>
                    <p className="text-xs text-amber-700">Estes funcionários possuem situações que requerem sua análise. Decida se deseja pagar ou não o vale para cada um.</p>
                  </div>
                  <div className="ml-auto flex gap-2 no-print">
                    <Button size="sm" variant="outline" className="border-green-500 text-green-700 hover:bg-green-50"
                      onClick={() => {
                        const decisoes = funcionariosComAlerta.map((f: any) => ({ employeeId: f.employeeId, pagar: true }));
                        decidirValeMut.mutate({ companyId, mesReferencia: mesAno, decisoes });
                      }}
                      disabled={decidirValeMut.isPending}>
                      <CheckCircle className="h-3 w-3 mr-1" /> Aprovar Todos
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-500 text-red-700 hover:bg-red-50"
                      onClick={() => {
                        const decisoes = funcionariosComAlerta.map((f: any) => ({ employeeId: f.employeeId, pagar: false }));
                        decidirValeMut.mutate({ companyId, mesReferencia: mesAno, decisoes });
                      }}
                      disabled={decidirValeMut.isPending}>
                      <XCircle className="h-3 w-3 mr-1" /> Rejeitar Todos
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-amber-300">
                        <th className="text-left py-2 px-2">Funcionário</th>
                        <th className="text-left py-2 px-2">Motivo do Alerta</th>
                        <th className="text-right py-2 px-2">Faltas (1-15)</th>
                        <th className="text-right py-2 px-2">Total Vale</th>
                        <th className="text-center py-2 px-2 no-print">Decisão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funcionariosComAlerta.map((f: any, i: number) => (
                        <tr key={i} className="border-b border-amber-200 hover:bg-amber-100/50">
                          <td className="py-2 px-2 font-medium">{f.nome}</td>
                          <td className="py-2 px-2">
                            <div className="flex flex-wrap gap-1">
                              {f.alertaMotivo?.split(' | ').map((motivo: string, j: number) => (
                                <Badge key={j} className="bg-amber-200 text-amber-800 text-[10px]">
                                  <AlertTriangle className="h-3 w-3 mr-0.5" /> {motivo}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="text-right py-2 px-2 font-medium text-red-600">{f.faltas}</td>
                          <td className="text-right py-2 px-2 font-bold">{formatBRL(f.valorTotalVale)}</td>
                          <td className="text-center py-2 px-2 no-print">
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-green-500 text-green-700 hover:bg-green-50"
                                disabled={decidirValeMut.isPending}
                                onClick={() => decidirValeMut.mutate({ companyId, mesReferencia: mesAno, decisoes: [{ employeeId: f.employeeId, pagar: true }] })}>
                                <CheckCircle className="h-3 w-3 mr-0.5" /> Pagar
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-red-500 text-red-700 hover:bg-red-50"
                                disabled={decidirValeMut.isPending}
                                onClick={() => decidirValeMut.mutate({ companyId, mesReferencia: mesAno, decisoes: [{ employeeId: f.employeeId, pagar: false }] })}>
                                <XCircle className="h-3 w-3 mr-0.5" /> Não Pagar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-amber-400 bg-amber-100/50 font-bold">
                        <td className="py-2 px-2" colSpan={3}>TOTAL COM ALERTA ({funcionariosComAlerta.length})</td>
                        <td className="text-right py-2 px-2 text-lg">{formatBRL(totalComAlerta)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* TABELA DE FUNCIONÁRIOS APROVADOS */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="font-semibold text-sm">Funcionários Aprovados ({funcionariosSemAlerta.length})</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-2 px-2">Funcionário</th>
                      <th className="text-right py-2 px-2">Salário</th>
                      <th className="text-right py-2 px-2">Adiantamento ({valeResult.percentual}%)</th>
                      <th className="text-right py-2 px-2">HE (R$)</th>
                      <th className="text-right py-2 px-2">Total Vale</th>
                      <th className="text-center py-2 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funcionariosSemAlerta.map((f: any, i: number) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-2 font-medium">{f.nome}</td>
                        <td className="text-right py-2 px-2">{formatBRL(f.salarioBruto)}</td>
                        <td className="text-right py-2 px-2">{formatBRL(f.valorAdiantamento)}</td>
                        <td className="text-right py-2 px-2 text-orange-700 font-medium">{formatBRL(f.valorHE)}</td>
                        <td className="text-right py-2 px-2 font-bold">{formatBRL(f.valorTotalVale)}</td>
                        <td className="text-center py-2 px-2">
                          <Badge className="bg-green-100 text-green-700 text-[10px]">
                            <CheckCircle className="h-3 w-3 mr-0.5" /> OK
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                      <td className="py-2 px-2">TOTAL APROVADOS</td>
                      <td className="text-right py-2 px-2">—</td>
                      <td className="text-right py-2 px-2">—</td>
                      <td className="text-right py-2 px-2">—</td>
                      <td className="text-right py-2 px-2 text-lg">{formatBRL(totalSemAlerta)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
        <PrintFooterLGPD />
      </DashboardLayout>
    );
  }

  // ===== CÁLCULO PAGAMENTO VIEW =====
  if (viewMode === "alertas_afericao") {
    const alertas = (alertasAfericao.data || []) as any[];
    return (
      <DashboardLayout>
        <PrintHeader />
        {fileInputs}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Alertas da Aferição — Sem Registro de Ponto</h1>
                <p className="text-sm text-muted-foreground">Funcionários que estavam no período "no escuro" mas não tiveram registro de ponto no DIXI. Decida se foi erro do relógio ou falta real.</p>
              </div>
            </div>
          </div>

          {alertasAfericao.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando alertas...</div>
          ) : alertas.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="text-green-800 font-medium">Nenhum alerta pendente de decisão.</p>
              <p className="text-sm text-green-600 mt-1">Todos os registros da aferição já foram resolvidos.</p>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-800">{alertas.length} dia(s) sem registro de ponto</p>
                    <p className="text-sm text-amber-700 mt-1">Esses funcionários estavam no período "no escuro" e não tiveram batida no relógio de ponto. Escolha para cada um:</p>
                    <ul className="text-sm text-amber-700 mt-1 list-disc ml-4">
                      <li><strong>Erro do Relógio</strong>: mantém como trabalhado (sem desconto)</li>
                      <li><strong>Falta Real</strong>: aplica desconto na folha deste mês</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" className="text-green-700 border-green-300"
                  disabled={decidirAfericaoMut.isPending}
                  onClick={() => decidirAfericaoMut.mutate({
                    companyId, mesReferencia: mesAno,
                    decisoes: alertas.map((a: any) => ({ adjustmentId: a.id, decisao: "erro_relogio" as const }))
                  })}>
                  <CheckCircle className="h-3 w-3 mr-1" /> Todos: Erro do Relógio
                </Button>
                <Button size="sm" variant="outline" className="text-red-700 border-red-300"
                  disabled={decidirAfericaoMut.isPending}
                  onClick={() => decidirAfericaoMut.mutate({
                    companyId, mesReferencia: mesAno,
                    decisoes: alertas.map((a: any) => ({ adjustmentId: a.id, decisao: "falta_real" as const }))
                  })}>
                  <XCircle className="h-3 w-3 mr-1" /> Todos: Falta Real
                </Button>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-3 font-medium">Funcionário</th>
                      <th className="text-left p-3 font-medium">Função</th>
                      <th className="text-center p-3 font-medium">Data</th>
                      <th className="text-right p-3 font-medium">Valor Desconto</th>
                      <th className="text-center p-3 font-medium">Decisão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertas.map((a: any) => (
                      <tr key={a.id} className="border-t hover:bg-amber-50/50">
                        <td className="p-3">
                          <div className="font-medium">{a.nomeCompleto || `ID ${a.employeeId}`}</div>
                          <div className="text-xs text-muted-foreground">{a.codigoInterno}</div>
                        </td>
                        <td className="p-3 text-muted-foreground">{a.funcao || '-'}</td>
                        <td className="p-3 text-center">{a.data ? new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                        <td className="p-3 text-right font-mono text-red-600">{formatBRL(parseBRLNum(a.valorTotal || '0'))}</td>
                        <td className="p-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
                              disabled={decidirAfericaoMut.isPending}
                              onClick={() => decidirAfericaoMut.mutate({
                                companyId, mesReferencia: mesAno,
                                decisoes: [{ adjustmentId: a.id, decisao: "erro_relogio" }]
                              })}>
                              Erro Relógio
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300 hover:bg-red-50"
                              disabled={decidirAfericaoMut.isPending}
                              onClick={() => decidirAfericaoMut.mutate({
                                companyId, mesReferencia: mesAno,
                                decisoes: [{ adjustmentId: a.id, decisao: "falta_real" }]
                              })}>
                              Falta Real
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </DashboardLayout>
    );
  }

  if (viewMode === "calculo_pagamento" && pagamentoResult) {
    return (
      <DashboardLayout>
        <PrintHeader />
        {fileInputs}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Cálculo Interno — Pagamento / Saldo</h1>
                <p className="text-muted-foreground text-sm">{formatMesAno(mesAno)} • {pagamentoResult.totalFuncionarios} funcionários • Previsão: {pagamentoResult.dataPagamentoPrevista}</p>
              </div>
            </div>
            <PrintActions title={`Cálculo Pagamento - ${formatMesAno(mesAno)}`} />
          </div>

          {/* RESUMO CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{pagamentoResult.totalFuncionarios}</p>
              <p className="text-xs text-muted-foreground">Funcionários</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{formatBRL(pagamentoResult.totalBruto)}</p>
              <p className="text-xs text-muted-foreground">Total Bruto</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{formatBRL(pagamentoResult.totalDescontos)}</p>
              <p className="text-xs text-muted-foreground">Total Descontos</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-[#1B2A4A]">{formatBRL(pagamentoResult.totalLiquido)}</p>
              <p className="text-xs text-muted-foreground">Total Líquido</p>
            </CardContent></Card>
          </div>

          {/* TABELA DE FUNCIONÁRIOS - TODOS OS DESCONTOS */}
          <Card>
            <CardContent className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-2 px-1 sticky left-0 bg-white z-10">Funcionário</th>
                      <th className="text-left py-2 px-1">Função</th>
                      <th className="text-right py-2 px-1 bg-green-50">Bruto</th>
                      <th className="text-right py-2 px-1 bg-green-50">H.E.</th>
                      <th className="text-right py-2 px-1 bg-green-50 font-bold">Proventos</th>
                      <th className="text-right py-2 px-1 bg-orange-50">Adiant.</th>
                      <th className="text-right py-2 px-1 bg-red-50">INSS</th>
                      <th className="text-right py-2 px-1 bg-red-50">VT</th>
                      <th className="text-right py-2 px-1 bg-red-50">VA (5%)</th>
                      <th className="text-right py-2 px-1 bg-red-50">Faltas</th>
                      <th className="text-right py-2 px-1 bg-red-50">Pensão</th>
                      <th className="text-right py-2 px-1 bg-red-50">Seguro</th>
                      <th className="text-right py-2 px-1 bg-red-50">Ac. Escuro</th>
                      <th className="text-right py-2 px-1 bg-purple-50">Conv.</th>
                      <th className="text-right py-2 px-1 bg-red-50 font-bold">Tot. Desc.</th>
                      <th className="text-right py-2 px-1 bg-blue-50 font-bold">Líquido</th>
                      <th className="text-right py-2 px-1 text-[9px] text-muted-foreground">FGTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagamentoResult.funcionarios?.map((f: any, i: number) => {
                      const vtVal = f.vtValor || 0;
                      const vaDesc = f.descontoVaTotal || 0;
                      const descFaltas = (f.descontoFaltas || 0) + (f.descontoAtrasos || 0);
                      const pensao = f.descontoPensao || 0;
                      const seguro = f.seguroVidaValor || 0;
                      const acertoEsc = f.acertoEscuroValor || 0;
                      const convenio = f.descontoConvenio || 0;
                      return (
                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-1.5 px-1 font-medium sticky left-0 bg-white z-10 whitespace-nowrap">{f.nome}</td>
                          <td className="py-1.5 px-1 text-muted-foreground text-[10px] whitespace-nowrap">{f.funcao}</td>
                          <td className="text-right py-1.5 px-1">{formatBRL(f.salarioBruto)}</td>
                          <td className="text-right py-1.5 px-1 text-green-700">{f.valorHE > 0 ? formatBRL(f.valorHE) : '—'}</td>
                          <td className="text-right py-1.5 px-1 font-semibold">{formatBRL(f.totalProventos)}</td>
                          <td className="text-right py-1.5 px-1 text-orange-700">{f.descontoAdiantamento > 0 ? formatBRL(f.descontoAdiantamento) : '—'}</td>
                          <td className="text-right py-1.5 px-1 text-red-600">{f.descontoInss > 0 ? formatBRL(f.descontoInss) : '—'}</td>
                          <td className="text-right py-1.5 px-1 text-red-600">{vtVal > 0 ? formatBRL(vtVal) : '—'}</td>
                          <td className="text-right py-1.5 px-1 text-red-600">{vaDesc > 0 ? formatBRL(vaDesc) : '—'}</td>
                          <td className="text-right py-1.5 px-1 text-red-600">{descFaltas > 0 ? formatBRL(descFaltas) : '—'}</td>
                          <td className="text-right py-1.5 px-1 text-red-600">{pensao > 0 ? formatBRL(pensao) : '—'}</td>
                          <td className="text-right py-1.5 px-1 text-red-600">{seguro > 0 ? formatBRL(seguro) : '—'}</td>
                          <td className="text-right py-1.5 px-1 text-red-600">{acertoEsc > 0 ? formatBRL(acertoEsc) : '—'}</td>
                          <td className="text-right py-1.5 px-1 text-purple-700">{convenio > 0 ? formatBRL(convenio) : '—'}</td>
                          <td className="text-right py-1.5 px-1 font-semibold text-red-700">{formatBRL(f.totalDescontos)}</td>
                          <td className="text-right py-1.5 px-1 font-bold text-[#1B2A4A]">{formatBRL(f.salarioLiquido)}</td>
                          <td className="text-right py-1.5 px-1 text-[10px] text-muted-foreground">{formatBRL(f.descontoFgts)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                      <td className="py-2 px-1 sticky left-0 bg-gray-50 z-10" colSpan={2}>TOTAL ({pagamentoResult.totalFuncionarios})</td>
                      <td className="text-right py-2 px-1" colSpan={3}>{formatBRL(pagamentoResult.totalBruto)}</td>
                      <td className="text-right py-2 px-1 text-orange-700">
                        {formatBRL(pagamentoResult.funcionarios?.reduce((s: number, f: any) => s + (f.descontoAdiantamento || 0), 0) || 0)}
                      </td>
                      <td className="text-right py-2 px-1 text-red-600">
                        {formatBRL(pagamentoResult.funcionarios?.reduce((s: number, f: any) => s + (f.descontoInss || 0), 0) || 0)}
                      </td>
                      <td className="text-right py-2 px-1 text-red-600">
                        {formatBRL(pagamentoResult.funcionarios?.reduce((s: number, f: any) => s + (f.vtValor || 0), 0) || 0)}
                      </td>
                      <td className="text-right py-2 px-1 text-red-600">
                        {formatBRL(pagamentoResult.funcionarios?.reduce((s: number, f: any) => s + (f.descontoVaTotal || 0), 0) || 0)}
                      </td>
                      <td className="text-right py-2 px-1 text-red-600">
                        {formatBRL(pagamentoResult.funcionarios?.reduce((s: number, f: any) => s + (f.descontoFaltas || 0) + (f.descontoAtrasos || 0), 0) || 0)}
                      </td>
                      <td className="text-right py-2 px-1 text-red-600">
                        {formatBRL(pagamentoResult.funcionarios?.reduce((s: number, f: any) => s + (f.descontoPensao || 0), 0) || 0)}
                      </td>
                      <td className="text-right py-2 px-1 text-red-600">
                        {formatBRL(pagamentoResult.funcionarios?.reduce((s: number, f: any) => s + (f.seguroVidaValor || 0), 0) || 0)}
                      </td>
                      <td className="text-right py-2 px-1 text-red-600">
                        {formatBRL(pagamentoResult.funcionarios?.reduce((s: number, f: any) => s + (f.acertoEscuroValor || 0), 0) || 0)}
                      </td>
                      <td className="text-right py-2 px-1 text-purple-700">
                        {formatBRL(pagamentoResult.funcionarios?.reduce((s: number, f: any) => s + (f.descontoConvenio || 0), 0) || 0)}
                      </td>
                      <td className="text-right py-2 px-1 text-red-700">{formatBRL(pagamentoResult.totalDescontos)}</td>
                      <td className="text-right py-2 px-1 text-lg text-[#1B2A4A]">{formatBRL(pagamentoResult.totalLiquido)}</td>
                      <td className="text-right py-2 px-1 text-[10px] text-muted-foreground">
                        {formatBRL(pagamentoResult.funcionarios?.reduce((s: number, f: any) => s + (f.descontoFgts || 0), 0) || 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
        <PrintFooterLGPD />
      </DashboardLayout>
    );
  }

  // ===== MAIN VIEW (resumo) =====
  return (
    <DashboardLayout>
      <PrintHeader />
      {fileInputs}
      <div className="space-y-6">
        {/* HEADER */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Folha de Pagamento</h1>
            <p className="text-muted-foreground text-sm">Importação e verificação da folha da contabilidade</p>
          </div>
          <div className="flex gap-2 items-center">
            <Button size="sm" variant="outline" onClick={() => openView("horas_extras")}>
              <Clock className="h-4 w-4 mr-1" /> Horas Extras
            </Button>
            <Button size="sm" variant="outline" className="text-amber-700 border-amber-200" onClick={() => setViewMode("descontos_epi")}>
              <HardHat className="h-4 w-4 mr-1" /> Descontos EPI
            </Button>
            <PrintActions title={`Folha de Pagamento - ${formatMesAno(mesAno)}`} />
          </div>
        </div>

        {/* CALENDÁRIO */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAnoSelecionado(a => a - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-bold text-lg min-w-[60px] text-center">{anoSelecionado}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAnoSelecionado(a => a + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500" /> Com lançamento</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-green-500" /> Consolidado</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-gray-200" /> Sem dados</div>
              </div>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {MESES_CURTOS.map((nome, i) => {
                const mes = i + 1;
                const isSelected = mes === mesSelecionado;
                const status = getMonthStatus(mes);
                return (
                  <button key={mes} onClick={() => setMesSelecionado(mes)}
                    className={`rounded-lg p-2 text-center text-xs font-medium transition-all border-2 ${
                      isSelected ? "border-[#1B2A4A] ring-2 ring-[#1B2A4A]/30 shadow-md" :
                      status === "consolidado" ? "bg-green-100 border-green-300 text-green-800 hover:bg-green-200" :
                      status === "completo" ? "bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200" :
                      "bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200"
                    }`}>
                    <div>{nome}</div>
                    {status === "consolidado" && <Lock className="h-3 w-3 mx-auto mt-0.5 text-green-600" />}
                    {status === "completo" && <FileText className="h-3 w-3 mx-auto mt-0.5 text-blue-600" />}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* MÊS SELECIONADO */}
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[#1B2A4A]" />
          <span className="text-sm font-semibold text-[#1B2A4A]">{formatMesAno(mesAno)}</span>
        </div>

        {/* ===== CÁLCULO INTERNO (PayrollEngine) ===== */}
        <Card className="border-2 border-[#1B2A4A]/20 bg-gradient-to-r from-blue-50/50 to-indigo-50/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#1B2A4A] flex items-center justify-center">
                  <Calculator className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-base text-[#1B2A4A]">Cálculo Interno</p>
                  <p className="text-xs text-muted-foreground">Simulação automática a partir do ponto {statusMes.data?.pontoConsolidado ? <Badge className="bg-green-100 text-green-700 text-[10px] ml-1"><CheckCircle className="h-3 w-3 mr-0.5" /> Ponto Consolidado</Badge> : <Badge className="bg-amber-100 text-amber-700 text-[10px] ml-1"><AlertTriangle className="h-3 w-3 mr-0.5" /> Ponto Não Consolidado</Badge>}</p>
                </div>
              </div>
              {payrollPeriod.data && (
                <Badge className="bg-blue-100 text-blue-700 text-xs">
                  Status: {String(payrollPeriod.data.status).replace(/_/g, ' ')}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* CALCULAR VALE */}
              <div className="bg-white rounded-lg border border-orange-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="h-4 w-4 text-orange-600" />
                  <span className="font-semibold text-sm">Calcular Vale</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">40% do salário + horas extras do ponto real (15 a 15)</p>
                <Button size="sm" className="w-full bg-orange-600 hover:bg-orange-700"
                  disabled={gerarValeMut.isPending}
                  onClick={() => gerarValeMut.mutate({ companyId, mesReferencia: mesAno })}>
                  {gerarValeMut.isPending ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Calculando...</> : <><Zap className="h-3 w-3 mr-1" /> Calcular Vale</>}
                </Button>
                {valeResult && (
                  <>
                    <Button size="sm" variant="ghost" className="w-full mt-1 text-xs text-orange-700" onClick={() => setViewMode("calculo_vale")}>
                      <Eye className="h-3 w-3 mr-1" /> Ver Resultado ({formatBRL(valeResult.totalVale)})
                    </Button>
                    {(valeResult.totalAlertas || 0) > 0 && (
                      <div className="mt-1 text-center">
                        <Badge className="bg-amber-200 text-amber-800 text-[10px]">
                          <AlertTriangle className="h-3 w-3 mr-0.5" /> {valeResult.totalAlertas} alerta(s)
                        </Badge>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* SIMULAR PAGAMENTO */}
              <div className="bg-white rounded-lg border border-green-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <span className="font-semibold text-sm">Simular Pagamento</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">100% salário − adiantamento − faltas − INSS − descontos</p>
                <Button size="sm" className="w-full bg-green-600 hover:bg-green-700"
                  disabled={simularPagamentoMut.isPending}
                  onClick={() => simularPagamentoMut.mutate({ companyId, mesReferencia: mesAno })}>
                  {simularPagamentoMut.isPending ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Simulando...</> : <><Zap className="h-3 w-3 mr-1" /> Simular Pagamento</>}
                </Button>
                {pagamentoResult && (
                  <Button size="sm" variant="ghost" className="w-full mt-1 text-xs text-green-700" onClick={() => setViewMode("calculo_pagamento")}>
                    <Eye className="h-3 w-3 mr-1" /> Ver Resultado ({formatBRL(pagamentoResult.totalLiquido)})
                  </Button>
                )}
              </div>

              {/* AFERIR ESCURO */}
              <div className="bg-white rounded-lg border border-purple-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Moon className="h-4 w-4 text-purple-600" />
                  <span className="font-semibold text-sm">Aferir Escuro</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Compara o escuro do mês anterior com o ponto real importado</p>
                <Button size="sm" className="w-full bg-purple-600 hover:bg-purple-700"
                  disabled={afericaoMut.isPending}
                  onClick={() => afericaoMut.mutate({ companyId, mesReferencia: mesAno })}>
                  {afericaoMut.isPending ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Aferindo...</> : <><Zap className="h-3 w-3 mr-1" /> Aferir Escuro</>}
                </Button>
                {afericaoResult && (
                  <div className="mt-2 text-xs text-center space-y-1">
                    <span className="text-purple-700 font-medium">{afericaoResult.totalAferidos} dias aferidos</span>
                    {afericaoResult.divergencias > 0 && (
                      <span className="text-red-600 font-bold ml-2">{afericaoResult.divergencias} divergências</span>
                    )}
                    {afericaoResult.semRegistro > 0 && (
                      <div>
                        <Button size="sm" variant="ghost" className="text-amber-700 text-[10px] h-6" onClick={() => setViewMode("alertas_afericao")}>
                          <AlertTriangle className="h-3 w-3 mr-1" /> {afericaoResult.semRegistro} sem registro - Decidir
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {(alertasAfericao.data as any[] || []).length > 0 && !afericaoResult && (
                  <div className="mt-2 text-center">
                    <Button size="sm" variant="ghost" className="text-amber-700 text-[10px] h-6" onClick={() => setViewMode("alertas_afericao")}>
                      <AlertTriangle className="h-3 w-3 mr-1" /> {(alertasAfericao.data as any[]).length} pendente(s) de decisão
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {!statusMes.data?.pontoConsolidado && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">O ponto deste mês ainda não foi consolidado. Os cálculos podem não refletir todos os registros. Consolide o ponto no módulo <strong>Fechamento de Ponto</strong> para resultados precisos.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* CONFERÊNCIA COM CONTABILIDADE (Compacta / Colapsável) */}
        <Card className="border border-gray-200">
          <CardContent className="p-0">
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              onClick={() => setShowConferencia(!showConferencia)}
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <FileCheck className="h-4 w-4 text-gray-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Conferência com Contabilidade</p>
                  <p className="text-[10px] text-muted-foreground">Importação e verificação dos PDFs da contabilidade terceirizada</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {vale && (
                  <Badge variant="outline" className="text-[10px] border-orange-200 text-orange-700">
                    <CreditCard className="h-3 w-3 mr-1" /> Vale {vale.status === 'consolidado' ? '✓' : '•'}
                  </Badge>
                )}
                {pagamento && (
                  <Badge variant="outline" className="text-[10px] border-green-200 text-green-700">
                    <DollarSign className="h-3 w-3 mr-1" /> Pagto {pagamento.status === 'consolidado' ? '✓' : '•'}
                  </Badge>
                )}
                {!vale && !pagamento && (
                  <span className="text-[10px] text-muted-foreground">Nenhum PDF importado</span>
                )}
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showConferencia ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {showConferencia && (
              <div className="border-t px-4 pb-4 pt-3">
                <div className="grid gap-3 md:grid-cols-2">
                  {/* VALE COMPACTO */}
                  <div className={`rounded-lg border p-3 ${vale ? 'border-orange-200 bg-orange-50/30' : 'border-dashed border-gray-300'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-orange-600" />
                        <span className="font-semibold text-sm">Vale / Adiantamento</span>
                        <span className="text-[10px] text-muted-foreground">Dia 20</span>
                      </div>
                      {vale && (
                        <Badge className={`text-[10px] ${vale.status === 'consolidado' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {vale.status === 'consolidado' && <Lock className="h-2.5 w-2.5 mr-0.5" />}
                          {vale.status.charAt(0).toUpperCase() + vale.status.slice(1)}
                        </Badge>
                      )}
                    </div>
                    {vale ? (
                      <div>
                        <div className="flex items-center gap-4 text-xs mb-2">
                          <span><strong>{vale.totalFuncionarios}</strong> func.</span>
                          <span className="text-orange-700 font-bold">{formatBRL(vale.totalLiquido)}</span>
                          <span className={(vale.totalDivergencias || 0) > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>
                            {vale.totalDivergencias || 0} diverg.
                          </span>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={() => openView('detalhes', vale.id, 'Vale/Adiantamento')}>
                            <Eye className="h-2.5 w-2.5 mr-0.5" /> Detalhes
                          </Button>
                          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={() => openView('verificacao', vale.id, 'vale')}>
                            <ShieldCheck className="h-2.5 w-2.5 mr-0.5" /> Verificação
                          </Button>
                          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={() => openView('custos_obra', vale.id, 'vale')}>
                            <Building2 className="h-2.5 w-2.5 mr-0.5" /> Custos/Obra
                          </Button>
                          {vale.status !== 'consolidado' && (
                            <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 text-green-700" onClick={() => consolidarMut.mutate({ folhaLancamentoId: vale.id })}>
                              <Lock className="h-2.5 w-2.5 mr-0.5" /> Consolidar
                            </Button>
                          )}
                          {vale.status === 'consolidado' && isAdmin && (
                            <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 text-amber-700" onClick={() => desconsolidarMut.mutate({ folhaLancamentoId: vale.id })}>
                              <Unlock className="h-2.5 w-2.5 mr-0.5" /> Desconsolidar
                            </Button>
                          )}
                          {vale.status !== 'consolidado' && isAdmin && (
                            <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 text-red-600" onClick={() => {
                              if (confirm('Excluir lançamento de Vale?')) excluirMut.mutate({ folhaLancamentoId: vale.id });
                            }}>
                              <Trash2 className="h-2.5 w-2.5 mr-0.5" /> Excluir
                            </Button>
                          )}
                        </div>
                        {vale.status !== 'consolidado' && (
                          <Button size="sm" variant="ghost" className="text-[10px] w-full mt-1 h-6 text-orange-700 hover:bg-orange-50"
                            disabled={uploading === 'vale'}
                            onClick={() => valeInputRef.current?.click()}>
                            {uploading === 'vale' ? <><RefreshCw className="h-2.5 w-2.5 mr-1 animate-spin" /> Processando...</> : <><Upload className="h-2.5 w-2.5 mr-1" /> Reimportar PDFs</>}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-3">
                        <p className="text-xs text-muted-foreground mb-2">Nenhum PDF de vale importado</p>
                        <Button size="sm" className="bg-orange-600 hover:bg-orange-700 h-7 text-xs"
                          disabled={uploading === 'vale'}
                          onClick={() => valeInputRef.current?.click()}>
                          {uploading === 'vale' ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Processando...</> : <><Upload className="h-3 w-3 mr-1" /> Importar Vale</>}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* PAGAMENTO COMPACTO */}
                  <div className={`rounded-lg border p-3 ${pagamento ? 'border-green-200 bg-green-50/30' : 'border-dashed border-gray-300'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-green-600" />
                        <span className="font-semibold text-sm">Pagamento</span>
                        <span className="text-[10px] text-muted-foreground">5º dia útil</span>
                      </div>
                      {pagamento && (
                        <Badge className={`text-[10px] ${pagamento.status === 'consolidado' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {pagamento.status === 'consolidado' && <Lock className="h-2.5 w-2.5 mr-0.5" />}
                          {pagamento.status.charAt(0).toUpperCase() + pagamento.status.slice(1)}
                        </Badge>
                      )}
                    </div>
                    {pagamento ? (
                      <div>
                        <div className="flex items-center gap-4 text-xs mb-2">
                          <span><strong>{pagamento.totalFuncionarios}</strong> func.</span>
                          <span className="text-green-700 font-bold">{formatBRL(pagamento.totalLiquido)}</span>
                          <span className={(pagamento.totalDivergencias || 0) > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>
                            {pagamento.totalDivergencias || 0} diverg.
                          </span>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={() => openView('detalhes', pagamento.id, 'Pagamento')}>
                            <Eye className="h-2.5 w-2.5 mr-0.5" /> Detalhes
                          </Button>
                          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={() => openView('verificacao', pagamento.id, 'pagamento')}>
                            <ShieldCheck className="h-2.5 w-2.5 mr-0.5" /> Verificação
                          </Button>
                          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2" onClick={() => openView('custos_obra', pagamento.id, 'pagamento')}>
                            <Building2 className="h-2.5 w-2.5 mr-0.5" /> Custos/Obra
                          </Button>
                          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 text-red-700" onClick={() => openView('descontos_clt', pagamento.id, 'pagamento')}>
                            <Scale className="h-2.5 w-2.5 mr-0.5" /> Descontos CLT
                          </Button>
                          <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 text-blue-700" onClick={() => openView('cruzamento_he', pagamento.id, 'pagamento')}>
                            <Clock className="h-2.5 w-2.5 mr-0.5" /> Cruzamento HE
                          </Button>
                          {pagamento.status !== 'consolidado' && (
                            <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 text-green-700" onClick={() => consolidarMut.mutate({ folhaLancamentoId: pagamento.id })}>
                              <Lock className="h-2.5 w-2.5 mr-0.5" /> Consolidar
                            </Button>
                          )}
                          {pagamento.status === 'consolidado' && isAdmin && (
                            <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 text-amber-700" onClick={() => desconsolidarMut.mutate({ folhaLancamentoId: pagamento.id })}>
                              <Unlock className="h-2.5 w-2.5 mr-0.5" /> Desconsolidar
                            </Button>
                          )}
                          {pagamento.status !== 'consolidado' && isAdmin && (
                            <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 text-red-600" onClick={() => {
                              if (confirm('Excluir lançamento de Pagamento?')) excluirMut.mutate({ folhaLancamentoId: pagamento.id });
                            }}>
                              <Trash2 className="h-2.5 w-2.5 mr-0.5" /> Excluir
                            </Button>
                          )}
                        </div>
                        {pagamento.status !== 'consolidado' && (
                          <Button size="sm" variant="ghost" className="text-[10px] w-full mt-1 h-6 text-green-700 hover:bg-green-50"
                            disabled={uploading === 'pagamento'}
                            onClick={() => pagInputRef.current?.click()}>
                            {uploading === 'pagamento' ? <><RefreshCw className="h-2.5 w-2.5 mr-1 animate-spin" /> Processando...</> : <><Upload className="h-2.5 w-2.5 mr-1" /> Reimportar PDFs</>}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-3">
                        <p className="text-xs text-muted-foreground mb-2">Nenhum PDF de pagamento importado</p>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                          disabled={uploading === 'pagamento'}
                          onClick={() => pagInputRef.current?.click()}>
                          {uploading === 'pagamento' ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Processando...</> : <><Upload className="h-3 w-3 mr-1" /> Importar Pagamento</>}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* CARDS 13º SALÁRIO - Só aparecem em Nov e Dez */}
        {(isNovembro || isDezembro) && (
          <div className={`grid gap-4 ${isNovembro ? 'md:grid-cols-1' : isDezembro ? 'md:grid-cols-2' : ''}`}>
            {/* 1ª PARCELA - Novembro */}
            {isNovembro && (
              <Card className={`border-2 relative overflow-hidden ${decimoTerceiro1 ? 'border-purple-200' : 'border-dashed border-purple-300'}`}>
                <span className="absolute -right-4 -bottom-6 text-[180px] font-black text-purple-500/[0.04] leading-none select-none pointer-events-none z-0">13</span>
                <CardContent className="p-5 relative z-10">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                        <span className="text-lg font-black text-purple-600">13</span>
                      </div>
                      <div>
                        <p className="font-bold text-base">13º Salário — 1ª Parcela</p>
                        <p className="text-xs text-muted-foreground">Pago até 30/Nov (CLT Art. 2º Lei 4.749/65)</p>
                      </div>
                    </div>
                    {decimoTerceiro1 && (
                      <Badge className={decimoTerceiro1.status === 'consolidado' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}>
                        {decimoTerceiro1.status === 'consolidado' && <Lock className="h-3 w-3 mr-1" />}
                        {decimoTerceiro1.status.charAt(0).toUpperCase() + decimoTerceiro1.status.slice(1)}
                      </Badge>
                    )}
                  </div>
                  {decimoTerceiro1 ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                        <div className="bg-purple-50 rounded-lg p-2 text-center">
                          <p className="text-lg font-bold text-purple-700">{decimoTerceiro1.totalFuncionarios}</p>
                          <p className="text-[10px] text-muted-foreground">Funcionários</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-2 text-center">
                          <p className="text-base font-bold text-purple-700">{formatBRL(decimoTerceiro1.totalLiquido)}</p>
                          <p className="text-[10px] text-muted-foreground">Total Líquido</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-2 text-center">
                          <p className={`text-lg font-bold ${(decimoTerceiro1.totalDivergencias || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {decimoTerceiro1.totalDivergencias || 0}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Divergências</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openView('detalhes', decimoTerceiro1.id, '13º 1ª Parcela')}>
                          <Eye className="h-3 w-3 mr-1" /> Detalhes
                        </Button>
                        {decimoTerceiro1.status !== 'consolidado' && (
                          <Button size="sm" variant="outline" className="text-xs h-8 text-green-700" onClick={() => consolidarMut.mutate({ folhaLancamentoId: decimoTerceiro1.id })}>
                            <Lock className="h-3 w-3 mr-1" /> Consolidar
                          </Button>
                        )}
                        {decimoTerceiro1.status === 'consolidado' && isAdmin && (
                          <Button size="sm" variant="outline" className="text-xs h-8 text-amber-700" onClick={() => desconsolidarMut.mutate({ folhaLancamentoId: decimoTerceiro1.id })}>
                            <Unlock className="h-3 w-3 mr-1" /> Desconsolidar
                          </Button>
                        )}
                        {decimoTerceiro1.status !== 'consolidado' && isAdmin && (
                          <Button size="sm" variant="outline" className="text-xs h-8 text-red-600" onClick={() => {
                            if (confirm('Excluir lançamento de 13º 1ª Parcela?')) excluirMut.mutate({ folhaLancamentoId: decimoTerceiro1.id });
                          }}>
                            <Trash2 className="h-3 w-3 mr-1" /> Excluir
                          </Button>
                        )}
                      </div>
                      {decimoTerceiro1.status !== 'consolidado' && (
                        <Button size="sm" variant="ghost" className="text-xs w-full text-purple-700 hover:bg-purple-50"
                          disabled={uploading === 'decimo_terceiro_1'}
                          onClick={() => decimo1InputRef.current?.click()}>
                          {uploading === 'decimo_terceiro_1' ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Processando...</> : <><Upload className="h-3 w-3 mr-1" /> Reimportar PDFs</>}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <span className="text-4xl font-black text-purple-200 block mb-3">13</span>
                      <p className="text-sm text-muted-foreground mb-3">Nenhum lançamento de 13º 1ª Parcela</p>
                      <Button className="bg-purple-600 hover:bg-purple-700"
                        disabled={uploading === 'decimo_terceiro_1'}
                        onClick={() => decimo1InputRef.current?.click()}>
                        {uploading === 'decimo_terceiro_1' ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Processando...</> : <><Upload className="h-4 w-4 mr-2" /> Importar 13º 1ª Parcela</>}
                      </Button>
                      <p className="text-[10px] text-muted-foreground mt-2">Selecione os PDFs da 1ª parcela do 13º salário.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 2ª PARCELA - Dezembro */}
            {isDezembro && (
              <>
                {/* 1ª Parcela em Dez (caso não tenha sido importada em Nov) */}
                <Card className={`border-2 relative overflow-hidden ${decimoTerceiro1 ? 'border-purple-200' : 'border-dashed border-purple-300'}`}>
                  <span className="absolute -right-4 -bottom-6 text-[180px] font-black text-purple-500/[0.04] leading-none select-none pointer-events-none z-0">13</span>
                  <CardContent className="p-5 relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                          <span className="text-lg font-black text-purple-600">13</span>
                        </div>
                        <div>
                          <p className="font-bold text-base">13º Salário — 1ª Parcela</p>
                          <p className="text-xs text-muted-foreground">Referência Nov/{anoSelecionado}</p>
                        </div>
                      </div>
                      {decimoTerceiro1 && (
                        <Badge className="bg-purple-100 text-purple-700">
                          {decimoTerceiro1.status.charAt(0).toUpperCase() + decimoTerceiro1.status.slice(1)}
                        </Badge>
                      )}
                    </div>
                    {decimoTerceiro1 ? (
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="bg-purple-50 rounded-lg p-2 text-center">
                          <p className="text-lg font-bold text-purple-700">{decimoTerceiro1.totalFuncionarios}</p>
                          <p className="text-[10px] text-muted-foreground">Funcionários</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-2 text-center">
                          <p className="text-base font-bold text-purple-700">{formatBRL(decimoTerceiro1.totalLiquido)}</p>
                          <p className="text-[10px] text-muted-foreground">Total Líquido</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-3">1ª Parcela não importada. Importe em Novembro.</p>
                    )}
                  </CardContent>
                </Card>

                {/* 2ª Parcela */}
                <Card className={`border-2 relative overflow-hidden ${decimoTerceiro2 ? 'border-indigo-200' : 'border-dashed border-indigo-300'}`}>
                  <span className="absolute -right-4 -bottom-6 text-[180px] font-black text-indigo-500/[0.04] leading-none select-none pointer-events-none z-0">13</span>
                  <CardContent className="p-5 relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                          <span className="text-lg font-black text-indigo-600">13</span>
                        </div>
                        <div>
                          <p className="font-bold text-base">13º Salário — 2ª Parcela</p>
                          <p className="text-xs text-muted-foreground">Pago até 20/Dez (CLT Art. 1º Lei 4.749/65)</p>
                        </div>
                      </div>
                      {decimoTerceiro2 && (
                        <Badge className={decimoTerceiro2.status === 'consolidado' ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}>
                          {decimoTerceiro2.status === 'consolidado' && <Lock className="h-3 w-3 mr-1" />}
                          {decimoTerceiro2.status.charAt(0).toUpperCase() + decimoTerceiro2.status.slice(1)}
                        </Badge>
                      )}
                    </div>
                    {decimoTerceiro2 ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                          <div className="bg-indigo-50 rounded-lg p-2 text-center">
                            <p className="text-lg font-bold text-indigo-700">{decimoTerceiro2.totalFuncionarios}</p>
                            <p className="text-[10px] text-muted-foreground">Funcionários</p>
                          </div>
                          <div className="bg-indigo-50 rounded-lg p-2 text-center">
                            <p className="text-base font-bold text-indigo-700">{formatBRL(decimoTerceiro2.totalLiquido)}</p>
                            <p className="text-[10px] text-muted-foreground">Total Líquido</p>
                          </div>
                          <div className="bg-indigo-50 rounded-lg p-2 text-center">
                            <p className={`text-lg font-bold ${(decimoTerceiro2.totalDivergencias || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {decimoTerceiro2.totalDivergencias || 0}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Divergências</p>
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openView('detalhes', decimoTerceiro2.id, '13º 2ª Parcela')}>
                            <Eye className="h-3 w-3 mr-1" /> Detalhes
                          </Button>
                          {decimoTerceiro2.status !== 'consolidado' && (
                            <Button size="sm" variant="outline" className="text-xs h-8 text-green-700" onClick={() => consolidarMut.mutate({ folhaLancamentoId: decimoTerceiro2.id })}>
                              <Lock className="h-3 w-3 mr-1" /> Consolidar
                            </Button>
                          )}
                          {decimoTerceiro2.status === 'consolidado' && isAdmin && (
                            <Button size="sm" variant="outline" className="text-xs h-8 text-amber-700" onClick={() => desconsolidarMut.mutate({ folhaLancamentoId: decimoTerceiro2.id })}>
                              <Unlock className="h-3 w-3 mr-1" /> Desconsolidar
                            </Button>
                          )}
                          {decimoTerceiro2.status !== 'consolidado' && isAdmin && (
                            <Button size="sm" variant="outline" className="text-xs h-8 text-red-600" onClick={() => {
                              if (confirm('Excluir lançamento de 13º 2ª Parcela?')) excluirMut.mutate({ folhaLancamentoId: decimoTerceiro2.id });
                            }}>
                              <Trash2 className="h-3 w-3 mr-1" /> Excluir
                            </Button>
                          )}
                        </div>
                        {decimoTerceiro2.status !== 'consolidado' && (
                          <Button size="sm" variant="ghost" className="text-xs w-full text-indigo-700 hover:bg-indigo-50"
                            disabled={uploading === 'decimo_terceiro_2'}
                            onClick={() => decimo2InputRef.current?.click()}>
                            {uploading === 'decimo_terceiro_2' ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Processando...</> : <><Upload className="h-3 w-3 mr-1" /> Reimportar PDFs</>}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <span className="text-4xl font-black text-indigo-200 block mb-3">13</span>
                        <p className="text-sm text-muted-foreground mb-3">Nenhum lançamento de 13º 2ª Parcela</p>
                        <Button className="bg-indigo-600 hover:bg-indigo-700"
                          disabled={uploading === 'decimo_terceiro_2'}
                          onClick={() => decimo2InputRef.current?.click()}>
                          {uploading === 'decimo_terceiro_2' ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Processando...</> : <><Upload className="h-4 w-4 mr-2" /> Importar 13º 2ª Parcela</>}
                        </Button>
                        <p className="text-[10px] text-muted-foreground mt-2">Selecione os PDFs da 2ª parcela do 13º salário.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {/* RESUMO GERAL DO MÊS - formato tabela profissional */}
        {(vale || pagamento || decimoTerceiro1 || decimoTerceiro2) && (() => {
          const valeProventos = vale ? parseBRLNum(vale.totalProventos) : 0;
          const valeDescontos = vale ? parseBRLNum(vale.totalDescontos) : 0;
          const valeLiquido = vale ? parseBRLNum(vale.totalLiquido) : 0;
          const valeQtd = vale?.totalFuncionarios || 0;

          const pagProventos = pagamento ? parseBRLNum(pagamento.totalProventos) : 0;
          const pagDescontos = pagamento ? parseBRLNum(pagamento.totalDescontos) : 0;
          const pagLiquido = pagamento ? parseBRLNum(pagamento.totalLiquido) : 0;
          const pagQtd = pagamento?.totalFuncionarios || 0;

          const d13_1Proventos = decimoTerceiro1 ? parseBRLNum(decimoTerceiro1.totalProventos) : 0;
          const d13_1Descontos = decimoTerceiro1 ? parseBRLNum(decimoTerceiro1.totalDescontos) : 0;
          const d13_1Liquido = decimoTerceiro1 ? parseBRLNum(decimoTerceiro1.totalLiquido) : 0;
          const d13_1Qtd = decimoTerceiro1?.totalFuncionarios || 0;

          const d13_2Proventos = decimoTerceiro2 ? parseBRLNum(decimoTerceiro2.totalProventos) : 0;
          const d13_2Descontos = decimoTerceiro2 ? parseBRLNum(decimoTerceiro2.totalDescontos) : 0;
          const d13_2Liquido = decimoTerceiro2 ? parseBRLNum(decimoTerceiro2.totalLiquido) : 0;
          const d13_2Qtd = decimoTerceiro2?.totalFuncionarios || 0;

          const totalProventos = valeProventos + pagProventos + d13_1Proventos + d13_2Proventos;
          const totalDescontos = valeDescontos + pagDescontos + d13_1Descontos + d13_2Descontos;
          const totalLiquido = valeLiquido + pagLiquido + d13_1Liquido + d13_2Liquido;
          const totalQtd = Math.max(valeQtd, pagQtd, d13_1Qtd, d13_2Qtd);

          // Colunas dinâmicas baseadas no que existe
          type Col = { label: string; qtd: number; proventos: number; descontos: number; liquido: number };
          const cols: Col[] = [];
          if (vale) cols.push({ label: "VALE / ADIANT.", qtd: valeQtd, proventos: valeProventos, descontos: valeDescontos, liquido: valeLiquido });
          if (pagamento) cols.push({ label: "PAGAMENTO", qtd: pagQtd, proventos: pagProventos, descontos: pagDescontos, liquido: pagLiquido });
          if (decimoTerceiro1) cols.push({ label: "13º - 1ª PARCELA", qtd: d13_1Qtd, proventos: d13_1Proventos, descontos: d13_1Descontos, liquido: d13_1Liquido });
          if (decimoTerceiro2) cols.push({ label: "13º - 2ª PARCELA", qtd: d13_2Qtd, proventos: d13_2Proventos, descontos: d13_2Descontos, liquido: d13_2Liquido });

          return (
            <Card className="border-2 border-[#1B2A4A]/30 bg-gradient-to-r from-[#1B2A4A]/5 to-[#1B2A4A]/10">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-[#1B2A4A] flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-base text-[#1B2A4A]">Resumo Geral</p>
                    <p className="text-xs text-muted-foreground">{formatMesAno(mesAno)}</p>
                  </div>
                </div>

                {/* Tabela Resumo Geral */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-[#1B2A4A]/30">
                        <th className="text-left py-2 pr-4 font-bold text-[#1B2A4A] min-w-[120px]">RESUMO GERAL</th>
                        {cols.map((c, i) => (
                          <th key={i} className="text-right py-2 px-3 font-bold text-[#1B2A4A] min-w-[130px]">{c.label}</th>
                        ))}
                        <th className="text-right py-2 pl-3 font-black text-[#1B2A4A] min-w-[140px] bg-[#1B2A4A]/10 rounded-tr-lg">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-200">
                        <td className="py-2 pr-4 text-muted-foreground">Quantidade</td>
                        {cols.map((c, i) => (
                          <td key={i} className="text-right py-2 px-3 font-medium">{c.qtd}</td>
                        ))}
                        <td className="text-right py-2 pl-3 font-bold bg-[#1B2A4A]/5">{totalQtd}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="py-2 pr-4 text-muted-foreground">Proventos</td>
                        {cols.map((c, i) => (
                          <td key={i} className="text-right py-2 px-3 font-medium text-green-700">{formatBRL(c.proventos)}</td>
                        ))}
                        <td className="text-right py-2 pl-3 font-bold text-green-700 bg-[#1B2A4A]/5">{formatBRL(totalProventos)}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="py-2 pr-4 text-muted-foreground">Descontos</td>
                        {cols.map((c, i) => (
                          <td key={i} className="text-right py-2 px-3 font-medium text-red-600">{formatBRL(c.descontos)}</td>
                        ))}
                        <td className="text-right py-2 pl-3 font-bold text-red-600 bg-[#1B2A4A]/5">{formatBRL(totalDescontos)}</td>
                      </tr>
                      <tr className="border-b-2 border-[#1B2A4A]/30 bg-[#1B2A4A]/5">
                        <td className="py-2.5 pr-4 font-black text-[#1B2A4A]">Líquido</td>
                        {cols.map((c, i) => (
                          <td key={i} className="text-right py-2.5 px-3 font-black text-[#1B2A4A]">{formatBRL(c.liquido)}</td>
                        ))}
                        <td className="text-right py-2.5 pl-3 font-black text-[#1B2A4A] text-lg">{formatBRL(totalLiquido)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* INFO PONTO */}
        {statusMes.data?.pontoConsolidado && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-800">Ponto Consolidado</p>
              <p className="text-sm text-blue-700">O controle de ponto deste mês está consolidado. A verificação cruzada e custos por obra utilizam os dados do ponto.</p>
            </div>
          </div>
        )}

        {/* UPLOAD PROGRESS */}
        {uploading && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-amber-600 animate-spin shrink-0" />
            <div>
              <p className="font-semibold text-amber-800">Processando importação...</p>
              <p className="text-sm text-amber-700">Os PDFs estão sendo analisados, classificados e processados automaticamente. Aguarde.</p>
            </div>
          </div>
        )}

        {/* ===== DIALOG DE INCONSISTÊNCIAS COM ANÁLISE IA ===== */}
        <FullScreenDialog open={showInconsistDialog} onClose={() => setShowInconsistDialog(false)} title="Consolidação Bloqueada" subtitle="O sistema identificou inconsistências que precisam ser resolvidas antes da consolidação." icon={<AlertTriangle className="h-5 w-5 text-white" />}>
            
            {inconsistDialogData && (() => {
              const msg = inconsistDialogData.message;
              const isInconsistencia = msg.includes('inconsistência');
              const isObra = msg.includes('sem obra vinculada');
              
              return (
                <div className="space-y-4">
                  {/* ALERTA PRINCIPAL */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-red-800 text-sm">O que aconteceu?</p>
                        <p className="text-sm text-red-700 mt-1">
                          {isInconsistencia 
                            ? "Existem funcionários na folha de pagamento com dados que não conferem com o cadastro do sistema. Isso pode causar erros nos relatórios e cálculos."
                            : isObra
                            ? "Existem funcionários que não estão vinculados a nenhuma obra. Para gerar relatórios de custos por obra corretamente, todos precisam estar vinculados."
                            : msg
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ANÁLISE IA AUTOMÁTICA */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Lightbulb className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                      <div className="w-full">
                        <p className="font-semibold text-blue-800 text-sm">Análise Automática — Como Resolver</p>
                        <div className="mt-3 space-y-3">
                          {isInconsistencia && (
                            <>
                              {msg.includes('divergências de dados') && (
                                <div className="bg-white rounded-md p-3 border border-blue-100">
                                  <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                                    <span className="font-semibold text-sm text-amber-800">Divergências de Dados</span>
                                  </div>
                                  <p className="text-xs text-gray-700 mb-2">
                                    Dados como data de admissão, função, salário ou status do funcionário na folha estão diferentes do cadastro.
                                  </p>
                                  <div className="bg-amber-50 rounded p-2 space-y-1.5">
                                    <p className="text-xs font-semibold text-amber-900">Passo a passo para resolver:</p>
                                    <div className="flex items-start gap-2 text-xs text-amber-800">
                                      <span className="bg-amber-200 text-amber-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">1</span>
                                      <span>Clique em <strong>"Detalhes"</strong> no lançamento para ver a lista de divergências</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs text-amber-800">
                                      <span className="bg-amber-200 text-amber-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">2</span>
                                      <span>Filtre por <strong>"Divergentes"</strong> para ver apenas os funcionários com problemas</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs text-amber-800">
                                      <span className="bg-amber-200 text-amber-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">3</span>
                                      <span>Clique no nome do funcionário para expandir e ver qual dado está diferente</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs text-amber-800">
                                      <span className="bg-amber-200 text-amber-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">4</span>
                                      <span>Vá em <strong>Colaboradores</strong> no menu lateral e edite o cadastro do funcionário para corrigir o dado</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs text-amber-800">
                                      <span className="bg-amber-200 text-amber-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">5</span>
                                      <span>Após corrigir, clique em <strong>"Re-Match"</strong> para o sistema reanalisar automaticamente</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {msg.includes('não encontrados') && (
                                <div className="bg-white rounded-md p-3 border border-blue-100">
                                  <div className="flex items-center gap-2 mb-2">
                                    <XCircle className="h-4 w-4 text-red-600" />
                                    <span className="font-semibold text-sm text-red-800">Funcionários Não Encontrados</span>
                                  </div>
                                  <p className="text-xs text-gray-700 mb-2">
                                    Esses funcionários aparecem na folha da contabilidade mas não existem no cadastro do sistema.
                                  </p>
                                  <div className="bg-red-50 rounded p-2 space-y-1.5">
                                    <p className="text-xs font-semibold text-red-900">Passo a passo para resolver:</p>
                                    <div className="flex items-start gap-2 text-xs text-red-800">
                                      <span className="bg-red-200 text-red-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">1</span>
                                      <span>Vá em <strong>Colaboradores</strong> no menu lateral</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs text-red-800">
                                      <span className="bg-red-200 text-red-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">2</span>
                                      <span>Clique em <strong>"+Novo"</strong> e cadastre o funcionário com o mesmo CPF que aparece na folha</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs text-red-800">
                                      <span className="bg-red-200 text-red-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">3</span>
                                      <span>Volte aqui e clique em <strong>"Re-Match"</strong> para vincular automaticamente</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                          {isObra && (
                            <div className="bg-white rounded-md p-3 border border-blue-100">
                              <div className="flex items-center gap-2 mb-2">
                                <MapPin className="h-4 w-4 text-purple-600" />
                                <span className="font-semibold text-sm text-purple-800">Funcionários Sem Obra Vinculada</span>
                              </div>
                              <p className="text-xs text-gray-700 mb-2">
                                Para consolidar, todos os funcionários precisam estar vinculados a uma obra (via ponto ou manualmente).
                              </p>
                              <div className="bg-purple-50 rounded p-2 space-y-1.5">
                                <p className="text-xs font-semibold text-purple-900">Passo a passo para resolver:</p>
                                <div className="flex items-start gap-2 text-xs text-purple-800">
                                  <span className="bg-purple-200 text-purple-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">1</span>
                                  <span>Clique em <strong>"Custos/Obra"</strong> no lançamento</span>
                                </div>
                                <div className="flex items-start gap-2 text-xs text-purple-800">
                                  <span className="bg-purple-200 text-purple-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">2</span>
                                  <span>Veja quais funcionários estão na aba <strong>"Sem Obra"</strong></span>
                                </div>
                                <div className="flex items-start gap-2 text-xs text-purple-800">
                                  <span className="bg-purple-200 text-purple-900 rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-[10px] font-bold">3</span>
                                  <span>Selecione a obra e clique em <strong>"Vincular"</strong> para cada funcionário</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* DICA EXTRA - Apenas para Admin Master */}
                  {isMaster && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <Wrench className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-gray-700">Dica do Sistema</p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Você pode desativar esta verificação em <strong>Configurações &gt; Critérios do Sistema &gt; Folha de Pagamento</strong> alterando o critério "Bloquear consolidação com inconsistências" para Não. Porém, recomendamos manter ativo para garantir a integridade dos dados.
                        </p>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowInconsistDialog(false)}>Fechar</Button>
              <Button onClick={() => { setShowInconsistDialog(false); setFilterStatus("divergente"); setViewMode("detalhes"); }}>
                <Eye className="h-4 w-4 mr-1" /> Ver Detalhes
              </Button>
            </div>
        </FullScreenDialog>

        {/* DIALOG: Conferência com Contabilidade Recomendada */}
        <Dialog open={conferenciaDialog.show} onOpenChange={(open) => setConferenciaDialog(prev => ({ ...prev, show: open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Conferência com Contabilidade
              </DialogTitle>
              <DialogDescription>
                {conferenciaDialog.message}
              </DialogDescription>
            </DialogHeader>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-2">
              <p className="text-sm text-amber-800">
                <strong>Recomendação:</strong> Faça o upload do PDF da contabilidade e confira os valores antes de consolidar. Isso garante que os cálculos internos estão corretos.
              </p>
              <p className="text-xs text-amber-600 mt-2">
                Você pode alterar este comportamento em <strong>Configurações &gt; Critérios do Sistema &gt; Folha de Pagamento</strong>.
              </p>
            </div>
            <DialogFooter className="gap-2 mt-4">
              <Button variant="outline" onClick={() => setConferenciaDialog({ show: false, lancId: 0, message: "" })}>Cancelar</Button>
              <Button variant="default" className="bg-amber-600 hover:bg-amber-700" onClick={() => {
                const lancId = conferenciaDialog.lancId;
                setConferenciaDialog({ show: false, lancId: 0, message: "" });
                consolidarMut.mutate({ folhaLancamentoId: lancId, ignorarConferencia: true });
              }}>
                Consolidar Mesmo Assim
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}

// ===== DESCONTOS CLT VIEW COMPONENT =====
function DescontosCLTView({ companyId, mesAno, lancamentoId, onBack }: { companyId: number; mesAno: string; lancamentoId: number; onBack: () => void }) {
  const { data: comparativo, isLoading } = trpc.folha.comparativoDescontos.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
              <Scale className="h-5 w-5 text-red-700" /> Descontos CLT
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Sistema vs Contabilidade — {mesAno}</p>
          </div>
        </div>
        <PrintActions title={`Comparativo Descontos CLT - ${mesAno}`} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !comparativo?.comparativo?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Scale className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum dado de desconto encontrado para este mês</p>
          <p className="text-xs mt-1">Certifique-se de que os descontos foram calculados no Fechamento de Ponto</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Funcionário</th>
                <th className="text-center px-3 py-2 font-medium">Tipo</th>
                <th className="text-right px-3 py-2 font-medium">Sistema (R$)</th>
                <th className="text-right px-3 py-2 font-medium">Contabilidade (R$)</th>
                <th className="text-right px-3 py-2 font-medium">Diferença (R$)</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {comparativo.comparativo.map((c: any, i: number) => {
                const diff = c.diferenca || 0;
                const hasDiff = Math.abs(diff) > 0.01;
                return (
                  <tr key={i} className={`border-t border-border ${hasDiff ? 'bg-red-50/50' : 'hover:bg-muted/30'}`}>
                    <td className="px-4 py-2 font-medium">{c.nome}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs px-2 py-0.5 rounded bg-muted">{c.tipo}</span>
                    </td>
                    <td className="px-3 py-2 text-right">R$ {(c.valorSistema || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">R$ {(c.valorContabilidade || 0).toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${hasDiff ? 'text-red-700' : 'text-green-700'}`}>
                      {hasDiff ? `R$ ${diff.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {hasDiff ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700"><AlertTriangle className="w-3 h-3" /> Divergente</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle className="w-3 h-3" /> OK</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===== CRUZAMENTO HE VIEW COMPONENT =====
function CruzamentoHEView({ companyId, mesAno, lancamentoId, onBack }: { companyId: number; mesAno: string; lancamentoId: number; onBack: () => void }) {
  const { data: cruzamento, isLoading } = trpc.folha.cruzamentoHE.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-700" /> Cruzamento HE
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Ponto vs Folha — {mesAno}</p>
          </div>
        </div>
        <PrintActions title={`Cruzamento HE - ${mesAno}`} />
      </div>

      {/* Resumo */}
      {cruzamento && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="border border-border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Total HE Sistema</div>
            <div className="text-lg font-bold">{cruzamento.resumo?.totalHeSistema || '0'}h</div>
          </div>
          <div className="border border-border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Total HE Folha</div>
            <div className="text-lg font-bold">R$ {cruzamento.resumo?.totalHeContabValor?.toFixed(2) || '0'}</div>
          </div>
          <div className="border border-border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Divergências</div>
            <div className="text-lg font-bold text-red-700">{cruzamento.resumo?.comHeNaoAutorizada || 0}</div>
          </div>
          <div className="border border-border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Conferidos OK</div>
            <div className="text-lg font-bold text-green-700">{cruzamento.resumo?.totalFuncionarios || 0}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !cruzamento?.cruzamento?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum dado de HE encontrado para cruzamento</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Funcionário</th>
                <th className="text-right px-3 py-2 font-medium">HE Sistema (h)</th>
                <th className="text-right px-3 py-2 font-medium">HE Folha (h)</th>
                <th className="text-right px-3 py-2 font-medium">Diferença (h)</th>
                <th className="text-right px-3 py-2 font-medium">Valor Sistema (R$)</th>
                <th className="text-right px-3 py-2 font-medium">Valor Folha (R$)</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {cruzamento.cruzamento.map((f: any, i: number) => {
                const diffH = (f.heSistema || 0) - (f.heFolha || 0);
                const hasDiff = Math.abs(diffH) > 0.1;
                return (
                  <tr key={i} className={`border-t border-border ${hasDiff ? 'bg-amber-50/50' : 'hover:bg-muted/30'}`}>
                    <td className="px-4 py-2 font-medium">{f.nome}</td>
                    <td className="px-3 py-2 text-right">{(f.heSistema || 0).toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{(f.heFolha || 0).toFixed(1)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${hasDiff ? 'text-red-700' : 'text-green-700'}`}>
                      {hasDiff ? diffH.toFixed(1) : '-'}
                    </td>
                    <td className="px-3 py-2 text-right">R$ {(f.valorSistema || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">R$ {(f.valorFolha || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-center">
                      {hasDiff ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700"><AlertTriangle className="w-3 h-3" /> Divergente</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle className="w-3 h-3" /> OK</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===== DESCONTOS EPI VIEW COMPONENT =====
function DescontosEPIView({ companyId, mesAno, onBack }: { companyId: number; mesAno: string; onBack: () => void }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [validandoId, setValidandoId] = useState<number | null>(null);
  const [acao, setAcao] = useState<"confirmado" | "cancelado">("confirmado");
  const [justificativa, setJustificativa] = useState("");

  const { data: alertas, isLoading, refetch } = trpc.epis.listDiscountAlerts.useQuery(
    { companyId, status: statusFilter === "all" ? undefined : statusFilter as any },
    { enabled: companyId > 0 }
  );

  const validateMut = trpc.epis.validateDiscount.useMutation({
    onSuccess: () => {
      toast.success(acao === "confirmado" ? "Desconto confirmado na folha" : "Desconto cancelado");
      setValidandoId(null);
      setJustificativa("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleValidar = (id: number, action: "confirmado" | "cancelado") => {
    if (validandoId === id && acao === action) {
      setValidandoId(null);
    } else {
      setValidandoId(id);
      setAcao(action);
      setJustificativa("");
    }
  };

  const allAlertas = alertas || [];
  const pendentes = allAlertas.filter((a: any) => a.status === "pendente");
  const confirmados = allAlertas.filter((a: any) => a.status === "confirmado");
  const cancelados = allAlertas.filter((a: any) => a.status === "cancelado");
  const totalPendente = pendentes.reduce((s: number, a: any) => s + parseFloat(String(a.valorTotal || "0")), 0);
  const totalConfirmado = confirmados.reduce((s: number, a: any) => s + parseFloat(String(a.valorTotal || "0")), 0);

  const filteredAlertas = statusFilter === "all" ? allAlertas :
    allAlertas.filter((a: any) => a.status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="text-base sm:text-xl font-bold flex items-center gap-2">
              <HardHat className="h-5 w-5 text-amber-600" /> Descontos de EPI
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Descontos gerados por perda, dano ou mau uso — Art. 462, §1º da CLT
            </p>
          </div>
        </div>
        <PrintActions title={`Descontos EPI - ${mesAno}`} />
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className={`border-l-4 border-l-amber-500 cursor-pointer ${statusFilter === "pendente" ? "ring-2 ring-amber-300" : ""}`} onClick={() => setStatusFilter(statusFilter === "pendente" ? "all" : "pendente")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-xl font-bold text-amber-700">{pendentes.length}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Valor</p>
                <p className="text-sm font-semibold text-amber-700">{formatBRL(totalPendente)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 border-l-green-500 cursor-pointer ${statusFilter === "confirmado" ? "ring-2 ring-green-300" : ""}`} onClick={() => setStatusFilter(statusFilter === "confirmado" ? "all" : "confirmado")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Confirmados</p>
                <p className="text-xl font-bold text-green-700">{confirmados.length}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Valor</p>
                <p className="text-sm font-semibold text-green-700">{formatBRL(totalConfirmado)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 border-l-gray-400 cursor-pointer ${statusFilter === "cancelado" ? "ring-2 ring-gray-300" : ""}`} onClick={() => setStatusFilter(statusFilter === "cancelado" ? "all" : "cancelado")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Cancelados</p>
                <p className="text-xl font-bold text-gray-500">{cancelados.length}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total geral</p>
                <p className="text-sm font-semibold">{(alertas || []).length} registros</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <p className="font-semibold mb-1 flex items-center gap-1"><FileText className="h-4 w-4" /> Como funciona:</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs">
          <li>Motivo <strong>"Perda"</strong>, <strong>"Dano"</strong> ou <strong>"Mau Uso"</strong> gera alerta de desconto automaticamente ao registrar entrega de EPI.</li>
          <li>Valor = preço unitário do EPI + BDI configurado.</li>
          <li>O DP deve validar (confirmar ou cancelar) antes de fechar a folha.</li>
          <li>Se a entrega de EPI for excluída, o desconto pendente é cancelado automaticamente.</li>
          <li>Base legal: <strong>Art. 462, §1º da CLT</strong>.</li>
        </ul>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !filteredAlertas.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{statusFilter === "all" ? "Nenhum desconto de EPI registrado" : `Nenhum desconto ${statusFilter}`}</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Funcionário</th>
                <th className="text-left px-3 py-2 font-medium">EPI</th>
                <th className="text-center px-3 py-2 font-medium">Motivo</th>
                <th className="text-center px-3 py-2 font-medium">Qtd</th>
                <th className="text-right px-3 py-2 font-medium">Unitário</th>
                <th className="text-right px-3 py-2 font-medium">Total</th>
                <th className="text-center px-3 py-2 font-medium">Ref.</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
                <th className="text-center px-3 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlertas.map((a: any) => (
                <tr key={a.id} className={`border-t border-border ${a.status === "pendente" ? "bg-amber-50/30" : a.status === "cancelado" ? "bg-gray-50/50 opacity-60" : "hover:bg-muted/30"}`}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-sm">{a.nomeFunc || "—"}</div>
                    {a.funcaoFunc && <div className="text-xs text-muted-foreground">{a.funcaoFunc}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-sm">{a.epiNome}</div>
                    {a.ca && <div className="text-xs text-muted-foreground">CA {a.ca}</div>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Badge variant="outline" className={`text-xs ${a.motivoCobranca === "mau_uso" ? "border-amber-300 text-amber-700" : a.motivoCobranca === "perda" ? "border-red-300 text-red-700" : "border-orange-300 text-orange-700"}`}>
                      {a.motivoCobranca}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-center font-medium">{a.quantidade}</td>
                  <td className="px-3 py-2 text-right">{formatBRL(a.valorUnitario)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-red-700">{formatBRL(a.valorTotal)}</td>
                  <td className="px-3 py-2 text-center text-xs">{a.mesReferencia}</td>
                  <td className="px-3 py-2 text-center">
                    {a.status === "pendente" && <Badge className="bg-amber-100 text-amber-800 text-xs">Pendente</Badge>}
                    {a.status === "confirmado" && <Badge className="bg-green-100 text-green-800 text-xs">Confirmado</Badge>}
                    {a.status === "cancelado" && <Badge className="bg-gray-100 text-gray-600 text-xs">Cancelado</Badge>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {a.status === "pendente" ? (
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2 border-green-300 text-green-700 hover:bg-green-50" onClick={() => handleValidar(a.id, "confirmado")}>
                          <CheckCircle className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2 border-red-300 text-red-700 hover:bg-red-50" onClick={() => handleValidar(a.id, "cancelado")}>
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{a.validadoPor || "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog de confirmação */}
      <Dialog open={validandoId !== null} onOpenChange={(v) => { if (!v) setValidandoId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {acao === "confirmado" ? "Confirmar Desconto na Folha" : "Cancelar Desconto"}
            </DialogTitle>
            <DialogDescription>
              {acao === "confirmado"
                ? "O valor será descontado na folha de pagamento do funcionário."
                : "O desconto não será lançado na folha."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Justificativa (opcional)"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            className="text-sm"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setValidandoId(null)}>Cancelar</Button>
            <Button
              className={acao === "confirmado" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
              onClick={() => {
                if (validandoId) validateMut.mutate({ id: validandoId, acao, justificativa });
              }}
              disabled={validateMut.isPending}
            >
              {validateMut.isPending && <RefreshCw className="h-3 w-3 animate-spin mr-1" />}
              {acao === "confirmado" ? "Confirmar Desconto" : "Cancelar Desconto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
