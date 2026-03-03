import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  CalendarDays, ChevronLeft, ChevronRight, Play, Upload, Eye, Lock,
  DollarSign, CreditCard, AlertTriangle, CheckCircle, FileText, Users,
  Clock, TrendingUp, BarChart3, Settings, RefreshCw, ShieldCheck,
  ArrowRight, Info, Building2, Search, Filter, ChevronDown, ChevronUp,
  Printer, FileDown, Ban, Zap, Scale, AlertCircle, XCircle, Wallet
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import FullScreenDialog from "@/components/FullScreenDialog";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useMemo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const STATUS_LABELS: Record<string, string> = {
  nao_aberta: "Não Aberta", aberta: "Aberta", ponto_importado: "Ponto Importado",
  aferida: "Aferida", vale_gerado: "Vale Gerado", pagamento_simulado: "Pagamento Simulado",
  consolidada: "Consolidada", travada: "Travada",
};
const STATUS_COLORS: Record<string, string> = {
  nao_aberta: "bg-gray-100 text-gray-600", aberta: "bg-blue-100 text-blue-800", ponto_importado: "bg-cyan-100 text-cyan-800",
  aferida: "bg-purple-100 text-purple-800", vale_gerado: "bg-green-100 text-green-800",
  pagamento_simulado: "bg-orange-100 text-orange-800", consolidada: "bg-emerald-100 text-emerald-800", travada: "bg-gray-200 text-gray-700",
};

function formatBRL(val: string | number | null | undefined): string {
  if (!val) return "R$ 0,00";
  if (typeof val === "number") return `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const num = parseFloat(String(val).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."));
  if (isNaN(num)) return "R$ 0,00";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type ViewMode = "painel" | "timecard" | "vale" | "pagamento" | "divergencias" | "alertas" | "financeiro" | "custos_obra" | "criterios";

export default function PayrollCompetencias() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "admin_master";
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const now = new Date();
  const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());
  const [mesSelecionado, setMesSelecionado] = useState(now.getMonth() + 1);
  const mesRef = `${anoSelecionado}-${String(mesSelecionado).padStart(2, "0")}`;
  const [viewMode, setViewMode] = useState<ViewMode>("painel");
  const [searchTerm, setSearchTerm] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState<string | null>(null);
  const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null);
  const [showContracheque, setShowContracheque] = useState(false);
  const [selectedContrachequeEmployee, setSelectedContrachequeEmployee] = useState<number | undefined>(undefined);
  const utils = trpc.useUtils();

  // Queries
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
    { enabled: companyId > 0 && (viewMode === "vale" || viewMode === "painel") }
  );
  const pagamentos = trpc.payrollEngine.listarPagamentos.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 && (viewMode === "pagamento" || viewMode === "painel") }
  );
  const timecards = trpc.payrollEngine.listarTimecardDaily.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 && viewMode === "timecard" }
  );
  const divergencias = trpc.payrollEngine.relatorioDivergencias.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 && viewMode === "divergencias" }
  );
  const alertas = trpc.payrollEngine.listarAlertas.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 && viewMode === "alertas" }
  );
  const financeiro = trpc.payrollEngine.listarEventosFinanceiros.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 && viewMode === "financeiro" }
  );
  const custosObra = trpc.payrollEngine.custoPorObra.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 && viewMode === "custos_obra" }
  );
  const criterios = trpc.payrollEngine.getCriterios.useQuery(
    { companyId },
    { enabled: companyId > 0 && viewMode === "criterios" }
  );

  // Mutations
  const openPeriod = trpc.payrollEngine.openPeriod.useMutation({
    onSuccess: (d) => { toast.success(d.message); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });
  const processarPonto = trpc.payrollEngine.processarPonto.useMutation({
    onSuccess: (d) => { toast.success(d.message); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });
  const realizarAfericao = trpc.payrollEngine.realizarAfericao.useMutation({
    onSuccess: (d) => { toast.success(d.message); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });
  const gerarVale = trpc.payrollEngine.gerarVale.useMutation({
    onSuccess: (d) => { toast.success(d.message); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });
  const simularPagamento = trpc.payrollEngine.simularPagamento.useMutation({
    onSuccess: (d) => { toast.success(d.message); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });
  const consolidarPagamento = trpc.payrollEngine.consolidarPagamento.useMutation({
    onSuccess: (d) => { toast.success(d.message); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });
  const travarCompetencia = trpc.payrollEngine.travarCompetencia.useMutation({
    onSuccess: (d) => { toast.success(d.message); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });
  const salvarCriterio = trpc.payrollEngine.salvarCriterio.useMutation({
    onSuccess: () => { toast.success("Critério salvo!"); utils.payrollEngine.getCriterios.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  function invalidateAll() {
    utils.payrollEngine.resumoCompetencia.invalidate();
    utils.payrollEngine.getPeriod.invalidate();
    utils.payrollEngine.listarVales.invalidate();
    utils.payrollEngine.listarPagamentos.invalidate();
    utils.payrollEngine.listarTimecardDaily.invalidate();
    utils.payrollEngine.relatorioDivergencias.invalidate();
    utils.payrollEngine.listarAlertas.invalidate();
    utils.payrollEngine.listarEventosFinanceiros.invalidate();
  }

  const periodData = period.data;
  const resumoData = resumo.data;
  const currentStatus = periodData?.status || "nao_aberta";
  const isTravada = currentStatus === "travada";

  function handleAction(action: string) {
    if (action === "abrir") openPeriod.mutate({ companyId, mesReferencia: mesRef });
    else if (action === "processar") processarPonto.mutate({ companyId, mesReferencia: mesRef });
    else if (action === "aferir") realizarAfericao.mutate({ companyId, mesReferencia: mesRef });
    else if (action === "vale") gerarVale.mutate({ companyId, mesReferencia: mesRef });
    else if (action === "simular") simularPagamento.mutate({ companyId, mesReferencia: mesRef });
    else if (action === "consolidar") consolidarPagamento.mutate({ companyId, mesReferencia: mesRef });
    else if (action === "travar") travarCompetencia.mutate({ companyId, mesReferencia: mesRef });
    setShowConfirmDialog(null);
  }

  const isLoading = openPeriod.isPending || processarPonto.isPending || realizarAfericao.isPending ||
    gerarVale.isPending || simularPagamento.isPending || consolidarPagamento.isPending || travarCompetencia.isPending;

  // ============================================================
  // TIMECARD VIEW
  // ============================================================
  if (viewMode === "timecard") {
    const data = (timecards.data || []) as any[];
    const filtered = searchTerm
      ? data.filter((r: any) => r.nomeCompleto?.toLowerCase().includes(searchTerm.toLowerCase()))
      : data;
    const grouped = new Map<number, any[]>();
    for (const r of filtered) {
      const list = grouped.get(r.employeeId) || [];
      list.push(r);
      grouped.set(r.employeeId, list);
    }
    return (
      <DashboardLayout>
        <div className="w-full min-h-screen bg-background p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("painel")}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <h1 className="text-xl font-bold">Cartão de Ponto Diário — {MESES[mesSelecionado - 1]} {anoSelecionado}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar funcionário..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-xs" />
            <Badge variant="outline">{grouped.size} funcionários</Badge>
            <Badge variant="outline">{data.length} registros</Badge>
          </div>
          <div className="space-y-3">
            {Array.from(grouped.entries()).map(([empId, records]) => {
              const emp = records[0];
              const faltas = records.filter((r: any) => r.isFalta).length;
              const escuro = records.filter((r: any) => r.statusDia === "escuro").length;
              const aferido = records.filter((r: any) => r.statusDia === "aferido").length;
              const registrado = records.filter((r: any) => r.statusDia === "registrado").length;
              const isExpanded = expandedEmployee === empId;
              return (
                <Card key={empId} className="border">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedEmployee(isExpanded ? null : empId)}>
                      <div className="flex items-center gap-3">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">{emp.nomeCompleto}</p>
                          <p className="text-xs text-muted-foreground">{emp.funcao} • {emp.codigoInterno}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-100 text-green-800 text-xs">{registrado} reg.</Badge>
                        {escuro > 0 && <Badge className="bg-amber-100 text-amber-800 text-xs">{escuro} escuro</Badge>}
                        {aferido > 0 && <Badge className="bg-purple-100 text-purple-800 text-xs">{aferido} aferido</Badge>}
                        {faltas > 0 && <Badge className="bg-red-100 text-red-800 text-xs">{faltas} faltas</Badge>}
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 border-t pt-3">
                        {/* Timeline visual */}
                        <div className="flex flex-wrap gap-1 mb-3">
                          {records.sort((a: any, b: any) => a.data.localeCompare(b.data)).map((r: any) => {
                            const day = new Date(r.data + "T12:00:00").getDate();
                            const color = r.isFalta ? "bg-red-400" : r.statusDia === "escuro" ? "bg-amber-300" : r.statusDia === "aferido" ? "bg-purple-400" : "bg-green-400";
                            const title = `${day}/${mesSelecionado} - ${r.statusDia}${r.isFalta ? " (FALTA)" : ""}${r.isAtraso ? ` (Atraso ${r.minutosAtraso}min)` : ""}`;
                            return (
                              <div key={r.data} className={`w-7 h-7 rounded text-[10px] flex items-center justify-center text-white font-bold ${color}`} title={title}>
                                {day}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground mb-2">
                          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-400" /> Registrado</span>
                          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-300" /> Fechado no Escuro</span>
                          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-purple-400" /> Aferido</span>
                          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-400" /> Falta</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b text-left">
                                <th className="p-1">Data</th>
                                <th className="p-1">Status</th>
                                <th className="p-1">Entrada</th>
                                <th className="p-1">Saída</th>
                                <th className="p-1">Horas</th>
                                <th className="p-1">HE</th>
                                <th className="p-1">Atraso</th>
                                <th className="p-1">Falta</th>
                              </tr>
                            </thead>
                            <tbody>
                              {records.sort((a: any, b: any) => a.data.localeCompare(b.data)).map((r: any) => (
                                <tr key={r.data} className="border-b hover:bg-muted/50">
                                  <td className="p-1">{new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                                  <td className="p-1">
                                    <Badge className={`text-[10px] ${r.statusDia === "registrado" ? "bg-green-100 text-green-800" : r.statusDia === "escuro" ? "bg-amber-100 text-amber-800" : "bg-purple-100 text-purple-800"}`}>
                                      {r.statusDia === "registrado" ? "Registrado" : r.statusDia === "escuro" ? "No Escuro" : "Aferido"}
                                    </Badge>
                                  </td>
                                  <td className="p-1">{r.horaEntrada || "-"}</td>
                                  <td className="p-1">{r.horaSaida || "-"}</td>
                                  <td className="p-1">{r.horasTrabalhadas || "-"}</td>
                                  <td className="p-1">{r.horasExtras && r.horasExtras !== "0:00" ? r.horasExtras : "-"}</td>
                                  <td className="p-1">{r.minutosAtraso > 0 ? `${r.minutosAtraso}min` : "-"}</td>
                                  <td className="p-1">{r.isFalta ? <XCircle className="h-3 w-3 text-red-500" /> : <CheckCircle className="h-3 w-3 text-green-500" />}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {grouped.size === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum registro de ponto processado para esta competência</p>
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // VALE VIEW
  // ============================================================
  if (viewMode === "vale") {
    const data = (vales.data || []) as any[];
    const filtered = searchTerm
      ? data.filter((r: any) => r.nomeCompleto?.toLowerCase().includes(searchTerm.toLowerCase()))
      : data;
    const totalVale = filtered.reduce((s: number, r: any) => s + parseFloat(r.valorTotalVale || "0"), 0);
    const bloqueados = filtered.filter((r: any) => r.bloqueado).length;
    return (
      <DashboardLayout>
        <div className="w-full min-h-screen bg-background p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("painel")}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <h1 className="text-xl font-bold">Adiantamento / Vale — {MESES[mesSelecionado - 1]} {anoSelecionado}</h1>
            <PrintActions />
          </div>
          <div className="print-only"><PrintHeader title={`Adiantamento Salarial — ${MESES[mesSelecionado - 1]} ${anoSelecionado}`} /></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Funcionários</p>
              <p className="text-2xl font-bold">{data.length}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Vale</p>
              <p className="text-2xl font-bold text-green-600">{formatBRL(totalVale)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Bloqueados</p>
              <p className="text-2xl font-bold text-red-600">{bloqueados}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Liberados</p>
              <p className="text-2xl font-bold text-blue-600">{data.length - bloqueados}</p>
            </CardContent></Card>
          </div>
          <div className="flex items-center gap-2 no-print">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar funcionário..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-xs" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left bg-muted/50">
                  <th className="p-2">Funcionário</th>
                  <th className="p-2">Função</th>
                  <th className="p-2 text-right">Salário Bruto</th>
                  <th className="p-2 text-right">40% Adiant.</th>
                  <th className="p-2 text-right">Horas Extras</th>
                  <th className="p-2 text-right">Total Vale</th>
                  <th className="p-2 text-center">Faltas</th>
                  <th className="p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.employeeId} className={`border-b hover:bg-muted/30 ${r.bloqueado ? "opacity-60" : ""}`}>
                    <td className="p-2 font-medium">{r.nomeCompleto}</td>
                    <td className="p-2 text-muted-foreground text-xs">{r.funcao}</td>
                    <td className="p-2 text-right">{formatBRL(r.salarioBrutoMes)}</td>
                    <td className="p-2 text-right">{formatBRL(r.valorAdiantamento)}</td>
                    <td className="p-2 text-right">{formatBRL(r.valorHorasExtras)}</td>
                    <td className="p-2 text-right font-bold">{formatBRL(r.valorTotalVale)}</td>
                    <td className="p-2 text-center">{r.faltasNoPeriodo || 0}</td>
                    <td className="p-2 text-center">
                      {r.bloqueado ? (
                        <Badge className="bg-red-100 text-red-800 text-xs"><Ban className="h-3 w-3 mr-1" />Bloqueado</Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-800 text-xs"><CheckCircle className="h-3 w-3 mr-1" />Liberado</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold bg-muted/30">
                  <td className="p-2" colSpan={5}>TOTAL</td>
                  <td className="p-2 text-right">{formatBRL(totalVale)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="print-only"><PrintFooterLGPD /></div>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // PAGAMENTO VIEW
  // ============================================================
  if (viewMode === "pagamento") {
    const data = (pagamentos.data || []) as any[];
    const filtered = searchTerm
      ? data.filter((r: any) => r.nomeCompleto?.toLowerCase().includes(searchTerm.toLowerCase()))
      : data;
    const totalLiquido = filtered.reduce((s: number, r: any) => s + parseFloat(r.salarioLiquido || "0"), 0);
    const totalBruto = filtered.reduce((s: number, r: any) => s + parseFloat(r.salarioBrutoMes || "0"), 0);
    return (
      <DashboardLayout>
        <div className="w-full min-h-screen bg-background p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("painel")}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <h1 className="text-xl font-bold">Pagamento — {MESES[mesSelecionado - 1]} {anoSelecionado}</h1>
            <PrintActions />
            <Button variant="outline" size="sm" className="no-print" onClick={() => setShowContracheque(true)}><FileText className="h-4 w-4 mr-1" /> Contracheque</Button>
          </div>
          <div className="print-only"><PrintHeader title={`Folha de Pagamento — ${MESES[mesSelecionado - 1]} ${anoSelecionado}`} /></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Funcionários</p>
              <p className="text-2xl font-bold">{data.length}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Bruto</p>
              <p className="text-2xl font-bold">{formatBRL(totalBruto)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Líquido</p>
              <p className="text-2xl font-bold text-green-600">{formatBRL(totalLiquido)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="text-lg font-bold">{data[0]?.status === "consolidado" ? "Consolidado" : "Simulado"}</p>
            </CardContent></Card>
          </div>
          <div className="flex items-center gap-2 no-print">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar funcionário..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-xs" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left bg-muted/50">
                  <th className="p-2">Funcionário</th>
                  <th className="p-2 text-right">Salário Bruto</th>
                  <th className="p-2 text-right">Horas Extras</th>
                  <th className="p-2 text-right">(-) Adiant.</th>
                  <th className="p-2 text-right">(-) Faltas</th>
                  <th className="p-2 text-right">(-) VR/VT</th>
                  <th className="p-2 text-right">(-) Acertos</th>
                  <th className="p-2 text-right font-bold">Líquido</th>
                  <th className="p-2 text-center no-print">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <>
                    <tr key={r.employeeId} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedEmployee(expandedEmployee === r.employeeId ? null : r.employeeId)}>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          {expandedEmployee === r.employeeId ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          <div>
                            <p className="font-medium">{r.nomeCompleto}</p>
                            <p className="text-xs text-muted-foreground">{r.funcao}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-2 text-right">{formatBRL(r.salarioBrutoMes)}</td>
                      <td className="p-2 text-right text-blue-600">{formatBRL(r.horasExtrasValor)}</td>
                      <td className="p-2 text-right text-red-600">-{formatBRL(r.descontoAdiantamento)}</td>
                      <td className="p-2 text-right text-red-600">-{formatBRL(r.descontoFaltas)}</td>
                      <td className="p-2 text-right text-red-600">-{formatBRL(parseFloat(r.descontoVrFaltas || "0") + parseFloat(r.descontoVtFaltas || "0"))}</td>
                      <td className="p-2 text-right text-red-600">-{formatBRL(r.acertoEscuroValor)}</td>
                      <td className="p-2 text-right font-bold text-green-700">{formatBRL(r.salarioLiquido)}</td>
                      <td className="p-2 text-center no-print">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedContrachequeEmployee(r.employeeId); setShowContracheque(true); }}>
                          <FileText className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                    {expandedEmployee === r.employeeId && (
                      <tr key={`${r.employeeId}-details`} className="bg-muted/20">
                        <td colSpan={9} className="p-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            <div><span className="text-muted-foreground">Valor/Hora:</span> <span className="font-medium">{formatBRL(r.valorHora)}</span></div>
                            <div><span className="text-muted-foreground">Carga Horária:</span> <span className="font-medium">{r.cargaHorariaDiaria}h/dia</span></div>
                            <div><span className="text-muted-foreground">Dias Úteis:</span> <span className="font-medium">{r.diasUteisNoMes}</span></div>
                            <div><span className="text-muted-foreground">Faltas:</span> <span className="font-medium text-red-600">{r.descontoFaltasQtd || 0}</span></div>
                            <div><span className="text-muted-foreground">Atrasos (min):</span> <span className="font-medium">{r.descontoAtrasosMinutos || 0}</span></div>
                            <div><span className="text-muted-foreground">(-) VR Faltas:</span> <span className="font-medium text-red-600">{formatBRL(r.descontoVrFaltas)}</span></div>
                            <div><span className="text-muted-foreground">(-) VT Faltas:</span> <span className="font-medium text-red-600">{formatBRL(r.descontoVtFaltas)}</span></div>
                            <div><span className="text-muted-foreground">(-) Pensão:</span> <span className="font-medium text-red-600">{formatBRL(r.descontoPensao)}</span></div>
                            <div><span className="text-muted-foreground">(-) Atrasos:</span> <span className="font-medium text-red-600">{formatBRL(r.descontoAtrasos)}</span></div>
                            <div><span className="text-muted-foreground">Acerto Escuro:</span> <span className="font-medium text-red-600">{formatBRL(r.acertoEscuroValor)}</span></div>
                            <div><span className="text-muted-foreground">Data Pgto:</span> <span className="font-medium">{r.dataPagamentoPrevista ? new Date(r.dataPagamentoPrevista + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</span></div>
                            <div><span className="text-muted-foreground">Total Descontos:</span> <span className="font-medium text-red-600">{formatBRL(r.totalDescontos)}</span></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold bg-muted/30">
                  <td className="p-2">TOTAL ({filtered.length})</td>
                  <td className="p-2 text-right">{formatBRL(totalBruto)}</td>
                  <td colSpan={5}></td>
                  <td className="p-2 text-right text-green-700">{formatBRL(totalLiquido)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="print-only"><PrintFooterLGPD /></div>

          {/* Contracheque Dialog */}
          {showContracheque && (
            <ContrachequeDialog
              companyId={companyId}
              mesReferencia={mesRef}
              employeeId={selectedContrachequeEmployee}
              onClose={() => { setShowContracheque(false); setSelectedContrachequeEmployee(undefined); }}
            />
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // DIVERGENCIAS VIEW
  // ============================================================
  if (viewMode === "divergencias") {
    const data = (divergencias.data || []) as any[];
    return (
      <DashboardLayout>
        <div className="w-full min-h-screen bg-background p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("painel")}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <h1 className="text-xl font-bold">Relatório de Divergências — {MESES[mesSelecionado - 1]} {anoSelecionado}</h1>
            <PrintActions />
          </div>
          <div className="print-only"><PrintHeader title={`Relatório de Divergências — ${MESES[mesSelecionado - 1]} ${anoSelecionado}`} /></div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">O que são divergências?</p>
                <p className="text-sm text-amber-700">São diferenças encontradas entre o que foi presumido no período "Fechado no Escuro" e o que foi efetivamente registrado no ponto quando a aferição foi realizada.</p>
              </div>
            </div>
          </div>
          {data.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400" />
              <p className="font-medium">Nenhuma divergência encontrada</p>
              <p className="text-sm">Todos os dias aferidos confirmaram o que foi presumido.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left bg-muted/50">
                    <th className="p-2">Funcionário</th>
                    <th className="p-2">Data</th>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Presumido</th>
                    <th className="p-2">Real</th>
                    <th className="p-2">Mês Desconto</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="p-2 font-medium">{r.nomeCompleto}</td>
                      <td className="p-2">{r.data ? new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</td>
                      <td className="p-2"><Badge className="bg-red-100 text-red-800 text-xs">{r.tipo || "Falta"}</Badge></td>
                      <td className="p-2 text-green-600">Trabalhado normalmente</td>
                      <td className="p-2 text-red-600">{r.descricaoReal || "Falta identificada"}</td>
                      <td className="p-2">{r.mesDesconto || mesRef}</td>
                      <td className="p-2"><Badge className={r.status === "aplicado" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>{r.status === "aplicado" ? "Descontado" : "Pendente"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="print-only"><PrintFooterLGPD /></div>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // ALERTAS VIEW
  // ============================================================
  if (viewMode === "alertas") {
    const data = (alertas.data || []) as any[];
    return (
      <DashboardLayout>
        <div className="w-full min-h-screen bg-background p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("painel")}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <h1 className="text-xl font-bold">Alertas — {MESES[mesSelecionado - 1]} {anoSelecionado}</h1>
          </div>
          {data.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-400" />
              <p>Nenhum alerta para esta competência</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.map((a: any) => (
                <Card key={a.id} className={`border-l-4 ${a.tipo === "erro" ? "border-l-red-500" : a.tipo === "aviso" ? "border-l-amber-500" : "border-l-blue-500"}`}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {a.tipo === "erro" ? <AlertCircle className="h-5 w-5 text-red-500" /> : a.tipo === "aviso" ? <AlertTriangle className="h-5 w-5 text-amber-500" /> : <Info className="h-5 w-5 text-blue-500" />}
                      <div>
                        <p className="font-medium text-sm">{a.titulo}</p>
                        <p className="text-xs text-muted-foreground">{a.descricao}</p>
                      </div>
                    </div>
                    <Badge className={a.lido ? "bg-gray-100 text-gray-600" : "bg-blue-100 text-blue-800"}>{a.lido ? "Lido" : "Novo"}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // FINANCEIRO VIEW
  // ============================================================
  if (viewMode === "financeiro") {
    const data = (financeiro.data || []) as any[];
    const totalSaidas = data.filter((r: any) => r.tipo?.startsWith("saida")).reduce((s: number, r: any) => s + parseFloat(r.valor || "0"), 0);
    return (
      <DashboardLayout>
        <div className="w-full min-h-screen bg-background p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("painel")}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <h1 className="text-xl font-bold">Eventos Financeiros — {MESES[mesSelecionado - 1]} {anoSelecionado}</h1>
            <PrintActions />
          </div>
          <div className="print-only"><PrintHeader title={`Eventos Financeiros — ${MESES[mesSelecionado - 1]} ${anoSelecionado}`} /></div>
          <Card><CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Saídas Previstas</p>
            <p className="text-2xl font-bold text-red-600">{formatBRL(totalSaidas)}</p>
          </CardContent></Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left bg-muted/50">
                  <th className="p-2">Tipo</th>
                  <th className="p-2">Funcionário</th>
                  <th className="p-2">Data Prevista</th>
                  <th className="p-2 text-right">Valor</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="p-2"><Badge className="text-xs">{r.tipo?.replace("saida_", "Saída ").replace("entrada_", "Entrada ")}</Badge></td>
                    <td className="p-2">{r.employeeName || "-"}</td>
                    <td className="p-2">{r.dataPrevista ? new Date(r.dataPrevista + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</td>
                    <td className="p-2 text-right font-medium">{formatBRL(r.valor)}</td>
                    <td className="p-2"><Badge className={r.status === "pago" ? "bg-green-100 text-green-800" : r.status === "consolidado" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}>{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="print-only"><PrintFooterLGPD /></div>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // CUSTOS POR OBRA VIEW
  // ============================================================
  if (viewMode === "custos_obra") {
    const obraData = custosObra.data;
    return (
      <DashboardLayout>
        <div className="w-full min-h-screen bg-background p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("painel")}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <h1 className="text-xl font-bold">Custo por Obra — {MESES[mesSelecionado - 1]} {anoSelecionado}</h1>
            <PrintActions />
          </div>
          <div className="print-only"><PrintHeader title={`Custo por Obra — ${MESES[mesSelecionado - 1]} ${anoSelecionado}`} /></div>
          {!obraData || (obraData.porObra?.length === 0 && obraData.timecardPorObra?.length === 0) ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum dado de custo por obra para esta competência</p>
            </div>
          ) : (
            <>
              {obraData.porObra?.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-2">Pagamentos por Obra</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left bg-muted/50">
                          <th className="p-2">Obra</th>
                          <th className="p-2 text-center">Funcionários</th>
                          <th className="p-2 text-right">Total Bruto</th>
                          <th className="p-2 text-right">Total Líquido</th>
                          <th className="p-2 text-right">Horas Extras</th>
                        </tr>
                      </thead>
                      <tbody>
                        {obraData.porObra.map((r: any, i: number) => (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            <td className="p-2 font-medium">{r.obraNome || "Sem obra"}</td>
                            <td className="p-2 text-center">{r.totalFuncionarios}</td>
                            <td className="p-2 text-right">{formatBRL(r.totalBruto)}</td>
                            <td className="p-2 text-right">{formatBRL(r.totalLiquido)}</td>
                            <td className="p-2 text-right">{formatBRL(r.totalHE)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {obraData.timecardPorObra?.length > 0 && (
                <div className="mt-4">
                  <h2 className="text-lg font-semibold mb-2">Ponto por Obra</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left bg-muted/50">
                          <th className="p-2">Obra</th>
                          <th className="p-2 text-center">Funcionários</th>
                          <th className="p-2 text-center">Total Dias</th>
                          <th className="p-2 text-center">Faltas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {obraData.timecardPorObra.map((r: any, i: number) => (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            <td className="p-2 font-medium">{r.obraNome || "Sem obra"}</td>
                            <td className="p-2 text-center">{r.totalFuncionarios}</td>
                            <td className="p-2 text-center">{r.totalDias}</td>
                            <td className="p-2 text-center text-red-600">{r.totalFaltas}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
          <div className="print-only"><PrintFooterLGPD /></div>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // CRITÉRIOS VIEW
  // ============================================================
  if (viewMode === "criterios") {
    const CRITERIOS_CONFIG = [
      { chave: "ponto_dia_corte", label: "Dia de Corte do Ponto", descricao: "Dia do mês em que o ponto é cortado (padrão: 15)", tipo: "number" },
      { chave: "folha_percentual_adiantamento", label: "Percentual do Adiantamento", descricao: "% do salário para o vale (padrão: 40)", tipo: "number" },
      { chave: "folha_dia_adiantamento", label: "Dia do Adiantamento", descricao: "Dia do mês para pagamento do vale (padrão: 20)", tipo: "number" },
      { chave: "folha_dia_pagamento_util", label: "Dia Útil do Pagamento", descricao: "N-ésimo dia útil do mês seguinte (padrão: 5)", tipo: "number" },
      { chave: "folha_max_faltas_vale", label: "Máx. Faltas para Vale", descricao: "Acima desse número de faltas, o vale é bloqueado (padrão: 5)", tipo: "number" },
      { chave: "folha_carga_horaria_diaria", label: "Carga Horária Diária", descricao: "Horas de trabalho por dia (padrão: 8)", tipo: "number" },
      { chave: "folha_fechar_no_escuro", label: "Fechar no Escuro", descricao: "Presumir trabalho normal nos dias sem ponto (padrão: sim)", tipo: "select", opcoes: ["sim", "nao"] },
      { chave: "folha_descontar_vr_falta", label: "Descontar VR por Falta", descricao: "Descontar VR nos dias de falta (padrão: sim)", tipo: "select", opcoes: ["sim", "nao"] },
      { chave: "folha_descontar_vt_falta", label: "Descontar VT por Falta", descricao: "Descontar VT nos dias de falta (padrão: sim)", tipo: "select", opcoes: ["sim", "nao"] },
    ];
    const criteriosObj = criterios.data || {} as any;
    // Map criteria keys to their values from the returned object
    const CRITERIOS_KEY_MAP: Record<string, string> = {
      "ponto_dia_corte": String(criteriosObj.diaCorte ?? "15"),
      "adiantamento_percentual": String(criteriosObj.percentualAdiantamento ?? "40"),
      "adiantamento_dia": String(criteriosObj.diaAdiantamento ?? "20"),
      "pagamento_dia_util": String(criteriosObj.diaPagamento ?? "5"),
      "adiantamento_max_faltas": String(criteriosObj.maxFaltasVale ?? "5"),
      "jornada_horas_diarias": String(criteriosObj.cargaHorariaDiaria ?? "8"),
      "fechar_no_escuro": criteriosObj.fecharNoEscuro === false ? "nao" : "sim",
      "folha_descontar_vr_falta": criteriosObj.descontoVrFalta === false ? "nao" : "sim",
      "folha_descontar_vt_falta": criteriosObj.descontoVtFalta === false ? "nao" : "sim",
    };
    const criteriosMap = new Map<string, string>(Object.entries(CRITERIOS_KEY_MAP));
    return (
      <DashboardLayout>
        <div className="w-full min-h-screen bg-background p-4 md:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("painel")}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <h1 className="text-xl font-bold">Critérios Configuráveis</h1>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-blue-800">Flexibilidade para cada empresa</p>
                <p className="text-sm text-blue-700">Esses critérios permitem ajustar o fechamento de ponto e folha conforme a necessidade de cada empresa. Os valores padrão seguem a convenção coletiva mais comum.</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {CRITERIOS_CONFIG.map((c) => {
              const valorAtual = criteriosMap.get(c.chave) || "";
              return (
                <Card key={c.chave}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{c.descricao}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.tipo === "select" ? (
                        <Select
                          value={valorAtual || c.opcoes?.[0] || ""}
                          onValueChange={(v) => salvarCriterio.mutate({ companyId, chave: c.chave, valor: v })}
                        >
                          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {c.opcoes?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type="number"
                          className="w-24 text-center"
                          value={valorAtual}
                          placeholder="Padrão"
                          onBlur={(e) => {
                            if (e.target.value && e.target.value !== valorAtual) {
                              salvarCriterio.mutate({ companyId, chave: c.chave, valor: e.target.value });
                            }
                          }}
                          onChange={() => {}}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // PAINEL PRINCIPAL (DEFAULT)
  // ============================================================
  const steps = [
    { key: "abrir", label: "Abrir Competência", icon: Play, status: currentStatus !== "nao_aberta" ? "done" : "current", description: "Criar período e definir datas" },
    { key: "processar", label: "Processar Ponto", icon: Upload, status: ["ponto_importado", "aferida", "vale_gerado", "pagamento_simulado", "consolidada", "travada"].includes(currentStatus) ? "done" : currentStatus === "aberta" ? "current" : "locked", description: "Importar dados do DIXI e gerar timecard diário" },
    { key: "aferir", label: "Aferir Escuro", icon: ShieldCheck, status: ["aferida", "vale_gerado", "pagamento_simulado", "consolidada", "travada"].includes(currentStatus) ? "done" : currentStatus === "ponto_importado" ? "current" : "locked", description: "Cruzar dados com período no escuro do mês anterior" },
    { key: "vale", label: "Gerar Vale", icon: Wallet, status: ["vale_gerado", "pagamento_simulado", "consolidada", "travada"].includes(currentStatus) ? "done" : currentStatus === "aferida" ? "current" : "locked", description: "Calcular adiantamento de 40% + HE" },
    { key: "simular", label: "Simular Pagamento", icon: Scale, status: ["pagamento_simulado", "consolidada", "travada"].includes(currentStatus) ? "done" : currentStatus === "vale_gerado" ? "current" : "locked", description: "Calcular todos os descontos e proventos" },
    { key: "consolidar", label: "Consolidar", icon: CheckCircle, status: ["consolidada", "travada"].includes(currentStatus) ? "done" : currentStatus === "pagamento_simulado" ? "current" : "locked", description: "Confirmar pagamento e gerar eventos financeiros" },
    { key: "travar", label: "Travar Competência", icon: Lock, status: currentStatus === "travada" ? "done" : currentStatus === "consolidada" ? "current" : "locked", description: "Bloquear alterações nesta competência" },
  ];

  return (
    <DashboardLayout>
      <div className="w-full min-h-screen bg-background p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Gestão de Competências</h1>
            <p className="text-sm text-muted-foreground">Fluxo completo de fechamento de ponto e folha de pagamento</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setViewMode("criterios")}><Settings className="h-4 w-4 mr-1" /> Critérios</Button>
          </div>
        </div>

        {/* Month Selector */}
        <div className="flex items-center justify-center gap-4">
          <Button variant="outline" size="icon" onClick={() => {
            if (mesSelecionado === 1) { setMesSelecionado(12); setAnoSelecionado(a => a - 1); }
            else setMesSelecionado(m => m - 1);
          }}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="text-center min-w-[200px]">
            <p className="text-xl font-bold">{MESES[mesSelecionado - 1]} {anoSelecionado}</p>
            <p className="text-xs text-muted-foreground">Competência {mesRef}</p>
          </div>
          <Button variant="outline" size="icon" onClick={() => {
            if (mesSelecionado === 12) { setMesSelecionado(1); setAnoSelecionado(a => a + 1); }
            else setMesSelecionado(m => m + 1);
          }}><ChevronRight className="h-4 w-4" /></Button>
        </div>

        {/* Status Badge */}
        {periodData && (
          <div className="flex justify-center">
            <Badge className={`text-sm px-4 py-1 ${STATUS_COLORS[currentStatus] || "bg-gray-100 text-gray-800"}`}>
              {STATUS_LABELS[currentStatus] || currentStatus}
            </Badge>
          </div>
        )}

        {/* Pipeline Steps */}
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isDone = step.status === "done";
            const isCurrent = step.status === "current";
            const isLocked = step.status === "locked" || step.status === "pending";
            return (
              <div key={step.key} className="relative">
                <Card className={`border-2 transition-all ${isDone ? "border-green-300 bg-green-50" : isCurrent ? "border-blue-400 bg-blue-50 shadow-md" : "border-gray-200 opacity-60"}`}>
                  <CardContent className="p-3 text-center">
                    <div className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-2 ${isDone ? "bg-green-500 text-white" : isCurrent ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-500"}`}>
                      {isDone ? <CheckCircle className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <p className="text-xs font-semibold">{step.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{step.description}</p>
                    {isCurrent && !isTravada && (
                      <Button
                        size="sm"
                        className="mt-2 w-full text-xs"
                        disabled={isLoading}
                        onClick={() => {
                          if (["consolidar", "travar"].includes(step.key)) {
                            setShowConfirmDialog(step.key);
                          } else {
                            handleAction(step.key);
                          }
                        }}
                      >
                        {isLoading ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                        Executar
                      </Button>
                    )}
                  </CardContent>
                </Card>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                    <ArrowRight className={`h-4 w-4 ${isDone ? "text-green-500" : "text-gray-300"}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary Cards */}
        {resumoData && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewMode("timecard")}>
              <CardContent className="p-3 text-center">
                <Clock className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                <p className="text-xs text-muted-foreground">Registros Ponto</p>
                <p className="text-lg font-bold">{resumoData.timecard?.totalRegistros || 0}</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewMode("vale")}>
              <CardContent className="p-3 text-center">
                <Wallet className="h-5 w-5 mx-auto mb-1 text-green-500" />
                <p className="text-xs text-muted-foreground">Vales Gerados</p>
                <p className="text-lg font-bold">{resumoData.advances?.totalVales || 0}</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewMode("pagamento")}>
              <CardContent className="p-3 text-center">
                <DollarSign className="h-5 w-5 mx-auto mb-1 text-emerald-500" />
                <p className="text-xs text-muted-foreground">Pagamentos</p>
                <p className="text-lg font-bold">{resumoData.payments?.totalPagamentos || 0}</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewMode("divergencias")}>
              <CardContent className="p-3 text-center">
                <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-amber-500" />
                <p className="text-xs text-muted-foreground">Divergências</p>
                <p className="text-lg font-bold">{resumoData.adjustments?.totalAjustes || 0}</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewMode("financeiro")}>
              <CardContent className="p-3 text-center">
                <TrendingUp className="h-5 w-5 mx-auto mb-1 text-purple-500" />
                <p className="text-xs text-muted-foreground">Eventos Financ.</p>
                <p className="text-lg font-bold">{resumoData.financeiro?.total || 0}</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewMode("custos_obra")}>
              <CardContent className="p-3 text-center">
                <Building2 className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                <p className="text-xs text-muted-foreground">Custo por Obra</p>
                <p className="text-lg font-bold"><BarChart3 className="h-4 w-4 inline" /></p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Period Info */}
        {periodData && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Informações da Competência</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Período do Ponto</p>
                  <p className="font-medium">{periodData.pontoInicio ? new Date(periodData.pontoInicio + "T12:00:00").toLocaleDateString("pt-BR") : "-"} a {periodData.pontoFim ? new Date(periodData.pontoFim + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Período no Escuro</p>
                  <p className="font-medium">{periodData.escuroInicio ? new Date(periodData.escuroInicio + "T12:00:00").toLocaleDateString("pt-BR") : "-"} a {periodData.escuroFim ? new Date(periodData.escuroFim + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total Funcionários</p>
                  <p className="font-medium">{periodData.totalFuncionarios || 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total Vale</p>
                  <p className="font-medium text-green-600">{formatBRL(periodData.totalVale)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Not opened yet */}
        {!periodData && !period.isLoading && (
          <div className="text-center py-12">
            <CalendarDays className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="text-lg font-medium text-muted-foreground">Competência não aberta</p>
            <p className="text-sm text-muted-foreground mb-4">Clique em "Executar" na etapa "Abrir Competência" para iniciar o processo.</p>
          </div>
        )}

        {/* Confirm Dialog */}
        <Dialog open={!!showConfirmDialog} onOpenChange={() => setShowConfirmDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Ação</DialogTitle>
              <DialogDescription>
                {showConfirmDialog === "consolidar" && "Ao consolidar, os valores serão confirmados e os eventos financeiros serão gerados. Esta ação não pode ser desfeita facilmente."}
                {showConfirmDialog === "travar" && "Ao travar a competência, nenhuma alteração poderá ser feita. Use apenas quando tiver certeza de que tudo está correto."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmDialog(null)}>Cancelar</Button>
              <Button onClick={() => handleAction(showConfirmDialog!)} disabled={isLoading}>
                {isLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : null}
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}


// ============================================================
// CONTRACHEQUE DIALOG COMPONENT
// ============================================================
function ContrachequeDialog({ companyId, mesReferencia, employeeId, onClose }: {
  companyId: number;
  mesReferencia: string;
  employeeId?: number;
  onClose: () => void;
}) {
  const contracheque = trpc.payrollEngine.gerarContracheque.useQuery(
    { companyId, mesReferencia, employeeId },
    { enabled: companyId > 0 }
  );
  const data = contracheque.data;
  const [mesNum] = mesReferencia.split("-").slice(1).map(Number);
  const mesNome = MESES[(mesNum || 1) - 1] || mesReferencia;
  const anoNum = mesReferencia.split("-")[0];

  const handlePrint = () => {
    window.print();
  };

  if (contracheque.isLoading) {
    return (
      <FullScreenDialog open onClose={onClose} title="Contracheque">
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Gerando contracheques...</span>
        </div>
      </FullScreenDialog>
    );
  }

  return (
    <FullScreenDialog open onClose={onClose} title={`Contracheques — ${mesNome} ${anoNum}`}>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 no-print">
          <Button onClick={handlePrint}><Printer className="h-4 w-4 mr-1" /> Imprimir Todos</Button>
          <span className="text-sm text-muted-foreground">{data?.contracheques?.length || 0} contracheques</span>
        </div>

        {(data?.contracheques || []).map((cc: any, idx: number) => (
          <div key={idx} className="border rounded-lg p-6 bg-white print:break-after-page" style={{ pageBreakAfter: "always" }}>
            {/* Header with company info */}
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-3">
                {data?.empresa?.logoUrl ? (
                  <img src={data.empresa.logoUrl} alt="Logo" className="h-12 object-contain" />
                ) : (
                  <img
                    src="https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/supdCjdqVnpMeKVZ.png"
                    alt="FC Engenharia"
                    className="h-12 object-contain"
                  />
                )}
                <div>
                  <p className="font-bold text-lg" style={{ color: "#1B2A4A" }}>{data?.empresa?.nome}</p>
                  {data?.empresa?.cnpj && <p className="text-xs text-muted-foreground">CNPJ: {data.empresa.cnpj}</p>}
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold" style={{ color: "#1B2A4A" }}>RECIBO DE PAGAMENTO</p>
                <p className="text-sm text-muted-foreground">Competência: {mesNome}/{anoNum}</p>
              </div>
            </div>

            {/* Employee info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm border-b pb-3">
              <div>
                <p className="text-xs text-muted-foreground">Funcionário</p>
                <p className="font-medium">{cc.funcionario.nome}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Função</p>
                <p className="font-medium">{cc.funcionario.funcao || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CPF</p>
                <p className="font-medium">{cc.funcionario.cpf || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Código</p>
                <p className="font-medium">{cc.funcionario.codigo || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Admissão</p>
                <p className="font-medium">{cc.funcionario.dataAdmissao ? new Date(cc.funcionario.dataAdmissao + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valor/Hora</p>
                <p className="font-medium">{formatBRL(cc.funcionario.valorHora)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Obra</p>
                <p className="font-medium">{cc.funcionario.obra}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Data Pagamento</p>
                <p className="font-medium">{cc.dataPagamento ? new Date(cc.dataPagamento + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</p>
              </div>
            </div>

            {/* Proventos e Descontos side by side */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Proventos */}
              <div>
                <h4 className="font-semibold text-sm mb-2 text-green-700 border-b pb-1">PROVENTOS</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left py-1">Descrição</th>
                      <th className="text-right py-1">Ref.</th>
                      <th className="text-right py-1">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cc.proventos.map((p: any, i: number) => (
                      <tr key={i} className="border-b border-dashed">
                        <td className="py-1">{p.descricao}</td>
                        <td className="py-1 text-right text-xs text-muted-foreground">{p.referencia}</td>
                        <td className="py-1 text-right font-medium">{formatBRL(p.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold border-t">
                      <td className="py-1" colSpan={2}>Total Proventos</td>
                      <td className="py-1 text-right text-green-700">{formatBRL(cc.totalProventos)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Descontos */}
              <div>
                <h4 className="font-semibold text-sm mb-2 text-red-700 border-b pb-1">DESCONTOS</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left py-1">Descrição</th>
                      <th className="text-right py-1">Ref.</th>
                      <th className="text-right py-1">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cc.descontos.length > 0 ? cc.descontos.map((d: any, i: number) => (
                      <tr key={i} className="border-b border-dashed">
                        <td className="py-1">{d.descricao}</td>
                        <td className="py-1 text-right text-xs text-muted-foreground">{d.referencia}</td>
                        <td className="py-1 text-right font-medium text-red-600">-{formatBRL(d.valor)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={3} className="py-2 text-center text-muted-foreground text-xs">Sem descontos</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold border-t">
                      <td className="py-1" colSpan={2}>Total Descontos</td>
                      <td className="py-1 text-right text-red-700">-{formatBRL(cc.totalDescontos)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Acerto Escuro Details */}
            {cc.acertoEscuroDetalhes && cc.acertoEscuroDetalhes.length > 0 && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded p-3">
                <p className="text-xs font-semibold text-amber-800 mb-1">Acerto Período Escuro (ref. mês anterior):</p>
                {cc.acertoEscuroDetalhes.map((a: any, i: number) => (
                  <p key={i} className="text-xs text-amber-700">• {a.data ? new Date(a.data + "T12:00:00").toLocaleDateString("pt-BR") : ""} — {a.tipo}: {a.descricao} ({formatBRL(a.valor)})</p>
                ))}
              </div>
            )}

            {/* Total Líquido */}
            <div className="border-t-2 border-b-2 py-3 flex justify-between items-center" style={{ borderColor: "#1B2A4A" }}>
              <span className="text-lg font-bold" style={{ color: "#1B2A4A" }}>VALOR LÍQUIDO A RECEBER</span>
              <span className="text-2xl font-bold text-green-700">{formatBRL(cc.salarioLiquido)}</span>
            </div>

            {/* Signature line */}
            <div className="mt-8 pt-4 grid grid-cols-2 gap-8">
              <div className="text-center">
                <div className="border-t border-gray-400 pt-1">
                  <p className="text-xs text-muted-foreground">Assinatura do Empregador</p>
                </div>
              </div>
              <div className="text-center">
                <div className="border-t border-gray-400 pt-1">
                  <p className="text-xs text-muted-foreground">Assinatura do Funcionário</p>
                </div>
              </div>
            </div>

            {/* Footer LGPD */}
            <div className="mt-4 pt-2 border-t text-center">
              <p className="text-[7px] text-gray-400">
                Este documento contém dados pessoais protegidos pela Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD).
                É proibida a reprodução, distribuição ou compartilhamento sem autorização.
              </p>
            </div>
          </div>
        ))}

        {(!data?.contracheques || data.contracheques.length === 0) && (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum contracheque disponível</p>
            <p className="text-sm">Execute a simulação de pagamento primeiro.</p>
          </div>
        )}
      </div>
    </FullScreenDialog>
  );
}
