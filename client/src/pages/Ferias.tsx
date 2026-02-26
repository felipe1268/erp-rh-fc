import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
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
import { formatCPF, formatMoeda } from "@/lib/formatters";
import {
  Palmtree, Plus, Search, Calendar, DollarSign, AlertTriangle,
  Users, Trash2, Eye, X, RefreshCw, ChevronLeft, ChevronRight,
  Clock, CheckCircle2, Ban, CalendarDays, TrendingUp,
} from "lucide-react";
import { useState, useMemo } from "react";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: "Pendente", color: "text-amber-700", bg: "bg-amber-100" },
  agendada: { label: "Agendada", color: "text-blue-700", bg: "bg-blue-100" },
  em_gozo: { label: "Em Gozo", color: "text-green-700", bg: "bg-green-100" },
  concluida: { label: "Concluída", color: "text-gray-700", bg: "bg-gray-100" },
  vencida: { label: "Vencida", color: "text-red-700", bg: "bg-red-100" },
  cancelada: { label: "Cancelada", color: "text-red-700", bg: "bg-red-50" },
};

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function Ferias() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [tab, setTab] = useState("lista");
  const [anoCalendario, setAnoCalendario] = useState(new Date().getFullYear());
  const [showDialog, setShowDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});

  // Queries
  const { data: feriasList = [], refetch } = trpc.avisoPrevio.ferias.list.useQuery(
    { companyId, ...(statusFilter !== "todos" ? { status: statusFilter } : {}) },
    { enabled: !!companyId }
  );
  const { data: alertas } = trpc.avisoPrevio.ferias.alertas.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: calendario = [] } = trpc.avisoPrevio.ferias.calendario.useQuery(
    { companyId, ano: anoCalendario },
    { enabled: !!companyId && tab === "calendario" }
  );
  const { data: fluxoCaixa = [] } = trpc.avisoPrevio.ferias.fluxoCaixa.useQuery(
    { companyId, ano: anoCalendario },
    { enabled: !!companyId && tab === "fluxo" }
  );
  const { data: empList = [] } = trpc.employees.list.useQuery({ companyId }, { enabled: !!companyId });
  const activeEmployees = useMemo(() => (empList as any[]).filter((e: any) => e.status === "Ativo" && !e.deletedAt), [empList]);

  // Mutations
  const createFerias = trpc.avisoPrevio.ferias.create.useMutation({
    onSuccess: () => { refetch(); toast.success("Férias registradas!"); setShowDialog(false); setForm({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateFerias = trpc.avisoPrevio.ferias.update.useMutation({
    onSuccess: () => { refetch(); toast.success("Férias atualizadas!"); },
  });
  const deleteFerias = trpc.avisoPrevio.ferias.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Férias excluídas!"); },
  });
  const gerarPeriodos = trpc.avisoPrevio.ferias.gerarPeriodos.useMutation({
    onSuccess: (data: any) => { refetch(); toast.success(`${data.periodosGerados} período(s) gerado(s)!`); },
    onError: (e: any) => toast.error(e.message),
  });

  // Employee search
  const [empSearch, setEmpSearch] = useState("");
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const selectedEmp = activeEmployees.find((e: any) => e.id === form.employeeId);
  const filteredEmps = activeEmployees.filter((e: any) => {
    if (!empSearch) return true;
    const s = empSearch.toLowerCase();
    return (e.nomeCompleto || "").toLowerCase().includes(s) || (e.cpf || "").replace(/\D/g, "").includes(s.replace(/\D/g, ""));
  });

  // Filtered list
  const filtered = useMemo(() => {
    return (feriasList as any[]).filter((a: any) => {
      if (search) {
        const s = search.toLowerCase();
        if (!(a.employeeName || "").toLowerCase().includes(s) && !(a.employeeCpf || "").includes(s)) return false;
      }
      return true;
    });
  }, [feriasList, search]);

  // Stats
  const stats = useMemo(() => {
    const list = feriasList as any[];
    return {
      total: list.length,
      pendentes: list.filter(a => a.status === "pendente").length,
      agendadas: list.filter(a => a.status === "agendada").length,
      vencidas: list.filter(a => a.status === "vencida" || a.vencida).length,
      emGozo: list.filter(a => a.status === "em_gozo").length,
    };
  }, [feriasList]);

  const handleSubmit = () => {
    if (!form.employeeId || !form.periodoAquisitivoInicio || !form.periodoAquisitivoFim || !form.periodoConcessivoFim) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    createFerias.mutate({
      companyId,
      employeeId: form.employeeId,
      periodoAquisitivoInicio: form.periodoAquisitivoInicio,
      periodoAquisitivoFim: form.periodoAquisitivoFim,
      periodoConcessivoFim: form.periodoConcessivoFim,
      dataInicio: form.dataInicio || undefined,
      dataFim: form.dataFim || undefined,
      diasGozo: form.diasGozo || 30,
      fracionamento: form.fracionamento || 1,
      abonoPecuniario: form.abonoPecuniario || 0,
      observacoes: form.observacoes,
    });
  };

  const handleGerarPeriodos = (employeeId: number) => {
    gerarPeriodos.mutate({ companyId, employeeId });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Palmtree className="h-6 w-6 text-green-600" />
              Controle de Férias
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestão de férias conforme CLT Art. 129-145 — Períodos aquisitivos, concessivos e pagamentos
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setShowDialog(true); setForm({}); }}>
              <Plus className="h-4 w-4 mr-2" /> Registrar Férias
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="cursor-pointer hover:shadow-md" onClick={() => setStatusFilter("todos")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md border-l-4 border-l-amber-500" onClick={() => setStatusFilter("pendente")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Pendentes</p>
              <p className="text-2xl font-bold text-amber-600">{stats.pendentes}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md border-l-4 border-l-blue-500" onClick={() => setStatusFilter("agendada")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Agendadas</p>
              <p className="text-2xl font-bold text-blue-600">{stats.agendadas}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md border-l-4 border-l-red-500" onClick={() => setStatusFilter("vencida")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Vencidas</p>
              <p className="text-2xl font-bold text-red-600">{stats.vencidas}</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md border-l-4 border-l-green-500" onClick={() => setStatusFilter("em_gozo")}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Em Gozo</p>
              <p className="text-2xl font-bold text-green-600">{stats.emGozo}</p>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        {alertas && ((alertas.vencidas?.length || 0) > 0 || (alertas.prestesVencer?.length || 0) > 0) && (
          <div className="space-y-2">
            {(alertas.vencidas?.length || 0) > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-red-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> {alertas.vencidas.length} Férias Vencidas — Pagamento em Dobro (Art. 137 CLT)
                </p>
                <div className="mt-2 space-y-1">
                  {alertas.vencidas.slice(0, 5).map((v: any) => (
                    <p key={v.id} className="text-xs text-red-700">
                      <span className="font-medium cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(v.employeeId)}>{v.employeeName}</span>
                      {" — "}{v.employeeCargo} — Concessivo até {formatDate(v.periodoConcessivoFim)}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {(alertas.prestesVencer?.length || 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> {alertas.prestesVencer.length} Férias Prestes a Vencer (próximos 60 dias)
                </p>
                <div className="mt-2 space-y-1">
                  {alertas.prestesVencer.slice(0, 5).map((v: any) => (
                    <p key={v.id} className="text-xs text-amber-700">
                      <span className="font-medium cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(v.employeeId)}>{v.employeeName}</span>
                      {" — "}{v.employeeCargo} — Concessivo até {formatDate(v.periodoConcessivoFim)}
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
            <TabsTrigger value="lista"><Users className="h-4 w-4 mr-1" /> Lista de Férias</TabsTrigger>
            <TabsTrigger value="calendario"><CalendarDays className="h-4 w-4 mr-1" /> Calendário</TabsTrigger>
            <TabsTrigger value="fluxo"><TrendingUp className="h-4 w-4 mr-1" /> Fluxo de Caixa</TabsTrigger>
          </TabsList>

          {/* Lista */}
          <TabsContent value="lista">
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="agendada">Agendada</SelectItem>
                  <SelectItem value="em_gozo">Em Gozo</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="vencida">Vencida</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="p-3 text-left font-medium">Colaborador</th>
                        <th className="p-3 text-left font-medium">Período Aquisitivo</th>
                        <th className="p-3 text-left font-medium">Concessivo Até</th>
                        <th className="p-3 text-left font-medium">Início Gozo</th>
                        <th className="p-3 text-left font-medium">Fim Gozo</th>
                        <th className="p-3 text-center font-medium">Dias</th>
                        <th className="p-3 text-right font-medium">Valor Total</th>
                        <th className="p-3 text-left font-medium">Pagamento</th>
                        <th className="p-3 text-center font-medium">Status</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={10} className="py-12 text-center text-muted-foreground">Nenhuma férias encontrada</td></tr>
                      ) : filtered.map((f: any) => {
                        const st = STATUS_LABELS[f.status] || STATUS_LABELS.pendente;
                        const isVencida = f.vencida || f.status === "vencida";
                        return (
                          <tr key={f.id} className={`border-b last:border-0 hover:bg-muted/20 ${isVencida ? "bg-red-50/50" : ""}`}>
                            <td className="p-3">
                              <div className="font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(f.employeeId)}>{f.employeeName}</div>
                              <div className="text-xs text-muted-foreground">{f.employeeCargo}</div>
                            </td>
                            <td className="p-3 text-xs">{formatDate(f.periodoAquisitivoInicio)} a {formatDate(f.periodoAquisitivoFim)}</td>
                            <td className="p-3">
                              <span className={isVencida ? "text-red-600 font-semibold" : ""}>{formatDate(f.periodoConcessivoFim)}</span>
                              {isVencida && <Badge variant="destructive" className="ml-1 text-[10px]">VENCIDA</Badge>}
                            </td>
                            <td className="p-3">{formatDate(f.dataInicio)}</td>
                            <td className="p-3">{formatDate(f.dataFim)}</td>
                            <td className="p-3 text-center font-semibold">{f.diasGozo || 30}</td>
                            <td className="p-3 text-right font-semibold">{formatMoeda(f.valorTotal)}</td>
                            <td className="p-3 text-xs">{formatDate(f.dataPagamento)}</td>
                            <td className="p-3 text-center">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Detalhes" onClick={() => { setSelectedItem(f); setShowDetailDialog(true); }}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir?")) deleteFerias.mutate({ id: f.id }); }}>
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

          {/* Calendário */}
          <TabsContent value="calendario">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Calendário de Férias — {anoCalendario}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setAnoCalendario(a => a - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-semibold text-lg w-16 text-center">{anoCalendario}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setAnoCalendario(a => a + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {(calendario as any[]).length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhuma férias agendada para {anoCalendario}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="p-2 text-left font-medium">Colaborador</th>
                          {MESES.map(m => <th key={m} className="p-2 text-center font-medium text-xs">{m}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {(calendario as any[]).map((c: any) => {
                          const inicio = c.dataInicio ? new Date(c.dataInicio) : null;
                          const fim = c.dataFim ? new Date(c.dataFim) : null;
                          return (
                            <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="p-2 font-medium text-blue-700 cursor-pointer hover:underline whitespace-nowrap" onClick={() => setRaioXEmployeeId(c.employeeId)}>
                                {c.employeeName}
                              </td>
                              {MESES.map((_, idx) => {
                                const mesInicio = inicio ? inicio.getMonth() : -1;
                                const mesFim = fim ? fim.getMonth() : -1;
                                const isActive = inicio && fim && idx >= mesInicio && idx <= mesFim;
                                return (
                                  <td key={idx} className="p-2 text-center">
                                    {isActive ? (
                                      <div className={`h-6 rounded ${c.status === "concluida" ? "bg-gray-300" : c.status === "em_gozo" ? "bg-green-400" : "bg-blue-400"}`} title={`${c.employeeName}: ${formatDate(c.dataInicio)} - ${formatDate(c.dataFim)}`} />
                                    ) : null}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fluxo de Caixa */}
          <TabsContent value="fluxo">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    Fluxo de Caixa Prévio — {anoCalendario}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setAnoCalendario(a => a - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-semibold text-lg w-16 text-center">{anoCalendario}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setAnoCalendario(a => a + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {(fluxoCaixa as any[]).map((m: any) => (
                    <div key={m.mes} className={`rounded-lg border p-4 ${m.totalFuncionarios > 0 ? "bg-green-50 border-green-200" : "bg-muted/20"}`}>
                      <p className="font-semibold text-sm">{m.nomeMes}</p>
                      <p className="text-2xl font-bold mt-1">{formatMoeda(m.valorTotal)}</p>
                      <p className="text-xs text-muted-foreground">{m.totalFuncionarios} funcionário(s)</p>
                      {m.funcionarios?.slice(0, 3).map((f: any) => (
                        <div key={f.id} className="mt-2 text-xs border-t pt-1">
                          <span className="font-medium">{f.nome}</span>
                          <span className="text-muted-foreground ml-1">{formatMoeda(f.valorEstimado)}</span>
                          {f.vencida && <Badge variant="destructive" className="ml-1 text-[9px]">VENCIDA</Badge>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {(fluxoCaixa as any[]).length > 0 && (
                  <>
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200 flex justify-between items-center">
                    <span className="font-semibold text-blue-800">Total Estimado Anual:</span>
                    <span className="text-xl font-bold text-blue-800">
                      {formatMoeda((fluxoCaixa as any[]).reduce((sum: number, m: any) => sum + parseFloat(m.valorTotal || "0"), 0))}
                    </span>
                  </div>

                  {/* Gráfico de barras mensal */}
                  {(() => {
                    const dados = fluxoCaixa as any[];
                    const maxVal = Math.max(...dados.map((m: any) => parseFloat(m.valorTotal || "0")), 1);
                    return (
                      <div className="mt-6">
                        <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" /> Visualização Mensal
                        </h4>
                        <div className="flex items-end gap-2 h-48 border-b border-gray-200 pb-1">
                          {dados.map((m: any) => {
                            const val = parseFloat(m.valorTotal || "0");
                            const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                            const hasValue = val > 0;
                            return (
                              <div key={m.mes} className="flex-1 flex flex-col items-center gap-1 group relative">
                                {hasValue && (
                                  <span className="text-[9px] font-semibold text-green-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                    {formatMoeda(val)}
                                  </span>
                                )}
                                <div
                                  className={`w-full rounded-t-md transition-all ${
                                    hasValue
                                      ? "bg-gradient-to-t from-green-500 to-green-400 group-hover:from-green-600 group-hover:to-green-500"
                                      : "bg-gray-200"
                                  }`}
                                  style={{ height: `${Math.max(pct, 3)}%`, minHeight: "4px" }}
                                  title={`${m.nomeMes}: ${formatMoeda(val)} - ${m.totalFuncionarios} func.`}
                                />
                                <span className="text-[9px] text-muted-foreground font-medium">
                                  {(m.nomeMes || "").substring(0, 3)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Detail Dialog */}
        {selectedItem && (
          <FullScreenDialog open={showDetailDialog} onClose={() => { setShowDetailDialog(false); setSelectedItem(null); }} title="Detalhes das Férias" icon={<Palmtree className="h-5 w-5 text-white" />}>
            <div className="w-full max-w-3xl mx-auto space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground uppercase">Colaborador</p>
                  <p className="font-semibold text-lg">{selectedItem.employeeName}</p>
                  <p className="text-sm text-muted-foreground">{formatCPF(selectedItem.employeeCpf)} — {selectedItem.employeeCargo}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground uppercase">Status</p>
                  <p className="font-semibold text-lg">{STATUS_LABELS[selectedItem.status]?.label}</p>
                  {selectedItem.vencida ? <Badge variant="destructive">Pagamento em Dobro</Badge> : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-xs text-blue-600 uppercase font-semibold">Período Aquisitivo</p>
                  <p className="font-medium">{formatDate(selectedItem.periodoAquisitivoInicio)} a {formatDate(selectedItem.periodoAquisitivoFim)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4">
                  <p className="text-xs text-amber-600 uppercase font-semibold">Concessivo Até</p>
                  <p className="font-medium">{formatDate(selectedItem.periodoConcessivoFim)}</p>
                </div>
              </div>
              {selectedItem.dataInicio && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-green-600 uppercase">Início Gozo</p>
                    <p className="font-bold text-lg">{formatDate(selectedItem.dataInicio)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-green-600 uppercase">Fim Gozo</p>
                    <p className="font-bold text-lg">{formatDate(selectedItem.dataFim)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-green-600 uppercase">Dias</p>
                    <p className="font-bold text-lg">{selectedItem.diasGozo || 30}</p>
                  </div>
                </div>
              )}
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-xs text-green-600 uppercase font-semibold mb-2">Valores</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between"><span>Férias:</span><span className="font-medium">{formatMoeda(selectedItem.valorFerias)}</span></div>
                  <div className="flex justify-between"><span>1/3 Constitucional:</span><span className="font-medium">{formatMoeda(selectedItem.valorTercoConstitucional)}</span></div>
                </div>
                <div className="border-t mt-2 pt-2 flex justify-between text-lg font-bold text-green-700">
                  <span>TOTAL:</span>
                  <span>{formatMoeda(selectedItem.valorTotal)}</span>
                </div>
                {selectedItem.dataPagamento && (
                  <p className="text-xs text-green-600 mt-2">Pagamento até: {formatDate(selectedItem.dataPagamento)} (2 dias antes do início)</p>
                )}
              </div>
            </div>
          </FullScreenDialog>
        )}

        {/* Create Dialog */}
        <FullScreenDialog open={showDialog} onClose={() => { setShowDialog(false); setForm({}); }} title="Registrar Férias" icon={<Palmtree className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-3xl mx-auto">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Dica:</strong> Selecione um colaborador e clique em "Gerar Períodos Automáticos" para calcular automaticamente os períodos aquisitivos com base na data de admissão.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium">Colaborador *</label>
                <div className="relative" style={{ zIndex: 60 }}>
                  <div className="flex items-center border rounded-md px-3 py-2 bg-background cursor-pointer hover:bg-muted/30 relative" style={{ zIndex: 61 }} onClick={() => { if (!empDropdownOpen) setEmpDropdownOpen(true); }}>
                    <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
                    {empDropdownOpen ? (
                      <input autoFocus className="flex-1 bg-transparent outline-none text-sm" placeholder="Digite nome ou CPF..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setEmpDropdownOpen(false); setEmpSearch(''); } }} onClick={e => e.stopPropagation()} />
                    ) : (
                      <span className={`flex-1 text-sm ${selectedEmp ? "text-foreground" : "text-muted-foreground"}`}>
                        {selectedEmp ? `${selectedEmp.nomeCompleto} - ${formatCPF(selectedEmp.cpf)}` : "Selecione..."}
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
                          <div className="p-3 text-sm text-muted-foreground text-center">Nenhum resultado para "{empSearch}"</div>
                        ) : filteredEmps.slice(0, 20).map((e: any) => (
                          <div key={e.id} className="px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm flex justify-between" onClick={() => { setForm({ ...form, employeeId: e.id }); setEmpDropdownOpen(false); setEmpSearch(""); }}>
                            <span className="font-medium">{e.nomeCompleto}</span>
                            <span className="text-muted-foreground">{formatCPF(e.cpf)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {form.employeeId && (
                <div className="col-span-2">
                  <Button variant="outline" size="sm" onClick={() => handleGerarPeriodos(form.employeeId)} disabled={gerarPeriodos.isPending}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${gerarPeriodos.isPending ? "animate-spin" : ""}`} /> Gerar Períodos Automáticos
                  </Button>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Período Aquisitivo Início *</label>
                <Input type="date" value={form.periodoAquisitivoInicio || ""} onChange={e => setForm({ ...form, periodoAquisitivoInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Período Aquisitivo Fim *</label>
                <Input type="date" value={form.periodoAquisitivoFim || ""} onChange={e => setForm({ ...form, periodoAquisitivoFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Concessivo Até *</label>
                <Input type="date" value={form.periodoConcessivoFim || ""} onChange={e => setForm({ ...form, periodoConcessivoFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Dias de Gozo</label>
                <Input type="number" value={form.diasGozo || 30} onChange={e => setForm({ ...form, diasGozo: parseInt(e.target.value) || 30 })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data Início Gozo</label>
                <Input type="date" value={form.dataInicio || ""} onChange={e => setForm({ ...form, dataInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data Fim Gozo</label>
                <Input type="date" value={form.dataFim || ""} onChange={e => setForm({ ...form, dataFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Fracionamento</label>
                <Select value={String(form.fracionamento || 1)} onValueChange={v => setForm({ ...form, fracionamento: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 período (30 dias)</SelectItem>
                    <SelectItem value="2">2 períodos (14+16)</SelectItem>
                    <SelectItem value="3">3 períodos (14+10+6)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Abono Pecuniário</label>
                <Select value={String(form.abonoPecuniario || 0)} onValueChange={v => setForm({ ...form, abonoPecuniario: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Não</SelectItem>
                    <SelectItem value="1">Sim (vender 1/3)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Observações</label>
                <Textarea value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowDialog(false); setForm({}); }}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={createFerias.isPending}>
                {createFerias.isPending ? "Salvando..." : "Registrar Férias"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      </div>

      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
    </DashboardLayout>
  );
}
