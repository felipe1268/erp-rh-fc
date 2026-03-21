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
import { trpc } from "@/lib/trpc";
import { formatCPF, fmtNum } from "@/lib/formatters";
import { formatDateTime, nowBrasilia } from "@/lib/dateUtils";
import { removeAccents } from "@/lib/searchUtils";
import {
  Clock, Upload, FileSpreadsheet, Users, CalendarDays, AlertTriangle,
  PenLine, Eye, ChevronLeft, ChevronRight, CheckCircle, XCircle, Shield, Search,
  Trash2, Building2, AlertCircle, MapPin, Info, Wifi, Lock, Unlock, UserCheck, Printer, FileDown, ArrowLeft,
  ListChecks, Filter, ChevronDown, Zap, ArrowRightLeft, ArrowRight, FileText, Copy,
  ChevronsUpDown, Check, Plus, X
} from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useRef, useMemo, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import RaioXFuncionario from "@/components/RaioXFuncionario";

type ViewMode = "resumo" | "inconsistencias" | "detalhe" | "rateio" | "nao_identificados" | "memoria_dixi" | "simulador_horistas" | "descontos_clt";

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
type CardFilter = null | "colaboradores" | "registros" | "inconsistencias" | "ajustes" | "multiplasObras" | "conflitos";

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
  falta_dsr: "DSR Perdido",
  he_nao_autorizada: "HE Não Autorizada",
};
const TIPO_COLORS: Record<string, string> = {
  atraso: "bg-yellow-100 text-yellow-800",
  falta_injustificada: "bg-red-100 text-red-800",
  saida_antecipada: "bg-orange-100 text-orange-800",
  falta_dsr: "bg-purple-100 text-purple-800",
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
  const [activeSubTab, setActiveSubTab] = useState<"resumo" | "detalhes">("resumo");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterEmpId, setFilterEmpId] = useState<number | undefined>(undefined);
  const [abonoId, setAbonoId] = useState<number | null>(null);
  const [abonoMotivo, setAbonoMotivo] = useState("");

  const utils = trpc.useUtils();
  const totais = trpc.pontoDescontos.totaisMes.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  const resumo = trpc.pontoDescontos.listResumo.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
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
              <p className="text-xl font-bold text-purple-600">{t.totalDsr}</p>
              <p className="text-xs text-muted-foreground">DSR Perdidos</p>
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
      {t && t.totalEventos > 0 && (
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
                  <th className="p-2.5 text-center">DSR Perd.</th>
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
                        {r.totalDsrPerdidos > 0 ? <Badge className="bg-purple-100 text-purple-800">{r.totalDsrPerdidos}</Badge> : "-"}
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
                    <SelectItem value="falta_dsr">DSR Perdidos</SelectItem>
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
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
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
  const [manualEmpPopoverOpen, setManualEmpPopoverOpen] = useState(false);
  const [manualDays, setManualDays] = useState<Array<{id: string; data: string; entrada1: string; saida1: string; entrada2: string; saida2: string; entrada3: string; saida3: string; feriado?: boolean}>>([]);
  const [showRangePopover, setShowRangePopover] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); });
  const [manualSaving, setManualSaving] = useState(false);
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
  const stats = trpc.fechamentoPonto.getStats.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  const summary = trpc.fechamentoPonto.getSummary.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  const inconsistencies = trpc.fechamentoPonto.listInconsistencies.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  const employeeDetail = trpc.fechamentoPonto.getEmployeeDetail.useQuery(
    { companyId, employeeId: selectedEmployeeId!, mesReferencia: mesAno },
    { enabled: (companyId > 0 || companyIds.length > 0) && selectedEmployeeId !== null }
  );
  const obrasList = trpc.obras.listActive.useQuery({ companyId, companyIds }, { enabled: companyId > 0 || companyIds.length > 0 });
  const employeesList = trpc.employees.list.useQuery({ companyId, companyIds, excludeTerminated: true }, { enabled: companyId > 0 || companyIds.length > 0 });
  const monthStatuses = trpc.fechamentoPonto.getMonthStatuses.useQuery({ companyId, companyIds, ano: anoSelecionado }, { enabled: companyId > 0 || companyIds.length > 0 });
  const consolidacaoStatus = trpc.fechamentoPonto.getConsolidacaoStatus.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
  const conflitos = trpc.fechamentoPonto.getConflitosObraDia.useQuery({ companyId, companyIds, mesReferencia: mesAno }, { enabled: companyId > 0 || companyIds.length > 0 });
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

  const isConsolidado = consolidacaoStatus.data?.consolidado === true;

  // ===== MUTATIONS =====
  const uploadMut = trpc.fechamentoPonto.uploadDixi.useMutation({
    onSuccess: (data) => {
      setUploadResult(data);
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
  const manualBatchMut = trpc.fechamentoPonto.manualEntry.useMutation({
    onError: (err) => toast.error("Erro: " + err.message),
  });

  // Sync manualDays when dialog opens (pre-fill if opened from inconsistency)
  useEffect(() => {
    if (showManualDialog) {
      if (manualData.data) {
        setManualDays([{ id: String(Date.now()), data: manualData.data, entrada1: manualData.entrada1 || "", saida1: manualData.saida1 || "", entrada2: manualData.entrada2 || "", saida2: manualData.saida2 || "" }]);
      } else {
        setManualDays([]);
      }
    }
  }, [showManualDialog]);

  const gerarDiasUteisDoMes = (fromDay?: number, toDay?: number) => {
    const [y, m] = mesAno.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const start = Math.max(1, fromDay ?? 1);
    const end = Math.min(daysInMonth, toDay ?? daysInMonth);
    const emp = (employeesList.data || []).find((e: any) => e.id === manualData.employeeId);
    const jornada = emp?.jornadaTrabalho || null;
    const dias: typeof manualDays = [];
    const d = new Date(y, m - 1, start);
    while (d.getDate() <= end && d.getMonth() === m - 1) {
      const dow = d.getDay();
      const dateStr = d.toISOString().split("T")[0];
      const isWeekend = dow === 0 || dow === 6;
      // Weekends: add without times; weekdays: auto-fill schedule
      if (isWeekend) {
        dias.push({ id: `${dateStr}-${Math.random()}`, data: dateStr, entrada1: "", saida1: "", entrada2: "", saida2: "", entrada3: "", saida3: "" });
      } else {
        const sched = getScheduleForDay(jornada, dateStr);
        dias.push({ id: `${dateStr}-${Math.random()}`, data: dateStr, ...sched, entrada3: "", saida3: "" });
      }
      d.setDate(d.getDate() + 1);
    }
    setManualDays(dias);
  };

  const saveManualBatch = async () => {
    if (!manualData.employeeId) return toast.error("Selecione o colaborador");
    const filled = manualDays.filter(d => d.data);
    if (filled.length === 0) return toast.error("Adicione pelo menos um dia");
    setManualSaving(true);
    let saved = 0; let errors = 0;
    for (const day of filled) {
      try {
        await manualBatchMut.mutateAsync({ companyId, companyIds, employeeId: manualData.employeeId, obraId: manualData.obraId || undefined, mesReferencia: day.data.substring(0, 7), data: day.data, entrada1: day.entrada1 || undefined, saida1: day.saida1 || undefined, entrada2: day.entrada2 || undefined, saida2: day.saida2 || undefined, entrada3: day.entrada3 || undefined, saida3: day.saida3 || undefined, justificativa: manualData.justificativa || undefined });
        saved++;
      } catch { errors++; }
    }
    setManualSaving(false);
    stats.refetch(); summary.refetch(); conflitos.refetch();
    if (selectedEmployeeId) employeeDetail.refetch();
    if (errors === 0) { toast.success(`${saved} lançamento(s) salvo(s) com sucesso!`); setShowManualDialog(false); }
    else toast.warning(`${saved} salvo(s), ${errors} com erro.`);
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
    }));
    // Top 5 mais pontuais (menos atrasos, mais dias)
    const pontuais = [...data].filter(e => e.dias > 0).sort((a, b) => a.atrasos - b.atrasos || b.dias - a.dias).slice(0, 5);
    // Top 5 mais atrasados
    const atrasados = [...data].filter(e => e.atrasos > 0).sort((a, b) => b.atrasos - a.atrasos).slice(0, 5);
    // Top 5 mais horas extras
    const extras = [...data].filter(e => e.horasExtras > 0).sort((a, b) => b.horasExtras - a.horasExtras).slice(0, 5);
    // Top 5 menos dias (possíveis faltas)
    const faltosos = [...data].filter(e => e.dias >= 0).sort((a, b) => a.dias - b.dias).slice(0, 5);
    return { pontuais, atrasados, extras, faltosos, fmtHM };
  }, [summary.data]);

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
      await uploadMut.mutateAsync({ companyId, companyIds, files: filesData });
    } catch (e) { /* handled */ } finally {
      setUploading(false);
    }
  };

  const dayOfWeek = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()];
  };

  const openPontoDetalhe = (empId: number) => { setSelectedEmployeeId(empId); setViewMode("detalhe"); };
  const openRaioX = (empId: number) => setRaioXEmployeeId(empId);

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
          conteudo += `<tr style="background:${bgColor}"><td>${r.data ? new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</td><td>${dayOfWeek(r.data)}</td><td>${r.entrada1 || "-"}</td><td>${r.saida1 || "-"}</td><td>${r.entrada2 || "-"}</td><td>${r.saida2 || "-"}</td><td style="font-weight:600">${r.horasTrabalhadas || "-"}</td><td style="color:#16a34a;font-weight:600">${r.horasExtras && r.horasExtras !== "0:00" ? r.horasExtras : "-"}</td><td>${saldoStr}</td><td>${r.ajusteManual ? "Manual" : "DIXI"}</td><td>${hasIncons ? "⚠ Inconsistente" : "✓ OK"}</td></tr>`;
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
        <div className="grid gap-4 md:grid-cols-6">
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

                {/* ===== RANKINGS DE PONTUALIDADE ===== */}
                {!cardFilter && rankings && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Mais Pontuais */}
                    <Card className="border-t-4 border-t-green-500">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-green-700">
                          <CheckCircle className="h-3.5 w-3.5" /> Mais Pontuais
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="space-y-1">
                          {rankings.pontuais.map((e: any, i: number) => (
                            <div key={e.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold w-4 text-center ${i === 0 ? "text-green-600" : "text-muted-foreground"}`}>{i + 1}</span>
                                <button className="text-blue-700 hover:underline text-left truncate max-w-[120px]" onClick={() => openPontoDetalhe(e.id)}>{e.nome}</button>
                                <EmpStatusBadge status={e.status} />
                              </div>
                              <span className="text-green-600 font-mono">{e.atrasosStr === "0:00" ? "Sem atraso" : e.atrasosStr}</span>
                            </div>
                          ))}
                          {rankings.pontuais.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Sem dados</p>}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Mais Atrasados */}
                    <Card className="border-t-4 border-t-red-500">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-red-700">
                          <XCircle className="h-3.5 w-3.5" /> Mais Atrasados
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="space-y-1">
                          {rankings.atrasados.map((e: any, i: number) => (
                            <div key={e.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold w-4 text-center ${i === 0 ? "text-red-600" : "text-muted-foreground"}`}>{i + 1}</span>
                                <button className="text-blue-700 hover:underline text-left truncate max-w-[120px]" onClick={() => openPontoDetalhe(e.id)}>{e.nome}</button>
                                <EmpStatusBadge status={e.status} />
                              </div>
                              <span className="text-red-600 font-mono">{e.atrasosStr}</span>
                            </div>
                          ))}
                          {rankings.atrasados.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Nenhum atraso</p>}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Mais Horas Extras */}
                    <Card className="border-t-4 border-t-amber-500">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-amber-700">
                          <Zap className="h-3.5 w-3.5" /> Mais Horas Extras
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="space-y-1">
                          {rankings.extras.map((e: any, i: number) => (
                            <div key={e.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold w-4 text-center ${i === 0 ? "text-amber-600" : "text-muted-foreground"}`}>{i + 1}</span>
                                <button className="text-blue-700 hover:underline text-left truncate max-w-[120px]" onClick={() => openPontoDetalhe(e.id)}>{e.nome}</button>
                                <EmpStatusBadge status={e.status} />
                              </div>
                              <span className="text-amber-600 font-mono">{e.horasExtrasStr}</span>
                            </div>
                          ))}
                          {rankings.extras.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Sem extras</p>}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Menos Dias (Faltas) */}
                    <Card className="border-t-4 border-t-slate-500">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-slate-700">
                          <CalendarDays className="h-3.5 w-3.5" /> Menos Dias Trabalhados
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="space-y-1">
                          {rankings.faltosos.map((e: any, i: number) => (
                            <div key={e.id} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold w-4 text-center ${i === 0 ? "text-slate-600" : "text-muted-foreground"}`}>{i + 1}</span>
                                <button className="text-blue-700 hover:underline text-left truncate max-w-[120px]" onClick={() => openPontoDetalhe(e.id)}>{e.nome}</button>
                                <EmpStatusBadge status={e.status} />
                              </div>
                              <span className="text-slate-600 font-mono">{e.dias} dia{e.dias !== 1 ? "s" : ""}</span>
                            </div>
                          ))}
                          {rankings.faltosos.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Sem dados</p>}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
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
                                <tr key={emp.employeeId} className={`border-b last:border-0 hover:bg-muted/30 ${emp.temAjusteManual ? "bg-purple-50" : ""} ${hasConflict ? "bg-orange-50" : emp.multiplasObras ? "bg-red-50" : ""}`}>
                                  <td className="p-2">
                                    <button className="font-medium text-blue-700 hover:underline text-left" onClick={() => openPontoDetalhe(emp.employeeId)}>
                                      {emp.employeeName}
                                    </button>
                                    {emp.temAjusteManual && (
                                      <Badge variant="outline" className="ml-2 text-xs text-purple-600 border-purple-300"><PenLine className="h-3 w-3 mr-1" /> Ajuste</Badge>
                                    )}
                                    {emp.emAvisoPrevio && (
                                      <Badge variant="outline" className="ml-2 text-xs text-amber-600 border-amber-300 bg-amber-50">⚠ Aviso Prévio</Badge>
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
                                              onClick={(e) => { e.stopPropagation(); setManualData({ employeeId: inc.employeeId || 0, obraId: inc.obraId || 0, data: inc.data || "", entrada1: "", saida1: "", entrada2: "", saida2: "", justificativa: `Correção: ${inc.descricao}` }); setShowManualDialog(true); }}>
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
                                                <td className="px-3 py-1.5 text-center"><Badge variant={r.ajusteManual ? "secondary" : "outline"} className="text-[10px]">{r.ajusteManual ? "Manual" : "DIXI"}</Badge></td>
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
                                setManualData({ employeeId: selectedEmployeeId, obraId: 0, data: "", entrada1: "", saida1: "", entrada2: "", saida2: "", justificativa: "" });
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
                                        <Badge variant="outline" className="text-xs text-purple-600 border-purple-300"><PenLine className="h-3 w-3 mr-1" /> Manual</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs">DIXI</Badge>
                                      )}
                                    </td>
                                    <td className="p-2 text-center">
                                      {hasConflict ? (
                                        <Badge className="text-xs bg-orange-600 text-white"><AlertCircle className="h-3 w-3 mr-1" /> Conflito</Badge>
                                      ) : hasIncons ? (
                                        <Badge
                                          variant="destructive"
                                          className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
                                          onClick={() => {
                                            if (isConsolidado) return;
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
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Fechar</Button>
              {!uploadResult && (
                <Button onClick={handleUpload} disabled={uploading || uploadFiles.length === 0 || validating || (validationResult && !validationResult.allValid)} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  {uploading ? "Processando..." : "Importar"}
                </Button>
              )}
            </div>
          </div>
        </FullScreenDialog>

        {/* ===== MANUAL ENTRY DIALOG (FULL SCREEN) ===== */}
        <FullScreenDialog open={showManualDialog} onClose={() => setShowManualDialog(false)} title="Lançamento Manual" subtitle={`Competência: ${formatMesAno(mesAno)}`} icon={<PenLine className="h-5 w-5 text-white" />} headerColor="bg-gradient-to-r from-purple-800 to-purple-600">
          <div className="w-full max-w-4xl">
            <div className="space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 text-xs text-purple-800">
                Registros manuais ficam <strong>destacados</strong> e são rastreados. Você pode lançar vários dias de uma vez.
              </div>

              {/* Colaborador (combobox com busca) + Obra */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block">Colaborador</Label>
                  <Popover open={manualEmpPopoverOpen} onOpenChange={setManualEmpPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button type="button" className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-accent/10 focus:outline-none focus:ring-1 focus:ring-ring">
                        <span className={manualData.employeeId ? "text-foreground" : "text-muted-foreground"}>
                          {manualData.employeeId
                            ? (employeesList.data || []).find((e: any) => e.id === manualData.employeeId)?.nomeCompleto || "Colaborador"
                            : "Pesquisar colaborador..."}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" sideOffset={4}>
                      <Command>
                        <CommandInput placeholder="Digite nome ou função..." />
                        <CommandList className="max-h-64">
                          <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">Nenhum colaborador encontrado</CommandEmpty>
                          <CommandGroup>
                            {(employeesList.data || []).map((e: any) => (
                              <CommandItem key={e.id} value={`${e.nomeCompleto || ""} ${e.funcao || ""}`} onSelect={() => {
                                setManualData(p => ({ ...p, employeeId: e.id, obraId: e.obraAtualId || 0 }));
                                setManualEmpPopoverOpen(false);
                                // Auto-fill schedule on existing days
                                if (e.jornadaTrabalho) {
                                  setManualDays(prev => prev.map(d => d.data ? { ...d, ...getScheduleForDay(e.jornadaTrabalho, d.data) } : d));
                                }
                              }} className="flex items-center justify-between py-2 cursor-pointer">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-xs shrink-0">{(e.nomeCompleto || "").charAt(0)}</div>
                                  <div>
                                    <p className="font-medium text-sm">{e.nomeCompleto}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {e.funcao || ""}
                                      {e.obraAtualNome ? <span className="ml-1 text-purple-600">· {e.obraAtualNome}</span> : ""}
                                    </p>
                                  </div>
                                </div>
                                {manualData.employeeId === e.id && <Check className="h-4 w-4 text-purple-600 shrink-0" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="mb-1 block">Obra (opcional)</Label>
                  <Select value={String(manualData.obraId || "0")} onValueChange={v => setManualData(p => ({ ...p, obraId: v === "0" ? 0 : parseInt(v) }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">— Sem obra —</SelectItem>
                      {(obrasList.data || []).map((o: any) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tabela de dias */}
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <Label>Dias lançados <span className="text-muted-foreground font-normal text-xs">({manualDays.length} {manualDays.length === 1 ? "dia" : "dias"})</span></Label>
                  <div className="flex gap-2">
                    <Popover open={showRangePopover} onOpenChange={setShowRangePopover}>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="outline" className="text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50" type="button">
                          <CalendarDays className="h-3.5 w-3.5" /> Preencher período
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3" align="end">
                        <p className="text-xs font-semibold mb-3 text-foreground">Gerar dias automaticamente</p>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex-1">
                            <label className="text-[11px] text-muted-foreground mb-1 block">De dia</label>
                            <input
                              type="number" min={1} max={31} value={rangeFrom}
                              onChange={e => setRangeFrom(Math.max(1, Math.min(31, Number(e.target.value))))}
                              className="w-full border rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-400"
                            />
                          </div>
                          <span className="text-muted-foreground mt-4">→</span>
                          <div className="flex-1">
                            <label className="text-[11px] text-muted-foreground mb-1 block">Até dia</label>
                            <input
                              type="number" min={1} max={31} value={rangeTo}
                              onChange={e => setRangeTo(Math.max(1, Math.min(31, Number(e.target.value))))}
                              className="w-full border rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-400"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1 text-xs" type="button" onClick={() => setShowRangePopover(false)}>Cancelar</Button>
                          <Button size="sm" className="flex-1 text-xs bg-purple-600 hover:bg-purple-700 text-white" type="button" onClick={() => { gerarDiasUteisDoMes(rangeFrom, rangeTo); setShowRangePopover(false); }}>
                            Gerar
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setManualDays(p => [...p, { id: String(Date.now()), data: "", entrada1: "", saida1: "", entrada2: "", saida2: "", entrada3: "", saida3: "" }])} type="button">
                      <Plus className="h-3.5 w-3.5" /> Adicionar dia
                    </Button>
                  </div>
                </div>

                {manualDays.length === 0 ? (
                  <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground bg-muted/20">
                    Clique em <strong>"Adicionar dia"</strong> para inserir um dia, ou <strong>"Preencher período"</strong> para gerar dias automaticamente de {formatMesAno(mesAno)} — fins de semana aparecem sem horário.
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <div>
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 sticky top-0 z-10">
                          <tr>
                            <th className="px-1 py-1.5 text-left font-medium text-xs w-32">Data</th>
                            <th className="px-1 py-1.5 text-center font-medium text-xs w-10 text-muted-foreground">Dia</th>
                            <th className="px-1 py-1.5 text-center font-medium text-xs">Entrada</th>
                            <th className="px-1 py-1.5 text-center font-medium text-xs">Saída Int.</th>
                            <th className="px-1 py-1.5 text-center font-medium text-xs">Retorno</th>
                            <th className="px-1 py-1.5 text-center font-medium text-xs">Saída</th>
                            <th className="px-1 py-1.5 text-center font-medium text-xs text-blue-600">Entr. HE</th>
                            <th className="px-1 py-1.5 text-center font-medium text-xs text-blue-600">Saída HE</th>
                            <th className="px-1 py-1.5 text-center font-medium text-xs w-12 text-red-600">Falta</th>
                            <th className="px-1 py-1.5 text-center font-medium text-xs w-12 text-orange-600">Feriado</th>
                            <th className="px-1 py-1.5 w-6"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const selectedEmp = (employeesList.data || []).find((em: any) => em.id === manualData.employeeId);
                            return manualDays.map((day, idx) => {
                            const dow = day.data ? ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][new Date(day.data + "T12:00:00").getDay()] : "";
                            const dowNum = day.data ? new Date(day.data + "T12:00:00").getDay() : -1;
                            const isWeekend = [0, 6].includes(dowNum);
                            const isFeriadoMarcado = !!day.feriado;
                            const isRed = isWeekend || isFeriadoMarcado;
                            const isFaltaMarcada = !!(day.data && !isWeekend && !isFeriadoMarcado && !day.entrada1 && !day.saida1 && !day.entrada2 && !day.saida2);
                            // Schedule comparison for color coding
                            const sched = selectedEmp?.jornadaTrabalho && day.data ? getScheduleForDay(selectedEmp.jornadaTrabalho, day.data) : null;
                            const schedHasTimes = !!(sched?.entrada1 && sched?.saida2);
                            const hasAnyTime = !!(day.entrada1 || day.saida1 || day.entrada2 || day.saida2);
                            const isOnSchedule = !isRed && !isFaltaMarcada && hasAnyTime && schedHasTimes &&
                              day.entrada1 === sched!.entrada1 &&
                              day.saida1 === sched!.saida1 &&
                              day.entrada2 === sched!.entrada2 &&
                              day.saida2 === sched!.saida2;
                            // Overtime detection: worked more minutes than scheduled
                            const toMins = (t: string) => { if (!t) return 0; const [h,m] = t.split(':').map(Number); return (h||0)*60+(m||0); };
                            const workedMins = (day.entrada1 && day.saida1 ? toMins(day.saida1) - toMins(day.entrada1) : 0)
                              + (day.entrada2 && day.saida2 ? toMins(day.saida2) - toMins(day.entrada2) : 0);
                            const schedMins = schedHasTimes ? (
                              (sched!.entrada1 && sched!.saida1 ? toMins(sched!.saida1) - toMins(sched!.entrada1) : 0)
                              + (sched!.entrada2 && sched!.saida2 ? toMins(sched!.saida2) - toMins(sched!.entrada2) : 0)
                            ) : 0;
                            const isHorasExtras = !isRed && !isFaltaMarcada && !isOnSchedule && hasAnyTime && schedHasTimes && workedMins > schedMins && workedMins > 0;
                            const isOffSchedule = !isRed && !isFaltaMarcada && hasAnyTime && schedHasTimes && !isOnSchedule && !isHorasExtras;
                            const rowBg = isFaltaMarcada ? "bg-red-100/70"
                              : isRed ? "bg-red-50/60"
                              : isOnSchedule ? "bg-green-50/80"
                              : isHorasExtras ? "bg-blue-50/80"
                              : isOffSchedule ? "bg-amber-50/80"
                              : idx % 2 === 0 ? "" : "bg-muted/10";
                            return (
                              <tr key={day.id} className={`border-t ${rowBg}`}>
                                <td className="px-1 py-1">
                                  <Input type="date" value={day.data} className="h-7 text-xs w-full" onChange={e => {
                                    const newDate = e.target.value;
                                    const emp = (employeesList.data || []).find((em: any) => em.id === manualData.employeeId);
                                    const sc = newDate && emp?.jornadaTrabalho ? getScheduleForDay(emp.jornadaTrabalho, newDate) : null;
                                    setManualDays(p => p.map(d => d.id === day.id ? {
                                      ...d, data: newDate,
                                      entrada1: d.entrada1 || sc?.entrada1 || "",
                                      saida1: d.saida1 || sc?.saida1 || "",
                                      entrada2: d.entrada2 || sc?.entrada2 || "",
                                      saida2: d.saida2 || sc?.saida2 || "",
                                    } : d));
                                  }} />
                                </td>
                                <td className="px-1 py-1 text-center">
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className={`text-xs font-bold ${isRed || isFaltaMarcada ? "text-red-600" : isOnSchedule ? "text-green-700" : isHorasExtras ? "text-blue-700" : isOffSchedule ? "text-amber-700" : "text-muted-foreground"}`}>{dow}</span>
                                    {isFeriadoMarcado && <span className="text-[9px] text-orange-600 font-bold leading-none">feriado</span>}
                                    {isFaltaMarcada && <span className="text-[9px] text-red-700 font-bold leading-none">FALTA</span>}
                                    {isOnSchedule && <span className="text-[9px] text-green-700 font-bold leading-none">✓ OK</span>}
                                    {isHorasExtras && <span className="text-[9px] text-blue-700 font-bold leading-none">H.E.</span>}
                                    {isOffSchedule && <span className="text-[9px] text-amber-700 font-bold leading-none">DIFER.</span>}
                                  </div>
                                </td>
                                <td className="px-1 py-1"><Input type="time" value={day.entrada1} className={`h-7 text-xs w-[90px] font-mono ${isFaltaMarcada ? "opacity-40" : ""}`} onChange={e => setManualDays(p => p.map(d => d.id === day.id ? { ...d, entrada1: e.target.value } : d))} /></td>
                                <td className="px-1 py-1"><Input type="time" value={day.saida1} className={`h-7 text-xs w-[90px] font-mono ${isFaltaMarcada ? "opacity-40" : ""}`} onChange={e => setManualDays(p => p.map(d => d.id === day.id ? { ...d, saida1: e.target.value } : d))} /></td>
                                <td className="px-1 py-1"><Input type="time" value={day.entrada2} className={`h-7 text-xs w-[90px] font-mono ${isFaltaMarcada ? "opacity-40" : ""}`} onChange={e => setManualDays(p => p.map(d => d.id === day.id ? { ...d, entrada2: e.target.value } : d))} /></td>
                                <td className="px-1 py-1"><Input type="time" value={day.saida2} className={`h-7 text-xs w-[90px] font-mono ${isFaltaMarcada ? "opacity-40" : ""}`} onChange={e => setManualDays(p => p.map(d => d.id === day.id ? { ...d, saida2: e.target.value } : d))} /></td>
                                <td className="px-1 py-1"><Input type="time" value={day.entrada3 || ""} className={`h-7 text-xs w-[90px] font-mono border-blue-200 ${isFaltaMarcada ? "opacity-40" : ""}`} onChange={e => setManualDays(p => p.map(d => d.id === day.id ? { ...d, entrada3: e.target.value } : d))} /></td>
                                <td className="px-1 py-1"><Input type="time" value={day.saida3 || ""} className={`h-7 text-xs w-[90px] font-mono border-blue-200 ${isFaltaMarcada ? "opacity-40" : ""}`} onChange={e => setManualDays(p => p.map(d => d.id === day.id ? { ...d, saida3: e.target.value } : d))} /></td>
                                <td className="px-1 py-1 text-center">
                                  <button
                                    type="button"
                                    title={isFaltaMarcada ? "Desfazer falta (preencher horários)" : "Marcar como falta (apaga horários)"}
                                    onClick={() => {
                                      if (isFaltaMarcada) {
                                        const emp = (employeesList.data || []).find((em: any) => em.id === manualData.employeeId);
                                        const sc = day.data && emp?.jornadaTrabalho ? getScheduleForDay(emp.jornadaTrabalho, day.data) : null;
                                        setManualDays(p => p.map(d => d.id === day.id ? { ...d, entrada1: sc?.entrada1 || "", saida1: sc?.saida1 || "", entrada2: sc?.entrada2 || "", saida2: sc?.saida2 || "", entrada3: "", saida3: "" } : d));
                                      } else {
                                        setManualDays(p => p.map(d => d.id === day.id ? { ...d, entrada1: "", saida1: "", entrada2: "", saida2: "", entrada3: "", saida3: "" } : d));
                                      }
                                    }}
                                    className={`text-xs font-semibold px-1.5 py-0.5 rounded transition-colors ${isFaltaMarcada ? "bg-red-600 text-white hover:bg-red-700" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
                                  >
                                    {isFaltaMarcada ? "✕ Falta" : "Falta"}
                                  </button>
                                </td>
                                <td className="px-1 py-1 text-center">
                                  <button
                                    type="button"
                                    title={isFeriadoMarcado ? "Desmarcar feriado" : "Marcar como feriado (apaga horários)"}
                                    onClick={() => {
                                      if (isFeriadoMarcado) {
                                        const emp = (employeesList.data || []).find((em: any) => em.id === manualData.employeeId);
                                        const sc = day.data && emp?.jornadaTrabalho ? getScheduleForDay(emp.jornadaTrabalho, day.data) : null;
                                        setManualDays(p => p.map(d => d.id === day.id ? { ...d, feriado: false, entrada1: sc?.entrada1 || "", saida1: sc?.saida1 || "", entrada2: sc?.entrada2 || "", saida2: sc?.saida2 || "", entrada3: "", saida3: "" } : d));
                                      } else {
                                        setManualDays(p => p.map(d => d.id === day.id ? { ...d, feriado: true, entrada1: "", saida1: "", entrada2: "", saida2: "", entrada3: "", saida3: "" } : d));
                                      }
                                    }}
                                    className={`text-xs font-semibold px-1.5 py-0.5 rounded transition-colors ${isFeriadoMarcado ? "bg-orange-500 text-white hover:bg-orange-600" : "bg-orange-100 text-orange-700 hover:bg-orange-200"}`}
                                  >
                                    {isFeriadoMarcado ? "✕ Fer." : "Fer."}
                                  </button>
                                </td>
                                <td className="px-1 py-1 text-center">
                                  <button type="button" onClick={() => setManualDays(p => p.filter(d => d.id !== day.id))} className="text-muted-foreground hover:text-red-500 transition-colors">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Justificativa */}
              <div>
                <Label className="mb-1 block">Justificativa <span className="text-xs text-muted-foreground font-normal">(aplica-se a todos os dias)</span></Label>
                <Textarea value={manualData.justificativa} onChange={e => setManualData(p => ({ ...p, justificativa: e.target.value }))} placeholder="Motivo do lançamento manual..." rows={2} />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowManualDialog(false)}>Cancelar</Button>
              <Button onClick={saveManualBatch} disabled={manualSaving} className="bg-[#1B2A4A] hover:bg-[#243660] gap-2">
                {manualSaving ? "Salvando..." : `Salvar ${manualDays.filter(d => d.data).length > 1 ? manualDays.filter(d => d.data).length + " lançamentos" : "lançamento"}`}
              </Button>
            </div>
          </div>
        </FullScreenDialog>

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
                {clearMut.isPending ? "Limpando..." : "Confirmar Exclusão"}
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
                  <Input
                    type="time"
                    value={quickFixData.entrada1}
                    onChange={(e) => setQuickFixData(d => ({ ...d, entrada1: e.target.value }))}
                    className={!quickFixRec.entrada1 ? "border-amber-400 bg-amber-50" : ""}
                  />
                  {!quickFixRec.entrada1 && <span className="text-[10px] text-amber-600">* Faltando</span>}
                </div>
                <div>
                  <Label className="text-xs">Saída Int.</Label>
                  <Input
                    type="time"
                    value={quickFixData.saida1}
                    onChange={(e) => setQuickFixData(d => ({ ...d, saida1: e.target.value }))}
                    className={!quickFixRec.saida1 ? "border-amber-400 bg-amber-50" : ""}
                  />
                  {!quickFixRec.saida1 && <span className="text-[10px] text-amber-600">* Faltando</span>}
                </div>
                <div>
                  <Label className="text-xs">Retorno</Label>
                  <Input
                    type="time"
                    value={quickFixData.entrada2}
                    onChange={(e) => setQuickFixData(d => ({ ...d, entrada2: e.target.value }))}
                    className={!quickFixRec.entrada2 ? "border-amber-400 bg-amber-50" : ""}
                  />
                  {!quickFixRec.entrada2 && <span className="text-[10px] text-amber-600">* Faltando</span>}
                </div>
                <div>
                  <Label className="text-xs">Saída</Label>
                  <Input
                    type="time"
                    value={quickFixData.saida2}
                    onChange={(e) => setQuickFixData(d => ({ ...d, saida2: e.target.value }))}
                    className={!quickFixRec.saida2 ? "border-amber-400 bg-amber-50" : ""}
                  />
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
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
