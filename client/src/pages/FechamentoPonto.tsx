import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { formatCPF } from "@/lib/formatters";
import {
  Clock, Upload, FileSpreadsheet, Users, CalendarDays, AlertTriangle,
  PenLine, Eye, ChevronLeft, ChevronRight, CheckCircle, XCircle, Shield, Search,
  Trash2, Building2, AlertCircle, MapPin, Info, Wifi, Lock, Unlock, UserCheck
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useRef, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import RaioXFuncionario from "@/components/RaioXFuncionario";

type ViewMode = "resumo" | "inconsistencias" | "detalhe" | "rateio";
type CardFilter = null | "colaboradores" | "registros" | "inconsistencias" | "ajustes" | "multiplasObras" | "conflitos";

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function formatMesAno(mesAno: string): string {
  const [ano, mes] = mesAno.split("-");
  return `${MESES[parseInt(mes, 10) - 1]} ${ano}`;
}

export default function FechamentoPonto() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const now = new Date();
  const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());
  const [mesSelecionado, setMesSelecionado] = useState(now.getMonth() + 1);
  const mesAno = `${anoSelecionado}-${String(mesSelecionado).padStart(2, "0")}`;

  const [viewMode, setViewMode] = useState<ViewMode>("resumo");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showConsolidarDialog, setShowConsolidarDialog] = useState(false);
  const [showDesconsolidarDialog, setShowDesconsolidarDialog] = useState(false);
  const [selectedInconsistency, setSelectedInconsistency] = useState<any>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterObra, setFilterObra] = useState<string>("all");
  const [cardFilter, setCardFilter] = useState<CardFilter>(null);
  const [clearType, setClearType] = useState<string>("tudo");
  const [consolidarObs, setConsolidarObs] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [manualData, setManualData] = useState({
    employeeId: 0, obraId: 0, data: "", entrada1: "", saida1: "", entrada2: "", saida2: "", justificativa: "",
  });
  const [resolveData, setResolveData] = useState({ status: "justificado" as string, justificativa: "" });

  // ===== QUERIES =====
  const stats = trpc.fechamentoPonto.getStats.useQuery({ companyId, mesReferencia: mesAno }, { enabled: companyId > 0 });
  const summary = trpc.fechamentoPonto.getSummary.useQuery({ companyId, mesReferencia: mesAno }, { enabled: companyId > 0 });
  const inconsistencies = trpc.fechamentoPonto.listInconsistencies.useQuery({ companyId, mesReferencia: mesAno }, { enabled: companyId > 0 });
  const employeeDetail = trpc.fechamentoPonto.getEmployeeDetail.useQuery(
    { companyId, employeeId: selectedEmployeeId!, mesReferencia: mesAno },
    { enabled: companyId > 0 && selectedEmployeeId !== null }
  );
  const obrasList = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const employeesList = trpc.employees.list.useQuery({ companyId }, { enabled: companyId > 0 });
  const monthStatuses = trpc.fechamentoPonto.getMonthStatuses.useQuery({ companyId, ano: anoSelecionado }, { enabled: companyId > 0 });
  const consolidacaoStatus = trpc.fechamentoPonto.getConsolidacaoStatus.useQuery({ companyId, mesReferencia: mesAno }, { enabled: companyId > 0 });
  const conflitos = trpc.fechamentoPonto.getConflitosObraDia.useQuery({ companyId, mesReferencia: mesAno }, { enabled: companyId > 0 });
  const rateioData = trpc.fechamentoPonto.getRateioPorObra.useQuery(
    { companyId, mesReferencia: mesAno }, { enabled: companyId > 0 && viewMode === "rateio" }
  );

  const isConsolidado = consolidacaoStatus.data?.consolidado === true;

  // ===== MUTATIONS =====
  const uploadMut = trpc.fechamentoPonto.uploadDixi.useMutation({
    onSuccess: (data) => {
      setUploadResult(data);
      stats.refetch(); summary.refetch(); inconsistencies.refetch(); monthStatuses.refetch(); conflitos.refetch();
      toast.success(`${data.totalImported} registros importados com sucesso!`);
    },
    onError: (err) => toast.error("Erro no upload: " + err.message),
  });
  const validateMut = trpc.fechamentoPonto.validateSN.useMutation();
  const manualMut = trpc.fechamentoPonto.manualEntry.useMutation({
    onSuccess: () => {
      setShowManualDialog(false);
      stats.refetch(); summary.refetch(); conflitos.refetch();
      if (selectedEmployeeId) employeeDetail.refetch();
      toast.success("Registro manual salvo com sucesso!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });
  const resolveMut = trpc.fechamentoPonto.resolveInconsistency.useMutation({
    onSuccess: () => {
      setShowResolveDialog(false);
      inconsistencies.refetch(); stats.refetch();
      toast.success("Inconsistência resolvida!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });
  const clearMut = trpc.fechamentoPonto.clearMonthData.useMutation({
    onSuccess: () => {
      setShowClearDialog(false);
      stats.refetch(); summary.refetch(); inconsistencies.refetch(); monthStatuses.refetch(); conflitos.refetch();
      toast.success("Base de dados limpa com sucesso!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });
  const consolidarMut = trpc.fechamentoPonto.consolidarMes.useMutation({
    onSuccess: (data) => {
      setShowConsolidarDialog(false);
      consolidacaoStatus.refetch(); monthStatuses.refetch();
      toast.success(`Mês consolidado por ${data.consolidadoPor}`);
    },
    onError: (err) => toast.error(err.message),
  });
  const desconsolidarMut = trpc.fechamentoPonto.desconsolidarMes.useMutation({
    onSuccess: () => {
      setShowDesconsolidarDialog(false);
      consolidacaoStatus.refetch(); monthStatuses.refetch();
      toast.success("Mês desconsolidado com sucesso!");
    },
    onError: (err) => toast.error(err.message),
  });

  // ===== COMPUTED =====
  const multiSiteCount = useMemo(() => {
    if (!summary.data) return 0;
    return summary.data.filter((e: any) => e.multiplasObras).length;
  }, [summary.data]);

  const conflitosCount = useMemo(() => (conflitos.data || []).length, [conflitos.data]);

  const filteredSummary = useMemo(() => {
    if (!summary.data) return [];
    let data = summary.data;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter((e: any) => e.employeeName?.toLowerCase().includes(term) || e.employeeCpf?.includes(term));
    }
    if (filterObra && filterObra !== "all") {
      data = data.filter((e: any) => {
        const ids = e.obraIds || (e.obraId ? [e.obraId] : []);
        return ids.includes(parseInt(filterObra, 10));
      });
    }
    if (cardFilter === "ajustes") data = data.filter((e: any) => e.temAjusteManual);
    if (cardFilter === "multiplasObras") data = data.filter((e: any) => e.multiplasObras);
    if (cardFilter === "conflitos") {
      const conflitosEmpIds = new Set((conflitos.data || []).map((c: any) => c.employeeId));
      data = data.filter((e: any) => conflitosEmpIds.has(e.employeeId));
    }
    return data;
  }, [summary.data, searchTerm, filterObra, cardFilter, conflitos.data]);

  // ===== HANDLERS =====
  const handleFilesSelected = async (files: File[]) => {
    setUploadFiles(files);
    setUploadResult(null);
    setValidationResult(null);
    if (files.length === 0) return;
    setValidating(true);
    try {
      const filesData = await Promise.all(
        files.map(async (f) => {
          const buffer = await f.arrayBuffer();
          const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""));
          return { fileName: f.name, fileBase64: base64 };
        })
      );
      const result = await validateMut.mutateAsync({ companyId, files: filesData });
      setValidationResult(result);
    } catch (e: any) {
      toast.error("Erro na validação: " + e.message);
    } finally {
      setValidating(false);
    }
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return toast.error("Selecione pelo menos um arquivo DIXI");
    if (validationResult && !validationResult.allValid) {
      return toast.error("Corrija os problemas de SN antes de importar.");
    }
    setUploading(true);
    setUploadResult(null);
    try {
      const filesData = await Promise.all(
        uploadFiles.map(async (f) => {
          const buffer = await f.arrayBuffer();
          const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""));
          return { fileName: f.name, fileBase64: base64 };
        })
      );
      await uploadMut.mutateAsync({ companyId, files: filesData });
    } catch (e) { /* handled */ } finally {
      setUploading(false);
    }
  };

  const dayOfWeek = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()];
  };

  const openRaioX = (empId: number) => setRaioXEmployeeId(empId);

  // ===== MONTH STATUS COLORS =====
  const getMonthStatus = (mes: number) => {
    const mesRef = `${anoSelecionado}-${String(mes).padStart(2, "0")}`;
    const s = monthStatuses.data?.[mesRef];
    if (!s) return "vazio";
    return s.status;
  };
  const getMonthColor = (mes: number) => {
    const status = getMonthStatus(mes);
    if (status === "consolidado") return "bg-green-500 text-white hover:bg-green-600 border-green-600";
    if (status === "aberto") return "bg-blue-500 text-white hover:bg-blue-600 border-blue-600";
    return "bg-gray-200 text-gray-500 hover:bg-gray-300 border-gray-300";
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <div>
            {viewMode === "detalhe" && selectedEmployeeId ? (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setViewMode("resumo"); setSelectedEmployeeId(null); }}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    {employeeDetail.data?.employee?.nomeCompleto || "Colaborador"}
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    {employeeDetail.data?.employee?.funcao} — {formatCPF(employeeDetail.data?.employee?.cpf || "")}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Fechamento de Ponto</h1>
                <p className="text-muted-foreground text-sm">Controle e fechamento mensal de ponto dos colaboradores</p>
              </div>
            )}
          </div>
        </div>

        {/* ===== FILTRO VISUAL ANO + MESES ===== */}
        <div className="bg-white border rounded-xl shadow-sm p-4 space-y-3">
          {/* Seletor de Ano */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setAnoSelecionado(a => a - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-lg font-bold text-[#1B2A4A] min-w-[60px] text-center">{anoSelecionado}</span>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setAnoSelecionado(a => a + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500" /> Com lançamento</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-green-500" /> Consolidado</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-gray-200" /> Sem dados</div>
            </div>
          </div>

          {/* 12 Meses */}
          <div className="grid grid-cols-12 gap-1.5">
            {MESES_CURTOS.map((nome, i) => {
              const mes = i + 1;
              const isSelected = mes === mesSelecionado;
              const status = getMonthStatus(mes);
              const mesRef = `${anoSelecionado}-${String(mes).padStart(2, "0")}`;
              const info = monthStatuses.data?.[mesRef];
              return (
                <button
                  key={mes}
                  onClick={() => setMesSelecionado(mes)}
                  className={`relative rounded-lg py-2 px-1 text-center text-sm font-medium transition-all border-2 ${
                    isSelected
                      ? `${getMonthColor(mes)} ring-2 ring-offset-1 ring-[#1B2A4A] shadow-md scale-105`
                      : getMonthColor(mes)
                  }`}
                >
                  {nome}
                  {status === "consolidado" && (
                    <Lock className="h-3 w-3 absolute top-0.5 right-0.5 text-white/80" />
                  )}
                  {info?.consolidadoPor && status === "consolidado" && (
                    <div className="absolute -bottom-0.5 left-0 right-0 text-[8px] text-white/70 truncate px-0.5">
                      {info.consolidadoPor.split(" ")[0]}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== TOOLBAR ===== */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2 shadow-sm">
            <CalendarDays className="h-4 w-4 text-[#1B2A4A]" />
            <span className="text-sm font-semibold text-[#1B2A4A]">{formatMesAno(mesAno)}</span>
            {isConsolidado && (
              <Badge className="bg-green-100 text-green-700 text-xs ml-1">
                <Lock className="h-3 w-3 mr-1" /> Consolidado
              </Badge>
            )}
          </div>

          {!isConsolidado && (
            <>
              <Button onClick={() => { setShowUploadDialog(true); setUploadFiles([]); setUploadResult(null); setValidationResult(null); }} className="bg-[#1B2A4A] hover:bg-[#243660]">
                <Upload className="h-4 w-4 mr-2" /> Upload DIXI
              </Button>
              <Button variant="outline" onClick={() => setShowManualDialog(true)}>
                <PenLine className="h-4 w-4 mr-2" /> Lançamento Manual
              </Button>
            </>
          )}

          {/* Consolidar / Desconsolidar */}
          {(stats.data?.totalRegistros || 0) > 0 && !isConsolidado && (
            <Button variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" onClick={() => { setConsolidarObs(""); setShowConsolidarDialog(true); }}>
              <Lock className="h-4 w-4 mr-2" /> Consolidar Mês
            </Button>
          )}
          {isConsolidado && isAdmin && (
            <Button variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => setShowDesconsolidarDialog(true)}>
              <Unlock className="h-4 w-4 mr-2" /> Desconsolidar
            </Button>
          )}

          {isAdmin && !isConsolidado && (stats.data?.totalRegistros || 0) > 0 && (
            <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => setShowClearDialog(true)}>
              <Trash2 className="h-4 w-4 mr-2" /> Limpar Base
            </Button>
          )}

          {viewMode !== "resumo" && viewMode !== "detalhe" && (
            <Button variant="ghost" size="sm" onClick={() => { setViewMode("resumo"); setCardFilter(null); }}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar ao Resumo
            </Button>
          )}
        </div>

        {/* Consolidação info banner */}
        {isConsolidado && (
          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 flex items-start gap-3">
            <Lock className="h-6 w-6 text-green-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-green-800 text-base">Mês Consolidado</p>
              <p className="text-sm text-green-700 mt-1">
                Consolidado por <strong>{consolidacaoStatus.data?.consolidadoPor || "—"}</strong>
                {consolidacaoStatus.data?.consolidadoEm && (
                  <> em {new Date(consolidacaoStatus.data.consolidadoEm).toLocaleString("pt-BR")}</>
                )}
                . Nenhuma alteração permitida. {isAdmin ? "Apenas o Admin Master pode desconsolidar." : "Solicite ao Admin Master para desconsolidar."}
              </p>
            </div>
            <Badge className="bg-green-600 text-white text-sm px-3 py-1 shrink-0">
              <UserCheck className="h-4 w-4 mr-1" /> Validado
            </Badge>
          </div>
        )}

        {/* ===== STATS CARDS ===== */}
        <div className="grid gap-4 md:grid-cols-6">
          <Card className={`cursor-pointer hover:shadow-md transition-all ${cardFilter === "colaboradores" ? "ring-2 ring-blue-500 shadow-md" : ""}`}
            onClick={() => { setViewMode("resumo"); setCardFilter(cardFilter === "colaboradores" ? null : "colaboradores"); }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.data?.totalColaboradores || 0}</p>
                  <p className="text-xs text-muted-foreground">Colaboradores</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer hover:shadow-md transition-all ${cardFilter === "registros" ? "ring-2 ring-green-500 shadow-md" : ""}`}
            onClick={() => { setViewMode("resumo"); setCardFilter(cardFilter === "registros" ? null : "registros"); }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.data?.totalRegistros || 0}</p>
                  <p className="text-xs text-muted-foreground">Registros</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer hover:shadow-md transition-all ${cardFilter === "inconsistencias" ? "ring-2 ring-amber-500 shadow-md" : ""}`}
            onClick={() => { setViewMode("inconsistencias"); setCardFilter("inconsistencias"); }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.data?.totalInconsistencias || 0}</p>
                  <p className="text-xs text-muted-foreground">Inconsistências</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer hover:shadow-md transition-all ${cardFilter === "ajustes" ? "ring-2 ring-purple-500 shadow-md" : ""}`}
            onClick={() => { setViewMode("resumo"); setCardFilter(cardFilter === "ajustes" ? null : "ajustes"); }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <PenLine className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.data?.totalAjustesManuais || 0}</p>
                  <p className="text-xs text-muted-foreground">Ajustes Manuais</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer hover:shadow-md transition-all ${cardFilter === "multiplasObras" ? "ring-2 ring-red-500 shadow-md" : ""} ${multiSiteCount > 0 ? "border-red-300 bg-red-50/50" : ""}`}
            onClick={() => { setViewMode("resumo"); setCardFilter(cardFilter === "multiplasObras" ? null : "multiplasObras"); }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${multiSiteCount > 0 ? "bg-red-100" : "bg-gray-100"}`}>
                  <MapPin className={`h-5 w-5 ${multiSiteCount > 0 ? "text-red-600" : "text-gray-400"}`} />
                </div>
                <div>
                  <p className={`text-2xl font-bold ${multiSiteCount > 0 ? "text-red-600" : ""}`}>{multiSiteCount}</p>
                  <p className="text-xs text-muted-foreground">Múltiplas Obras</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer hover:shadow-md transition-all ${cardFilter === "conflitos" ? "ring-2 ring-orange-500 shadow-md" : ""} ${conflitosCount > 0 ? "border-orange-300 bg-orange-50/50" : ""}`}
            onClick={() => { setViewMode("resumo"); setCardFilter(cardFilter === "conflitos" ? null : "conflitos"); }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${conflitosCount > 0 ? "bg-orange-100" : "bg-gray-100"}`}>
                  <AlertCircle className={`h-5 w-5 ${conflitosCount > 0 ? "text-orange-600" : "text-gray-400"}`} />
                </div>
                <div>
                  <p className={`text-2xl font-bold ${conflitosCount > 0 ? "text-orange-600" : ""}`}>{conflitosCount}</p>
                  <p className="text-xs text-muted-foreground">Conflitos Obra/Dia</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ALERTA DE CONFLITOS OBRA/DIA */}
        {conflitosCount > 0 && cardFilter !== "conflitos" && (
          <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:bg-orange-100/50 transition-colors"
            onClick={() => { setViewMode("resumo"); setCardFilter("conflitos"); }}>
            <AlertCircle className="h-6 w-6 text-orange-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-orange-800 text-base">Conflito de Obras no Mesmo Dia</p>
              <p className="text-sm text-orange-700 mt-1">
                <strong>{conflitosCount} registro(s)</strong> de funcionários que aparecem em <strong>2 ou mais obras no mesmo dia</strong>.
                Isso é <strong>inaceitável</strong> — um funcionário não pode estar em dois lugares ao mesmo tempo.
                Verifique se é erro de lançamento ou deslocamento real.
              </p>
            </div>
            <Badge className="bg-orange-600 text-white text-sm px-3 py-1 shrink-0">
              {conflitosCount} conflito{conflitosCount > 1 ? "s" : ""}
            </Badge>
          </div>
        )}

        {/* ALERTA MÚLTIPLAS OBRAS */}
        {multiSiteCount > 0 && cardFilter !== "multiplasObras" && cardFilter !== "conflitos" && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:bg-red-100/50 transition-colors"
            onClick={() => { setViewMode("resumo"); setCardFilter("multiplasObras"); }}>
            <MapPin className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-red-800 text-base">Funcionários em Múltiplas Obras</p>
              <p className="text-sm text-red-700 mt-1">
                <strong>{multiSiteCount} funcionário(s)</strong> registraram ponto em mais de uma obra neste mês.
                Pode indicar erro de lançamento ou deslocamento real entre obras.
              </p>
            </div>
            <Badge variant="destructive" className="text-sm px-3 py-1 shrink-0">{multiSiteCount}</Badge>
          </div>
        )}

        {/* Tab buttons */}
        {viewMode !== "detalhe" && (stats.data?.totalRegistros || 0) > 0 && (
          <div className="flex gap-2 border-b pb-2">
            <Button variant={viewMode === "resumo" ? "default" : "ghost"} size="sm" onClick={() => { setViewMode("resumo"); setCardFilter(null); }}
              className={viewMode === "resumo" ? "bg-[#1B2A4A]" : ""}>
              <Users className="h-4 w-4 mr-1" /> Resumo por Colaborador
            </Button>
            <Button variant={viewMode === "inconsistencias" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("inconsistencias")}
              className={viewMode === "inconsistencias" ? "bg-amber-600 text-white" : ""}>
              <AlertTriangle className="h-4 w-4 mr-1" /> Inconsistências
              {(stats.data?.totalInconsistencias || 0) > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs">{stats.data?.totalInconsistencias}</Badge>
              )}
            </Button>
            <Button variant={viewMode === "rateio" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("rateio")}
              className={viewMode === "rateio" ? "bg-teal-600 text-white" : ""}>
              <Building2 className="h-4 w-4 mr-1" /> Rateio por Obra
            </Button>
          </div>
        )}

        {/* ===== RESUMO VIEW ===== */}
        {viewMode === "resumo" && (
          <>
            {(stats.data?.totalRegistros || 0) === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="font-semibold text-lg">Nenhum registro de ponto</h3>
                  <p className="text-muted-foreground text-sm mt-1">Faça o upload dos arquivos DIXI para importar os registros de ponto.</p>
                  {!isConsolidado && (
                    <Button onClick={() => { setShowUploadDialog(true); setUploadFiles([]); setUploadResult(null); setValidationResult(null); }} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                      <Upload className="h-4 w-4 mr-2" /> Upload DIXI
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Conflitos Obra/Dia Detail */}
                {cardFilter === "conflitos" && conflitos.data && conflitos.data.length > 0 && (
                  <Card className="border-orange-300">
                    <CardHeader className="pb-3 bg-orange-50 rounded-t-lg">
                      <CardTitle className="text-base flex items-center gap-2 text-orange-800">
                        <AlertCircle className="h-5 w-5" />
                        Conflitos de Obra no Mesmo Dia — {formatMesAno(mesAno)}
                      </CardTitle>
                      <p className="text-xs text-orange-600 mt-1">
                        Funcionários que registraram ponto em 2+ obras no mesmo dia. Verifique cada caso.
                      </p>
                    </CardHeader>
                    <CardContent className="pt-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left bg-orange-50/50">
                              <th className="p-2 font-medium">Funcionário</th>
                              <th className="p-2 font-medium">Data</th>
                              <th className="p-2 font-medium">Dia</th>
                              <th className="p-2 font-medium">Obras em Conflito</th>
                              <th className="p-2 font-medium text-center">Horas</th>
                              <th className="p-2 font-medium text-center">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {conflitos.data.map((c: any, idx: number) => (
                              <tr key={idx} className="border-b last:border-0 hover:bg-orange-50/30">
                                <td className="p-2">
                                  <button className="font-medium text-blue-700 hover:underline text-left" onClick={() => openRaioX(c.employeeId)}>
                                    {c.employeeName}
                                  </button>
                                </td>
                                <td className="p-2">{c.data ? new Date(c.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</td>
                                <td className="p-2 text-muted-foreground">{dayOfWeek(c.data)}</td>
                                <td className="p-2">
                                  <div className="flex flex-wrap gap-1">
                                    {c.obras.map((o: any, i: number) => (
                                      <Badge key={i} variant="outline" className="text-xs border-orange-300 text-orange-700 bg-orange-50">
                                        {o.obraNome || "Sem Obra"} ({o.horasTrabalhadas || "0:00"})
                                      </Badge>
                                    ))}
                                  </div>
                                </td>
                                <td className="p-2 text-center font-mono text-sm">
                                  {c.obras.reduce((sum: number, o: any) => {
                                    if (!o.horasTrabalhadas) return sum;
                                    const [h, m] = o.horasTrabalhadas.split(":").map(Number);
                                    return sum + (h || 0) * 60 + (m || 0);
                                  }, 0) > 0 ? (() => {
                                    const total = c.obras.reduce((sum: number, o: any) => {
                                      if (!o.horasTrabalhadas) return sum;
                                      const [h, m] = o.horasTrabalhadas.split(":").map(Number);
                                      return sum + (h || 0) * 60 + (m || 0);
                                    }, 0);
                                    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
                                  })() : "-"}
                                </td>
                                <td className="p-2 text-center">
                                  <Button variant="ghost" size="sm" onClick={() => { setSelectedEmployeeId(c.employeeId); setViewMode("detalhe"); }}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Resumo por Colaborador */}
                {cardFilter !== "conflitos" && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <CardTitle className="text-base">
                          Resumo por Colaborador — {formatMesAno(mesAno)}
                          {cardFilter === "multiplasObras" && (
                            <Badge variant="destructive" className="ml-2 text-xs"><MapPin className="h-3 w-3 mr-1" /> Múltiplas Obras</Badge>
                          )}
                          {cardFilter === "ajustes" && (
                            <Badge className="ml-2 text-xs bg-purple-100 text-purple-700"><PenLine className="h-3 w-3 mr-1" /> Ajustes Manuais</Badge>
                          )}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <Select value={filterObra} onValueChange={setFilterObra}>
                              <SelectTrigger className="w-52 h-9"><SelectValue placeholder="Todas as Obras" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Todas as Obras</SelectItem>
                                {(obrasList.data || []).map((o: any) => (
                                  <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-48 h-9" />
                          </div>
                          {(cardFilter || filterObra !== "all") && (
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setCardFilter(null); setFilterObra("all"); setSearchTerm(""); }}>
                              <XCircle className="h-3.5 w-3.5 mr-1" /> Limpar
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left bg-muted/50">
                              <th className="p-2 font-medium">Colaborador</th>
                              <th className="p-2 font-medium">CPF</th>
                              <th className="p-2 font-medium">Função</th>
                              <th className="p-2 font-medium">Obra(s)</th>
                              <th className="p-2 font-medium text-center">Dias</th>
                              <th className="p-2 font-medium text-center">H. Trab.</th>
                              <th className="p-2 font-medium text-center">H. Extras</th>
                              <th className="p-2 font-medium text-center">Atrasos</th>
                              <th className="p-2 font-medium text-center">Status</th>
                              <th className="p-2 font-medium text-center">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredSummary.map((emp: any) => {
                              const hasConflict = (conflitos.data || []).some((c: any) => c.employeeId === emp.employeeId);
                              return (
                                <tr key={emp.employeeId} className={`border-b last:border-0 hover:bg-muted/30 ${emp.temAjusteManual ? "bg-purple-50" : ""} ${hasConflict ? "bg-orange-50" : emp.multiplasObras ? "bg-red-50" : ""}`}>
                                  <td className="p-2">
                                    <button className="font-medium text-blue-700 hover:underline text-left" onClick={() => openRaioX(emp.employeeId)}>
                                      {emp.employeeName}
                                    </button>
                                    {emp.temAjusteManual && (
                                      <Badge variant="outline" className="ml-2 text-xs text-purple-600 border-purple-300"><PenLine className="h-3 w-3 mr-1" /> Ajuste</Badge>
                                    )}
                                  </td>
                                  <td className="p-2 text-muted-foreground">{formatCPF(emp.employeeCpf || "")}</td>
                                  <td className="p-2 text-muted-foreground">{emp.employeeFuncao || "-"}</td>
                                  <td className="p-2">
                                    {emp.multiplasObras ? (
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <MapPin className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                        {(emp.obraNomes || []).map((nome: string, i: number) => (
                                          <Badge key={i} variant="outline" className="text-xs border-red-300 text-red-700 bg-red-50">{nome}</Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">{emp.obraNomes?.[0] || "-"}</span>
                                    )}
                                  </td>
                                  <td className="p-2 text-center">{emp.diasTrabalhados}</td>
                                  <td className="p-2 text-center font-mono">{emp.horasTrabalhadas}</td>
                                  <td className="p-2 text-center font-mono">
                                    {emp.horasExtras !== "0:00" ? <span className="text-green-600 font-semibold">{emp.horasExtras}</span> : "-"}
                                  </td>
                                  <td className="p-2 text-center font-mono">
                                    {emp.atrasos !== "0:00" ? <span className="text-red-600">{emp.atrasos}</span> : "-"}
                                  </td>
                                  <td className="p-2 text-center">
                                    {hasConflict ? (
                                      <Badge className="text-xs bg-orange-600 text-white"><AlertCircle className="h-3 w-3 mr-1" /> Conflito</Badge>
                                    ) : emp.multiplasObras ? (
                                      <Badge variant="destructive" className="text-xs"><MapPin className="h-3 w-3 mr-1" /> Multi-Obra</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs text-green-600 border-green-300">OK</Badge>
                                    )}
                                  </td>
                                  <td className="p-2 text-center">
                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedEmployeeId(emp.employeeId); setViewMode("detalhe"); }}>
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                            {filteredSummary.length === 0 && (
                              <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Nenhum resultado encontrado.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </>
        )}

        {/* ===== INCONSISTENCIAS VIEW ===== */}
        {viewMode === "inconsistencias" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" /> Inconsistências de Ponto — {formatMesAno(mesAno)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!inconsistencies.data || inconsistencies.data.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-500" />
                  <p>Nenhuma inconsistência encontrada.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left bg-muted/50">
                        <th className="p-2 font-medium">Colaborador</th>
                        <th className="p-2 font-medium">CPF</th>
                        <th className="p-2 font-medium">Data</th>
                        <th className="p-2 font-medium">Tipo</th>
                        <th className="p-2 font-medium">Descrição</th>
                        <th className="p-2 font-medium text-center">Status</th>
                        <th className="p-2 font-medium text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inconsistencies.data.map((item: any) => {
                        const inc = item.inconsistency;
                        return (
                          <tr key={inc.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-2">
                              <button className="font-medium text-blue-700 hover:underline text-left" onClick={() => openRaioX(inc.employeeId)}>
                                {item.employeeName}
                              </button>
                            </td>
                            <td className="p-2 text-muted-foreground">{formatCPF(item.employeeCpf || "")}</td>
                            <td className="p-2">
                              {inc.data ? new Date(inc.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}
                              <span className="text-muted-foreground ml-1">({dayOfWeek(inc.data)})</span>
                            </td>
                            <td className="p-2">
                              <Badge variant={inc.tipoInconsistencia === "batida_impar" ? "destructive" : "secondary"} className="text-xs">
                                {inc.tipoInconsistencia === "batida_impar" ? "Batida Ímpar" :
                                 inc.tipoInconsistencia === "falta_batida" ? "Falta Batida" :
                                 inc.tipoInconsistencia === "horario_divergente" ? "Horário Divergente" :
                                 inc.tipoInconsistencia === "sem_registro" ? "Sem Registro" : inc.tipoInconsistencia}
                              </Badge>
                            </td>
                            <td className="p-2 text-muted-foreground text-xs max-w-[300px] truncate">{inc.descricao}</td>
                            <td className="p-2 text-center">
                              <Badge variant={inc.status === "pendente" ? "destructive" : inc.status === "justificado" ? "secondary" : "outline"} className="text-xs">
                                {inc.status === "pendente" ? "Pendente" : inc.status === "justificado" ? "Justificado" : inc.status === "ajustado" ? "Ajustado" : inc.status}
                              </Badge>
                            </td>
                            <td className="p-2 text-center">
                              {inc.status === "pendente" && !isConsolidado && (
                                <div className="flex items-center gap-1 justify-center">
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    setSelectedInconsistency(item);
                                    setResolveData({ status: "justificado", justificativa: "" });
                                    setShowResolveDialog(true);
                                  }}><CheckCircle className="h-4 w-4 text-green-600" /></Button>
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    setManualData({
                                      employeeId: inc.employeeId || 0, obraId: 0,
                                      data: inc.data || "", entrada1: "", saida1: "", entrada2: "", saida2: "",
                                      justificativa: `Correção: ${inc.descricao}`,
                                    });
                                    setShowManualDialog(true);
                                  }}><PenLine className="h-4 w-4 text-purple-600" /></Button>
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    setSelectedInconsistency(item);
                                    setResolveData({ status: "advertencia", justificativa: "" });
                                    setShowResolveDialog(true);
                                  }}><Shield className="h-4 w-4 text-red-600" /></Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ===== DETALHE VIEW ===== */}
        {viewMode === "detalhe" && selectedEmployeeId && (
          <>
            {employeeDetail.isLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Carregando...</CardContent></Card>
            ) : (
              <>
                {!isConsolidado && (
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => {
                      setManualData({ employeeId: selectedEmployeeId, obraId: 0, data: "", entrada1: "", saida1: "", entrada2: "", saida2: "", justificativa: "" });
                      setShowManualDialog(true);
                    }}><PenLine className="h-4 w-4 mr-1" /> Lançar Manual</Button>
                  </div>
                )}

                {/* Conflitos deste funcionário */}
                {(() => {
                  const empConflitos = (conflitos.data || []).filter((c: any) => c.employeeId === selectedEmployeeId);
                  if (empConflitos.length === 0) return null;
                  return (
                    <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="h-5 w-5 text-orange-600" />
                        <p className="font-bold text-orange-800">Conflitos de Obra Detectados ({empConflitos.length} dia{empConflitos.length > 1 ? "s" : ""})</p>
                      </div>
                      <div className="space-y-2">
                        {empConflitos.map((c: any, idx: number) => (
                          <div key={idx} className="bg-white border border-orange-200 rounded-lg p-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">
                                {new Date(c.data + "T12:00:00").toLocaleDateString("pt-BR")} ({dayOfWeek(c.data)})
                              </p>
                              <div className="flex gap-1 mt-1">
                                {c.obras.map((o: any, i: number) => (
                                  <Badge key={i} variant="outline" className="text-xs border-orange-300 text-orange-700">
                                    {o.obraNome || "Sem Obra"} — {o.horasTrabalhadas || "0:00"}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <Badge className="bg-orange-600 text-white text-xs">2+ obras</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Registros agrupados por obra */}
                {(employeeDetail.data?.recordsByObra || []).length === 0 ? (
                  <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum registro encontrado.</CardContent></Card>
                ) : (
                  (employeeDetail.data?.recordsByObra || []).map((obraGroup: any, idx: number) => (
                    <Card key={idx}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-teal-600" />
                            <span>{obraGroup.obraNome}</span>
                            <Badge variant="outline" className="text-xs ml-2">
                              {obraGroup.records.length} registro{obraGroup.records.length > 1 ? "s" : ""}
                            </Badge>
                          </CardTitle>
                          <span className="text-xs text-muted-foreground">{formatMesAno(mesAno)}</span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left bg-muted/50">
                                <th className="p-2 font-medium">Data</th>
                                <th className="p-2 font-medium">Dia</th>
                                <th className="p-2 font-medium text-center">Entrada</th>
                                <th className="p-2 font-medium text-center">Saída Int.</th>
                                <th className="p-2 font-medium text-center">Retorno</th>
                                <th className="p-2 font-medium text-center">Saída</th>
                                <th className="p-2 font-medium text-center">H. Trab.</th>
                                <th className="p-2 font-medium text-center">H. Extra</th>
                                <th className="p-2 font-medium text-center">Fonte</th>
                                <th className="p-2 font-medium text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {obraGroup.records.map((rec: any) => {
                                const hasIncons = (employeeDetail.data?.inconsistencies || []).some((i: any) => i.data === rec.data);
                                const hasConflict = (conflitos.data || []).some((c: any) => c.employeeId === selectedEmployeeId && c.data === rec.data);
                                return (
                                  <tr key={rec.id} className={`border-b last:border-0 ${hasConflict ? "bg-orange-50" : rec.ajusteManual ? "bg-purple-50" : hasIncons ? "bg-amber-50" : ""}`}>
                                    <td className="p-2">{rec.data ? new Date(rec.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</td>
                                    <td className="p-2 text-muted-foreground">{dayOfWeek(rec.data)}</td>
                                    <td className="p-2 text-center font-mono">{rec.entrada1 || "-"}</td>
                                    <td className="p-2 text-center font-mono">{rec.saida1 || "-"}</td>
                                    <td className="p-2 text-center font-mono">{rec.entrada2 || "-"}</td>
                                    <td className="p-2 text-center font-mono">{rec.saida2 || "-"}</td>
                                    <td className="p-2 text-center font-mono font-semibold">{rec.horasTrabalhadas || "-"}</td>
                                    <td className="p-2 text-center font-mono">
                                      {rec.horasExtras && rec.horasExtras !== "0:00" ? <span className="text-green-600 font-semibold">{rec.horasExtras}</span> : "-"}
                                    </td>
                                    <td className="p-2 text-center">
                                      {rec.ajusteManual ? (
                                        <Badge variant="outline" className="text-xs text-purple-600 border-purple-300"><PenLine className="h-3 w-3 mr-1" /> Manual</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs">DIXI</Badge>
                                      )}
                                    </td>
                                    <td className="p-2 text-center">
                                      {hasConflict ? (
                                        <Badge className="text-xs bg-orange-600 text-white"><AlertCircle className="h-3 w-3 mr-1" /> Conflito</Badge>
                                      ) : hasIncons ? (
                                        <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" /> Inconsistente</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs text-green-600 border-green-300">OK</Badge>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </>
            )}
          </>
        )}

        {/* ===== RATEIO POR OBRA VIEW ===== */}
        {viewMode === "rateio" && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-teal-600" /> Rateio de Mão de Obra por Obra — {formatMesAno(mesAno)}
                </CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">Distribuição de horas trabalhadas por obra para rateio de custos</p>
            </CardHeader>
            <CardContent>
              {rateioData.isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando rateio...</div>
              ) : !rateioData.data || rateioData.data.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhum dado de rateio encontrado.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {rateioData.data.map((obra: any) => (
                    <div key={obra.obraId} className="border rounded-lg overflow-hidden">
                      <div className="bg-teal-50 border-b px-4 py-3 flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-teal-800">{obra.nomeObra}</h3>
                          <div className="flex items-center gap-3 mt-0.5">
                            {obra.codigoObra && <span className="text-xs text-teal-600">Código: {obra.codigoObra}</span>}
                            {obra.snRelogioPonto ? (
                              <span className="text-xs text-teal-600 flex items-center gap-1">
                                <Wifi className="h-3 w-3" /> SN: {obra.snRelogioPonto}
                              </span>
                            ) : (
                              <span className="text-xs text-red-600 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" /> SN não definido
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-teal-800">{obra.funcionarios.length} funcionários</p>
                          <p className="text-xs text-teal-600">{obra.totalDias} dias trabalhados</p>
                        </div>
                      </div>
                      {obra.snWarning && (
                        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                          <p className="text-xs text-red-700">{obra.snWarning}</p>
                        </div>
                      )}
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left bg-muted/30">
                            <th className="p-2 font-medium">Colaborador</th>
                            <th className="p-2 font-medium">CPF</th>
                            <th className="p-2 font-medium">Função</th>
                            <th className="p-2 font-medium text-center">Dias</th>
                            <th className="p-2 font-medium text-center">H. Normais</th>
                            <th className="p-2 font-medium text-center">H. Extras</th>
                            <th className="p-2 font-medium text-center">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {obra.funcionarios.map((f: any) => (
                            <tr key={f.employeeId} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="p-2">
                                <button className="font-medium text-blue-700 hover:underline text-left" onClick={() => openRaioX(f.employeeId)}>
                                  {f.nomeCompleto}
                                </button>
                              </td>
                              <td className="p-2 text-muted-foreground font-mono text-xs">{formatCPF(f.cpf)}</td>
                              <td className="p-2 text-muted-foreground">{f.funcao || "-"}</td>
                              <td className="p-2 text-center">{f.diasTrabalhados}</td>
                              <td className="p-2 text-center font-mono">{f.horasNormais || "0:00"}</td>
                              <td className="p-2 text-center font-mono text-green-600 font-semibold">{f.horasExtras || "0:00"}</td>
                              <td className="p-2 text-center font-mono font-bold">{f.totalHoras || "0:00"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ===== UPLOAD DIALOG ===== */}
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Upload de Arquivos DIXI</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <strong>Como funciona:</strong> Selecione os arquivos XLS exportados dos relógios DIXI.
                O sistema identifica automaticamente a <strong>obra pelo SN</strong> e distribui os registros
                na <strong>competência correta</strong> baseado na data de cada registro.
              </div>
              <div className="bg-[#1B2A4A]/5 border border-[#1B2A4A]/20 rounded-lg p-3 text-sm text-[#1B2A4A] flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span><strong>Regra automática:</strong> Os registros serão alocados na competência correta conforme a data do arquivo. Se contiver registros de meses diferentes, serão distribuídos automaticamente.</span>
              </div>
              <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Clique para selecionar arquivos</p>
                <p className="text-xs text-muted-foreground">Formatos aceitos: .xls, .xlsx (múltiplos arquivos)</p>
                <input ref={fileInputRef} type="file" accept=".xls,.xlsx" multiple className="hidden"
                  onChange={e => { const files = Array.from(e.target.files || []); handleFilesSelected(files); }} />
              </div>
              {uploadFiles.length > 0 && (
                <div className="space-y-1">
                  <Label>Arquivos selecionados ({uploadFiles.length})</Label>
                  {uploadFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-3 py-1.5">
                      <FileSpreadsheet className="h-4 w-4 text-green-600" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                    </div>
                  ))}
                </div>
              )}
              {validating && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Validando arquivos (SN e datas)...
                </div>
              )}
              {validationResult && !uploadResult && (
                <div className="space-y-2">
                  {validationResult.results.map((r: any, i: number) => (
                    <div key={i} className={`border rounded-lg p-3 text-sm ${r.valid ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {r.valid ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                          <span className="font-medium">{r.fileName}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{r.totalRecords} registros</span>
                      </div>
                      <div className="mt-1.5 ml-6 space-y-0.5">
                        <p className="text-xs"><strong>SN:</strong> {r.deviceSerial || "Não identificado"}{r.valid && <span className="text-green-700"> → {r.obraNome}</span>}</p>
                        {r.mesesDetectados.length > 0 && (
                          <p className="text-xs"><strong>Competência(s):</strong> {r.mesesDetectados.map((m: string) => formatMesAno(m)).join(", ")}</p>
                        )}
                        {r.mesesDetectados.length > 1 && (
                          <p className="text-xs text-amber-700 flex items-center gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3" /> Arquivo contém <strong>{r.mesesDetectados.length} meses</strong>. Distribuição automática.
                          </p>
                        )}
                        {r.error && <p className="text-xs text-red-700 font-medium mt-1">{r.error}</p>}
                      </div>
                    </div>
                  ))}
                  {!validationResult.allValid && (
                    <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3 text-sm text-red-800">
                      <strong>Ação necessária:</strong> Cadastre o SN do equipamento na aba de Obras antes de fazer o upload.
                    </div>
                  )}
                </div>
              )}
              {uploadResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm space-y-2">
                  <p className="font-semibold text-green-800">Importação concluída!</p>
                  <p>Registros importados: <strong>{uploadResult.totalImported}</strong></p>
                  <p>Inconsistências: <strong>{uploadResult.totalInconsistencies}</strong></p>
                  {uploadResult.mesesAfetados?.length > 0 && (
                    <p>Competências: <strong>{uploadResult.mesesAfetados.map((m: string) => formatMesAno(m)).join(", ")}</strong></p>
                  )}
                  {uploadResult.totalUnmatched?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-amber-700 font-medium">Funcionários não encontrados:</p>
                      <ul className="list-disc list-inside text-xs text-amber-600">
                        {uploadResult.totalUnmatched.map((n: string, i: number) => <li key={i}>{n}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="shrink-0 border-t pt-4 mt-2">
              <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Fechar</Button>
              {!uploadResult && (
                <Button onClick={handleUpload} disabled={uploading || uploadFiles.length === 0 || validating || (validationResult && !validationResult.allValid)} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  {uploading ? "Processando..." : "Importar"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ===== MANUAL ENTRY DIALOG ===== */}
        <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><PenLine className="h-5 w-5 text-purple-600" /> Lançamento Manual</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 text-xs text-purple-800">
                Registros manuais ficam <strong>destacados</strong> e são rastreados.
              </div>
              <div>
                <Label>Colaborador</Label>
                <Select value={String(manualData.employeeId || "")} onValueChange={v => setManualData(p => ({ ...p, employeeId: parseInt(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(employeesList.data || []).map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data</Label>
                <Input type="date" value={manualData.data} onChange={e => setManualData(p => ({ ...p, data: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Entrada</Label><Input type="time" value={manualData.entrada1} onChange={e => setManualData(p => ({ ...p, entrada1: e.target.value }))} /></div>
                <div><Label>Saída Int.</Label><Input type="time" value={manualData.saida1} onChange={e => setManualData(p => ({ ...p, saida1: e.target.value }))} /></div>
                <div><Label>Retorno</Label><Input type="time" value={manualData.entrada2} onChange={e => setManualData(p => ({ ...p, entrada2: e.target.value }))} /></div>
                <div><Label>Saída</Label><Input type="time" value={manualData.saida2} onChange={e => setManualData(p => ({ ...p, saida2: e.target.value }))} /></div>
              </div>
              <div>
                <Label>Justificativa</Label>
                <Textarea value={manualData.justificativa} onChange={e => setManualData(p => ({ ...p, justificativa: e.target.value }))} placeholder="Motivo do lançamento manual..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowManualDialog(false)}>Cancelar</Button>
              <Button onClick={() => {
                if (!manualData.employeeId || !manualData.data) return toast.error("Selecione o colaborador e a data");
                manualMut.mutate({
                  companyId, employeeId: manualData.employeeId, obraId: manualData.obraId || undefined,
                  mesReferencia: manualData.data.substring(0, 7), data: manualData.data,
                  entrada1: manualData.entrada1 || undefined, saida1: manualData.saida1 || undefined,
                  entrada2: manualData.entrada2 || undefined, saida2: manualData.saida2 || undefined,
                  justificativa: manualData.justificativa || undefined,
                });
              }} disabled={manualMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
                {manualMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ===== RESOLVE INCONSISTENCY DIALOG ===== */}
        <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {resolveData.status === "advertencia" ? (
                  <><Shield className="h-5 w-5 text-red-600" /> Gerar Advertência</>
                ) : (
                  <><CheckCircle className="h-5 w-5 text-green-600" /> Resolver Inconsistência</>
                )}
              </DialogTitle>
            </DialogHeader>
            {selectedInconsistency && (
              <div className="space-y-3">
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p><strong>Colaborador:</strong> {selectedInconsistency.employeeName}</p>
                  <p><strong>Data:</strong> {selectedInconsistency.inconsistency.data ? new Date(selectedInconsistency.inconsistency.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</p>
                  <p><strong>Tipo:</strong> {selectedInconsistency.inconsistency.tipoInconsistencia}</p>
                  <p><strong>Descrição:</strong> {selectedInconsistency.inconsistency.descricao}</p>
                </div>
                <div>
                  <Label>Ação</Label>
                  <Select value={resolveData.status} onValueChange={v => setResolveData(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="justificado">Justificar (sem penalidade)</SelectItem>
                      <SelectItem value="ajustado">Marcar como Ajustado</SelectItem>
                      <SelectItem value="advertencia">Gerar Advertência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{resolveData.status === "advertencia" ? "Motivo da Advertência" : "Justificativa"}</Label>
                  <Textarea value={resolveData.justificativa} onChange={e => setResolveData(p => ({ ...p, justificativa: e.target.value }))} />
                </div>
                {resolveData.status === "advertencia" && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-800">
                    <strong>Atenção:</strong> Um registro será criado no módulo de Advertências.
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowResolveDialog(false)}>Cancelar</Button>
              <Button onClick={() => {
                if (!selectedInconsistency) return;
                resolveMut.mutate({ id: selectedInconsistency.inconsistency.id, status: resolveData.status as any, justificativa: resolveData.justificativa || undefined });
              }} disabled={resolveMut.isPending}
                className={resolveData.status === "advertencia" ? "bg-red-600 hover:bg-red-700" : "bg-[#1B2A4A] hover:bg-[#243660]"}>
                {resolveMut.isPending ? "Processando..." : resolveData.status === "advertencia" ? "Gerar Advertência" : "Resolver"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ===== CONSOLIDAR MÊS DIALOG ===== */}
        <Dialog open={showConsolidarDialog} onOpenChange={setShowConsolidarDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-700">
                <Lock className="h-5 w-5" /> Consolidar Mês — {formatMesAno(mesAno)}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                <strong>Atenção:</strong> Ao consolidar, nenhuma alteração será permitida neste mês.
                Upload DIXI, lançamento manual e limpeza de base serão <strong>bloqueados</strong>.
                Apenas o <strong>Admin Master</strong> pode desconsolidar.
              </div>
              {(stats.data?.totalInconsistencias || 0) > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  Existem <strong>{stats.data?.totalInconsistencias} inconsistências pendentes</strong>.
                  Resolva todas antes de consolidar.
                </div>
              )}
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p><strong>Competência:</strong> {formatMesAno(mesAno)}</p>
                <p><strong>Colaboradores:</strong> {stats.data?.totalColaboradores || 0}</p>
                <p><strong>Registros:</strong> {stats.data?.totalRegistros || 0}</p>
                <p><strong>Responsável:</strong> {user?.name || "RH"}</p>
              </div>
              <div>
                <Label>Observações (opcional)</Label>
                <Textarea value={consolidarObs} onChange={e => setConsolidarObs(e.target.value)} placeholder="Observações sobre a consolidação..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConsolidarDialog(false)}>Cancelar</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => {
                consolidarMut.mutate({ companyId, mesReferencia: mesAno, observacoes: consolidarObs || undefined });
              }} disabled={consolidarMut.isPending}>
                {consolidarMut.isPending ? "Consolidando..." : "Consolidar Mês"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ===== DESCONSOLIDAR DIALOG ===== */}
        <Dialog open={showDesconsolidarDialog} onOpenChange={setShowDesconsolidarDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700">
                <Unlock className="h-5 w-5" /> Desconsolidar Mês — {formatMesAno(mesAno)}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <strong>Atenção:</strong> Ao desconsolidar, o mês voltará a aceitar alterações.
                Esta ação é restrita ao <strong>Admin Master</strong>.
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p><strong>Consolidado por:</strong> {consolidacaoStatus.data?.consolidadoPor || "—"}</p>
                <p><strong>Data:</strong> {consolidacaoStatus.data?.consolidadoEm ? new Date(consolidacaoStatus.data.consolidadoEm).toLocaleString("pt-BR") : "—"}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDesconsolidarDialog(false)}>Cancelar</Button>
              <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => {
                desconsolidarMut.mutate({ companyId, mesReferencia: mesAno });
              }} disabled={desconsolidarMut.isPending}>
                {desconsolidarMut.isPending ? "Desconsolidando..." : "Desconsolidar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ===== LIMPAR BASE DIALOG ===== */}
        <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" /> Limpar Base — {formatMesAno(mesAno)}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                <strong>Atenção:</strong> Esta ação é irreversível.
              </div>
              <div>
                <Label>O que deseja limpar?</Label>
                <Select value={clearType} onValueChange={setClearType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tudo">Tudo (Registros + Inconsistências + Rateio)</SelectItem>
                    <SelectItem value="registros">Apenas Registros de Ponto</SelectItem>
                    <SelectItem value="inconsistencias">Apenas Inconsistências</SelectItem>
                    <SelectItem value="rateio">Apenas Rateio por Obra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p><strong>Registros:</strong> {stats.data?.totalRegistros || 0}</p>
                <p><strong>Inconsistências:</strong> {stats.data?.totalInconsistencias || 0}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowClearDialog(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => clearMut.mutate({ companyId, mesReferencia: mesAno, tipo: clearType as any })} disabled={clearMut.isPending}>
                {clearMut.isPending ? "Limpando..." : "Confirmar Exclusão"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
    </DashboardLayout>
  );
}
