import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  HardHat, Users, Search, ArrowRightLeft, UserPlus, AlertTriangle,
  Building2, CheckCircle, XCircle, Clock, MapPin, ChevronRight,
  Loader2, UserMinus, History, BarChart3, X, ArrowRight, Shield,
  Printer, FileDown,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { fmtNum } from "@/lib/formatters";

export default function ObraEfetivo() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery, construtorasIds } = useCompany();
  const companyIds = getCompanyIdsForQuery();
  // Quando CONSTRUTORAS está selecionado, selectedCompanyId = "construtoras" (string)
  // parseInt("construtoras") = NaN, que desabilita queries. Usar primeiro ID das construtoras.
  const companyId = isConstrutoras ? (construtorasIds[0] || 0) : (selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0);

  const [activeTab, setActiveTab] = useState("efetivo");
  const [search, setSearch] = useState("");
  const [selectedObraId, setSelectedObraId] = useState<number | null>(null);
  const [selectedObraIds, setSelectedObraIds] = useState<number[]>([]);
  const [allocDialogOpen, setAllocDialogOpen] = useState(false);
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);
  const [employeesWithAllocation, setEmployeesWithAllocation] = useState<any[]>([]);
  const [inconsistenciaDialogOpen, setInconsistenciaDialogOpen] = useState(false);
  const [selectedInconsistencia, setSelectedInconsistencia] = useState<any>(null);
  const [obsInconsistencia, setObsInconsistencia] = useState("");
  const [allocForm, setAllocForm] = useState({ obraId: 0, dataInicio: new Date().toISOString().split("T")[0], motivo: "" });
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [empFilter, setEmpFilter] = useState<"todos" | "sem-obra" | "com-obra">("todos");
  const [historyEmployeeId, setHistoryEmployeeId] = useState<number | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [equipeDialogOpen, setEquipeDialogOpen] = useState(false);
  const [equipeSearch, setEquipeSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [equipeStatusFilter, setEquipeStatusFilter] = useState<string | null>(null);

  // Queries
  const obrasQ = trpc.obras.listActive.useQuery({ companyId, companyIds }, { enabled: !!companyId });
  const obrasAtivas = obrasQ.data ?? [];
  const efetivoQ = trpc.obras.efetivoPorObra.useQuery({ companyId, companyIds }, { enabled: !!companyId });
  const efetivo = efetivoQ.data ?? [];
  const semObraQ = trpc.obras.semObra.useQuery({ companyId, companyIds }, { enabled: !!companyId });
  const semObra = semObraQ.data ?? [];
  const inconsistenciasQ = trpc.obras.inconsistencias.useQuery({ companyId, companyIds }, { enabled: !!companyId });
  const inconsistencias = inconsistenciasQ.data ?? [];
  const inconsistenciasCountQ = trpc.obras.inconsistenciasCount.useQuery({ companyId, companyIds }, { enabled: !!companyId });
  const inconsistenciasCount = inconsistenciasCountQ.data ?? 0;

  // Funcionários da obra selecionada
  const funcObraQ = trpc.obras.funcionarios.useQuery({ obraId: selectedObraId || 0, obraIds: selectedObraIds.length > 1 ? selectedObraIds : undefined }, { enabled: !!selectedObraId });
  const funcObra = funcObraQ.data ?? [];

  // All active employees for multi-select
  const allEmpsQ = trpc.employees.list.useQuery({ companyId, companyIds, status: "ativo" }, { enabled: !!companyId });
  const allEmps = allEmpsQ.data ?? [];

  // Histórico de alocações
  const historyQ = trpc.obras.employeeHistory.useQuery({ employeeId: historyEmployeeId || 0 }, { enabled: !!historyEmployeeId });
  const history = historyQ.data ?? [];

  // Mutations
  const allocMut = trpc.obras.allocateEmployee.useMutation({
    onSuccess: (data) => {
      toast.success(data.isTransferencia ? "Funcionário transferido com sucesso!" : "Funcionário alocado com sucesso!");
      efetivoQ.refetch(); semObraQ.refetch(); funcObraQ.refetch(); inconsistenciasQ.refetch(); inconsistenciasCountQ.refetch(); allEmpsQ.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const batchAllocMut = trpc.obras.transferirEmLote.useMutation({
    onSuccess: (results) => {
      const ok = results.filter((r: any) => r.success).length;
      const fail = results.filter((r: any) => !r.success).length;
      if (ok > 0) toast.success(`${ok} funcionário(s) alocado(s) com sucesso!`);
      if (fail > 0) toast.error(`${fail} funcionário(s) com erro na alocação.`);
      efetivoQ.refetch(); semObraQ.refetch(); funcObraQ.refetch(); inconsistenciasQ.refetch(); inconsistenciasCountQ.refetch(); allEmpsQ.refetch();
      setAllocDialogOpen(false);
      setSelectedEmployees([]);
      setEmpSearch("");
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMut = trpc.obras.removeEmployee.useMutation({
    onSuccess: () => {
      toast.success("Funcionário removido da obra!");
      efetivoQ.refetch(); semObraQ.refetch(); funcObraQ.refetch(); allEmpsQ.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const resolverEsporadicoMut = trpc.obras.resolverEsporadico.useMutation({
    onSuccess: () => {
      toast.success("Marcado como esporádico!");
      inconsistenciasQ.refetch(); inconsistenciasCountQ.refetch();
      setInconsistenciaDialogOpen(false);
    },
  });

  const resolverTransferirMut = trpc.obras.resolverTransferir.useMutation({
    onSuccess: () => {
      toast.success("Funcionário transferido com sucesso!");
      inconsistenciasQ.refetch(); inconsistenciasCountQ.refetch(); efetivoQ.refetch(); semObraQ.refetch();
      setInconsistenciaDialogOpen(false);
    },
  });

  // Totais
  const totalAlocados = efetivo.reduce((sum, e) => sum + ((e as any).efetivo || 0), 0);
  const totalObrasComEfetivo = efetivo.length;
  const totalSemObra = (semObra as any[]).length;

  // Status totals across all obras
  const globalStatusTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    (efetivo as any[]).forEach((o: any) => {
      totals.Ativo = (totals.Ativo || 0) + (o.qtdAtivo || 0);
      totals.Aviso = (totals.Aviso || 0) + (o.qtdAviso || 0);
      totals.AvisoDispensado = (totals.AvisoDispensado || 0) + (o.qtdAvisoDispensado || 0);
      totals.Ferias = (totals.Ferias || 0) + (o.qtdFerias || 0);
      totals.Afastado = (totals.Afastado || 0) + (o.qtdAfastado || 0);
      totals.Licenca = (totals.Licenca || 0) + (o.qtdLicenca || 0);
      totals.Recluso = (totals.Recluso || 0) + (o.qtdRecluso || 0);
    });
    return totals;
  }, [efetivo]);
  const globalTotal = Object.values(globalStatusTotals).reduce((s, v) => s + v, 0);

  // Helper: remove acentos para busca
  const removeAccents = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // Filtro
  const filteredEfetivo = useMemo(() => {
    let list = efetivo as any[];
    if (search) {
      const s = removeAccents(search);
      list = list.filter((e: any) => removeAccents(e.obraNome || '').includes(s) || removeAccents(e.obraCodigo || '').includes(s));
    }
    if (statusFilter) {
      const fieldMap: Record<string, string> = {
        Ativo: 'qtdAtivo', Aviso: 'qtdAviso', AvisoDispensado: 'qtdAvisoDispensado',
        Ferias: 'qtdFerias', Afastado: 'qtdAfastado', Licenca: 'qtdLicenca', Recluso: 'qtdRecluso',
      };
      const field = fieldMap[statusFilter];
      if (field) list = list.filter((e: any) => (e[field] || 0) > 0);
    }
    return list;
  }, [efetivo, search, statusFilter]);

  const filteredSemObra = useMemo(() => {
    const base = semObra as any[];
    if (!search) return base;
    const s = removeAccents(search);
    return base.filter((e: any) => removeAccents(e.nomeCompleto || '').includes(s) || removeAccents(e.funcao || '').includes(s));
  }, [semObra, search]);

  // Filtered employees for search in dialog
  const filteredAllEmps = useMemo(() => {
    let list = allEmps;
    // Apply obra filter
    if (empFilter === "sem-obra") {
      list = list.filter((e: any) => !e.obraAtualId || e.obraAtualId === 0);
    } else if (empFilter === "com-obra") {
      list = list.filter((e: any) => e.obraAtualId && e.obraAtualId !== 0);
    }
    // Apply text search (accent-insensitive)
    if (empSearch) {
      const s = removeAccents(empSearch);
      list = list.filter((e: any) =>
        removeAccents(e.nomeCompleto || '').includes(s) ||
        (e.cpf || '').includes(empSearch) ||
        removeAccents(e.funcao || '').includes(s) ||
        removeAccents(e.setor || '').includes(s) ||
        removeAccents(e.obraAtualNome || '').includes(s)
      );
    }
    return list.slice(0, 80);
  }, [allEmps, empSearch, empFilter]);

  const countSemObra = useMemo(() => allEmps.filter((e: any) => !e.obraAtualId || e.obraAtualId === 0).length, [allEmps]);
  const countComObra = useMemo(() => allEmps.filter((e: any) => e.obraAtualId && e.obraAtualId !== 0).length, [allEmps]);

  const toggleEmployee = (empId: number) => {
    setSelectedEmployees(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  const openAllocDialog = (employeeId?: number) => {
    setAllocForm({
      obraId: 0,
      dataInicio: new Date().toISOString().split("T")[0],
      motivo: "",
    });
    setSelectedEmployees(employeeId ? [employeeId] : []);
    setEmpSearch("");
    setEmpFilter("todos");
    setAllocDialogOpen(true);
  };

  // Pre-check: verify if any selected employees already have active allocations
  const handleAlloc = async () => {
    if (!allocForm.obraId) { toast.error("Selecione uma obra"); return; }
    if (selectedEmployees.length === 0) { toast.error("Selecione pelo menos um funcionário"); return; }
    
    // Check which selected employees already have an active allocation
    const alreadyAllocated = selectedEmployees.filter(empId => {
      const emp = allEmps.find((e: any) => e.id === empId);
      return emp?.obraAtualId && emp.obraAtualId !== 0 && emp.obraAtualId !== allocForm.obraId;
    });
    
    if (alreadyAllocated.length > 0) {
      // Build list of employees with their current allocations for the confirmation dialog
      const allocDetails = alreadyAllocated.map(empId => {
        const emp = allEmps.find((e: any) => e.id === empId);
        return {
          employeeId: empId,
          employeeName: emp?.nomeCompleto || `#${empId}`,
          obraAtualNome: emp?.obraAtualNome || 'Obra desconhecida',
          obraAtualId: emp?.obraAtualId,
        };
      });
      setEmployeesWithAllocation(allocDetails);
      setTransferConfirmOpen(true);
      return;
    }
    
    // No conflicts - proceed directly
    executeAllocation();
  };
  
  const executeAllocation = () => {
    batchAllocMut.mutate({
      obraDestinoId: allocForm.obraId,
      employeeIds: selectedEmployees,
      companyId,
      dataInicio: allocForm.dataInicio,
      motivo: allocForm.motivo || undefined,
    });
    setTransferConfirmOpen(false);
    setEmployeesWithAllocation([]);
  };

  const handleRemove = (employeeId: number, nome: string) => {
    if (confirm(`Remover ${nome} da obra atual?`)) {
      removeMut.mutate({ employeeId });
    }
  };

  const openInconsistenciaDialog = (inc: any) => {
    setSelectedInconsistencia(inc);
    setObsInconsistencia("");
    setInconsistenciaDialogOpen(true);
  };

  const openHistory = (employeeId: number) => {
    setHistoryEmployeeId(employeeId);
    setHistoryDialogOpen(true);
  };

  const tipoLabel: Record<string, string> = {
    alocacao: "Alocação",
    transferencia: "Transferência",
    retorno: "Retorno",
    saida: "Saída",
    temporario: "Temporário",
    gestor_obra: "Responsável / Gestor",
  };

  const tipoColor: Record<string, string> = {
    alocacao: "bg-green-100 text-green-800",
    transferencia: "bg-blue-100 text-blue-800",
    retorno: "bg-purple-100 text-purple-800",
    saida: "bg-red-100 text-red-800",
    temporario: "bg-yellow-100 text-yellow-800",
    gestor_obra: "bg-emerald-100 text-emerald-800",
  };

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
              <HardHat className="h-6 w-6 text-[#1B2A4A]" />
              Efetivo por Obra
            </h1>
            <p className="text-muted-foreground text-sm">Gestão de alocação de mão de obra nas obras</p>
          </div>
          <div className="flex items-center gap-2">
            <PrintActions title="Efetivo por Obra" />
            <Button onClick={() => openAllocDialog()} className="bg-[#1B2A4A] hover:bg-[#243660]">
              <UserPlus className="h-4 w-4 mr-2" /> Alocar Funcionário
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{fmtNum(totalAlocados)}</p>
                  <p className="text-xs text-muted-foreground">Alocados</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-green-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{fmtNum(totalObrasComEfetivo)}</p>
                  <p className="text-xs text-muted-foreground">Obras com Efetivo</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <UserMinus className="h-5 w-5 text-amber-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{fmtNum(totalSemObra)}</p>
                  <p className="text-xs text-muted-foreground">Sem Obra</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={inconsistenciasCount > 0 ? "border-red-200 bg-red-50/30" : ""}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${inconsistenciasCount > 0 ? "bg-red-100" : "bg-gray-100"}`}>
                  <AlertTriangle className={`h-5 w-5 ${inconsistenciasCount > 0 ? "text-red-700" : "text-gray-500"}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{fmtNum(inconsistenciasCount)}</p>
                  <p className="text-xs text-muted-foreground">Inconsistências</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar obra ou funcionário..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>

        {/* Global Status Badges - clickable filters */}
        {(() => {
          const statusConfig: { key: string; label: string; bgColor: string; textColor: string; borderColor: string; icon: string; dotColor: string }[] = [
            { key: 'Ativo', label: 'Ativos', bgColor: 'bg-green-50', textColor: 'text-green-700', borderColor: 'border-green-200', icon: '🟢', dotColor: 'bg-green-500' },
            { key: 'Aviso', label: 'Aviso Prévio', bgColor: 'bg-red-50', textColor: 'text-red-700', borderColor: 'border-red-200', icon: '🔴', dotColor: 'bg-red-500' },
            { key: 'AvisoDispensado', label: 'Dispensado', bgColor: 'bg-orange-50', textColor: 'text-orange-700', borderColor: 'border-orange-200', icon: '🟠', dotColor: 'bg-orange-500' },
            { key: 'Ferias', label: 'Férias', bgColor: 'bg-amber-50', textColor: 'text-amber-700', borderColor: 'border-amber-200', icon: '🟡', dotColor: 'bg-amber-500' },
            { key: 'Afastado', label: 'Afastados', bgColor: 'bg-purple-50', textColor: 'text-purple-700', borderColor: 'border-purple-200', icon: '🟣', dotColor: 'bg-purple-500' },
            { key: 'Licenca', label: 'Licença', bgColor: 'bg-cyan-50', textColor: 'text-cyan-700', borderColor: 'border-cyan-200', icon: '🩵', dotColor: 'bg-cyan-500' },
            { key: 'Recluso', label: 'Reclusos', bgColor: 'bg-gray-50', textColor: 'text-gray-700', borderColor: 'border-gray-200', icon: '⚪', dotColor: 'bg-gray-500' },
          ];
          return (
            <>
            <div className="flex flex-wrap gap-2 items-center">
              {statusConfig.filter(s => (globalStatusTotals[s.key] || 0) > 0).map(s => (
                <button
                  key={s.key}
                  onClick={() => setStatusFilter(prev => prev === s.key ? null : s.key)}
                  className={`${s.bgColor} ${s.borderColor} border rounded-lg px-4 py-2 flex items-center gap-2 transition-all cursor-pointer hover:shadow-md ${
                    statusFilter === s.key ? 'ring-2 ring-offset-1 ring-blue-500 shadow-md' : 'opacity-90 hover:opacity-100'
                  }`}
                >
                  <span className="text-sm">{s.icon}</span>
                  <span className={`font-bold text-lg ${s.textColor}`}>{globalStatusTotals[s.key] || 0}</span>
                  <span className={`text-xs ${s.textColor}`}>{s.label}</span>
                </button>
              ))}
              <div className={`bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 flex items-center gap-2 ${
                statusFilter ? 'cursor-pointer hover:shadow-md' : ''
              }`} onClick={() => statusFilter && setStatusFilter(null)}>
                <span className="font-bold text-lg text-slate-800">{globalTotal}</span>
                <span className="text-xs text-slate-600">Total</span>
              </div>
              {statusFilter && (
                <button
                  onClick={() => setStatusFilter(null)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors"
                >
                  <X className="h-3 w-3" /> Limpar filtro
                </button>
              )}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-4 items-center">
              {statusConfig.map(s => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${s.dotColor}`} />
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>
            </>
          );
        })()}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="efetivo" className="gap-2">
              <BarChart3 className="h-4 w-4" /> Efetivo por Obra
            </TabsTrigger>
            <TabsTrigger value="sem-obra" className="gap-2">
              <UserMinus className="h-4 w-4" /> Sem Obra ({totalSemObra})
            </TabsTrigger>
            <TabsTrigger value="inconsistencias" className="gap-2 relative">
              <AlertTriangle className="h-4 w-4" /> Inconsistências
              {inconsistenciasCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full h-5 w-5 flex items-center justify-center font-bold">
                  {inconsistenciasCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Tab: Efetivo por Obra */}
          <TabsContent value="efetivo" className="space-y-4 mt-4">
            {filteredEfetivo.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <HardHat className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="font-semibold text-lg">Nenhum efetivo alocado</h3>
                  <p className="text-muted-foreground text-sm mt-1">Aloque funcionários nas obras para visualizar o efetivo.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredEfetivo.map((item: any) => (
                  <Card
                    key={item.obraId}
                    className="cursor-pointer hover:shadow-md transition-shadow hover:ring-2 hover:ring-[#1B2A4A]/50"
                    onClick={() => { setSelectedObraId(item.obraId); setSelectedObraIds(item.obraIds || [item.obraId]); setEquipeDialogOpen(true); setEquipeSearch(""); setEquipeStatusFilter(null); }}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base truncate">{item.obraNome}</h3>
                          {item.obraCodigo && <p className="text-xs text-muted-foreground">{item.obraCodigo}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.obraStatus === "Em_Andamento" ? "bg-green-100 text-green-800" :
                            item.obraStatus === "Planejamento" ? "bg-blue-100 text-blue-800" :
                            "bg-gray-100 text-gray-800"
                          }`}>
                            {item.obraStatus?.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                      {item.obraCidade && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
                          <MapPin className="h-3.5 w-3.5" /> {item.obraCidade}
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-3 border-t">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-[#1B2A4A]" />
                          <span className="text-2xl font-bold text-[#1B2A4A]">{fmtNum((item as any).efetivo || 0)}</span>
                          <span className="text-sm text-muted-foreground">funcionários</span>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                      {/* Status breakdown badges */}
                      {((item as any).qtdAviso > 0 || (item as any).qtdAvisoDispensado > 0 || (item as any).qtdFerias > 0 || (item as any).qtdAfastado > 0) && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(item as any).qtdAviso > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                              🟡 {(item as any).qtdAviso} Aviso
                            </span>
                          )}
                          {(item as any).qtdAvisoDispensado > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-800 border border-orange-200">
                              🟠 {(item as any).qtdAvisoDispensado} Dispensado
                            </span>
                          )}
                          {(item as any).qtdFerias > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                              🔵 {(item as any).qtdFerias} Férias
                            </span>
                          )}
                          {(item as any).qtdAfastado > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                              🟣 {(item as any).qtdAfastado} Afastado
                            </span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

          </TabsContent>

          {/* Tab: Sem Obra */}
          <TabsContent value="sem-obra" className="space-y-4 mt-4">
            {filteredSemObra.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <CheckCircle className="h-12 w-12 text-green-500/50 mb-4" />
                  <h3 className="font-semibold text-lg">Todos os funcionários estão alocados</h3>
                  <p className="text-muted-foreground text-sm mt-1">Nenhum funcionário ativo sem obra principal.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50">
                          <th className="text-left p-3 font-medium">Funcionário</th>
                          <th className="text-left p-3 font-medium">Função / Cargo</th>
                          <th className="text-left p-3 font-medium">Setor</th>
                          <th className="text-left p-3 font-medium">Status</th>
                          <th className="text-left p-3 font-medium">Admissão</th>
                          <th className="text-right p-3 font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSemObra.map((emp: any) => (
                          <tr key={emp.id} className="border-b hover:bg-slate-50">
                            <td className="p-3 font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(emp.id)}>{emp.nomeCompleto}</td>
                            <td className="p-3 text-muted-foreground">{emp.funcao || emp.cargo || "—"}</td>
                            <td className="p-3 text-muted-foreground">{emp.setor || "—"}</td>
                            <td className="p-3">
                              {(() => {
                                const st = emp.status || 'Ativo';
                                const cfg: Record<string, { label: string; bg: string; text: string }> = {
                                  Ativo: { label: 'Ativo', bg: 'bg-green-100', text: 'text-green-800' },
                                  Ferias: { label: 'Férias', bg: 'bg-blue-100', text: 'text-blue-800' },
                                  Afastado: { label: 'Afastado', bg: 'bg-purple-100', text: 'text-purple-800' },
                                  Licenca: { label: 'Licença', bg: 'bg-teal-100', text: 'text-teal-800' },
                                  Recluso: { label: 'Recluso', bg: 'bg-red-100', text: 'text-red-800' },
                                };
                                const c = cfg[st] || { label: st, bg: 'bg-gray-100', text: 'text-gray-800' };
                                return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>{c.label}</span>;
                              })()}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {emp.dataAdmissao ? new Date(emp.dataAdmissao + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                            </td>
                            <td className="p-3 text-right">
                              <Button size="sm" variant="outline" onClick={() => openAllocDialog(emp.id)}>
                                <UserPlus className="h-3.5 w-3.5 mr-1" /> Alocar
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
          </TabsContent>

          {/* Tab: Inconsistências */}
          <TabsContent value="inconsistencias" className="space-y-4 mt-4">
            {inconsistencias.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <CheckCircle className="h-12 w-12 text-green-500/50 mb-4" />
                  <h3 className="font-semibold text-lg">Nenhuma inconsistência pendente</h3>
                  <p className="text-muted-foreground text-sm mt-1">Todos os registros de ponto estão consistentes com as alocações.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-red-50">
                          <th className="text-left p-3 font-medium">Data</th>
                          <th className="text-left p-3 font-medium">Funcionário</th>
                          <th className="text-left p-3 font-medium">Obra Alocada</th>
                          <th className="text-left p-3 font-medium">Obra do Ponto</th>
                          <th className="text-left p-3 font-medium">SN</th>
                          <th className="text-right p-3 font-medium">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inconsistencias.map((inc: any) => (
                          <tr key={inc.id} className="border-b hover:bg-red-50/50">
                            <td className="p-3 font-mono text-xs">
                              {inc.dataPonto ? new Date(inc.dataPonto + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                            </td>
                            <td className="p-3">
                              <p className="font-medium">{inc.employeeName || "—"}</p>
                              <p className="text-xs text-muted-foreground">{inc.employeeFuncao || ""}</p>
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {inc.obraAlocadaNome || "Sem alocação"}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                {inc.obraPontoNome || "—"}
                              </Badge>
                            </td>
                            <td className="p-3 font-mono text-xs">{inc.snRelogio || "—"}</td>
                            <td className="p-3 text-right">
                              <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => openInconsistenciaDialog(inc)}>
                                Resolver
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
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog: Alocar/Transferir Funcionário (Multi-Select) - Full Screen */}
      <FullScreenDialog
        open={allocDialogOpen}
        onClose={() => { setAllocDialogOpen(false); setSelectedEmployees([]); setEmpSearch(""); setEmpFilter("sem-obra"); }}
        zIndex={60}
        title="Alocar Funcionários"
        subtitle="Selecione os funcionários e defina a obra de destino."
        icon={<UserPlus className="h-5 w-5" />}
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setAllocDialogOpen(false)}>Cancelar</Button>
              {selectedEmployees.length > 0 && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {selectedEmployees.length} selecionado(s)
                </span>
              )}
            </div>
            <Button onClick={handleAlloc} disabled={batchAllocMut.isPending || selectedEmployees.length === 0 || !allocForm.obraId} className="bg-[#1B2A4A] hover:bg-[#243660] gap-2 px-6">
              {batchAllocMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Alocar {selectedEmployees.length > 0 ? `(${selectedEmployees.length})` : ""}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT PANEL: Employee Selection */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search + Filters Row */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-slate-50 to-gray-50 border-b px-5 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-[#1B2A4A]" />
                    <h3 className="font-semibold text-sm text-[#1B2A4A]">Selecionar Funcionários</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEmpFilter("todos")}
                      className={`px-3 py-1 text-xs rounded-full font-medium transition-all ${
                        empFilter === "todos" ? "bg-[#1B2A4A] text-white shadow-sm" : "bg-white text-gray-600 hover:bg-gray-100 border"
                      }`}
                    >
                      Todos ({allEmps.length})
                    </button>
                    <button
                      onClick={() => setEmpFilter("sem-obra")}
                      className={`px-3 py-1 text-xs rounded-full font-medium transition-all ${
                        empFilter === "sem-obra" ? "bg-amber-600 text-white shadow-sm" : "bg-white text-amber-700 hover:bg-amber-50 border border-amber-200"
                      }`}
                    >
                      Sem Obra ({countSemObra})
                    </button>
                    <button
                      onClick={() => setEmpFilter("com-obra")}
                      className={`px-3 py-1 text-xs rounded-full font-medium transition-all ${
                        empFilter === "com-obra" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-blue-700 hover:bg-blue-50 border border-blue-200"
                      }`}
                    >
                      Com Obra ({countComObra})
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, CPF, função, setor ou obra..."
                    value={empSearch}
                    onChange={e => setEmpSearch(e.target.value)}
                    className="pl-9 h-10"
                    autoFocus
                  />
                </div>
              </div>
              {/* Employee list */}
              <div className="overflow-y-auto max-h-[calc(100vh-340px)] border-t">
                {allEmpsQ.isLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#1B2A4A]" /></div>
                ) : filteredAllEmps.length === 0 ? (
                  <div className="text-center py-12">
                    <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                    <p className="text-sm text-muted-foreground">
                      {empSearch ? "Nenhum funcionário encontrado" : "Nenhum funcionário ativo"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredAllEmps.map((emp: any) => {
                      const isSelected = selectedEmployees.includes(emp.id);
                      return (
                        <div
                          key={emp.id}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all ${
                            isSelected ? "bg-blue-50/80 border-l-3 border-l-[#1B2A4A]" : "hover:bg-slate-50/80"
                          }`}
                          onClick={() => toggleEmployee(emp.id)}
                        >
                          <div className={`h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                            isSelected ? "bg-[#1B2A4A] border-[#1B2A4A] shadow-sm" : "border-gray-300"
                          }`}>
                            {isSelected && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                          </div>
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#1B2A4A] to-[#2d4a7a] flex items-center justify-center shrink-0">
                            <span className="text-white text-[10px] font-bold">{(emp.nomeCompleto || '?')[0]}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{emp.nomeCompleto}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {emp.funcao || "Sem função"}
                              {emp.setor ? ` • ${emp.setor}` : ""}
                            </p>
                          </div>
                          {emp.obraAtualNome ? (
                            <Badge variant="outline" className="text-[10px] shrink-0 bg-blue-50 text-blue-700 border-blue-200">
                              <HardHat className="h-3 w-3 mr-1" />{emp.obraAtualNome}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] shrink-0 bg-amber-50 text-amber-600 border-amber-200">
                              Sem obra
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                    {filteredAllEmps.length >= 80 && (
                      <div className="text-center py-3 text-xs text-muted-foreground bg-slate-50">
                        Mostrando 80 resultados — refine a busca para ver mais
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Destination + Selected */}
          <div className="space-y-4">
            {/* Selected employees */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2d4a7a] px-5 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-white/80" />
                    <h3 className="font-semibold text-sm text-white">Selecionados</h3>
                  </div>
                  <Badge className="bg-white/20 text-white border-0 text-xs">
                    {selectedEmployees.length}
                  </Badge>
                </div>
              </div>
              <div className="p-3 max-h-[200px] overflow-y-auto">
                {selectedEmployees.length === 0 ? (
                  <div className="text-center py-6">
                    <UserPlus className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-30" />
                    <p className="text-xs text-muted-foreground">Clique nos funcionários ao lado para selecioná-los</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {selectedEmployees.map(empId => {
                      const emp = allEmps.find((e: any) => e.id === empId);
                      return (
                        <div key={empId} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 group">
                          <div className="h-6 w-6 rounded-full bg-[#1B2A4A] flex items-center justify-center shrink-0">
                            <span className="text-white text-[9px] font-bold">{(emp?.nomeCompleto || '?')[0]}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{emp?.nomeCompleto || `#${empId}`}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{emp?.funcao || ''}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleEmployee(empId); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 p-0.5"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => setSelectedEmployees([])}
                      className="text-[10px] text-red-500 hover:text-red-700 w-full text-center py-1.5 hover:bg-red-50 rounded transition-colors"
                    >
                      Limpar todos
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Destination Config */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b px-5 py-3">
                <div className="flex items-center gap-2">
                  <HardHat className="h-4 w-4 text-green-700" />
                  <h3 className="font-semibold text-sm text-green-800">Destino da Alocação</h3>
                </div>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">Obra de Destino <span className="text-red-500">*</span></Label>
                  <Select value={allocForm.obraId ? String(allocForm.obraId) : "0"} onValueChange={v => setAllocForm(f => ({ ...f, obraId: Number(v) }))}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Selecione a obra..." />
                    </SelectTrigger>
                    <SelectContent>
                      {obrasAtivas.map((obra: any) => (
                        <SelectItem key={obra.id} value={String(obra.id)}>
                          <div className="flex items-center gap-2">
                            <HardHat className="h-3.5 w-3.5 text-muted-foreground" />
                            {obra.nome}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">Data de Início</Label>
                  <Input type="date" value={allocForm.dataInicio} onChange={e => setAllocForm(f => ({ ...f, dataInicio: e.target.value }))} className="h-10" />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">Motivo (opcional)</Label>
                  <Input value={allocForm.motivo} onChange={e => setAllocForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Ex: Demanda da obra" className="h-10" />
                </div>
              </div>
            </div>

            {/* Summary info */}
            {selectedEmployees.length > 0 && allocForm.obraId > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-green-800">
                      Pronto para alocar {selectedEmployees.length} funcionário(s)
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      na obra <strong>{obrasAtivas.find((o: any) => o.id === allocForm.obraId)?.nome}</strong>
                      {allocForm.dataInicio ? ` a partir de ${allocForm.dataInicio.split('-').reverse().join('/')}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </FullScreenDialog>

      {/* Dialog: Resolver Inconsistência */}
      <Dialog open={inconsistenciaDialogOpen} onOpenChange={setInconsistenciaDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Resolver Inconsistência de Ponto
            </DialogTitle>
            <DialogDescription>
              O funcionário bateu ponto em uma obra diferente da sua alocação principal.
            </DialogDescription>
          </DialogHeader>
          {selectedInconsistencia && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Funcionário:</span>
                  <span className="text-sm font-medium">{selectedInconsistencia.employeeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Data do Ponto:</span>
                  <span className="text-sm font-mono">{selectedInconsistencia.dataPonto ? new Date(selectedInconsistencia.dataPonto + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Obra Alocada:</span>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700">{selectedInconsistencia.obraAlocadaNome}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Obra do Ponto:</span>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700">{selectedInconsistencia.obraPontoNome}</Badge>
                </div>
              </div>
              <div>
                <Label>Observações (opcional)</Label>
                <Textarea value={obsInconsistencia} onChange={e => setObsInconsistencia(e.target.value)} placeholder="Adicione uma observação..." rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="border-green-200 text-green-700 hover:bg-green-50 h-auto py-3"
                  onClick={() => resolverEsporadicoMut.mutate({ id: selectedInconsistencia.id, observacoes: obsInconsistencia || undefined })}
                  disabled={resolverEsporadicoMut.isPending}
                >
                  <div className="text-center">
                    <Clock className="h-5 w-5 mx-auto mb-1" />
                    <p className="font-medium text-sm">Foi Esporádico</p>
                    <p className="text-[10px] text-muted-foreground">Manter na obra atual</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="border-blue-200 text-blue-700 hover:bg-blue-50 h-auto py-3"
                  onClick={() => resolverTransferirMut.mutate({ id: selectedInconsistencia.id, observacoes: obsInconsistencia || undefined })}
                  disabled={resolverTransferirMut.isPending}
                >
                  <div className="text-center">
                    <ArrowRightLeft className="h-5 w-5 mx-auto mb-1" />
                    <p className="font-medium text-sm">Transferir</p>
                    <p className="text-[10px] text-muted-foreground">Mover para {selectedInconsistencia.obraPontoNome}</p>
                  </div>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Histórico de Alocações */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Alocações
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto py-2">
            {historyQ.isLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum histórico de alocação encontrado.</p>
            ) : (
              history.map((h: any) => (
                <div key={h.id} className="flex items-start gap-3 p-3 rounded-lg border">
                  <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 mt-0.5 ${tipoColor[h.tipo] || "bg-gray-100 text-gray-800"}`}>
                    {tipoLabel[h.tipo] || h.tipo}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{h.obraNome || "Obra desconhecida"}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.dataInicio ? new Date(h.dataInicio + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                      {h.dataFim ? ` → ${new Date(h.dataFim + "T12:00:00").toLocaleDateString("pt-BR")}` : " → Atual"}
                    </p>
                    {h.motivoTransferencia && <p className="text-xs text-muted-foreground mt-1">{h.motivoTransferencia}</p>}
                    {h.registradoPor && <p className="text-[10px] text-muted-foreground mt-0.5">Por: {h.registradoPor}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />

      {/* Dialog: Confirmação de Transferência */}
      <Dialog open={transferConfirmOpen} onOpenChange={(open) => { if (!open) { setTransferConfirmOpen(false); setEmployeesWithAllocation([]); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Funcionário(s) já alocado(s)
            </DialogTitle>
            <DialogDescription>
              {employeesWithAllocation.length === 1
                ? "O funcionário selecionado já está alocado em outra obra."
                : `${employeesWithAllocation.length} funcionário(s) selecionado(s) já estão alocados em outras obras.`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm font-medium text-amber-800 mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Funcionários com alocação ativa:
              </p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {employeesWithAllocation.map((emp: any) => (
                  <div key={emp.employeeId} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-amber-100">
                    <div className="h-7 w-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                      <span className="text-amber-700 text-[10px] font-bold">{(emp.employeeName || '?')[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{emp.employeeName}</p>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <HardHat className="h-3 w-3" />
                        <span>Atualmente em: <strong className="text-amber-700">{emp.obraAtualNome}</strong></span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] shrink-0">
                      {obrasAtivas.find((o: any) => o.id === allocForm.obraId)?.nome || 'Nova obra'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>Deseja transferir?</strong> Os funcionários serão desalocados da obra atual e alocados na nova obra selecionada.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setTransferConfirmOpen(false); setEmployeesWithAllocation([]); }}>
              Cancelar
            </Button>
            <Button
              onClick={executeAllocation}
              disabled={batchAllocMut.isPending}
              className="bg-amber-600 hover:bg-amber-700 gap-2"
            >
              {batchAllocMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
              Transferir {employeesWithAllocation.length > 1 ? `(${employeesWithAllocation.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Equipe da Obra (FullScreen) */}
      <FullScreenDialog
        open={equipeDialogOpen}
        onClose={() => { setEquipeDialogOpen(false); }}
        title={`Equipe — ${efetivo.find((e: any) => e.obraId === selectedObraId)?.obraNome || ""}`}
        subtitle={`${funcObra.length} funcionário(s) alocado(s) nesta obra`}
        icon={<Users className="h-5 w-5" />}
        headerActions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 gap-1.5 border border-white/30 text-xs h-8" onClick={() => {
              const obraNome = efetivo.find((e: any) => e.obraId === selectedObraId)?.obraNome || "";
              const rows = funcObra.map((f: any) => ({
                nome: f.employee?.nomeCompleto || "—",
                funcao: f.funcaoNaObra || f.employee?.funcao || f.employee?.cargo || "—",
                status: f.employee?.status || "Ativo",
                desde: f.dataInicio ? new Date(f.dataInicio + "T12:00:00").toLocaleDateString("pt-BR") : "—",
                infoStatus: f.avisoDataFim ? `Fim: ${new Date(f.avisoDataFim + 'T12:00:00').toLocaleDateString('pt-BR')}` : f.feriasDataFim ? `Retorno: ${new Date(f.feriasDataFim + 'T12:00:00').toLocaleDateString('pt-BR')}` : '',
              }));
              const statusOrder = ["Ativo", "Aviso", "AvisoDispensado", "Ferias", "Afastado", "Licenca", "Recluso"];
              rows.sort((a: any, b: any) => {
                const ia = statusOrder.indexOf(a.status); const ib = statusOrder.indexOf(b.status);
                const sa = (ia === -1 ? 99 : ia); const sb = (ib === -1 ? 99 : ib);
                if (sa !== sb) return sa - sb;
                return a.nome.localeCompare(b.nome);
              });
              const statusLabels: Record<string, string> = { Ativo: "Ativo", Aviso: "Aviso Prévio", AvisoDispensado: "Dispensado (7d)", Ferias: "Férias", Afastado: "Afastado", Licenca: "Licença", Recluso: "Recluso" };
const statusBg: Record<string, string> = { Ativo: '#d4edda', Aviso: '#fee2e2', AvisoDispensado: '#fed7aa', Ferias: '#fef3c7', Afastado: '#ede9fe', Licenca: '#cffafe', Recluso: '#f3f4f6' };
               const statusFg: Record<string, string> = { Ativo: '#155724', Aviso: '#b91c1c', AvisoDispensado: '#9a3412', Ferias: '#92400e', Afastado: '#7c3aed', Licenca: '#0c5460', Recluso: '#374151' };
               const rowBg: Record<string, string> = { Aviso: '#fef2f2', AvisoDispensado: '#fff7ed', Ferias: '#fffbeb', Afastado: '#faf5ff', Licenca: '#ecfeff', Recluso: '#f9fafb' };
               // Summary counts
              const statusCounts: Record<string, number> = {};
              rows.forEach((r: any) => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });
              const summaryHtml = Object.entries(statusCounts).map(([s, c]) => `<span style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;background:${statusBg[s] || '#f8f9fa'};color:${statusFg[s] || '#333'};border:1px solid ${statusBg[s] || '#dee2e6'};margin-right:8px;"><strong>${c}</strong> ${statusLabels[s] || s}</span>`).join('') + `<span style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;background:#f8f9fa;color:#333;border:1px solid #dee2e6;"><strong>${rows.length}</strong> Total</span>`;
              const printHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Equipe - ${obraNome}</title><style>
                @page { size: A4 landscape; margin: 15mm; }
                body { font-family: Arial, sans-serif; font-size: 11px; color: #333; }
                .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #1B2A4A; padding-bottom: 8px; }
                .header h1 { font-size: 18px; color: #1B2A4A; margin: 0; }
                .header p { font-size: 12px; color: #666; margin: 4px 0 0; }
                .summary { margin-bottom: 12px; }
                table { width: 100%; border-collapse: collapse; }
                th { background: #1B2A4A; color: white; padding: 6px 10px; text-align: left; font-size: 10px; text-transform: uppercase; }
                td { padding: 5px 10px; border-bottom: 1px solid #eee; font-size: 11px; }
                .status { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; }
                .info-status { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 9px; font-weight: 600; }
                .footer { text-align: center; margin-top: 16px; font-size: 9px; color: #999; border-top: 1px solid #ddd; padding-top: 8px; }
              </style></head><body>
                <div class="header"><h1>Equipe — ${obraNome}</h1><p>${rows.length} funcionário(s) alocado(s) | Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p></div>
                <div class="summary">${summaryHtml}</div>
                <table><thead><tr><th>#</th><th>Funcionário</th><th>Função na Obra</th><th>Status</th><th>Info Status</th><th>Desde</th></tr></thead><tbody>
                ${rows.map((r: any, i: number) => `<tr style="background:${rowBg[r.status] || (i % 2 === 0 ? '#fff' : '#f8f9fa')}"><td>${i + 1}</td><td>${r.nome}</td><td>${r.funcao}</td><td><span class="status" style="background:${statusBg[r.status] || '#f8f9fa'};color:${statusFg[r.status] || '#333'}">${statusLabels[r.status] || r.status}</span></td><td>${r.infoStatus ? `<span class="info-status" style="background:${statusBg[r.status] || '#f8f9fa'};color:${statusFg[r.status] || '#333'}">${r.infoStatus}</span>` : '—'}</td><td>${r.desde}</td></tr>`).join("")}
                </tbody></table>
                <div class="footer">FC Engenharia — Sistema ERP RH & DP — Documento gerado automaticamente</div>
              </body></html>`;
              const w = window.open("", "_blank");
              if (w) { w.document.write(printHtml); w.document.close(); w.focus(); setTimeout(() => w.print(), 300); }
            }}>
              <Printer className="h-3.5 w-3.5" /> Imprimir
            </Button>
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 gap-1.5 border border-white/30 text-xs h-8" onClick={() => {
              toast.info("A janela de impressão será aberta. Selecione 'Salvar como PDF'.", { duration: 4000 });
              const obraNome = efetivo.find((e: any) => e.obraId === selectedObraId)?.obraNome || "";
              const rows = funcObra.map((f: any) => ({
                nome: f.employee?.nomeCompleto || "—",
                funcao: f.funcaoNaObra || f.employee?.funcao || f.employee?.cargo || "—",
                status: f.employee?.status || "Ativo",
                desde: f.dataInicio ? new Date(f.dataInicio + "T12:00:00").toLocaleDateString("pt-BR") : "—",
                infoStatus: f.avisoDataFim ? `Fim: ${new Date(f.avisoDataFim + 'T12:00:00').toLocaleDateString('pt-BR')}` : f.feriasDataFim ? `Retorno: ${new Date(f.feriasDataFim + 'T12:00:00').toLocaleDateString('pt-BR')}` : '',
              }));
              const statusOrder = ["Ativo", "Aviso", "AvisoDispensado", "Ferias", "Afastado", "Licenca", "Recluso"];
              rows.sort((a: any, b: any) => {
                const ia = statusOrder.indexOf(a.status); const ib = statusOrder.indexOf(b.status);
                const sa = (ia === -1 ? 99 : ia); const sb = (ib === -1 ? 99 : ib);
                if (sa !== sb) return sa - sb;
                return a.nome.localeCompare(b.nome);
              });
              const statusLabels: Record<string, string> = { Ativo: "Ativo", Aviso: "Aviso Prévio", AvisoDispensado: "Dispensado (7d)", Ferias: "Férias", Afastado: "Afastado", Licenca: "Licença", Recluso: "Recluso" };
const statusBg: Record<string, string> = { Ativo: '#d4edda', Aviso: '#fee2e2', AvisoDispensado: '#fed7aa', Ferias: '#fef3c7', Afastado: '#ede9fe', Licenca: '#cffafe', Recluso: '#f3f4f6' };
               const statusFg: Record<string, string> = { Ativo: '#155724', Aviso: '#b91c1c', AvisoDispensado: '#9a3412', Ferias: '#92400e', Afastado: '#7c3aed', Licenca: '#0c5460', Recluso: '#374151' };
               const rowBg: Record<string, string> = { Aviso: '#fef2f2', AvisoDispensado: '#fff7ed', Ferias: '#fffbeb', Afastado: '#faf5ff', Licenca: '#ecfeff', Recluso: '#f9fafb' };
              const statusCounts: Record<string, number> = {};
              rows.forEach((r: any) => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });
              const summaryHtml = Object.entries(statusCounts).map(([s, c]) => `<span style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;background:${statusBg[s] || '#f8f9fa'};color:${statusFg[s] || '#333'};border:1px solid ${statusBg[s] || '#dee2e6'};margin-right:8px;"><strong>${c}</strong> ${statusLabels[s] || s}</span>`).join('') + `<span style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;background:#f8f9fa;color:#333;border:1px solid #dee2e6;"><strong>${rows.length}</strong> Total</span>`;
              const printHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Equipe - ${obraNome}</title><style>
                @page { size: A4 landscape; margin: 15mm; }
                body { font-family: Arial, sans-serif; font-size: 11px; color: #333; }
                .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #1B2A4A; padding-bottom: 8px; }
                .header h1 { font-size: 18px; color: #1B2A4A; margin: 0; }
                .header p { font-size: 12px; color: #666; margin: 4px 0 0; }
                .summary { margin-bottom: 12px; }
                table { width: 100%; border-collapse: collapse; }
                th { background: #1B2A4A; color: white; padding: 6px 10px; text-align: left; font-size: 10px; text-transform: uppercase; }
                td { padding: 5px 10px; border-bottom: 1px solid #eee; font-size: 11px; }
                .status { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; }
                .info-status { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 9px; font-weight: 600; }
                .footer { text-align: center; margin-top: 16px; font-size: 9px; color: #999; border-top: 1px solid #ddd; padding-top: 8px; }
              </style></head><body>
                <div class="header"><h1>Equipe — ${obraNome}</h1><p>${rows.length} funcionário(s) alocado(s) | Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p></div>
                <div class="summary">${summaryHtml}</div>
                <table><thead><tr><th>#</th><th>Funcionário</th><th>Função na Obra</th><th>Status</th><th>Info Status</th><th>Desde</th></tr></thead><tbody>
                ${rows.map((r: any, i: number) => `<tr style="background:${rowBg[r.status] || (i % 2 === 0 ? '#fff' : '#f8f9fa')}"><td>${i + 1}</td><td>${r.nome}</td><td>${r.funcao}</td><td><span class="status" style="background:${statusBg[r.status] || '#f8f9fa'};color:${statusFg[r.status] || '#333'}">${statusLabels[r.status] || r.status}</span></td><td>${r.infoStatus ? `<span class="info-status" style="background:${statusBg[r.status] || '#f8f9fa'};color:${statusFg[r.status] || '#333'}">${r.infoStatus}</span>` : '—'}</td><td>${r.desde}</td></tr>`).join("")}
                </tbody></table>
                <div class="footer">FC Engenharia — Sistema ERP RH & DP — Documento gerado automaticamente</div>
              </body></html>`;
              setTimeout(() => {
                const w = window.open("", "_blank");
                if (w) { w.document.write(printHtml); w.document.close(); w.focus(); setTimeout(() => w.print(), 300); }
              }, 500);
            }}>
              <FileDown className="h-3.5 w-3.5" /> PDF
            </Button>
          </div>
        }
        footer={
          <div className="flex items-center justify-between w-full">
            <Button variant="outline" onClick={() => setEquipeDialogOpen(false)}>Fechar</Button>
            <Button onClick={() => { setAllocForm(f => ({ ...f, obraId: selectedObraId || 0 })); setAllocDialogOpen(true); }} className="bg-[#1B2A4A] hover:bg-[#243660] gap-2">
              <UserPlus className="h-4 w-4" /> Alocar Funcionários
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Search within team */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar na equipe..."
              value={equipeSearch}
              onChange={e => setEquipeSearch(e.target.value)}
              className="pl-9 h-10"
            />
          </div>

          {/* Summary cards by status */}
          {(() => {
            const statusGroups: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: string }> = {
              Ativo: { label: "Ativos", color: "text-green-700", bgColor: "bg-green-50", borderColor: "border-green-200", icon: "🟢" },
              Aviso: { label: "Aviso Prévio", color: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200", icon: "🔴" },
              AvisoDispensado: { label: "Dispensado (7d)", color: "text-orange-700", bgColor: "bg-orange-50", borderColor: "border-orange-200", icon: "🟠" },
              Ferias: { label: "Férias", color: "text-amber-700", bgColor: "bg-amber-50", borderColor: "border-amber-200", icon: "🟡" },
              Afastado: { label: "Afastados", color: "text-purple-700", bgColor: "bg-purple-50", borderColor: "border-purple-200", icon: "🟣" },
              Recluso: { label: "Reclusos", color: "text-gray-700", bgColor: "bg-gray-50", borderColor: "border-gray-200", icon: "⚪" },
              Licenca: { label: "Licença", color: "text-cyan-700", bgColor: "bg-cyan-50", borderColor: "border-cyan-200", icon: "🩵" },
            };
            const filteredFuncObra = funcObra.filter((f: any) => {
              if (equipeStatusFilter) {
                const st = f.employee?.status || 'Ativo';
                if (st !== equipeStatusFilter) return false;
              }
              if (!equipeSearch) return true;
              const s = equipeSearch.toLowerCase();
              return (f.employee?.nomeCompleto || "").toLowerCase().includes(s) ||
                (f.funcaoNaObra || "").toLowerCase().includes(s) ||
                (f.employee?.funcao || "").toLowerCase().includes(s);
            });
            const grouped: Record<string, any[]> = {};
            filteredFuncObra.forEach((f: any) => {
              const st = f.employee?.status || "Ativo";
              if (!grouped[st]) grouped[st] = [];
              grouped[st].push(f);
            });
            const statusOrder = ["Ativo", "Aviso", "AvisoDispensado", "Ferias", "Afastado", "Licenca", "Recluso"];
            const sortedKeys = Object.keys(grouped).sort((a, b) => {
              const ia = statusOrder.indexOf(a); const ib = statusOrder.indexOf(b);
              return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
            });
            return (
              <>
                {/* Status summary badges */}
                <div className="flex flex-wrap gap-2">
                  {sortedKeys.map(st => {
                    const cfg = statusGroups[st] || { label: st, color: "text-gray-700", bgColor: "bg-gray-50", borderColor: "border-gray-200", icon: "⚪" };
                    return (
                      <button key={st} onClick={() => setEquipeStatusFilter(prev => prev === st ? null : st)} className={`${cfg.bgColor} ${cfg.borderColor} border rounded-lg px-4 py-2 flex items-center gap-2 transition-all cursor-pointer hover:shadow-md ${
                        equipeStatusFilter === st ? 'ring-2 ring-offset-1 ring-blue-500 shadow-md' : 'opacity-90 hover:opacity-100'
                      }`}>
                        <span className="text-sm">{cfg.icon}</span>
                        <span className={`font-bold text-lg ${cfg.color}`}>{grouped[st].length}</span>
                        <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
                      </button>
                    );
                  })}
                  <div className={`bg-slate-100 border border-slate-200 rounded-lg px-4 py-2 flex items-center gap-2 ${equipeStatusFilter ? 'cursor-pointer hover:shadow-md' : ''}`} onClick={() => equipeStatusFilter && setEquipeStatusFilter(null)}>
                    <span className="font-bold text-lg text-slate-800">{filteredFuncObra.length}</span>
                    <span className="text-xs text-slate-600">Total</span>
                  </div>
                  {equipeStatusFilter && (
                    <button onClick={() => setEquipeStatusFilter(null)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors">
                      <X className="h-3 w-3" /> Limpar filtro
                    </button>
                  )}
                </div>

                {/* Employee list grouped by status */}
                {funcObraQ.isLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : funcObra.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
                    <h3 className="font-semibold text-lg">Nenhum funcionário alocado</h3>
                    <p className="text-muted-foreground text-sm mt-1">Clique em "Alocar Funcionários" para adicionar a equipe.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sortedKeys.map(st => {
                      const cfg = statusGroups[st] || { label: st, color: "text-gray-700", bgColor: "bg-gray-50", borderColor: "border-gray-200", icon: "⚪" };
                      const items = grouped[st];
                      return (
                        <div key={st} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                          <div className={`${cfg.bgColor} ${cfg.borderColor} border-b px-4 py-2.5 flex items-center gap-2`}>
                            <span>{cfg.icon}</span>
                            <span className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</span>
                            <span className={`text-xs ${cfg.color} ml-1`}>({items.length})</span>
                          </div>
                          <table className="w-full">
                            <thead>
                              <tr className="bg-slate-50/50 border-b">
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Funcionário</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 hidden md:table-cell">Função na Obra</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 hidden md:table-cell">Desde</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 hidden md:table-cell">Info Status</th>
                                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 print:hidden">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {items.map((f: any) => {
                                const empStatus = f.employee?.status || st;
                                const rowBg = empStatus === 'Aviso' ? 'bg-red-50/60' : empStatus === 'AvisoDispensado' ? 'bg-orange-50/60' : empStatus === 'Ferias' ? 'bg-amber-50/60' : empStatus === 'Afastado' ? 'bg-purple-50/60' : empStatus === 'Licenca' ? 'bg-cyan-50/60' : empStatus === 'Recluso' ? 'bg-gray-50/60' : '';
                                return (
                                <tr key={f.id} className={`hover:bg-slate-50/50 ${rowBg}`} style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-3">
                                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                                        empStatus === 'Aviso' ? 'bg-gradient-to-br from-red-500 to-red-600' :
                                        empStatus === 'AvisoDispensado' ? 'bg-gradient-to-br from-orange-500 to-orange-600' :
                                        empStatus === 'Ferias' ? 'bg-gradient-to-br from-amber-400 to-amber-500' :
                                        empStatus === 'Afastado' ? 'bg-gradient-to-br from-purple-500 to-purple-600' :
                                        empStatus === 'Licenca' ? 'bg-gradient-to-br from-cyan-500 to-cyan-600' :
                                        empStatus === 'Recluso' ? 'bg-gradient-to-br from-gray-500 to-gray-600' :
                                        'bg-gradient-to-br from-[#1B2A4A] to-[#2d4a7a]'
                                      }`}>
                                        <span className="text-white text-[11px] font-bold">{(f.employee?.nomeCompleto || '?')[0]}</span>
                                      </div>
                                      <div>
                                        <p className="font-medium text-sm text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(f.employeeId)}>
                                          {f.employee?.nomeCompleto || "—"}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground md:hidden">
                                          {f.funcaoNaObra || f.employee?.funcao || "—"}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-sm text-muted-foreground hidden md:table-cell">
                                    {f.funcaoNaObra || f.employee?.funcao || f.employee?.cargo || "—"}
                                  </td>
                                  <td className="px-4 py-2.5 text-sm text-muted-foreground hidden md:table-cell">
                                    {f.dataInicio ? new Date(f.dataInicio + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                                  </td>
                                  <td className="px-4 py-2.5 text-sm hidden md:table-cell">
                                    {empStatus === 'AvisoDispensado' && f.avisoDataFim ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-800 border border-orange-300" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                                        Dispensado - Fim: {new Date(f.avisoDataFim + 'T12:00:00').toLocaleDateString('pt-BR')}
                                      </span>
                                    ) : empStatus === 'Aviso' && f.avisoDataFim ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                                        Fim: {new Date(f.avisoDataFim + 'T12:00:00').toLocaleDateString('pt-BR')}
                                      </span>
                                    ) : empStatus === 'Ferias' && f.feriasDataFim ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                                        Retorno: {new Date(f.feriasDataFim + 'T12:00:00').toLocaleDateString('pt-BR')}
                                      </span>
                                    ) : empStatus === 'Afastado' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-300" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                                        Afastado
                                      </span>
                                    ) : empStatus === 'Licenca' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-100 text-cyan-800 border border-cyan-300" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                                        Em Licença
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 print:hidden">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openHistory(f.employeeId)}>
                                        <History className="h-3.5 w-3.5 mr-1" /> Histórico
                                      </Button>
                                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSelectedEmployees([f.employeeId]); setAllocForm({ obraId: 0, dataInicio: new Date().toISOString().split("T")[0], motivo: "Transferência" }); setAllocDialogOpen(true); }}>
                                        <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Transferir
                                      </Button>
                                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => handleRemove(f.employeeId, f.employee?.nomeCompleto || "")}>
                                        <UserMinus className="h-3.5 w-3.5 mr-1" /> Remover
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </FullScreenDialog>

      <PrintFooterLGPD />
    </DashboardLayout>
  );
}
