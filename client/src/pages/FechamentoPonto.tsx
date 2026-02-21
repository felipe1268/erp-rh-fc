import DashboardLayout from "@/components/DashboardLayout";
import React from "react";
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
  Trash2, Building2, AlertCircle, MapPin, Info, Wifi, Lock, Unlock, UserCheck, Printer, FileDown
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
  const [expandedConflict, setExpandedConflict] = useState<string | null>(null); // "empId|data"
  const [conflictJustificativa, setConflictJustificativa] = useState("");
  const [expandedInconsistency, setExpandedInconsistency] = useState<number | null>(null);

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
  const resolveConflitoMut = trpc.fechamentoPonto.resolveConflito.useMutation({
    onSuccess: (data) => {
      setExpandedConflict(null);
      setConflictJustificativa("");
      conflitos.refetch(); stats.refetch(); summary.refetch();
      if (selectedEmployeeId) employeeDetail.refetch();
      toast.success(data.message);
    },
    onError: (err) => toast.error("Erro: " + err.message),
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

  // ===== PRINT / PDF =====
  const handlePrint = () => {
    const empresa = "FC ENGENHARIA PROJETOS E CONSTRUÇÕES";
    const competencia = formatMesAno(mesAno);
    const dataEmissao = new Date().toLocaleString("pt-BR");
    const consolidadoInfo = isConsolidado ? `Consolidado por: ${consolidacaoStatus.data?.consolidadoPor || "—"} em ${consolidacaoStatus.data?.consolidadoEm ? new Date(consolidacaoStatus.data.consolidadoEm).toLocaleString("pt-BR") : "—"}` : "Não consolidado";

    let titulo = "";
    let conteudo = "";

    if (viewMode === "detalhe" && selectedEmployeeId && employeeDetail.data) {
      // DETALHE DO FUNCIONÁRIO
      const emp = employeeDetail.data.employee;
      titulo = `Registro de Ponto — ${emp?.nomeCompleto || "Colaborador"}`;
      const groups = employeeDetail.data.recordsByObra || [];
      conteudo = `<div style="margin-bottom:16px;padding:10px;background:#f0f0f0;border-radius:6px;"><strong>Colaborador:</strong> ${emp?.nomeCompleto || "-"} | <strong>CPF:</strong> ${formatCPF(emp?.cpf || "")} | <strong>Função:</strong> ${emp?.funcao || "-"}</div>`;
      groups.forEach((g: any) => {
        conteudo += `<h3 style="margin-top:20px;color:#0d9488;font-size:14px;">🏗 ${g.obraNome} — ${g.records.length} registros</h3>`;
        conteudo += `<table><thead><tr><th>Data</th><th>Dia</th><th>Entrada</th><th>Saída Int.</th><th>Retorno</th><th>Saída</th><th>H. Trab.</th><th>H. Extra</th><th>Fonte</th><th>Status</th></tr></thead><tbody>`;
        g.records.forEach((r: any) => {
          const hasIncons = (employeeDetail.data?.inconsistencies || []).some((i: any) => i.data === r.data);
          const bgColor = r.ajusteManual ? "#faf5ff" : hasIncons ? "#fffbeb" : "";
          conteudo += `<tr style="background:${bgColor}"><td>${r.data ? new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</td><td>${dayOfWeek(r.data)}</td><td>${r.entrada1 || "-"}</td><td>${r.saida1 || "-"}</td><td>${r.entrada2 || "-"}</td><td>${r.saida2 || "-"}</td><td style="font-weight:600">${r.horasTrabalhadas || "-"}</td><td style="color:#16a34a;font-weight:600">${r.horasExtras && r.horasExtras !== "0:00" ? r.horasExtras : "-"}</td><td>${r.ajusteManual ? "Manual" : "DIXI"}</td><td>${hasIncons ? "⚠ Inconsistente" : "✓ OK"}</td></tr>`;
        });
        conteudo += `</tbody></table>`;
      });
    } else if (viewMode === "rateio" && rateioData.data) {
      // RATEIO POR OBRA
      titulo = "Rateio de Mão de Obra por Obra";
      rateioData.data.forEach((obra: any) => {
        conteudo += `<div style="margin-top:24px;page-break-inside:avoid;"><div style="background:#f0fdfa;padding:10px 14px;border:1px solid #99f6e4;border-radius:6px 6px 0 0;display:flex;justify-content:space-between;"><div><strong style="color:#0d9488;font-size:15px;">${obra.nomeObra}</strong>`;
        if (obra.snRelogioPonto) conteudo += `<br/><span style="font-size:11px;color:#0d9488;">SN: ${obra.snRelogioPonto}</span>`;
        conteudo += `</div><div style="text-align:right;"><strong>${obra.funcionarios.length} funcionários</strong><br/><span style="font-size:11px;">${obra.totalDias} dias trabalhados</span></div></div>`;
        conteudo += `<table><thead><tr><th>Colaborador</th><th>CPF</th><th>Função</th><th>Dias</th><th>H. Normais</th><th>H. Extras</th><th>Total</th></tr></thead><tbody>`;
        obra.funcionarios.forEach((f: any) => {
          conteudo += `<tr><td>${f.nomeCompleto}</td><td>${formatCPF(f.cpf)}</td><td>${f.funcao || "-"}</td><td style="text-align:center">${f.diasTrabalhados}</td><td style="text-align:center">${f.horasNormais || "0:00"}</td><td style="text-align:center;color:#16a34a;font-weight:600">${f.horasExtras || "0:00"}</td><td style="text-align:center;font-weight:700">${f.totalHoras || "0:00"}</td></tr>`;
        });
        conteudo += `</tbody></table></div>`;
      });
    } else {
      // RESUMO POR COLABORADOR
      titulo = "Resumo por Colaborador";
      conteudo += `<div style="margin-bottom:12px;display:flex;gap:24px;flex-wrap:wrap;"><div><strong>Colaboradores:</strong> ${stats.data?.totalColaboradores || 0}</div><div><strong>Registros:</strong> ${stats.data?.totalRegistros || 0}</div><div><strong>Inconsistências:</strong> ${stats.data?.totalInconsistencias || 0}</div><div><strong>Múltiplas Obras:</strong> ${multiSiteCount}</div><div><strong>Conflitos:</strong> ${conflitosCount}</div></div>`;
      conteudo += `<table><thead><tr><th>Colaborador</th><th>CPF</th><th>Função</th><th>Obra(s)</th><th>Dias</th><th>H. Trab.</th><th>H. Extras</th><th>Atrasos</th><th>Status</th></tr></thead><tbody>`;
      (filteredSummary || []).forEach((emp: any) => {
        const hasConflict = (conflitos.data || []).some((c: any) => c.employeeId === emp.employeeId);
        const bgColor = hasConflict ? "#fff7ed" : emp.multiplasObras ? "#fef2f2" : "";
        const statusText = hasConflict ? "⚠ Conflito" : emp.multiplasObras ? "🔴 Multi-Obra" : "✓ OK";
        conteudo += `<tr style="background:${bgColor}"><td>${emp.employeeName}</td><td>${formatCPF(emp.employeeCpf || "")}</td><td>${emp.employeeFuncao || "-"}</td><td>${(emp.obraNomes || []).join(", ") || "-"}</td><td style="text-align:center">${emp.diasTrabalhados}</td><td style="text-align:center">${emp.horasTrabalhadas}</td><td style="text-align:center;color:#16a34a;font-weight:600">${emp.horasExtras !== "0:00" ? emp.horasExtras : "-"}</td><td style="text-align:center;color:#dc2626">${emp.atrasos !== "0:00" ? emp.atrasos : "-"}</td><td style="text-align:center">${statusText}</td></tr>`;
      });
      conteudo += `</tbody></table>`;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Popup bloqueado. Permita popups para imprimir.");
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo} — ${competencia}</title><style>
      @media print { @page { margin: 12mm 10mm; size: A4 landscape; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 20px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1B2A4A; padding-bottom: 12px; margin-bottom: 16px; }
      .header h1 { font-size: 18px; color: #1B2A4A; margin-bottom: 2px; }
      .header .sub { font-size: 11px; color: #666; }
      .header .right { text-align: right; font-size: 10px; color: #666; }
      .consolidado-badge { display: inline-block; background: #16a34a; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10px; }
      th { background: #f1f5f9; border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; font-weight: 600; color: #334155; white-space: nowrap; }
      td { border: 1px solid #e2e8f0; padding: 5px 8px; white-space: nowrap; }
      tr:nth-child(even) { background: #fafafa; }
      h3 { page-break-after: avoid; }
      .footer { margin-top: 24px; border-top: 2px solid #e2e8f0; padding-top: 10px; font-size: 9px; color: #999; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px; }
      .footer .lgpd { font-style: italic; color: #b91c1c; }
    </style></head><body>
      <div class="header"><div><h1>${empresa}</h1><div class="sub">${titulo} — ${competencia}</div></div><div class="right">Emitido em: ${dataEmissao}<br/>${consolidadoInfo}${isConsolidado ? ' <span class="consolidado-badge">✓ CONSOLIDADO</span>' : ''}</div></div>
      ${conteudo}
      <div class="footer"><span>ERP RH & DP — FC Engenharia</span><span>Documento gerado por: <strong>${user?.name || user?.username || 'Usuário'}</strong> em ${dataEmissao}</span><span class="lgpd">Este documento contém dados pessoais protegidos pela LGPD (Lei 13.709/2018). Uso restrito e confidencial.</span></div>
    </body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

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

          {/* Botão Imprimir / PDF */}
          {(stats.data?.totalRegistros || 0) > 0 && (
            <Button variant="outline" className="text-gray-700 border-gray-300 hover:bg-gray-50 ml-auto" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir / PDF
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
                        <th className="p-2 font-medium">Obra</th>
                        <th className="p-2 font-medium">Tipo</th>
                        <th className="p-2 font-medium">Descrição</th>
                        <th className="p-2 font-medium text-center">Status</th>
                        <th className="p-2 font-medium text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inconsistencies.data.map((item: any) => {
                        const inc = item.inconsistency;
                        const isIncExpanded = expandedInconsistency === inc.id;
                        const dayRecs = item.dayRecords || [];
                        return (
                          <React.Fragment key={inc.id}>
                            <tr className={`border-b hover:bg-muted/30 cursor-pointer ${isIncExpanded ? "bg-amber-50" : ""}`}
                              onClick={() => setExpandedInconsistency(isIncExpanded ? null : inc.id)}
                            >
                              <td className="p-2">
                                <button className="font-medium text-blue-700 hover:underline text-left" onClick={(e) => { e.stopPropagation(); openRaioX(inc.employeeId); }}>
                                  {item.employeeName}
                                </button>
                                {item.employeeFuncao && <span className="block text-xs text-muted-foreground">{item.employeeFuncao}</span>}
                              </td>
                              <td className="p-2 text-muted-foreground text-xs">{formatCPF(item.employeeCpf || "")}</td>
                              <td className="p-2">
                                {inc.data ? new Date(inc.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}
                                <span className="text-muted-foreground ml-1 text-xs">({dayOfWeek(inc.data)})</span>
                              </td>
                              <td className="p-2 text-xs">
                                {item.obraNome ? (
                                  <span className="flex items-center gap-1"><Building2 className="h-3 w-3 text-teal-600" />{item.obraNome}</span>
                                ) : <span className="text-muted-foreground">-</span>}
                              </td>
                              <td className="p-2">
                                <Badge variant={inc.tipoInconsistencia === "batida_impar" ? "destructive" : "secondary"} className="text-xs">
                                  {inc.tipoInconsistencia === "batida_impar" ? "Batida Ímpar" :
                                   inc.tipoInconsistencia === "falta_batida" ? "Falta Batida" :
                                   inc.tipoInconsistencia === "horario_divergente" ? "Horário Divergente" :
                                   inc.tipoInconsistencia === "sem_registro" ? "Sem Registro" : inc.tipoInconsistencia}
                                </Badge>
                              </td>
                              <td className="p-2 text-muted-foreground text-xs max-w-[250px] truncate">{inc.descricao}</td>
                              <td className="p-2 text-center">
                                <Badge variant={inc.status === "pendente" ? "destructive" : inc.status === "justificado" ? "secondary" : "outline"} className="text-xs">
                                  {inc.status === "pendente" ? "Pendente" : inc.status === "justificado" ? "Justificado" : inc.status === "ajustado" ? "Ajustado" : inc.status === "advertencia" ? "Advertência" : inc.status}
                                </Badge>
                              </td>
                              <td className="p-2 text-center">
                                <ChevronRight className={`h-4 w-4 inline transition-transform ${isIncExpanded ? "rotate-90" : ""}`} />
                              </td>
                            </tr>
                            {isIncExpanded && (
                              <tr>
                                <td colSpan={8} className="p-0">
                                  <div className="bg-amber-50/50 border-t border-b border-amber-200 p-4 space-y-4">
                                    {/* Info + Navegação */}
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="bg-white rounded-lg border p-3 text-sm flex-1">
                                        <p><strong>Descrição:</strong> {inc.descricao}</p>
                                        {item.obraNome && <p className="mt-1"><strong>Obra:</strong> <span className="text-teal-700">{item.obraNome}</span></p>}
                                        {inc.resolvidoPor && <p className="mt-1"><strong>Resolvido por:</strong> {inc.resolvidoPor} em {inc.resolvidoEm ? new Date(inc.resolvidoEm + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</p>}
                                        {inc.justificativa && <p className="mt-1"><strong>Justificativa:</strong> {inc.justificativa}</p>}
                                      </div>
                                      <div className="flex flex-col gap-2 shrink-0">
                                        <Button variant="outline" size="sm" className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50"
                                          onClick={(e) => { e.stopPropagation(); setSelectedEmployeeId(inc.employeeId); setViewMode("detalhe"); }}>
                                          <Eye className="h-3.5 w-3.5" /> Ver Ponto Completo
                                        </Button>
                                        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground"
                                          onClick={(e) => { e.stopPropagation(); openRaioX(inc.employeeId); }}>
                                          <Users className="h-3.5 w-3.5" /> Raio-X do Funcionário
                                        </Button>
                                      </div>
                                    </div>

                                    {/* Registros do Dia */}
                                    {dayRecs.length > 0 && (
                                      <div className="bg-white rounded-lg border overflow-hidden">
                                        <div className="bg-slate-50 px-3 py-2 border-b flex items-center gap-2">
                                          <Clock className="h-4 w-4 text-slate-500" />
                                          <span className="text-xs font-semibold text-slate-700">Registros do dia {inc.data ? new Date(inc.data + "T12:00:00").toLocaleDateString("pt-BR") : ""}</span>
                                          <Badge variant="outline" className="text-xs ml-auto">{dayRecs.length} registro(s)</Badge>
                                        </div>
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="bg-slate-50/50 border-b">
                                              <th className="px-3 py-1.5 text-left font-medium text-slate-600">Obra</th>
                                              <th className="px-3 py-1.5 text-center font-medium text-slate-600">Entrada</th>
                                              <th className="px-3 py-1.5 text-center font-medium text-slate-600">Saída Int.</th>
                                              <th className="px-3 py-1.5 text-center font-medium text-slate-600">Retorno</th>
                                              <th className="px-3 py-1.5 text-center font-medium text-slate-600">Saída</th>
                                              <th className="px-3 py-1.5 text-center font-medium text-slate-600">H. Trab.</th>
                                              <th className="px-3 py-1.5 text-center font-medium text-slate-600">H. Extra</th>
                                              <th className="px-3 py-1.5 text-center font-medium text-slate-600">Fonte</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {dayRecs.map((rec: any, idx: number) => (
                                              <tr key={idx} className={`border-b last:border-0 ${rec.ajusteManual ? "bg-purple-50/50" : ""}`}>
                                                <td className="px-3 py-1.5">
                                                  <span className="flex items-center gap-1">
                                                    <Building2 className="h-3 w-3 text-teal-600" />
                                                    {rec.obraNome || "Sem Obra"}
                                                  </span>
                                                </td>
                                                <td className="px-3 py-1.5 text-center font-mono">{rec.entrada1 || <span className="text-red-400">--:--</span>}</td>
                                                <td className="px-3 py-1.5 text-center font-mono">{rec.saida1 || <span className="text-red-400">--:--</span>}</td>
                                                <td className="px-3 py-1.5 text-center font-mono">{rec.entrada2 || <span className="text-red-400">--:--</span>}</td>
                                                <td className="px-3 py-1.5 text-center font-mono">{rec.saida2 || <span className="text-red-400">--:--</span>}</td>
                                                <td className="px-3 py-1.5 text-center font-semibold">{rec.horasTrabalhadas || "-"}</td>
                                                <td className="px-3 py-1.5 text-center font-semibold text-green-700">{rec.horasExtras && rec.horasExtras !== "0:00" ? rec.horasExtras : "-"}</td>
                                                <td className="px-3 py-1.5 text-center">
                                                  <Badge variant={rec.ajusteManual ? "secondary" : "outline"} className="text-[10px]">
                                                    {rec.ajusteManual ? "Manual" : "DIXI"}
                                                  </Badge>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                    {dayRecs.length === 0 && (
                                      <div className="bg-white rounded-lg border p-3 text-center text-xs text-muted-foreground">
                                        <AlertCircle className="h-4 w-4 mx-auto mb-1 text-amber-400" />
                                        Nenhum registro de ponto encontrado para este dia.
                                      </div>
                                    )}

                                    {/* Ações de Resolução */}
                                    {inc.status === "pendente" && !isConsolidado && (
                                      <div className="space-y-2">
                                        <p className="text-xs font-medium text-amber-800">Escolha como resolver:</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                          <button
                                            className="border-2 border-green-200 bg-green-50 rounded-lg p-3 text-left hover:border-green-400 hover:bg-green-100 transition-all"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedInconsistency(item);
                                              setResolveData({ status: "justificado", justificativa: "" });
                                              setShowResolveDialog(true);
                                            }}
                                          >
                                            <div className="flex items-center gap-2">
                                              <CheckCircle className="h-4 w-4 text-green-600" />
                                              <span className="text-sm font-semibold text-green-800">Justificar</span>
                                            </div>
                                            <p className="text-xs text-green-600 mt-1">Sem penalidade — registrar motivo</p>
                                          </button>
                                          <button
                                            className="border-2 border-purple-200 bg-purple-50 rounded-lg p-3 text-left hover:border-purple-400 hover:bg-purple-100 transition-all"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setManualData({
                                                employeeId: inc.employeeId || 0, obraId: inc.obraId || 0,
                                                data: inc.data || "", entrada1: "", saida1: "", entrada2: "", saida2: "",
                                                justificativa: `Correção: ${inc.descricao}`,
                                              });
                                              setShowManualDialog(true);
                                            }}
                                          >
                                            <div className="flex items-center gap-2">
                                              <PenLine className="h-4 w-4 text-purple-600" />
                                              <span className="text-sm font-semibold text-purple-800">Corrigir</span>
                                            </div>
                                            <p className="text-xs text-purple-600 mt-1">Lançar registro manual corrigido</p>
                                          </button>
                                          <button
                                            className="border-2 border-red-200 bg-red-50 rounded-lg p-3 text-left hover:border-red-400 hover:bg-red-100 transition-all"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedInconsistency(item);
                                              setResolveData({ status: "advertencia", justificativa: "" });
                                              setShowResolveDialog(true);
                                            }}
                                          >
                                            <div className="flex items-center gap-2">
                                              <Shield className="h-4 w-4 text-red-600" />
                                              <span className="text-sm font-semibold text-red-800">Advertência</span>
                                            </div>
                                            <p className="text-xs text-red-600 mt-1">Gerar advertência formal</p>
                                          </button>
                                        </div>
                                      </div>
                                    )}
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

                {/* Conflitos deste funcionário — expandível com ações inline */}
                {(() => {
                  const empConflitos = (conflitos.data || []).filter((c: any) => c.employeeId === selectedEmployeeId);
                  if (empConflitos.length === 0) return null;
                  return (
                    <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="h-5 w-5 text-orange-600" />
                        <p className="font-bold text-orange-800">Conflitos de Obra Detectados ({empConflitos.length} dia{empConflitos.length > 1 ? "s" : ""})</p>
                        <span className="text-xs text-orange-600 ml-auto">Clique para expandir e resolver</span>
                      </div>
                      <div className="space-y-2">
                        {empConflitos.map((c: any, idx: number) => {
                          const conflictKey = `${c.employeeId}|${c.data}`;
                          const isExpanded = expandedConflict === conflictKey;
                          return (
                            <div key={idx} className={`bg-white border rounded-lg overflow-hidden transition-all ${isExpanded ? "border-orange-400 shadow-md" : "border-orange-200"}`}>
                              <button
                                className="w-full p-3 flex items-center justify-between hover:bg-orange-50/50 transition-colors text-left"
                                onClick={() => { setExpandedConflict(isExpanded ? null : conflictKey); setConflictJustificativa(""); }}
                              >
                                <div>
                                  <p className="text-sm font-medium">
                                    {new Date(c.data + "T12:00:00").toLocaleDateString("pt-BR")} ({dayOfWeek(c.data)})
                                  </p>
                                  <div className="flex gap-1 mt-1 flex-wrap">
                                    {c.obras.map((o: any, i: number) => (
                                      <Badge key={i} variant="outline" className="text-xs border-orange-300 text-orange-700">
                                        {o.obraNome || "Sem Obra"} — {o.horasTrabalhadas || "0:00"}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge className="bg-orange-600 text-white text-xs">2+ obras</Badge>
                                  <ChevronRight className={`h-4 w-4 text-orange-600 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                </div>
                              </button>
                              {isExpanded && (
                                <div className="border-t border-orange-200 p-4 bg-orange-50/30 space-y-3">
                                  <p className="text-xs text-orange-800 font-medium">Escolha como resolver este conflito:</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {c.obras.map((o: any, i: number) => (
                                      <button
                                        key={i}
                                        className="border-2 border-blue-200 bg-blue-50 rounded-lg p-3 text-left hover:border-blue-400 hover:bg-blue-100 transition-all group"
                                        onClick={() => {
                                          if (!o.obraId) return toast.error("Obra sem ID");
                                          resolveConflitoMut.mutate({
                                            companyId, employeeId: c.employeeId, data: c.data,
                                            acao: "manter_obra", obraIdManter: o.obraId,
                                            justificativa: conflictJustificativa || `Mantido na obra ${o.obraNome}`,
                                          });
                                        }}
                                        disabled={resolveConflitoMut.isPending}
                                      >
                                        <div className="flex items-center gap-2">
                                          <Building2 className="h-4 w-4 text-blue-600" />
                                          <span className="text-sm font-semibold text-blue-800">Manter em: {o.obraNome}</span>
                                        </div>
                                        <p className="text-xs text-blue-600 mt-1">Horas: {o.horasTrabalhadas || "0:00"} — Remove registros das outras obras</p>
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1 border-green-300 text-green-700 hover:bg-green-50 hover:border-green-400"
                                      onClick={() => {
                                        resolveConflitoMut.mutate({
                                          companyId, employeeId: c.employeeId, data: c.data,
                                          acao: "confirmar_deslocamento",
                                          justificativa: conflictJustificativa || "Deslocamento real entre obras confirmado",
                                        });
                                      }}
                                      disabled={resolveConflitoMut.isPending}
                                    >
                                      <CheckCircle className="h-4 w-4 mr-1" /> Confirmar Deslocamento Real
                                    </Button>
                                  </div>
                                  <div className="flex gap-2">
                                    {c.obras.map((o: any, i: number) => (
                                      <Button
                                        key={i}
                                        variant="outline"
                                        size="sm"
                                        className="flex-1 border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400"
                                        onClick={() => {
                                          if (!o.obraId) return toast.error("Obra sem ID");
                                          resolveConflitoMut.mutate({
                                            companyId, employeeId: c.employeeId, data: c.data,
                                            acao: "excluir_registro", obraIdExcluir: o.obraId,
                                            justificativa: conflictJustificativa || `Excluído registro de ${o.obraNome} (erro de lançamento)`,
                                          });
                                        }}
                                        disabled={resolveConflitoMut.isPending}
                                      >
                                        <Trash2 className="h-3 w-3 mr-1" /> Excluir {o.obraNome?.substring(0, 15)}
                                      </Button>
                                    ))}
                                  </div>
                                  <div>
                                    <Label className="text-xs text-orange-700">Justificativa (opcional)</Label>
                                    <Textarea
                                      value={conflictJustificativa}
                                      onChange={e => setConflictJustificativa(e.target.value)}
                                      placeholder="Motivo da decisão..."
                                      className="mt-1 text-sm h-16"
                                    />
                                  </div>
                                  {resolveConflitoMut.isPending && (
                                    <div className="flex items-center gap-2 text-sm text-orange-700">
                                      <div className="h-4 w-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
                                      Processando...
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
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
