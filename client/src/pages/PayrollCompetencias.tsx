import React from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  CalendarDays, ChevronLeft, ChevronRight, Play, Eye, Lock,
  DollarSign, CreditCard, AlertTriangle, CheckCircle, FileText, Users,
  Clock, BarChart3, ShieldCheck,
  ArrowRight, Printer, Ban, Zap, Scale, AlertCircle, XCircle, Wallet,
  Wrench, FileWarning, Check, Sparkles, Bot, Loader2, Upload, FolderUp, X, Trash2, RotateCcw,
  Building2, MapPin, Search, PenLine, ChevronDown, ChevronUp
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import FullScreenDialog from "@/components/FullScreenDialog";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const STATUS_LABELS: Record<string, string> = {
  nao_aberta: "Não Aberta", aberta: "Aberta", ponto_importado: "Ponto Importado",
  aferida: "Aferida", vale_gerado: "Vale Gerado", pagamento_simulado: "Pagamento Simulado",
  consolidada: "Consolidada", travada: "Travada",
};

const STATUS_TO_STEP: Record<string, number> = {
  nao_aberta: 0, aberta: 1, ponto_importado: 2, aferida: 3,
  vale_gerado: 4, pagamento_simulado: 5, consolidada: 6, travada: 7,
};

const WIZARD_STEPS = [
  { id: 0, label: "Abrir Competência", icon: CalendarDays, statusKey: "aberta" },
  { id: 1, label: "Processar Ponto", icon: Clock, statusKey: "ponto_importado" },
  { id: 2, label: "Aferir Escuro", icon: Eye, statusKey: "aferida" },
  { id: 3, label: "Gerar Vale", icon: CreditCard, statusKey: "vale_gerado" },
  { id: 4, label: "Simular Pagamento", icon: DollarSign, statusKey: "pagamento_simulado" },
  { id: 5, label: "Consolidar", icon: CheckCircle, statusKey: "consolidada" },
  { id: 6, label: "Travar Competência", icon: Lock, statusKey: "travada" },
];

function formatBRL(val: string | number | null | undefined): string {
  if (!val && val !== 0) return "R$ 0,00";
  if (typeof val === "number") return `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const str = String(val).replace(/[R$\s]/g, "").trim();
  if (!str) return "R$ 0,00";
  let num: number;
  // If contains comma, it's BRL format (e.g. "2.774,20")
  if (str.includes(",")) {
    num = parseFloat(str.replace(/\./g, "").replace(",", "."));
  } else {
    // Otherwise it's decimal format from DB (e.g. "2421.12")
    num = parseFloat(str);
  }
  if (isNaN(num)) return "R$ 0,00";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const INCONSISTENCIA_LABELS: Record<string, string> = {
  batida_impar: "Batida Ímpar",
  falta_batida: "Falta de Batida",
  sobreposicao_horario: "Sobreposição de Horário",
  entrada_faltando: "Entrada Faltando",
  saida_faltando: "Saída Faltando",
};

const ORIGEM_LABELS: Record<string, { label: string; color: string }> = {
  dixi: { label: "DIXI", color: "bg-blue-100 text-blue-700" },
  manual: { label: "Manual", color: "bg-yellow-100 text-yellow-700" },
  rateado: { label: "Rateado", color: "bg-purple-100 text-purple-700" },
  escuro: { label: "Escuro", color: "bg-gray-100 text-gray-600" },
  aferido: { label: "Aferido", color: "bg-green-100 text-green-700" },
};

// ============================================================
// STAT CARD COMPONENT
// ============================================================
function StatCard({ label, value, icon: Icon, color = "blue" }: { label: string; value: string | number; icon: any; color?: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
    purple: "bg-purple-50 text-purple-700",
  };
  return (
    <div className={`rounded-lg p-3 ${colors[color] || colors.blue}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 opacity-70" />
        <span className="text-xs font-medium opacity-70">{label}</span>
      </div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function PayrollCompetencias() {
  const { user } = useAuth();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const utils = trpc.useUtils();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();

  const now = new Date();
  const [mesAtual, setMesAtual] = useState(now.getMonth() + 1);
  const [anoAtual, setAnoAtual] = useState(now.getFullYear());
  const mesRef = `${anoAtual}-${String(mesAtual).padStart(2, "0")}`;

  const [activeStep, setActiveStep] = useState(0);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; step: string; action: () => void }>({ open: false, step: "", action: () => {} });
  const [resolveDialog, setResolveDialog] = useState<{ open: boolean; record: any }>({ open: false, record: null });
  const [resolveForm, setResolveForm] = useState({ tipo: "ajustar_horario", novaEntrada1: "", novaSaida1: "", novaEntrada2: "", novaSaida2: "", observacao: "" });
  const [showContracheque, setShowContracheque] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [iaAnalysis, setIaAnalysis] = useState<any>(null);
  const [iaLoading, setIaLoading] = useState(false);
  const [limparDialog, setLimparDialog] = useState<{ open: boolean; tipo: "etapa" | "competencia"; etapa?: string; etapaLabel?: string }>({ open: false, tipo: "etapa" });

  // ============================================================
  // QUERIES
  // ============================================================
  const resumo = trpc.payrollEngine.resumoCompetencia.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 }
  );
  const period = trpc.payrollEngine.getPeriod.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 }
  );
  const vales = trpc.payrollEngine.listarVales.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 && activeStep >= 3 }
  );
  const pagamentos = trpc.payrollEngine.listarPagamentos.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 && activeStep >= 4 }
  );
  const timecards = trpc.payrollEngine.listarTimecardDaily.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 && activeStep >= 1 }
  );
  const inconsistencias = trpc.payrollEngine.listarInconsistencias.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 && activeStep >= 1 }
  );
  const resumoIncon = trpc.payrollEngine.resumoInconsistencias.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 && activeStep >= 1 }
  );
  const contracheque = trpc.payrollEngine.gerarContracheque.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 && showContracheque }
  );
  // --- Fechamento de Ponto queries (reutilizados na Etapa 2) ---
  const pontoSummary = trpc.payrollEngine.resumoPontoPorFuncionario.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 && activeStep >= 1 }
  );
  const pontoConflitos = trpc.payrollEngine.conflitosObra.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 && activeStep >= 1 }
  );
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const pontoEspelho = trpc.payrollEngine.espelhoPontoFuncionario.useQuery(
    { companyId, employeeId: selectedEmpId!, mesReferencia: mesRef },
    { enabled: companyId > 0 && selectedEmpId !== null }
  );

  // ============================================================
  // MUTATIONS
  // ============================================================
  const invalidateAll = useCallback(() => {
    utils.payrollEngine.resumoCompetencia.invalidate();
    utils.payrollEngine.getPeriod.invalidate();
    utils.payrollEngine.listarVales.invalidate();
    utils.payrollEngine.listarPagamentos.invalidate();
    utils.payrollEngine.listarTimecardDaily.invalidate();
    utils.payrollEngine.listarInconsistencias.invalidate();
    utils.payrollEngine.resumoInconsistencias.invalidate();
    utils.payrollEngine.resumoPontoPorFuncionario.invalidate();
    utils.payrollEngine.conflitosObra.invalidate();
    if (selectedEmpId) utils.payrollEngine.espelhoPontoFuncionario.invalidate();
  }, [utils, selectedEmpId]);

  const openPeriod = trpc.payrollEngine.openPeriod.useMutation({
    onSuccess: () => { toast.success("Competência aberta com sucesso"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });
  const processarPonto = trpc.payrollEngine.processarPonto.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.message);
      if (data.totalInconsistencias > 0) {
        toast.warning(`${data.totalInconsistencias} inconsistência(s) detectada(s) — resolva antes de avançar`);
      }
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const realizarAfericao = trpc.payrollEngine.realizarAfericao.useMutation({
    onSuccess: (data: any) => { toast.success(data.message); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });
  const gerarVale = trpc.payrollEngine.gerarVale.useMutation({
    onSuccess: (data: any) => { toast.success(data.message); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });
  const simularPagamento = trpc.payrollEngine.simularPagamento.useMutation({
    onSuccess: (data: any) => { toast.success(data.message); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });
  const consolidarPagamento = trpc.payrollEngine.consolidarPagamento.useMutation({
    onSuccess: () => { toast.success("Pagamento consolidado"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });
  const travarCompetencia = trpc.payrollEngine.travarCompetencia.useMutation({
    onSuccess: () => { toast.success("Competência travada"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });
  const resetarEtapa = trpc.payrollEngine.resetarEtapa.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Etapa limpa com sucesso. Novo status: ${STATUS_LABELS[data.newStatus] || data.newStatus}`);
      invalidateAll();
      setLimparDialog({ open: false, tipo: "etapa" });
      setActiveStep(STATUS_TO_STEP[data.newStatus] ?? 0);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const resetarCompetencia = trpc.payrollEngine.resetarCompetencia.useMutation({
    onSuccess: () => {
      toast.success("Competência limpa com sucesso. Todos os dados foram removidos.");
      invalidateAll();
      setLimparDialog({ open: false, tipo: "competencia" });
      setActiveStep(0);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const resolverInconsistencia = trpc.payrollEngine.resolverInconsistencia.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.message);
      setResolveDialog({ open: false, record: null });
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message),
  });
  // DIXI Upload mutations
  const [dixiFiles, setDixiFiles] = useState<File[]>([]);
  const [dixiValidation, setDixiValidation] = useState<any>(null);
  const [dixiUploading, setDixiUploading] = useState(false);
  const [dixiValidating, setDixiValidating] = useState(false);
  const uploadDixi = trpc.fechamentoPonto.uploadDixi.useMutation();
  const validateSN = trpc.fechamentoPonto.validateSN.useMutation({
    onSuccess: (data: any) => { setDixiValidation(data); setDixiValidating(false); },
    onError: (e: any) => { setDixiValidating(false); toast.error("Erro na validação: " + e.message); },
  });
  const handleDixiFilesSelected = async (files: File[]) => {
    setDixiFiles(files);
    setDixiValidation(null);
    if (files.length === 0) return;
    setDixiValidating(true);
    try {
      const filesData = await Promise.all(files.map(async (f) => {
        const buffer = await f.arrayBuffer();
        const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""));
        return { fileName: f.name, fileBase64: base64 };
      }));
      validateSN.mutate({ companyId, companyIds, files: filesData });
    } catch { setDixiValidating(false); }
  };
  const handleDixiUpload = async () => {
    if (dixiFiles.length === 0) return toast.error("Selecione pelo menos um arquivo DIXI");
    if (dixiValidation && !dixiValidation.allValid) return toast.error("Corrija os problemas de SN antes de importar");
    setDixiUploading(true);
    try {
      let totalImported = 0;
      let totalInconsistencies = 0;
      // Upload files one by one to avoid large payloads that fail on mobile Safari
      for (let i = 0; i < dixiFiles.length; i++) {
        const f = dixiFiles[i];
        toast.info(`Importando arquivo ${i + 1} de ${dixiFiles.length}: ${f.name}...`);
        const buffer = await f.arrayBuffer();
        const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""));
        const result = await uploadDixi.mutateAsync({ companyId, companyIds, files: [{ fileName: f.name, fileBase64: base64 }] });
        totalImported += result.totalImported || 0;
        totalInconsistencies += result.totalInconsistencies || 0;
      }
      toast.success(`${totalImported} registros importados de ${dixiFiles.length} arquivo(s)`);
      if (totalInconsistencies > 0) toast.warning(`${totalInconsistencies} inconsistência(s) detectada(s)`);
      setDixiFiles([]);
      setDixiValidation(null);
      setDixiUploading(false);
      invalidateAll();
    } catch (e: any) {
      setDixiUploading(false);
      toast.error("Erro no upload: " + (e?.message || "Falha na conexão. Tente novamente."));
    }
  };

  const analisarIA = trpc.payrollEngine.analisarInconsistenciaIA.useMutation({
    onSuccess: (data: any) => {
      setIaAnalysis(data);
      setIaLoading(false);
      // Auto-fill form with IA suggestions
      setResolveForm(prev => ({
        ...prev,
        tipo: data.resolucaoSugerida || prev.tipo,
        novaEntrada1: data.horariosCorrigidos?.entrada1 || prev.novaEntrada1,
        novaSaida1: data.horariosCorrigidos?.saida1 || prev.novaSaida1,
        novaEntrada2: data.horariosCorrigidos?.entrada2 || prev.novaEntrada2,
        novaSaida2: data.horariosCorrigidos?.saida2 || prev.novaSaida2,
        observacao: data.observacaoSugerida || prev.observacao,
      }));
      toast.success("Análise IA concluída");
    },
    onError: (e: any) => { setIaLoading(false); toast.error("Erro na análise IA: " + e.message); },
  });
  const handlePedirIA = () => {
    if (!resolveDialog.record) return;
    setIaLoading(true);
    setIaAnalysis(null);
    analisarIA.mutate({ companyId, companyIds, timecardDailyId: resolveDialog.record.id, mesReferencia: mesRef });
  };

  // ============================================================
  // DERIVED STATE
  // ============================================================
  const periodData = period.data as any;
  const currentStatus = periodData?.status || "nao_aberta";
  const currentStepFromStatus = STATUS_TO_STEP[currentStatus] ?? 0;
  const pendingInconsistencias = Number(resumoIncon.data?.pendentes) || 0;

  const prevMonth = () => {
    if (mesAtual === 1) { setMesAtual(12); setAnoAtual(anoAtual - 1); }
    else setMesAtual(mesAtual - 1);
    setActiveStep(0);
  };
  const nextMonth = () => {
    if (mesAtual === 12) { setMesAtual(1); setAnoAtual(anoAtual + 1); }
    else setMesAtual(mesAtual + 1);
    setActiveStep(0);
  };

  const confirmAction = (stepLabel: string, action: () => void) => {
    setConfirmDialog({ open: true, step: stepLabel, action });
  };

  const ETAPA_MAP: Record<number, { key: string; label: string }> = {
    1: { key: "ponto", label: "Processar Ponto" },
    2: { key: "escuro", label: "Aferir Escuro" },
    3: { key: "vale", label: "Gerar Vale" },
    4: { key: "pagamento", label: "Simular Pagamento" },
    5: { key: "consolidacao", label: "Consolidar" },
  };

  const handleLimparEtapa = (stepIdx: number) => {
    const etapa = ETAPA_MAP[stepIdx];
    if (!etapa) return;
    setLimparDialog({ open: true, tipo: "etapa", etapa: etapa.key, etapaLabel: etapa.label });
  };

  const handleLimparCompetencia = () => {
    setLimparDialog({ open: true, tipo: "competencia" });
  };

  const executarLimpar = () => {
    if (limparDialog.tipo === "competencia") {
      resetarCompetencia.mutate({ companyId, companyIds, mesReferencia: mesRef });
    } else if (limparDialog.etapa) {
      resetarEtapa.mutate({ companyId, companyIds, mesReferencia: mesRef, etapa: limparDialog.etapa as any });
    }
  };

  const canLimpar = currentStatus !== "nao_aberta" && currentStatus !== "travada";

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2d4a7a] text-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CalendarDays className="w-7 h-7" />
              <div>
                <h1 className="text-xl font-bold">Gestão de Competências</h1>
                <p className="text-sm text-blue-200">Wizard de Fechamento — Passo a Passo</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {canLimpar && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLimparCompetencia}
                  className="text-red-200 hover:text-white hover:bg-red-500/30 text-xs gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  Limpar Competência
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={prevMonth} className="text-white hover:bg-white/10">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div className="text-center min-w-[160px]">
                <div className="text-lg font-bold">{MESES[mesAtual - 1]} {anoAtual}</div>
                <Badge className={`text-xs ${currentStatus === "travada" ? "bg-gray-500" : currentStatus === "consolidada" ? "bg-emerald-500" : "bg-blue-500"} text-white`}>
                  {STATUS_LABELS[currentStatus] || currentStatus}
                </Badge>
              </div>
              <Button variant="ghost" size="icon" onClick={nextMonth} className="text-white hover:bg-white/10">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* WIZARD PROGRESS BAR */}
        <div className="bg-white border-b px-6 py-3">
          <div className="flex items-center justify-between gap-1">
            {WIZARD_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isCompleted = currentStepFromStatus > idx;
              const isCurrent = currentStepFromStatus === idx;
              const isActive = activeStep === idx;
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(idx)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all flex-1 justify-center
                    ${isActive ? "bg-blue-50 ring-2 ring-blue-500 text-blue-700" : ""}
                    ${isCompleted && !isActive ? "bg-green-50 text-green-700" : ""}
                    ${!isCompleted && !isCurrent && !isActive ? "bg-gray-50 text-gray-400" : ""}
                    ${isCurrent && !isActive ? "bg-amber-50 text-amber-700" : ""}
                  `}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                    ${isCompleted ? "bg-green-500 text-white" : ""}
                    ${isCurrent && !isCompleted ? "bg-amber-500 text-white" : ""}
                    ${!isCompleted && !isCurrent ? "bg-gray-300 text-white" : ""}
                  `}>
                    {isCompleted ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                  </div>
                  <span className="hidden lg:inline">{step.label}</span>
                  <Icon className="w-4 h-4 lg:hidden" />
                </button>
              );
            })}
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 overflow-auto p-6 bg-gray-50">
          {activeStep === 0 && (
            <StepAbrirCompetencia
              currentStatus={currentStatus}
              mesAtual={mesAtual}
              anoAtual={anoAtual}
              mesRef={mesRef}
              resumo={resumo.data}
              onAbrir={() => confirmAction("Abrir Competência", () => openPeriod.mutate({ companyId, companyIds, mesReferencia: mesRef }))}
              isLoading={openPeriod.isPending}
              onNext={() => setActiveStep(1)}
            />
          )}
          {activeStep === 1 && (
            <StepProcessarPonto
              currentStatus={currentStatus}
              onProcessar={() => confirmAction("Processar Ponto", () => processarPonto.mutate({ companyId, companyIds, mesReferencia: mesRef }))}
              isLoading={processarPonto.isPending}
              onNext={() => setActiveStep(2)}
              dixiFiles={dixiFiles}
              dixiValidation={dixiValidation}
              dixiUploading={dixiUploading}
              dixiValidating={dixiValidating}
              onDixiFilesSelected={handleDixiFilesSelected}
              onDixiUpload={handleDixiUpload}
              onDixiRemoveFile={(idx: number) => { const nf = [...dixiFiles]; nf.splice(idx, 1); setDixiFiles(nf); setDixiValidation(null); }}
              onLimparEtapa={() => handleLimparEtapa(1)}
              canLimpar={canLimpar && currentStepFromStatus >= 2}
              pontoSummary={pontoSummary.data || []}
              pontoSummaryLoading={pontoSummary.isLoading}
              pontoConflitos={pontoConflitos.data || []}
              selectedEmpId={selectedEmpId}
              setSelectedEmpId={setSelectedEmpId}
              pontoEspelho={pontoEspelho.data || []}
              pontoEspelhoLoading={pontoEspelho.isLoading}
              inconsistencias={inconsistencias.data || []}
              resumoIncon={resumoIncon.data}
              onResolverInconsistencia={(record: any) => {
                setResolveForm({ tipo: "ajustar_horario", novaEntrada1: record.entrada1 || "", novaSaida1: record.saida1 || "", novaEntrada2: record.entrada2 || "", novaSaida2: record.saida2 || "", observacao: "" });
                setResolveDialog({ open: true, record });
              }}
            />
          )}
          {activeStep === 2 && (
            <StepAferirEscuro
              currentStatus={currentStatus}
              resumo={resumo.data}
              onAferir={() => confirmAction("Aferir Escuro", () => realizarAfericao.mutate({ companyId, companyIds, mesReferencia: mesRef }))}
              isLoading={realizarAfericao.isPending}
              onNext={() => setActiveStep(3)}
              onLimparEtapa={() => handleLimparEtapa(2)}
              canLimpar={canLimpar && currentStepFromStatus >= 3}
            />
          )}
          {activeStep === 3 && (
            <StepGerarVale
              currentStatus={currentStatus}
              vales={vales.data as any[] || []}
              resumo={resumo.data}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onGerar={() => confirmAction("Gerar Vale", () => gerarVale.mutate({ companyId, companyIds, mesReferencia: mesRef }))}
              isLoading={gerarVale.isPending}
              onNext={() => setActiveStep(4)}
              onLimparEtapa={() => handleLimparEtapa(3)}
              canLimpar={canLimpar && currentStepFromStatus >= 4}
            />
          )}
          {activeStep === 4 && (
            <StepSimularPagamento
              currentStatus={currentStatus}
              pagamentos={pagamentos.data as any[] || []}
              resumo={resumo.data}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onSimular={() => confirmAction("Simular Pagamento", () => simularPagamento.mutate({ companyId, companyIds, mesReferencia: mesRef }))}
              isLoading={simularPagamento.isPending}
              onContracheque={() => setShowContracheque(true)}
              onNext={() => setActiveStep(5)}
              onLimparEtapa={() => handleLimparEtapa(4)}
              canLimpar={canLimpar && currentStepFromStatus >= 5}
            />
          )}
          {activeStep === 5 && (
            <StepConsolidar
              currentStatus={currentStatus}
              resumo={resumo.data}
              onConsolidar={() => confirmAction("Consolidar Pagamento", () => consolidarPagamento.mutate({ companyId, companyIds, mesReferencia: mesRef }))}
              isLoading={consolidarPagamento.isPending}
              onNext={() => setActiveStep(6)}
              onLimparEtapa={() => handleLimparEtapa(5)}
              canLimpar={canLimpar && currentStepFromStatus >= 6}
            />
          )}
          {activeStep === 6 && (
            <StepTravar
              currentStatus={currentStatus}
              onTravar={() => confirmAction("Travar Competência", () => travarCompetencia.mutate({ companyId, companyIds, mesReferencia: mesRef }))}
              isLoading={travarCompetencia.isPending}
            />
          )}
        </div>
      </div>

      {/* CONFIRM DIALOG */}
      <Dialog open={confirmDialog.open} onOpenChange={(o) => setConfirmDialog({ ...confirmDialog, open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Ação</DialogTitle>
            <DialogDescription>
              Deseja executar a etapa <strong>{confirmDialog.step}</strong> para {MESES[mesAtual - 1]}/{anoAtual}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}>Cancelar</Button>
            <Button onClick={() => { confirmDialog.action(); setConfirmDialog({ ...confirmDialog, open: false }); }}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RESOLVE INCONSISTENCY DIALOG */}
      <Dialog open={resolveDialog.open} onOpenChange={(o) => { if (!o) { setIaAnalysis(null); setIaLoading(false); } setResolveDialog({ ...resolveDialog, open: o }); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-amber-500" />
              Resolver Inconsistência
            </DialogTitle>
            <DialogDescription>
              {resolveDialog.record && (
                <span>
                  <strong>{resolveDialog.record.nomeCompleto}</strong> — {resolveDialog.record.data} —{" "}
                  <Badge variant="outline" className="text-amber-600">{INCONSISTENCIA_LABELS[resolveDialog.record.inconsistencia_tipo] || resolveDialog.record.inconsistencia_tipo}</Badge>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {/* IA Assistant Button */}
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePedirIA}
              disabled={iaLoading}
              className="border-purple-300 text-purple-700 hover:bg-purple-50"
            >
              {iaLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
              {iaLoading ? "Analisando..." : "Pedir Sugestão da IA"}
            </Button>
            {iaAnalysis && (
              <Badge className={`text-xs ${
                iaAnalysis.confianca === 'alta' ? 'bg-green-100 text-green-700' :
                iaAnalysis.confianca === 'media' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                Confiança: {iaAnalysis.confianca}
              </Badge>
            )}
          </div>
          {/* IA Analysis Result */}
          {iaAnalysis && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg mb-2 space-y-2">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-purple-800">Análise da IA</span>
              </div>
              <p className="text-sm text-purple-900">{iaAnalysis.explicacao}</p>
              {iaAnalysis.alertas && (
                <div className="flex items-start gap-2 p-2 bg-amber-50 rounded text-xs text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{iaAnalysis.alertas}</span>
                </div>
              )}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Tipo de Resolução</label>
              <Select value={resolveForm.tipo} onValueChange={(v) => setResolveForm({ ...resolveForm, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ajustar_horario">Ajustar Horário</SelectItem>
                  <SelectItem value="atestado">Atestado Médico</SelectItem>
                  <SelectItem value="advertencia">Emitir Advertência</SelectItem>
                  <SelectItem value="justificar">Justificar</SelectItem>
                  <SelectItem value="abonar">Abonar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {resolveForm.tipo === "ajustar_horario" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Entrada 1</label>
                  <Input value={resolveForm.novaEntrada1} onChange={(e) => setResolveForm({ ...resolveForm, novaEntrada1: e.target.value })} placeholder="07:00" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Saída 1</label>
                  <Input value={resolveForm.novaSaida1} onChange={(e) => setResolveForm({ ...resolveForm, novaSaida1: e.target.value })} placeholder="11:00" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Entrada 2</label>
                  <Input value={resolveForm.novaEntrada2} onChange={(e) => setResolveForm({ ...resolveForm, novaEntrada2: e.target.value })} placeholder="12:00" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Saída 2</label>
                  <Input value={resolveForm.novaSaida2} onChange={(e) => setResolveForm({ ...resolveForm, novaSaida2: e.target.value })} placeholder="16:00" />
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Observação</label>
              <Textarea
                value={resolveForm.observacao}
                onChange={(e) => setResolveForm({ ...resolveForm, observacao: e.target.value })}
                placeholder="Motivo da resolução..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialog({ open: false, record: null })}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!resolveDialog.record) return;
                resolverInconsistencia.mutate({
                  timecardDailyId: resolveDialog.record.id,
                  resolucaoTipo: resolveForm.tipo as any,
                  novaEntrada1: resolveForm.novaEntrada1 || undefined,
                  novaSaida1: resolveForm.novaSaida1 || undefined,
                  novaEntrada2: resolveForm.novaEntrada2 || undefined,
                  novaSaida2: resolveForm.novaSaida2 || undefined,
                  observacao: resolveForm.observacao || undefined,
                });
              }}
              disabled={resolverInconsistencia.isPending}
            >
              {resolverInconsistencia.isPending ? "Salvando..." : "Resolver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* LIMPAR DIALOG */}
      <AlertDialog open={limparDialog.open} onOpenChange={(o) => !o && setLimparDialog({ ...limparDialog, open: false })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {limparDialog.tipo === "competencia" ? (
                <><RotateCcw className="w-5 h-5 text-red-500" /> Limpar Competência Inteira</>
              ) : (
                <><Trash2 className="w-5 h-5 text-amber-500" /> Limpar Etapa: {limparDialog.etapaLabel}</>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {limparDialog.tipo === "competencia" ? (
                <>Todos os dados desta competência serão apagados (ponto, aferição, vale, pagamento, consolidação). A competência voltará ao status "Aberta". <strong>Esta ação não pode ser desfeita.</strong></>
              ) : (
                <>Os dados da etapa <strong>{limparDialog.etapaLabel}</strong> e de todas as etapas posteriores serão apagados. <strong>Esta ação não pode ser desfeita.</strong></>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executarLimpar}
              className={limparDialog.tipo === "competencia" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}
            >
              {(resetarEtapa.isPending || resetarCompetencia.isPending) ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Limpando...</>
              ) : (
                limparDialog.tipo === "competencia" ? "Limpar Tudo" : "Limpar Etapa"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CONTRACHEQUE DIALOG */}
      {showContracheque && (
        <FullScreenDialog
          open={showContracheque}
          onClose={() => setShowContracheque(false)}
          title="Contracheques"
          subtitle={`${MESES[mesAtual - 1]}/${anoAtual}`}
          icon={<FileText className="w-5 h-5" />}
          headerActions={<PrintActions />}
        >
          <div className="p-6 space-y-6">
            <PrintHeader title={`Contracheques — ${MESES[mesAtual - 1]}/${anoAtual}`} />
            {contracheque.data?.contracheques?.map((cc: any, idx: number) => (
              <div key={idx} className="border rounded-lg p-4 page-break-before">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg">{cc.funcionario.nome}</h3>
                    <p className="text-sm text-muted-foreground">{cc.funcionario.funcao} — {cc.funcionario.codigo}</p>
                    <p className="text-sm text-muted-foreground">Obra: {cc.funcionario.obra}</p>
                  </div>
                  <Badge>{cc.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-green-700 mb-2">Proventos</h4>
                    {cc.proventos.map((p: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm py-1 border-b border-dashed">
                        <span>{p.descricao} <span className="text-xs text-muted-foreground">{p.referencia}</span></span>
                        <span className="font-medium">{formatBRL(p.valor)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold text-sm pt-2 text-green-700">
                      <span>Total Proventos</span>
                      <span>{formatBRL(cc.totalProventos)}</span>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-red-700 mb-2">Descontos</h4>
                    {cc.descontos.map((d: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm py-1 border-b border-dashed">
                        <span>{d.descricao} <span className="text-xs text-muted-foreground">{d.referencia}</span></span>
                        <span className="font-medium text-red-600">-{formatBRL(d.valor)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold text-sm pt-2 text-red-700">
                      <span>Total Descontos</span>
                      <span>-{formatBRL(cc.totalDescontos)}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t-2 flex justify-between items-center">
                  <span className="font-bold text-lg">Salário Líquido</span>
                  <span className="font-bold text-xl text-blue-700">{formatBRL(cc.salarioLiquido)}</span>
                </div>
              </div>
            ))}
            <PrintFooterLGPD />
          </div>
        </FullScreenDialog>
      )}
    </DashboardLayout>
  );
}

// ============================================================
// LIMPAR ETAPA BUTTON (reusable)
// ============================================================
function LimparEtapaButton({ onLimpar, canLimpar }: { onLimpar: () => void; canLimpar: boolean }) {
  if (!canLimpar) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onLimpar}
      className="text-amber-600 hover:text-amber-800 hover:bg-amber-50 text-xs gap-1.5"
    >
      <Trash2 className="w-3.5 h-3.5" />
      Limpar Etapa
    </Button>
  );
}

// ============================================================
// STEP COMPONENTS
// ============================================================

function StepAbrirCompetencia({ currentStatus, mesAtual, anoAtual, mesRef, resumo, onAbrir, isLoading, onNext }: any) {
  const isOpen = currentStatus !== "nao_aberta";
  const r = resumo as any;
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <CalendarDays className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold">Etapa 1: Abrir Competência</h2>
            <p className="text-muted-foreground mt-2">
              {MESES[(mesAtual || 1) - 1]} / {anoAtual} — Referência: {mesRef}
            </p>
          </div>
          {!isOpen ? (
            <div className="text-center">
              <p className="text-muted-foreground mb-6">
                Esta competência ainda não foi aberta. Clique abaixo para iniciar o processo de fechamento.
              </p>
              <Button size="lg" onClick={onAbrir} disabled={isLoading} className="px-8">
                <Play className="w-5 h-5 mr-2" />
                {isLoading ? "Abrindo..." : "Abrir Competência"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-800">Competência Aberta</p>
                  <p className="text-sm text-green-600">Status atual: {STATUS_LABELS[currentStatus]}</p>
                </div>
              </div>
              {r && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <StatCard label="Funcionários" value={r.timecard?.totalFuncionarios || 0} icon={Users} />
                  <StatCard label="Registros" value={r.timecard?.totalRegistros || 0} icon={Clock} />
                  <StatCard label="Faltas" value={r.timecard?.totalFaltas || 0} icon={XCircle} color="red" />
                  <StatCard label="Atrasos" value={r.timecard?.totalAtrasos || 0} icon={AlertTriangle} color="amber" />
                </div>
              )}
              <div className="text-center pt-4">
                <Button onClick={onNext} className="px-8">
                  Próxima Etapa <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StepProcessarPonto({ currentStatus, onProcessar, onResolverInconsistencia, isLoading, onNext, dixiFiles, dixiValidation, dixiUploading, dixiValidating, onDixiFilesSelected, onDixiUpload, onDixiRemoveFile, onLimparEtapa, canLimpar, pontoSummary, pontoSummaryLoading, pontoConflitos, selectedEmpId, setSelectedEmpId, pontoEspelho, pontoEspelhoLoading, inconsistencias, resumoIncon }: any) {
  const isProcessed = STATUS_TO_STEP[currentStatus] >= 2;
  const [showAll, setShowAll] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [viewMode, setViewMode] = useState<"resumo" | "inconsistencias" | "conflitos" | "detalhe">("resumo");
  const [filterObra, setFilterObra] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dragOver, setDragOver] = useState(false);

  const dayOfWeek = (dateStr: string) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr + "T12:00:00");
    return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()];
  };
  const formatCPF = (cpf: string) => {
    if (!cpf) return "-";
    const c = cpf.replace(/\D/g, "").padStart(11, "0");
    return `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6,9)}-${c.slice(9,11)}`;
  };

  // Derived data from payrollEngine procedures
  const summaryData = pontoSummary || [];
  const inconsistencies = inconsistencias || [];
  const conflitos = pontoConflitos || [];
  const pendingInconsistencias = inconsistencies.filter((i: any) => Number(i.is_inconsistente) === 1 && Number(i.inconsistencia_resolvida) !== 1).length;
  const totalFaltas = summaryData.reduce((acc: number, e: any) => acc + (Number(e.totalFaltas) || 0), 0);
  const totalAtrasos = summaryData.reduce((acc: number, e: any) => acc + (Number(e.totalAtrasos) || 0), 0);
  const totalRegistros = summaryData.reduce((acc: number, e: any) => acc + (Number(e.totalDias) || 0), 0);

  // Filtered summary
  const filteredSummary = summaryData.filter((emp: any) => {
    const matchName = !searchFilter || emp.employeeName?.toLowerCase().includes(searchFilter.toLowerCase()) || emp.employeeCpf?.includes(searchFilter);
    const matchObra = filterObra === "all" || (emp.obraIds || []).includes(Number(filterObra));
    if (statusFilter === "conforme") return matchName && matchObra && !emp.multiplasObras && !(conflitos || []).some((c: any) => c.employeeId === emp.employeeId);
    if (statusFilter === "problema") return matchName && matchObra && (emp.multiplasObras || (conflitos || []).some((c: any) => c.employeeId === emp.employeeId));
    return matchName && matchObra;
  });

  // Get unique obras from summary
  const obrasList = React.useMemo(() => {
    const map = new Map<number, string>();
    summaryData.forEach((emp: any) => {
      (emp.obraIds || []).forEach((id: number, idx: number) => {
        if (!map.has(id)) map.set(id, emp.obraNomes?.[idx] || `Obra ${id}`);
      });
    });
    return Array.from(map.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [summaryData]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.xls') || f.name.endsWith('.xlsx'));
    if (files.length > 0) onDixiFilesSelected(files);
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onDixiFilesSelected(files);
    e.target.value = '';
  };

  // All data now comes from fechamentoPonto procedures via props (pontoSummary, pontoStats, etc.)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-cyan-100 flex items-center justify-center">
                <Clock className="w-6 h-6 text-cyan-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Etapa 2: Processar Ponto</h2>
                <p className="text-sm text-muted-foreground">Importar registros DIXI, revisar inconsistências e validar ponto</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LimparEtapaButton onLimpar={onLimparEtapa} canLimpar={canLimpar} />
              <Button onClick={onProcessar} disabled={isLoading || currentStatus === "nao_aberta"} size="lg" variant={isProcessed ? "outline" : "default"}>
                <Zap className="w-5 h-5 mr-2" />
                {isLoading ? "Processando..." : isProcessed ? "Reprocessar Ponto" : "Processar Ponto"}
              </Button>
            </div>
          </div>

          {/* DIXI Upload Area - always visible when step is active */}
          {currentStatus !== "nao_aberta" && (
            <div className="mb-6 space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  dragOver ? 'border-cyan-500 bg-cyan-50' : 'border-gray-300 hover:border-cyan-400 hover:bg-gray-50'
                }`}
                onClick={() => document.getElementById('dixi-file-input')?.click()}
              >
                <input id="dixi-file-input" type="file" multiple accept=".xls,.xlsx" onChange={handleFileInput} className="hidden" />
                <FolderUp className={`w-10 h-10 mx-auto mb-3 ${dragOver ? 'text-cyan-500' : 'text-gray-400'}`} />
                <p className="font-medium text-gray-700">Arraste arquivos DIXI aqui ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground mt-1">Aceita múltiplos arquivos .xls/.xlsx (um por relógio/obra)</p>
              </div>

              {/* File List */}
              {dixiFiles && dixiFiles.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {dixiFiles.length} arquivo(s) selecionado(s)
                  </h4>
                  {dixiFiles.map((f: File, idx: number) => {
                    const val = dixiValidation?.results?.[idx];
                    return (
                      <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border ${
                        val ? (val.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50') : 'border-gray-200 bg-gray-50'
                      }`}>
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-gray-500" />
                          <div>
                            <span className="text-sm font-medium">{f.name}</span>
                            {val && (
                              <div className="text-xs mt-0.5">
                                {val.valid ? (
                                  <span className="text-green-600">SN: {val.deviceSerial} → {val.obraNome} ({val.totalRecords} registros)</span>
                                ) : (
                                  <span className="text-red-600">{val.error || 'SN não reconhecido'}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onDixiRemoveFile(idx); }}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                  {dixiValidating && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Validando SN dos equipamentos...
                    </div>
                  )}
                  {dixiValidation && (
                    <div className="flex items-center gap-3">
                      <Badge className={dixiValidation.allValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                        {dixiValidation.allValid ? 'Todos os SN válidos' : 'Problemas de SN detectados'}
                      </Badge>
                      <Button onClick={onDixiUpload} disabled={dixiUploading || !dixiValidation.allValid} size="sm">
                        <Upload className="w-4 h-4 mr-1.5" />
                        {dixiUploading ? 'Importando...' : 'Importar Arquivos'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {isProcessed && viewMode === "detalhe" && selectedEmpId && (
            <>
              {/* ESPELHO DE PONTO - Employee Detail */}
              <div className="mb-4">
                <Button variant="ghost" size="sm" onClick={() => { setViewMode("resumo"); setSelectedEmpId(null); }}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Voltar ao Resumo
                </Button>
              </div>
              {pontoEspelhoLoading ? (
                <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" /><p className="text-sm text-muted-foreground mt-2">Carregando espelho de ponto...</p></div>
              ) : pontoEspelho && pontoEspelho.length > 0 ? (
                <div className="space-y-4">
                  {/* Employee Header */}
                  {(() => {
                    const emp = summaryData.find((e: any) => e.employeeId === selectedEmpId);
                    const empFaltas = pontoEspelho.filter((r: any) => Number(r.isFalta)).length;
                    const empAtrasos = pontoEspelho.filter((r: any) => Number(r.isAtraso)).length;
                    return emp ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-bold">{emp.employeeName}</h3>
                          <p className="text-sm text-muted-foreground">
                            {emp.employeeCode} — {emp.employeeRole} — CPF: {formatCPF(emp.employeeCpf)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="text-red-600 border-red-300">Faltas: {empFaltas}</Badge>
                          <Badge variant="outline" className="text-amber-600 border-amber-300">Atrasos: {empAtrasos}</Badge>
                          <Badge variant="outline">Dias: {pontoEspelho.length}</Badge>
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* Group by obra */}
                  {(() => {
                    const obraMap = new Map<number, { obraNome: string; records: any[] }>();
                    pontoEspelho.forEach((r: any) => {
                      const obraId = r.obraId || 0;
                      if (!obraMap.has(obraId)) obraMap.set(obraId, { obraNome: r.obraNome || 'Sem Obra', records: [] });
                      obraMap.get(obraId)!.records.push(r);
                    });
                    return Array.from(obraMap.entries()).map(([obraId, grupo]) => (
                    <Card key={obraId} className="overflow-hidden">
                      <CardHeader className="py-3 px-4 bg-gray-50">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-emerald-600" />
                          {grupo.obraNome || `Obra ${obraId}`}
                          <Badge variant="outline" className="text-xs ml-auto">{grupo.records?.length || 0} dias</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium w-24">Data</th>
                                <th className="text-center px-2 py-2 font-medium w-12">Dia</th>
                                <th className="text-center px-2 py-2 font-medium text-emerald-700">Entrada</th>
                                <th className="text-center px-2 py-2 font-medium text-orange-700">Saída Int.</th>
                                <th className="text-center px-2 py-2 font-medium text-emerald-700">Retorno</th>
                                <th className="text-center px-2 py-2 font-medium text-orange-700">Saída</th>
                                <th className="text-center px-2 py-2 font-medium">Horas</th>
                                <th className="text-center px-2 py-2 font-medium text-blue-600">H.E.</th>
                                <th className="text-center px-2 py-2 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(grupo.records || []).map((rec: any, idx: number) => {
                                const isSab = dayOfWeek(rec.data) === "Sáb";
                                const isDom = dayOfWeek(rec.data) === "Dom";
                                const isFalta = Number(rec.isFalta);
                                const isAtraso = Number(rec.isAtraso);
                                const isEscuro = rec.statusDia === "escuro";
                                const rowBg = isDom ? "bg-gray-100" : isSab ? "bg-blue-50/30" : isFalta ? "bg-red-50/40" : isEscuro ? "bg-purple-50/30" : idx % 2 === 0 ? "bg-white" : "bg-gray-50/50";
                                const statusLabel = isEscuro ? "Escuro" : isFalta ? "Falta" : isAtraso ? "Atraso" : "OK";
                                const statusColor = isEscuro ? "bg-purple-100 text-purple-700" : isFalta ? "bg-red-100 text-red-700" : isAtraso ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700";
                                return (
                                  <tr key={idx} className={`border-t ${rowBg}`}>
                                    <td className="px-3 py-1.5 font-mono whitespace-nowrap">{rec.data}</td>
                                    <td className={`text-center px-2 py-1.5 font-medium ${isDom ? 'text-red-500' : isSab ? 'text-blue-500' : ''}`}>{dayOfWeek(rec.data)}</td>
                                    <td className="text-center px-2 py-1.5 font-mono text-emerald-700">{rec.entrada1 || "—"}</td>
                                    <td className="text-center px-2 py-1.5 font-mono text-orange-700">{rec.saida1 || "—"}</td>
                                    <td className="text-center px-2 py-1.5 font-mono text-emerald-700">{rec.entrada2 || "—"}</td>
                                    <td className="text-center px-2 py-1.5 font-mono text-orange-700">{rec.saida2 || "—"}</td>
                                    <td className="text-center px-2 py-1.5 font-mono font-medium">{rec.horasTrabalhadas || "—"}</td>
                                    <td className="text-center px-2 py-1.5 font-mono">{rec.horasExtras && rec.horasExtras !== "0:00" ? <span className="text-blue-600 font-medium">{rec.horasExtras}</span> : "—"}</td>
                                    <td className="text-center px-2 py-1.5"><Badge className={`text-[10px] ${statusColor}`}>{statusLabel}</Badge></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-gray-100 font-medium">
                              <tr>
                                <td colSpan={6} className="px-3 py-2 text-right text-xs">Totais da Obra:</td>
                              <td className="text-center px-2 py-2 font-mono text-xs">{(() => { const totalMin = grupo.records.reduce((a: number, r: any) => { const parts = (r.horasTrabalhadas || '0:00').split(':'); return a + (parseInt(parts[0]||'0') * 60 + parseInt(parts[1]||'0')); }, 0); const hh = Math.floor(totalMin / 60); const mm = totalMin % 60; return `${hh}:${String(mm).padStart(2,'0')}`; })()}</td>
                                <td className="text-center px-2 py-2 font-mono text-xs text-blue-600">{(() => { const totalMin = grupo.records.reduce((a: number, r: any) => { const parts = (r.horasExtras || '0:00').split(':'); return a + (parseInt(parts[0]||'0') * 60 + parseInt(parts[1]||'0')); }, 0); if (totalMin === 0) return '\u2014'; const hh = Math.floor(totalMin / 60); const mm = totalMin % 60; return `${hh}:${String(mm).padStart(2,'0')}`; })()}</td>
                                <td className="text-center px-2 py-2 text-xs">
                                  <span className="text-red-600">{grupo.records.filter((r: any) => Number(r.isFalta)).length}F</span> / <span className="text-amber-600">{grupo.records.filter((r: any) => Number(r.isAtraso)).length}A</span>
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  ));
                  })()}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">Nenhum dado encontrado para este funcionário.</div>
              )}
            </>
          )}

          {isProcessed && viewMode !== "detalhe" && (
            <>
              {/* Summary Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <StatCard label="Funcionários" value={summaryData.length} icon={Users} />
                <StatCard label="Registros" value={totalRegistros} icon={FileText} color="green" />
                <StatCard label="Faltas" value={totalFaltas} icon={XCircle} color="red" />
                <StatCard label="Atrasos" value={totalAtrasos} icon={AlertTriangle} color="amber" />
                <StatCard label="Inconsistências" value={pendingInconsistencias} icon={AlertCircle} color="amber" />
              </div>

              {/* Navigation buttons */}
              <div className="flex gap-2 mb-4">
                <Button variant={viewMode === "resumo" ? "default" : "outline"} size="sm" onClick={() => setViewMode("resumo")}>
                  <Users className="w-4 h-4 mr-1.5" /> Resumo ({summaryData.length})
                </Button>
                <Button variant={viewMode === "inconsistencias" ? "default" : "outline"} size="sm" onClick={() => setViewMode("inconsistencias")} className="relative">
                  <FileWarning className="w-4 h-4 mr-1.5" /> Inconsistências
                  {pendingInconsistencias > 0 && <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 inline-flex items-center justify-center">{pendingInconsistencias}</span>}
                </Button>
                <Button variant={viewMode === "conflitos" ? "default" : "outline"} size="sm" onClick={() => setViewMode("conflitos")} className="relative">
                  <Scale className="w-4 h-4 mr-1.5" /> Conflitos de Obras
                  {conflitos.length > 0 && <span className="ml-1.5 bg-purple-500 text-white text-[10px] font-bold rounded-full w-5 h-5 inline-flex items-center justify-center">{conflitos.length}</span>}
                </Button>
              </div>

              {/* VIEW: Resumo por Funcionário */}
              {viewMode === "resumo" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">Resumo do Ponto por Funcionário</h3>
                    <div className="flex items-center gap-2">
                      <Select value={filterObra} onValueChange={setFilterObra}>
                        <SelectTrigger className="w-48 h-8 text-xs">
                          <SelectValue placeholder="Filtrar por obra" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas as Obras</SelectItem>
                          {obrasList.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="conforme">Conformes</SelectItem>
                          <SelectItem value="problema">Com Problemas</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted-foreground" />
                        <Input placeholder="Buscar funcionário ou CPF..." value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} className="w-56 h-8 text-xs pl-8" />
                      </div>
                    </div>
                  </div>
                  <div className="border rounded-lg overflow-auto max-h-[500px]">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Funcionário</th>
                          <th className="text-center px-2 py-2 font-medium">Dias</th>
                          <th className="text-center px-2 py-2 font-medium">Horas</th>
                          <th className="text-center px-2 py-2 font-medium text-red-600">Faltas</th>
                          <th className="text-center px-2 py-2 font-medium text-amber-600">Atrasos</th>
                          <th className="text-center px-2 py-2 font-medium text-blue-600">H.E.</th>
                          <th className="text-left px-2 py-2 font-medium">Obras</th>
                          <th className="text-center px-2 py-2 font-medium">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSummary.map((emp: any) => (
                          <tr key={emp.employeeId} className={`border-t hover:bg-gray-50 cursor-pointer ${emp.totalFaltas > 0 ? 'bg-red-50/30' : ''}`} onClick={() => { setSelectedEmpId(emp.employeeId); setViewMode("detalhe"); }}>
                            <td className="px-3 py-2">
                              <div className="font-medium text-sm">{emp.employeeName}</div>
                              <div className="text-xs text-muted-foreground">{emp.employeeCode} — {emp.employeeRole}</div>
                            </td>
                            <td className="text-center px-2 py-2">{emp.totalDias || 0}</td>
                            <td className="text-center px-2 py-2 font-mono text-xs">{(() => { const ht = emp.horasTrabalhadas || '00:00:00'; const parts = ht.split(':'); return `${parseInt(parts[0]||'0')}:${(parts[1]||'00').padStart(2,'0')}`; })()}</td>
                            <td className="text-center px-2 py-2">
                              {(emp.totalFaltas || 0) > 0 ? <Badge variant="outline" className="text-red-600 border-red-300">{emp.totalFaltas}</Badge> : <span className="text-muted-foreground">0</span>}
                            </td>
                            <td className="text-center px-2 py-2">
                              {(emp.totalAtrasos || 0) > 0 ? <Badge variant="outline" className="text-amber-600 border-amber-300">{emp.totalAtrasos}</Badge> : <span className="text-muted-foreground">0</span>}
                            </td>
                            <td className="text-center px-2 py-2 font-mono text-xs">
                              {(() => { const he = emp.horasExtras || '00:00:00'; const parts = he.split(':'); const hh = parseInt(parts[0]||'0'); const mm = parts[1]||'00'; return hh > 0 || parseInt(mm) > 0 ? <span className="text-blue-600 font-medium">{hh}:{mm.padStart(2,'0')}</span> : <span className="text-muted-foreground">—</span>; })()}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex flex-wrap gap-1">
                                {(emp.obraNomes || []).slice(0, 2).map((o: string, i: number) => (
                                  <Badge key={i} variant="outline" className="text-[10px] py-0">{o}</Badge>
                                ))}
                                {(emp.obraNomes || []).length > 2 && <Badge variant="outline" className="text-[10px] py-0">+{emp.obraNomes.length - 2}</Badge>}
                              </div>
                            </td>
                            <td className="text-center px-2 py-2">
                              <Button size="sm" variant="ghost" className="text-xs" onClick={(e) => { e.stopPropagation(); setSelectedEmpId(emp.employeeId); setViewMode("detalhe"); }}>
                                <Eye className="w-3.5 h-3.5 mr-1" /> Espelho
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {filteredSummary.length} de {summaryData.length} funcionários
                  </div>
                </div>
              )}

              {/* VIEW: Inconsistências */}
              {viewMode === "inconsistencias" && (
                <div>
                  {inconsistencies.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold flex items-center gap-2 text-sm">
                          <FileWarning className="w-4 h-4 text-amber-500" />
                          Inconsistências ({inconsistencies.length})
                        </h3>
                        <Input placeholder="Buscar funcionário..." value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} className="w-64 h-8 text-sm" />
                      </div>
                      <div className="border rounded-lg overflow-auto max-h-[500px]">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">Funcionário</th>
                              <th className="text-left px-3 py-2 font-medium">Data</th>
                              <th className="text-left px-3 py-2 font-medium">Tipo</th>
                              <th className="text-left px-3 py-2 font-medium">Batidas</th>
                              <th className="text-left px-3 py-2 font-medium">Obra</th>
                              <th className="text-center px-3 py-2 font-medium">Status</th>
                              <th className="text-center px-3 py-2 font-medium">Ação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inconsistencies.filter((r: any) => !searchFilter || r.nomeCompleto?.toLowerCase().includes(searchFilter.toLowerCase())).slice(0, showAll ? undefined : 30).map((r: any) => (
                              <tr key={r.id} className="border-t hover:bg-amber-50/50">
                                <td className="px-3 py-2">
                                  <div className="font-medium">{r.nomeCompleto}</div>
                                  <div className="text-xs text-muted-foreground">{r.codigoInterno} — {r.funcao}</div>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">{r.data}</td>
                                <td className="px-3 py-2">
                                  <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                                    {INCONSISTENCIA_LABELS[r.inconsistencia_tipo] || r.inconsistencia_tipo}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">
                                  {r.entrada1 || "—"} / {r.saida1 || "—"} / {r.entrada2 || "—"} / {r.saida2 || "—"}
                                  <div className="text-muted-foreground">{r.num_batidas} batida(s)</div>
                                </td>
                                <td className="px-3 py-2 text-xs">{r.obraNome || "—"}</td>
                                <td className="px-3 py-2 text-center">
                                  <Badge className={`text-xs ${Number(r.inconsistencia_resolvida) === 1 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {Number(r.inconsistencia_resolvida) === 1 ? 'Resolvida' : 'Pendente'}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {Number(r.inconsistencia_resolvida) !== 1 && (
                                    <Button size="sm" variant="outline" onClick={() => onResolverInconsistencia(r)} className="text-xs">
                                      <Wrench className="w-3.5 h-3.5 mr-1" /> Resolver
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {inconsistencies.length > 30 && !showAll && (
                          <div className="text-center py-2 border-t">
                            <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>Ver todos ({inconsistencies.length})</Button>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
                      <p className="font-medium text-green-700">Nenhuma inconsistência pendente</p>
                      <p className="text-sm mt-1">Todos os registros de ponto estão consistentes.</p>
                    </div>
                  )}
                </div>
              )}

              {/* VIEW: Conflitos de Obras */}
              {viewMode === "conflitos" && (
                <div>
                  {conflitos.length > 0 ? (
                    <>
                      <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Scale className="w-5 h-5 text-purple-600" />
                          <span className="font-semibold text-purple-800">{conflitos.length} conflito(s) de obras detectado(s)</span>
                        </div>
                        <p className="text-xs text-purple-700 mt-1">Funcionários que bateram ponto em mais de uma obra no mesmo dia.</p>
                      </div>
                      <div className="border rounded-lg overflow-auto max-h-[500px]">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">Funcionário</th>
                              <th className="text-left px-3 py-2 font-medium">Data</th>
                              <th className="text-left px-3 py-2 font-medium">Obras (com horários)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {conflitos.map((c: any, idx: number) => (
                              <tr key={idx} className="border-t hover:bg-purple-50/50">
                                <td className="px-3 py-2">
                                  <div className="font-medium">{c.employeeName}</div>
                                  <div className="text-xs text-muted-foreground">{c.employeeCode}</div>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">{c.data} <span className="text-muted-foreground text-xs">({dayOfWeek(c.data)})</span></td>
                                <td className="px-3 py-2">
                                  <div className="space-y-1">
                                    {(c.obras || []).map((o: any, i: number) => (
                                      <div key={i} className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-xs text-purple-700 border-purple-300">{o.obraNome}</Badge>
                                        <span className="font-mono text-xs text-muted-foreground">
                                          {o.entrada1 || "—"}–{o.saida1 || "—"} / {o.entrada2 || "—"}–{o.saida2 || "—"}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
                      <p className="font-medium text-green-700">Nenhum conflito de obras</p>
                      <p className="text-sm mt-1">Nenhum funcionário bateu ponto em mais de uma obra no mesmo dia.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Action bar */}
              <div className="text-center pt-6 border-t mt-6">
                {pendingInconsistencias > 0 ? (
                  <div className="flex items-center justify-center gap-2 text-amber-600">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-medium">Resolva todas as {pendingInconsistencias} inconsistência(s) antes de avançar</span>
                  </div>
                ) : (
                  <Button onClick={onNext} className="px-8" size="lg">
                    Próxima Etapa <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </div>
            </>
          )}

          {!isProcessed && (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Importe os arquivos DIXI acima e clique em "Processar Ponto" para gerar os registros do período.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StepAferirEscuro({ currentStatus, resumo, onAferir, isLoading, onNext, onLimparEtapa, canLimpar }: any) {
  const isAferido = STATUS_TO_STEP[currentStatus] >= 3;
  const r = resumo as any;
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Eye className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Etapa 3: Aferir Escuro</h2>
                <p className="text-sm text-muted-foreground">Cruzar ponto real com período "no escuro" do mês anterior</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LimparEtapaButton onLimpar={onLimparEtapa} canLimpar={canLimpar} />
              {!isAferido && (
                <Button onClick={onAferir} disabled={isLoading || STATUS_TO_STEP[currentStatus] < 2} size="lg">
                  <Eye className="w-5 h-5 mr-2" />
                  {isLoading ? "Aferindo..." : "Realizar Aferição"}
                </Button>
              )}
            </div>
          </div>
          {isAferido ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-800">Aferição Concluída</p>
                  <p className="text-sm text-green-600">
                    {r?.timecard?.aferidos || 0} dias aferidos
                  </p>
                </div>
              </div>
              <div className="text-center pt-4">
                <Button onClick={onNext} className="px-8">
                  Próxima Etapa <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Eye className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>A aferição cruza os registros reais com os dias presumidos "no escuro".</p>
              <p className="text-sm mt-1">Divergências encontradas gerarão descontos automáticos.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StepGerarVale({ currentStatus, vales, resumo, searchTerm, setSearchTerm, onGerar, isLoading, onNext, onLimparEtapa, canLimpar }: any) {
  const isGerado = STATUS_TO_STEP[currentStatus] >= 4;
  const r = resumo as any;
  const filteredVales = (vales || []).filter((v: any) =>
    !searchTerm || v.nomeCompleto?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Etapa 4: Gerar Vale / Adiantamento</h2>
                <p className="text-sm text-muted-foreground">Calcular adiantamento salarial com base nos critérios</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LimparEtapaButton onLimpar={onLimparEtapa} canLimpar={canLimpar} />
              {!isGerado && (
                <Button onClick={onGerar} disabled={isLoading || STATUS_TO_STEP[currentStatus] < 3} size="lg">
                  <DollarSign className="w-5 h-5 mr-2" />
                  {isLoading ? "Gerando..." : "Gerar Vale"}
                </Button>
              )}
            </div>
          </div>

          {isGerado && filteredVales.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <StatCard label="Total Funcionários" value={r?.advances?.totalVales || filteredVales.length} icon={Users} />
                <StatCard label="Bloqueados" value={r?.advances?.bloqueados || 0} icon={Ban} color="red" />
                <StatCard label="Total Vale" value={formatBRL(r?.advances?.totalVale)} icon={Wallet} color="green" />
              </div>
              <div className="flex justify-end mb-3">
                <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-64 h-8 text-sm" />
              </div>
              <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Funcionário</th>
                      <th className="text-right px-3 py-2">Salário Base</th>
                      <th className="text-right px-3 py-2">% Adiant.</th>
                      <th className="text-right px-3 py-2">Vale</th>
                      <th className="text-right px-3 py-2">HE</th>
                      <th className="text-right px-3 py-2 font-bold">Total</th>
                      <th className="text-center px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVales.map((v: any) => (
                      <tr key={v.id} className={`border-t ${v.bloqueado ? "bg-red-50" : ""}`}>
                        <td className="px-3 py-2">
                          <div className="font-medium">{v.nomeCompleto}</div>
                          <div className="text-xs text-muted-foreground">{v.codigoInterno}</div>
                        </td>
                        <td className="px-3 py-2 text-right">{formatBRL(v.salarioBrutoMes)}</td>
                        <td className="px-3 py-2 text-right">{v.percentualAdiantamento}%</td>
                        <td className="px-3 py-2 text-right">{formatBRL(v.valorAdiantamento)}</td>
                        <td className="px-3 py-2 text-right">{formatBRL(v.valorHorasExtras)}</td>
                        <td className="px-3 py-2 text-right font-bold">{formatBRL(v.valorTotalVale)}</td>
                        <td className="px-3 py-2 text-center">
                          {v.bloqueado ? (
                            <Badge variant="destructive" className="text-xs">{v.motivoBloqueio?.substring(0, 30)}</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-700 text-xs">OK</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-center pt-4">
                <Button onClick={onNext} className="px-8">
                  Próxima Etapa <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          )}

          {!isGerado && (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>O vale será calculado com base no percentual de adiantamento configurado nos critérios.</p>
              <p className="text-sm mt-1">Funcionários com mais faltas que o limite serão bloqueados automaticamente.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StepSimularPagamento({ currentStatus, pagamentos, resumo, searchTerm, setSearchTerm, onSimular, isLoading, onContracheque, onNext, onLimparEtapa, canLimpar }: any) {
  const isSimulado = STATUS_TO_STEP[currentStatus] >= 5;
  const r = resumo as any;
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const filteredPag = (pagamentos || []).filter((p: any) =>
    !searchTerm || p.nomeCompleto?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Etapa 5: Simular Pagamento</h2>
                <p className="text-sm text-muted-foreground">Preview completo da folha com todos os descontos</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LimparEtapaButton onLimpar={onLimparEtapa} canLimpar={canLimpar} />
              {isSimulado && (
                <Button variant="outline" onClick={onContracheque}>
                  <Printer className="w-4 h-4 mr-2" /> Contracheques
                </Button>
              )}
              {!isSimulado && (
                <Button onClick={onSimular} disabled={isLoading || STATUS_TO_STEP[currentStatus] < 4} size="lg">
                  <Scale className="w-5 h-5 mr-2" />
                  {isLoading ? "Simulando..." : "Simular Pagamento"}
                </Button>
              )}
            </div>
          </div>

          {isSimulado && filteredPag.length > 0 && (
            <>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <StatCard label="Funcionários" value={r?.payments?.totalPagamentos || filteredPag.length} icon={Users} />
                <StatCard label="Total Bruto" value={formatBRL(r?.payments?.totalBruto)} icon={BarChart3} color="blue" />
                <StatCard label="Descontos" value={formatBRL(r?.payments?.totalDescontos)} icon={XCircle} color="red" />
                <StatCard label="Líquido" value={formatBRL(r?.payments?.totalLiquido)} icon={Wallet} color="green" />
              </div>
              <div className="flex justify-end mb-3">
                <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-64 h-8 text-sm" />
              </div>
              <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Funcionário</th>
                      <th className="text-right px-3 py-2">Bruto</th>
                      <th className="text-right px-3 py-2">HE</th>
                      <th className="text-right px-3 py-2">Adiant.</th>
                      <th className="text-right px-3 py-2">Faltas</th>
                      <th className="text-right px-3 py-2">Desc. Total</th>
                      <th className="text-right px-3 py-2 font-bold">Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPag.map((p: any) => {
                      const rateio = typeof p.rateioPorObra === 'string' ? JSON.parse(p.rateioPorObra || '[]') : (p.rateioPorObra || []);
                      const isExpanded = expandedId === p.id;
                      return (
                        <React.Fragment key={p.id}>
                          <tr className="border-t cursor-pointer hover:bg-gray-50" onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                <div>
                                  <div className="font-medium">{p.nomeCompleto}</div>
                                  <div className="text-xs text-muted-foreground">{p.codigoInterno} — {p.funcao}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">{formatBRL(p.salarioBrutoMes)}</td>
                            <td className="px-3 py-2 text-right">{formatBRL(p.horasExtrasValor)}</td>
                            <td className="px-3 py-2 text-right text-red-600">-{formatBRL(p.descontoAdiantamento)}</td>
                            <td className="px-3 py-2 text-right text-red-600">-{formatBRL(p.descontoFaltas)}</td>
                            <td className="px-3 py-2 text-right text-red-600 font-medium">-{formatBRL(p.totalDescontos)}</td>
                            <td className="px-3 py-2 text-right font-bold text-blue-700">{formatBRL(p.salarioLiquido)}</td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-gray-50">
                              <td colSpan={7} className="px-4 py-3">
                                <div className="grid grid-cols-2 gap-4">
                                  {/* Detalhamento de Beneficios e Encargos */}
                                  <div>
                                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Benefícios & Encargos</h4>
                                    <div className="grid grid-cols-2 gap-1 text-xs">
                                      <span className="text-muted-foreground">VA:</span><span>{formatBRL(p.vaValor)}</span>
                                      <span className="text-muted-foreground">VT:</span><span>{formatBRL(p.vtValor)}</span>
                                      <span className="text-muted-foreground">VR:</span><span>{formatBRL(p.vrValor)}</span>
                                      <span className="text-muted-foreground">Seguro Vida:</span><span>{formatBRL(p.seguroVidaValor)}</span>
                                      <span className="text-muted-foreground">FGTS:</span><span>{formatBRL(p.descontoFgts || p.fgtsValor)}</span>
                                      <span className="text-muted-foreground">INSS:</span><span>{formatBRL(p.descontoInss || p.inssValor)}</span>
                                      <span className="text-muted-foreground">Pensão:</span><span>{formatBRL(p.descontoPensao)}</span>
                                      <span className="text-muted-foreground">Desc. VR Faltas:</span><span className="text-red-600">-{formatBRL(p.descontoVrFaltas)}</span>
                                      <span className="text-muted-foreground">Desc. VT Faltas:</span><span className="text-red-600">-{formatBRL(p.descontoVtFaltas)}</span>
                                      <span className="text-muted-foreground">Acerto Escuro:</span><span className="text-red-600">-{formatBRL(p.acertoEscuroValor)}</span>
                                    </div>
                                  </div>
                                  {/* Rateio por Obra */}
                                  <div>
                                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Rateio por Obra</h4>
                                    {rateio.length > 0 ? (
                                      <div className="space-y-1">
                                        {rateio.map((ro: any, i: number) => (
                                          <div key={i} className="text-xs p-2 bg-white rounded border">
                                            <div className="flex justify-between font-medium">
                                              <span>{ro.obraNome}</span>
                                              <span>{ro.dias} dias ({Math.round(ro.proporcao * 100)}%)</span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-1 mt-1 text-muted-foreground">
                                              <span>Sal: {formatBRL(ro.salario)}</span>
                                              <span>FGTS: {formatBRL(ro.fgts)}</span>
                                              <span>INSS: {formatBRL(ro.inss)}</span>
                                              <span>VA: {formatBRL(ro.va)}</span>
                                              <span>VT: {formatBRL(ro.vt)}</span>
                                              <span>VR: {formatBRL(ro.vr)}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">Sem dados de rateio disponíveis</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-center pt-4">
                <Button onClick={onNext} className="px-8">
                  Próxima Etapa <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          )}

          {!isSimulado && (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>A simulação calcula o salário líquido de cada funcionário.</p>
              <p className="text-sm mt-1">Inclui descontos de faltas, atrasos, VR, VT, pensão e acerto do escuro.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StepConsolidar({ currentStatus, resumo, onConsolidar, isLoading, onNext, onLimparEtapa, canLimpar }: any) {
  const isConsolidado = STATUS_TO_STEP[currentStatus] >= 6;
  const r = resumo as any;
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold">Etapa 6: Consolidar Pagamento</h2>
            <p className="text-muted-foreground mt-2">Confirmar todos os valores e gerar eventos financeiros</p>
            {canLimpar && <div className="mt-2"><LimparEtapaButton onLimpar={onLimparEtapa} canLimpar={canLimpar} /></div>}
          </div>
          {!isConsolidado ? (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <span className="font-semibold text-amber-800">Atenção</span>
                </div>
                <p className="text-sm text-amber-700">
                  Após a consolidação, os valores serão registrados como eventos financeiros definitivos.
                  Verifique todos os contracheques antes de prosseguir.
                </p>
              </div>
              {r && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-700">{formatBRL(r.payments?.totalBruto)}</div>
                    <div className="text-sm text-muted-foreground">Total Bruto</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-700">{formatBRL(r.payments?.totalDescontos)}</div>
                    <div className="text-sm text-muted-foreground">Total Descontos</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-700">{formatBRL(r.payments?.totalLiquido)}</div>
                    <div className="text-sm text-muted-foreground">Total Líquido</div>
                  </div>
                </div>
              )}
              <div className="text-center">
                <Button size="lg" onClick={onConsolidar} disabled={isLoading || STATUS_TO_STEP[currentStatus] < 5} className="px-8 bg-emerald-600 hover:bg-emerald-700">
                  <ShieldCheck className="w-5 h-5 mr-2" />
                  {isLoading ? "Consolidando..." : "Consolidar Pagamento"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-800">Pagamento Consolidado</p>
                  <p className="text-sm text-green-600">Eventos financeiros gerados com sucesso</p>
                </div>
              </div>
              <div className="text-center pt-4">
                <Button onClick={onNext} className="px-8">
                  Próxima Etapa <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StepTravar({ currentStatus, onTravar, isLoading }: any) {
  const isTravado = currentStatus === "travada";
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isTravado ? "bg-gray-200" : "bg-red-100"}`}>
              <Lock className={`w-8 h-8 ${isTravado ? "text-gray-500" : "text-red-600"}`} />
            </div>
            <h2 className="text-2xl font-bold">Etapa 7: Travar Competência</h2>
            <p className="text-muted-foreground mt-2">Bloqueio definitivo — nenhuma alteração será possível após esta ação</p>
          </div>
          {!isTravado ? (
            <div className="space-y-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <span className="font-semibold text-red-800">Ação Irreversível</span>
                </div>
                <p className="text-sm text-red-700">
                  Ao travar a competência, todos os dados ficam em modo somente leitura.
                  Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="text-center">
                <Button size="lg" variant="destructive" onClick={onTravar} disabled={isLoading || STATUS_TO_STEP[currentStatus] < 6} className="px-8">
                  <Lock className="w-5 h-5 mr-2" />
                  {isLoading ? "Travando..." : "Travar Competência"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-gray-100 rounded-lg">
              <Lock className="w-6 h-6 text-gray-500" />
              <div>
                <p className="font-semibold text-gray-700">Competência Travada</p>
                <p className="text-sm text-gray-500">Nenhuma alteração é permitida nesta competência.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
