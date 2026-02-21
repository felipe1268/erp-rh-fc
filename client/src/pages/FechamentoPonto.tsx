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
  PenLine, Eye, ChevronLeft, CheckCircle, XCircle, Shield, Search, Filter,
  Trash2, Building2, AlertCircle
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useRef, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import RaioXFuncionario from "@/components/RaioXFuncionario";

type ViewMode = "resumo" | "inconsistencias" | "detalhe" | "rateio";
type CardFilter = null | "colaboradores" | "registros" | "inconsistencias" | "ajustes";

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
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [selectedInconsistency, setSelectedInconsistency] = useState<any>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
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

  // New mutations
  const clearMut = trpc.fechamentoPonto.clearMonthData.useMutation({
    onSuccess: () => {
      setShowClearDialog(false);
      stats.refetch(); summary.refetch(); inconsistencies.refetch();
      toast.success("Base de dados limpa com sucesso!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  // New queries
  const duplicateCheck = trpc.fechamentoPonto.checkDuplicates.useQuery(
    { companyId, mesReferencia: mesAno }, { enabled: companyId > 0 }
  );
  const rateioData = trpc.fechamentoPonto.getRateioPorObra.useQuery(
    { companyId, mesReferencia: mesAno }, { enabled: companyId > 0 && viewMode === "rateio" }
  );

  const utils = trpc.useUtils();

  // Filtered summary with card filter
  const filteredSummary = useMemo(() => {
    if (!summary.data) return [];
    let data = summary.data;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter((e: any) => e.employeeName?.toLowerCase().includes(term) || e.employeeCpf?.includes(term));
    }
    if (filterObra && filterObra !== "all") {
      data = data.filter((e: any) => String(e.obraId) === filterObra);
    }
    // Card filter
    if (cardFilter === "ajustes") {
      data = data.filter((e: any) => e.temAjusteManual);
    }
    return data;
  }, [summary.data, searchTerm, filterObra, cardFilter]);

  // Handle upload with duplicate check
  const handleUploadWithCheck = () => {
    if (duplicateCheck.data?.hasData) {
      setShowDuplicateDialog(true);
    } else {
      setShowUploadDialog(true); setUploadFiles([]); setUploadResult(null);
    }
  };

  // Upload handler
  const handleUpload = async () => {
    if (uploadFiles.length === 0) return toast.error("Selecione pelo menos um arquivo DIXI");
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
      await uploadMut.mutateAsync({ companyId, mesReferencia: mesAno, files: filesData });
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

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} className="border rounded-md px-3 py-2 text-sm" />
          </div>
          <Button onClick={handleUploadWithCheck} className="bg-[#1B2A4A] hover:bg-[#243660]">
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
            <Button variant="ghost" onClick={() => { setViewMode("resumo"); setCardFilter(null); }}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar ao Resumo
            </Button>
          )}
        </div>

        {/* Stats Cards - All clickable as filters */}
        <div className="grid gap-4 md:grid-cols-4">
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
        </div>

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
                  <Button onClick={() => { setShowUploadDialog(true); setUploadFiles([]); setUploadResult(null); }} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                    <Upload className="h-4 w-4 mr-2" /> Upload DIXI
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Resumo por Colaborador — {mesAno}</CardTitle>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-48 h-9" />
                      </div>
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
                          <tr key={emp.employeeId} className={`border-b last:border-0 hover:bg-muted/30 ${emp.temAjusteManual ? "bg-purple-50" : ""}`}>
                            <td className="p-2 font-medium">
                              {emp.employeeName}
                              {emp.temAjusteManual && (
                                <Badge variant="outline" className="ml-2 text-xs text-purple-600 border-purple-300">
                                  <PenLine className="h-3 w-3 mr-1" /> Ajuste RH
                                </Badge>
                              )}
                            </td>
                            <td className="p-2 text-muted-foreground">{formatCPF(emp.employeeCpf || "")}</td>
                            <td className="p-2 text-muted-foreground">{emp.employeeFuncao || "-"}</td>
                            <td className="p-2 text-center">{emp.diasTrabalhados}</td>
                            <td className="p-2 text-center font-mono">{emp.horasTrabalhadas}</td>
                            <td className="p-2 text-center font-mono">
                              {emp.horasExtras !== "0:00" ? (
                                <span className="text-green-600 font-semibold">{emp.horasExtras}</span>
                              ) : "-"}
                            </td>
                            <td className="p-2 text-center font-mono">
                              {emp.atrasos !== "0:00" ? (
                                <span className="text-red-600">{emp.atrasos}</span>
                              ) : "-"}
                            </td>
                            <td className="p-2 text-center">
                              <Badge variant="outline" className="text-xs text-green-600 border-green-300">OK</Badge>
                            </td>
                            <td className="p-2 text-center">
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedEmployeeId(emp.employeeId); setViewMode("detalhe"); }}>
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
          </>
        )}

        {/* INCONSISTENCIAS VIEW */}
        {viewMode === "inconsistencias" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Inconsistências de Ponto — {mesAno}
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
                            <td className="p-2 font-medium">{item.employeeName}</td>
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
                              <Badge variant={
                                inc.status === "pendente" ? "destructive" :
                                inc.status === "justificado" ? "secondary" :
                                inc.status === "ajustado" ? "default" : "outline"
                              } className="text-xs">
                                {inc.status === "pendente" ? "Pendente" :
                                 inc.status === "justificado" ? "Justificado" :
                                 inc.status === "ajustado" ? "Ajustado" : "Advertência"}
                              </Badge>
                            </td>
                            <td className="p-2 text-center">
                              {inc.status === "pendente" && (
                                <div className="flex gap-1 justify-center">
                                  <Button variant="ghost" size="sm" title="Resolver" onClick={() => {
                                    setSelectedInconsistency(item);
                                    setResolveData({ status: "justificado", justificativa: "" });
                                    setShowResolveDialog(true);
                                  }}>
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  </Button>
                                  <Button variant="ghost" size="sm" title="Lançar Manual" onClick={() => {
                                    setManualData({
                                      employeeId: inc.employeeId,
                                      obraId: inc.obraId || 0,
                                      data: inc.data,
                                      entrada1: "", saida1: "", entrada2: "", saida2: "",
                                      justificativa: "Ajuste manual - " + inc.descricao,
                                    });
                                    setShowManualDialog(true);
                                  }}>
                                    <PenLine className="h-4 w-4 text-purple-600" />
                                  </Button>
                                  <Button variant="ghost" size="sm" title="Gerar Advertência" onClick={() => {
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

        {/* DETALHE VIEW */}
        {viewMode === "detalhe" && selectedEmployeeId && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Registro Diário — {mesAno}</CardTitle>
                <Button variant="outline" size="sm" onClick={() => {
                  setManualData({
                    employeeId: selectedEmployeeId,
                    obraId: 0,
                    data: "",
                    entrada1: "", saida1: "", entrada2: "", saida2: "",
                    justificativa: "",
                  });
                  setShowManualDialog(true);
                }}>
                  <PenLine className="h-4 w-4 mr-1" /> Lançar Manual
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {employeeDetail.isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : (
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
                      {(employeeDetail.data?.records || []).map((rec: any) => {
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
              )}
            </CardContent>
          </Card>
        )}

        {/* UPLOAD DIALOG */}
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" /> Upload de Arquivos DIXI
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <strong>Como funciona:</strong> Selecione os arquivos XLS exportados dos relógios DIXI de cada obra.
                O sistema identifica automaticamente a obra pelo número de série (SN) do relógio.
              </div>

              <div>
                <Label>Competência</Label>
                <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} className="border rounded-md px-3 py-2 text-sm w-full mt-1" />
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
                    setUploadFiles(files);
                  }}
                />
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

              {uploadResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm space-y-2">
                  <p className="font-semibold text-green-800">Importação concluída!</p>
                  <p>Registros importados: <strong>{uploadResult.totalImported}</strong></p>
                  <p>Inconsistências detectadas: <strong>{uploadResult.totalInconsistencies}</strong></p>
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
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Fechar</Button>
              {!uploadResult && (
                <Button onClick={handleUpload} disabled={uploading || uploadFiles.length === 0} className="bg-[#1B2A4A] hover:bg-[#243660]">
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

        {/* RATEIO POR OBRA VIEW */}
        {viewMode === "rateio" && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-teal-600" /> Rateio de Mão de Obra por Obra — {mesAno}
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
                          {obra.codigoObra && <p className="text-xs text-teal-600">Código: {obra.codigoObra}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-teal-800">{obra.funcionarios.length} funcionários</p>
                          <p className="text-xs text-teal-600">{obra.totalDias} dias trabalhados</p>
                        </div>
                      </div>
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
                              <td className="p-2 font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(f.employeeId)}>{f.nomeCompleto}</td>
                              <td className="p-2 text-muted-foreground font-mono text-xs">{formatCPF(f.cpf)}</td>
                              <td className="p-2 text-muted-foreground">{f.funcao || "-"}</td>
                              <td className="p-2 text-center">{f.diasTrabalhados || 0}</td>
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
                <Trash2 className="h-5 w-5" /> Limpar Base de Dados — {mesAno}
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
                <p><strong>Competência:</strong> {mesAno}</p>
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

        {/* DUPLICATE CHECK DIALOG */}
        <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="h-5 w-5" /> Dados Existentes Detectados
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <strong>Atenção:</strong> Já existem <strong>{duplicateCheck.data?.existingCount || 0}</strong> registros para a competência <strong>{mesAno}</strong>.
              </div>
              <p className="text-sm">O que deseja fazer?</p>
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDuplicateDialog(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => {
                clearMut.mutate({ companyId, mesReferencia: mesAno, tipo: "tudo" }, {
                  onSuccess: () => { setShowDuplicateDialog(false); setShowUploadDialog(true); setUploadFiles([]); setUploadResult(null); }
                });
              }} disabled={clearMut.isPending}>
                {clearMut.isPending ? "Limpando..." : "Sobrescrever (apagar e reimportar)"}
              </Button>
              <Button className="bg-[#1B2A4A] hover:bg-[#243660]" onClick={() => { setShowDuplicateDialog(false); setShowUploadDialog(true); setUploadFiles([]); setUploadResult(null); }}>
                Adicionar aos existentes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
    </DashboardLayout>
  );
}
