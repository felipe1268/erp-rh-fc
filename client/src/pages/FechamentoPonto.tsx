import DashboardLayout from "@/components/DashboardLayout";
import React from "react";
import { EmpStatusBadge } from "@/components/EmpStatusBadge";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc";
import { formatCPF, fmtNum } from "@/lib/formatters";
import { formatDateTime, nowBrasilia } from "@/lib/dateUtils";
import { removeAccents } from "@/lib/searchUtils";
import {
  Clock, Upload, FileSpreadsheet, Users, CalendarDays, AlertTriangle,
  PenLine, Eye, ChevronLeft, ChevronRight, CheckCircle, CheckCircle2, XCircle, Shield, Search,
  Trash2, Building2, AlertCircle, MapPin, Info, Wifi, Lock, Unlock, UserCheck, Printer, FileDown, ArrowLeft,
  ListChecks, Filter, ChevronDown, ChevronUp, Zap, ArrowRightLeft, ArrowRight, FileText, Copy,
  ChevronsUpDown, Check, Plus, X, ClipboardList, UserX, CalendarX, Timer, LogOut, ExternalLink, ShieldCheck,
  HardHat, ImageOff
} from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import FullScreenDialog from "@/components/FullScreenDialog";
import ManualEntryDialog, { type ManualEntryInitialData } from "@/components/ponto/ManualEntryDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useRef, useMemo, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import RaioXFuncionario from "@/components/RaioXFuncionario";

type ViewMode = "resumo" | "inconsistencias" | "detalhe" | "rateio" | "nao_identificados" | "memoria_dixi" | "simulador_horistas" | "descontos_clt";

function maskTimeValue(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + ':' + digits.slice(2, 4);
}
function normalizeTimeOnBlur(val: string): string {
  if (!val) return '';
  const parts = val.split(':');
  const h = Math.min(23, parseInt(parts[0] || '0', 10));
  const m = Math.min(59, parseInt(parts[1] || '0', 10));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Easter Sunday calculation (Gaussian algorithm)
function getEaster(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Returns a Set of "YYYY-MM-DD" strings for Brazilian national holidays in a given year
function getBrazilianHolidays(year: number): Set<string> {
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const fixed = [
    `${year}-01-01`, `${year}-04-21`, `${year}-05-01`,
    `${year}-09-07`, `${year}-10-12`, `${year}-11-02`,
    `${year}-11-15`, `${year}-12-25`,
  ];
  const easter = getEaster(year);
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const variable = [
    fmt(addDays(easter, -48)), // Segunda de Carnaval
    fmt(addDays(easter, -47)), // Terça de Carnaval
    fmt(addDays(easter, -2)),  // Sexta-feira Santa
    fmt(easter),               // Páscoa
    fmt(addDays(easter, 60)),  // Corpus Christi
  ];
  return new Set([...fixed, ...variable]);
}

// Helper: extracts schedule times from jornadaTrabalho for a given date
function getScheduleForDay(jornadaTrabalho: string | null | undefined, dateStr: string): { entrada1: string; saida1: string; entrada2: string; saida2: string } {
  const empty = { entrada1: "", saida1: "", entrada2: "", saida2: "" };
  if (!jornadaTrabalho || !dateStr) return empty;
  try {
    const parsed = JSON.parse(jornadaTrabalho);
    if (typeof parsed !== "object" || Array.isArray(parsed)) return empty;
    const keys = ["dom","seg","ter","qua","qui","sex","sab"];
    const dayKey = keys[new Date(dateStr + "T12:00:00").getDay()];
    const day = parsed[dayKey];
    if (!day?.entrada || !day?.saida) return empty;
    const entrada1 = day.entrada;
    const saida2 = day.saida;
    if (day.intervalo) {
      const [ih, im] = day.intervalo.split(":").map(Number);
      const breakMins = (ih || 0) * 60 + (im || 0);
      if (breakMins > 0) {
        // Intervalo fixo às 12:00 (padrão da construção civil)
        const lunchOutMins = 12 * 60;
        const lunchInMins = lunchOutMins + breakMins;
        const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2,"0")}:${String(m % 60).padStart(2,"0")}`;
        return { entrada1, saida1: fmt(lunchOutMins), entrada2: fmt(lunchInMins), saida2 };
      }
    }
    return { entrada1, saida1: "", entrada2: "", saida2 };
  } catch { return empty; }
}

// Helper to navigate to Controle de Documentos > Advertências with pre-filled data
function navigateToAdvertencia(setLocation: (path: string) => void, employeeId: number, employeeName: string, data: string, descricao: string) {
  // Store pre-fill data in sessionStorage so ControleDocumentos can pick it up
  sessionStorage.setItem("advPreFill", JSON.stringify({
    employeeId,
    employeeName,
    dataOcorrencia: data,
    motivo: `Inconsistência de ponto: ${descricao}`,
    descricao: `Advertência originada de inconsistência de ponto do dia ${data ? new Date(data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}. ${descricao || ""}`,
  }));
  setLocation("/controle-documentos?tab=advertencias&action=nova");
}
type CardFilter = null | "colaboradores" | "registros" | "inconsistencias" | "ajustes" | "multiplasObras" | "conflitos" | "inativos";

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function formatMesAno(mesAno: string): string {
  const [ano, mes] = mesAno.split("-");
  return `${MESES[parseInt(mes, 10) - 1]} ${ano}`;
}

// ============================================================
// COMPONENTE: Painel de Descontos CLT
// ============================================================
const TIPO_LABELS: Record<string, string> = {
  atraso: "Atraso",
  falta_injustificada: "Falta Injustificada",
  saida_antecipada: "Saída Antecipada",
  falta_dsr: "DSR Falta",
  dsr_falta: "DSR Falta",
  he_nao_autorizada: "HE Não Autorizada",
};
const TIPO_COLORS: Record<string, string> = {
  atraso: "bg-yellow-100 text-yellow-800",
  falta_injustificada: "bg-red-100 text-red-800",
  saida_antecipada: "bg-orange-100 text-orange-800",
  falta_dsr: "bg-purple-100 text-purple-800",
  dsr_falta: "bg-purple-100 text-purple-800",
  he_nao_autorizada: "bg-pink-100 text-pink-800",
};
const STATUS_DESC_LABELS: Record<string, string> = {
  calculado: "Calculado",
  revisado: "Revisado",
  abonado: "Abonado",
  fechado: "Fechado",
};
const STATUS_DESC_COLORS: Record<string, string> = {
  calculado: "bg-blue-100 text-blue-800",
  revisado: "bg-green-100 text-green-800",
  abonado: "bg-emerald-100 text-emerald-800",
  fechado: "bg-gray-200 text-gray-700",
};

function DescontosCLTPanel({ companyId, companyIds, mesAno, isMaster }: { companyId: number; companyIds?: number[]; mesAno: string; isMaster: boolean }) {
  const [activeSubTab, setActiveSubTab] = useState<"resumo" | "detalhes" | "atestados">("resumo");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterEmpId, setFilterEmpId] = useState<number | undefined>(undefined);
  const [abonoId, setAbonoId] = useState<number | null>(null);
  const [abonoMotivo, setAbonoMotivo] = useState("");

  const utils = trpc.useUtils();
  const totais = trpc.pontoDescontos.totaisMes.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  const resumo = trpc.pontoDescontos.listResumo.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  const atestadosMes = trpc.pontoDescontos.atestadosMes.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || (companyIds || []).length > 0 });
  const detalhes = trpc.pontoDescontos.listByMonth.useQuery(
    { companyId, mesReferencia: mesAno, tipo: filterTipo !== "all" ? filterTipo : undefined, employeeId: filterEmpId },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const calcularMut = trpc.pontoDescontos.calcularMes.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.pontoDescontos.totaisMes.invalidate();
      utils.pontoDescontos.listResumo.invalidate();
      utils.pontoDescontos.listByMonth.invalidate();
      utils.pontoDescontos.atestadosMes.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const abonarMut = trpc.pontoDescontos.abonar.useMutation({
    onSuccess: () => {
      toast.success("Desconto abonado com sucesso!");
      setAbonoId(null);
      setAbonoMotivo("");
      utils.pontoDescontos.listByMonth.invalidate();
      utils.pontoDescontos.listResumo.invalidate();
      utils.pontoDescontos.totaisMes.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const fecharMut = trpc.pontoDescontos.fecharMes.useMutation({
    onSuccess: () => {
      toast.success("Mês de descontos fechado!");
      utils.pontoDescontos.listByMonth.invalidate();
      utils.pontoDescontos.listResumo.invalidate();
      utils.pontoDescontos.totaisMes.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleCalcular() {
    if (!confirm("Deseja calcular/recalcular os descontos CLT do mês? Os cálculos anteriores serão substituídos.")) return;
    calcularMut.mutate({ companyId, companyIds, mesReferencia: mesAno });
  }

  function handleFechar() {
    if (!confirm("Deseja FECHAR os descontos do mês? Após o fechamento, não será possível alterar.")) return;
    fecharMut.mutate({ companyId, companyIds, mesReferencia: mesAno });
  }

  function handleAbonar() {
    if (!abonoId || abonoMotivo.length < 5) { toast.error("Informe o motivo do abono (mínimo 5 caracteres)"); return; }
    abonarMut.mutate({ id: abonoId, motivoAbono: abonoMotivo });
  }

  const t = totais.data;

  return (
    <div className="space-y-4">
      {/* Header + Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-rose-600" />
          Motor de Descontos CLT — {formatMesAno(mesAno)}
        </h3>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleCalcular} disabled={calcularMut.isPending}
            className="bg-rose-600 hover:bg-rose-700 text-white">
            {calcularMut.isPending ? "Calculando..." : "Calcular Descontos"}
          </Button>
          {isMaster && (t?.totalEventos || 0) > 0 && (
            <Button size="sm" variant="outline" onClick={handleFechar} disabled={fecharMut.isPending}>
              <Lock className="h-4 w-4 mr-1" /> Fechar Mês
            </Button>
          )}
        </div>
      </div>

      {/* Totais Cards */}
      {t && t.totalEventos > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Card className="border-t-2 border-t-yellow-400">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-yellow-600">{t.totalAtrasos}</p>
              <p className="text-xs text-muted-foreground">Atrasos</p>
            </CardContent>
          </Card>
          <Card className="border-t-2 border-t-red-400">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-red-600">{t.totalFaltas}</p>
              <p className="text-xs text-muted-foreground">Faltas</p>
            </CardContent>
          </Card>
          <Card className="border-t-2 border-t-orange-400">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-orange-600">{t.totalSaidas}</p>
              <p className="text-xs text-muted-foreground">Saídas Antecip.</p>
            </CardContent>
          </Card>
          <Card className="border-t-2 border-t-purple-400">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-purple-600">{(t as any).totalDsrFalta ?? t.totalDsr ?? 0}</p>
              <p className="text-xs text-muted-foreground">DSR Falta</p>
            </CardContent>
          </Card>
          <Card className="border-t-2 border-t-pink-400">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-pink-600">{t.totalHeNaoAut}</p>
              <p className="text-xs text-muted-foreground">HE Não Autoriz.</p>
            </CardContent>
          </Card>
          <Card className="border-t-2 border-t-blue-400">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-blue-600">{t.funcionariosAfetados}</p>
              <p className="text-xs text-muted-foreground">Funcionários</p>
            </CardContent>
          </Card>
          <Card className="border-t-2 border-t-rose-600">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-rose-600">
                {parseFloat(t.valorTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <p className="text-xs text-muted-foreground">Total Descontos</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="font-medium">Nenhum desconto calculado para este mês</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Calcular Descontos" para analisar os registros de ponto.</p>
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mt-4 text-sm text-rose-800 max-w-md text-center">
              <strong>Fundamentação:</strong> Art. 58 §1º CLT (tolerância), Art. 462 CLT (descontos), Lei 605/49 (DSR), Art. 130 CLT (férias).
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sub-tabs */}
      {((t && t.totalEventos > 0) || (atestadosMes.data || []).length > 0) && (
        <>
          <div className="flex gap-2 border-b pb-2">
            <Button variant={activeSubTab === "resumo" ? "default" : "ghost"} size="sm"
              onClick={() => setActiveSubTab("resumo")}
              className={activeSubTab === "resumo" ? "bg-rose-600 text-white" : ""}>
              <Users className="h-4 w-4 mr-1" /> Resumo por Funcionário
            </Button>
            <Button variant={activeSubTab === "detalhes" ? "default" : "ghost"} size="sm"
              onClick={() => setActiveSubTab("detalhes")}
              className={activeSubTab === "detalhes" ? "bg-rose-600 text-white" : ""}>
              <FileText className="h-4 w-4 mr-1" /> Detalhes Analíticos
            </Button>
            <Button variant={activeSubTab === "atestados" ? "default" : "ghost"} size="sm"
              onClick={() => setActiveSubTab("atestados")}
              className={activeSubTab === "atestados" ? "bg-purple-600 text-white" : ""}>
              <ClipboardList className="h-4 w-4 mr-1" /> Atestados ({(atestadosMes.data || []).length})
            </Button>
          </div>

          {/* Resumo por Funcionário */}
          {activeSubTab === "resumo" && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-rose-50 border-b">
                  <th className="p-2.5 text-left">Funcionário</th>
                  <th className="p-2.5 text-left">Função</th>
                  <th className="p-2.5 text-center">Atrasos</th>
                  <th className="p-2.5 text-center">Faltas</th>
                  <th className="p-2.5 text-center">Saídas Ant.</th>
                  <th className="p-2.5 text-center">DSR Falta</th>
                  <th className="p-2.5 text-center">HE Não Aut.</th>
                  <th className="p-2.5 text-right">Total Desc.</th>
                  <th className="p-2.5 text-center">Férias</th>
                  <th className="p-2.5 text-center">Status</th>
                </tr></thead>
                <tbody>
                  {(resumo.data || []).map((r: any) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => { setFilterEmpId(r.employeeId); setActiveSubTab("detalhes"); }}>
                      <td className="p-2.5 font-medium">{r.employeeName || `ID ${r.employeeId}`}</td>
                      <td className="p-2.5 text-muted-foreground">{r.employeeFuncao || "-"}</td>
                      <td className="p-2.5 text-center">
                        {r.totalAtrasos > 0 ? <Badge className="bg-yellow-100 text-yellow-800">{r.totalAtrasos}</Badge> : "-"}
                      </td>
                      <td className="p-2.5 text-center">
                        {r.totalFaltasInjustificadas > 0 ? <Badge className="bg-red-100 text-red-800">{r.totalFaltasInjustificadas}</Badge> : "-"}
                      </td>
                      <td className="p-2.5 text-center">
                        {r.totalSaidasAntecipadas > 0 ? <Badge className="bg-orange-100 text-orange-800">{r.totalSaidasAntecipadas}</Badge> : "-"}
                      </td>
                      <td className="p-2.5 text-center">
                        {(r.totalDsrFalta ?? r.totalDsrPerdidos ?? 0) > 0 ? <Badge className="bg-purple-100 text-purple-800">{r.totalDsrFalta ?? r.totalDsrPerdidos}</Badge> : "-"}
                      </td>
                      <td className="p-2.5 text-center">
                        {r.totalHeNaoAutorizadas > 0 ? <Badge className="bg-pink-100 text-pink-800">{r.totalHeNaoAutorizadas}</Badge> : "-"}
                      </td>
                      <td className="p-2.5 text-right font-bold text-rose-700">
                        {parseFloat(r.valorTotalDescontos || "0").toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="text-xs">{r.diasFeriasResultante}d</span>
                      </td>
                      <td className="p-2.5 text-center">
                        <Badge className={STATUS_DESC_COLORS[r.status] || "bg-gray-100"}>
                          {STATUS_DESC_LABELS[r.status] || r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {(resumo.data || []).length === 0 && (
                    <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Nenhum resumo encontrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Detalhes Analíticos */}
          {activeSubTab === "detalhes" && (
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                <Select value={filterTipo} onValueChange={setFilterTipo}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Tipos</SelectItem>
                    <SelectItem value="atraso">Atrasos</SelectItem>
                    <SelectItem value="falta_injustificada">Faltas</SelectItem>
                    <SelectItem value="saida_antecipada">Saídas Antecipadas</SelectItem>
                    <SelectItem value="dsr_falta">DSR Falta</SelectItem>
                    <SelectItem value="falta_dsr">DSR Falta (legado)</SelectItem>
                    <SelectItem value="he_nao_autorizada">HE Não Autorizadas</SelectItem>
                  </SelectContent>
                </Select>
                {filterEmpId && (
                  <Button variant="outline" size="sm" onClick={() => setFilterEmpId(undefined)}>
                    <XCircle className="h-3 w-3 mr-1" /> Limpar filtro funcionário
                  </Button>
                )}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-rose-50 border-b">
                    <th className="p-2.5 text-left">Data</th>
                    <th className="p-2.5 text-left">Funcionário</th>
                    <th className="p-2.5 text-center">Tipo</th>
                    <th className="p-2.5 text-center">Min.</th>
                    <th className="p-2.5 text-right">Valor</th>
                    <th className="p-2.5 text-right">DSR</th>
                    <th className="p-2.5 text-right">Total</th>
                    <th className="p-2.5 text-center">Status</th>
                    <th className="p-2.5 text-left">Fund. Legal</th>
                    <th className="p-2.5 text-center">Ações</th>
                  </tr></thead>
                  <tbody>
                    {(detalhes.data || []).map((d: any) => (
                      <tr key={d.id} className="border-b hover:bg-muted/30">
                        <td className="p-2.5">{d.data ? new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</td>
                        <td className="p-2.5 font-medium">{d.employeeName || `ID ${d.employeeId}`}</td>
                        <td className="p-2.5 text-center">
                          <Badge className={TIPO_COLORS[d.tipo] || "bg-gray-100"}>
                            {TIPO_LABELS[d.tipo] || d.tipo}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-center font-mono">{d.minutosAtraso || d.minutosHe || "-"}</td>
                        <td className="p-2.5 text-right font-mono">
                          {parseFloat(d.valorDesconto || "0") > 0
                            ? parseFloat(d.valorDesconto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                            : "-"}
                        </td>
                        <td className="p-2.5 text-right font-mono">
                          {parseFloat(d.valorDsr || "0") > 0
                            ? parseFloat(d.valorDsr).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                            : "-"}
                        </td>
                        <td className="p-2.5 text-right font-bold text-rose-700">
                          {parseFloat(d.valorTotal || "0") > 0
                            ? parseFloat(d.valorTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                            : "-"}
                        </td>
                        <td className="p-2.5 text-center">
                          <Badge className={STATUS_DESC_COLORS[d.status] || "bg-gray-100"}>
                            {STATUS_DESC_LABELS[d.status] || d.status}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-xs text-muted-foreground max-w-[200px] truncate" title={d.fundamentacaoLegal}>
                          {d.fundamentacaoLegal || "-"}
                        </td>
                        <td className="p-2.5 text-center">
                          {d.status === "calculado" && (
                            <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700"
                              onClick={() => { setAbonoId(d.id); setAbonoMotivo(""); }}>
                              Abonar
                            </Button>
                          )}
                          {d.status === "abonado" && (
                            <span className="text-xs text-emerald-600" title={`Abonado por: ${d.abonadoPor}\nMotivo: ${d.motivoAbono}`}>
                              Abonado
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(detalhes.data || []).length === 0 && (
                      <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Nenhum desconto encontrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Atestados do Mês */}
          {activeSubTab === "atestados" && (
            <div className="space-y-3">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-800">
                <strong>Atestados registrados neste mês:</strong> dias com atestado são automaticamente excluídos do cálculo de descontos.
                Se um desconto já existir para um dia coberto por atestado, ao recalcular ele será removido automaticamente.
              </div>
              {(atestadosMes.data || []).length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-purple-50 border-b">
                      <th className="p-2.5 text-left">Funcionário</th>
                      <th className="p-2.5 text-center">Emissão</th>
                      <th className="p-2.5 text-center">Tipo</th>
                      <th className="p-2.5 text-center">Afastamento</th>
                      <th className="p-2.5 text-center">Dias Cobertos</th>
                      <th className="p-2.5 text-left">CID</th>
                      <th className="p-2.5 text-left">Médico</th>
                    </tr></thead>
                    <tbody>
                      {(atestadosMes.data || []).map((a: any) => {
                        const dias = a.diasAfastamento || 1;
                        const afTipo = a.afastamentoTipo || "dia";
                        const datasCobertas: string[] = [];
                        if (afTipo === "horas") {
                          datasCobertas.push(a.dataEmissao);
                        } else {
                          const startDate = new Date(a.dataEmissao + "T12:00:00Z");
                          for (let d = 0; d < dias; d++) {
                            const dt = new Date(startDate);
                            dt.setUTCDate(startDate.getUTCDate() + d);
                            datasCobertas.push(dt.toISOString().substring(0, 10));
                          }
                        }
                        return (
                          <tr key={a.id} className="border-b hover:bg-muted/30">
                            <td className="p-2.5 font-medium">{a.nomeCompleto}</td>
                            <td className="p-2.5 text-center">{new Date(a.dataEmissao + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                            <td className="p-2.5 text-center">
                              <Badge className="bg-purple-100 text-purple-800">{a.tipo || "Médico"}</Badge>
                            </td>
                            <td className="p-2.5 text-center">
                              {afTipo === "horas"
                                ? <span className="font-medium">{(() => { const h = Number(a.horasAfastamento || 0); const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); return mm > 0 ? `${hh}h${String(mm).padStart(2,"0")}` : `${hh}h`; })()}</span>
                                : <span className="font-medium">{dias} dia{dias > 1 ? "s" : ""}</span>
                              }
                            </td>
                            <td className="p-2.5 text-center">
                              <div className="flex flex-wrap gap-1 justify-center">
                                {datasCobertas.map(d => (
                                  <span key={d} className="px-1.5 py-0.5 bg-purple-100 rounded text-[11px] font-mono">
                                    {d.split("-").reverse().join("/")}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="p-2.5 text-muted-foreground">{a.cid || "-"}</td>
                            <td className="p-2.5 text-muted-foreground">{a.medico || "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <ClipboardList className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="font-medium">Nenhum atestado registrado neste mês</p>
                    <p className="text-sm text-muted-foreground mt-1">Atestados cadastrados em Controle de Documentos aparecem aqui automaticamente.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* Dialog de Abono */}
      {abonoId && (
        <Dialog open={!!abonoId} onOpenChange={() => setAbonoId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abonar Desconto</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
                O desconto será zerado e marcado como abonado. Esta ação ficará registrada na auditoria.
              </div>
              <div>
                <Label>Motivo do Abono *</Label>
                <Textarea value={abonoMotivo} onChange={e => setAbonoMotivo(e.target.value)}
                  placeholder="Informe o motivo do abono (ex: atestado médico, autorização do gestor...)" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAbonoId(null)}>Cancelar</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAbonar} disabled={abonarMut.isPending}>
                {abonarMut.isPending ? "Abonando..." : "Confirmar Abono"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function FechamentoPonto() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = user?.role === "admin" || user?.role === "admin_master";
  const isMaster = user?.role === "admin_master";
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const now = new Date();
  const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());
  const [mesSelecionado, setMesSelecionado] = useState(now.getMonth() + 1);
  const mesAno = `${anoSelecionado}-${String(mesSelecionado).padStart(2, "0")}`;

  // Ler query params da URL para abrir detalhe do funcionário automaticamente (ex: vindo do dashboard)
  const searchString = useSearch();
  const urlParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const urlFuncionario = urlParams.get("funcionario");
  const urlMes = urlParams.get("mes");

  const [viewMode, setViewMode] = useState<ViewMode>(urlFuncionario ? "detalhe" : "resumo");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(urlFuncionario ? Number(urlFuncionario) : null);

  // Setar mês da URL se fornecido (ex: 2026-01)
  useEffect(() => {
    if (urlMes) {
      const [ano, mes] = urlMes.split("-");
      if (ano && mes) {
        setAnoSelecionado(Number(ano));
        setMesSelecionado(Number(mes));
      }
    }
  }, [urlMes]);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadPeriodoDe, setUploadPeriodoDe] = useState("");
  const [uploadPeriodoAte, setUploadPeriodoAte] = useState("");
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
  const [showSelectiveDialog, setShowSelectiveDialog] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<number>>(new Set());
  const [showReplaceAllConfirm, setShowReplaceAllConfirm] = useState(false);
  const [replaceAllPassword, setReplaceAllPassword] = useState("");
  const [replaceAllPasswordError, setReplaceAllPasswordError] = useState("");
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const verifyPasswordMut = trpc.auth.verifyPassword.useMutation();
  const [selectiveSearch, setSelectiveSearch] = useState("");
  const [showExistingEmployees, setShowExistingEmployees] = useState(false);
  const [expandedEmpIds, setExpandedEmpIds] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [filterObra, setFilterObra] = useState<string>("all");
  const [cardFilter, setCardFilter] = useState<CardFilter>(null);
  // ===== Modal de Relatório de Faltas =====
  const [faltasModalOpen, setFaltasModalOpen] = useState(false);
  const [faltasDataInicio, setFaltasDataInicio] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - 1, 16).toISOString().slice(0, 10);
  });
  const [faltasDataFim, setFaltasDataFim] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 15).toISOString().slice(0, 10);
  });
  const [faltasObraIds, setFaltasObraIds] = useState<number[]>([]);
  const [faltasExpandedIds, setFaltasExpandedIds] = useState<Set<number>>(new Set());
  const [faltasSearch, setFaltasSearch] = useState("");
  const [clearType, setClearType] = useState<string>("tudo");
  const [clearPeriodDe, setClearPeriodDe] = useState("");
  const [clearPeriodAte, setClearPeriodAte] = useState("");
  const [clearPeriodTipo, setClearPeriodTipo] = useState<string>("tudo");
  const [consolidarObs, setConsolidarObs] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [manualSeed, setManualSeed] = useState<ManualEntryInitialData | undefined>(undefined);
  const [resolveData, setResolveData] = useState({ status: "justificado" as string, justificativa: "" });
  const [expandedConflict, setExpandedConflict] = useState<string | null>(null); // "empId|data"
  const [conflictJustificativa, setConflictJustificativa] = useState("");
  const [expandedInconsistency, setExpandedInconsistency] = useState<number | null>(null);
  const [incFilterType, setIncFilterType] = useState<string>("all");
  const [incFilterStatus, setIncFilterStatus] = useState<string>("pendente");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [linkingName, setLinkingName] = useState<string | null>(null);
  const [linkSearchTerm, setLinkSearchTerm] = useState("");
  const [linkSelectedEmpId, setLinkSelectedEmpId] = useState<number | null>(null);
  // Simulador Horistas
  const [simDiasUteis, setSimDiasUteis] = useState(22);
  const [simHorasDia, setSimHorasDia] = useState(8);
  // Período especial manual (férias / aviso prévio retroativo)
  const [showPeriodoEspecial, setShowPeriodoEspecial] = useState(false);
  const [periodoEspecialTipo, setPeriodoEspecialTipo] = useState<'ferias' | 'aviso_2h' | 'aviso_7dias'>('ferias');
  const [periodoEspecialInicio, setPeriodoEspecialInicio] = useState("");
  const [periodoEspecialFim, setPeriodoEspecialFim] = useState("");
  // Modal de ranking detalhado
  const [rankingModal, setRankingModal] = useState<"pontuais" | "atrasados" | "extras" | "faltosos" | null>(null);
  const [rankingSearch, setRankingSearch] = useState("");
  const [rankingObraFilter, setRankingObraFilter] = useState("all");
  const [diasDetalhe, setDiasDetalhe] = useState<{ employeeId: number; nome: string } | null>(null);
  // Rev. 2019 — Memória de cálculo do "Atraso Acumulado" por colaborador
  const [atrasoDetalhe, setAtrasoDetalhe] = useState<{ employeeId: number; nome: string; totalStr: string } | null>(null);
  // Rev. 2051 — Memória de cálculo de HE e Faltas (drill-down dos modais de ranking)
  const [heDetalhe, setHeDetalhe] = useState<{ employeeId: number; nome: string; totalStr: string } | null>(null);
  const [faltaDetalhe, setFaltaDetalhe] = useState<{ employeeId: number; nome: string; totalDias: number } | null>(null);
  // Memória DIXI
  const [addMappingOpen, setAddMappingOpen] = useState(false);
  const [newMappingDixiName, setNewMappingDixiName] = useState("");
  const [newMappingEmpId, setNewMappingEmpId] = useState<number | null>(null);
  const [memSearchTerm, setMemSearchTerm] = useState("");
  // Modal de ajuste rápido de inconsistência
  const [quickFixOpen, setQuickFixOpen] = useState(false);
  const [quickFixRec, setQuickFixRec] = useState<any>(null); // o registro do timeRecord
  const [quickFixData, setQuickFixData] = useState({
    entrada1: "", saida1: "", entrada2: "", saida2: "",
    motivoAjuste: "", descricaoMotivo: "",
  });
  const MOTIVOS_AJUSTE = [
    "Esqueceu de bater o ponto",
    "Saiu mais cedo",
    "Ficou doente",
    "Falta justificada",
    "Liberado pela chefia",
    "Problema no relógio de ponto",
    "Atraso justificado",
    "Serviço externo",
    "Outro",
  ];

  // ===== QUERIES =====
  // consolidacaoStatus precisa vir ANTES de summary para extrair o ciclo real (ex: 16/03–15/04)
  // e passar dataInicio/dataFim corretos para o getSummary evitar erro de 48% presença.
  const consolidacaoStatus = trpc.fechamentoPonto.getConsolidacaoStatus.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  const consolidacaoData = consolidacaoStatus.data;
  const isParcial = consolidacaoData?.parcial === true;
  // "isConsolidado" no contexto da UI = mês inteiro travado (não apenas o ciclo).
  // Quando há consolidação parcial, dias escuros ainda devem ser editáveis.
  const isConsolidado = consolidacaoData?.consolidado === true && !isParcial;
  const cicloInicio: string | null = consolidacaoData?.dataInicioCiclo ?? null;
  const cicloFim: string | null = consolidacaoData?.dataFimCiclo ?? null;

  // Rev. 2010: fallback de ciclo 16→15 quando consolidação ainda não foi feita (cicloInicio/Fim null).
  // ANTES: summary caía em `mesReferencia = "YYYY-MM"` (mês calendário) e perdia 11 dias do mês anterior,
  // gerando discrepância: tabela mostrava 10 dias / 45% enquanto modal mostrava 21 dias / 95%.
  // AGORA: sempre passa o range real do ciclo (16/mês-ant → 15/mês-atual) p/ getSummary querying coincidir
  // 100% com getDiasEmployee usado no drill-down.
  const cicloRangeFallback = useMemo(() => {
    if (cicloInicio && cicloFim) return { ini: cicloInicio, fim: cicloFim };
    if (!mesAno) return { ini: undefined, fim: undefined };
    const [ano, mes] = mesAno.split("-").map(Number);
    const anoAnt = mes === 1 ? ano - 1 : ano;
    const mesAnt = mes === 1 ? 12 : mes - 1;
    return { ini: `${anoAnt}-${String(mesAnt).padStart(2, "0")}-16`, fim: `${ano}-${String(mes).padStart(2, "0")}-15` };
  }, [cicloInicio, cicloFim, mesAno]);

  const stats = trpc.fechamentoPonto.getStats.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  // Quando o ciclo não coincide com o mês calendário (ex: 16/03–15/04), passar o range real
  // para que o backend busque registros de AMBOS os meses e os dias trabalhados fiquem corretos.
  const summary = trpc.fechamentoPonto.getSummary.useQuery(
    { companyId, companyIds, mesReferencia: mesAno, dataInicio: cicloRangeFallback.ini, dataFim: cicloRangeFallback.fim },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );
  const inconsistencies = trpc.fechamentoPonto.listInconsistencies.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  const employeeDetail = trpc.fechamentoPonto.getEmployeeDetail.useQuery(
    { companyId, employeeId: selectedEmployeeId!, mesReferencia: mesAno },
    { enabled: (companyId > 0 || companyIds.length > 0) && selectedEmployeeId !== null }
  );
  const obrasList = trpc.obras.listActive.useQuery({ companyId, companyIds }, { enabled: companyId > 0 || companyIds.length > 0 });
  const employeesList = trpc.employees.list.useQuery({ companyId, companyIds, excludeTerminated: true, includeTerminatedInMonth: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  const monthStatuses = trpc.fechamentoPonto.getMonthStatuses.useQuery({ companyId, companyIds, ano: anoSelecionado }, { enabled: companyId > 0 || companyIds.length > 0 });
  const conflitos = trpc.fechamentoPonto.getConflitosObraDia.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  const atestadosMes = trpc.pontoDescontos.atestadosMes.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  // Rev. 2060 — passa os bounds do CICLO (16→15) pra incluir HEs do mês
  // anterior quando o ciclo cruza virada de mês. Sem isso, mesReferencia
  // sozinho (ex: '2026-05' pra ciclo 16/04→15/05) deixava todas as HEs
  // aprovadas de abril FORA do match — efeito: 79/79 viravam "Sem solicitação".
  const heSolicitacoesMes = trpc.heSolicitacoes.list.useQuery(
    { companyId, companyIds, mesReferencia: mesAno, status: "todas",
      dataInicio: cicloRangeFallback.ini, dataFim: cicloRangeFallback.fim },
    { enabled: rankingModal === "extras" && (companyId > 0 || companyIds.length > 0) }
  );
  const unmatchedData = trpc.fechamentoPonto.getUnmatchedRecords.useQuery(
    { companyId, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 }
  );
  const rateioData = trpc.fechamentoPonto.getRateioPorObra.useQuery(
    { companyId, mesReferencia: mesAno }, { enabled: (companyId > 0 || companyIds.length > 0) && viewMode === "rateio" }
  );
  const dixiMappings = trpc.fechamentoPonto.getDixiMappings.useQuery(
    { companyId }, { enabled: (companyId > 0 || companyIds.length > 0) && viewMode === "memoria_dixi" }
  );
  const simuladorData = trpc.fechamentoPonto.simularFolhaHoristas.useQuery(
    { companyId, diasUteis: simDiasUteis, horasPorDia: simHorasDia },
    { enabled: (companyId > 0 || companyIds.length > 0) && viewMode === "simulador_horistas" }
  );
  // True quando uma data específica está dentro do ciclo consolidado (e portanto bloqueada).
  const isDateLocked = (data?: string | null): boolean => {
    if (consolidacaoData?.consolidado !== true) return false;
    if (!data) return isConsolidado;
    if (!cicloInicio || !cicloFim) return isConsolidado;
    return data >= cicloInicio && data <= cicloFim;
  };

  // ===== MUTATIONS =====
  const previewMut = trpc.fechamentoPonto.previewDixi.useMutation();
  const uploadMut = trpc.fechamentoPonto.uploadDixi.useMutation({
    onSuccess: (data) => {
      setUploadResult(data);
      setShowSelectiveDialog(false);
      setPreviewData(null);
      stats.refetch(); summary.refetch(); inconsistencies.refetch(); monthStatuses.refetch(); conflitos.refetch(); unmatchedData.refetch();
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
  const handleManualSaved = () => {
    stats.refetch();
    summary.refetch();
    conflitos.refetch();
    inconsistencies.refetch();
    if (selectedEmployeeId) employeeDetail.refetch();
  };

  const resolveMut = trpc.fechamentoPonto.resolveInconsistency.useMutation({
    onSuccess: () => {
      setShowResolveDialog(false);
      inconsistencies.refetch(); stats.refetch(); summary.refetch();
      if (selectedEmployeeId) employeeDetail.refetch();
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
  const clearByPeriodMut = trpc.fechamentoPonto.clearByPeriod.useMutation({
    onSuccess: (data) => {
      setShowClearDialog(false);
      setClearPeriodDe(""); setClearPeriodAte("");
      stats.refetch(); summary.refetch(); inconsistencies.refetch(); monthStatuses.refetch(); conflitos.refetch();
      toast.success(`Período limpo: ${data.deletedRecords} registros e ${data.deletedInconsistencias} inconsistências removidos.`);
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
  const periodoEspecialMut = trpc.fechamentoPonto.corrigirPeriodoEspecialManual.useMutation({
    onSuccess: (data) => {
      setShowPeriodoEspecial(false);
      employeeDetail.refetch(); stats.refetch(); summary.refetch();
      if (data.corrigidos === 0) toast.info("Nenhum registro automático encontrado nesse período (registros ajustados manualmente são preservados).");
      else toast.success(`${data.corrigidos} registro(s) corrigido(s) com sucesso.`);
    },
    onError: (err) => toast.error("Erro: " + err.message),
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
  const resolveBatchMut = trpc.fechamentoPonto.resolveBatchByType.useMutation({
    onSuccess: (data) => {
      inconsistencies.refetch(); stats.refetch(); summary.refetch();
      toast.success(`${data.resolved} inconsistências resolvidas como justificadas!`);
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });
  const resolveAllMut = trpc.fechamentoPonto.resolveAllInconsistencies.useMutation({
    onSuccess: (data) => {
      inconsistencies.refetch(); stats.refetch(); summary.refetch();
      toast.success(`${data.resolved} inconsistências resolvidas como justificadas!`);
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });
  const resolveAllConflitosMut = trpc.fechamentoPonto.resolveAllConflitos.useMutation({
    onSuccess: (data: any) => {
      conflitos.refetch(); stats.refetch(); summary.refetch();
      if (data.skippedOverlaps && data.skippedOverlaps.length > 0) {
        toast.warning(data.message, { duration: 10000 });
      } else {
        toast.success(data.message || `${data.resolved} conflitos resolvidos com rateio proporcional!`);
      }
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });
  const resolveAllDuplicatasMut = trpc.fechamentoPonto.resolveAllDuplicatas.useMutation({
    onSuccess: (data: any) => {
      conflitos.refetch(); stats.refetch(); summary.refetch();
      toast.success(data.message || `${data.excluidos} duplicata(s) excluída(s)!`, { duration: 8000 });
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });
  const limparDixiComManualMut = trpc.fechamentoPonto.limparDixiComManual.useMutation({
    onSuccess: (data: any) => {
      conflitos.refetch(); stats.refetch(); summary.refetch();
      toast.success(data.message || `${data.excluidos} registros DIXI excluídos!`, { duration: 8000 });
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });
  const linkUnmatchedMut = trpc.fechamentoPonto.linkUnmatchedToEmployee.useMutation({
    onSuccess: (data) => {
      unmatchedData.refetch(); stats.refetch(); summary.refetch(); inconsistencies.refetch();
      toast.success(`${data.recordsLinked} registro(s) vinculado(s) a ${data.employeeName}`);
      setLinkingName(null);
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });
  const discardUnmatchedMut = trpc.fechamentoPonto.discardUnmatched.useMutation({
    onSuccess: () => {
      unmatchedData.refetch();
      toast.success("Registros descartados com sucesso.");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });
  const addDixiMappingMut = trpc.fechamentoPonto.addDixiMapping.useMutation({
    onSuccess: () => {
      dixiMappings.refetch();
      setAddMappingOpen(false);
      setNewMappingDixiName("");
      setNewMappingEmpId(null);
      toast.success("Vinculação salva na memória!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });
  const deleteDixiMappingMut = trpc.fechamentoPonto.deleteDixiMapping.useMutation({
    onSuccess: () => {
      dixiMappings.refetch();
      toast.success("Vinculação removida da memória.");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  // ===== COMPUTED =====
  const multiSiteCount = useMemo(() => {
    if (!summary.data) return 0;
    return summary.data.filter((e: any) => e.multiplasObras).length;
  }, [summary.data]);

  const inativoCount = useMemo(() => {
    if (!summary.data) return 0;
    return summary.data.filter((e: any) => e.alertaInativo).length;
  }, [summary.data]);

  const conflitosCount = useMemo(() => (conflitos.data || []).length, [conflitos.data]);

  const filteredSummary = useMemo(() => {
    if (!summary.data) return [];
    let data = summary.data;
    if (searchTerm) {
      const term = removeAccents(searchTerm);
      data = data.filter((e: any) => removeAccents(e.employeeName || '').includes(term) || e.employeeCpf?.includes(term));
    }
    if (filterObra && filterObra !== "all") {
      data = data.filter((e: any) => {
        const ids = e.obraIds || (e.obraId ? [e.obraId] : []);
        return ids.includes(parseInt(filterObra, 10));
      });
    }
    if (cardFilter === "ajustes") data = data.filter((e: any) => e.temAjusteManual);
    if (cardFilter === "multiplasObras") data = data.filter((e: any) => e.multiplasObras);
    if (cardFilter === "inativos") data = data.filter((e: any) => e.alertaInativo);
    if (cardFilter === "conflitos") {
      const conflitosEmpIds = new Set((conflitos.data || []).map((c: any) => c.employeeId));
      data = data.filter((e: any) => conflitosEmpIds.has(e.employeeId));
    }
    // Filtro de status (Conforme / Com Problema)
    if (statusFilter === "conforme") {
      const conflitosEmpIds = new Set((conflitos.data || []).map((c: any) => c.employeeId));
      data = data.filter((e: any) => !conflitosEmpIds.has(e.employeeId) && !e.multiplasObras);
    } else if (statusFilter === "problema") {
      const conflitosEmpIds = new Set((conflitos.data || []).map((c: any) => c.employeeId));
      data = data.filter((e: any) => conflitosEmpIds.has(e.employeeId) || e.multiplasObras);
    }
    return data;
  }, [summary.data, searchTerm, filterObra, cardFilter, conflitos.data, statusFilter]);

  // ===== RANKINGS =====
  const rankings = useMemo(() => {
    if (!summary.data || summary.data.length === 0) return null;
    const parseHM = (hm: string) => {
      if (!hm || hm === "0:00") return 0;
      const [h, m] = hm.split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const fmtHM = (mins: number) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
    const data = summary.data.map((e: any) => ({
      id: e.employeeId,
      nome: e.employeeName,
      funcao: e.employeeFuncao || "-",
      status: e.employeeStatus,
      dias: e.diasTrabalhados || 0,
      horasTrab: parseHM(e.horasTrabalhadas),
      horasExtras: parseHM(e.horasExtras),
      atrasos: parseHM(e.atrasos),
      horasTrabahadasStr: e.horasTrabalhadas || "0:00",
      horasExtrasStr: e.horasExtras || "0:00",
      atrasosStr: e.atrasos || "0:00",
      obraNomes: (e.obraNomes || []) as string[],
      obraIds: (e.obraIds || []) as number[],
      // Rev. 2015 — propaga foto + CIPA pros rankings (Mais Pontuais/Atrasados/HE/Faltosos)
      fotoUrl: e.employeeFotoUrl || null,
      cipaStatus: e.cipaStatus || null,
      cipaCargo: e.cipaCargo || null,
      cipaFimEstabilidade: e.cipaFimEstabilidade || null,
      // Rev. 2054 — Férias no ciclo (pra excluir do ranking "Menos Dias Trabalhados")
      emFerias: !!e.emFerias,
      diasFerias: e.diasFerias || 0,
      // Rev. 2077 — propaga Aviso Prévio pros rankings (selo amber em todos os cards)
      emAvisoPrevio: !!e.emAvisoPrevio,
    }));
    // Top 5 mais pontuais (menos atrasos, mais dias)
    const allPontuais = [...data].filter(e => e.dias > 0).sort((a, b) => a.atrasos - b.atrasos || b.dias - a.dias);
    const pontuais = allPontuais.slice(0, 5);
    // Top 5 mais atrasados (ordenado por tempo acumulado de atraso)
    const allAtrasados = [...data].filter(e => e.atrasos > 0).sort((a, b) => b.atrasos - a.atrasos);
    const atrasados = allAtrasados.slice(0, 5);
    // Top 5 mais horas extras
    const allExtras = [...data].filter(e => e.horasExtras > 0).sort((a, b) => b.horasExtras - a.horasExtras);
    const extras = allExtras.slice(0, 5);
    // Top 5 menos dias (possíveis faltas) — Rev. 2054: EXCLUI colaboradores em
    // gozo de férias no período (é injusto rankeá-los como "menos trabalhados").
    const allFaltosos = [...data].filter(e => e.dias >= 0 && !e.emFerias).sort((a, b) => a.dias - b.dias);
    const faltosos = allFaltosos.slice(0, 5);
    return { pontuais, atrasados, extras, faltosos, allPontuais, allAtrasados, allExtras, allFaltosos, fmtHM };
  }, [summary.data]);

  // Período efetivo do ciclo: usa datas do backend se disponíveis, senão calcula pelo mesAno (16/mês-ant → 15/mês-atual)
  const { periodoIni, periodoFim } = useMemo(() => {
    if (cicloInicio && cicloFim) return { periodoIni: cicloInicio, periodoFim: cicloFim };
    if (!mesAno) return { periodoIni: null, periodoFim: null };
    const [ano, mes] = mesAno.split("-").map(Number);
    // mês anterior
    const anoAnt = mes === 1 ? ano - 1 : ano;
    const mesAnt = mes === 1 ? 12 : mes - 1;
    const ini = `${anoAnt}-${String(mesAnt).padStart(2, "0")}-16`;
    const fim = `${ano}-${String(mes).padStart(2, "0")}-15`;
    return { periodoIni: ini, periodoFim: fim };
  }, [cicloInicio, cicloFim, mesAno]);

  const diasEmployeeQuery = trpc.fechamentoPonto.getDiasEmployee.useQuery(
    { companyId, companyIds, employeeId: diasDetalhe?.employeeId ?? 0, dataInicio: periodoIni ?? "", dataFim: periodoFim ?? "" },
    { enabled: !!diasDetalhe && !!periodoIni && !!periodoFim && (companyId > 0 || companyIds.length > 0) }
  );

  // Rev. 2019 — Memória de cálculo do atraso acumulado por dia
  const atrasoDetalheQuery = trpc.fechamentoPonto.getAtrasoDetalhe.useQuery(
    { companyId, companyIds, employeeId: atrasoDetalhe?.employeeId ?? 0, dataInicio: periodoIni ?? "", dataFim: periodoFim ?? "" },
    { enabled: !!atrasoDetalhe && !!periodoIni && !!periodoFim && (companyId > 0 || companyIds.length > 0) }
  );

  // Rev. 2051 — Memória de cálculo de HE e Faltas (drill-down)
  const heDetalheQuery = trpc.fechamentoPonto.getHeDetalhe.useQuery(
    { companyId, companyIds, employeeId: heDetalhe?.employeeId ?? 0, dataInicio: periodoIni ?? "", dataFim: periodoFim ?? "" },
    { enabled: !!heDetalhe && !!periodoIni && !!periodoFim && (companyId > 0 || companyIds.length > 0) }
  );
  const faltaDetalheQuery = trpc.fechamentoPonto.getFaltaDetalhe.useQuery(
    { companyId, companyIds, employeeId: faltaDetalhe?.employeeId ?? 0, dataInicio: periodoIni ?? "", dataFim: periodoFim ?? "" },
    { enabled: !!faltaDetalhe && !!periodoIni && !!periodoFim && (companyId > 0 || companyIds.length > 0) }
  );

  // Rev. 2014 — Calendário de feriados (federais fixos + Páscoa-derivados + estaduais/municipais
  // cadastrados em /configuracoes/feriados). É a mesma fonte que o EspelhoPonto/payrollEngine
  // usam, evitando divergência de definição de "dia útil".
  const feriadosPeriodoQuery = trpc.feriados.listarPeriodo.useQuery(
    { companyId, companyIds, dataInicio: periodoIni ?? "", dataFim: periodoFim ?? "" },
    { enabled: !!periodoIni && !!periodoFim && (companyId > 0 || companyIds.length > 0) }
  );
  const feriadosSet = useMemo(() => {
    return new Set<string>(feriadosPeriodoQuery.data ?? []);
  }, [feriadosPeriodoQuery.data]);
  // Buscar nomes pra exibir no drill-down (ano inteiro do início do período cobre os casos comuns).
  const feriadosNomesQuery = trpc.feriados.listar.useQuery(
    { companyId, companyIds, ano: periodoIni ? parseInt(periodoIni.slice(0, 4), 10) : new Date().getFullYear() },
    { enabled: !!periodoIni && (companyId > 0 || companyIds.length > 0) }
  );
  const feriadosNomesQuery2 = trpc.feriados.listar.useQuery(
    { companyId, companyIds, ano: periodoFim ? parseInt(periodoFim.slice(0, 4), 10) : new Date().getFullYear() },
    { enabled: !!periodoFim && (companyId > 0 || companyIds.length > 0) && periodoIni?.slice(0, 4) !== periodoFim?.slice(0, 4) }
  );
  const feriadoNomeMap = useMemo(() => {
    const m = new Map<string, string>();
    const push = (list: any[] | undefined) => {
      if (!list) return;
      for (const f of list) {
        // Normaliza pra YYYY-MM-DD (banco pode ter MM-DD pra recorrentes mas listar já expande)
        const d = String(f.data || "");
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) m.set(d, f.nome);
      }
    };
    push(feriadosNomesQuery.data as any[] | undefined);
    push(feriadosNomesQuery2.data as any[] | undefined);
    return m;
  }, [feriadosNomesQuery.data, feriadosNomesQuery2.data]);

  // Dias ÚTEIS reais no período (segunda a sexta, exclui sábado/domingo E feriados em dia útil).
  // Rev. 2000: antes contava dias CORRIDOS — corrigido pra úteis reais com clamp 100%.
  // Rev. 2014: agora também subtrai feriados (federais/estaduais/municipais) que caem em Seg-Sex,
  // pra não inflar o denominador com dias em que ninguém deveria ter batido o ponto.
  const diasUteisNoPeriodo = useMemo(() => {
    if (!periodoIni || !periodoFim) return null;
    const ini = new Date(periodoIni + "T12:00:00Z");
    const fim = new Date(periodoFim + "T12:00:00Z");
    if (fim < ini) return null;
    let count = 0;
    const cur = new Date(ini);
    while (cur <= fim) {
      const dow = cur.getUTCDay(); // 0=dom, 6=sab
      if (dow !== 0 && dow !== 6) {
        const ds = cur.toISOString().slice(0, 10);
        if (!feriadosSet.has(ds)) count++;
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return count > 0 ? count : null;
  }, [periodoIni, periodoFim, feriadosSet]);

  // Formata data YYYY-MM-DD para DD/MM/YYYY
  const fmtPeriodo = (d: string | null) => d ? d.split("-").reverse().join("/") : "";

  // Dados filtrados para o modal de ranking
  const filteredRankingRows = useMemo(() => {
    if (!rankingModal || !rankings) return [];
    const base =
      rankingModal === "pontuais" ? rankings.allPontuais :
      rankingModal === "atrasados" ? rankings.allAtrasados :
      rankingModal === "extras" ? rankings.allExtras :
      rankings.allFaltosos;
    return base.filter((e: any) => {
      const matchSearch = !rankingSearch || e.nome.toLowerCase().includes(rankingSearch.toLowerCase()) || e.funcao.toLowerCase().includes(rankingSearch.toLowerCase());
      const matchObra = rankingObraFilter === "all" || (e.obraIds || []).includes(Number(rankingObraFilter));
      return matchSearch && matchObra;
    });
  }, [rankingModal, rankings, rankingSearch, rankingObraFilter]);

  // Print do modal de ranking — abre nova janela com layout formatado
  const handlePrintRanking = () => {
    if (!rankingModal || !rankings) return;
    const titulo =
      rankingModal === "pontuais" ? "Mais Pontuais" :
      rankingModal === "atrasados" ? "Mais Atrasados" :
      rankingModal === "extras" ? "Mais Horas Extras" : "Menos Dias Trabalhados";
    const mes = mesAno ? mesAno.replace("-", "/") : "";
    const heSols = heSolicitacoesMes.data || [];
    const atests = atestadosMes.data || [];
    const colsHeader =
      rankingModal === "pontuais" ? `<th>Dias Trab.</th><th>Total Horas</th><th>Tempo Atraso Acum.</th>` :
      rankingModal === "atrasados" ? `<th>Dias Trab.</th><th>Total Horas</th><th>Tempo Atraso Acum.</th>` :
      rankingModal === "extras" ? `<th>Dias Trab.</th><th>Total Horas</th><th>Total HE</th><th>Solicitação HE</th>` :
      `<th>Dias Trab.</th><th>Total Horas</th><th>Faltas</th><th>Justificativa</th>`;
    const rows = filteredRankingRows.map((e: any, i: number) => {
      let heStatusHtml = "";
      if (rankingModal === "extras") {
        const found = heSols.filter((sol: any) => sol.funcionarios?.some((f: any) => f.employeeId === e.id));
        if (found.some((s: any) => s.status === "aprovada")) heStatusHtml = `<span style="color:#166534">✅ Aprovada</span>`;
        else if (found.some((s: any) => s.status === "pendente")) heStatusHtml = `<span style="color:#854d0e">⏳ Pendente</span>`;
        else if (found.some((s: any) => s.status === "rejeitada")) heStatusHtml = `<span style="color:#991b1b">❌ Rejeitada</span>`;
        else heStatusHtml = `<span style="color:#c2410c;font-weight:600">⚠️ Sem solicitação</span>`;
      }
      let justHtml = "";
      if (rankingModal === "faltosos") {
        const hasAtest = atests.some((a: any) => a.employeeId === e.id);
        justHtml = hasAtest ? `<span style="color:#166534">✅ Justificada</span>` : `<span style="color:#991b1b">❌ Não justificada</span>`;
      }
      const obraStr = (e.obraNomes || []).join(", ") || "-";
      const extraCols =
        rankingModal === "pontuais" ? `<td>${e.dias}</td><td>${e.horasTrabahadasStr}</td><td style="color:${e.atrasos === 0 ? "#166534" : "#991b1b"}">${e.atrasosStr}</td>` :
        rankingModal === "atrasados" ? `<td>${e.dias}</td><td>${e.horasTrabahadasStr}</td><td style="color:#991b1b;font-weight:600">${e.atrasosStr}</td>` :
        rankingModal === "extras" ? `<td>${e.dias}</td><td>${e.horasTrabahadasStr}</td><td style="color:#166534;font-weight:600">${e.horasExtrasStr}</td><td>${heStatusHtml}</td>` :
        `<td>${e.dias}</td><td>${e.horasTrabahadasStr}</td><td>${e.dias}</td><td>${justHtml}</td>`;
      return `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:6px 8px;text-align:center;color:#6b7280">${i + 1}</td>
        <td style="padding:6px 8px;font-weight:600">${e.nome}</td>
        <td style="padding:6px 8px;color:#6b7280">${e.funcao}</td>
        <td style="padding:6px 8px;color:#6b7280;font-size:11px">${obraStr}</td>
        ${extraCols}
      </tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo} — ${mes}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 0; padding: 20px; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      .sub { color: #6b7280; font-size: 13px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f3f4f6; padding: 8px; text-align: left; font-size: 11px; font-weight: 700; border-bottom: 2px solid #d1d5db; }
      td { padding: 6px 8px; font-size: 12px; }
      tfoot td { background: #f9fafb; font-weight: 600; border-top: 2px solid #d1d5db; font-size: 11px; }
      @page { margin: 20mm; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h1>${titulo}</h1>
    <div class="sub">Referência: ${mes} · Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · ${filteredRankingRows.length} colaboradores</div>
    <table>
      <thead><tr><th>#</th><th>Nome</th><th>Função</th><th>Obra(s)</th>${colsHeader}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="4">Total: ${filteredRankingRows.length} colaboradores</td>
        <td>${Math.round(filteredRankingRows.reduce((s: number, e: any) => s + e.dias, 0) / Math.max(filteredRankingRows.length, 1))} dias (média)</td>
        <td>${(() => { const t = filteredRankingRows.reduce((s: number, e: any) => s + e.horasTrab, 0); return `${Math.floor(t/60)}:${String(t%60).padStart(2,"0")}`; })()} total</td>
        <td colspan="10"></td>
      </tr></tfoot>
    </table>
    </body></html>`;
    const win = window.open("", "_blank", "width=1100,height=800");
    if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 500); }
  };

  // Export CSV do ranking
  const handleExportRankingCSV = () => {
    if (!rankingModal || !filteredRankingRows.length) return;
    const titulo =
      rankingModal === "pontuais" ? "mais-pontuais" :
      rankingModal === "atrasados" ? "mais-atrasados" :
      rankingModal === "extras" ? "mais-horas-extras" : "menos-dias-trabalhados";
    const mes = mesAno || "sem-data";
    const heSols = heSolicitacoesMes.data || [];
    const atests = atestadosMes.data || [];
    const headers =
      rankingModal === "pontuais" ? ["#", "Nome", "Função", "Obra(s)", "Dias Trabalhados", "Total Horas", "Tempo Atraso Acumulado"] :
      rankingModal === "atrasados" ? ["#", "Nome", "Função", "Obra(s)", "Dias Trabalhados", "Total Horas", "Tempo Atraso Acumulado"] :
      rankingModal === "extras" ? ["#", "Nome", "Função", "Obra(s)", "Dias Trabalhados", "Total Horas", "Total HE", "Solicitação HE"] :
      ["#", "Nome", "Função", "Obra(s)", "Dias Trabalhados", "Total Horas", "Justificativa"];
    const csvRows = [headers.join(";")];
    filteredRankingRows.forEach((e: any, i: number) => {
      const obraStr = (e.obraNomes || []).join(" | ") || "-";
      let extra: string[] = [];
      if (rankingModal === "pontuais") extra = [String(e.dias), e.horasTrabahadasStr, e.atrasosStr];
      else if (rankingModal === "atrasados") extra = [String(e.dias), e.horasTrabahadasStr, e.atrasosStr];
      else if (rankingModal === "extras") {
        const found = heSols.filter((sol: any) => sol.funcionarios?.some((f: any) => f.employeeId === e.id));
        let st = "Sem solicitação";
        if (found.some((s: any) => s.status === "aprovada")) st = "Aprovada";
        else if (found.some((s: any) => s.status === "pendente")) st = "Pendente";
        else if (found.some((s: any) => s.status === "rejeitada")) st = "Rejeitada";
        extra = [String(e.dias), e.horasTrabahadasStr, e.horasExtrasStr, st];
      } else {
        const hasAtest = atests.some((a: any) => a.employeeId === e.id);
        extra = [String(e.dias), e.horasTrabahadasStr, hasAtest ? "Justificada" : "Não justificada"];
      }
      csvRows.push([String(i + 1), `"${e.nome}"`, `"${e.funcao}"`, `"${obraStr}"`, ...extra].join(";"));
    });
    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${titulo}-${mes}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

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
      const result = await validateMut.mutateAsync({ companyId, companyIds, files: filesData });
      setValidationResult(result);
    } catch (e: any) {
      toast.error("Erro na validação: " + e.message);
    } finally {
      setValidating(false);
    }
  };

  const getFilesBase64 = async () => {
    return Promise.all(
      uploadFiles.map(async (f) => {
        const buffer = await f.arrayBuffer();
        const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""));
        return { fileName: f.name, fileBase64: base64 };
      })
    );
  };

  const [pendingDirectUpload, setPendingDirectUpload] = useState(false);

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return toast.error("Selecione pelo menos um arquivo DIXI");
    if (validationResult && !validationResult.allValid) {
      return toast.error("Corrija os problemas de SN antes de importar.");
    }
    if (!uploadPeriodoDe || !uploadPeriodoAte) {
      return toast.error("Informe o período (De e Até) antes de importar.");
    }
    if (uploadPeriodoDe > uploadPeriodoAte) {
      return toast.error("A data inicial do período não pode ser maior que a data final.");
    }
    setPreviewLoading(true);
    try {
      const filesData = await getFilesBase64();
      const preview = await previewMut.mutateAsync({ companyId, companyIds, files: filesData });
      if (preview.hasExistingData || (preview.apontamentosCampo && preview.apontamentosCampo.length > 0) || preview.isSharedSn) {
        setPreviewData(preview);
        setSelectedEmployeeIds(new Set(preview.employees.map((e: any) => e.employeeId)));
        setSelectiveSearch("");
        setShowExistingEmployees(false);
        setExpandedEmpIds(new Set());
        setPendingDirectUpload(!preview.hasExistingData);
        setShowSelectiveDialog(true);
      } else {
        setUploading(true);
        setUploadResult(null);
        await uploadMut.mutateAsync({ companyId, companyIds, files: filesData, periodoInicio: uploadPeriodoDe, periodoFim: uploadPeriodoAte });
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao processar arquivo");
    } finally {
      setPreviewLoading(false);
      setUploading(false);
    }
  };

  const handleUploadSelective = async (mode: "replace_all" | "selective") => {
    setUploading(true);
    setUploadResult(null);
    try {
      const filesData = await getFilesBase64();
      await uploadMut.mutateAsync({
        companyId, companyIds, files: filesData,
        mode,
        selectedEmployeeIds: mode === "selective" ? Array.from(selectedEmployeeIds) : undefined,
        periodoInicio: uploadPeriodoDe || undefined,
        periodoFim: uploadPeriodoAte || undefined,
      });
    } catch (e) { /* handled */ } finally {
      setUploading(false);
    }
  };

  const handleReplaceAllConfirm = async () => {
    if (!replaceAllPassword.trim()) {
      setReplaceAllPasswordError("Digite sua senha");
      return;
    }
    setVerifyingPassword(true);
    setReplaceAllPasswordError("");
    try {
      await verifyPasswordMut.mutateAsync({ password: replaceAllPassword });
      setShowReplaceAllConfirm(false);
      setReplaceAllPassword("");
      handleUploadSelective("replace_all");
    } catch (e: any) {
      setReplaceAllPasswordError(e?.message === "Senha incorreta" ? "Senha incorreta. Tente novamente." : (e?.message || "Erro ao verificar senha"));
    } finally {
      setVerifyingPassword(false);
    }
  };

  const dayOfWeek = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()];
  };

  const openPontoDetalhe = (empId: number) => { setSelectedEmployeeId(empId); setViewMode("detalhe"); };
  const openRaioX = (empId: number) => setRaioXEmployeeId(empId);

  // Rev. 2015 — Modal "ampliar foto" do colaborador
  const [fotoZoom, setFotoZoom] = useState<{ url: string | null; nome: string } | null>(null);
  // Rev. 2015 — Flag pra placeholder quando a img tem URL mas falha (404, link quebrado, etc.)
  const [fotoLoadError, setFotoLoadError] = useState(false);
  useEffect(() => { setFotoLoadError(false); }, [fotoZoom?.url]);

  // Rev. 2015 — Iniciais p/ fallback do avatar (1ª letra do 1º + 1ª letra do último nome)
  const getInitials = (nome: string): string => {
    if (!nome) return "?";
    const parts = nome.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // ===== PRINT / PDF =====
  const handlePrint = () => {
    const empresa = "FC ENGENHARIA PROJETOS E CONSTRUÇÕES";
    const competencia = formatMesAno(mesAno);
    const dataEmissao = nowBrasilia();
    const consolidadoInfo = isConsolidado ? `Consolidado por: ${consolidacaoStatus.data?.consolidadoPor || "—"} em ${formatDateTime(consolidacaoStatus.data?.consolidadoEm)}` : "Não consolidado";

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
        conteudo += `<table><thead><tr><th>Data</th><th>Dia</th><th>Entrada</th><th>Saída Int.</th><th>Retorno</th><th>Saída</th><th>H. Trab.</th><th>H. Extra</th><th>Saldo</th><th>Fonte</th><th>Status</th></tr></thead><tbody>`;
        g.records.forEach((r: any) => {
          const hasIncons = (employeeDetail.data?.inconsistencies || []).some((i: any) => i.data === r.data);
          const bgColor = r.ajusteManual ? "#faf5ff" : hasIncons ? "#fffbeb" : "";
          const pHM = (s: string) => { if (!s || s === "-" || s === "0:00") return 0; const [hh, mm] = s.split(":").map(Number); return (hh||0)*60+(mm||0); };
          const ext = pHM(r.horasExtras); const atr = pHM(r.atrasos); const trb = pHM(r.horasTrabalhadas);
          const saldoStr = ext > 0 ? `<span style="color:#16a34a;font-weight:600">+${Math.floor(ext/60)}:${String(ext%60).padStart(2,'0')}</span>` : atr > 0 ? `<span style="color:#dc2626;font-weight:600">-${Math.floor(atr/60)}:${String(atr%60).padStart(2,'0')}</span>` : (trb === 0 && !r.entrada1 ? "-" : "0:00");
          conteudo += `<tr style="background:${bgColor}"><td>${r.data ? new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</td><td>${dayOfWeek(r.data)}</td><td>${r.entrada1 || "-"}</td><td>${r.saida1 || "-"}</td><td>${r.entrada2 || "-"}</td><td>${r.saida2 || "-"}</td><td style="font-weight:600">${r.horasTrabalhadas || "-"}</td><td style="color:#16a34a;font-weight:600">${r.horasExtras && r.horasExtras !== "0:00" ? r.horasExtras : "-"}</td><td>${saldoStr}</td><td>${r.ajusteManual ? `Manual${r.ajustadoPor ? ` (${r.ajustadoPor.split(" ").slice(0,2).join(" ")})` : ""}` : "DIXI"}</td><td>${hasIncons ? "⚠ Inconsistente" : "✓ OK"}</td></tr>`;
        });
        conteudo += `</tbody></table>`;
      });
    } else if (viewMode === "rateio" && rateioData.data) {
      // RATEIO POR OBRA
      titulo = "Rateio de Mão de Obra por Obra";
      rateioData.data.forEach((obra: any) => {
        conteudo += `<div style="margin-top:24px;page-break-inside:avoid;"><div style="background:#f0fdfa;padding:10px 14px;border:1px solid #99f6e4;border-radius:6px 6px 0 0;display:flex;justify-content:space-between;"><div><strong style="color:#0d9488;font-size:15px;">${obra.nomeObra}</strong>`;
        if (obra.sns && obra.sns.length > 0) conteudo += `<br/><span style="font-size:11px;color:#0d9488;">SN: ${obra.sns.join(", ")}</span>`;
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
      conteudo += `<table><thead><tr><th>Colaborador</th><th>CPF</th><th>Função</th><th>Obra(s)</th><th>Dias</th><th>H. Trab.</th><th>H. Extras</th><th>Atrasos</th><th>Saldo</th><th>Status</th></tr></thead><tbody>`;
      (filteredSummary || []).forEach((emp: any) => {
        const hasConflict = (conflitos.data || []).some((c: any) => c.employeeId === emp.employeeId);
        const bgColor = hasConflict ? "#fff7ed" : emp.multiplasObras ? "#fef2f2" : "";
        const statusText = hasConflict ? "⚠ Conflito" : emp.multiplasObras ? "🔴 Multi-Obra" : "✓ OK";
        const pHM2 = (s: string) => { if (!s || s === "-" || s === "0:00") return 0; const [hh, mm] = s.split(":").map(Number); return (hh||0)*60+(mm||0); };
        const extR = pHM2(emp.horasExtras); const atrR = pHM2(emp.atrasos);
        const saldoR = extR > 0 ? `<span style="color:#16a34a;font-weight:600">+${Math.floor(extR/60)}:${String(extR%60).padStart(2,'0')}</span>` : atrR > 0 ? `<span style="color:#dc2626;font-weight:600">-${Math.floor(atrR/60)}:${String(atrR%60).padStart(2,'0')}</span>` : "0:00";
        conteudo += `<tr style="background:${bgColor}"><td>${emp.employeeName}</td><td>${formatCPF(emp.employeeCpf || "")}</td><td>${emp.employeeFuncao || "-"}</td><td>${(emp.obraNomes || []).join(", ") || "-"}</td><td style="text-align:center">${emp.diasTrabalhados}</td><td style="text-align:center">${emp.horasTrabalhadas}</td><td style="text-align:center;color:#16a34a;font-weight:600">${emp.horasExtras !== "0:00" ? emp.horasExtras : "-"}</td><td style="text-align:center;color:#dc2626">${emp.atrasos !== "0:00" ? emp.atrasos : "-"}</td><td style="text-align:center">${saldoR}</td><td style="text-align:center">${statusText}</td></tr>`;
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
    if (status === "parcial") return "bg-yellow-400 text-yellow-900 hover:bg-yellow-500 border-yellow-500";
    if (status === "aberto") return "bg-blue-500 text-white hover:bg-blue-600 border-blue-600";
    return "bg-gray-200 text-gray-500 hover:bg-gray-300 border-gray-300";
  };

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-5">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            {viewMode === "detalhe" && selectedEmployeeId ? (
              <div className="flex items-center gap-3">
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
                <Button variant="outline" size="sm" className="ml-2 gap-1.5 text-xs text-muted-foreground" onClick={() => openRaioX(selectedEmployeeId)}>
                  <Users className="h-3.5 w-3.5" /> Raio-X Completo
                </Button>
                {!isConsolidado && (
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                    onClick={() => { setPeriodoEspecialInicio(""); setPeriodoEspecialFim(""); setPeriodoEspecialTipo("ferias"); setShowPeriodoEspecial(true); }}>
                    <CalendarDays className="h-3.5 w-3.5" /> Período Especial
                  </Button>
                )}
              </div>
            ) : (
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Fechamento de Ponto</h1>
                <p className="text-muted-foreground text-sm">Controle e fechamento mensal de ponto dos colaboradores</p>
              </div>
            )}
          </div>
          <PrintActions title={`Fechamento de Ponto`} />
        </div>

        {/* ===== FILTRO VISUAL ANO + MESES ===== */}
        <div className="bg-white border rounded-xl shadow-sm p-4 space-y-3">
          {/* Seletor de Ano */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setAnoSelecionado(a => a - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-lg font-bold text-[#1B2A4A] min-w-[60px] text-center">{fmtNum(anoSelecionado)}</span>
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
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-1.5">
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
                  {status === "parcial" && (
                    <Lock className="h-3 w-3 absolute top-0.5 right-0.5 text-yellow-900/80" />
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

        {/* Rev. 2220 — Alerta "HE aprovada SEM ponto" foi movido
            exclusivamente pra Folha → Módulo Hora Extra. */}

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
            {isParcial && (
              <Badge
                className="bg-yellow-100 text-yellow-800 text-xs ml-1"
                title={cicloInicio && cicloFim ? `Ciclo bloqueado: ${cicloInicio} a ${cicloFim}` : "Consolidação parcial"}
              >
                <Lock className="h-3 w-3 mr-1" /> Parcial — ciclo {cicloInicio?.slice(8,10)}/{cicloInicio?.slice(5,7)} a {cicloFim?.slice(8,10)}/{cicloFim?.slice(5,7)}
              </Badge>
            )}
          </div>

          {!isConsolidado && (
            <Button onClick={() => { setShowUploadDialog(true); setUploadFiles([]); setUploadResult(null); setValidationResult(null); setUploadPeriodoDe(""); setUploadPeriodoAte(""); }} className="bg-[#1B2A4A] hover:bg-[#243660]">
              <Upload className="h-4 w-4 mr-2" /> Upload DIXI
            </Button>
          )}
          {/* Lançamento Manual — sempre disponível quando o mês NÃO está consolidado.
              Quando o mês ESTÁ consolidado (totalmente), liberamos para admins fazerem
              ajustes em lote (ex.: completar o período pós-ciclo) sem precisar
              desconsolidar e ir um por um pelo Espelho de Ponto. */}
          {(!isConsolidado || isAdmin) && (
            <Button
              variant="outline"
              onClick={() => { setManualSeed(undefined); setShowManualDialog(true); }}
              className={isConsolidado ? "border-amber-400 text-amber-700 hover:bg-amber-50" : ""}
              title={isConsolidado ? "Mês consolidado — lançamento permitido apenas para admins, com registro de auditoria" : undefined}
            >
              <PenLine className="h-4 w-4 mr-2" />
              {isConsolidado ? "Lançamento Manual (admin)" : "Lançamento Manual"}
            </Button>
          )}

          {/* Consolidar / Desconsolidar */}
          {(stats.data?.totalRegistros || 0) > 0 && !isConsolidado && (
            <Button variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" onClick={() => { setConsolidarObs(""); setShowConsolidarDialog(true); }}>
              <Lock className="h-4 w-4 mr-2" /> Consolidar Mês
            </Button>
          )}
          {/* Permitir Desconsolidar tanto para mês totalmente consolidado quanto parcial */}
          {consolidacaoData?.consolidado === true && isAdmin && (
            <Button variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => setShowDesconsolidarDialog(true)}>
              <Unlock className="h-4 w-4 mr-2" /> {isParcial ? "Desconsolidar Ciclo" : "Desconsolidar"}
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
                  <> em {formatDateTime(consolidacaoStatus.data.consolidadoEm)}</>
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
        <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-7">
          <Card className={`cursor-pointer hover:shadow-md transition-all ${cardFilter === "colaboradores" ? "ring-2 ring-blue-500 shadow-md" : ""}`}
            onClick={() => { setViewMode("resumo"); setCardFilter(cardFilter === "colaboradores" ? null : "colaboradores"); }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{fmtNum(stats.data?.totalColaboradores || 0)}</p>
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
                  <p className="text-2xl font-bold">{fmtNum(stats.data?.totalRegistros || 0)}</p>
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
                  <p className="text-2xl font-bold">{fmtNum(stats.data?.totalInconsistencias || 0)}</p>
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
                  <p className="text-2xl font-bold">{fmtNum(stats.data?.totalAjustesManuais || 0)}</p>
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
                  <p className={`text-2xl font-bold ${multiSiteCount > 0 ? "text-red-600" : ""}`}>{fmtNum(multiSiteCount)}</p>
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
                  <p className={`text-2xl font-bold ${conflitosCount > 0 ? "text-orange-600" : ""}`}>{fmtNum(conflitosCount)}</p>
                  <p className="text-xs text-muted-foreground">Conflitos Obra/Dia</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-all border-rose-200 bg-rose-50/30"
            onClick={() => setFaltasModalOpen(true)}
            data-testid="card-faltas">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-rose-100 flex items-center justify-center">
                  <UserX className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-rose-600">Ver</p>
                  <p className="text-xs text-muted-foreground">Faltas / Atrasos</p>
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
                {(() => {
                  const overlaps = (conflitos.data || []).filter((c: any) => c.hasOverlap).length;
                  const transfers = (conflitos.data || []).filter((c: any) => c.transferAnalysis && c.transferAnalysis.length > 0).length;
                  const other = conflitosCount - overlaps - transfers;
                  const parts: string[] = [];
                  if (overlaps > 0) parts.push(`${overlaps} sobreposição(s) (resolver manual)`);
                  if (transfers > 0) parts.push(`${transfers} transferência(s) detectada(s)`);
                  if (other > 0) parts.push(`${other} deslocamento(s) válido(s)`);
                  return parts.length > 0 ? ` ${parts.join(', ')}.` : '';
                })()}
                {' '}Clique para expandir e resolver cada caso.
              </p>
            </div>
            <Badge className="bg-orange-600 text-white text-sm px-3 py-1 shrink-0">
              {conflitosCount} conflito{conflitosCount > 1 ? "s" : ""}
            </Badge>
          </div>
        )}

        {/* ALERTA MÚLTIPLAS OBRAS */}
        {multiSiteCount > 0 && cardFilter !== "multiplasObras" && cardFilter !== "conflitos" && cardFilter !== "inativos" && (
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

        {inativoCount > 0 && cardFilter !== "inativos" && (
          <div className="bg-rose-50 border-2 border-rose-400 rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:bg-rose-100/50 transition-colors"
            onClick={() => { setViewMode("resumo"); setCardFilter("inativos"); }}>
            <AlertCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-rose-800 text-base">Funcionários Inativos com Registros de Ponto</p>
              <p className="text-sm text-rose-700 mt-1">
                <strong>{inativoCount} funcionário(s)</strong> com status Desligado, Afastado ou Recluso possuem registros de ponto neste período.
                Estes registros <strong>não</strong> são processados ao gerar horas extras. Verifique e remova os lançamentos indevidos.
              </p>
            </div>
            <Badge className="text-sm px-3 py-1 shrink-0 bg-rose-600 text-white">{inativoCount}</Badge>
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
            {(unmatchedData.data?.pendentes || 0) > 0 && (
              <Button variant={viewMode === "nao_identificados" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("nao_identificados")}
                className={viewMode === "nao_identificados" ? "bg-purple-600 text-white" : "text-purple-700"}>
                <UserCheck className="h-4 w-4 mr-1" /> Não Identificados
                <Badge variant="destructive" className="ml-1 text-xs bg-purple-600">{unmatchedData.data?.totalNomes}</Badge>
              </Button>
            )}
            <Button variant={viewMode === "memoria_dixi" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("memoria_dixi")}
              className={viewMode === "memoria_dixi" ? "bg-indigo-600 text-white" : ""}>
              <Zap className="h-4 w-4 mr-1" /> Memória DIXI
            </Button>
            <Button variant={viewMode === "simulador_horistas" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("simulador_horistas")}
              className={viewMode === "simulador_horistas" ? "bg-emerald-600 text-white" : ""}>
              <ListChecks className="h-4 w-4 mr-1" /> Simulador CLT (Horistas)
            </Button>
            <Button variant={viewMode === "descontos_clt" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("descontos_clt")}
              className={viewMode === "descontos_clt" ? "bg-rose-600 text-white" : ""}>
              <Shield className="h-4 w-4 mr-1" /> Descontos CLT
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
                    <Button onClick={() => { setShowUploadDialog(true); setUploadFiles([]); setUploadResult(null); setValidationResult(null); setUploadPeriodoDe(""); setUploadPeriodoAte(""); }} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
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
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2 text-orange-800">
                            <AlertCircle className="h-5 w-5" />
                            Conflitos de Obra no Mesmo Dia — {formatMesAno(mesAno)}
                          </CardTitle>
                          <p className="text-xs text-orange-600 mt-1">
                            Clique em uma linha para expandir e escolher a ação de resolução.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            const duplCount = (conflitos.data || []).filter((c: any) => c.isSameObraDuplicate).length;
                            if (duplCount === 0) return null;
                            return (
                              <Button size="sm" variant="outline"
                                className="border-purple-600 text-purple-700 hover:bg-purple-50 text-xs"
                                disabled={resolveAllDuplicatasMut.isPending}
                                onClick={() => resolveAllDuplicatasMut.mutate({ companyId, companyIds, mesReferencia: mesAno })}>
                                <Copy className="h-3.5 w-3.5 mr-1" />
                                {resolveAllDuplicatasMut.isPending ? "Processando..." : `Limpar ${duplCount} duplicata${duplCount > 1 ? "s" : ""} (manter maior)`}
                              </Button>
                            );
                          })()}
                          {(() => {
                            const validCount = (conflitos.data || []).filter((c: any) => !c.hasOverlap && !c.isSameObraDuplicate).length;
                            if (validCount === 0) return null;
                            return (
                              <Button size="sm" variant="outline"
                                className="border-green-600 text-green-700 hover:bg-green-50 text-xs"
                                disabled={resolveAllConflitosMut.isPending}
                                onClick={() => resolveAllConflitosMut.mutate({ companyId, companyIds, mesReferencia: mesAno, acao: "confirmar_deslocamento", justificativa: "Deslocamentos válidos confirmados em lote" })}>
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                Confirmar {validCount} deslocamento{validCount > 1 ? "s" : ""} válido{validCount > 1 ? "s" : ""}
                              </Button>
                            );
                          })()}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-3 px-3">
                      <div className="space-y-2">
                        {conflitos.data.map((c: any, idx: number) => {
                          const key = `${c.employeeId}|${c.data}`;
                          const isExpanded = expandedConflict === key;
                          const isOverlap = c.hasOverlap;
                          const isDupl = c.isSameObraDuplicate;
                          const isValido = !isOverlap && !isDupl;
                          return (
                            <div key={idx} className={`border rounded-lg overflow-hidden ${isOverlap ? "border-l-4 border-l-red-500 border-red-200" : isDupl ? "border-l-4 border-l-purple-500 border-purple-200" : "border-l-4 border-l-green-500 border-green-200"}`}>
                              {/* Linha clicável */}
                              <button
                                className={`w-full text-left p-3 flex items-center gap-3 transition-colors text-sm ${isExpanded ? (isOverlap ? "bg-red-50" : isDupl ? "bg-purple-50" : "bg-green-50") : "hover:bg-orange-50/40"}`}
                                onClick={() => { setExpandedConflict(isExpanded ? null : key); setConflictJustificativa(""); }}>
                                <div className="flex-1 grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 min-w-0">
                                  <span className="font-semibold text-blue-700 truncate max-w-[180px]">{c.employeeName}</span>
                                  <span className="text-muted-foreground whitespace-nowrap">{c.data ? new Date(c.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"} ({dayOfWeek(c.data)})</span>
                                  <div className="flex flex-wrap gap-1">
                                    {c.obras.map((o: any, i: number) => (
                                      <Badge key={i} variant="outline" className={`text-xs ${isOverlap ? "border-red-300 text-red-700 bg-red-50" : isDupl ? "border-purple-300 text-purple-700 bg-purple-50" : "border-green-300 text-green-700 bg-green-50"}`}>
                                        {o.obraNome || "Sem Obra"} ({o.horasTrabalhadas || "0:00"})
                                      </Badge>
                                    ))}
                                  </div>
                                  {isOverlap ? (
                                    <Badge className="text-xs bg-red-100 text-red-800 border border-red-300 shrink-0">
                                      <XCircle className="h-3 w-3 mr-1" /> Sobreposição
                                    </Badge>
                                  ) : isDupl ? (
                                    <Badge className="text-xs bg-purple-100 text-purple-800 border border-purple-300 shrink-0">
                                      <Copy className="h-3 w-3 mr-1" /> Duplicada
                                    </Badge>
                                  ) : (
                                    <Badge className="text-xs bg-green-100 text-green-800 border border-green-300 shrink-0">
                                      <CheckCircle className="h-3 w-3 mr-1" /> Válido
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-muted-foreground text-xs">{isExpanded ? "▲" : "▼"}</span>
                              </button>

                              {/* Painel expandido de resolução */}
                              {isExpanded && (
                                <div className={`border-t p-3 space-y-3 ${isOverlap ? "bg-red-50/50" : isDupl ? "bg-purple-50/50" : "bg-green-50/50"}`}>
                                  <div>
                                    <label className="text-xs font-medium text-muted-foreground block mb-1">Justificativa (opcional)</label>
                                    <input
                                      className="w-full text-sm border rounded px-2 py-1 bg-white"
                                      placeholder="Motivo da resolução..."
                                      value={conflictJustificativa}
                                      onChange={e => setConflictJustificativa(e.target.value)}
                                    />
                                  </div>

                                  {/* Deslocamento válido — confirmar tudo */}
                                  {isValido && (
                                    <div className="flex flex-wrap gap-2 items-center">
                                      <p className="text-xs text-green-700 flex-1">Horários sem sobreposição — funcionário trabalhou nas duas obras em turnos distintos.</p>
                                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white text-xs"
                                        disabled={resolveConflitoMut.isPending}
                                        onClick={() => resolveConflitoMut.mutate({ companyId, companyIds, employeeId: c.employeeId, data: c.data, acao: "confirmar_deslocamento", justificativa: conflictJustificativa || "Deslocamento real entre obras confirmado" })}>
                                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Confirmar Deslocamento
                                      </Button>
                                    </div>
                                  )}

                                  {/* Sobreposição — escolher qual obra manter */}
                                  {isOverlap && (
                                    <div>
                                      <p className="text-xs text-red-700 mb-2">Horários sobrepostos — escolha qual obra manter (a outra será removida):</p>
                                      <div className="flex flex-wrap gap-2">
                                        {c.obras.map((o: any, i: number) => (
                                          <Button key={i} size="sm" variant="outline" className="border-red-400 text-red-700 hover:bg-red-50 text-xs"
                                            disabled={resolveConflitoMut.isPending}
                                            onClick={() => resolveConflitoMut.mutate({ companyId, companyIds, employeeId: c.employeeId, data: c.data, acao: "manter_obra", obraIdManter: o.obraId, justificativa: conflictJustificativa || `Mantido na obra ${o.obraNome} (sobreposição resolvida)` })}>
                                            Manter: {o.obraNome || "Sem Obra"}
                                          </Button>
                                        ))}
                                        <Button size="sm" variant="outline" className="border-slate-400 text-slate-700 hover:bg-slate-50 text-xs"
                                          disabled={resolveConflitoMut.isPending}
                                          onClick={() => resolveConflitoMut.mutate({ companyId, companyIds, employeeId: c.employeeId, data: c.data, acao: "marcar_falta", justificativa: conflictJustificativa || "Conflito de obra — registrado como falta" })}>
                                          Registrar como Falta
                                        </Button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Batida duplicada — excluir por id (usar c.records que tem id + entrada1) */}
                                  {isDupl && (
                                    <div>
                                      <p className="text-xs text-purple-700 mb-2">Batida duplicada na mesma obra — escolha qual registro remover:</p>
                                      <div className="flex flex-wrap gap-2">
                                        {(c.records || c.obras).map((o: any, i: number) => (
                                          <Button key={i} size="sm" variant="outline" className="border-purple-400 text-purple-700 hover:bg-purple-50 text-xs"
                                            disabled={resolveConflitoMut.isPending}
                                            onClick={() => resolveConflitoMut.mutate({ companyId, companyIds, employeeId: c.employeeId, data: c.data, acao: "excluir_por_id", recordId: o.id, justificativa: conflictJustificativa || `Batida duplicada removida (entrada: ${o.entrada1 || "?"})` })}>
                                            Excluir: {o.obraNome} — {o.entrada1 || "?"} ({o.horasTrabalhadas || "0:00"})
                                          </Button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex justify-end">
                                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => openRaioX(c.employeeId)}>
                                      <Users className="h-3.5 w-3.5 mr-1" /> Ver Raio-X
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ===== RANKINGS DE PONTUALIDADE — Rev. 1997 (regras de ouro) ===== */}
                {!cardFilter && rankings && (() => {
                  // Helper inline — gera config visual por tipo (mantém lógica de dados INTACTA)
                  const cards: Array<{
                    key: "pontuais" | "atrasados" | "extras" | "faltosos";
                    title: string;
                    Icon: typeof CheckCircle;
                    hint: string;
                    fromHex: string;     // gradient start
                    toHex: string;       // gradient end
                    chipBg: string;
                    chipText: string;
                    borderColor: string;
                    metricColor: string;
                    list: any[];
                    allList: any[];
                    metricFor: (e: any) => string;
                    emptyMsg: string;
                    rankColor: string;
                  }> = [
                    { key: "pontuais",  title: "Mais Pontuais",          Icon: CheckCircle,  hint: "Top sem atrasos",          fromHex: "from-emerald-50",  toHex: "to-white", chipBg: "bg-emerald-100", chipText: "text-emerald-700", borderColor: "border-emerald-200 hover:border-emerald-400", metricColor: "text-emerald-700", list: rankings.pontuais,  allList: rankings.allPontuais,  emptyMsg: "Sem dados", rankColor: "text-emerald-600", metricFor: (e: any) => e.atrasosStr === "0:00" ? "Sem atraso" : e.atrasosStr },
                    { key: "atrasados", title: "Mais Atrasados",         Icon: XCircle,      hint: "Atenção crítica",          fromHex: "from-red-50",      toHex: "to-white", chipBg: "bg-red-100",     chipText: "text-red-700",     borderColor: "border-red-200 hover:border-red-400",         metricColor: "text-red-700",     list: rankings.atrasados, allList: rankings.allAtrasados, emptyMsg: "Nenhum atraso", rankColor: "text-red-600", metricFor: (e: any) => e.atrasosStr },
                    { key: "extras",    title: "Mais Horas Extras",      Icon: Zap,          hint: "Volume de HE no mês",      fromHex: "from-amber-50",    toHex: "to-white", chipBg: "bg-amber-100",   chipText: "text-amber-700",   borderColor: "border-amber-200 hover:border-amber-400",     metricColor: "text-amber-700",   list: rankings.extras,    allList: rankings.allExtras,    emptyMsg: "Sem extras", rankColor: "text-amber-600", metricFor: (e: any) => e.horasExtrasStr },
                    { key: "faltosos",  title: "Menos Dias Trabalhados", Icon: CalendarDays, hint: "Possíveis faltas/escala",  fromHex: "from-slate-100",   toHex: "to-white", chipBg: "bg-slate-200",   chipText: "text-slate-700",   borderColor: "border-slate-200 hover:border-slate-400",     metricColor: "text-slate-700",   list: rankings.faltosos,  allList: rankings.allFaltosos,  emptyMsg: "Sem dados", rankColor: "text-slate-600", metricFor: (e: any) => `${e.dias} dia${e.dias !== 1 ? "s" : ""}` },
                  ];
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {cards.map(c => {
                        const Icon = c.Icon;
                        return (
                          <div key={c.key} className={`group relative rounded-xl border-2 ${c.borderColor} bg-gradient-to-br ${c.fromHex} ${c.toHex} shadow-sm hover:shadow-md transition-all overflow-hidden`}>
                            {/* Header clicável */}
                            <button
                              onClick={() => { setRankingModal(c.key); setRankingSearch(""); setRankingObraFilter("all"); }}
                              className="w-full px-4 pt-3 pb-2 flex items-start justify-between gap-2 cursor-pointer text-left"
                              title={`Abrir detalhamento completo — ${c.allList.length} colaboradores`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`inline-flex items-center justify-center h-7 w-7 rounded-lg ${c.chipBg} ${c.chipText} ring-2 ring-white shadow-sm shrink-0`}>
                                  <Icon className="h-3.5 w-3.5" />
                                </span>
                                <div className="min-w-0">
                                  <div className={`text-xs font-bold ${c.chipText} truncate`}>{c.title}</div>
                                  <div className="text-[10px] text-slate-500 truncate">{c.hint}</div>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className={`text-lg font-extrabold leading-none ${c.metricColor}`}>{c.allList.length}</div>
                                <div className="text-[9px] text-slate-500 uppercase tracking-wide">colab.</div>
                              </div>
                            </button>

                            {/* Lista top-5 */}
                            <div className="px-3 pb-2">
                              <div className="space-y-0.5">
                                {c.list.map((e: any, i: number) => (
                                  <div key={e.id} className="flex items-center justify-between text-xs py-1 px-1 rounded hover:bg-white/70 transition-colors">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className={`font-bold w-4 text-center text-[11px] ${i === 0 ? c.rankColor : "text-slate-400"}`}>{i + 1}</span>
                                      <button className="text-blue-700 hover:underline text-left truncate max-w-[120px]" onClick={() => openPontoDetalhe(e.id)}>{e.nome}</button>
                                      <EmpStatusBadge status={e.status} />
                                    </div>
                                    <span className={`${c.metricColor} font-mono text-[11px] font-semibold shrink-0`}>{c.metricFor(e)}</span>
                                  </div>
                                ))}
                                {c.list.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">{c.emptyMsg}</p>}
                              </div>
                            </div>

                            {/* Footer "ver todos" */}
                            <button
                              onClick={() => { setRankingModal(c.key); setRankingSearch(""); setRankingObraFilter("all"); }}
                              className={`w-full border-t ${c.borderColor.replace("hover:", "")} px-3 py-1.5 text-[11px] font-semibold ${c.chipText} bg-white/40 hover:bg-white/80 transition-colors flex items-center justify-center gap-1 cursor-pointer`}
                            >
                              Ver todos ({c.allList.length}) <ArrowRight className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* ===== MODAL DETALHADO DE RANKING — Rev. 1997 (regras de ouro) ===== */}
                {rankingModal && rankings && (() => {
                  // Config visual + legenda + KPIs por tipo (sem alterar lógica)
                  const cfg = (() => {
                    if (rankingModal === "pontuais") return {
                      title: "Mais Pontuais", Icon: CheckCircle, subtitle: "Colaboradores sem ou com menor atraso acumulado no período",
                      gradient: "from-emerald-600 via-emerald-500 to-green-500", ringColor: "ring-emerald-200/60",
                      legendItems: [
                        { Icon: CheckCircle2, label: "Atraso Acum.", desc: "Soma de todos os minutos de atraso. Zero = sempre pontual.", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                        { Icon: CalendarDays, label: "Dias Trabalhados", desc: "Dias em que o colaborador bateu ponto no período.", color: "text-slate-700 bg-slate-50 border-slate-200" },
                        { Icon: Timer, label: "% Presença", desc: `Dias com ponto ÷ dias úteis (seg-sex)${diasUteisNoPeriodo ? ` do período (${diasUteisNoPeriodo}d)` : ""}. Ex: 10÷${diasUteisNoPeriodo ?? 22} = ${Math.round((10 / (diasUteisNoPeriodo ?? 22)) * 100)}%.`, color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
                        { Icon: Clock, label: "H. Total", desc: "Soma das horas trabalhadas (entrada → saída).", color: "text-slate-700 bg-slate-50 border-slate-200" },
                      ],
                    } as const;
                    if (rankingModal === "atrasados") return {
                      title: "Mais Atrasados", Icon: XCircle, subtitle: "Atenção crítica — colaboradores com maior atraso acumulado",
                      gradient: "from-red-600 via-rose-500 to-pink-500", ringColor: "ring-red-200/60",
                      legendItems: [
                        { Icon: AlertTriangle, label: "Atraso Acum.", desc: "Soma total dos atrasos do período em h/min — quanto maior, pior.", color: "text-red-700 bg-red-50 border-red-200" },
                        { Icon: CalendarDays, label: "Dias Trabalhados", desc: "Dias em que o colaborador bateu ponto no período.", color: "text-slate-700 bg-slate-50 border-slate-200" },
                        { Icon: Timer, label: "% Presença", desc: `Dias com ponto ÷ dias úteis (seg-sex)${diasUteisNoPeriodo ? ` do período (${diasUteisNoPeriodo}d)` : ""}. Ex: 10÷${diasUteisNoPeriodo ?? 22} = ${Math.round((10 / (diasUteisNoPeriodo ?? 22)) * 100)}%.`, color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
                        { Icon: Clock, label: "H. Total", desc: "Soma das horas trabalhadas (entrada → saída).", color: "text-slate-700 bg-slate-50 border-slate-200" },
                      ],
                    } as const;
                    if (rankingModal === "extras") return {
                      title: "Mais Horas Extras", Icon: Zap, subtitle: "Volume de HE no mês — verifique se há solicitação formal aprovada",
                      gradient: "from-amber-500 via-orange-500 to-yellow-500", ringColor: "ring-amber-200/60",
                      legendItems: [
                        { Icon: Zap, label: "Total HE", desc: "Horas trabalhadas além do contratado no período.", color: "text-amber-700 bg-amber-50 border-amber-200" },
                        { Icon: ShieldCheck, label: "Solicitação HE", desc: "Se foi aberta (e aprovada) uma solicitação formal de hora extra.", color: "text-orange-700 bg-orange-50 border-orange-200" },
                        { Icon: CalendarDays, label: "Dias Trabalhados", desc: "Dias em que o colaborador bateu ponto no período.", color: "text-slate-700 bg-slate-50 border-slate-200" },
                        { Icon: Clock, label: "H. Total", desc: "Soma das horas trabalhadas (entrada → saída).", color: "text-slate-700 bg-slate-50 border-slate-200" },
                      ],
                    } as const;
                    return {
                      title: "Menos Dias Trabalhados", Icon: CalendarDays, subtitle: "Possíveis faltas, afastamentos ou escala reduzida — analise atestados",
                      gradient: "from-slate-600 via-slate-500 to-zinc-500", ringColor: "ring-slate-200/60",
                      legendItems: [
                        { Icon: CalendarX, label: "Menos dias", desc: "Colaboradores com menor presença — pode indicar faltas, afastamento ou escala reduzida.", color: "text-slate-700 bg-slate-50 border-slate-200" },
                        { Icon: ShieldCheck, label: "Justificada", desc: "Possui atestado médico registrado no período.", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                        { Icon: Timer, label: "% Presença", desc: `Dias com ponto ÷ dias úteis (seg-sex)${diasUteisNoPeriodo ? ` do período (${diasUteisNoPeriodo}d)` : ""}. Ex: 10÷${diasUteisNoPeriodo ?? 22} = ${Math.round((10 / (diasUteisNoPeriodo ?? 22)) * 100)}%.`, color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
                        { Icon: Clock, label: "H. Total", desc: "Soma das horas trabalhadas (entrada → saída).", color: "text-slate-700 bg-slate-50 border-slate-200" },
                      ],
                    } as const;
                  })();
                  const HeaderIcon = cfg.Icon;
                  // KPIs derivados (mesmas fórmulas do footer original — apenas elevadas pra hero)
                  const totalColab = filteredRankingRows.length;
                  const totalDiasSum = filteredRankingRows.reduce((s: number, e: any) => s + e.dias, 0);
                  const mediaDias = totalColab ? Math.round(totalDiasSum / totalColab) : 0;
                  // Formata minutos como "1.896h40min" — separador de milhar pt-BR nas horas
                  const fmtHMpt = (mins: number) => `${Math.floor(mins / 60).toLocaleString("pt-BR")}h${String(mins % 60).padStart(2, "0")}min`;
                  const totalHorasMin = filteredRankingRows.reduce((s: number, e: any) => s + e.horasTrab, 0);
                  const totalHorasStr = fmtHMpt(totalHorasMin);
                  const presencaPct = (diasUteisNoPeriodo && totalColab) ? Math.min(100, Math.round((totalDiasSum / totalColab / diasUteisNoPeriodo) * 100)) : null;
                  const totalAtrasoMin = filteredRankingRows.reduce((s: number, e: any) => s + (e.atrasos || 0), 0);
                  const totalAtrasoStr = fmtHMpt(totalAtrasoMin);
                  const totalHEMin = filteredRankingRows.reduce((s: number, e: any) => s + (e.horasExtras || 0), 0);
                  const totalHEStr = fmtHMpt(totalHEMin);
                  // Rev. 2060 — "sem solicitação" agora exige SOLICITAÇÃO
                  // APROVADA (pedido do usuário: "a verificação se a hora
                  // extra foi aprovada ou não não está sendo feita"). Pendente
                  // ou rejeitada NÃO conta como cobertura formal das HEs.
                  const semSolicHE = !heSolicitacoesMes.isLoading ? filteredRankingRows.filter((e: any) => !(heSolicitacoesMes.data || []).some((sol: any) => sol.status === "aprovada" && sol.funcionarios?.some((f: any) => f.employeeId === e.id))).length : 0;
                  const justificadas = filteredRankingRows.filter((e: any) => (atestadosMes.data || []).some((a: any) => a.employeeId === e.id)).length;
                  const naoJustificadas = totalColab - justificadas;
                  const semAtraso = filteredRankingRows.filter((e: any) => e.atrasos === 0).length;
                  // KPI cards por tipo
                  const kpis: Array<{ label: string; value: string | number; sub?: string; tone: string; Icon: typeof Clock }> = (() => {
                    if (rankingModal === "pontuais") return [
                      { label: "Colaboradores", value: totalColab, sub: "no filtro atual", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: Users },
                      { label: "Sem nenhum atraso", value: semAtraso, sub: `de ${totalColab} colab.`, tone: "bg-green-50 text-green-700 border-green-200", Icon: CheckCircle2 },
                      { label: "Atraso acumulado", value: totalAtrasoStr, sub: "soma do grupo", tone: "bg-rose-50 text-rose-700 border-rose-200", Icon: Timer },
                      { label: "Média de dias", value: mediaDias, sub: diasUteisNoPeriodo ? `de ${diasUteisNoPeriodo} úteis · ${presencaPct ?? "—"}% presença` : "por colaborador", tone: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: CalendarDays },
                    ];
                    if (rankingModal === "atrasados") return [
                      { label: "Colaboradores", value: totalColab, sub: "no filtro atual", tone: "bg-red-50 text-red-700 border-red-200", Icon: Users },
                      { label: "Atraso acumulado", value: totalAtrasoStr, sub: "total do grupo", tone: "bg-rose-50 text-rose-700 border-rose-200", Icon: AlertTriangle },
                      { label: "Total de horas", value: totalHorasStr, sub: "trabalhadas", tone: "bg-slate-50 text-slate-700 border-slate-200", Icon: Clock },
                      { label: "Média de dias", value: mediaDias, sub: diasUteisNoPeriodo ? `de ${diasUteisNoPeriodo} úteis · ${presencaPct ?? "—"}% presença` : "por colaborador", tone: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: CalendarDays },
                    ];
                    if (rankingModal === "extras") return [
                      { label: "Colaboradores", value: totalColab, sub: "no filtro atual", tone: "bg-amber-50 text-amber-700 border-amber-200", Icon: Users },
                      { label: "Total HE", value: totalHEStr, sub: "soma do grupo", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: Zap },
                      { label: "Sem solicitação", value: semSolicHE, sub: "atenção: irregular", tone: "bg-orange-50 text-orange-700 border-orange-200", Icon: AlertCircle },
                      { label: "Total de horas", value: totalHorasStr, sub: "trabalhadas no mês", tone: "bg-slate-50 text-slate-700 border-slate-200", Icon: Clock },
                    ];
                    return [
                      { label: "Colaboradores", value: totalColab, sub: "no filtro atual", tone: "bg-slate-50 text-slate-700 border-slate-200", Icon: Users },
                      { label: "Justificadas", value: justificadas, sub: "com atestado", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: ShieldCheck },
                      { label: "Não justificadas", value: naoJustificadas, sub: "sem atestado", tone: "bg-red-50 text-red-700 border-red-200", Icon: XCircle },
                      { label: "Média de dias", value: mediaDias, sub: diasUteisNoPeriodo ? `de ${diasUteisNoPeriodo} úteis · ${presencaPct ?? "—"}% presença` : "por colaborador", tone: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: CalendarDays },
                    ];
                  })();
                  return (
                  <Dialog open={true} onOpenChange={(open) => { if (!open) { setRankingModal(null); setRankingSearch(""); setRankingObraFilter("all"); } }}>
                    <DialogContent
                      resizable={false}
                      className="flex flex-col p-0 gap-0 w-screen h-screen max-w-none sm:max-w-none rounded-none border-0"
                      onInteractOutside={(e) => e.preventDefault()}
                      onPointerDownOutside={(e) => e.preventDefault()}
                    >

                      {/* ── Header gradient (regras de ouro) ── */}
                      <DialogHeader className={`shrink-0 px-6 py-4 border-b bg-gradient-to-r ${cfg.gradient} text-white relative overflow-hidden`}>
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_60%)] pointer-events-none" />
                        <div className="relative flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                          <span className={`inline-flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-white/15 backdrop-blur-sm ring-4 ${cfg.ringColor} shrink-0`}>
                            <HeaderIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <DialogTitle className="text-xl font-bold flex items-center gap-3 flex-wrap">
                              {cfg.title}
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-[11px] font-semibold ring-1 ring-white/30">
                                <Users className="h-3 w-3" /> {filteredRankingRows.length} colaborador{filteredRankingRows.length !== 1 ? "es" : ""}
                              </span>
                            </DialogTitle>
                            <p className="text-sm text-white/90 mt-0.5">{cfg.subtitle}</p>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-white/85 flex-wrap">
                              <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Referência: <strong className="text-white">{mesAno?.replace("-", "/")}</strong></span>
                              {periodoIni && periodoFim && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/15 ring-1 ring-white/25">
                                  <Clock className="h-3 w-3" /> {fmtPeriodo(periodoIni)} → {fmtPeriodo(periodoFim)}
                                  {diasUteisNoPeriodo && <span className="text-white/80 ml-1">· {diasUteisNoPeriodo} dias úteis</span>}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                            <Button variant="outline" size="sm" onClick={handlePrintRanking} className="h-8 text-xs bg-white/95 hover:bg-white text-slate-800 border-0">
                              <Printer className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Imprimir / PDF</span>
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleExportRankingCSV} className="h-8 text-xs bg-white/95 hover:bg-white text-slate-800 border-0">
                              <FileDown className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Exportar CSV</span>
                            </Button>
                          </div>
                        </div>
                      </DialogHeader>

                      {/* ── Alerta: período incompleto ── */}
                      {periodoFim && new Date(periodoFim + "T23:59:59Z") > new Date() && (
                        <div className="shrink-0 flex items-start gap-3 px-6 py-3 bg-amber-50 border-b-2 border-amber-300">
                          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="text-sm text-amber-900">
                            <strong>Dados incompletos:</strong> o período de fechamento vai até <strong>{fmtPeriodo(periodoFim)}</strong> e ainda não chegou.
                            Os números abaixo refletem apenas o que foi registrado até hoje — os dados finais só estarão disponíveis após o fechamento do período.
                          </div>
                        </div>
                      )}

                      {/* ── KPIs (indicadores importantes) ── */}
                      <div className="shrink-0 px-3 sm:px-6 py-3 border-b bg-slate-50/70 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-2.5">
                        {kpis.map((k, ki) => {
                          const KI = k.Icon;
                          return (
                            <div key={ki} className={`rounded-lg border ${k.tone} px-3 py-2 flex items-center gap-2.5 shadow-sm`}>
                              <span className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-white/70 shrink-0">
                                <KI className="h-4 w-4" />
                              </span>
                              <div className="min-w-0">
                                <div className="text-[10px] font-semibold uppercase tracking-wide opacity-75 truncate">{k.label}</div>
                                <div className="text-base font-bold leading-tight truncate">{k.value}</div>
                                {k.sub && <div className="text-[10px] opacity-70 truncate">{k.sub}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* ── Barra de filtros (responsiva) ── */}
                      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2.5 border-b bg-white">
                        <div className="relative w-full sm:w-72">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input placeholder="Buscar nome ou função..." value={rankingSearch} onChange={e => setRankingSearch(e.target.value)} className="pl-9 h-8 text-xs bg-white" />
                        </div>
                        <Select value={rankingObraFilter} onValueChange={setRankingObraFilter}>
                          <SelectTrigger className="w-full sm:w-52 h-8 text-xs bg-white">
                            <SelectValue placeholder="Todas as obras" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas as obras</SelectItem>
                            {(obrasList.data || []).map((o: any) => (
                              <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {rankingModal === "extras" && heSolicitacoesMes.isLoading && (
                          <span className="text-xs text-muted-foreground animate-pulse">Carregando HE...</span>
                        )}
                        <div className="sm:ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-bold text-sm text-foreground">{filteredRankingRows.length}</span> colaboradores
                        </div>
                      </div>

                      {/* ── Faixa de "Como é calculado" — Rev. 2006 (transparência da fórmula) ── */}
                      {diasUteisNoPeriodo && periodoIni && periodoFim && (
                        <div className="shrink-0 px-3 sm:px-6 py-2 border-b bg-gradient-to-r from-indigo-50 via-indigo-50/60 to-white">
                          <div className="flex items-start gap-2.5 flex-wrap">
                            <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-indigo-100 ring-1 ring-indigo-200 shrink-0">
                              <Timer className="h-3.5 w-3.5 text-indigo-700" />
                            </span>
                            <div className="flex-1 min-w-[260px]">
                              <div className="text-[11px] font-bold text-indigo-900 uppercase tracking-wide leading-tight">Como é calculado o % de Presença</div>
                              <div className="text-[11px] text-indigo-900/80 leading-snug mt-0.5">
                                <strong>Dias com batida de ponto</strong> ÷ <strong>dias úteis (seg-sex)</strong> do período de fechamento.
                                Sábado, domingo, datas após hoje e <strong>feriados</strong> (federais, estaduais e municipais) <em>não</em> entram.
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white ring-1 ring-indigo-200 text-[11px] text-slate-700">
                                <CalendarDays className="h-3 w-3 text-indigo-600" />
                                Período: <strong className="text-indigo-900">{fmtPeriodo(periodoIni)}</strong> → <strong className="text-indigo-900">{fmtPeriodo(periodoFim)}</strong>
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-600 text-white text-[11px] font-bold">
                                = {diasUteisNoPeriodo} dias úteis
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white ring-1 ring-indigo-200 text-[11px] text-slate-700">
                                Fórmula: <code className="font-mono text-indigo-700">dias÷{diasUteisNoPeriodo}×100</code>
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── Legenda (card visual por indicador) ── */}
                      <div className="shrink-0 px-3 sm:px-6 py-2.5 border-b bg-blue-50/40">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Info className="h-3.5 w-3.5 text-blue-700" />
                          <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wide">Legenda — como interpretar cada coluna</span>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                          {cfg.legendItems.map((it, li) => {
                            const LI = it.Icon;
                            return (
                              <div key={li} className={`rounded-md border ${it.color} px-2.5 py-1.5 flex items-start gap-2`}>
                                <LI className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                  <div className="text-[11px] font-bold leading-tight">{it.label}</div>
                                  <div className="text-[10px] opacity-80 leading-snug">{it.desc}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* ── Tabela (scroll horizontal em telas estreitas) ── */}
                      <div className="flex-1 overflow-auto">
                        <table className="w-full min-w-[900px] text-xs border-collapse">
                          <thead className="sticky top-0 z-10 bg-slate-50 border-b-2 border-slate-200">
                            <tr>
                              <th className="px-3 py-2.5 font-semibold text-slate-600 w-9 text-center">#</th>
                              <th className="px-3 py-2.5 font-semibold text-slate-600 text-left min-w-[180px]">Nome</th>
                              <th className="px-3 py-2.5 font-semibold text-slate-600 text-left min-w-[130px]">Função</th>
                              <th className="px-3 py-2.5 font-semibold text-slate-600 text-left">Obra(s)</th>
                              <th className="px-3 py-2.5 font-semibold text-slate-600 text-center w-24">Dias Trabalhados</th>
                              {diasUteisNoPeriodo && (
                                <th className="px-3 py-2.5 font-semibold text-indigo-700 text-center w-28" title={`Dias com ponto ÷ ${diasUteisNoPeriodo} dias úteis (seg-sex) do período ${periodoIni ? fmtPeriodo(periodoIni) : ""} → ${periodoFim ? fmtPeriodo(periodoFim) : ""}. Ex: 10÷${diasUteisNoPeriodo} = ${Math.round((10/diasUteisNoPeriodo)*100)}%.`}>
                                  <span className="inline-flex items-center gap-1 cursor-help underline decoration-dotted decoration-indigo-300 underline-offset-2">
                                    % Presença <Info className="h-3 w-3 text-indigo-500" />
                                  </span>
                                  <div className="text-[9px] font-normal text-indigo-500/80 normal-case mt-0.5">de {diasUteisNoPeriodo} úteis</div>
                                </th>
                              )}
                              <th className="px-3 py-2.5 font-semibold text-slate-600 text-center w-24">H. Total no Mês</th>
                              {rankingModal === "pontuais"  && <th className="px-3 py-2.5 font-semibold text-slate-600 text-center w-32">Atraso Acumulado</th>}
                              {rankingModal === "atrasados" && <th className="px-3 py-2.5 font-semibold text-red-600   text-center w-32">Atraso Acumulado</th>}
                              {rankingModal === "extras"    && <><th className="px-3 py-2.5 font-semibold text-emerald-700 text-center w-24">Total HE</th><th className="px-3 py-2.5 font-semibold text-slate-600 text-center w-36">Solicitação HE</th></>}
                              {rankingModal === "faltosos"  && <th className="px-3 py-2.5 font-semibold text-slate-600 text-center w-36">Atestado / Justificativa</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredRankingRows.map((e: any, i: number) => {
                              const heSols = rankingModal === "extras" ? (heSolicitacoesMes.data || []).filter((sol: any) => sol.funcionarios?.some((f: any) => f.employeeId === e.id)) : [];
                              let heStatus: "aprovada" | "pendente" | "rejeitada" | "sem" = "sem";
                              if (rankingModal === "extras") {
                                if (heSols.some((s: any) => s.status === "aprovada")) heStatus = "aprovada";
                                else if (heSols.some((s: any) => s.status === "pendente")) heStatus = "pendente";
                                else if (heSols.some((s: any) => s.status === "rejeitada")) heStatus = "rejeitada";
                              }
                              const hasAtestado = rankingModal === "faltosos" && (atestadosMes.data || []).some((a: any) => a.employeeId === e.id);
                              const rowBg = rankingModal === "extras" && heStatus === "sem" ? "bg-orange-50/70" : i % 2 === 0 ? "bg-white" : "bg-slate-50/50";
                              return (
                                <tr key={e.id} className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors ${rowBg}`}>
                                  <td className="px-3 py-2 text-slate-400 font-mono text-center">{i + 1}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      {/* Rev. 2015 — avatar clicável + selo CIPA também no ranking */}
                                      <button
                                        type="button"
                                        aria-label={`Ampliar foto de ${e.nome || 'colaborador'}`}
                                        className="shrink-0 rounded-full ring-2 ring-white hover:ring-blue-300 hover:scale-110 transition-all shadow-sm"
                                        title={e.fotoUrl ? "Clique para ampliar a foto" : "Sem foto cadastrada"}
                                        onClick={(ev) => { ev.stopPropagation(); setFotoZoom({ url: e.fotoUrl || null, nome: e.nome || "" }); }}
                                      >
                                        <Avatar className="size-8">
                                          {e.fotoUrl && <AvatarImage src={e.fotoUrl} alt={e.nome} />}
                                          <AvatarFallback className="bg-gradient-to-br from-blue-100 to-indigo-200 text-blue-900 text-[10px] font-bold">
                                            {getInitials(e.nome || "")}
                                          </AvatarFallback>
                                        </Avatar>
                                      </button>
                                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                        <button className="font-semibold text-blue-700 hover:underline text-left leading-tight" onClick={() => { setRankingModal(null); openPontoDetalhe(e.id); }}>{e.nome}</button>
                                        <EmpStatusBadge status={e.status} />
                                        {e.cipaStatus === 'ativo' && (
                                          <Badge className="text-[10px] bg-emerald-600 text-white border-0 px-1.5 py-0 h-5" title={`CIPA · ${e.cipaCargo || 'Membro'}`}>
                                            <HardHat className="h-3 w-3 mr-0.5" /> CIPA
                                          </Badge>
                                        )}
                                        {e.cipaStatus === 'estabilidade' && (
                                          <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50 px-1.5 py-0 h-5" title={`Ex-CIPA — estabilidade até ${fmtPeriodo(e.cipaFimEstabilidade || '')}`}>
                                            <ShieldCheck className="h-3 w-3 mr-0.5" /> Ex-CIPA
                                          </Badge>
                                        )}
                                        {/* Rev. 2077 — Aviso Prévio também nos rankings (Pontuais/Atrasados/HE/Faltosos) */}
                                        {e.emAvisoPrevio && (
                                          <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50 px-1.5 py-0 h-5" title="Colaborador em aviso prévio — DP / Rescisões">
                                            ⚠ Aviso Prévio
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-slate-500 leading-tight">{e.funcao}</td>
                                  <td className="px-3 py-2">
                                    {(e.obraNomes || []).length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {e.obraNomes.slice(0, 2).map((nome: string, oi: number) => (
                                          <span key={oi} className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200 truncate max-w-[140px]" title={nome}>{nome}</span>
                                        ))}
                                        {e.obraNomes.length > 2 && <span className="text-[11px] text-muted-foreground">+{e.obraNomes.length - 2}</span>}
                                      </div>
                                    ) : <span className="text-slate-400">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <button className="font-bold text-slate-700 hover:text-blue-700 hover:underline cursor-pointer" onClick={() => setDiasDetalhe({ employeeId: e.id, nome: e.nome })}>{e.dias}</button>
                                  </td>
                                  {diasUteisNoPeriodo && (() => {
                                    const pct = Math.min(100, Math.round((e.dias / diasUteisNoPeriodo) * 100));
                                    const cor = pct >= 90 ? "text-green-700 bg-green-50" : pct >= 70 ? "text-yellow-700 bg-yellow-50" : "text-red-700 bg-red-50";
                                    return <td className="px-3 py-2 text-center"><button className={`inline-block px-2 py-0.5 rounded-full font-bold text-[11px] hover:opacity-80 cursor-pointer ${cor}`} onClick={() => setDiasDetalhe({ employeeId: e.id, nome: e.nome })}>{pct}%</button></td>;
                                  })()}
                                  <td className="px-3 py-2 text-center font-mono text-slate-600">{e.horasTrabahadasStr}</td>
                                  {rankingModal === "pontuais" && (
                                    <td className="px-3 py-2 text-center">
                                      {e.atrasos === 0
                                        ? <span className="inline-flex items-center gap-1 text-green-700 font-semibold"><CheckCircle className="h-3 w-3" /> Pontual</span>
                                        : <button
                                            className="font-mono font-bold text-red-600 hover:text-red-800 hover:underline cursor-pointer inline-flex items-center gap-1"
                                            title="Ver memória de cálculo do atraso (dia a dia)"
                                            onClick={() => setAtrasoDetalhe({ employeeId: e.id, nome: e.nome, totalStr: e.atrasosStr })}
                                          >
                                            {e.atrasosStr}
                                            <Info className="h-3 w-3 opacity-60" />
                                          </button>}
                                    </td>
                                  )}
                                  {rankingModal === "atrasados" && (
                                    <td className="px-3 py-2 text-center">
                                      <button
                                        className="font-mono font-bold text-red-600 hover:text-red-800 hover:underline cursor-pointer inline-flex items-center gap-1"
                                        title="Ver memória de cálculo do atraso (dia a dia)"
                                        onClick={() => setAtrasoDetalhe({ employeeId: e.id, nome: e.nome, totalStr: e.atrasosStr })}
                                      >
                                        {e.atrasosStr}
                                        <Info className="h-3 w-3 opacity-60" />
                                      </button>
                                    </td>
                                  )}
                                  {rankingModal === "extras" && <>
                                    <td className="px-3 py-2 text-center">
                                      {e.horasExtras === 0
                                        ? <span className="font-mono text-slate-400">{e.horasExtrasStr}</span>
                                        : <button
                                            className="font-mono font-bold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer inline-flex items-center gap-1"
                                            title="Ver memória de cálculo da HE (dia a dia)"
                                            onClick={() => setHeDetalhe({ employeeId: e.id, nome: e.nome, totalStr: e.horasExtrasStr })}
                                          >
                                            {e.horasExtrasStr}
                                            <Info className="h-3 w-3 opacity-60" />
                                          </button>}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      {heStatus === "aprovada"  && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100  text-green-800  text-[11px] font-semibold">✅ Aprovada</span>}
                                      {heStatus === "pendente"  && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-[11px] font-semibold">⏳ Pendente</span>}
                                      {heStatus === "rejeitada" && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100    text-red-800    text-[11px] font-semibold">❌ Rejeitada</span>}
                                      {heStatus === "sem" && !heSolicitacoesMes.isLoading && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-[11px] font-semibold">⚠️ Sem solicitação</span>}
                                      {heStatus === "sem" && heSolicitacoesMes.isLoading  && <span className="text-slate-400">—</span>}
                                    </td>
                                  </>}
                                  {rankingModal === "faltosos" && (
                                    <td className="px-3 py-2 text-center">
                                      <button
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold hover:opacity-80 cursor-pointer ${hasAtestado ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                                        title="Ver memória de cálculo das faltas (dia a dia)"
                                        onClick={() => setFaltaDetalhe({ employeeId: e.id, nome: e.nome, totalDias: diasUteisNoPeriodo ? Math.max(0, diasUteisNoPeriodo - e.dias) : 0 })}
                                      >
                                        {hasAtestado ? "✅ Justificada" : "❌ Não justificada"}
                                        <Info className="h-3 w-3 opacity-70" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                            {filteredRankingRows.length === 0 && (
                              <tr><td colSpan={10} className="py-16 text-center text-muted-foreground">Nenhum colaborador encontrado</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* ── Rodapé de totais (responsivo: wrap em telas pequenas) ── */}
                      {filteredRankingRows.length > 0 && (
                        <div className="shrink-0 border-t bg-slate-50 px-3 sm:px-6 py-2 sm:py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                          <span className="font-semibold text-slate-800">{filteredRankingRows.length} colaboradores</span>
                          <span>Média de dias: <strong>{Math.round(filteredRankingRows.reduce((s: number, e: any) => s + e.dias, 0) / filteredRankingRows.length)}</strong>{diasUteisNoPeriodo ? ` de ${diasUteisNoPeriodo} úteis` : ""}</span>
                          {diasUteisNoPeriodo && <span className="text-indigo-700">Presença média: <strong>{Math.min(100, Math.round((filteredRankingRows.reduce((s: number, e: any) => s + e.dias, 0) / filteredRankingRows.length / diasUteisNoPeriodo) * 100))}%</strong></span>}
                          <span>Total horas: <strong className="font-mono">{fmtHMpt(filteredRankingRows.reduce((s: number, e: any) => s + e.horasTrab, 0))}</strong></span>
                          {rankingModal === "pontuais" && <>
                            <span className="text-green-700">{filteredRankingRows.filter((e: any) => e.atrasos === 0).length} sem nenhum atraso</span>
                            <span className="text-red-600">Total acum. atraso: <strong>{fmtHMpt(filteredRankingRows.reduce((s: number, e: any) => s + e.atrasos, 0))}</strong></span>
                          </>}
                          {rankingModal === "atrasados" && (
                            <span className="text-red-600">Total acum. atraso: <strong>{fmtHMpt(filteredRankingRows.reduce((s: number, e: any) => s + e.atrasos, 0))}</strong></span>
                          )}
                          {rankingModal === "extras" && <>
                            <span className="text-emerald-700">Total HE: <strong>{fmtHMpt(filteredRankingRows.reduce((s: number, e: any) => s + e.horasExtras, 0))}</strong></span>
                            {!heSolicitacoesMes.isLoading && <span className="text-orange-700">{filteredRankingRows.filter((e: any) => !(heSolicitacoesMes.data || []).some((sol: any) => sol.status === "aprovada" && sol.funcionarios?.some((f: any) => f.employeeId === e.id))).length} sem solicitação aprovada</span>}
                          </>}
                          {rankingModal === "faltosos" && <>
                            <span className="text-green-700">{filteredRankingRows.filter((e: any) => (atestadosMes.data || []).some((a: any) => a.employeeId === e.id)).length} justificadas</span>
                            <span className="text-red-600">{filteredRankingRows.filter((e: any) => !(atestadosMes.data || []).some((a: any) => a.employeeId === e.id)).length} não justificadas</span>
                          </>}
                        </div>
                      )}

                    </DialogContent>
                  </Dialog>
                  );
                })()}

                {/* ===== Rev. 2072 — SUB-MODAL: CALENDÁRIO DE DIAS — regras de ouro ===== */}
                {/* Antes: dialog estreito 700px, resumo apertado em linha única, grid 2 cols. */}
                {/* Agora: fullscreen + header gradient indigo→slate + botão Voltar + 6 KPI cards + */}
                {/* card explicativo + grid responsivo até 4 cols. Espelha padrão Atraso/HE/Faltas. */}
                {diasDetalhe && (
                  <Dialog open={true} onOpenChange={(open) => { if (!open) setDiasDetalhe(null); }}>
                    <DialogContent resizable={false} className="flex flex-col p-0 gap-0 w-screen h-screen max-w-none sm:max-w-none rounded-none border-0">
                      {/* Header gradient indigo→slate (regra de ouro — coerente com card "Menos Dias Trabalhados" slate) */}
                      <DialogHeader className="shrink-0 px-8 py-5 border-b bg-gradient-to-r from-indigo-600 via-slate-600 to-slate-500 text-white relative overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_60%)] pointer-events-none" />
                        {/* Rev. 2065/2072 — Botão Voltar pro ranking (modal de ranking continua aberto embaixo) */}
                        <div className="relative mb-3">
                          <Button variant="outline" size="sm" onClick={() => setDiasDetalhe(null)} className="h-8 text-xs bg-white/95 hover:bg-white text-slate-800 border-0 shadow-sm" data-testid="button-voltar-dias">
                            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Voltar ao ranking
                          </Button>
                        </div>
                        <div className="relative flex items-start gap-4">
                          <span className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm ring-2 ring-white/30 shrink-0">
                            <CalendarDays className="h-7 w-7" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <DialogTitle className="text-2xl font-bold flex items-center gap-3 flex-wrap">
                              Memória de cálculo · Menos Dias Trabalhados
                            </DialogTitle>
                            <p className="text-base text-white/90 mt-1.5">
                              <strong className="text-lg">{diasDetalhe.nome}</strong>
                              {periodoIni && periodoFim && (
                                <span className="text-white/75"> · {fmtPeriodo(periodoIni)} → {fmtPeriodo(periodoFim)}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </DialogHeader>

                      <div className="flex-1 overflow-auto px-8 py-6 bg-slate-50/40">
                        {diasEmployeeQuery.isLoading && (
                          <div className="flex items-center justify-center py-24 text-muted-foreground text-lg">
                            <span className="animate-pulse">Carregando dias...</span>
                          </div>
                        )}
                        {diasEmployeeQuery.data && (() => {
                          const { dias, totalTrabalhados } = diasEmployeeQuery.data;
                          const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                          // Rev. 2014 — feriados (federais/estaduais/municipais) NÃO são falta provável
                          const isFeriado = (ds: string) => feriadosSet.has(ds);
                          // Rev. 2030 — dia em GOZO de férias (vem do backend cruzando vacation_periods) NÃO é falta provável
                          const isFerias = (d: any) => !!d.ferias;
                          // Apenas dias úteis (Seg-Sex), NÃO feriados, NÃO em férias e sem batida = falta provável
                          const totalFaltas = dias.filter(d => d.dow >= 1 && d.dow <= 5 && !d.trabalhado && !isFeriado(d.data) && !isFerias(d)).length;
                          const totalFDS = dias.filter(d => (d.dow === 0 || d.dow === 6) && !d.trabalhado).length;
                          const totalFeriados = dias.filter(d => isFeriado(d.data) && d.dow >= 1 && d.dow <= 5).length;
                          const totalFerias = dias.filter(d => isFerias(d) && d.dow >= 1 && d.dow <= 5).length;
                          const pctPresenca = diasUteisNoPeriodo ? Math.min(100, Math.round((totalTrabalhados / diasUteisNoPeriodo) * 100)) : null;
                          return (
                            <div className="max-w-7xl mx-auto space-y-5">
                              {/* KPI cards — Rev. 2072: 6 cards coloridos, cada métrica com seu peso visual */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
                                  <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold uppercase tracking-wide">
                                    <CheckCircle className="h-4 w-4" /> Trabalhados
                                  </div>
                                  <div className="mt-1.5 text-3xl font-bold text-emerald-700 tabular-nums">{totalTrabalhados}</div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">{totalTrabalhados === 1 ? "dia" : "dias"} com batida</div>
                                </div>
                                <div className="rounded-xl border border-red-200 bg-white p-4 shadow-sm">
                                  <div className="flex items-center gap-2 text-red-700 text-xs font-semibold uppercase tracking-wide">
                                    <XCircle className="h-4 w-4" /> Faltas prováveis
                                  </div>
                                  <div className="mt-1.5 text-3xl font-bold text-red-700 tabular-nums">{totalFaltas}</div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">dias úteis sem batida</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                  <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                                    <span>—</span> Fins de semana
                                  </div>
                                  <div className="mt-1.5 text-3xl font-bold text-slate-600 tabular-nums">{totalFDS}</div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">sáb/dom de folga</div>
                                </div>
                                <div className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
                                  <div className="flex items-center gap-2 text-amber-700 text-xs font-semibold uppercase tracking-wide">
                                    <span>🎉</span> Feriados
                                  </div>
                                  <div className="mt-1.5 text-3xl font-bold text-amber-700 tabular-nums">{totalFeriados}</div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">em dia útil</div>
                                </div>
                                <div className="rounded-xl border border-sky-200 bg-white p-4 shadow-sm">
                                  <div className="flex items-center gap-2 text-sky-700 text-xs font-semibold uppercase tracking-wide">
                                    <span>🏖</span> Férias
                                  </div>
                                  <div className="mt-1.5 text-3xl font-bold text-sky-700 tabular-nums">{totalFerias}</div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">dias em gozo</div>
                                </div>
                                <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
                                  <div className="flex items-center gap-2 text-indigo-700 text-xs font-semibold uppercase tracking-wide">
                                    <CalendarDays className="h-4 w-4" /> Presença
                                  </div>
                                  <div className="mt-1.5 text-3xl font-bold text-indigo-700 tabular-nums">{pctPresenca !== null ? `${pctPresenca}%` : "—"}</div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">{diasUteisNoPeriodo ? `${totalTrabalhados}/${diasUteisNoPeriodo} dias úteis` : "sem base"}</div>
                                </div>
                              </div>

                              {/* Card explicativo — regra de ouro */}
                              <div className="rounded-xl border bg-white p-5 flex items-start gap-3 shadow-sm">
                                <Info className="h-6 w-6 text-indigo-600 shrink-0 mt-0.5" />
                                <div className="text-sm text-slate-700 leading-relaxed">
                                  <strong>Como ler esta tela:</strong> cada quadradinho abaixo representa um dia do período. <strong className="text-red-700">Falta provável</strong> = dia útil sem nenhuma batida de ponto registrada (pode ser falta real, home office sem lançamento ou dado ainda não importado).
                                  <span className="block mt-2 text-sm text-slate-500">Feriados (federais, estaduais e municipais) e <strong className="text-sky-700">🏖 Férias</strong> em gozo NÃO contam como falta e são excluídos do denominador do % de presença.</span>
                                </div>
                              </div>

                              {/* Grid dia a dia — agora em card branco, responsivo até 4 colunas */}
                              <div className="rounded-xl border bg-white p-5 shadow-sm">
                                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2 uppercase tracking-wide">
                                  <CalendarDays className="h-4 w-4 text-indigo-600" /> Dia a dia · {dias.length} dia{dias.length === 1 ? "" : "s"} no período
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-1.5 text-sm">
                                  {dias.map((d) => {
                                    const [, mes, dia] = d.data.split("-");
                                    const label = `${dia}/${mes} (${DIAS_SEMANA[d.dow]})`;
                                    const isWeekend = d.dow === 0 || d.dow === 6;
                                    const isWeekendFolga = isWeekend && !d.trabalhado;
                                    const dayIsFeriado = isFeriado(d.data);
                                    const dayIsFerias  = isFerias(d);
                                    const feriadoNome = feriadoNomeMap.get(d.data);
                                    // Rev. 2030 — férias tem prioridade sobre falta provável (mas não sobre feriado/trabalhado)
                                    // Rev. 2014 — feriado em dia útil: âmbar (não conta falta); feriado trabalhado: verde com badge
                                    const cls = dayIsFeriado && !isWeekend
                                      ? (d.trabalhado ? "text-green-800 bg-green-50 ring-1 ring-amber-300" : "text-amber-800 bg-amber-50 ring-1 ring-amber-200")
                                      : dayIsFerias && !d.trabalhado
                                        ? "text-sky-800 bg-sky-50 ring-1 ring-sky-200"
                                        : isWeekendFolga
                                          ? "text-slate-400 bg-slate-50 ring-1 ring-slate-200"
                                          : d.trabalhado
                                            ? "text-green-800 bg-green-50 ring-1 ring-green-200"
                                            : "text-red-700 bg-red-50 ring-1 ring-red-200";
                                    return (
                                      <div key={d.data} className={`flex items-center justify-between py-2 px-3 rounded-lg ${cls}`} title={dayIsFeriado && feriadoNome ? `Feriado: ${feriadoNome}` : (dayIsFerias ? "Em gozo de férias" : undefined)}>
                                        <span className="font-semibold tabular-nums">{label}</span>
                                        <span className="flex items-center gap-1 text-xs">
                                          {dayIsFeriado && !isWeekend && (
                                            <>
                                              <span>🎉</span>
                                              <span className="truncate max-w-[140px]">{feriadoNome ? `Feriado · ${feriadoNome}` : "Feriado"}</span>
                                              {d.trabalhado && <CheckCircle className="h-3 w-3 text-green-600 ml-1" />}
                                            </>
                                          )}
                                          {!dayIsFeriado && dayIsFerias && !d.trabalhado && (
                                            <>
                                              <span>🏖</span>
                                              <span className="font-semibold">Férias</span>
                                            </>
                                          )}
                                          {!dayIsFeriado && !dayIsFerias && isWeekendFolga && <span>— {d.dow === 0 ? "Domingo" : "Sábado"}</span>}
                                          {!dayIsFeriado && !isWeekendFolga && d.trabalhado && <>
                                            <CheckCircle className="h-3 w-3 text-green-600" />
                                            <span className="font-mono">{d.horasTrabalhadas ?? ""}</span>
                                          </>}
                                          {!dayIsFeriado && !dayIsFerias && !isWeekendFolga && !d.trabalhado && <>
                                            <XCircle className="h-3 w-3 text-red-500" />
                                            <span className="font-semibold">Falta provável</span>
                                          </>}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {/* ===== Rev. 2019 — MODAL Memória de cálculo do Atraso Acumulado ===== */}
                {atrasoDetalhe && (
                  <Dialog open={true} onOpenChange={(open) => { if (!open) setAtrasoDetalhe(null); }}>
                    <DialogContent resizable={false} className="flex flex-col p-0 gap-0 w-screen h-screen max-w-none sm:max-w-none rounded-none border-0">
                      {/* Header gradient vermelho (regra de ouro — coerente com modal "Mais Atrasados") */}
                      <DialogHeader className="shrink-0 px-8 py-5 border-b bg-gradient-to-r from-red-600 via-rose-500 to-pink-500 text-white relative overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_60%)] pointer-events-none" />
                        {/* Rev. 2065 — Botão Voltar pro ranking (modal de ranking continua aberto embaixo) */}
                        <div className="relative mb-3">
                          <Button variant="outline" size="sm" onClick={() => setAtrasoDetalhe(null)} className="h-8 text-xs bg-white/95 hover:bg-white text-slate-800 border-0 shadow-sm" data-testid="button-voltar-atraso">
                            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Voltar ao ranking
                          </Button>
                        </div>
                        <div className="relative flex items-start gap-4">
                          <span className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm ring-2 ring-white/30 shrink-0">
                            <AlertTriangle className="h-7 w-7" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <DialogTitle className="text-2xl font-bold flex items-center gap-3 flex-wrap">
                              Memória de cálculo · Atraso Acumulado
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-base font-semibold ring-1 ring-white/30">
                                {atrasoDetalhe.totalStr}
                              </span>
                            </DialogTitle>
                            <p className="text-base text-white/90 mt-1.5">
                              <strong className="text-lg">{atrasoDetalhe.nome}</strong>
                              {periodoIni && periodoFim && (
                                <span className="text-white/75"> · {fmtPeriodo(periodoIni)} → {fmtPeriodo(periodoFim)}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </DialogHeader>

                      <div className="flex-1 overflow-auto px-8 py-6 bg-slate-50/40">
                        {atrasoDetalheQuery.isLoading && (
                          <div className="flex items-center justify-center py-24 text-muted-foreground text-lg">
                            <span className="animate-pulse">Carregando memória de cálculo...</span>
                          </div>
                        )}
                        {atrasoDetalheQuery.data && (() => {
                          const { dias, totalMinutos, tolerancia, entradaPadrao } = atrasoDetalheQuery.data;
                          const fmtHM = (mins: number) => `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}min`;
                          const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                          if (dias.length === 0) {
                            return (
                              <div className="flex flex-col items-center justify-center py-24 text-center">
                                <CheckCircle className="h-16 w-16 text-emerald-500 mb-3" />
                                <p className="text-xl font-semibold text-slate-700">Nenhum atraso registrado no período.</p>
                                <p className="text-base text-muted-foreground mt-2 max-w-xl">
                                  Pode acontecer se a tolerância de {tolerancia} min absorveu todas as entradas tardias,
                                  ou se a jornada do colaborador não está cadastrada.
                                </p>
                              </div>
                            );
                          }
                          return (
                            <div className="max-w-7xl mx-auto">
                              {/* Faixa explicativa — Rev. 2032: foco na equação completa */}
                              <div className="mb-4 rounded-xl border bg-white p-5 flex items-start gap-3 shadow-sm">
                                <Info className="h-6 w-6 text-indigo-600 shrink-0 mt-0.5" />
                                <div className="text-base text-slate-700 leading-relaxed">
                                  <strong>Como ler esta tabela:</strong> pra cada dia mostramos as <strong>4 batidas reais</strong>, quanto o colaborador <strong>trabalhou no total</strong>, quanto era <strong>esperado pela jornada</strong> daquele dia da semana, e o <strong className="text-red-700">déficit</strong> (esperado − trabalhado). O déficit é exatamente o <strong className="text-red-700">atraso registrado pelo motor</strong> (tolerância de {tolerancia} min — Art. 58 §1º da CLT). A soma dos déficits bate com o total da tabela principal.
                                  {entradaPadrao && (
                                    <span> Jornada padrão seg-sex começa às <strong className="font-mono">{entradaPadrao}</strong>.</span>
                                  )}
                                  <span className="block mt-2 text-sm text-slate-500">Quando o déficit calculado (esperado − trabalhado) não bater com o que o motor registrou, uma observação aparece explicando o porquê (abono, ajuste manual, jornada alterada depois, falta parcial).</span>
                                </div>
                              </div>

                              {/* Resumo */}
                              <div className="flex items-center gap-6 mb-4 p-5 bg-white rounded-xl border text-lg flex-wrap shadow-sm">
                                <span className="flex items-center gap-2 text-red-700 font-semibold">
                                  <AlertTriangle className="h-6 w-6" /> {dias.length} {dias.length === 1 ? "dia" : "dias"} com atraso
                                </span>
                                <span className="flex items-center gap-2 text-slate-700">
                                  <Clock className="h-6 w-6" /> Total: <strong className="font-mono text-red-700 text-xl">{fmtHM(totalMinutos)}</strong>
                                </span>
                                <span className="flex items-center gap-2 text-slate-600 ml-auto">
                                  Média/dia atrasado:
                                  <strong className="font-mono text-slate-800 text-xl">
                                    {dias.length > 0 ? fmtHM(Math.round(totalMinutos / dias.length)) : "—"}
                                  </strong>
                                </span>
                              </div>

                              {/* Tabela dia a dia — Rev. 2032: equação completa visível */}
                              <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
                                <table className="w-full text-base">
                                  <thead className="bg-slate-100 border-b">
                                    <tr>
                                      <th className="px-4 py-4 text-left font-semibold text-slate-700">Data</th>
                                      <th className="px-4 py-4 text-center font-semibold text-slate-700">Batidas do dia</th>
                                      <th className="px-4 py-4 text-center font-semibold text-emerald-700">Trabalhado</th>
                                      <th className="px-4 py-4 text-center font-semibold text-slate-700">Esperado</th>
                                      <th className="px-4 py-4 text-center font-semibold text-red-700">Déficit (= Atraso)</th>
                                      <th className="px-4 py-4 text-right font-semibold text-slate-700">Acumulado</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {dias.map((d: any, idx: number) => {
                                      const [, mes, dia] = d.data.split("-");
                                      const label = `${dia}/${mes} · ${DIAS_SEMANA[d.dow]}`;
                                      const punch = (v: string | null) => v || "—";
                                      const trabMin = d.horasTrabalhadasMin;
                                      const expMin = d.jornadaEsperadaMin;
                                      const deficitCalc = (typeof trabMin === "number" && typeof expMin === "number" && expMin > 0)
                                        ? Math.max(0, expMin - trabMin)
                                        : null;
                                      // Diverge se o déficit calculado bater diferente do motor (≥2 min de tolerância)
                                      const diverge = deficitCalc !== null && Math.abs(deficitCalc - d.minutos) >= 2;
                                      return (
                                        <tr key={d.data} className={`border-b last:border-0 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"} hover:bg-red-50/40 align-top`}>
                                          <td className="px-4 py-4 font-semibold text-slate-800">{label}</td>
                                          {/* 4 batidas (entrada1 → saída1 // entrada2 → saída2) */}
                                          <td className="px-4 py-4 text-center font-mono text-slate-700 text-sm leading-relaxed">
                                            <div className="flex flex-col gap-0.5 items-center">
                                              <span><strong className="text-emerald-700">{punch(d.entrada1)}</strong> → <strong className="text-amber-700">{punch(d.saida1)}</strong></span>
                                              <span><strong className="text-amber-700">{punch(d.entrada2)}</strong> → <strong className="text-rose-700">{punch(d.saida2)}</strong></span>
                                            </div>
                                          </td>
                                          {/* Total trabalhado */}
                                          <td className="px-4 py-4 text-center font-mono font-bold text-emerald-700 text-lg">
                                            {d.horasTrabalhadas || (trabMin !== null ? fmtHM(trabMin) : "—")}
                                          </td>
                                          {/* Esperado pela jornada */}
                                          <td className="px-4 py-4 text-center font-mono text-slate-800 text-lg">
                                            {expMin !== null && expMin > 0
                                              ? fmtHM(expMin)
                                              : <span className="text-slate-400 italic text-sm">jornada não cadastrada</span>}
                                          </td>
                                          {/* Déficit = atraso (mesmo número do motor; mostra cálculo entre parênteses se diverge) */}
                                          <td className="px-4 py-4 text-center">
                                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-100 text-red-800 text-base font-bold font-mono">
                                              {fmtHM(d.minutos)}
                                            </span>
                                            {deficitCalc !== null && !diverge && (
                                              <div className="text-[11px] text-slate-500 mt-1 font-mono">
                                                ({fmtHM(expMin)} − {fmtHM(trabMin)})
                                              </div>
                                            )}
                                            {diverge && (
                                              <div className="text-[11px] text-amber-700 mt-1 font-mono" title="Motor registrou diferente do cálculo simples — ver observação abaixo.">
                                                cálculo sugere {fmtHM(deficitCalc)}
                                              </div>
                                            )}
                                            {d.observacao && (
                                              <div className="text-xs text-amber-700 mt-1.5 max-w-xs mx-auto leading-snug">⚠ {d.observacao}</div>
                                            )}
                                          </td>
                                          <td className="px-4 py-4 text-right font-mono font-semibold text-slate-700">{fmtHM(d.acumulado)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot className="bg-red-50 border-t-2 border-red-200">
                                    <tr>
                                      <td colSpan={4} className="px-4 py-4 text-right text-base font-semibold text-slate-700 uppercase">Total de déficit no período</td>
                                      <td className="px-4 py-4 text-center font-mono font-bold text-red-700 text-lg">{fmtHM(totalMinutos)}</td>
                                      <td className="px-4 py-4 text-right font-mono font-bold text-red-700 text-lg">{fmtHM(totalMinutos)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>

                              <p className="text-sm text-muted-foreground mt-5 text-center max-w-3xl mx-auto leading-relaxed">
                                <strong>Como ler cada linha</strong>: "Trabalhou <em>Trabalhado</em> de <em>Esperado</em> → déficit = <strong>Esperado − Trabalhado</strong>, que é o atraso descontado." A jornada esperada vem da <strong>jornada cadastrada</strong> do colaborador (RH → Funcionários → Jornada), já <em>líquida</em> do intervalo de almoço. Se aparecer "jornada não cadastrada", o motor ainda pode ter gravado atraso por outro caminho (ajuste manual, motor consolidado).
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {/* ===== Rev. 2051 — MODAL Memória de cálculo de HORAS EXTRAS ===== */}
                {heDetalhe && (
                  <Dialog open={true} onOpenChange={(open) => { if (!open) setHeDetalhe(null); }}>
                    <DialogContent resizable={false} className="flex flex-col p-0 gap-0 w-screen h-screen max-w-none sm:max-w-none rounded-none border-0">
                      <DialogHeader className="shrink-0 px-4 sm:px-8 py-4 sm:py-5 border-b bg-gradient-to-r from-emerald-600 via-teal-500 to-green-500 text-white relative overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_60%)] pointer-events-none" />
                        {/* Rev. 2065 — Botão Voltar pro ranking */}
                        <div className="relative mb-3">
                          <Button variant="outline" size="sm" onClick={() => setHeDetalhe(null)} className="h-8 text-xs bg-white/95 hover:bg-white text-slate-800 border-0 shadow-sm" data-testid="button-voltar-he">
                            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Voltar ao ranking
                          </Button>
                        </div>
                        <div className="relative flex items-start gap-3 sm:gap-4">
                          <span className="inline-flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-white/15 backdrop-blur-sm ring-2 ring-white/30 shrink-0">
                            <Zap className="h-6 w-6 sm:h-7 sm:w-7" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <DialogTitle className="text-lg sm:text-2xl font-bold flex items-center gap-2 sm:gap-3 flex-wrap">
                              Memória de cálculo · Horas Extras
                              <span className="inline-flex items-center gap-1 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-white/20 backdrop-blur-sm text-sm sm:text-base font-semibold ring-1 ring-white/30">
                                {heDetalhe.totalStr}
                              </span>
                            </DialogTitle>
                            <p className="text-sm sm:text-base text-white/90 mt-1 sm:mt-1.5">
                              <strong className="text-base sm:text-lg">{heDetalhe.nome}</strong>
                              {periodoIni && periodoFim && (
                                <span className="text-white/75 block sm:inline"> · {fmtPeriodo(periodoIni)} → {fmtPeriodo(periodoFim)}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </DialogHeader>

                      <div className="flex-1 overflow-auto px-3 sm:px-8 py-4 sm:py-6 bg-slate-50/40">
                        {heDetalheQuery.isLoading && (
                          <div className="flex items-center justify-center py-24 text-muted-foreground text-base sm:text-lg">
                            <span className="animate-pulse">Carregando memória de cálculo...</span>
                          </div>
                        )}
                        {heDetalheQuery.data && (() => {
                          const { dias, totalMinutos } = heDetalheQuery.data;
                          const fmtHM = (mins: number) => `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}min`;
                          const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                          if (dias.length === 0) {
                            return (
                              <div className="flex flex-col items-center justify-center py-24 text-center">
                                <CheckCircle className="h-16 w-16 text-emerald-500 mb-3" />
                                <p className="text-xl font-semibold text-slate-700">Nenhuma hora extra registrada no período.</p>
                                <p className="text-base text-muted-foreground mt-2 max-w-xl">
                                  O motor não gravou HE em nenhum dia. Pode ser que o total exibido na tabela venha de banco de horas ou ajuste manual no consolidado.
                                </p>
                              </div>
                            );
                          }
                          return (
                            <div className="max-w-7xl mx-auto">
                              {/* Faixa explicativa */}
                              <div className="mb-4 rounded-xl border bg-white p-4 sm:p-5 flex items-start gap-3 shadow-sm">
                                <Info className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600 shrink-0 mt-0.5" />
                                <div className="text-sm sm:text-base text-slate-700 leading-relaxed">
                                  <strong>Como ler:</strong> pra cada dia mostramos as <strong>4 batidas</strong>, quanto o colaborador <strong>trabalhou no total</strong>, quanto era <strong>esperado pela jornada</strong>, e o <strong className="text-emerald-700">excedente</strong> (= HE registrada pelo motor). Domingos e sábados fora da jornada têm <em>toda</em> a hora trabalhada como HE. A soma do excedente bate com o total da coluna "Horas Extras" da tabela principal.
                                </div>
                              </div>

                              {/* Resumo */}
                              <div className="flex items-center gap-3 sm:gap-6 mb-4 p-3 sm:p-5 bg-white rounded-xl border text-sm sm:text-lg flex-wrap shadow-sm">
                                <span className="flex items-center gap-2 text-emerald-700 font-semibold">
                                  <Zap className="h-5 w-5 sm:h-6 sm:w-6" /> {dias.length} {dias.length === 1 ? "dia" : "dias"} com HE
                                </span>
                                <span className="flex items-center gap-2 text-slate-700">
                                  <Clock className="h-5 w-5 sm:h-6 sm:w-6" /> Total: <strong className="font-mono text-emerald-700 text-base sm:text-xl">{fmtHM(totalMinutos)}</strong>
                                </span>
                                <span className="flex items-center gap-2 text-slate-600 sm:ml-auto">
                                  Média/dia c/ HE:
                                  <strong className="font-mono text-slate-800 text-base sm:text-xl">
                                    {dias.length > 0 ? fmtHM(Math.round(totalMinutos / dias.length)) : "—"}
                                  </strong>
                                </span>
                              </div>

                              {/* MOBILE: cards empilhados */}
                              <div className="md:hidden space-y-3">
                                {dias.map((d: any) => {
                                  const [, mes, dia] = d.data.split("-");
                                  const punch = (v: string | null) => v || "—";
                                  const trabMin = d.horasTrabalhadasMin;
                                  const expMin = d.jornadaEsperadaMin;
                                  return (
                                    <div key={d.data} className="bg-white rounded-xl border shadow-sm p-3">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="font-semibold text-slate-800">{dia}/{mes} · {DIAS_SEMANA[d.dow]}</div>
                                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono text-sm">
                                          + {fmtHM(d.heMin)}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="col-span-2 font-mono text-slate-600 bg-slate-50 rounded p-2">
                                          <strong className="text-emerald-700">{punch(d.entrada1)}</strong> → <strong className="text-amber-700">{punch(d.saida1)}</strong> · <strong className="text-amber-700">{punch(d.entrada2)}</strong> → <strong className="text-rose-700">{punch(d.saida2)}</strong>
                                        </div>
                                        <div><span className="text-slate-500">Trabalhado:</span> <strong className="font-mono text-emerald-700">{d.horasTrabalhadas || (trabMin !== null ? fmtHM(trabMin) : "—")}</strong></div>
                                        <div><span className="text-slate-500">Esperado:</span> <strong className="font-mono">{expMin !== null && expMin > 0 ? fmtHM(expMin) : "—"}</strong></div>
                                        <div className="col-span-2"><span className="text-slate-500">Acumulado:</span> <strong className="font-mono">{fmtHM(d.acumulado)}</strong></div>
                                      </div>
                                      {d.observacao && <div className="text-[11px] text-amber-700 mt-2">⚠ {d.observacao}</div>}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* DESKTOP: tabela */}
                              <div className="hidden md:block rounded-xl border bg-white overflow-x-auto shadow-sm">
                                <table className="w-full text-base min-w-[800px]">
                                  <thead className="bg-slate-100 border-b">
                                    <tr>
                                      <th className="px-4 py-4 text-left font-semibold text-slate-700">Data</th>
                                      <th className="px-4 py-4 text-center font-semibold text-slate-700">Batidas do dia</th>
                                      <th className="px-4 py-4 text-center font-semibold text-emerald-700">Trabalhado</th>
                                      <th className="px-4 py-4 text-center font-semibold text-slate-700">Esperado</th>
                                      <th className="px-4 py-4 text-center font-semibold text-emerald-700">Excedente (= HE)</th>
                                      <th className="px-4 py-4 text-right font-semibold text-slate-700">Acumulado</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {dias.map((d: any, idx: number) => {
                                      const [, mes, dia] = d.data.split("-");
                                      const label = `${dia}/${mes} · ${DIAS_SEMANA[d.dow]}`;
                                      const punch = (v: string | null) => v || "—";
                                      const trabMin = d.horasTrabalhadasMin;
                                      const expMin = d.jornadaEsperadaMin;
                                      return (
                                        <tr key={d.data} className={`border-b last:border-0 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"} hover:bg-emerald-50/40 align-top`}>
                                          <td className="px-4 py-4 font-semibold text-slate-800">{label}</td>
                                          <td className="px-4 py-4 text-center font-mono text-slate-700 text-sm leading-relaxed">
                                            <div className="flex flex-col gap-0.5 items-center">
                                              <span><strong className="text-emerald-700">{punch(d.entrada1)}</strong> → <strong className="text-amber-700">{punch(d.saida1)}</strong></span>
                                              <span><strong className="text-amber-700">{punch(d.entrada2)}</strong> → <strong className="text-rose-700">{punch(d.saida2)}</strong></span>
                                            </div>
                                          </td>
                                          <td className="px-4 py-4 text-center font-mono font-bold text-emerald-700 text-lg">
                                            {d.horasTrabalhadas || (trabMin !== null ? fmtHM(trabMin) : "—")}
                                          </td>
                                          <td className="px-4 py-4 text-center font-mono text-slate-800 text-lg">
                                            {expMin !== null && expMin > 0
                                              ? fmtHM(expMin)
                                              : <span className="text-slate-400 italic text-sm">{d.dow === 0 ? "domingo" : d.dow === 6 ? "sábado" : "sem jornada"}</span>}
                                          </td>
                                          <td className="px-4 py-4 text-center">
                                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 text-base font-bold font-mono">
                                              + {fmtHM(d.heMin)}
                                            </span>
                                            {d.observacao && (
                                              <div className="text-xs text-amber-700 mt-1.5 max-w-xs mx-auto leading-snug">⚠ {d.observacao}</div>
                                            )}
                                          </td>
                                          <td className="px-4 py-4 text-right font-mono font-semibold text-slate-700">{fmtHM(d.acumulado)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                                    <tr>
                                      <td colSpan={4} className="px-4 py-4 text-right text-base font-semibold text-slate-700 uppercase">Total de HE no período</td>
                                      <td className="px-4 py-4 text-center font-mono font-bold text-emerald-700 text-lg">{fmtHM(totalMinutos)}</td>
                                      <td className="px-4 py-4 text-right font-mono font-bold text-emerald-700 text-lg">{fmtHM(totalMinutos)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>

                              <p className="text-xs sm:text-sm text-muted-foreground mt-5 text-center max-w-3xl mx-auto leading-relaxed">
                                <strong>Como ler cada linha</strong>: HE = max(0, <em>Trabalhado − Esperado</em>) em dias úteis; em domingos e sábados fora da jornada, HE = <em>Trabalhado</em> integral. A jornada esperada vem da <strong>jornada cadastrada</strong> do colaborador (RH → Funcionários → Jornada), líquida do almoço. Adicional noturno, banco de horas e DSR podem ajustar o número final gravado pelo motor.
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {/* ===== Rev. 2051 — MODAL Memória de cálculo de FALTAS ===== */}
                {faltaDetalhe && (
                  <Dialog open={true} onOpenChange={(open) => { if (!open) setFaltaDetalhe(null); }}>
                    <DialogContent resizable={false} className="flex flex-col p-0 gap-0 w-screen h-screen max-w-none sm:max-w-none rounded-none border-0">
                      <DialogHeader className="shrink-0 px-4 sm:px-8 py-4 sm:py-5 border-b bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 text-white relative overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)] pointer-events-none" />
                        {/* Rev. 2065 — Botão Voltar pro ranking */}
                        <div className="relative mb-3">
                          <Button variant="outline" size="sm" onClick={() => setFaltaDetalhe(null)} className="h-8 text-xs bg-white/95 hover:bg-white text-slate-800 border-0 shadow-sm" data-testid="button-voltar-faltas">
                            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Voltar ao ranking
                          </Button>
                        </div>
                        <div className="relative flex items-start gap-3 sm:gap-4">
                          <span className="inline-flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-white/15 backdrop-blur-sm ring-2 ring-white/30 shrink-0">
                            <CalendarX className="h-6 w-6 sm:h-7 sm:w-7" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <DialogTitle className="text-lg sm:text-2xl font-bold flex items-center gap-2 sm:gap-3 flex-wrap">
                              Memória de cálculo · Faltas e Dias do Período
                            </DialogTitle>
                            <p className="text-sm sm:text-base text-white/90 mt-1 sm:mt-1.5">
                              <strong className="text-base sm:text-lg">{faltaDetalhe.nome}</strong>
                              {periodoIni && periodoFim && (
                                <span className="text-white/75 block sm:inline"> · {fmtPeriodo(periodoIni)} → {fmtPeriodo(periodoFim)}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </DialogHeader>

                      <div className="flex-1 overflow-auto px-3 sm:px-8 py-4 sm:py-6 bg-slate-50/40">
                        {faltaDetalheQuery.isLoading && (
                          <div className="flex items-center justify-center py-24 text-muted-foreground text-base sm:text-lg">
                            <span className="animate-pulse">Carregando memória de cálculo...</span>
                          </div>
                        )}
                        {faltaDetalheQuery.data && (() => {
                          const { dias, totais } = faltaDetalheQuery.data;
                          const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                          const STATUS_META: Record<string, { label: string; cor: string; emoji: string }> = {
                            trabalhado:             { label: "Trabalhado",          cor: "bg-green-100 text-green-800 ring-1 ring-green-200",       emoji: "✅" },
                            falta_nao_justificada:  { label: "Falta não justificada", cor: "bg-red-100 text-red-800 ring-1 ring-red-200",            emoji: "❌" },
                            atestado:               { label: "Atestado",            cor: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",          emoji: "🏥" },
                            ferias:                 { label: "Férias",              cor: "bg-sky-100 text-sky-800 ring-1 ring-sky-200",             emoji: "🏖" },
                            feriado:                { label: "Feriado",             cor: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",       emoji: "🎉" },
                            fds:                    { label: "Fim de semana",       cor: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",       emoji: "—" },
                            futuro:                 { label: "Ainda não chegou",    cor: "bg-violet-100 text-violet-700 ring-1 ring-violet-200",   emoji: "⏳" },
                            dispensa:               { label: "Aviso prévio",        cor: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",    emoji: "📄" },
                          };
                          return (
                            <div className="max-w-7xl mx-auto">
                              {/* Faixa explicativa */}
                              <div className="mb-4 rounded-xl border bg-white p-4 sm:p-5 flex items-start gap-3 shadow-sm">
                                <Info className="h-5 w-5 sm:h-6 sm:w-6 text-slate-600 shrink-0 mt-0.5" />
                                <div className="text-sm sm:text-base text-slate-700 leading-relaxed">
                                  <strong>Como ler:</strong> mostramos <strong>cada dia do período</strong> com seu status. <strong className="text-red-700">Falta não justificada</strong> = dia útil sem batida de ponto, sem atestado, sem férias e sem feriado. <strong className="text-blue-700">Atestado</strong> aparece com o tipo/CID/motivo (justifica a ausência). Feriados e fins de semana NÃO contam como falta. Dias em <strong className="text-violet-700">"Ainda não chegou"</strong> também não.
                                </div>
                              </div>

                              {/* Resumo (chips coloridos por status) */}
                              <div className="flex flex-wrap gap-2 sm:gap-3 mb-4 p-3 sm:p-5 bg-white rounded-xl border shadow-sm">
                                {([
                                  ["trabalhado", totais.trabalhados],
                                  ["falta_nao_justificada", totais.faltas_nao_justificadas],
                                  ["atestado", totais.atestados],
                                  ["ferias", totais.ferias],
                                  ["feriado", totais.feriados],
                                  ["fds", totais.fds],
                                  ["dispensa", totais.dispensa],
                                  ["futuro", totais.futuros],
                                ] as const).filter(([, n]) => n > 0).map(([k, n]) => {
                                  const m = STATUS_META[k];
                                  return (
                                    <span key={k} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${m.cor}`}>
                                      <span>{m.emoji}</span> {n} {m.label}
                                    </span>
                                  );
                                })}
                              </div>

                              {/* Grid de dias (responsivo: 2 cols mobile, 3-4 md/lg) */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                                {dias.map((d: any) => {
                                  const [, mes, dia] = d.data.split("-");
                                  const m = STATUS_META[d.status];
                                  return (
                                    <div key={d.data} className={`rounded-lg border shadow-sm p-3 ${m.cor} bg-white`}>
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="font-bold text-slate-800 text-base">
                                          {dia}/{mes} <span className="text-xs font-normal text-slate-500">· {DIAS_SEMANA[d.dow]}</span>
                                        </div>
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.cor}`}>
                                          <span>{m.emoji}</span> {m.label}
                                        </span>
                                      </div>
                                      {d.status === "trabalhado" && d.horasTrabalhadas && (
                                        <div className="text-xs font-mono text-slate-700"><CheckCircle className="inline h-3 w-3 text-green-600 mr-1" />{d.horasTrabalhadas}</div>
                                      )}
                                      {d.status === "atestado" && d.atestadoInfo && (
                                        <div className="text-xs text-slate-700 leading-relaxed">
                                          <div><strong>{d.atestadoInfo.tipo}</strong>{d.atestadoInfo.cid ? ` · CID ${d.atestadoInfo.cid}` : ""}</div>
                                          {d.atestadoInfo.motivo && <div className="text-slate-500 truncate" title={d.atestadoInfo.motivo}>{d.atestadoInfo.motivo}</div>}
                                          <div className="text-[11px] text-slate-500">
                                            Emitido {d.atestadoInfo.dataEmissao.split("-").reverse().join("/")}
                                            {d.atestadoInfo.dataRetorno && ` · retorno ${d.atestadoInfo.dataRetorno.split("-").reverse().join("/")}`}
                                          </div>
                                        </div>
                                      )}
                                      {d.status === "feriado" && d.feriadoNome && (
                                        <div className="text-xs text-amber-800 italic">{d.feriadoNome}</div>
                                      )}
                                      {d.status === "ferias" && (
                                        <div className="text-xs text-sky-700">Em gozo de férias</div>
                                      )}
                                      {d.status === "dispensa" && (
                                        <div className="text-xs text-orange-700">Em aviso prévio (rescisão em andamento)</div>
                                      )}
                                      {d.status === "fds" && (
                                        <div className="text-xs text-slate-500">{d.dow === 0 ? "Domingo" : "Sábado"} sem batida</div>
                                      )}
                                      {d.status === "futuro" && (
                                        <div className="text-xs text-violet-700">Dia ainda não chegou</div>
                                      )}
                                      {d.status === "falta_nao_justificada" && (
                                        <div className="text-xs text-red-700"><XCircle className="inline h-3 w-3 mr-1" />Sem ponto, sem atestado, sem justificativa</div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              <p className="text-xs sm:text-sm text-muted-foreground mt-5 text-center max-w-3xl mx-auto leading-relaxed">
                                "Falta não justificada" = dia útil sem nenhuma batida E sem atestado/férias/feriado/aviso prévio cobrindo o dia. Pode ser falta real, home office sem lançamento, ou ponto ainda não importado. Atestados vêm de DP → Atestados; férias vêm de DP → Férias; aviso prévio vem de DP → Rescisões.
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    </DialogContent>
                  </Dialog>
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
                          {cardFilter === "inativos" && (
                            <Badge className="ml-2 text-xs bg-rose-100 text-rose-700"><AlertCircle className="h-3 w-3 mr-1" /> Inativos com Ponto</Badge>
                          )}
                          {cardFilter === "ajustes" && (
                            <Badge className="ml-2 text-xs bg-purple-100 text-purple-700"><PenLine className="h-3 w-3 mr-1" /> Ajustes Manuais</Badge>
                          )}
                        </CardTitle>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <Select value={filterObra} onValueChange={setFilterObra}>
                              <SelectTrigger className="w-full sm:w-52 h-9"><SelectValue placeholder="Todas as Obras" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Todas as Obras</SelectItem>
                                {(obrasList.data || []).map((o: any) => (
                                  <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <CheckCircle className="h-4 w-4 text-muted-foreground" />
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                              <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Todos os Status" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Todos os Status</SelectItem>
                                <SelectItem value="conforme">Conforme (OK)</SelectItem>
                                <SelectItem value="problema">Com Problema</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-full sm:w-48 h-9" />
                          </div>
                          {(cardFilter || filterObra !== "all" || statusFilter !== "all") && (
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setCardFilter(null); setFilterObra("all"); setSearchTerm(""); setStatusFilter("all"); }}>
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
                              <th className="p-2 font-medium text-center">Saldo</th>
                              <th className="p-2 font-medium text-center">Status</th>
                              <th className="p-2 font-medium text-center">Raio-X</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredSummary.map((emp: any) => {
                              const hasConflict = (conflitos.data || []).some((c: any) => c.employeeId === emp.employeeId);
                              return (
                                <tr key={emp.employeeId} className={`border-b last:border-0 hover:bg-muted/30 ${emp.alertaInativo ? "bg-rose-50 border-l-4 border-l-rose-400" : emp.temAjusteManual ? "bg-purple-50" : ""} ${hasConflict ? "bg-orange-50" : emp.multiplasObras && !emp.alertaInativo ? "bg-red-50" : ""}`}>
                                  <td className="p-2">
                                    <div className="flex items-center gap-2">
                                      {/* Rev. 2015 — Avatar circular clicável → amplia foto */}
                                      <button
                                        type="button"
                                        aria-label={`Ampliar foto de ${emp.employeeName || 'colaborador'}`}
                                        className="shrink-0 rounded-full ring-2 ring-white hover:ring-blue-300 hover:scale-110 transition-all shadow-sm focus:outline-none focus:ring-blue-400"
                                        title={emp.employeeFotoUrl ? "Clique para ampliar a foto" : "Sem foto cadastrada — clique pra abrir o cadastro"}
                                        onClick={(ev) => { ev.stopPropagation(); setFotoZoom({ url: emp.employeeFotoUrl || null, nome: emp.employeeName || "" }); }}
                                      >
                                        <Avatar className="size-9">
                                          {emp.employeeFotoUrl && <AvatarImage src={emp.employeeFotoUrl} alt={emp.employeeName} />}
                                          <AvatarFallback className="bg-gradient-to-br from-blue-100 to-indigo-200 text-blue-900 text-[11px] font-bold">
                                            {getInitials(emp.employeeName || "")}
                                          </AvatarFallback>
                                        </Avatar>
                                      </button>
                                      <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <button className="font-medium text-blue-700 hover:underline text-left" onClick={() => openPontoDetalhe(emp.employeeId)}>
                                            {emp.employeeName}
                                          </button>
                                          {/* Rev. 2015 — Selo CIPA (ativo OU em estabilidade pós-mandato) */}
                                          {emp.cipaStatus === 'ativo' && (
                                            <Badge className="text-[10px] bg-emerald-600 text-white border-0 px-1.5 py-0 h-5" title={`CIPA · ${emp.cipaCargo || 'Membro'}${emp.cipaFimEstabilidade ? ` · Estabilidade até ${fmtPeriodo(emp.cipaFimEstabilidade)}` : ''}`}>
                                              <HardHat className="h-3 w-3 mr-0.5" /> CIPA
                                            </Badge>
                                          )}
                                          {emp.cipaStatus === 'estabilidade' && (
                                            <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50 px-1.5 py-0 h-5" title={`Ex-membro CIPA${emp.cipaCargo ? ` (${emp.cipaCargo})` : ''} em ESTABILIDADE pós-mandato até ${fmtPeriodo(emp.cipaFimEstabilidade || '')} — proteção contra dispensa imotivada (CLT art. 165)`}>
                                              <ShieldCheck className="h-3 w-3 mr-0.5" /> Ex-CIPA · estab. {emp.cipaFimEstabilidade ? fmtPeriodo(emp.cipaFimEstabilidade) : ''}
                                            </Badge>
                                          )}
                                          {emp.alertaInativo && (
                                            <Badge className="text-xs bg-rose-600 text-white border-0"><AlertCircle className="h-3 w-3 mr-1" /> {emp.employeeStatus || "Inativo"}</Badge>
                                          )}
                                          {!emp.alertaInativo && emp.temAjusteManual && (
                                            <Badge variant="outline" className="text-xs text-purple-600 border-purple-300"><PenLine className="h-3 w-3 mr-1" /> Ajuste</Badge>
                                          )}
                                          {!emp.alertaInativo && emp.emAvisoPrevio && (
                                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">⚠ Aviso Prévio</Badge>
                                          )}
                                          {emp.cargoConfianca && (
                                            <Badge variant="outline" className="text-xs text-indigo-600 border-indigo-300 bg-indigo-50">Art.62 — Confiança</Badge>
                                          )}
                                        </div>
                                      </div>
                                    </div>
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
                                  <td className="p-2 text-center font-mono">
                                    {(() => {
                                      const pHM4 = (s: string) => { if (!s || s === "-" || s === "0:00") return 0; const [h, m] = s.split(":").map(Number); return (h||0)*60+(m||0); };
                                      const ext4 = pHM4(emp.horasExtras); const atr4 = pHM4(emp.atrasos);
                                      if (ext4 > 0) return <span className="text-green-600 font-semibold">+{Math.floor(ext4/60)}:{String(ext4%60).padStart(2,'0')}</span>;
                                      if (atr4 > 0) return <span className="text-red-600 font-semibold">-{Math.floor(atr4/60)}:{String(atr4%60).padStart(2,'0')}</span>;
                                      return <span className="text-muted-foreground">0:00</span>;
                                    })()}
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
                                    <Button variant="ghost" size="sm" title="Raio-X do Funcionário" onClick={() => openRaioX(emp.employeeId)}>
                                      <Users className="h-4 w-4" />
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
        {viewMode === "inconsistencias" && (() => {
          const allItems = inconsistencies.data || [];
          const pendentes = allItems.filter((item: any) => item.inconsistency.status === "pendente");
          const resolvidos = allItems.filter((item: any) => item.inconsistency.status !== "pendente");
          const filteredByStatus = incFilterStatus === "pendente" ? pendentes : incFilterStatus === "resolvido" ? resolvidos : allItems;

          // Agrupar por tipo
          const tipoLabels: Record<string, string> = {
            batida_impar: "Batida Ímpar",
            falta_batida: "Falta de Batida",
            horario_divergente: "Horário Divergente",
            sem_registro: "Sem Registro",
            batida_duplicada: "Batida Duplicada",
          };
          const tipoColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
            batida_impar: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", badge: "bg-red-100 text-red-700" },
            falta_batida: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", badge: "bg-amber-100 text-amber-700" },
            horario_divergente: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", badge: "bg-blue-100 text-blue-700" },
            sem_registro: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-800", badge: "bg-slate-100 text-slate-700" },
            batida_duplicada: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-800", badge: "bg-purple-100 text-purple-700" },
          };

          const grouped: Record<string, any[]> = {};
          for (const item of filteredByStatus) {
            const tipo = item.inconsistency.tipoInconsistencia;
            if (!grouped[tipo]) grouped[tipo] = [];
            grouped[tipo].push(item);
          }
          // Filtrar por tipo se selecionado
          const tiposToShow = incFilterType === "all" ? Object.keys(grouped) : [incFilterType].filter(t => grouped[t]);
          const totalPendentes = pendentes.length;

          // Conflitos de obra
          const conflitosList = conflitos.data || [];

          return (
            <div className="space-y-4">
              {/* === HEADER COM RESUMO E AÇÕES GLOBAIS === */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" /> Inconsistências de Ponto — {formatMesAno(mesAno)}
                    </CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Filtro por status */}
                      <Select value={incFilterStatus} onValueChange={setIncFilterStatus}>
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                          <Filter className="h-3 w-3 mr-1" /><SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">Pendentes ({pendentes.length})</SelectItem>
                          <SelectItem value="resolvido">Resolvidas ({resolvidos.length})</SelectItem>
                          <SelectItem value="all">Todas ({allItems.length})</SelectItem>
                        </SelectContent>
                      </Select>
                      {/* Filtro por tipo */}
                      <Select value={incFilterType} onValueChange={setIncFilterType}>
                        <SelectTrigger className="w-[170px] h-8 text-xs">
                          <Filter className="h-3 w-3 mr-1" /><SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os Tipos</SelectItem>
                          {Object.entries(tipoLabels).map(([key, label]) => {
                            const count = (filteredByStatus.filter((i: any) => i.inconsistency.tipoInconsistencia === key)).length;
                            if (count === 0) return null;
                            return <SelectItem key={key} value={key}>{label} ({count})</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {/* Resumo visual */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-sm">
                      <div className="h-3 w-3 rounded-full bg-red-500"></div>
                      <span className="font-medium">{totalPendentes}</span>
                      <span className="text-muted-foreground">pendentes</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <div className="h-3 w-3 rounded-full bg-green-500"></div>
                      <span className="font-medium">{resolvidos.length}</span>
                      <span className="text-muted-foreground">resolvidas</span>
                    </div>
                    {conflitosList.length > 0 && (() => {
                      const overlaps = conflitosList.filter((c: any) => c.hasOverlap).length;
                      const valid = conflitosList.length - overlaps;
                      return (
                        <>
                          {overlaps > 0 && (
                            <div className="flex items-center gap-1.5 text-sm">
                              <div className="h-3 w-3 rounded-full bg-red-600"></div>
                              <span className="font-medium text-red-700">{overlaps}</span>
                              <span className="text-red-600">sobreposições (manual)</span>
                            </div>
                          )}
                          {valid > 0 && (
                            <div className="flex items-center gap-1.5 text-sm">
                              <div className="h-3 w-3 rounded-full bg-green-500"></div>
                              <span className="font-medium text-green-700">{valid}</span>
                              <span className="text-green-600">deslocamentos válidos</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <div className="ml-auto flex gap-2">
                      {totalPendentes > 0 && !isConsolidado && (
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs border-green-300 text-green-700 hover:bg-green-50"
                          disabled={resolveAllMut.isPending}
                          onClick={() => {
                            if (confirm(`Resolver TODAS as ${totalPendentes} inconsistências pendentes como JUSTIFICADAS?`)) {
                              resolveAllMut.mutate({ companyId, companyIds, mesReferencia: mesAno, status: "justificado", justificativa: "Resolvido em lote — todas as inconsistências" });
                            }
                          }}>
                          <Zap className="h-3.5 w-3.5" />
                          {resolveAllMut.isPending ? "Processando..." : `Resolver Todas (${totalPendentes})`}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* === SEÇÕES POR TIPO DE INCONSISTÊNCIA === */}
              {allItems.length === 0 ? (
                <Card>
                  <CardContent className="py-8">
                    <div className="text-center text-muted-foreground">
                      <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-500" />
                      <p>Nenhuma inconsistência encontrada para este mês.</p>
                    </div>
                  </CardContent>
                </Card>
              ) : filteredByStatus.length === 0 ? (
                <Card>
                  <CardContent className="py-8">
                    <div className="text-center text-muted-foreground">
                      <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-500" />
                      <p>Nenhuma inconsistência {incFilterStatus === "pendente" ? "pendente" : "resolvida"} encontrada.</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                tiposToShow.map(tipo => {
                  const items = grouped[tipo] || [];
                  if (items.length === 0) return null;
                  const colors = tipoColors[tipo] || tipoColors.sem_registro;
                  const label = tipoLabels[tipo] || tipo;
                  const pendentesDeTipo = items.filter((i: any) => i.inconsistency.status === "pendente");

                  return (
                    <Card key={tipo} className={`border ${colors.border}`}>
                      <CardHeader className={`pb-2 ${colors.bg} rounded-t-lg`}>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className={`h-4 w-4 ${colors.text}`} />
                            <CardTitle className={`text-sm font-bold ${colors.text}`}>{label}</CardTitle>
                            <Badge className={`text-xs ${colors.badge}`}>{items.length}</Badge>
                            {pendentesDeTipo.length > 0 && pendentesDeTipo.length < items.length && (
                              <span className="text-xs text-muted-foreground">({pendentesDeTipo.length} pendentes)</span>
                            )}
                          </div>
                          {pendentesDeTipo.length > 1 && !isConsolidado && (
                            <Button size="sm" variant="outline" className={`gap-1.5 text-xs ${colors.border} ${colors.text} hover:${colors.bg}`}
                              disabled={resolveBatchMut.isPending}
                              onClick={() => {
                                if (confirm(`Resolver todas as ${pendentesDeTipo.length} inconsistências de "${label}" como JUSTIFICADAS?`)) {
                                  resolveBatchMut.mutate({ companyId, companyIds, mesReferencia: mesAno, tipoInconsistencia: tipo as any, status: "justificado", justificativa: `Resolvido em lote (${label})` });
                                }
                              }}>
                              <ListChecks className="h-3.5 w-3.5" />
                              {resolveBatchMut.isPending ? "Processando..." : `Resolver Tipo (${pendentesDeTipo.length})`}
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left bg-muted/30">
                                <th className="p-2 font-medium">Colaborador</th>
                                <th className="p-2 font-medium">CPF</th>
                                <th className="p-2 font-medium">Data</th>
                                <th className="p-2 font-medium">Obra</th>
                                <th className="p-2 font-medium">Descrição</th>
                                <th className="p-2 font-medium text-center">Status</th>
                                <th className="p-2 font-medium text-center">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((item: any) => {
                                const inc = item.inconsistency;
                                const isIncExpanded = expandedInconsistency === inc.id;
                                const dayRecs = item.dayRecords || [];
                                return (
                                  <React.Fragment key={inc.id}>
                                    <tr className={`border-b hover:bg-muted/30 cursor-pointer ${isIncExpanded ? colors.bg : ""}`}
                                      onClick={() => setExpandedInconsistency(isIncExpanded ? null : inc.id)}
                                    >
                                      <td className="p-2">
                                        <button className="font-medium text-blue-700 hover:underline text-left" onClick={(e) => { e.stopPropagation(); openPontoDetalhe(inc.employeeId); }}>
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
                                      <td className="p-2 text-muted-foreground text-xs max-w-[250px] truncate">{inc.descricao}</td>
                                      <td className="p-2 text-center">
                                        <Badge variant={inc.status === "pendente" ? "destructive" : inc.status === "justificado" ? "secondary" : "outline"} className="text-xs">
                                          {inc.status === "pendente" ? "Pendente" : inc.status === "justificado" ? "Justificado" : inc.status === "ajustado" ? "Ajustado" : inc.status === "advertencia" ? "Advertência" : inc.status}
                                        </Badge>
                                      </td>
                                      <td className="p-2 text-center">
                                        {inc.status === "pendente" && !isConsolidado ? (
                                          <div className="flex items-center justify-center gap-1">
                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600 hover:bg-green-50" title="Justificar"
                                              onClick={(e) => { e.stopPropagation(); setSelectedInconsistency(item); setResolveData({ status: "justificado", justificativa: "" }); setShowResolveDialog(true); }}>
                                              <CheckCircle className="h-4 w-4" />
                                            </Button>
                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-purple-600 hover:bg-purple-50" title="Corrigir"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const recs = (item.dayRecords || []) as any[];
                                                const rec = recs.find((r: any) => r.obraId === inc.obraId) || recs[0] || {};
                                                setManualSeed({
                                                  employeeId: inc.employeeId || 0,
                                                  obraId: inc.obraId || rec.obraId || 0,
                                                  data: inc.data || "",
                                                  entrada1: rec.entrada1 || "",
                                                  saida1: rec.saida1 || "",
                                                  entrada2: rec.entrada2 || "",
                                                  saida2: rec.saida2 || "",
                                                  entrada3: rec.entrada3 || "",
                                                  saida3: rec.saida3 || "",
                                                  justificativa: `Correção: ${inc.descricao}`,
                                                });
                                                setShowManualDialog(true);
                                              }}>
                                              <PenLine className="h-4 w-4" />
                                            </Button>
                                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50" title="Gerar Advertência (abre Controle de Documentos)"
                                              onClick={(e) => { e.stopPropagation(); navigateToAdvertencia(setLocation, inc.employeeId, item.employeeName, inc.data || "", inc.descricao || inc.tipoInconsistencia || ""); }}>
                                              <Shield className="h-4 w-4" />
                                            </Button>
                                            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isIncExpanded ? "rotate-90" : ""}`} />
                                          </div>
                                        ) : (
                                          <ChevronRight className={`h-4 w-4 inline transition-transform ${isIncExpanded ? "rotate-90" : ""}`} />
                                        )}
                                      </td>
                                    </tr>
                                    {isIncExpanded && (
                                      <tr>
                                        <td colSpan={7} className="p-0">
                                          <div className={`${colors.bg} border-t ${colors.border} p-4 space-y-4`}>
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
                                                      <th className="px-3 py-1.5 text-center font-medium text-slate-600">Saldo</th>
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
                                                        <td className="px-3 py-1.5 text-center font-mono">
                                                          {(() => {
                                                            const parseHM2 = (s: string) => { if (!s || s === "-" || s === "0:00") return 0; const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
                                                            const trab = parseHM2(rec.horasTrabalhadas);
                                                            const extra = parseHM2(rec.horasExtras);
                                                            const atraso = parseHM2(rec.atrasos);
                                                            if (extra > 0) return <span className="text-green-600 font-semibold">+{Math.floor(extra/60)}:{String(extra%60).padStart(2,'0')}</span>;
                                                            if (atraso > 0) return <span className="text-red-600 font-semibold">-{Math.floor(atraso/60)}:{String(atraso%60).padStart(2,'0')}</span>;
                                                            if (trab === 0 && !rec.entrada1) return <span className="text-muted-foreground">-</span>;
                                                            return <span className="text-muted-foreground">0:00</span>;
                                                          })()}
                                                        </td>
                                                        <td className="px-3 py-1.5 text-center">
                                                          <div className="flex flex-col items-center gap-0.5">
                                                            <Badge variant={rec.ajusteManual ? "secondary" : "outline"} className="text-[10px]">
                                                              {rec.ajusteManual ? "Manual" : "DIXI"}
                                                            </Badge>
                                                            {rec.ajusteManual && rec.ajustadoPor && <span className="text-[9px] text-purple-500 font-medium truncate max-w-[100px]" title={rec.ajustadoPor}>{rec.ajustadoPor.split(" ").slice(0,2).join(" ")}</span>}
                                                          </div>
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

                                            {/* Ações de Resolução (expandido) */}
                                            {inc.status === "pendente" && !isConsolidado && (
                                              <div className="space-y-2">
                                                <p className="text-xs font-medium ${colors.text}">Escolha como resolver:</p>
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
                                                      {
                                                        const recs = (item.dayRecords || []) as any[];
                                                        const rec = recs.find((r: any) => r.obraId === inc.obraId) || recs[0] || {};
                                                        setManualSeed({
                                                          employeeId: inc.employeeId || 0,
                                                          obraId: inc.obraId || rec.obraId || 0,
                                                          data: inc.data || "",
                                                          entrada1: rec.entrada1 || "",
                                                          saida1: rec.saida1 || "",
                                                          entrada2: rec.entrada2 || "",
                                                          saida2: rec.saida2 || "",
                                                          entrada3: rec.entrada3 || "",
                                                          saida3: rec.saida3 || "",
                                                          justificativa: `Correção: ${inc.descricao}`,
                                                        });
                                                      }
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
                                                      navigateToAdvertencia(setLocation, inc.employeeId, item.employeeName, inc.data || "", inc.descricao || inc.tipoInconsistencia || "");
                                                    }}
                                                  >
                                                    <div className="flex items-center gap-2">
                                                      <Shield className="h-4 w-4 text-red-600" />
                                                      <span className="text-sm font-semibold text-red-800">Advertência</span>
                                                    </div>
                                                    <p className="text-xs text-red-600 mt-1">Ir para Controle de Documentos</p>
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
                      </CardContent>
                    </Card>
                  );
                })
              )}

              {/* === SEÇÃO DE CONFLITOS DE OBRA === */}
              {conflitosList.length > 0 && (
                <Card className="border-orange-200">
                  <CardHeader className="pb-2 bg-orange-50 rounded-t-lg">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-orange-700" />
                        <CardTitle className="text-sm font-bold text-orange-800">Conflitos de Obra (Mesmo Dia)</CardTitle>
                        <Badge className="bg-orange-100 text-orange-700 text-xs">{conflitosList.length}</Badge>
                      </div>
                      {!isConsolidado && conflitosList.filter((c: any) => c.isSameObraDuplicate).length > 0 && (
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs border-purple-400 text-purple-700 hover:bg-purple-50"
                          disabled={resolveAllDuplicatasMut.isPending}
                          onClick={() => {
                            const qtd = conflitosList.filter((c: any) => c.isSameObraDuplicate).length;
                            if (confirm(`Resolver ${qtd} batida(s) duplicada(s) automaticamente?\n\nRegra: em cada grupo, mantém o registro com MAIS HORAS (ou o lançamento manual, se houver). Os demais serão EXCLUÍDOS.\n\nEsta ação não pode ser desfeita.`)) {
                              resolveAllDuplicatasMut.mutate({ companyId, companyIds, mesReferencia: mesAno });
                            }
                          }}>
                          <Copy className="h-3.5 w-3.5" />
                          {resolveAllDuplicatasMut.isPending ? "Processando..." : `Resolver Duplicatas (${conflitosList.filter((c: any) => c.isSameObraDuplicate).length})`}
                        </Button>
                      )}
                      {!isConsolidado && conflitosList.filter((c: any) => !c.isSameObraDuplicate).length > 1 && (
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                          disabled={resolveAllConflitosMut.isPending}
                          onClick={() => {
                            const qtd = conflitosList.filter((c: any) => !c.isSameObraDuplicate).length;
                            if (confirm(`Confirmar DESLOCAMENTO para ${qtd} conflito(s) de obras diferentes?`)) {
                              resolveAllConflitosMut.mutate({ companyId, companyIds, mesReferencia: mesAno, acao: "confirmar_deslocamento", justificativa: "Deslocamento confirmado em lote" });
                            }
                          }}>
                          <ListChecks className="h-3.5 w-3.5" />
                          {resolveAllConflitosMut.isPending ? "Processando..." : `Confirmar Deslocamentos (${conflitosList.filter((c: any) => !c.isSameObraDuplicate).length})`}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left bg-muted/30">
                            <th className="p-2 font-medium">Colaborador</th>
                            <th className="p-2 font-medium">Data</th>
                            <th className="p-2 font-medium">Status</th>
                            <th className="p-2 font-medium">Obras</th>
                            <th className="p-2 font-medium text-center">Registros</th>
                            <th className="p-2 font-medium text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {conflitosList.map((c: any, idx: number) => {
                            const key = `${c.employeeId}|${c.data}`;
                            const isExpanded = expandedConflict === key;
                            const isOverlap = c.hasOverlap;
                            const isDuplicate = c.isSameObraDuplicate;
                            return (
                              <React.Fragment key={key}>
                                <tr className={`border-b hover:bg-muted/30 cursor-pointer ${isExpanded ? (isOverlap ? "bg-red-50" : isDuplicate ? "bg-purple-50" : "bg-green-50") : ""} ${isOverlap ? "border-l-4 border-l-red-500" : isDuplicate ? "border-l-4 border-l-purple-500" : "border-l-4 border-l-green-500"}`}
                                  onClick={() => setExpandedConflict(isExpanded ? null : key)}>
                                  <td className="p-2">
                                    <button className="font-medium text-blue-700 hover:underline text-left" onClick={(e) => { e.stopPropagation(); openPontoDetalhe(c.employeeId); }}>
                                      {c.employeeName}
                                    </button>
                                  </td>
                                  <td className="p-2">
                                    {c.data ? new Date(c.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}
                                    <span className="text-muted-foreground ml-1 text-xs">({dayOfWeek(c.data)})</span>
                                  </td>
                                  <td className="p-2">
                                    {isOverlap ? (
                                      <Badge className="text-xs bg-red-100 text-red-800 border border-red-300">
                                        <XCircle className="h-3 w-3 mr-1" /> Sobreposição
                                      </Badge>
                                    ) : isDuplicate ? (
                                      <Badge className="text-xs bg-purple-100 text-purple-800 border border-purple-300">
                                        <Copy className="h-3 w-3 mr-1" /> Batida Duplicada
                                      </Badge>
                                    ) : c.transferAnalysis && c.transferAnalysis.length > 0 ? (
                                      <Badge className="text-xs bg-blue-100 text-blue-800 border border-blue-300">
                                        <ArrowRightLeft className="h-3 w-3 mr-1" /> Transferência
                                      </Badge>
                                    ) : (
                                      <Badge className="text-xs bg-green-100 text-green-800 border border-green-300">
                                        <CheckCircle className="h-3 w-3 mr-1" /> Desloc. Válido
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="p-2">
                                    <div className="flex flex-wrap gap-1">
                                      {(c.records || []).map((r: any, ri: number) => (
                                        <Badge key={ri} variant="outline" className="text-xs gap-1">
                                          <Building2 className="h-3 w-3" />{r.obraNome || "Sem Obra"}
                                        </Badge>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="p-2 text-center">
                                    <Badge variant="secondary" className="text-xs">{(c.records || []).length}</Badge>
                                  </td>
                                  <td className="p-2 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      {!isConsolidado && !isOverlap && !isDuplicate && (
                                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-700 hover:bg-green-50"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`Confirmar deslocamento entre obras para ${c.employeeName} em ${c.data ? new Date(c.data + "T12:00:00").toLocaleDateString("pt-BR") : c.data}?`)) {
                                              resolveConflitoMut.mutate({ companyId, companyIds, employeeId: c.employeeId, data: c.data, acao: "confirmar_deslocamento", obraIdManter: (c.records?.[0]?.obraId || 0), justificativa: "Deslocamento confirmado" });
                                            }
                                          }}>
                                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Confirmar
                                        </Button>
                                      )}
                                      {!isConsolidado && isDuplicate && (
                                        <span className="text-xs text-purple-700 font-medium flex items-center gap-1"><Copy className="h-3 w-3" /> Excluir duplicata</span>
                                      )}
                                      {isOverlap && (
                                        <span className="text-xs text-red-600 font-medium">Resolver manual</span>
                                      )}
                                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                    </div>
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={6} className="p-0">
                                      <div className={`border-t p-4 ${isOverlap ? "bg-red-50/50 border-red-200" : isDuplicate ? "bg-purple-50/50 border-purple-200" : "bg-green-50/50 border-green-200"}`}>
                                        {/* ALERTA: SOBREPOSIÇÃO REAL */}
                                        {isOverlap && (
                                          <div className="mb-3 p-3 bg-red-100 border border-red-300 rounded-lg flex items-start gap-2">
                                            <AlertCircle className="h-5 w-5 text-red-700 flex-shrink-0 mt-0.5" />
                                            <div>
                                              <p className="text-xs text-red-800 font-bold">SOBREPOSIÇÃO DE HORÁRIOS</p>
                                              <p className="text-xs text-red-700 mt-0.5">
                                                O funcionário aparece em 2 obras <strong>no mesmo horário</strong>. Isso é impossível.
                                                Escolha qual obra manter ou exclua o registro incorreto.
                                              </p>
                                            </div>
                                          </div>
                                        )}
                                        {/* ALERTA: TRANSFERÊNCIA DETECTADA */}
                                        {!isOverlap && c.transferAnalysis && c.transferAnalysis.length > 0 && (
                                          <div className="mb-3 p-3 bg-blue-50 border border-blue-300 rounded-lg">
                                            <div className="flex items-start gap-2 mb-2">
                                              <ArrowRightLeft className="h-5 w-5 text-blue-700 flex-shrink-0 mt-0.5" />
                                              <div>
                                                <p className="text-xs text-blue-800 font-bold">TRANSFERÊNCIA DE OBRA DETECTADA</p>
                                                <p className="text-xs text-blue-700 mt-0.5">
                                                  O funcionário bateu ponto em horários diferentes em obras distintas. 
                                                  Provavelmente foi <strong>transferido de obra</strong> durante o dia.
                                                </p>
                                              </div>
                                            </div>
                                            {c.transferAnalysis.map((t: any, ti: number) => (
                                              <div key={ti} className="mt-2 p-2.5 bg-white border border-blue-200 rounded-lg">
                                                <div className="flex items-center gap-2 text-xs">
                                                  <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded">
                                                    <Building2 className="h-3.5 w-3.5 text-blue-600" />
                                                    <span className="font-semibold text-blue-800">{t.fromObraNome}</span>
                                                    <span className="text-blue-600 font-mono">({t.fromEntrada})</span>
                                                  </div>
                                                  <ArrowRight className="h-4 w-4 text-blue-500" />
                                                  <div className="flex items-center gap-1.5 bg-green-50 px-2 py-1 rounded">
                                                    <Building2 className="h-3.5 w-3.5 text-green-600" />
                                                    <span className="font-semibold text-green-800">{t.toObraNome}</span>
                                                    <span className="text-green-600 font-mono">({t.toEntrada})</span>
                                                  </div>
                                                  <Badge className="bg-blue-100 text-blue-700 text-[10px] ml-auto">
                                                    Gap: {t.gapMinutes >= 60 ? `${Math.floor(t.gapMinutes/60)}h${t.gapMinutes%60 > 0 ? String(t.gapMinutes%60).padStart(2,'0') : ''}` : `${t.gapMinutes}min`}
                                                  </Badge>
                                                </div>
                                                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded flex items-center gap-2">
                                                  <Info className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                                                  <p className="text-[11px] text-amber-800">
                                                    <strong>Sugestão:</strong> Registre uma saída às <strong className="font-mono">{t.suggestedExit}</strong> na obra <strong>{t.fromObraNome}</strong> para fechar as horas corretamente.
                                                    Use o botão "Lançar Manual" para ajustar.
                                                  </p>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {/* ALERTA: DESLOCAMENTO SEM ANÁLISE DETALHADA */}
                                        {!isOverlap && !isDuplicate && (!c.transferAnalysis || c.transferAnalysis.length === 0) && (
                                          <div className="mb-3 p-2 bg-green-100 border border-green-300 rounded-lg flex items-center gap-2">
                                            <MapPin className="h-4 w-4 text-green-700 flex-shrink-0" />
                                            <p className="text-xs text-green-800 font-medium">
                                              Deslocamento entre obras detectado — os horários não se sobrepõem.
                                            </p>
                                          </div>
                                        )}
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="bg-white border-b">
                                              <th className="px-3 py-1.5 text-left font-medium">Obra</th>
                                              <th className="px-3 py-1.5 text-center font-medium">Entrada</th>
                                              <th className="px-3 py-1.5 text-center font-medium">Saída Int.</th>
                                              <th className="px-3 py-1.5 text-center font-medium">Retorno</th>
                                              <th className="px-3 py-1.5 text-center font-medium">Saída</th>
                                              <th className="px-3 py-1.5 text-center font-medium">H. Trab.</th>
                                              <th className="px-3 py-1.5 text-center font-medium">Fonte</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(c.records || []).map((r: any, ri: number) => (
                                              <tr key={ri} className="border-b last:border-0">
                                                <td className="px-3 py-1.5"><span className="flex items-center gap-1"><Building2 className="h-3 w-3 text-teal-600" />{r.obraNome || "Sem Obra"}</span></td>
                                                <td className="px-3 py-1.5 text-center font-mono">{r.entrada1 || "--:--"}</td>
                                                <td className="px-3 py-1.5 text-center font-mono">{r.saida1 || "--:--"}</td>
                                                <td className="px-3 py-1.5 text-center font-mono">{r.entrada2 || "--:--"}</td>
                                                <td className="px-3 py-1.5 text-center font-mono">{r.saida2 || "--:--"}</td>
                                                <td className="px-3 py-1.5 text-center font-semibold">{r.horasTrabalhadas || "-"}</td>
                                                <td className="px-3 py-1.5 text-center"><div className="flex flex-col items-center gap-0.5"><Badge variant={r.ajusteManual ? "secondary" : "outline"} className="text-[10px]">{r.ajusteManual ? "Manual" : "DIXI"}</Badge>{r.ajusteManual && r.ajustadoPor && <span className="text-[9px] text-purple-500 font-medium truncate max-w-[100px]" title={r.ajustadoPor}>{r.ajustadoPor.split(" ").slice(0,2).join(" ")}</span>}</div></td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                        {!isConsolidado && (
                                          <div className="mt-3 space-y-2">
                                            {isDuplicate ? (
                                              <div className="p-3 bg-purple-50 border border-purple-300 rounded-lg">
                                                <p className="text-xs text-purple-900 font-bold mb-1 flex items-center gap-1">
                                                  <Copy className="h-3.5 w-3.5" /> Batida duplicada na mesma obra
                                                </p>
                                                <p className="text-[11px] text-purple-700 mb-2">
                                                  Existem {c.records?.length || 2} registros para o mesmo funcionário, obra e dia com horários diferentes.
                                                  Isso ocorre quando o arquivo de ponto foi importado mais de uma vez ou o relógio registrou duas jornadas no mesmo dia.
                                                  Mantenha apenas o registro correto e exclua a duplicata usando a opção abaixo.
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                  {(c.records || []).map((o: any, oi: number) => (
                                                    <Button key={`del-dup-${oi}`} size="sm" variant="ghost" className="gap-1.5 text-xs text-red-600 hover:bg-red-50 border border-red-200"
                                                      onClick={() => {
                                                        if (confirm(`Excluir o ${oi === 0 ? "1º" : "2º"} registro (Entrada: ${o.entrada1 || "--:--"}, Saída: ${o.saida1 || "--:--"}) para este funcionário neste dia?`)) {
                                                          resolveConflitoMut.mutate({ companyId, companyIds, employeeId: c.employeeId, data: c.data, acao: "excluir_por_id", recordId: o.id, justificativa: conflictJustificativa || `Batida duplicada removida (entrada: ${o.entrada1})` });
                                                        }
                                                      }}
                                                      disabled={resolveConflitoMut.isPending}>
                                                      <Trash2 className="h-3.5 w-3.5" /> Excluir {oi === 0 ? "1º" : "2º"} reg. (Ent: {o.entrada1 || "--:--"})
                                                    </Button>
                                                  ))}
                                                </div>
                                              </div>
                                            ) : isOverlap ? (
                                              <div className="p-3 bg-red-50 border border-red-300 rounded-lg">
                                                <p className="text-xs text-red-800 font-bold mb-2 flex items-center gap-1">
                                                  <AlertCircle className="h-3.5 w-3.5" /> Resolução obrigatória: Escolha qual obra manter
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                  {(c.records || c.obras || []).map((o: any, oi: number) => (
                                                    <Button key={oi} size="sm" variant="outline" className="gap-1.5 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                                                      onClick={() => {
                                                        if (!o.obraId) return toast.error("Obra sem ID");
                                                        if (confirm(`Manter APENAS na obra "${o.obraNome}" e remover registros das outras obras?`)) {
                                                          resolveConflitoMut.mutate({ companyId, companyIds, employeeId: c.employeeId, data: c.data, acao: "manter_obra", obraIdManter: o.obraId, justificativa: conflictJustificativa || `Mantido na obra ${o.obraNome} (sobreposição resolvida)` });
                                                        }
                                                      }}
                                                      disabled={resolveConflitoMut.isPending}>
                                                      <Building2 className="h-3.5 w-3.5" /> Manter: {o.obraNome?.substring(0, 20)}
                                                    </Button>
                                                  ))}
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                  {(c.records || c.obras || []).map((o: any, oi: number) => (
                                                    <Button key={`del-${oi}`} size="sm" variant="ghost" className="gap-1.5 text-xs text-red-600 hover:bg-red-50"
                                                      onClick={() => {
                                                        if (!o.obraId) return toast.error("Obra sem ID");
                                                        if (confirm(`Excluir TODOS os registros da obra "${o.obraNome}" neste dia?`)) {
                                                          resolveConflitoMut.mutate({ companyId, companyIds, employeeId: c.employeeId, data: c.data, acao: "excluir_registro", obraIdExcluir: o.obraId, justificativa: conflictJustificativa || `Excluído registro de ${o.obraNome} (erro de lançamento)` });
                                                        }
                                                      }}
                                                      disabled={resolveConflitoMut.isPending}>
                                                      <Trash2 className="h-3.5 w-3.5" /> Excluir {o.obraNome?.substring(0, 15)}
                                                    </Button>
                                                  ))}
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="space-y-2">
                                                {c.transferAnalysis && c.transferAnalysis.length > 0 && (
                                                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                                    <p className="text-xs text-blue-800 font-bold mb-2 flex items-center gap-1">
                                                      <ArrowRightLeft className="h-3.5 w-3.5" /> Ações sugeridas para transferência:
                                                    </p>
                                                    <p className="text-[11px] text-blue-700 mb-2">
                                                      Use "Lançar Manual" no topo da página para registrar a saída na obra anterior.
                                                      Após ajustar, o conflito será resolvido automaticamente.
                                                    </p>
                                                  </div>
                                                )}
                                                <div className="flex gap-2">
                                                  <Button size="sm" className="gap-1.5 text-xs bg-green-600 hover:bg-green-700"
                                                    onClick={() => resolveConflitoMut.mutate({ companyId, companyIds, employeeId: c.employeeId, data: c.data, acao: "confirmar_deslocamento", obraIdManter: (c.records?.[0]?.obraId || 0), justificativa: conflictJustificativa || "Deslocamento confirmado" })}
                                                    disabled={resolveConflitoMut.isPending}>
                                                    <MapPin className="h-3.5 w-3.5" /> Confirmar Deslocamento (Rateio Proporcional)
                                                  </Button>
                                                  <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                                                    onClick={() => resolveConflitoMut.mutate({ companyId, companyIds, employeeId: c.employeeId, data: c.data, acao: "manter_obra", obraIdManter: (c.records?.[0]?.obraId || 0), justificativa: conflictJustificativa || "Manter obra principal" })}
                                                    disabled={resolveConflitoMut.isPending}>
                                                    <Building2 className="h-3.5 w-3.5" /> Manter Obra Principal
                                                  </Button>
                                                </div>
                                              </div>
                                            )}
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
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })()}

        {/* ===== DETALHE VIEW ===== */}
        {viewMode === "detalhe" && selectedEmployeeId && (
          <>
            {employeeDetail.isLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Carregando...</CardContent></Card>
            ) : (
              <>
                {/* Alerta funcionário inativo */}
                {(() => {
                  const st = employeeDetail.data?.employee?.status;
                  const inativos = ['Desligado', 'Afastado', 'Recluso', 'Lista_Negra'];
                  if (!st || !inativos.includes(st)) return null;
                  return (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 mb-2">
                      <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
                      <div>
                        <p className="font-semibold text-sm">Funcionário com status "{st}" — registros de ponto detectados</p>
                        <p className="text-xs text-rose-700 mt-0.5">Este colaborador está inativo no sistema mas possui registros de ponto neste período. Verifique e remova os registros caso sejam indevidos.</p>
                      </div>
                    </div>
                  );
                })()}
                {/* Resumo Totalizador do Colaborador */}
                {(() => {
                  const allRecs = employeeDetail.data?.records || [];
                  const empIncons = employeeDetail.data?.inconsistencies || [];
                  const empConflitos = (conflitos.data || []).filter((c: any) => c.employeeId === selectedEmployeeId);
                  const totalDias = new Set(allRecs.map((r: any) => r.data)).size;
                  const parseHM = (s: string) => { if (!s || s === "-") return 0; const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
                  const fmtHM = (mins: number) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
                  const totalHoras = allRecs.reduce((acc: number, r: any) => acc + parseHM(r.horasTrabalhadas), 0);
                  const totalExtras = allRecs.reduce((acc: number, r: any) => acc + parseHM(r.horasExtras), 0);
                  const totalAtrasos = allRecs.reduce((acc: number, r: any) => acc + parseHM(r.atrasos), 0);
                  const totalObras = (employeeDetail.data?.recordsByObra || []).length;
                  const inconsPendentes = empIncons.filter((i: any) => i.status === "pendente").length;
                  const empSummary = (summary.data || []).find((e: any) => e.employeeId === selectedEmployeeId);

                  return (
                    <Card className="border-[#1B2A4A]/20">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="flex items-center gap-6 flex-wrap">
                            <div className="text-center">
                              <p className="text-2xl font-bold text-[#1B2A4A]">{fmtNum(totalDias)}</p>
                              <p className="text-xs text-muted-foreground">Dias Trab.</p>
                            </div>
                            <div className="h-8 w-px bg-border" />
                            <div className="text-center">
                              <p className="text-2xl font-bold text-[#1B2A4A]">{fmtHM(totalHoras)}</p>
                              <p className="text-xs text-muted-foreground">Horas Totais</p>
                            </div>
                            <div className="h-8 w-px bg-border" />
                            <div className="text-center">
                              <p className={`text-2xl font-bold ${totalExtras > 0 ? "text-green-600" : "text-muted-foreground"}`}>{fmtHM(totalExtras)}</p>
                              <p className="text-xs text-muted-foreground">Horas Extras</p>
                            </div>
                            <div className="h-8 w-px bg-border" />
                            <div className="text-center">
                              <p className={`text-2xl font-bold ${totalAtrasos > 0 ? "text-red-600" : "text-muted-foreground"}`}>{fmtHM(totalAtrasos)}</p>
                              <p className="text-xs text-muted-foreground">Atrasos</p>
                            </div>
                            <div className="h-8 w-px bg-border" />
                            <div className="text-center">
                              <p className="text-2xl font-bold text-[#1B2A4A]">{fmtNum(totalObras)}</p>
                              <p className="text-xs text-muted-foreground">Obra{totalObras !== 1 ? "s" : ""}</p>
                            </div>
                            {inconsPendentes > 0 && (
                              <>
                                <div className="h-8 w-px bg-border" />
                                <div className="text-center">
                                  <p className="text-2xl font-bold text-amber-600">{fmtNum(inconsPendentes)}</p>
                                  <p className="text-xs text-muted-foreground">Inconsistências</p>
                                </div>
                              </>
                            )}
                            {empConflitos.length > 0 && (
                              <>
                                <div className="h-8 w-px bg-border" />
                                <div className="text-center">
                                  <p className="text-2xl font-bold text-orange-600">{fmtNum(empConflitos.length)}</p>
                                  <p className="text-xs text-muted-foreground">Conflitos</p>
                                </div>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {!isConsolidado && (
                              <Button variant="outline" size="sm" onClick={() => {
                                setManualSeed({ employeeId: selectedEmployeeId || 0, obraId: 0, data: "", entrada1: "", saida1: "", entrada2: "", saida2: "", justificativa: "" });
                                setShowManualDialog(true);
                              }}><PenLine className="h-4 w-4 mr-1" /> Lançar Manual</Button>
                            )}
                          </div>
                        </div>
                        {/* Jornada e competência */}
                        <div className="flex flex-col gap-2 mt-3 pt-3 border-t text-xs text-muted-foreground">
                          <div className="flex items-center gap-4 flex-wrap">
                            <span><strong>Competência:</strong> {formatMesAno(mesAno)}</span>
                            {empSummary?.multiplasObras && (
                              <Badge variant="destructive" className="text-xs"><MapPin className="h-3 w-3 mr-1" /> Múltiplas Obras</Badge>
                            )}
                          </div>
                          {employeeDetail.data?.employee?.jornadaTrabalho && (() => {
                            const jt = employeeDetail.data.employee.jornadaTrabalho;
                            const diasMap: Record<string, string> = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom' };
                            const diasOrdem = ['seg','ter','qua','qui','sex','sab','dom'];
                            try {
                              const jornada = JSON.parse(jt);
                              if (typeof jornada === 'object' && jornada !== null) {
                                const diasAtivos = diasOrdem.filter(d => jornada[d]);
                                if (diasAtivos.length === 0) return null;
                                return (
                                  <div className="overflow-x-auto">
                                    <table className="text-xs border-collapse">
                                      <thead>
                                        <tr className="bg-muted/50">
                                          <th className="px-2 py-1 text-left font-semibold border">Dia</th>
                                          {diasAtivos.map(d => <th key={d} className="px-2 py-1 text-center font-semibold border">{diasMap[d]}</th>)}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        <tr>
                                          <td className="px-2 py-1 font-semibold border">Entrada</td>
                                          {diasAtivos.map(d => <td key={d} className="px-2 py-1 text-center border font-mono">{jornada[d].entrada || '-'}</td>)}
                                        </tr>
                                        <tr>
                                          <td className="px-2 py-1 font-semibold border">Intervalo</td>
                                          {diasAtivos.map(d => <td key={d} className="px-2 py-1 text-center border font-mono">{jornada[d].intervalo || '-'}</td>)}
                                        </tr>
                                        <tr>
                                          <td className="px-2 py-1 font-semibold border">Saída</td>
                                          {diasAtivos.map(d => <td key={d} className="px-2 py-1 text-center border font-mono">{jornada[d].saida || '-'}</td>)}
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                );
                              }
                            } catch { /* not JSON */ }
                            return <span><strong>Jornada:</strong> {jt}</span>;
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Inconsistências pendentes deste funcionário */}
                {(() => {
                  const empIncons = (employeeDetail.data?.inconsistencies || []).filter((i: any) => i.status === "pendente");
                  if (empIncons.length === 0) return null;
                  return (
                    <Card className="border-amber-300 bg-amber-50/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
                          <AlertTriangle className="h-4 w-4" /> {empIncons.length} Inconsistência{empIncons.length > 1 ? "s" : ""} Pendente{empIncons.length > 1 ? "s" : ""}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          {empIncons.map((inc: any) => (
                            <div key={inc.id} className="flex items-center justify-between bg-white rounded-lg border p-2">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-mono">{inc.data ? new Date(inc.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</span>
                                <Badge variant="outline" className="text-xs">{inc.tipoInconsistencia?.replace("_", " ")}</Badge>
                                <span className="text-xs text-muted-foreground">{inc.descricao}</span>
                              </div>
                              {!isConsolidado && (
                                <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => {
                                  setSelectedInconsistency({
                                    inconsistency: inc,
                                    employeeName: employeeDetail.data?.employee?.nomeCompleto || "Colaborador",
                                  });
                                  setResolveData({ status: "justificado", justificativa: "" });
                                  setShowResolveDialog(true);
                                }}>
                                  <CheckCircle className="h-3.5 w-3.5" /> Resolver
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

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
                          const isOverlap = c.hasOverlap;
                          const isDuplCard = c.isSameObraDuplicate;
                          return (
                            <div key={idx} className={`bg-white border rounded-lg overflow-hidden transition-all ${isExpanded ? (isOverlap ? "border-red-400 shadow-md" : isDuplCard ? "border-purple-400 shadow-md" : "border-green-400 shadow-md") : (isOverlap ? "border-red-200" : isDuplCard ? "border-purple-200" : "border-green-200")} ${isOverlap ? "border-l-4 border-l-red-500" : isDuplCard ? "border-l-4 border-l-purple-500" : "border-l-4 border-l-green-500"}`}>
                              <button
                                className={`w-full p-3 flex items-center justify-between transition-colors text-left ${isOverlap ? "hover:bg-red-50/50" : isDuplCard ? "hover:bg-purple-50/50" : "hover:bg-green-50/50"}`}
                                onClick={() => { setExpandedConflict(isExpanded ? null : conflictKey); setConflictJustificativa(""); }}
                              >
                                <div>
                                  <p className="text-sm font-medium">
                                    {new Date(c.data + "T12:00:00").toLocaleDateString("pt-BR")} ({dayOfWeek(c.data)})
                                  </p>
                                  <div className="flex gap-1 mt-1 flex-wrap">
                                    {c.obras.map((o: any, i: number) => (
                                      <Badge key={i} variant="outline" className={`text-xs ${isOverlap ? "border-red-300 text-red-700" : "border-green-300 text-green-700"}`}>
                                        {o.obraNome || "Sem Obra"} — {o.horasTrabalhadas || "0:00"}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {isOverlap ? (
                                    <Badge className="bg-red-600 text-white text-xs"><XCircle className="h-3 w-3 mr-1" /> Sobreposição</Badge>
                                  ) : isDuplCard ? (
                                    <Badge className="bg-purple-600 text-white text-xs"><Copy className="h-3 w-3 mr-1" /> Batida Duplicada</Badge>
                                  ) : c.transferAnalysis && c.transferAnalysis.length > 0 ? (
                                    <Badge className="bg-blue-600 text-white text-xs"><ArrowRightLeft className="h-3 w-3 mr-1" /> Transferência</Badge>
                                  ) : (
                                    <Badge className="bg-green-600 text-white text-xs"><CheckCircle className="h-3 w-3 mr-1" /> Desloc. Válido</Badge>
                                  )}
                                  <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""} ${isOverlap ? "text-red-600" : isDuplCard ? "text-purple-600" : "text-green-600"}`} />
                                </div>
                              </button>
                              {isExpanded && (
                                <div className={`border-t p-4 space-y-3 ${isOverlap ? "border-red-200 bg-red-50/30" : isDuplCard ? "border-purple-200 bg-purple-50/30" : "border-green-200 bg-green-50/30"}`}>
                                  {isOverlap ? (
                                    <div className="p-2 bg-red-100 border border-red-300 rounded-lg flex items-center gap-2">
                                      <AlertCircle className="h-4 w-4 text-red-700 flex-shrink-0" />
                                      <p className="text-xs text-red-800 font-bold">
                                        SOBREPOSIÇÃO DE HORÁRIOS: O funcionário não pode estar em 2 obras ao mesmo tempo. Escolha qual obra manter.
                                      </p>
                                    </div>
                                  ) : isDuplCard ? (
                                    <div className="p-3 bg-purple-50 border border-purple-300 rounded-lg">
                                      <p className="text-xs text-purple-900 font-bold mb-1 flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Batida duplicada na mesma obra</p>
                                      <p className="text-[11px] text-purple-700 mb-2">Existem {c.records?.length || 2} registros para o mesmo funcionário, obra e dia. Isso ocorre quando o arquivo DIXI foi importado mais de uma vez ou quando foi lançado manualmente em cima de um registro existente. Mantenha apenas o correto e exclua a duplicata.</p>
                                      <div className="flex flex-wrap gap-2">
                                        {(c.records || []).map((o: any, oi: number) => (
                                          <Button key={`del-dup2-${oi}`} size="sm" variant="ghost" className="gap-1.5 text-xs text-red-600 hover:bg-red-50 border border-red-200"
                                            onClick={() => {
                                              if (confirm(`Excluir o ${oi === 0 ? "1º" : "2º"} registro (Entrada: ${o.entrada1 || "--:--"}, ${o.horasTrabalhadas || "0:00"}) para este funcionário neste dia?`)) {
                                                resolveConflitoMut.mutate({ companyId, companyIds, employeeId: c.employeeId, data: c.data, acao: "excluir_por_id", recordId: o.id, justificativa: `Batida duplicada removida (entrada: ${o.entrada1})` });
                                              }
                                            }}
                                            disabled={resolveConflitoMut.isPending}>
                                            <Trash2 className="h-3 w-3" /> Excluir {oi === 0 ? "1º" : "2º"} ({o.horasTrabalhadas || "0:00"})
                                          </Button>
                                        ))}
                                      </div>
                                    </div>
                                  ) : c.transferAnalysis && c.transferAnalysis.length > 0 ? (
                                    <div className="p-3 bg-blue-50 border border-blue-300 rounded-lg space-y-2">
                                      <div className="flex items-start gap-2">
                                        <ArrowRightLeft className="h-4 w-4 text-blue-700 flex-shrink-0 mt-0.5" />
                                        <div>
                                          <p className="text-xs text-blue-800 font-bold">TRANSFERÊNCIA DE OBRA DETECTADA</p>
                                          <p className="text-xs text-blue-700 mt-0.5">O funcionário bateu ponto em horários diferentes em obras distintas.</p>
                                        </div>
                                      </div>
                                      {c.transferAnalysis.map((t: any, ti: number) => (
                                        <div key={ti} className="p-2 bg-white border border-blue-200 rounded-lg">
                                          <div className="flex items-center gap-2 text-xs flex-wrap">
                                            <span className="font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded">{t.fromObraNome} ({t.fromEntrada})</span>
                                            <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
                                            <span className="font-semibold text-green-800 bg-green-50 px-2 py-0.5 rounded">{t.toObraNome} ({t.toEntrada})</span>
                                            <Badge className="bg-blue-100 text-blue-700 text-[10px] ml-auto">Gap: {t.gapMinutes}min</Badge>
                                          </div>
                                          <div className="mt-1.5 p-1.5 bg-amber-50 border border-amber-200 rounded flex items-center gap-1.5">
                                            <Info className="h-3 w-3 text-amber-600 flex-shrink-0" />
                                            <p className="text-[10px] text-amber-800">
                                              <strong>Sugestão:</strong> Registre saída às <strong className="font-mono">{t.suggestedExit}</strong> na obra <strong>{t.fromObraNome}</strong>.
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-green-800 font-medium">Horários não se sobrepõem — deslocamento real válido. Escolha como resolver:</p>
                                  )}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {c.obras.map((o: any, i: number) => (
                                      <button
                                        key={i}
                                        className="border-2 border-blue-200 bg-blue-50 rounded-lg p-3 text-left hover:border-blue-400 hover:bg-blue-100 transition-all group"
                                        onClick={() => {
                                          if (!o.obraId) return toast.error("Obra sem ID");
                                          if (confirm(`Manter APENAS na obra "${o.obraNome}" e remover registros das outras obras?`)) {
                                            resolveConflitoMut.mutate({ companyId, companyIds, employeeId: c.employeeId, data: c.data,
                                              acao: "manter_obra", obraIdManter: o.obraId,
                                              justificativa: conflictJustificativa || `Mantido na obra ${o.obraNome}${isOverlap ? " (sobreposição resolvida)" : ""}`,
                                            });
                                          }
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
                                  {!isOverlap && !isDuplCard && (
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex-1 border-green-300 text-green-700 hover:bg-green-50 hover:border-green-400"
                                        onClick={() => {
                                          resolveConflitoMut.mutate({ companyId, companyIds, employeeId: c.employeeId, data: c.data,
                                            acao: "confirmar_deslocamento",
                                            justificativa: conflictJustificativa || "Deslocamento real entre obras confirmado",
                                          });
                                        }}
                                        disabled={resolveConflitoMut.isPending}
                                      >
                                        <CheckCircle className="h-4 w-4 mr-1" /> Confirmar Deslocamento Real (Rateio Proporcional)
                                      </Button>
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    {c.obras.map((o: any, i: number) => (
                                      <Button
                                        key={i}
                                        variant="outline"
                                        size="sm"
                                        className="flex-1 border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400"
                                        onClick={() => {
                                          if (!o.obraId) return toast.error("Obra sem ID");
                                          resolveConflitoMut.mutate({ companyId, companyIds, employeeId: c.employeeId, data: c.data,
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
                                <th className="p-2 font-medium text-center">Saldo</th>
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
                                    <td className="p-2 text-center font-mono">
                                      {(() => {
                                        const parseHM3 = (s: string) => { if (!s || s === "-" || s === "0:00") return 0; const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
                                        const trab3 = parseHM3(rec.horasTrabalhadas);
                                        const extra3 = parseHM3(rec.horasExtras);
                                        const atraso3 = parseHM3(rec.atrasos);
                                        if (extra3 > 0) return <span className="text-green-600 font-semibold">+{Math.floor(extra3/60)}:{String(extra3%60).padStart(2,'0')}</span>;
                                        if (atraso3 > 0) return <span className="text-red-600 font-semibold">-{Math.floor(atraso3/60)}:{String(atraso3%60).padStart(2,'0')}</span>;
                                        if (trab3 === 0 && !rec.entrada1) return <span className="text-muted-foreground">-</span>;
                                        return <span className="text-muted-foreground">0:00</span>;
                                      })()}
                                    </td>
                                    <td className="p-2 text-center">
                                      {rec.ajusteManual ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <Badge variant="outline" className="text-xs text-purple-600 border-purple-300"><PenLine className="h-3 w-3 mr-1" /> Manual</Badge>
                                          {rec.ajustadoPor && <span className="text-[9px] text-purple-500 font-medium truncate max-w-[120px]" title={rec.ajustadoPor}>{rec.ajustadoPor.split(" ").slice(0,2).join(" ")}</span>}
                                        </div>
                                      ) : (
                                        <Badge variant="outline" className="text-xs">DIXI</Badge>
                                      )}
                                    </td>
                                    <td className="p-2 text-center">
                                      {rec.tipoDia === "feriado" ? (
                                        <Badge className="text-xs bg-orange-500 text-white">Feriado</Badge>
                                      ) : rec.tipoDia === "atestado" ? (
                                        <Badge className="text-xs bg-purple-600 text-white">Atestado</Badge>
                                      ) : rec.tipoDia === "bh" ? (
                                        <Badge className="text-xs bg-blue-600 text-white">BH</Badge>
                                      ) : hasConflict ? (
                                        <Badge className="text-xs bg-orange-600 text-white"><AlertCircle className="h-3 w-3 mr-1" /> Conflito</Badge>
                                      ) : hasIncons ? (
                                        <Badge
                                          variant="destructive"
                                          className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
                                          onClick={() => {
                                            if (isDateLocked(rec.data)) return;
                                            setQuickFixRec(rec);
                                            setQuickFixData({
                                              entrada1: rec.entrada1 || "",
                                              saida1: rec.saida1 || "",
                                              entrada2: rec.entrada2 || "",
                                              saida2: rec.saida2 || "",
                                              motivoAjuste: "",
                                              descricaoMotivo: "",
                                            });
                                            setQuickFixOpen(true);
                                          }}
                                        >
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
                            {obra.sns && obra.sns.length > 0 ? (
                              <span className="text-xs text-teal-600 flex items-center gap-1">
                                <Wifi className="h-3 w-3" /> SN: {obra.sns.join(", ")}
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
                                <button className="font-medium text-blue-700 hover:underline text-left" onClick={() => openPontoDetalhe(f.employeeId)}>
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

        {/* ===== NÃO IDENTIFICADOS VIEW ===== */}
        {viewMode === "nao_identificados" && (
          <Card>
            <CardHeader className="pb-3 bg-purple-50 rounded-t-lg">
              <CardTitle className="text-base flex items-center gap-2 text-purple-800">
                <UserCheck className="h-5 w-5" />
                Funcionários Não Identificados — {formatMesAno(mesAno)}
              </CardTitle>
              <p className="text-xs text-purple-600 mt-1">
                Esses nomes foram encontrados nos arquivos DIXI mas não correspondem a nenhum colaborador cadastrado.
                Vincule cada nome ao colaborador correto para importar os registros de ponto.
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              {unmatchedData.isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : !unmatchedData.data || unmatchedData.data.totalNomes === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
                  <p className="font-medium">Todos os funcionários foram identificados!</p>
                  <p className="text-sm text-muted-foreground mt-1">Nenhum registro pendente de vinculação.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm bg-purple-50 p-3 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-purple-600" />
                    <span><strong>{unmatchedData.data.totalNomes}</strong> nome(s) não identificado(s) com <strong>{unmatchedData.data.pendentes}</strong> registro(s) pendentes</span>
                  </div>
                  {unmatchedData.data.grouped.filter((g: any) => g.status === 'pendente').map((group: any) => (
                    <div key={group.dixiName} className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-50 p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-purple-100 flex items-center justify-center">
                            <UserCheck className="h-4 w-4 text-purple-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{group.dixiName}</p>
                            <p className="text-xs text-muted-foreground">
                              {group.obraNome && <span>Relógio: {group.obraNome}</span>}
                              {group.dixiId && <span className="ml-2">• ID DIXI: {group.dixiId}</span>}
                              <span className="ml-2">• {group.totalDias} dia(s) de registro</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {linkingName === group.dixiName ? (
                            <Button variant="ghost" size="sm" onClick={() => { setLinkingName(null); setLinkSearchTerm(""); setLinkSelectedEmpId(null); }}>
                              <XCircle className="h-4 w-4 mr-1" /> Cancelar
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white" onClick={() => { setLinkingName(group.dixiName); setLinkSearchTerm(""); setLinkSelectedEmpId(null); }}>
                                <UserCheck className="h-4 w-4 mr-1" /> Vincular
                              </Button>
                              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => {
                                if (confirm(`Descartar todos os ${group.totalDias} registros de "${group.dixiName}"?`)) {
                                  discardUnmatchedMut.mutate({ companyId, companyIds, dixiName: group.dixiName, mesReferencia: mesAno });
                                }
                              }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      {linkingName === group.dixiName && (
                        <div className="p-3 bg-purple-50/50 border-t space-y-3">
                          <p className="text-sm font-medium text-purple-800">Selecione o colaborador correspondente a "{group.dixiName}":</p>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Buscar por nome ou CPF..." value={linkSearchTerm}
                              onChange={e => setLinkSearchTerm(e.target.value)}
                              className="pl-9" />
                          </div>
                          <div className="max-h-48 overflow-y-auto border rounded-lg bg-white">
                            {(employeesList.data || []).filter((emp: any) => {
                              if (!linkSearchTerm) return true;
                              const t = linkSearchTerm.toLowerCase();
                              return removeAccents(emp.nomeCompleto || '').includes(t) || emp.cpf?.includes(t);
                            }).slice(0, 20).map((emp: any) => (
                              <div key={emp.id}
                                className={`p-2 flex items-center justify-between cursor-pointer hover:bg-purple-50 border-b last:border-0 ${linkSelectedEmpId === emp.id ? 'bg-purple-100 ring-1 ring-purple-400' : ''}`}
                                onClick={() => setLinkSelectedEmpId(emp.id)}>
                                <div>
                                  <p className="text-sm font-medium">{emp.nomeCompleto}</p>
                                  <p className="text-xs text-muted-foreground">{formatCPF(emp.cpf)} • {emp.funcao || 'Sem função'}</p>
                                </div>
                                {linkSelectedEmpId === emp.id && <CheckCircle className="h-4 w-4 text-purple-600" />}
                              </div>
                            ))}
                            {(employeesList.data || []).filter((emp: any) => {
                              if (!linkSearchTerm) return true;
                              const t = linkSearchTerm.toLowerCase();
                              return removeAccents(emp.nomeCompleto || '').includes(t) || emp.cpf?.includes(t);
                            }).length === 0 && (
                              <div className="p-4 text-center text-sm text-muted-foreground">Nenhum colaborador encontrado</div>
                            )}
                          </div>
                          {linkSelectedEmpId && (
                            <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white" onClick={() => {
                              linkUnmatchedMut.mutate({ companyId, companyIds, dixiName: group.dixiName, employeeId: linkSelectedEmpId, mesReferencia: mesAno });
                            }} disabled={linkUnmatchedMut.isPending}>
                              {linkUnmatchedMut.isPending ? "Vinculando..." : `Vincular ${group.totalDias} registro(s) ao colaborador selecionado`}
                            </Button>
                          )}
                        </div>
                      )}
                      {/* Preview dos registros */}
                      <div className="px-3 pb-2">
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground py-1">Ver {group.totalDias} registro(s)</summary>
                          <div className="mt-1 overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead><tr className="border-b bg-gray-50">
                                <th className="p-1 text-left">Data</th>
                                <th className="p-1 text-center">Entrada</th>
                                <th className="p-1 text-center">Saída Int.</th>
                                <th className="p-1 text-center">Retorno</th>
                                <th className="p-1 text-center">Saída</th>
                              </tr></thead>
                              <tbody>
                                {group.records.slice(0, 10).map((r: any, i: number) => (
                                  <tr key={i} className="border-b">
                                    <td className="p-1">{r.data ? new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'short' }) : '-'}</td>
                                    <td className="p-1 text-center font-mono">{r.entrada1 || '-'}</td>
                                    <td className="p-1 text-center font-mono">{r.saida1 || '-'}</td>
                                    <td className="p-1 text-center font-mono">{r.entrada2 || '-'}</td>
                                    <td className="p-1 text-center font-mono">{r.saida2 || '-'}</td>
                                  </tr>
                                ))}
                                {group.totalDias > 10 && (
                                  <tr><td colSpan={5} className="p-1 text-center text-muted-foreground">... e mais {group.totalDias - 10} registros</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ===== MEMÓRIA DIXI VIEW ===== */}
        {viewMode === "memoria_dixi" && (
          <Card>
            <CardHeader className="pb-3 bg-indigo-50 rounded-t-lg">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2 text-indigo-800">
                    <Zap className="h-5 w-5" />
                    Memória de Vinculação DIXI
                  </CardTitle>
                  <p className="text-xs text-indigo-600 mt-1">
                    Quando você vincula um nome não identificado a um colaborador, o sistema memoriza essa associação.
                    Nos próximos uploads, o matching será automático.
                  </p>
                </div>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => setAddMappingOpen(true)}>
                  + Adicionar Manual
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {dixiMappings.isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : !dixiMappings.data || dixiMappings.data.length === 0 ? (
                <div className="text-center py-8">
                  <Zap className="h-10 w-10 text-indigo-300 mx-auto mb-3" />
                  <p className="font-medium">Nenhuma vinculação memorizada ainda</p>
                  <p className="text-sm text-muted-foreground mt-1">Vincule nomes na aba "Não Identificados" ou adicione manualmente.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Buscar por nome DIXI ou colaborador..." value={memSearchTerm}
                        onChange={e => setMemSearchTerm(e.target.value)} className="pl-9" />
                    </div>
                    <Badge variant="outline" className="text-indigo-700 border-indigo-300">
                      {dixiMappings.data.length} vinculação(ões)
                    </Badge>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-indigo-50/50 border-b">
                        <th className="p-2.5 text-left font-medium text-indigo-800">Nome no DIXI</th>
                        <th className="p-2.5 text-left font-medium text-indigo-800">ID DIXI</th>
                        <th className="p-2.5 text-left font-medium text-indigo-800">Colaborador Vinculado</th>
                        <th className="p-2.5 text-left font-medium text-indigo-800">Origem</th>
                        <th className="p-2.5 text-left font-medium text-indigo-800">Criado por</th>
                        <th className="p-2.5 text-center font-medium text-indigo-800">Ações</th>
                      </tr></thead>
                      <tbody>
                        {(dixiMappings.data || []).filter((m: any) => {
                          if (!memSearchTerm) return true;
                          const t = memSearchTerm.toLowerCase();
                          return removeAccents(m.dixiName || '').includes(t) || removeAccents(m.employeeName || '').includes(t);
                        }).map((m: any) => (
                          <tr key={m.id} className="border-b hover:bg-muted/30">
                            <td className="p-2.5 font-medium">{m.dixiName}</td>
                            <td className="p-2.5 text-muted-foreground font-mono text-xs">{m.dixiId || '—'}</td>
                            <td className="p-2.5">
                              <span className="text-indigo-700 font-medium">{m.employeeName}</span>
                            </td>
                            <td className="p-2.5">
                              <Badge variant="outline" className={m.source === 'import_link' ? 'text-green-700 border-green-300 bg-green-50' : 'text-blue-700 border-blue-300 bg-blue-50'}>
                                {m.source === 'import_link' ? 'Auto (vinculação)' : 'Manual'}
                              </Badge>
                            </td>
                            <td className="p-2.5 text-xs text-muted-foreground">{m.createdBy || '—'}</td>
                            <td className="p-2.5 text-center">
                              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 h-7 w-7 p-0"
                                onClick={() => { if (confirm(`Remover vinculação "${m.dixiName}" → "${m.employeeName}"?`)) deleteDixiMappingMut.mutate({ id: m.id }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {/* Dialog para adicionar mapeamento manual */}
              <Dialog open={addMappingOpen} onOpenChange={setAddMappingOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Adicionar Vinculação Manual</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Nome no DIXI (exatamente como aparece no relógio)</Label>
                      <Input value={newMappingDixiName} onChange={e => setNewMappingDixiName(e.target.value)}
                        placeholder="Ex: JOSE DA SILVA" />
                    </div>
                    <div>
                      <Label>Colaborador correspondente</Label>
                      <Select value={String(newMappingEmpId || "")} onValueChange={v => setNewMappingEmpId(parseInt(v))}>
                        <SelectTrigger><SelectValue placeholder="Selecione o colaborador..." /></SelectTrigger>
                        <SelectContent>
                          {(employeesList.data || []).map((e: any) => (
                            <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddMappingOpen(false)}>Cancelar</Button>
                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" disabled={!newMappingDixiName || !newMappingEmpId || addDixiMappingMut.isPending}
                      onClick={() => {
                        const emp = (employeesList.data || []).find((e: any) => e.id === newMappingEmpId);
                        if (!emp) return;
                        addDixiMappingMut.mutate({ companyId, companyIds, dixiName: newMappingDixiName.trim(), employeeId: newMappingEmpId!, employeeName: emp.nomeCompleto });
                      }}>
                      {addDixiMappingMut.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        )}

        {/* ===== SIMULADOR HORISTAS VIEW ===== */}
        {viewMode === "simulador_horistas" && (
          <Card>
            <CardHeader className="pb-3 bg-emerald-50 rounded-t-lg">
              <CardTitle className="text-base flex items-center gap-2 text-emerald-800">
                <ListChecks className="h-5 w-5" />
                Simulador de Folha — CLT (Horistas)
              </CardTitle>
              <p className="text-xs text-emerald-600 mt-1">
                Simule o custo mensal dos colaboradores CLT com base nos dias úteis do mês e valor/hora.
              </p>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex items-end gap-4 mb-4 bg-emerald-50/50 p-3 rounded-lg border border-emerald-200">
                <div className="flex-1 max-w-[160px]">
                  <Label className="text-xs font-medium text-emerald-800">Dias Úteis no Mês</Label>
                  <Input type="number" min={1} max={31} value={simDiasUteis}
                    onChange={e => setSimDiasUteis(Math.max(1, Math.min(31, parseInt(e.target.value) || 22)))}
                    className="mt-1" />
                </div>
                <div className="flex-1 max-w-[160px]">
                  <Label className="text-xs font-medium text-emerald-800">Horas por Dia</Label>
                  <Input type="number" min={1} max={24} value={simHorasDia}
                    onChange={e => setSimHorasDia(Math.max(1, Math.min(24, parseInt(e.target.value) || 8)))}
                    className="mt-1" />
                </div>
                <div className="text-sm text-emerald-700">
                  <strong>{simDiasUteis * simHorasDia}h</strong> totais no mês
                </div>
              </div>

              {simuladorData.isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Calculando simulação...</div>
              ) : !simuladorData.data || simuladorData.data.totalFuncionarios === 0 ? (
                <div className="text-center py-8">
                  <ListChecks className="h-10 w-10 text-emerald-300 mx-auto mb-3" />
                  <p className="font-medium">Nenhum colaborador CLT com valor/hora encontrado</p>
                  <p className="text-sm text-muted-foreground mt-1">Cadastre colaboradores CLT com valor da hora preenchido.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-emerald-700">{fmtNum(simuladorData.data.totalFuncionarios)}</p>
                      <p className="text-xs text-emerald-600">CLT com Valor/Hora</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-emerald-700">{simuladorData.data.horasTotaisMes}h</p>
                      <p className="text-xs text-emerald-600">Horas/Mês por Pessoa</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-emerald-700">
                        {simuladorData.data.totalFolha.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                      <p className="text-xs text-emerald-600">Total Previsto da Folha</p>
                    </div>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-emerald-50/50 border-b">
                        <th className="p-2.5 text-left font-medium">Cód</th>
                        <th className="p-2.5 text-left font-medium">Colaborador</th>
                        <th className="p-2.5 text-left font-medium">Função</th>
                        <th className="p-2.5 text-right font-medium">Valor/Hora</th>
                        <th className="p-2.5 text-right font-medium">Horas Mês</th>
                        <th className="p-2.5 text-right font-medium text-emerald-700">Salário Previsto</th>
                      </tr></thead>
                      <tbody>
                        {simuladorData.data.funcionarios.map((f: any) => (
                          <tr key={f.id} className="border-b hover:bg-muted/30">
                            <td className="p-2.5 font-mono text-xs text-muted-foreground">{f.codigoInterno || '—'}</td>
                            <td className="p-2.5 font-medium">{f.nomeCompleto}</td>
                            <td className="p-2.5 text-muted-foreground">{f.funcao || '—'}</td>
                            <td className="p-2.5 text-right font-mono">
                              <span className="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded text-xs font-bold">
                                R$ {f.valorHora}
                              </span>
                            </td>
                            <td className="p-2.5 text-right font-mono">{f.horasMes}h</td>
                            <td className="p-2.5 text-right font-bold text-emerald-700">
                              {f.salarioPrevisto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-emerald-50 font-bold">
                          <td colSpan={5} className="p-2.5 text-right">TOTAL DA FOLHA (HORISTAS):</td>
                          <td className="p-2.5 text-right text-emerald-700 text-base">
                            {simuladorData.data.totalFolha.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ===== DESCONTOS CLT VIEW ===== */}
        {viewMode === "descontos_clt" && (
          <DescontosCLTPanel companyId={companyId} companyIds={companyIds} mesAno={mesAno} isMaster={isMaster} />
        )}

        {/* ===== UPLOAD DIALOG (FULL SCREEN) ===== */}
        <FullScreenDialog open={showUploadDialog} onClose={() => setShowUploadDialog(false)} title="Upload de Arquivos DIXI" subtitle={`Competência: ${formatMesAno(mesAno)}`} icon={<Upload className="h-5 w-5 text-white" />}>
          <div className="w-full">
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
                      <span className="flex-1 truncate">{fmtNum(f.name)}</span>
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
              {/* ===== PERÍODO A CONSIDERAR ===== */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <CalendarDays className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Período a considerar <span className="text-red-500">*</span></p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Somente registros <strong>dentro deste intervalo</strong> serão importados. Batidas fora do período serão ignoradas (ex: registros do próximo fechamento).
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="flex flex-col gap-1 min-w-[160px]">
                    <Label className="text-xs text-amber-800 font-medium">De</Label>
                    <input
                      type="date"
                      value={uploadPeriodoDe}
                      onChange={e => setUploadPeriodoDe(e.target.value)}
                      className="border border-amber-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="flex flex-col gap-1 min-w-[160px]">
                    <Label className="text-xs text-amber-800 font-medium">Até</Label>
                    <input
                      type="date"
                      value={uploadPeriodoAte}
                      onChange={e => setUploadPeriodoAte(e.target.value)}
                      className="border border-amber-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
                {uploadPeriodoDe && uploadPeriodoAte && uploadPeriodoDe <= uploadPeriodoAte && (
                  <p className="text-xs text-amber-700 font-medium">
                    ✓ Serão considerados apenas registros de {new Date(uploadPeriodoDe + "T12:00:00").toLocaleDateString("pt-BR")} até {new Date(uploadPeriodoAte + "T12:00:00").toLocaleDateString("pt-BR")}.
                  </p>
                )}
              </div>

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
                        <p className="text-xs"><strong>SN:</strong> {r.deviceSerial || "Não identificado"}{r.valid && <span className="text-green-700"> → {r.obraNome}</span>}{r.isSharedSn && <span className="text-blue-600 ml-1">(compartilhado com {r.sharedSnObras?.length} obras)</span>}</p>
                        {r.mesesDetectados.length > 0 && (
                          <p className="text-xs"><strong>Competência(s):</strong> {r.mesesDetectados.map((m: string) => formatMesAno(m)).join(", ")}</p>
                        )}
                        {r.mesesDetectados.length > 1 && r.registrosPorMes && (
                          <div className="mt-1.5 space-y-1">
                            <p className="text-xs text-amber-700 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Arquivo contém <strong>{r.mesesDetectados.length} meses</strong>. Distribuição automática.
                            </p>
                            <div className="flex flex-wrap gap-1.5 ml-0.5">
                              {r.mesesDetectados.map((m: string) => (
                                <span key={m} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 border border-amber-200 rounded text-[11px] text-amber-800 font-medium">
                                  {formatMesAno(m)}: <strong>{r.registrosPorMes[m] || 0}</strong> reg.
                                </span>
                              ))}
                            </div>
                          </div>
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
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Fechar</Button>
              {!uploadResult && (
                <Button
                  onClick={handleUpload}
                  disabled={
                    uploading || previewLoading || uploadFiles.length === 0 || validating ||
                    (validationResult && !validationResult.allValid) ||
                    !uploadPeriodoDe || !uploadPeriodoAte || uploadPeriodoDe > uploadPeriodoAte
                  }
                  className="bg-[#1B2A4A] hover:bg-[#243660]"
                  title={!uploadPeriodoDe || !uploadPeriodoAte ? "Informe o período (De e Até) antes de importar" : undefined}
                >
                  {uploading ? "Processando..." : previewLoading ? "Analisando arquivo..." : "Importar"}
                </Button>
              )}
            </div>
          </div>
        </FullScreenDialog>

        {/* ===== SELECTIVE UPLOAD DIALOG ===== */}
        <FullScreenDialog open={showSelectiveDialog} onClose={() => setShowSelectiveDialog(false)} title={previewData?.isSharedSn ? "Relógio Compartilhado — Revisão" : "Dados já Existentes"} subtitle={previewData ? `${previewData.isSharedSn ? previewData.sharedSnObras?.map((o: any) => o.obraNome).join(" + ") : previewData.obraNome} — SN: ${previewData.deviceSerial}` : ""} icon={<ListChecks className="h-5 w-5 text-white" />} headerColor={previewData?.isSharedSn ? "bg-gradient-to-r from-blue-700 to-blue-500" : "bg-gradient-to-r from-amber-700 to-amber-500"}>
          <div className="w-full max-w-4xl mx-auto">
            {previewData && !uploading && !uploadResult && (
              <div className="space-y-4">
                {previewData.isSharedSn && previewData.sharedSnObras && previewData.sharedSnObras.length > 1 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Building2 className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-blue-900">Relógio compartilhado entre {previewData.sharedSnObras.length} obras</p>
                        <p className="text-sm text-blue-700 mt-1">
                          O SN <strong className="font-mono">{previewData.deviceSerial}</strong> está vinculado a:
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {previewData.sharedSnObras.map((o: any) => (
                            <span key={o.obraId} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full">
                              <Building2 className="h-3 w-3" />{o.obraNome}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-blue-600 mt-2">
                          Os registros serão distribuídos automaticamente para a obra de cada funcionário com base na alocação atual.
                          Funcionários sem alocação definida ou alocados em múltiplas obras não serão importados — uma inconsistência será registrada para análise.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {previewData.hasExistingData && (() => {
                  const jaImportados = previewData.employees.filter((e: any) => e.jaImportado);
                  const novos = previewData.employees.filter((e: any) => !e.jaImportado);
                  return (
                <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                  <button type="button" className="w-full p-4 text-left hover:bg-amber-100/50 transition-colors"
                    onClick={() => setShowExistingEmployees(!showExistingEmployees)}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-amber-900">Já existem registros DIXI importados para esta obra/período</p>
                        <p className="text-sm text-amber-700 mt-1">
                          Competência: <strong>{previewData.meses.map((m: string) => formatMesAno(m)).join(", ")}</strong> —
                          {" "}{jaImportados.length} de {previewData.employees.length} funcionários já possuem dados.
                        </p>
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          {showExistingEmployees ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {showExistingEmployees ? "Ocultar detalhes" : "Clique para ver detalhes dos funcionários"}
                        </p>
                      </div>
                    </div>
                  </button>
                  {showExistingEmployees && (
                    <div className="px-4 pb-4 border-t border-amber-200">
                      {jaImportados.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-amber-800 mb-1.5">
                            Funcionários com dados já importados ({jaImportados.length}):
                          </p>
                          <div className="max-h-[300px] overflow-y-auto space-y-1">
                            {jaImportados.sort((a: any, b: any) => a.nomeCompleto.localeCompare(b.nomeCompleto)).map((emp: any) => {
                              const isExpanded = expandedEmpIds.has(emp.employeeId);
                              const records = emp.registrosDetalhe || [];
                              return (
                              <div key={emp.employeeId} className="rounded-lg overflow-hidden">
                                <button type="button" className="w-full flex items-center gap-2 text-xs bg-amber-100/60 hover:bg-amber-100 transition-colors px-3 py-1.5 text-left"
                                  onClick={() => setExpandedEmpIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(emp.employeeId)) next.delete(emp.employeeId);
                                    else next.add(emp.employeeId);
                                    return next;
                                  })}>
                                  {isExpanded ? <ChevronUp className="h-3 w-3 text-amber-600 shrink-0" /> : <ChevronDown className="h-3 w-3 text-amber-600 shrink-0" />}
                                  <span className="font-medium text-amber-900 flex-1 truncate">{emp.nomeCompleto}</span>
                                  <span className="text-amber-600 shrink-0">{emp.funcao || "—"}</span>
                                  <span className="text-amber-500 shrink-0">{emp.registrosExistentes} reg.</span>
                                  <span className="text-amber-500 shrink-0">{emp.meses.map((m: string) => formatMesAno(m)).join(", ")}</span>
                                </button>
                                {isExpanded && records.length > 0 && (
                                  <div className="bg-white border border-amber-200 border-t-0 rounded-b-lg">
                                    <table className="w-full text-[11px]">
                                      <thead>
                                        <tr className="bg-amber-50 text-amber-700">
                                          <th className="px-2 py-1 text-left font-medium">Data</th>
                                          <th className="px-2 py-1 text-center font-medium">Entrada 1</th>
                                          <th className="px-2 py-1 text-center font-medium">Saída 1</th>
                                          <th className="px-2 py-1 text-center font-medium">Entrada 2</th>
                                          <th className="px-2 py-1 text-center font-medium">Saída 2</th>
                                          <th className="px-2 py-1 text-center font-medium">Trab.</th>
                                          <th className="px-2 py-1 text-center font-medium">HE</th>
                                          <th className="px-2 py-1 text-center font-medium">Falta</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {records.map((r: any, idx: number) => (
                                          <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-amber-50/30"}>
                                            <td className="px-2 py-0.5 text-gray-700">{r.data?.split('-').reverse().join('/')}</td>
                                            <td className="px-2 py-0.5 text-center text-gray-600">{r.entrada1 || "—"}</td>
                                            <td className="px-2 py-0.5 text-center text-gray-600">{r.saida1 || "—"}</td>
                                            <td className="px-2 py-0.5 text-center text-gray-600">{r.entrada2 || "—"}</td>
                                            <td className="px-2 py-0.5 text-center text-gray-600">{r.saida2 || "—"}</td>
                                            <td className="px-2 py-0.5 text-center font-medium text-gray-800">{r.horasTrabalhadas}</td>
                                            <td className="px-2 py-0.5 text-center text-blue-600">{r.horasExtras !== "0:00" ? r.horasExtras : "—"}</td>
                                            <td className="px-2 py-0.5 text-center">{r.faltas === "1" ? <span className="text-red-600 font-bold">SIM</span> : "—"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {novos.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-green-700 mb-1.5">
                            Funcionários novos sem dados anteriores ({novos.length}):
                          </p>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {novos.sort((a: any, b: any) => a.nomeCompleto.localeCompare(b.nomeCompleto)).map((emp: any) => (
                              <div key={emp.employeeId} className="flex items-center gap-2 text-xs bg-green-50 rounded-lg px-3 py-1.5">
                                <Plus className="h-3.5 w-3.5 text-green-600 shrink-0" />
                                <span className="font-medium text-green-900 flex-1 truncate">{emp.nomeCompleto}</span>
                                <span className="text-green-600 shrink-0">{emp.funcao || "—"}</span>
                                <span className="text-green-500 shrink-0">{emp.totalRegistros} batidas</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                  );
                })()}

                {previewData.apontamentosCampo && previewData.apontamentosCampo.length > 0 && (
                  <div className="bg-blue-50 border border-blue-300 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <ClipboardList className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-blue-900">Apontamentos de Campo neste período</p>
                        <p className="text-sm text-blue-700 mt-1">
                          Existem <strong>{previewData.apontamentosCampo.length}</strong> apontamento(s) de campo registrados para funcionários deste arquivo.
                          Os registros manuais serão <strong>preservados</strong> e o DIXI não sobrescreverá esses dias.
                        </p>
                        <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                          {previewData.apontamentosCampo.map((ap: any, idx: number) => (
                            <div key={idx} className="text-xs bg-blue-100/60 rounded-lg px-3 py-2 overflow-hidden">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-blue-900">{ap.nomeCompleto}</span>
                                <span className="text-blue-600">{ap.data?.split('-').reverse().join('/')}</span>
                                <span className="text-blue-700 font-medium">{ap.tipoOcorrencia}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${ap.status === 'resolvido' ? 'bg-green-200 text-green-800' : ap.status === 'em_analise' ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-200 text-gray-700'}`}>
                                  {ap.status === 'resolvido' ? 'Resolvido' : ap.status === 'em_analise' ? 'Em Análise' : 'Pendente'}
                                </span>
                              </div>
                              <p className="text-blue-800 mt-1 break-words">{ap.descricao}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {pendingDirectUpload ? (
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => { setShowSelectiveDialog(false); setPendingDirectUpload(false); }}>Cancelar</Button>
                    <Button className="bg-[#1B2A4A] hover:bg-[#243660]" onClick={async () => {
                      setShowSelectiveDialog(false);
                      setPendingDirectUpload(false);
                      setUploading(true);
                      setUploadResult(null);
                      try {
                        const filesData = await getFilesBase64();
                        await uploadMut.mutateAsync({ companyId, companyIds, files: filesData });
                      } catch (e) {} finally { setUploading(false); }
                    }}>
                      Confirmar Importação
                    </Button>
                  </div>
                ) : (
                <>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => { setShowReplaceAllConfirm(true); setReplaceAllPassword(""); setReplaceAllPasswordError(""); }}
                    className="border-2 border-emerald-200 bg-white rounded-xl p-4 hover:bg-emerald-50 hover:border-emerald-400 transition-all text-left group">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-10 w-10 rounded-lg bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center transition-colors">
                        <ShieldCheck className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-emerald-800">Substituir DIXI</p>
                          <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0 h-4 font-semibold">SEGURO</Badge>
                        </div>
                        <p className="text-xs text-emerald-700">Preserva marcações manuais e apontamentos de campo</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-600 ml-[52px] leading-snug">Substitui apenas os dias importados anteriormente do relógio. Dias com edição manual do RH ou apontamento de campo <strong>não são tocados</strong>.</p>
                  </button>

                  <div className="border-2 border-blue-300 bg-blue-50/50 rounded-xl p-4 text-left ring-2 ring-blue-200">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <ListChecks className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-bold text-blue-800">Selecionar Funcionários</p>
                        <p className="text-xs text-blue-600">Escolha quais funcionários atualizar</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 ml-[52px]">Apenas os selecionados abaixo terão seus dados substituídos.</p>
                  </div>
                </div>

                <div className="border rounded-xl bg-white overflow-hidden">
                  <div className="bg-gray-50 border-b px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                          checked={selectedEmployeeIds.size === previewData.employees.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEmployeeIds(new Set(previewData.employees.map((emp: any) => emp.employeeId)));
                            } else {
                              setSelectedEmployeeIds(new Set());
                            }
                          }}
                        />
                        <span className="text-sm font-medium text-gray-700">
                          {selectedEmployeeIds.size === previewData.employees.length ? "Desmarcar todos" : "Selecionar todos"}
                        </span>
                      </label>
                      <Badge className="bg-blue-100 text-blue-800 text-xs">{selectedEmployeeIds.size} de {previewData.employees.length}</Badge>
                    </div>
                    <div className="relative w-64">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <Input placeholder="Buscar funcionário..." className="pl-8 h-8 text-sm"
                        value={selectiveSearch} onChange={e => setSelectiveSearch(e.target.value)} />
                    </div>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto divide-y">
                    {previewData.employees
                      .filter((emp: any) => {
                        if (!selectiveSearch) return true;
                        const term = selectiveSearch.toLowerCase();
                        return emp.nomeCompleto.toLowerCase().includes(term) || (emp.cpf || "").includes(term) || (emp.funcao || "").toLowerCase().includes(term);
                      })
                      .map((emp: any) => (
                      <label key={emp.employeeId}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-blue-50/50 transition-colors ${selectedEmployeeIds.has(emp.employeeId) ? "bg-blue-50/30" : ""}`}>
                        <input type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4 shrink-0"
                          checked={selectedEmployeeIds.has(emp.employeeId)}
                          onChange={(e) => {
                            const newSet = new Set(selectedEmployeeIds);
                            if (e.target.checked) newSet.add(emp.employeeId);
                            else newSet.delete(emp.employeeId);
                            setSelectedEmployeeIds(newSet);
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{emp.nomeCompleto}</p>
                          <p className="text-[11px] text-gray-500">{emp.funcao || "—"} {emp.cpf ? `· ${formatCPF(emp.cpf)}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-500">{emp.totalRegistros} reg.</span>
                          {previewData.isSharedSn && emp.obraDestino && (
                            emp.obraDestino.status === "resolved" ? (
                              <Badge className="bg-teal-50 text-teal-700 text-[10px] px-1.5 flex items-center gap-1">
                                <Building2 className="h-2.5 w-2.5" />{emp.obraDestino.obraNome.substring(0, 20)}
                              </Badge>
                            ) : emp.obraDestino.status === "ambiguous" ? (
                              <Badge className="bg-red-100 text-red-700 text-[10px] px-1.5" title="Alocado em múltiplas obras — não será importado">Ambíguo</Badge>
                            ) : (
                              <Badge className="bg-orange-100 text-orange-700 text-[10px] px-1.5" title="Sem alocação — não será importado">Sem alocação</Badge>
                            )
                          )}
                          {emp.jaImportado ? (
                            <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5">Já importado</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5">Novo</Badge>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setShowSelectiveDialog(false)}>Cancelar</Button>
                  <Button onClick={() => handleUploadSelective("selective")}
                    disabled={selectedEmployeeIds.size === 0}
                    className="bg-blue-600 hover:bg-blue-700 shadow-md">
                    <Upload className="h-4 w-4 mr-2" />
                    Importar {selectedEmployeeIds.size} funcionário(s)
                  </Button>
                </div>
                </>
                )}
              </div>
            )}
            {uploading && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-600 font-medium">Processando importação...</p>
              </div>
            )}
          </div>
        </FullScreenDialog>

        {showReplaceAllConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{ zIndex: 99999 }}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-700 to-emerald-500 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">Substituir DIXI — Confirmação</h3>
                    <p className="text-emerald-100 text-xs">Ação segura — preserva manuais e apontamentos</p>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" /> O que acontece ao confirmar
                  </p>
                  <ul className="text-xs text-emerald-800 space-y-1 ml-6 list-disc">
                    <li>Os registros antigos vindos do <strong>DIXI</strong> deste período serão substituídos pelos novos</li>
                    <li>Marcações editadas manualmente pelo RH (<strong>fonte = manual</strong>) <strong>permanecem intactas</strong></li>
                    <li>Apontamentos de campo (<strong>fonte = apontamento</strong>) <strong>permanecem intactos</strong></li>
                    <li>Dias em branco passam a receber as batidas do novo arquivo</li>
                  </ul>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-[11px] text-amber-800">
                    <strong>Senha solicitada</strong> apenas como dupla checagem — nada será apagado sem a sua confirmação.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Digite sua senha para confirmar:</label>
                  <input
                    type="password"
                    autoFocus
                    autoComplete="new-password"
                    name="dixi-confirm-pwd"
                    className={`mt-1.5 w-full px-3 py-2.5 border-2 rounded-lg text-sm outline-none transition-colors ${
                      replaceAllPasswordError ? "border-red-400 bg-red-50" : "border-gray-300 focus:border-blue-500"
                    }`}
                    placeholder="Sua senha de login"
                    value={replaceAllPassword}
                    onChange={e => { setReplaceAllPassword(e.target.value); setReplaceAllPasswordError(""); }}
                    onKeyDown={e => { if (e.key === "Enter") handleReplaceAllConfirm(); if (e.key === "Escape") { setShowReplaceAllConfirm(false); setReplaceAllPassword(""); } }}
                  />
                  {replaceAllPasswordError && (
                    <p className="text-xs text-red-600 mt-1 font-medium">{replaceAllPasswordError}</p>
                  )}
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => { setShowReplaceAllConfirm(false); setReplaceAllPassword(""); }}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleReplaceAllConfirm}
                    disabled={verifyingPassword || !replaceAllPassword.trim()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                  >
                    {verifyingPassword ? (
                      <><div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" /> Verificando...</>
                    ) : (
                      <><ShieldCheck className="h-4 w-4 mr-2" /> Confirmar Substituição</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== MANUAL ENTRY DIALOG (componente compartilhado) ===== */}
        <ManualEntryDialog
          open={showManualDialog}
          onClose={() => setShowManualDialog(false)}
          mode="mes"
          companyId={companyId}
          companyIds={companyIds}
          mesAno={mesAno}
          isConsolidado={isConsolidado}
          initialData={manualSeed}
          onSaved={handleManualSaved}
        />

        {/* ===== RESOLVE INCONSISTENCY DIALOG (REDESIGNED) ===== */}
        <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
          <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
            {selectedInconsistency && (() => {
              const inc = selectedInconsistency.inconsistency;
              const tipoIcon: Record<string, { icon: string; color: string; bg: string }> = {
                sem_registro: { icon: "🚫", color: "text-red-700", bg: "bg-red-50" },
                falta_batida: { icon: "⏰", color: "text-amber-700", bg: "bg-amber-50" },
                jornada_excedida: { icon: "⚡", color: "text-orange-700", bg: "bg-orange-50" },
                intervalo_insuficiente: { icon: "☕", color: "text-purple-700", bg: "bg-purple-50" },
                atraso: { icon: "🕐", color: "text-blue-700", bg: "bg-blue-50" },
                saida_antecipada: { icon: "🏃", color: "text-teal-700", bg: "bg-teal-50" },
              };
              const tipoInfo = tipoIcon[inc.tipoInconsistencia] || { icon: "⚠️", color: "text-gray-700", bg: "bg-gray-50" };
              const tipoLabel: Record<string, string> = {
                sem_registro: "Sem Registro", falta_batida: "Falta de Batida",
                jornada_excedida: "Jornada Excedida", intervalo_insuficiente: "Intervalo Insuficiente",
                atraso: "Atraso", saida_antecipada: "Saída Antecipada",
              };
              const JUSTIFICATIVAS_RAPIDAS = [
                { label: "Esqueceu de bater", icon: "🤦" },
                { label: "Falta justificada", icon: "📋" },
                { label: "Liberado pela chefia", icon: "👤" },
                { label: "Serviço externo", icon: "🚗" },
                { label: "Problema no relógio", icon: "🔧" },
                { label: "Atestado médico", icon: "🏥" },
                { label: "Atraso no transporte", icon: "🚌" },
                { label: "Saiu mais cedo (autorizado)", icon: "✅" },
              ];
              return (
                <>
                  {/* Header colorido */}
                  <div className={`${tipoInfo.bg} px-5 py-4 border-b`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xl">{tipoInfo.icon}</span>
                          <span className={`text-sm font-bold ${tipoInfo.color}`}>{tipoLabel[inc.tipoInconsistencia] || inc.tipoInconsistencia}</span>
                        </div>
                        <p className="text-base font-semibold text-foreground">{selectedInconsistency.employeeName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{inc.descricao}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-foreground">
                          {inc.data ? new Date(inc.data + "T12:00:00").toLocaleDateString("pt-BR", { weekday: 'short', day: '2-digit', month: 'short' }) : "-"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Corpo */}
                  <div className="px-5 py-4 space-y-4">
                    {/* Ação */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className={`border-2 rounded-lg p-3 text-left transition-all ${
                          resolveData.status === "justificado"
                            ? "border-green-500 bg-green-50 ring-1 ring-green-300"
                            : "border-gray-200 hover:border-green-300 hover:bg-green-50/50"
                        }`}
                        onClick={() => setResolveData(p => ({ ...p, status: "justificado" }))}
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle className={`h-5 w-5 ${resolveData.status === "justificado" ? "text-green-600" : "text-gray-400"}`} />
                          <div>
                            <p className="text-sm font-semibold">Justificar</p>
                            <p className="text-[10px] text-muted-foreground">Sem penalidade</p>
                          </div>
                        </div>
                      </button>
                      <button
                        className={`border-2 rounded-lg p-3 text-left transition-all ${
                          resolveData.status === "ajustado"
                            ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300"
                            : "border-gray-200 hover:border-blue-300 hover:bg-blue-50/50"
                        }`}
                        onClick={() => setResolveData(p => ({ ...p, status: "ajustado" }))}
                      >
                        <div className="flex items-center gap-2">
                          <PenLine className={`h-5 w-5 ${resolveData.status === "ajustado" ? "text-blue-600" : "text-gray-400"}`} />
                          <div>
                            <p className="text-sm font-semibold">Ajustado</p>
                            <p className="text-[10px] text-muted-foreground">Ponto corrigido</p>
                          </div>
                        </div>
                      </button>
                    </div>

                    {/* Justificativas rápidas */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Justificativa rápida (1 clique):</p>
                      <div className="flex flex-wrap gap-1.5">
                        {JUSTIFICATIVAS_RAPIDAS.map(j => (
                          <button
                            key={j.label}
                            className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all ${
                              resolveData.justificativa === j.label
                                ? "bg-[#1B2A4A] text-white border-[#1B2A4A]"
                                : "bg-white text-foreground border-gray-200 hover:border-[#1B2A4A] hover:bg-gray-50"
                            }`}
                            onClick={() => setResolveData(p => ({ ...p, justificativa: j.label }))}
                          >
                            {j.icon} {j.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Texto livre */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Ou escreva uma justificativa:</p>
                      <Textarea
                        value={resolveData.justificativa}
                        onChange={e => setResolveData(p => ({ ...p, justificativa: e.target.value }))}
                        placeholder="Descreva o motivo..."
                        className="min-h-[60px] text-sm"
                      />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-5 py-3 border-t bg-gray-50/50 flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={() => setShowResolveDialog(false)} className="text-muted-foreground">
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => {
                        if (!selectedInconsistency) return;
                        resolveMut.mutate({
                          id: selectedInconsistency.inconsistency.id,
                          status: resolveData.status as any,
                          justificativa: resolveData.justificativa || undefined,
                        });
                      }}
                      disabled={resolveMut.isPending || !resolveData.justificativa}
                      className="bg-[#1B2A4A] hover:bg-[#243660] gap-1.5"
                    >
                      <CheckCircle className="h-4 w-4" />
                      {resolveMut.isPending ? "Processando..." : "Resolver Inconsistência"}
                    </Button>
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* ===== CONSOLIDAR MÊS DIALOG (FULL SCREEN) ===== */}
        <FullScreenDialog open={showConsolidarDialog} onClose={() => setShowConsolidarDialog(false)} title={`Consolidar Mês — ${formatMesAno(mesAno)}`} icon={<Lock className="h-5 w-5 text-white" />} headerColor="bg-gradient-to-r from-green-800 to-green-600">
          <div className="w-full max-w-xl">
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
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowConsolidarDialog(false)}>Cancelar</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => {
                consolidarMut.mutate({ companyId, companyIds, mesReferencia: mesAno, observacoes: consolidarObs || undefined });
              }} disabled={consolidarMut.isPending}>
                {consolidarMut.isPending ? "Consolidando..." : "Consolidar Mês"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>

        {/* ===== DESCONSOLIDAR DIALOG (FULL SCREEN) ===== */}
        <FullScreenDialog open={showDesconsolidarDialog} onClose={() => setShowDesconsolidarDialog(false)} title={`Desconsolidar Mês — ${formatMesAno(mesAno)}`} icon={<Unlock className="h-5 w-5 text-white" />} headerColor="bg-gradient-to-r from-amber-700 to-amber-500">
          <div className="w-full max-w-xl">
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <strong>Atenção:</strong> Ao desconsolidar, o mês voltará a aceitar alterações.
                Esta ação é restrita ao <strong>Admin Master</strong>.
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p><strong>Consolidado por:</strong> {consolidacaoStatus.data?.consolidadoPor || "—"}</p>
                <p><strong>Data:</strong> {formatDateTime(consolidacaoStatus.data?.consolidadoEm)}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowDesconsolidarDialog(false)}>Cancelar</Button>
              <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => {
                desconsolidarMut.mutate({ companyId, companyIds, mesReferencia: mesAno });
              }} disabled={desconsolidarMut.isPending}>
                {desconsolidarMut.isPending ? "Desconsolidando..." : "Desconsolidar"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>

        {/* ===== LIMPAR BASE DIALOG (FULL SCREEN) ===== */}
        <FullScreenDialog open={showClearDialog} onClose={() => setShowClearDialog(false)} title={`Limpar Base — ${formatMesAno(mesAno)}`} icon={<Trash2 className="h-5 w-5 text-white" />} headerColor="bg-gradient-to-r from-red-800 to-red-600">
          <div className="w-full max-w-xl">
            <div className="space-y-4">
              {/* === LIMPEZA DE DIXI COM MANUAL === */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-blue-800 mb-1">Prioridade Manual sobre DIXI</p>
                <p className="text-xs text-blue-700 mb-3">
                  Remove registros DIXI de dias onde já existe lançamento manual para o mesmo funcionário. Aplica-se ao mês selecionado ou a toda a base.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="border-blue-400 text-blue-700 hover:bg-blue-100 text-xs"
                    disabled={limparDixiComManualMut.isPending}
                    onClick={() => {
                      if (confirm(`Remover registros DIXI do mês ${formatMesAno(mesAno)} onde já existe lançamento manual?\n\nEsta ação é irreversível.`)) {
                        limparDixiComManualMut.mutate({ companyId, companyIds, mesReferencia: mesAno });
                      }
                    }}>
                    {limparDixiComManualMut.isPending ? "Processando..." : `Limpar ${formatMesAno(mesAno)}`}
                  </Button>
                  <Button size="sm" variant="outline" className="border-blue-400 text-blue-700 hover:bg-blue-100 text-xs"
                    disabled={limparDixiComManualMut.isPending}
                    onClick={() => {
                      if (confirm(`Remover registros DIXI de TODA A BASE onde já existe lançamento manual?\n\nEsta ação é irreversível e pode afetar vários meses.`)) {
                        limparDixiComManualMut.mutate({ companyId, companyIds });
                      }
                    }}>
                    {limparDixiComManualMut.isPending ? "Processando..." : "Limpar Toda a Base"}
                  </Button>
                </div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-orange-800 mb-1">Limpar por Período (Data Início / Data Fim)</p>
                <p className="text-xs text-orange-700 mb-3">
                  Remove todos os registros de ponto e inconsistências entre as datas selecionadas, independente do mês de referência.
                </p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <Label className="text-xs">Data Início</Label>
                    <input type="date" value={clearPeriodDe} onChange={e => setClearPeriodDe(e.target.value)} className="w-full border rounded px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Data Fim</Label>
                    <input type="date" value={clearPeriodAte} onChange={e => setClearPeriodAte(e.target.value)} className="w-full border rounded px-3 py-2 text-sm mt-1" />
                  </div>
                </div>
                <div className="mb-3">
                  <Label className="text-xs">O que limpar?</Label>
                  <Select value={clearPeriodTipo} onValueChange={setClearPeriodTipo}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tudo">Registros + Inconsistências</SelectItem>
                      <SelectItem value="registros">Apenas Registros de Ponto</SelectItem>
                      <SelectItem value="inconsistencias">Apenas Inconsistências</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" variant="destructive" className="text-xs"
                  disabled={!clearPeriodDe || !clearPeriodAte || clearByPeriodMut.isPending}
                  onClick={() => {
                    if (confirm(`Limpar TODOS os registros de ${new Date(clearPeriodDe + "T12:00:00").toLocaleDateString("pt-BR")} até ${new Date(clearPeriodAte + "T12:00:00").toLocaleDateString("pt-BR")}?\n\nEsta ação é irreversível.`)) {
                      clearByPeriodMut.mutate({ companyId, companyIds, dataInicio: clearPeriodDe, dataFim: clearPeriodAte, tipo: clearPeriodTipo as any });
                    }
                  }}>
                  {clearByPeriodMut.isPending ? "Limpando..." : "Limpar Período"}
                </Button>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Limpar por Mês de Referência</p>
              </div>
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
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowClearDialog(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => clearMut.mutate({ companyId, companyIds, mesReferencia: mesAno, tipo: clearType as any })} disabled={clearMut.isPending}>
                {clearMut.isPending ? "Limpando..." : `Limpar Mês ${formatMesAno(mesAno)}`}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      </div>
      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />

      {/* ===== MODAL DE AJUSTE RÁPIDO DE INCONSISTÊNCIA ===== */}
      {/* ===== DIALOG: PERÍODO ESPECIAL MANUAL (Férias / Aviso Prévio retroativo) ===== */}
      <Dialog open={showPeriodoEspecial} onOpenChange={setShowPeriodoEspecial}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <CalendarDays className="h-5 w-5" /> Aplicar Período Especial
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              Informa manualmente que o funcionário estava de <strong>férias</strong> ou <strong>aviso prévio</strong> em um período e corrige automaticamente os registros de ponto já lançados.
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Tipo de período</Label>
              <Select value={periodoEspecialTipo} onValueChange={(v) => setPeriodoEspecialTipo(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ferias">Férias (zera faltas e atrasos)</SelectItem>
                  <SelectItem value="aviso_2h">Aviso Prévio — redução de 2h/dia</SelectItem>
                  <SelectItem value="aviso_7dias">Aviso Prévio — 7 dias corridos (pode se ausentar)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Data início</Label>
                <Input type="date" value={periodoEspecialInicio} onChange={e => setPeriodoEspecialInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Data fim</Label>
                <Input type="date" value={periodoEspecialFim} onChange={e => setPeriodoEspecialFim(e.target.value)} />
              </div>
            </div>

            {periodoEspecialTipo === 'ferias' && (
              <p className="text-xs text-muted-foreground">Todos os registros sem ajuste manual no período terão <strong>faltas e atrasos zerados</strong>.</p>
            )}
            {periodoEspecialTipo === 'aviso_2h' && (
              <p className="text-xs text-muted-foreground">A jornada esperada será reduzida em <strong>2 horas por dia</strong> — HE, atrasos e faltas serão recalculados com a jornada corrigida.</p>
            )}
            {periodoEspecialTipo === 'aviso_7dias' && (
              <p className="text-xs text-muted-foreground">Nos <strong>últimos 7 dias corridos</strong> do período informado, a jornada esperada é zerada (o funcionário pode se ausentar sem gerar falta).</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPeriodoEspecial(false)}>Cancelar</Button>
            <Button
              disabled={!periodoEspecialInicio || !periodoEspecialFim || periodoEspecialMut.isPending}
              onClick={() => periodoEspecialMut.mutate({
                companyId,
                employeeId: selectedEmployeeId!,
                dataInicio: periodoEspecialInicio,
                dataFim: periodoEspecialFim,
                tipo: periodoEspecialTipo,
              })}
            >
              {periodoEspecialMut.isPending ? "Aplicando..." : "Aplicar Correção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickFixOpen} onOpenChange={setQuickFixOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <PenLine className="h-5 w-5" /> Ajuste Rápido de Ponto
            </DialogTitle>
          </DialogHeader>
          {quickFixRec && (
            <div className="space-y-4">
              {/* Info do registro */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-800">
                    {quickFixRec.data ? new Date(quickFixRec.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {employeeDetail.data?.employee?.nomeCompleto || "Colaborador"}
                  </Badge>
                </div>
                <p className="text-xs text-amber-600 mt-1">
                  Preencha os horários que estão faltando e informe o motivo do ajuste.
                </p>
              </div>

              {/* Campos de horário — apenas os que estão vazios ficam destacados */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Entrada</Label>
                  <Input type="text" inputMode="numeric" maxLength={5} placeholder="--:--" value={quickFixData.entrada1} onChange={(e) => setQuickFixData(d => ({ ...d, entrada1: maskTimeValue(e.target.value) }))} onBlur={(e) => setQuickFixData(d => ({ ...d, entrada1: normalizeTimeOnBlur(e.target.value) }))} className={!quickFixRec.entrada1 ? "border-amber-400 bg-amber-50" : ""} />
                  {!quickFixRec.entrada1 && <span className="text-[10px] text-amber-600">* Faltando</span>}
                </div>
                <div>
                  <Label className="text-xs">Saída Int.</Label>
                  <Input type="text" inputMode="numeric" maxLength={5} placeholder="--:--" value={quickFixData.saida1} onChange={(e) => setQuickFixData(d => ({ ...d, saida1: maskTimeValue(e.target.value) }))} onBlur={(e) => setQuickFixData(d => ({ ...d, saida1: normalizeTimeOnBlur(e.target.value) }))} className={!quickFixRec.saida1 ? "border-amber-400 bg-amber-50" : ""} />
                  {!quickFixRec.saida1 && <span className="text-[10px] text-amber-600">* Faltando</span>}
                </div>
                <div>
                  <Label className="text-xs">Retorno</Label>
                  <Input type="text" inputMode="numeric" maxLength={5} placeholder="--:--" value={quickFixData.entrada2} onChange={(e) => setQuickFixData(d => ({ ...d, entrada2: maskTimeValue(e.target.value) }))} onBlur={(e) => setQuickFixData(d => ({ ...d, entrada2: normalizeTimeOnBlur(e.target.value) }))} className={!quickFixRec.entrada2 ? "border-amber-400 bg-amber-50" : ""} />
                  {!quickFixRec.entrada2 && <span className="text-[10px] text-amber-600">* Faltando</span>}
                </div>
                <div>
                  <Label className="text-xs">Saída</Label>
                  <Input type="text" inputMode="numeric" maxLength={5} placeholder="--:--" value={quickFixData.saida2} onChange={(e) => setQuickFixData(d => ({ ...d, saida2: maskTimeValue(e.target.value) }))} onBlur={(e) => setQuickFixData(d => ({ ...d, saida2: normalizeTimeOnBlur(e.target.value) }))} className={!quickFixRec.saida2 ? "border-amber-400 bg-amber-50" : ""} />
                  {!quickFixRec.saida2 && <span className="text-[10px] text-amber-600">* Faltando</span>}
                </div>
              </div>

              {/* Motivo do ajuste — obrigatório */}
              <div>
                <Label className="text-xs font-semibold">Motivo do Ajuste <span className="text-red-500">*</span></Label>
                <Select value={quickFixData.motivoAjuste} onValueChange={(v) => setQuickFixData(d => ({ ...d, motivoAjuste: v }))}>
                  <SelectTrigger className={!quickFixData.motivoAjuste ? "border-red-300" : ""}>
                    <SelectValue placeholder="Selecione o motivo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_AJUSTE.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Descrição adicional — obrigatória se motivo = Outro */}
              <div>
                <Label className="text-xs">
                  Descrição {quickFixData.motivoAjuste === "Outro" ? <span className="text-red-500">* (obrigatória)</span> : "(opcional)"}
                </Label>
                <Textarea
                  value={quickFixData.descricaoMotivo}
                  onChange={(e) => setQuickFixData(d => ({ ...d, descricaoMotivo: e.target.value }))}
                  placeholder="Descreva o motivo do ajuste..."
                  rows={2}
                  className={quickFixData.motivoAjuste === "Outro" && !quickFixData.descricaoMotivo ? "border-red-300" : ""}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickFixOpen(false)}>Cancelar</Button>
            <Button
              className="bg-[#1B2A4A] hover:bg-[#243658] text-white"
              disabled={!quickFixData.motivoAjuste || (quickFixData.motivoAjuste === "Outro" && !quickFixData.descricaoMotivo) || manualMut.isPending}
              onClick={() => {
                if (!quickFixRec || !selectedEmployeeId) return;
                const justificativa = quickFixData.motivoAjuste === "Outro"
                  ? quickFixData.descricaoMotivo
                  : quickFixData.descricaoMotivo
                    ? `${quickFixData.descricaoMotivo}`
                    : "";
                manualMut.mutate({ companyId, companyIds, employeeId: selectedEmployeeId,
                  obraId: quickFixRec.obraId || undefined,
                  mesReferencia: mesAno,
                  data: quickFixRec.data,
                  entrada1: quickFixData.entrada1 || undefined,
                  saida1: quickFixData.saida1 || undefined,
                  entrada2: quickFixData.entrada2 || undefined,
                  saida2: quickFixData.saida2 || undefined,
                  justificativa,
                  motivoAjuste: quickFixData.motivoAjuste,
                }, {
                  onSuccess: () => {
                    setQuickFixOpen(false);
                    employeeDetail.refetch();
                    inconsistencies.refetch();
                    stats.refetch();
                    toast.success("Ajuste salvo com sucesso! Inconsistência resolvida.");
                  },
                });
              }}
            >
              {manualMut.isPending ? "Salvando..." : "Salvar Ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== MODAL: RELATÓRIO DE FALTAS ===================== */}
      <FaltasReportModal
        open={faltasModalOpen}
        onClose={() => setFaltasModalOpen(false)}
        companyId={companyId}
        companyIds={companyIds}
        dataInicio={faltasDataInicio}
        dataFim={faltasDataFim}
        onChangeDataInicio={setFaltasDataInicio}
        onChangeDataFim={setFaltasDataFim}
        obraIds={faltasObraIds}
        onChangeObraIds={setFaltasObraIds}
        obrasList={(obrasList.data || []) as any[]}
        expandedIds={faltasExpandedIds}
        onToggleExpanded={(id) => {
          const next = new Set(faltasExpandedIds);
          if (next.has(id)) next.delete(id); else next.add(id);
          setFaltasExpandedIds(next);
        }}
        search={faltasSearch}
        onChangeSearch={setFaltasSearch}
      />

          <PrintFooterLGPD />
      {/* Rev. 2015 — Modal de foto ampliada do colaborador */}
      <Dialog open={!!fotoZoom} onOpenChange={(open) => { if (!open) setFotoZoom(null); }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700">
          <DialogHeader className="px-6 py-4 border-b border-slate-700">
            <DialogTitle className="text-white flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-blue-300" />
              {fotoZoom?.nome || "Colaborador"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-8 min-h-[400px]">
            {fotoZoom?.url && !fotoLoadError ? (
              <img
                src={fotoZoom.url}
                alt={fotoZoom.nome}
                className="max-w-full max-h-[70vh] rounded-xl shadow-2xl ring-4 ring-white/20 object-contain"
                onError={() => setFotoLoadError(true)}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-slate-300">
                <div className="rounded-full bg-slate-700/50 p-6 ring-4 ring-slate-600/40">
                  <ImageOff className="h-16 w-16 text-slate-400" />
                </div>
                <p className="text-sm font-medium">
                  {fotoZoom?.url && fotoLoadError ? "Falha ao carregar a foto" : "Sem foto cadastrada"}
                </p>
                <p className="text-xs text-slate-400 max-w-xs text-center">
                  {fotoZoom?.url && fotoLoadError
                    ? "O link da foto está quebrado ou inacessível. Reenvie a foto no módulo de Funcionários."
                    : "Cadastre a foto deste colaborador no módulo de Funcionários para facilitar a identificação visual."}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// ============================================================
// MODAL: Relatório de Faltas / Atrasos / Saídas Antecipadas
// ============================================================
function FaltasReportModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: number;
  companyIds: number[];
  dataInicio: string;
  dataFim: string;
  onChangeDataInicio: (v: string) => void;
  onChangeDataFim: (v: string) => void;
  obraIds: number[];
  onChangeObraIds: (ids: number[]) => void;
  obrasList: Array<{ id: number; nome: string }>;
  expandedIds: Set<number>;
  onToggleExpanded: (id: number) => void;
  search: string;
  onChangeSearch: (s: string) => void;
}) {
  const { open, onClose, companyId, companyIds, dataInicio, dataFim, obraIds, obrasList, expandedIds, onToggleExpanded, search, onChangeSearch } = props;
  const [obraPopoverOpen, setObraPopoverOpen] = useState(false);
  // Rev. 1839 — Filtro por KPI (clique em card filtra a tabela). 'all' = sem filtro.
  type KpiKey = "all" | "injustificadas" | "justificadas" | "dsrPerdido" | "atrasos" | "saidasAntecipadas";
  const [kpiFilter, setKpiFilter] = useState<KpiKey>("all");
  // Mapa KPI → tipo do detalhe (para filtrar também os badges expandidos)
  const kpiToDetalheTipo: Record<Exclude<KpiKey, "all" | "dsrPerdido">, string> = {
    injustificadas: "injustificada",
    justificadas: "justificada",
    atrasos: "atraso",
    saidasAntecipadas: "saida_antecipada",
  };

  const enabled = open && companyId > 0 && !!dataInicio && !!dataFim;
  const report = trpc.fechamentoPonto.getFaltasReport.useQuery(
    { companyId, companyIds, dataInicio, dataFim, obraIds: obraIds.length > 0 ? obraIds : undefined },
    { enabled, refetchOnMount: 'always', staleTime: 0 }
  );

  const filtered = useMemo(() => {
    const list = report.data?.funcionarios || [];
    let out = list;
    // Rev. 1839 — Filtro por KPI: só mantém funcionários com ocorrência > 0 do tipo escolhido
    if (kpiFilter !== "all") {
      out = out.filter((f: any) => Number(f[kpiFilter] ?? 0) > 0);
    }
    if (search.trim()) {
      const q = removeAccents(search.trim().toLowerCase());
      out = out.filter((f: any) =>
        removeAccents(String(f.nomeCompleto || "").toLowerCase()).includes(q)
        || String(f.matricula || "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [report.data, search, kpiFilter]);

  const totais = report.data?.totais;

  function fmtBR(d: string) {
    if (!d) return "-";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  }
  function fmtMin(min: number) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h${String(m).padStart(2, "0")}`;
  }

  function toggleObra(id: number) {
    if (obraIds.includes(id)) props.onChangeObraIds(obraIds.filter(x => x !== id));
    else props.onChangeObraIds([...obraIds, id]);
  }

  function exportarPDF() {
    const data = report.data;
    if (!data) return;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Bloqueador de popup ativo. Libere a janela para imprimir."); return; }
    const periodo = `${fmtBR(dataInicio)} a ${fmtBR(dataFim)}`;
    const obrasLabel = obraIds.length > 0
      ? obraIds.map(id => obrasList.find(o => o.id === id)?.nome).filter(Boolean).join(", ")
      : "Todas";
    const rows = filtered.map((f: any) => `
      <tr>
        <td>${f.nomeCompleto}${f.matricula ? ` <span style="color:#888">(${f.matricula})</span>` : ""}</td>
        <td>${f.cargo || "-"}</td>
        <td style="text-align:center;color:#dc2626;font-weight:bold">${f.injustificadas}</td>
        <td style="text-align:center;color:#0891b2">${f.justificadas}</td>
        <td style="text-align:center;color:#7c3aed">${f.dsrPerdido}</td>
        <td style="text-align:center;color:#ca8a04">${f.atrasos}${f.minutosAtraso ? ` <small>(${fmtMin(f.minutosAtraso)})</small>` : ""}</td>
        <td style="text-align:center;color:#ea580c">${f.saidasAntecipadas}${f.minutosSaidaAntec ? ` <small>(${fmtMin(f.minutosSaidaAntec)})</small>` : ""}</td>
      </tr>
      ${(f.detalhes || []).length > 0 ? `<tr><td colspan="7" style="background:#fafafa;padding:8px;font-size:11px;color:#555">
        ${f.detalhes.map((d: any) => {
          const cor = d.tipo === "injustificada" ? "#dc2626" : d.tipo === "justificada" ? "#0891b2" : d.tipo === "atraso" ? "#ca8a04" : "#ea580c";
          const tipoLbl = d.tipo === "injustificada" ? "Falta INJ" : d.tipo === "justificada" ? "Falta JUST" : d.tipo === "atraso" ? "Atraso" : "Saída Ant.";
          return `<span style="display:inline-block;margin:2px 8px 2px 0;padding:2px 6px;border-left:3px solid ${cor}">
            ${fmtBR(d.data)} — <strong style="color:${cor}">${tipoLbl}</strong>${d.descricao ? ` (${d.descricao})` : ""}${d.minutos ? ` · ${d.minutos}min` : ""}
          </span>`;
        }).join("")}
      </td></tr>` : ""}
    `).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório de Faltas — ${periodo}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111}
        h1{font-size:18px;margin:0 0 4px}
        .meta{color:#555;font-size:12px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
        th{background:#f5f5f5}
        .totais{display:flex;gap:24px;font-size:13px;margin:12px 0;padding:10px;background:#f9f9f9;border-radius:6px}
        .totais b{color:#111}
        @media print {.no-print{display:none}}
      </style></head><body>
      <h1>Relatório de Faltas, Atrasos e Saídas Antecipadas</h1>
      <div class="meta">Período: <b>${periodo}</b> · Obra(s): <b>${obrasLabel}</b> · Gerado em ${new Date().toLocaleString("pt-BR")}</div>
      <div class="totais">
        <span><b style="color:#dc2626">${totais?.injustificadas || 0}</b> Injustificadas</span>
        <span><b style="color:#0891b2">${totais?.justificadas || 0}</b> Justificadas</span>
        <span><b style="color:#7c3aed">${totais?.dsrPerdido || 0}</b> DSR Perdido</span>
        <span><b style="color:#ca8a04">${totais?.atrasos || 0}</b> Atrasos</span>
        <span><b style="color:#ea580c">${totais?.saidasAntecipadas || 0}</b> Saídas Antecipadas</span>
      </div>
      <table>
        <thead><tr>
          <th>Funcionário</th><th>Cargo</th><th style="text-align:center">Injust.</th><th style="text-align:center">Just.</th>
          <th style="text-align:center">DSR Perd.</th><th style="text-align:center">Atrasos</th><th style="text-align:center">Saída Ant.</th>
        </tr></thead><tbody>${rows || `<tr><td colspan="7" style="text-align:center;color:#888;padding:24px">Nenhum registro encontrado.</td></tr>`}</tbody>
      </table>
      <button class="no-print" onclick="window.print()" style="margin-top:16px;padding:8px 16px;background:#0891b2;color:#fff;border:none;border-radius:4px;cursor:pointer">Imprimir / Salvar PDF</button>
      </body></html>`);
    w.document.close();
  }

  async function exportarExcel() {
    const data = report.data;
    if (!data) return;
    const wb = (XLSX as any).utils.book_new();
    const headerRows = [[
      "Funcionário", "Matrícula", "Cargo", "Setor",
      "Faltas Injustificadas", "Faltas Justificadas", "DSR Perdido",
      "Qtd. Atrasos", "Min. Atrasos", "Qtd. Saídas Antec.", "Min. Saídas Antec.",
    ]];
    const bodyRows = filtered.map((f: any) => [
      f.nomeCompleto, f.matricula || "", f.cargo || "", f.setor || "",
      f.injustificadas, f.justificadas, f.dsrPerdido,
      f.atrasos, f.minutosAtraso, f.saidasAntecipadas, f.minutosSaidaAntec,
    ]);
    const ws = (XLSX as any).utils.aoa_to_sheet([...headerRows, ...bodyRows]);
    (XLSX as any).utils.book_append_sheet(wb, ws, "Resumo");

    // Aba detalhes
    const detRows: any[] = [["Funcionário", "Matrícula", "Data", "Tipo", "Descrição", "Minutos"]];
    for (const f of filtered) {
      for (const d of (f.detalhes || [])) {
        const tipoLbl = d.tipo === "injustificada" ? "Falta Injustificada"
          : d.tipo === "justificada" ? "Falta Justificada"
          : d.tipo === "atraso" ? "Atraso"
          : "Saída Antecipada";
        detRows.push([f.nomeCompleto, f.matricula || "", d.data, tipoLbl, d.descricao || "", d.minutos || ""]);
      }
    }
    const ws2 = (XLSX as any).utils.aoa_to_sheet(detRows);
    (XLSX as any).utils.book_append_sheet(wb, ws2, "Detalhes");

    const filename = `Faltas_${dataInicio}_a_${dataFim}.xlsx`;
    (XLSX as any).writeFile(wb, filename);
  }

  return (
    <FullScreenDialog
      open={open}
      onClose={onClose}
      title="Relatório de Faltas, Atrasos e Saídas Antecipadas"
      subtitle={`${fmtBR(dataInicio)} a ${fmtBR(dataFim)}`}
      icon={<UserX className="h-5 w-5" />}
      headerColor="bg-gradient-to-r from-rose-700 to-rose-900"
      footer={<Button variant="outline" onClick={onClose}>Fechar</Button>}
    >
        {/* Filtros — Rev. 1836: 1col mobile · 2col sm · 4col lg (mais respirável que md-12) */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-end mb-3">
          <div className="min-w-0">
            <Label className="text-xs">Período — Início</Label>
            <Input type="date" value={dataInicio} onChange={(e) => props.onChangeDataInicio(e.target.value)} data-testid="input-faltas-inicio" />
          </div>
          <div className="min-w-0">
            <Label className="text-xs">Período — Fim</Label>
            <Input type="date" value={dataFim} onChange={(e) => props.onChangeDataFim(e.target.value)} data-testid="input-faltas-fim" />
          </div>
          <div className="min-w-0">
            <Label className="text-xs">Obras (opcional)</Label>
            <Popover open={obraPopoverOpen} onOpenChange={setObraPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal min-w-0" size="sm">
                  <span className="truncate">{obraIds.length === 0 ? "Todas as obras" : `${obraIds.length} obra(s) selecionada(s)`}</span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(300px,calc(100vw-2rem))] p-0">
                <Command>
                  <CommandInput placeholder="Buscar obra..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma obra.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem onSelect={() => props.onChangeObraIds([])}>
                        <Check className={`mr-2 h-4 w-4 ${obraIds.length === 0 ? "opacity-100" : "opacity-0"}`} />
                        Todas as obras
                      </CommandItem>
                      {obrasList.map((o: any) => (
                        <CommandItem key={o.id} onSelect={() => toggleObra(o.id)}>
                          <Check className={`mr-2 h-4 w-4 ${obraIds.includes(o.id) ? "opacity-100" : "opacity-0"}`} />
                          {o.nome}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="min-w-0">
            <Label className="text-xs">Buscar funcionário</Label>
            <Input placeholder="Nome ou matrícula..." value={search} onChange={(e) => onChangeSearch(e.target.value)} data-testid="input-faltas-search" />
          </div>
        </div>

        {/* Totais — Rev. 1836: 2col mobile · 3col sm · 5col lg, padding/tipografia fluidos
            Rev. 1839: cards viram BOTÕES — clique filtra a tabela; clique no ativo limpa */}
        {totais && (() => {
          const cards: Array<{ key: KpiKey; value: number; label: string; bg: string; border: string; text: string; ring: string; activeBg: string; testid: string; extraClass?: string }> = [
            { key: "injustificadas",    value: totais.injustificadas,    label: "Faltas Injustificadas", bg: "bg-rose-50",   border: "border-rose-200",   text: "text-rose-700",   ring: "ring-rose-500",   activeBg: "bg-rose-100",   testid: "kpi-injustificadas" },
            { key: "justificadas",      value: totais.justificadas,      label: "Faltas Justificadas",  bg: "bg-cyan-50",   border: "border-cyan-200",   text: "text-cyan-700",   ring: "ring-cyan-500",   activeBg: "bg-cyan-100",   testid: "kpi-justificadas" },
            { key: "dsrPerdido",        value: totais.dsrPerdido,        label: "DSR Perdido",          bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", ring: "ring-purple-500", activeBg: "bg-purple-100", testid: "kpi-dsr" },
            { key: "atrasos",           value: totais.atrasos,           label: "Atrasos",              bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", ring: "ring-yellow-500", activeBg: "bg-yellow-100", testid: "kpi-atrasos" },
            { key: "saidasAntecipadas", value: totais.saidasAntecipadas, label: "Saídas Antecipadas",   bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", ring: "ring-orange-500", activeBg: "bg-orange-100", testid: "kpi-saidas", extraClass: "col-span-2 sm:col-span-1" },
          ];
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
              {cards.map(c => {
                const active = kpiFilter === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setKpiFilter(active ? "all" : c.key)}
                    title={active ? `Clique para limpar o filtro` : `Filtrar somente funcionários com ${c.label}`}
                    data-testid={`btn-${c.testid}`}
                    aria-pressed={active}
                    className={[
                      "rounded-lg p-2 sm:p-3 text-center min-w-0 border transition-all",
                      "hover:shadow-sm hover:-translate-y-[1px] active:translate-y-0 cursor-pointer",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                      c.border,
                      active ? `${c.activeBg} ring-2 ${c.ring}` : c.bg,
                      c.extraClass || "",
                    ].join(" ")}
                  >
                    <p className={`text-xl sm:text-2xl font-bold leading-tight tabular-nums ${c.text}`}>{c.value}</p>
                    <p className={`text-[11px] sm:text-xs leading-tight ${c.text}`}>{c.label}</p>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Rev. 1839 — Banner do filtro KPI ativo (mostra qual KPI está filtrando + botão limpar) */}
        {kpiFilter !== "all" && (
          <div className="flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-md bg-slate-100 border border-slate-200 text-xs sm:text-sm" data-testid="banner-kpi-filter">
            <span className="text-slate-700 truncate">
              <span className="font-medium">Filtro ativo:</span> mostrando apenas funcionários com{" "}
              <span className="font-semibold">
                {kpiFilter === "injustificadas" && "Faltas Injustificadas"}
                {kpiFilter === "justificadas" && "Faltas Justificadas"}
                {kpiFilter === "dsrPerdido" && "DSR Perdido"}
                {kpiFilter === "atrasos" && "Atrasos"}
                {kpiFilter === "saidasAntecipadas" && "Saídas Antecipadas"}
              </span>
            </span>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs shrink-0" onClick={() => setKpiFilter("all")} data-testid="btn-limpar-kpi">
              Limpar filtro
            </Button>
          </div>
        )}

        {/* Ações — Rev. 1836: empilha em mobile, contador em cima */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-2">
          <p className="text-xs text-muted-foreground">
            {report.isLoading ? "Calculando..." : `${filtered.length} funcionário(s) com ocorrências no período`}
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={exportarPDF} disabled={!report.data || filtered.length === 0} data-testid="btn-faltas-pdf">
              <Printer className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">PDF / Imprimir</span><span className="sm:hidden">PDF</span>
            </Button>
            <Button size="sm" variant="outline" onClick={exportarExcel} disabled={!report.data || filtered.length === 0} data-testid="btn-faltas-excel">
              <FileDown className="h-4 w-4 mr-1" /> Excel
            </Button>
          </div>
        </div>

        {/* Tabela — Rev. 1836: wrapper overflow-x-auto + min-w pra evitar quebra das colunas numéricas */}
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-slate-100 text-xs">
              <tr>
                <th className="text-left p-2 w-8"></th>
                <th className="text-left p-2">Funcionário</th>
                <th className="text-left p-2 hidden md:table-cell">Cargo</th>
                <th className="text-center p-2 whitespace-nowrap"><span title="Faltas injustificadas">Inj.</span></th>
                <th className="text-center p-2 whitespace-nowrap"><span title="Faltas justificadas (com atestado)">Just.</span></th>
                <th className="text-center p-2 whitespace-nowrap"><span title="DSR perdido (semanas com falta)">DSR</span></th>
                <th className="text-center p-2 whitespace-nowrap"><span title="Atrasos">Atr.</span></th>
                <th className="text-center p-2 whitespace-nowrap"><span title="Saídas antecipadas">Saí.Ant.</span></th>
                <th className="text-center p-2 w-10"><span title="Abrir Espelho de Ponto">Esp.</span></th>
              </tr>
            </thead>
            <tbody>
              {report.isLoading && (
                <tr><td colSpan={9} className="text-center p-6 text-muted-foreground">Calculando relatório...</td></tr>
              )}
              {!report.isLoading && filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center p-6 text-muted-foreground">Nenhuma ocorrência no período selecionado.</td></tr>
              )}
              {filtered.map((f: any) => {
                const isExp = expandedIds.has(f.employeeId);
                return (
                  <React.Fragment key={f.employeeId}>
                    <tr className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => onToggleExpanded(f.employeeId)} data-testid={`row-faltas-${f.employeeId}`}>
                      <td className="p-2 align-top">{isExp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</td>
                      <td className="p-2 font-medium">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="break-words">{f.nomeCompleto}</span>
                          {f.matricula && <span className="text-xs text-muted-foreground">({f.matricula})</span>}
                          {f.status && f.status !== "Ativo" && <Badge variant="outline" className="text-xs">{f.status}</Badge>}
                        </div>
                        {/* Cargo embaixo do nome em mobile (oculto em md+) */}
                        {f.cargo && <div className="md:hidden text-xs text-muted-foreground mt-0.5 truncate">{f.cargo}</div>}
                      </td>
                      <td className="p-2 hidden md:table-cell text-xs text-muted-foreground max-w-[180px] truncate" title={f.cargo || ""}>{f.cargo || "-"}</td>
                      <td className="p-2 text-center font-bold text-rose-700 tabular-nums whitespace-nowrap">{f.injustificadas || ""}</td>
                      <td className="p-2 text-center text-cyan-700 tabular-nums whitespace-nowrap">{f.justificadas || ""}</td>
                      <td className="p-2 text-center text-purple-700 tabular-nums whitespace-nowrap">{f.dsrPerdido || ""}</td>
                      <td className="p-2 text-center text-yellow-700 tabular-nums whitespace-nowrap">
                        {f.atrasos || ""}{f.atrasos > 0 && <span className="text-xs text-muted-foreground"> ({fmtMin(f.minutosAtraso)})</span>}
                      </td>
                      <td className="p-2 text-center text-orange-700 tabular-nums whitespace-nowrap">
                        {f.saidasAntecipadas || ""}{f.saidasAntecipadas > 0 && <span className="text-xs text-muted-foreground"> ({fmtMin(f.minutosSaidaAntec)})</span>}
                      </td>
                      <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Abrir espelho de ponto deste funcionário no período"
                          data-testid={`btn-espelho-${f.employeeId}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = `/espelho-ponto?funcionario=${f.employeeId}&inicio=${encodeURIComponent(dataInicio)}&fim=${encodeURIComponent(dataFim)}`;
                            window.open(url, "_blank", "noopener,noreferrer");
                          }}
                        >
                          <ExternalLink className="h-4 w-4 text-blue-600" />
                        </Button>
                      </td>
                    </tr>
                    {isExp && (
                      <tr className="bg-slate-50">
                        <td></td>
                        <td colSpan={8} className="p-3">
                          <div className="text-xs text-muted-foreground mb-2">Datas com ocorrência:</div>
                          {(() => {
                            // Rev. 1839 — Quando filtrando por KPI específico (exceto DSR, que é derivado),
                            // os badges também são filtrados pelo tipo correspondente.
                            const detalhes = (f.detalhes || []) as any[];
                            const tipoAlvo = kpiFilter !== "all" && kpiFilter !== "dsrPerdido"
                              ? kpiToDetalheTipo[kpiFilter as Exclude<KpiKey, "all" | "dsrPerdido">]
                              : null;
                            const detalhesView = tipoAlvo ? detalhes.filter(d => d.tipo === tipoAlvo) : detalhes;
                            if (detalhesView.length === 0) {
                              return <div className="text-xs text-muted-foreground italic">Sem detalhes.</div>;
                            }
                            return (
                            <div className="flex flex-wrap gap-2">
                              {detalhesView.map((d: any, idx: number) => {
                                const cfg: any = {
                                  injustificada: { color: "border-rose-400 bg-rose-50 text-rose-800", icon: <UserX className="h-3 w-3" />, label: "Falta Inj." },
                                  justificada:   { color: "border-cyan-400 bg-cyan-50 text-cyan-800", icon: <CalendarX className="h-3 w-3" />, label: "Falta Just." },
                                  atraso:        { color: "border-yellow-400 bg-yellow-50 text-yellow-800", icon: <Timer className="h-3 w-3" />, label: "Atraso" },
                                  saida_antecipada: { color: "border-orange-400 bg-orange-50 text-orange-800", icon: <LogOut className="h-3 w-3" />, label: "Saída Ant." },
                                };
                                const c = cfg[d.tipo] || cfg.injustificada;
                                return (
                                  <div key={idx} className={`border-l-4 px-2 py-1 rounded text-xs ${c.color}`}>
                                    <div className="flex items-center gap-1 font-medium">
                                      {c.icon}
                                      {fmtBR(d.data)} — {c.label}
                                    </div>
                                    {d.descricao && <div className="text-[11px] opacity-80 mt-0.5">{d.descricao}</div>}
                                    {d.minutos ? <div className="text-[11px] opacity-80">{d.minutos} min</div> : null}
                                  </div>
                                );
                              })}
                            </div>
                            );
                          })()}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

    </FullScreenDialog>
  );
}
