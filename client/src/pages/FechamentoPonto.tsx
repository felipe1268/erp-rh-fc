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
  PenLine, Eye, ChevronLeft, ChevronRight, CheckCircle, XCircle, Shield, Search, Filter,
  Trash2, Building2, AlertCircle, MapPin, Info, Wifi
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useRef, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import RaioXFuncionario from "@/components/RaioXFuncionario";

type ViewMode = "resumo" | "inconsistencias" | "detalhe" | "rateio";
type CardFilter = null | "colaboradores" | "registros" | "inconsistencias" | "ajustes" | "multiplasObras";

// Month name helper
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
function formatMesAno(mesAno: string): string {
  const [ano, mes] = mesAno.split("-");
  return `${MESES[parseInt(mes, 10) - 1]} ${ano}`;
}
function prevMes(mesAno: string): string {
  const [ano, mes] = mesAno.split("-").map(Number);
  if (mes === 1) return `${ano - 1}-12`;
  return `${ano}-${String(mes - 1).padStart(2, "0")}`;
}
function nextMes(mesAno: string): string {
  const [ano, mes] = mesAno.split("-").map(Number);
  if (mes === 12) return `${ano + 1}-01`;
  return `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

export default function FechamentoPonto() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const now = new Date();
  const [mesAno, setMesAno] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [viewMode, setViewMode] = useState<ViewMode>("resumo");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showRaioX, setShowRaioX] = useState(false);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);

  // Manual entry state
  const [manualData, setManualData] = useState({
    employeeId: 0, obraId: 0, data: "", entrada1: "", saida1: "", entrada2: "", saida2: "", justificativa: "",
  });

  // Resolve inconsistency state
  const [resolveData, setResolveData] = useState({ status: "justificado" as string, justificativa: "" });

  // Queries
  const stats = trpc.fechamentoPonto.getStats.useQuery({ companyId, mesReferencia: mesAno }, { enabled: companyId > 0 });
  const summary = trpc.fechamentoPonto.getSummary.useQuery({ companyId, mesReferencia: mesAno }, { enabled: companyId > 0 });
  const inconsistencies = trpc.fechamentoPonto.listInconsistencies.useQuery(
    { companyId, mesReferencia: mesAno }, { enabled: companyId > 0 }
  );
  const employeeDetail = trpc.fechamentoPonto.getEmployeeDetail.useQuery(
    { companyId, employeeId: selectedEmployeeId!, mesReferencia: mesAno },
    { enabled: companyId > 0 && selectedEmployeeId !== null }
  );
  const obrasList = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const employeesList = trpc.employees.list.useQuery({ companyId }, { enabled: companyId > 0 });

  // Mutations
  const uploadMut = trpc.fechamentoPonto.uploadDixi.useMutation({
    onSuccess: (data) => {
      setUploadResult(data);
      stats.refetch();
      summary.refetch();
      inconsistencies.refetch();
      toast.success(`${data.totalImported} registros importados com sucesso!`);
    },
    onError: (err) => toast.error("Erro no upload: " + err.message),
  });

  const validateMut = trpc.fechamentoPonto.validateSN.useMutation();

  const manualMut = trpc.fechamentoPonto.manualEntry.useMutation({
    onSuccess: () => {
      setShowManualDialog(false);
      stats.refetch();
      summary.refetch();
      if (selectedEmployeeId) employeeDetail.refetch();
      toast.success("Registro manual salvo com sucesso!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const resolveMut = trpc.fechamentoPonto.resolveInconsistency.useMutation({
    onSuccess: () => {
      setShowResolveDialog(false);
      inconsistencies.refetch();
      stats.refetch();
      toast.success("Inconsistência resolvida!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const clearMut = trpc.fechamentoPonto.clearMonthData.useMutation({
    onSuccess: () => {
      setShowClearDialog(false);
      stats.refetch(); summary.refetch(); inconsistencies.refetch();
      toast.success("Base de dados limpa com sucesso!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const rateioData = trpc.fechamentoPonto.getRateioPorObra.useQuery(
    { companyId, mesReferencia: mesAno }, { enabled: companyId > 0 && viewMode === "rateio" }
  );

  const utils = trpc.useUtils();

  // Count multi-site employees
  const multiSiteCount = useMemo(() => {
    if (!summary.data) return 0;
    return summary.data.filter((e: any) => e.multiplasObras).length;
  }, [summary.data]);

  // Filtered summary
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
    return data;
  }, [summary.data, searchTerm, filterObra, cardFilter]);

  // ===== PRÉ-VALIDAÇÃO DE ARQUIVOS =====
  const handleFilesSelected = async (files: File[]) => {
    setUploadFiles(files);
    setUploadResult(null);
    setValidationResult(null);

    if (files.length === 0) return;

    // Pré-validar arquivos (SN + meses detectados)
    setValidating(true);
    try {
      const filesData = await Promise.all(
        files.map(async (f) => {
          const buffer = await f.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
          );
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

  // ===== UPLOAD HANDLER (REGRA MÃE: sempre distribui nas datas corretas) =====
  const handleUpload = async () => {
    if (uploadFiles.length === 0) return toast.error("Selecione pelo menos um arquivo DIXI");
    if (validationResult && !validationResult.allValid) {
      return toast.error("Corrija os problemas de SN antes de importar. Cadastre os SNs nas obras correspondentes.");
    }
    setUploading(true);
    setUploadResult(null);
    try {
      const filesData = await Promise.all(
        uploadFiles.map(async (f) => {
          const buffer = await f.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
          );
          return { fileName: f.name, fileBase64: base64 };
        })
      );
      await uploadMut.mutateAsync({ companyId, files: filesData });
    } catch (e) {
      // error handled by mutation
    } finally {
      setUploading(false);
    }
  };

  // Day of week helper
  const dayOfWeek = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()];
  };

  const openRaioX = (empId: number) => {
    setRaioXEmployeeId(empId);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
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

        {/* Toolbar com filtro de data dinâmico */}
        <div className="flex flex-wrap items-center gap-3">
          {/* FILTRO DE DATA DINÂMICO */}
          <div className="flex items-center bg-white border rounded-lg shadow-sm">
            <Button variant="ghost" size="sm" className="h-10 px-2 rounded-r-none hover:bg-muted/50" onClick={() => setMesAno(prevMes(mesAno))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 px-3 min-w-[180px] justify-center">
              <CalendarDays className="h-4 w-4 text-[#1B2A4A]" />
              <span className="text-sm font-semibold text-[#1B2A4A]">{formatMesAno(mesAno)}</span>
            </div>
            <Button variant="ghost" size="sm" className="h-10 px-2 rounded-l-none hover:bg-muted/50" onClick={() => setMesAno(nextMes(mesAno))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button onClick={() => { setShowUploadDialog(true); setUploadFiles([]); setUploadResult(null); setValidationResult(null); }} className="bg-[#1B2A4A] hover:bg-[#243660]">
            <Upload className="h-4 w-4 mr-2" /> Upload DIXI
          </Button>
          <Button variant="outline" onClick={() => setShowManualDialog(true)}>
            <PenLine className="h-4 w-4 mr-2" /> Lançamento Manual
          </Button>
          {isAdmin && (stats.data?.totalRegistros || 0) > 0 && (
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

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
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
        </div>

        {/* ALERTA DE MÚLTIPLAS OBRAS */}
        {multiSiteCount > 0 && cardFilter !== "multiplasObras" && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:bg-red-100/50 transition-colors"
            onClick={() => { setViewMode("resumo"); setCardFilter("multiplasObras"); }}>
            <MapPin className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-red-800 text-base">Alerta — Funcionários em Múltiplas Obras</p>
              <p className="text-sm text-red-700 mt-1">
                <strong>{multiSiteCount} funcionário(s)</strong> registraram ponto em mais de uma obra neste mês.
                Isso pode indicar <strong>erro de lançamento</strong> ou <strong>deslocamento real entre obras</strong>.
                Clique para filtrar e verificar.
              </p>
            </div>
            <Badge variant="destructive" className="text-sm px-3 py-1 shrink-0">
              {multiSiteCount} alerta{multiSiteCount > 1 ? "s" : ""}
            </Badge>
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

        {/* RESUMO VIEW */}
        {viewMode === "resumo" && (
          <>
            {(stats.data?.totalRegistros || 0) === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="font-semibold text-lg">Nenhum registro de ponto</h3>
                  <p className="text-muted-foreground text-sm mt-1">Faça o upload dos arquivos DIXI para importar os registros de ponto.</p>
                  <Button onClick={() => { setShowUploadDialog(true); setUploadFiles([]); setUploadResult(null); setValidationResult(null); }} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                    <Upload className="h-4 w-4 mr-2" /> Upload DIXI
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="text-base">
                      Resumo por Colaborador — {formatMesAno(mesAno)}
                      {cardFilter === "multiplasObras" && (
                        <Badge variant="destructive" className="ml-2 text-xs">
                          <MapPin className="h-3 w-3 mr-1" /> Filtro: Múltiplas Obras
                        </Badge>
                      )}
                      {cardFilter === "ajustes" && (
                        <Badge className="ml-2 text-xs bg-purple-100 text-purple-700">
                          <PenLine className="h-3 w-3 mr-1" /> Filtro: Ajustes Manuais
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <Select value={filterObra} onValueChange={setFilterObra}>
                          <SelectTrigger className="w-52 h-9">
                            <SelectValue placeholder="Todas as Obras" />
                          </SelectTrigger>
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
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Limpar Filtros
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
                          <th className="p-2 font-medium text-center">Horas Trab.</th>
                          <th className="p-2 font-medium text-center">Horas Extras</th>
                          <th className="p-2 font-medium text-center">Atrasos</th>
                          <th className="p-2 font-medium text-center">Status</th>
                          <th className="p-2 font-medium text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSummary.map((emp: any) => (
                          <tr key={emp.employeeId} className={`border-b last:border-0 hover:bg-muted/30 ${emp.temAjusteManual ? "bg-purple-50" : ""} ${emp.multiplasObras ? "bg-red-50" : ""}`}>
                            <td className="p-2">
                              <button className="font-medium text-blue-700 hover:underline text-left" onClick={() => openRaioX(emp.employeeId)}>
                                {emp.employeeName}
                              </button>
                              {emp.temAjusteManual && (
                                <Badge variant="outline" className="ml-2 text-xs text-purple-600 border-purple-300">
                                  <PenLine className="h-3 w-3 mr-1" /> Ajuste RH
                                </Badge>
                              )}
                            </td>
                            <td className="p-2 text-muted-foreground">{formatCPF(emp.employeeCpf || "")}</td>
                            <td className="p-2 text-muted-foreground">{emp.employeeFuncao || "-"}</td>
                            <td className="p-2">
                              {emp.multiplasObras ? (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <MapPin className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                  {(emp.obraNomes || []).map((nome: string, i: number) => (
                                    <Badge key={i} variant="outline" className="text-xs border-red-300 text-red-700 bg-red-50">
                                      {nome}
                                    </Badge>
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
                              {emp.multiplasObras ? (
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
                        ))}
                        {filteredSummary.length === 0 && (
                          <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Nenhum resultado encontrado para os filtros aplicados.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* INCONSISTENCIAS VIEW */}
        {viewMode === "inconsistencias" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Inconsistências de Ponto — {formatMesAno(mesAno)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!inconsistencies.data || inconsistencies.data.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-500" />
                  <p>Nenhuma inconsistência encontrada para este período.</p>
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
                              {inc.status === "pendente" && (
                                <div className="flex items-center gap-1 justify-center">
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    setSelectedInconsistency(item);
                                    setResolveData({ status: "justificado", justificativa: "" });
                                    setShowResolveDialog(true);
                                  }}>
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    setManualData({
                                      employeeId: inc.employeeId || 0, obraId: 0,
                                      data: inc.data || "", entrada1: "", saida1: "", entrada2: "", saida2: "",
                                      justificativa: `Correção: ${inc.descricao}`,
                                    });
                                    setShowManualDialog(true);
                                  }}>
                                    <PenLine className="h-4 w-4 text-purple-600" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    setSelectedInconsistency(item);
                                    setResolveData({ status: "advertencia", justificativa: "" });
                                    setShowResolveDialog(true);
                                  }}>
                                    <Shield className="h-4 w-4 text-red-600" />
                                  </Button>
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

        {/* DETALHE VIEW — SEPARADO POR OBRA */}
        {viewMode === "detalhe" && selectedEmployeeId && (
          <>
            {employeeDetail.isLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Carregando...</CardContent></Card>
            ) : (
              <>
                {/* Botão lançar manual */}
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => {
                    setManualData({
                      employeeId: selectedEmployeeId, obraId: 0, data: "",
                      entrada1: "", saida1: "", entrada2: "", saida2: "", justificativa: "",
                    });
                    setShowManualDialog(true);
                  }}>
                    <PenLine className="h-4 w-4 mr-1" /> Lançar Manual
                  </Button>
                </div>

                {/* Registros agrupados por obra */}
                {(employeeDetail.data?.recordsByObra || []).length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      Nenhum registro encontrado para este funcionário neste período.
                    </CardContent>
                  </Card>
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
                                <th className="p-2 font-medium text-center">Horas Trab.</th>
                                <th className="p-2 font-medium text-center">H. Extra</th>
                                <th className="p-2 font-medium text-center">Fonte</th>
                                <th className="p-2 font-medium text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {obraGroup.records.map((rec: any) => {
                                const hasIncons = (employeeDetail.data?.inconsistencies || []).some((i: any) => i.data === rec.data);
                                return (
                                  <tr key={rec.id} className={`border-b last:border-0 ${rec.ajusteManual ? "bg-purple-50" : ""} ${hasIncons ? "bg-amber-50" : ""}`}>
                                    <td className="p-2">{rec.data ? new Date(rec.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</td>
                                    <td className="p-2 text-muted-foreground">{dayOfWeek(rec.data)}</td>
                                    <td className="p-2 text-center font-mono">{rec.entrada1 || "-"}</td>
                                    <td className="p-2 text-center font-mono">{rec.saida1 || "-"}</td>
                                    <td className="p-2 text-center font-mono">{rec.entrada2 || "-"}</td>
                                    <td className="p-2 text-center font-mono">{rec.saida2 || "-"}</td>
                                    <td className="p-2 text-center font-mono font-semibold">{rec.horasTrabalhadas || "-"}</td>
                                    <td className="p-2 text-center font-mono">
                                      {rec.horasExtras && rec.horasExtras !== "0:00" ? (
                                        <span className="text-green-600 font-semibold">{rec.horasExtras}</span>
                                      ) : "-"}
                                    </td>
                                    <td className="p-2 text-center">
                                      {rec.ajusteManual ? (
                                        <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">
                                          <PenLine className="h-3 w-3 mr-1" /> Manual
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs">DIXI</Badge>
                                      )}
                                    </td>
                                    <td className="p-2 text-center">
                                      {hasIncons ? (
                                        <Badge variant="destructive" className="text-xs">
                                          <AlertTriangle className="h-3 w-3 mr-1" /> Inconsistente
                                        </Badge>
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

        {/* RATEIO POR OBRA VIEW — COM SN */}
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
                  <p>Nenhum dado de rateio encontrado para este período.</p>
                  <p className="text-xs mt-1">Os dados de rateio são gerados automaticamente ao importar os arquivos DIXI.</p>
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
                      {/* SN Warning */}
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

        {/* ===== UPLOAD DIALOG (SEM CAMPO COMPETÊNCIA — REGRA MÃE) ===== */}
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" /> Upload de Arquivos DIXI
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <strong>Como funciona:</strong> Selecione os arquivos XLS exportados dos relógios DIXI.
                O sistema identifica automaticamente a <strong>obra pelo SN</strong> e distribui os registros
                na <strong>competência correta</strong> baseado na data de cada registro do arquivo.
              </div>

              {/* REGRA MÃE INFO */}
              <div className="bg-[#1B2A4A]/5 border border-[#1B2A4A]/20 rounded-lg p-3 text-sm text-[#1B2A4A] flex items-start gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Regra automática:</strong> Os registros serão alocados na competência correta conforme a data do arquivo.
                  Se o arquivo contiver registros de meses diferentes, eles serão distribuídos automaticamente.
                </span>
              </div>

              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Clique para selecionar arquivos</p>
                <p className="text-xs text-muted-foreground">Formatos aceitos: .xls, .xlsx (múltiplos arquivos)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xls,.xlsx"
                  multiple
                  className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files || []);
                    handleFilesSelected(files);
                  }}
                />
              </div>

              {/* Arquivos selecionados */}
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

              {/* Validação em andamento */}
              {validating && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Validando arquivos (SN e datas)...
                </div>
              )}

              {/* Resultado da pré-validação */}
              {validationResult && !uploadResult && (
                <div className="space-y-2">
                  {validationResult.results.map((r: any, i: number) => (
                    <div key={i} className={`border rounded-lg p-3 text-sm ${r.valid ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {r.valid ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <span className="font-medium">{r.fileName}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{r.totalRecords} registros</span>
                      </div>
                      <div className="mt-1.5 ml-6 space-y-0.5">
                        <p className="text-xs">
                          <strong>SN:</strong> {r.deviceSerial || "Não identificado"}
                          {r.valid && <span className="text-green-700"> → {r.obraNome}</span>}
                        </p>
                        {r.mesesDetectados.length > 0 && (
                          <p className="text-xs">
                            <strong>Competência(s) detectada(s):</strong>{" "}
                            {r.mesesDetectados.map((m: string) => formatMesAno(m)).join(", ")}
                          </p>
                        )}
                        {r.mesesDetectados.length > 1 && (
                          <p className="text-xs text-amber-700 flex items-center gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3" />
                            Arquivo contém registros de <strong>{r.mesesDetectados.length} meses diferentes</strong>.
                            Serão distribuídos automaticamente nas competências corretas.
                          </p>
                        )}
                        {r.error && <p className="text-xs text-red-700 font-medium mt-1">{r.error}</p>}
                      </div>
                    </div>
                  ))}

                  {!validationResult.allValid && (
                    <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3 text-sm text-red-800">
                      <strong>Ação necessária:</strong> Cadastre o SN do equipamento na aba de Obras antes de fazer o upload.
                      Vá em <strong>Obras → Editar → Campo "SN Relógio de Ponto"</strong> e insira o número de série.
                    </div>
                  )}
                </div>
              )}

              {/* Resultado do upload */}
              {uploadResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm space-y-2">
                  <p className="font-semibold text-green-800">Importação concluída!</p>
                  <p>Registros importados: <strong>{uploadResult.totalImported}</strong></p>
                  <p>Inconsistências detectadas: <strong>{uploadResult.totalInconsistencies}</strong></p>
                  {uploadResult.mesesAfetados?.length > 0 && (
                    <p>Competências atualizadas: <strong>{uploadResult.mesesAfetados.map((m: string) => formatMesAno(m)).join(", ")}</strong></p>
                  )}
                  {uploadResult.totalUnmatched?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-amber-700 font-medium">Funcionários não encontrados no cadastro:</p>
                      <ul className="list-disc list-inside text-xs text-amber-600">
                        {uploadResult.totalUnmatched.map((n: string, i: number) => <li key={i}>{n}</li>)}
                      </ul>
                    </div>
                  )}
                  {uploadResult.fileResults?.map((fr: any, i: number) => (
                    <div key={i} className="border-t pt-2 mt-2">
                      <p className="text-xs"><strong>{fr.fileName}</strong> — Obra: {fr.obraNome} (SN: {fr.deviceSerial})</p>
                      <p className="text-xs">{fr.funcionariosProcessados} funcionários, {fr.totalDiasProcessados} registros</p>
                      {fr.mesesDetectados?.length > 0 && (
                        <p className="text-xs text-muted-foreground">Meses: {fr.mesesDetectados.map((m: string) => formatMesAno(m)).join(", ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter className="shrink-0 border-t pt-4 mt-2">
              <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Fechar</Button>
              {!uploadResult && (
                <Button
                  onClick={handleUpload}
                  disabled={uploading || uploadFiles.length === 0 || validating || (validationResult && !validationResult.allValid)}
                  className="bg-[#1B2A4A] hover:bg-[#243660]"
                >
                  {uploading ? "Processando..." : "Importar"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MANUAL ENTRY DIALOG */}
        <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PenLine className="h-5 w-5 text-purple-600" /> Lançamento Manual de Ponto
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 text-xs text-purple-800">
                Registros manuais ficam <strong>destacados</strong> e são rastreados para avaliação futura do colaborador.
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
                <div><Label>Saída Intervalo</Label><Input type="time" value={manualData.saida1} onChange={e => setManualData(p => ({ ...p, saida1: e.target.value }))} /></div>
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
                  companyId,
                  employeeId: manualData.employeeId,
                  obraId: manualData.obraId || undefined,
                  mesReferencia: mesAno,
                  data: manualData.data,
                  entrada1: manualData.entrada1 || undefined,
                  saida1: manualData.saida1 || undefined,
                  entrada2: manualData.entrada2 || undefined,
                  saida2: manualData.saida2 || undefined,
                  justificativa: manualData.justificativa || undefined,
                });
              }} disabled={manualMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
                {manualMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* RESOLVE INCONSISTENCY DIALOG */}
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
                  <Textarea value={resolveData.justificativa} onChange={e => setResolveData(p => ({ ...p, justificativa: e.target.value }))} placeholder={resolveData.status === "advertencia" ? "Descreva o motivo da advertência..." : "Descreva a justificativa..."} />
                </div>
                {resolveData.status === "advertencia" && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-800">
                    <strong>Atenção:</strong> Ao gerar uma advertência, um registro será criado no módulo de Advertências do colaborador.
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowResolveDialog(false)}>Cancelar</Button>
              <Button onClick={() => {
                if (!selectedInconsistency) return;
                resolveMut.mutate({
                  id: selectedInconsistency.inconsistency.id,
                  status: resolveData.status as any,
                  justificativa: resolveData.justificativa || undefined,
                });
              }} disabled={resolveMut.isPending}
                className={resolveData.status === "advertencia" ? "bg-red-600 hover:bg-red-700" : "bg-[#1B2A4A] hover:bg-[#243660]"}>
                {resolveMut.isPending ? "Processando..." : resolveData.status === "advertencia" ? "Gerar Advertência" : "Resolver"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* LIMPAR BASE DIALOG (ADMIN ONLY) */}
        <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" /> Limpar Base de Dados — {formatMesAno(mesAno)}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                <strong>Atenção:</strong> Esta ação é irreversível. Selecione o que deseja apagar.
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
                <p><strong>Competência:</strong> {formatMesAno(mesAno)}</p>
                <p><strong>Registros atuais:</strong> {stats.data?.totalRegistros || 0}</p>
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
