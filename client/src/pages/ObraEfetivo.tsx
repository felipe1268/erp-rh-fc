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
  Printer, FileDown, Settings2, Zap, Thermometer, Moon,
  ShieldCheck, Plane, GraduationCap,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { fmtNum } from "@/lib/formatters";
import { PersonPhoto } from "@/components/PersonPhoto";
import { CipaBadge } from "@/components/CipaBadge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

// Rev. 2936 — Resumo curto de cada NR (Norma Regulamentadora) p/ exibir ao CLICAR
// no chip na "Equipe — {obra}" e facilitar a análise do gestor. Texto enxuto,
// foco no que a norma trata. Chave normalizada p/ "NR-NN".
const NR_RESUMOS: Record<string, string> = {
  "NR-01": "Disposições gerais e gerenciamento de riscos ocupacionais (GRO/PGR).",
  "NR-04": "SESMT — Serviços Especializados em Segurança e Medicina do Trabalho.",
  "NR-05": "CIPA — Comissão Interna de Prevenção de Acidentes.",
  "NR-06": "EPI — Equipamento de Proteção Individual (fornecimento e uso).",
  "NR-07": "PCMSO — Programa de Controle Médico de Saúde Ocupacional (exames).",
  "NR-08": "Edificações — condições de segurança das estruturas e locais de trabalho.",
  "NR-09": "Avaliação e controle de agentes físicos, químicos e biológicos.",
  "NR-10": "Segurança em instalações e serviços com eletricidade.",
  "NR-11": "Transporte, movimentação, armazenagem e manuseio de materiais.",
  "NR-12": "Segurança no trabalho em máquinas e equipamentos.",
  "NR-13": "Caldeiras, vasos de pressão, tubulações e tanques metálicos.",
  "NR-15": "Atividades e operações insalubres (limites de exposição).",
  "NR-16": "Atividades e operações perigosas (periculosidade).",
  "NR-17": "Ergonomia — adaptação do trabalho às condições do trabalhador.",
  "NR-18": "Segurança e saúde no trabalho na indústria da construção.",
  "NR-19": "Explosivos — manuseio, armazenagem e transporte.",
  "NR-20": "Segurança com inflamáveis e combustíveis.",
  "NR-21": "Trabalho a céu aberto.",
  "NR-23": "Proteção contra incêndios (saídas, equipamentos e treinamento).",
  "NR-26": "Sinalização de segurança (cores e rótulos).",
  "NR-33": "Segurança e saúde em espaços confinados.",
  "NR-34": "Condições de segurança na indústria naval (construção e reparação).",
  "NR-35": "Trabalho em altura (acima de 2 m com risco de queda).",
};

// Normaliza "NR 18", "nr-18", "18" → "NR-18" para casar com NR_RESUMOS.
function normalizeNrKey(raw: string): string {
  const m = String(raw || "").match(/(\d{1,2})/);
  if (!m) return String(raw || "").trim().toUpperCase();
  return `NR-${m[1].padStart(2, "0")}`;
}

// Rev. 2562 — defesa em profundidade no toast de remoção. O erro
// "Failed to execute 'json' on 'Response': Unexpected end of JSON input"
// (corpo de resposta VAZIO) acontece quando o worker do dev server reinicia
// no meio do request ou há blip de rede — NÃO é falha de lógica/SQL. A
// remoção é IDEMPOTENTE no servidor (WHERE isActive=1), então mesmo após
// um corte ela pode ter sido concluída. Para esses casos mostramos uma
// mensagem acionável em vez do paredão técnico cru.
function isTransientNetErr(err: any): boolean {
  const msg = String(err?.message ?? "");
  return /Unexpected end of JSON input|Failed to execute 'json'|Failed to fetch|Load failed|NetworkError|network error/i.test(msg);
}

export default function ObraEfetivo() {
  const { selectedCompanyId, getCompanyIdsForQuery } = useCompany();
  const companyIds = getCompanyIdsForQuery();
  // Quando CONSTRUTORAS está selecionado, selectedCompanyId = "construtoras" (string)
  // parseInt("construtoras") = NaN, que desabilita queries. Usar primeiro ID das construtoras.
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;

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
  const [condicoesDialogOpen, setCondicoesDialogOpen] = useState(false);
  const [condicoesDialogItem, setCondicoesDialogItem] = useState<any>(null);
  const [condicoesForm, setCondicoesForm] = useState({ insalubridadeOverride: 'herda', periculosidadeOverride: 'herda', adicionalEscolhido: 'auto' });

  // Queries
  const obrasQ = trpc.obras.listActive.useQuery({ companyId, companyIds }, { enabled: !!companyId });
  const obrasAtivas = obrasQ.data ?? [];
  // Rev. 2565 — picker "Obra de Destino" mostra TODAS as obras ativas da empresa
  // (sem filtro de allowed_obra_ids) para que qualquer engenheiro de campo possa
  // realocar equipe para qualquer obra. A lista de VISUALIZAÇÃO (obrasAtivas)
  // segue respeitando a permissão do usuário.
  const obrasTodasQ = trpc.obras.listActiveAll.useQuery({ companyId, companyIds }, { enabled: !!companyId });
  const obrasTodas = obrasTodasQ.data ?? [];
  const efetivoQ = trpc.obras.efetivoPorObra.useQuery({ companyId, companyIds }, { enabled: !!companyId, staleTime: 0 });
  const efetivo = efetivoQ.data ?? [];
  const semObraQ = trpc.obras.semObra.useQuery({ companyId, companyIds }, { enabled: !!companyId });
  const semObra = semObraQ.data ?? [];
  const inconsistenciasQ = trpc.obras.inconsistencias.useQuery({ companyId, companyIds }, { enabled: !!companyId });
  const inconsistencias = inconsistenciasQ.data ?? [];
  const inconsistenciasCountQ = trpc.obras.inconsistenciasCount.useQuery({ companyId, companyIds }, { enabled: !!companyId });
  const inconsistenciasCount = inconsistenciasCountQ.data ?? 0;

  // Funcionários da obra selecionada — sempre passa obraIds para cobrir consolidação por nome
  const funcObraQ = trpc.obras.funcionarios.useQuery({ obraId: selectedObraId || 0, obraIds: selectedObraIds.length > 0 ? selectedObraIds : undefined }, { enabled: !!selectedObraId, staleTime: 0 });
  const funcObra = funcObraQ.data ?? [];

  // All employees for multi-select (sem filtro de status — mostra todos os não-deletados)
  const allEmpsQ = trpc.employees.list.useQuery({ companyId, companyIds, excludeTerminated: true }, { enabled: !!companyId });
  const allEmps = allEmpsQ.data ?? [];

  // IDs de todas as obras para drill-down de status
  const allObraIds = useMemo(() => (efetivo as any[]).flatMap((e: any) => e.obraIds || [e.obraId]).filter(Boolean), [efetivo]);

  // Query de funcionários de todas as obras (para drill-down de status)
  const drillDownQ = trpc.obras.funcionarios.useQuery(
    { obraId: allObraIds[0] || 0, obraIds: allObraIds },
    { enabled: !!statusFilter && allObraIds.length > 0 }
  );
  const drillDownEmps = drillDownQ.data ?? [];

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
    // Rev. 2558 — a remoção é IDEMPOTENTE no servidor (WHERE isActive=1: 2ª
    // chamada vira no-op, sem duplicar histórico). Por isso podemos reexecutar
    // com segurança quando a resposta vier vazia/cortada (ex.: dev server
    // reiniciando no meio do request → "Unexpected end of JSON input", ou blip
    // de rede). Sem isso, o usuário via erro mesmo quando a remoção funcionava.
    retry: (count, err: any) => {
      const msg = String(err?.message ?? "");
      const transient = /Unexpected end of JSON input|Failed to fetch|Load failed|NetworkError|network error/i.test(msg);
      return transient && count < 2;
    },
    retryDelay: 800,
    onSuccess: () => {
      toast.success("Funcionário removido da obra!");
      efetivoQ.refetch(); semObraQ.refetch(); funcObraQ.refetch(); allEmpsQ.refetch();
    },
    onError: (err) => {
      if (isTransientNetErr(err)) {
        // Corpo vazio/cortado após esgotar os retries. A remoção é idempotente,
        // então pode ter sido concluída — atualizamos a lista e orientamos.
        efetivoQ.refetch(); semObraQ.refetch(); funcObraQ.refetch(); allEmpsQ.refetch();
        toast.warning("Conexão instável ao remover. A lista foi atualizada — se o funcionário ainda aparecer, tente remover novamente.");
        return;
      }
      toast.error(err.message);
    },
  });

  const updateCondicoesMut = trpc.obras.updateObraFuncionarioCondicoes.useMutation({
    onSuccess: () => {
      toast.success("Condições atualizadas!");
      funcObraQ.refetch();
      setCondicoesDialogOpen(false);
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

  // Rev. 1358 — aba "Todos os Funcionários" para facilitar transferência entre obras
  const [todosObraFilter, setTodosObraFilter] = useState<string>("todos");
  const filteredTodos = useMemo(() => {
    let list = (allEmps as any[]).slice();
    if (search) {
      const s = removeAccents(search);
      list = list.filter((e: any) =>
        removeAccents(e.nomeCompleto || '').includes(s) ||
        (e.cpf || '').includes(search) ||
        removeAccents(e.funcao || '').includes(s) ||
        removeAccents(e.setor || '').includes(s) ||
        removeAccents(e.obraAtualNome || '').includes(s)
      );
    }
    if (todosObraFilter === "sem-obra") {
      list = list.filter((e: any) => !e.obraAtualId || e.obraAtualId === 0);
    } else if (todosObraFilter === "com-obra") {
      list = list.filter((e: any) => e.obraAtualId && e.obraAtualId !== 0);
    } else if (todosObraFilter !== "todos") {
      const oid = parseInt(todosObraFilter, 10);
      if (!Number.isNaN(oid)) list = list.filter((e: any) => e.obraAtualId === oid);
    }
    list.sort((a: any, b: any) => (a.nomeCompleto || '').localeCompare(b.nomeCompleto || '', 'pt-BR'));
    return list;
  }, [allEmps, search, todosObraFilter]);

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

        {/* Drill-down: lista de funcionários quando um status é filtrado */}
        {statusFilter && (() => {
          const statusLabels: Record<string, { label: string; bg: string; text: string; border: string }> = {
            Ativo:          { label: "Ativos",        bg: "bg-green-50",  text: "text-green-800",  border: "border-green-200" },
            Aviso:          { label: "Aviso Prévio",  bg: "bg-red-50",    text: "text-red-800",    border: "border-red-200" },
            AvisoDispensado:{ label: "Dispensados",   bg: "bg-orange-50", text: "text-orange-800", border: "border-orange-200" },
            Ferias:         { label: "Férias",        bg: "bg-amber-50",  text: "text-amber-800",  border: "border-amber-200" },
            Afastado:       { label: "Afastados",     bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200" },
            Licenca:        { label: "Licença",       bg: "bg-cyan-50",   text: "text-cyan-800",   border: "border-cyan-200" },
            Recluso:        { label: "Reclusos",      bg: "bg-gray-50",   text: "text-gray-800",   border: "border-gray-200" },
          };
          const cfg = statusLabels[statusFilter] || { label: statusFilter, bg: "bg-slate-50", text: "text-slate-800", border: "border-slate-200" };
          const matching = (drillDownEmps as any[]).filter((a: any) => (a.employee?.status || a.employee?.status) === statusFilter);
          return (
            <Card className={`border-2 ${cfg.border}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`font-bold text-base flex items-center gap-2 ${cfg.text}`}>
                    <Users className="h-4 w-4" />
                    Funcionários — {cfg.label} ({matching.length})
                  </h3>
                  {drillDownQ.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                {drillDownQ.isLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : matching.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum funcionário encontrado para este status.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={`${cfg.bg} border-b`}>
                          <th className="text-left p-2 font-semibold">Funcionário</th>
                          <th className="text-left p-2 font-semibold">Função</th>
                          <th className="text-left p-2 font-semibold">Obra</th>
                          <th className="text-left p-2 font-semibold">Admissão</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matching.map((a: any) => (
                          <tr key={a.employeeId} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => setRaioXEmployeeId(a.employeeId)}>
                            <td className="p-2 font-medium text-blue-700 hover:underline">{a.employee?.nomeCompleto || `#${a.employeeId}`}</td>
                            <td className="p-2 text-muted-foreground">{a.employee?.funcao || a.employee?.cargo || "—"}</td>
                            <td className="p-2">
                              {(efetivo as any[]).find((o: any) => (o.obraIds || [o.obraId]).includes(a.obraId))?.obraNome || `Obra #${a.obraId}`}
                            </td>
                            <td className="p-2 text-muted-foreground">
                              {a.employee?.dataAdmissao ? new Date(a.employee.dataAdmissao + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="efetivo" className="gap-2">
              <BarChart3 className="h-4 w-4" /> Efetivo por Obra
            </TabsTrigger>
            <TabsTrigger value="todos" className="gap-2">
              <Users className="h-4 w-4" /> Todos ({allEmps.length})
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

          {/* Tab: Todos os Funcionários (Rev. 1358) */}
          <TabsContent value="todos" className="space-y-4 mt-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">
                      Lista completa de funcionários ativos. Use a ação <strong>Transferir/Alocar</strong> para mover entre obras.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={todosObraFilter} onValueChange={setTodosObraFilter}>
                      <SelectTrigger className="w-[240px] h-9">
                        <SelectValue placeholder="Filtrar por obra" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas as obras ({allEmps.length})</SelectItem>
                        <SelectItem value="com-obra">Apenas com obra ({countComObra})</SelectItem>
                        <SelectItem value="sem-obra">Apenas sem obra ({countSemObra})</SelectItem>
                        <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground border-t mt-1">Por Obra</div>
                        {(obrasAtivas as any[]).map((o: any) => (
                          <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedEmployees.length > 0 && (
                      <Button
                        size="sm"
                        className="bg-[#1B2A4A] hover:bg-[#243660] gap-1"
                        onClick={() => { setAllocForm({ obraId: 0, dataInicio: new Date().toISOString().split("T")[0], motivo: "Transferência" }); setAllocDialogOpen(true); }}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" /> Transferir {selectedEmployees.length}
                      </Button>
                    )}
                  </div>
                </div>
                {filteredTodos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">Nenhum funcionário encontrado.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50">
                          <th className="p-2 w-10">
                            <input
                              type="checkbox"
                              className="rounded"
                              checked={filteredTodos.length > 0 && filteredTodos.every((e: any) => selectedEmployees.includes(e.id))}
                              onChange={(ev) => {
                                if (ev.target.checked) {
                                  const ids = filteredTodos.map((e: any) => e.id);
                                  setSelectedEmployees(prev => Array.from(new Set([...prev, ...ids])));
                                } else {
                                  const ids = new Set(filteredTodos.map((e: any) => e.id));
                                  setSelectedEmployees(prev => prev.filter(id => !ids.has(id)));
                                }
                              }}
                            />
                          </th>
                          <th className="text-left p-2 font-medium">Funcionário</th>
                          <th className="text-left p-2 font-medium">Função</th>
                          <th className="text-left p-2 font-medium">Setor</th>
                          <th className="text-left p-2 font-medium">Obra Atual</th>
                          <th className="text-left p-2 font-medium">Status</th>
                          <th className="text-right p-2 font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTodos.slice(0, 300).map((emp: any) => {
                          const semObraFlag = !emp.obraAtualId || emp.obraAtualId === 0;
                          return (
                            <tr key={emp.id} className="border-b hover:bg-slate-50">
                              <td className="p-2">
                                <input
                                  type="checkbox"
                                  className="rounded"
                                  checked={selectedEmployees.includes(emp.id)}
                                  onChange={() => toggleEmployee(emp.id)}
                                />
                              </td>
                              <td className="p-2 font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(emp.id)}>
                                {emp.nomeCompleto}
                                {emp.cpf && <p className="text-[10px] font-normal text-muted-foreground font-mono">{emp.cpf}</p>}
                              </td>
                              <td className="p-2 text-muted-foreground">{emp.funcao || emp.cargo || "—"}</td>
                              <td className="p-2 text-muted-foreground">{emp.setor || "—"}</td>
                              <td className="p-2">
                                {semObraFlag ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                    Sem obra
                                  </span>
                                ) : (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 max-w-[200px] truncate inline-block">
                                    {emp.obraAtualNome || `#${emp.obraAtualId}`}
                                  </Badge>
                                )}
                              </td>
                              <td className="p-2">
                                {(() => {
                                  const st = emp.status || 'Ativo';
                                  const cfg: Record<string, { label: string; bg: string; text: string }> = {
                                    Ativo: { label: 'Ativo', bg: 'bg-green-100', text: 'text-green-800' },
                                    Aviso: { label: 'Aviso', bg: 'bg-amber-100', text: 'text-amber-800' },
                                    AvisoDispensado: { label: 'Dispensado', bg: 'bg-orange-100', text: 'text-orange-800' },
                                    Ferias: { label: 'Férias', bg: 'bg-blue-100', text: 'text-blue-800' },
                                    Afastado: { label: 'Afastado', bg: 'bg-purple-100', text: 'text-purple-800' },
                                    Licenca: { label: 'Licença', bg: 'bg-teal-100', text: 'text-teal-800' },
                                    Recluso: { label: 'Recluso', bg: 'bg-red-100', text: 'text-red-800' },
                                  };
                                  const c = cfg[st] || { label: st, bg: 'bg-gray-100', text: 'text-gray-800' };
                                  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.bg} ${c.text}`}>{c.label}</span>;
                                })()}
                              </td>
                              <td className="p-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openHistory(emp.id)}>
                                    <History className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setSelectedEmployees([emp.id]); setAllocForm({ obraId: 0, dataInicio: new Date().toISOString().split("T")[0], motivo: semObraFlag ? "Alocação" : "Transferência" }); setAllocDialogOpen(true); }}>
                                    {semObraFlag ? <><UserPlus className="h-3.5 w-3.5 mr-1" /> Alocar</> : <><ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Transferir</>}
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredTodos.length > 300 && (
                      <div className="p-2 text-center text-xs text-muted-foreground bg-slate-50 border-t">
                        Mostrando 300 de {filteredTodos.length} resultados — refine a busca para ver outros.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
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
                          {(() => {
                            const statusCfg: Record<string, { label: string; cls: string }> = {
                              Ativo:            { label: 'Ativo',         cls: 'bg-green-100 text-green-800 border-green-200' },
                              Aviso:            { label: 'Aviso Prévio',  cls: 'bg-red-100 text-red-800 border-red-200' },
                              AvisoDispensado:  { label: 'Dispensado',    cls: 'bg-orange-100 text-orange-800 border-orange-200' },
                              Ferias:           { label: 'Férias',        cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
                              Afastado:         { label: 'Afastado',      cls: 'bg-purple-100 text-purple-800 border-purple-200' },
                              Licenca:          { label: 'Licença',       cls: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
                              Recluso:          { label: 'Recluso',       cls: 'bg-gray-200 text-gray-800 border-gray-300' },
                              Desligado:        { label: 'Desligado',     cls: 'bg-red-200 text-red-900 border-red-300' },
                              Lista_Negra:      { label: 'Lista Negra',   cls: 'bg-black text-white border-black' },
                              Inativo:          { label: 'Inativo',       cls: 'bg-slate-200 text-slate-700 border-slate-300' },
                            };
                            const cfg = statusCfg[emp.status as string] || { label: emp.status || '—', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
                            return (
                              <Badge variant="outline" className={`text-[10px] shrink-0 ${cfg.cls}`}>
                                {cfg.label}
                              </Badge>
                            );
                          })()}
                          {emp.obraAtualNome ? (
                            <Badge variant="outline" className="text-[10px] shrink-0 bg-blue-50 text-blue-700 border-blue-200 max-w-[140px] truncate" title={emp.obraAtualNome}>
                              <HardHat className="h-3 w-3 mr-1 shrink-0" />{emp.obraAtualNome}
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
                      {obrasTodas.map((obra: any) => (
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

            {/* Condições da obra selecionada */}
            {allocForm.obraId > 0 && (() => {
              const obraDest = obrasTodas.find((o: any) => o.id === allocForm.obraId);
              if (!obraDest) return null;
              const temIns = obraDest.insalubridadeGrau && obraDest.insalubridadeGrau !== "none";
              const temPer = obraDest.periculosidade === 1;
              const temNot = obraDest.adicionalNoturnoAtivo === 1;
              if (!temIns && !temPer && !temNot) return null;
              const grauLabel: Record<string, string> = { minimo: "Grau Mínimo (10% sal. mín.)", medio: "Grau Médio (20% sal. mín.)", maximo: "Grau Máximo (40% sal. mín.)" };
              const ambosAtivos = temIns && temPer;
              return (
                <div className="border border-orange-200 bg-orange-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-orange-600 font-semibold text-xs">⚠ Condições de Trabalho — {obraDest.nome}</span>
                  </div>
                  {temIns && (
                    <div className="text-xs text-orange-700">
                      <span className="font-medium">Insalubridade:</span> {grauLabel[obraDest.insalubridadeGrau] || obraDest.insalubridadeGrau}
                    </div>
                  )}
                  {temPer && (
                    <div className="text-xs text-red-700">
                      <span className="font-medium">Periculosidade:</span> 30% sobre o salário base
                    </div>
                  )}
                  {temNot && (
                    <div className="text-xs text-indigo-700">
                      <span className="font-medium">Adicional Noturno:</span> 20% sobre horas entre 22h–5h (calculado pelo ponto)
                    </div>
                  )}
                  {ambosAtivos && (
                    <div className="mt-2 pt-2 border-t border-orange-200 text-xs text-amber-800 bg-amber-50 rounded p-2">
                      ℹ Esta obra tem insalubridade <strong>e</strong> periculosidade ativas. O sistema calculará e sugerirá automaticamente o mais vantajoso para cada funcionário no momento do pagamento (CLT Art. 193 §2).
                    </div>
                  )}
                  <div className="text-[10px] text-orange-500 mt-1">Todos os funcionários alocados herdarão estas condições. O RH poderá ajustar individualmente após a alocação.</div>
                </div>
              );
            })()}

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
                      na obra <strong>{obrasTodas.find((o: any) => o.id === allocForm.obraId)?.nome}</strong>
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
      {transferConfirmOpen && <div className="fixed inset-0 z-[65] bg-black/60" />}
      <Dialog open={transferConfirmOpen} onOpenChange={(open) => { if (!open) { setTransferConfirmOpen(false); setEmployeesWithAllocation([]); } }}>
        <DialogContent className="sm:max-w-2xl md:max-w-3xl !z-[70] max-h-[85vh] overflow-y-auto">
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
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {employeesWithAllocation.map((emp: any) => {
                  const novaObraNome = obrasTodas.find((o: any) => o.id === allocForm.obraId)?.nome || 'Nova obra';
                  return (
                    <div key={emp.employeeId} className="bg-white rounded-lg px-3 py-2.5 border border-amber-100 min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                          <span className="text-amber-700 text-xs font-bold">{(emp.employeeName || '?')[0]}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" title={emp.employeeName}>{emp.employeeName}</p>
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
                            <HardHat className="h-3 w-3 shrink-0" />
                            <span className="truncate">Atualmente em: <strong className="text-amber-700">{emp.obraAtualNome}</strong></span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2 pl-11 min-w-0">
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[11px] truncate min-w-0 inline-block max-w-full" title={novaObraNome}>
                          {novaObraNome}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <strong>Deseja transferir?</strong> Os funcionários serão desalocados da obra atual e alocados na nova obra selecionada.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setTransferConfirmOpen(false); setEmployeesWithAllocation([]); }}>
              Cancelar
            </Button>
            <Button
              onClick={executeAllocation}
              disabled={batchAllocMut.isPending}
              className="bg-amber-600 hover:bg-amber-700 gap-2 w-full sm:w-auto"
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
        onClose={() => { setEquipeDialogOpen(false); efetivoQ.refetch(); }}
        title={`Equipe — ${efetivo.find((e: any) => (e.obraIds || [e.obraId]).some((id: number) => selectedObraIds.includes(id)))?.obraNome || efetivo.find((e: any) => e.obraId === selectedObraId)?.obraNome || ""}`}
        subtitle={`${funcObraQ.isLoading ? "..." : funcObra.length} funcionário(s) alocado(s) nesta obra`}
        icon={<Users className="h-5 w-5" />}
        headerActions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 gap-1.5 border border-white/30 text-xs h-8" onClick={() => {
              const obraNome = efetivo.find((e: any) => e.obraId === selectedObraId)?.obraNome || "";
              const rows = funcObra.map((f: any) => ({
                nome: f.employee?.nomeCompleto || "—",
                funcao: f.employee?.cargo || f.employee?.funcao || f.funcaoNaObra || "—",
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
                funcao: f.employee?.cargo || f.employee?.funcao || f.funcaoNaObra || "—",
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
            <Button variant="outline" onClick={() => { setEquipeDialogOpen(false); efetivoQ.refetch(); }}>Fechar</Button>
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

                {/* Rev. 2933 — Legenda de cores da coluna "Integrações" (por cliente/local) */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border bg-slate-50/70 px-3 py-2 text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                    <ShieldCheck className="h-3.5 w-3.5" /> Integrações por cliente:
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Integração válida
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> Vencida
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" /> Sem integração
                  </span>
                  <span className="inline-flex items-center gap-1.5 border-l pl-3 ml-1">
                    <GraduationCap className="h-3 w-3" /> Chips = NRs (treinamentos): verde = válido, vermelho = vencido
                  </span>
                  <span className="text-slate-400">— blocos = integração por cliente/referência (validade); chips = NRs do treinamento.</span>
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
                      // Rev. 2482 — ordem alfabética por nome dentro de cada grupo de status
                      const items = [...grouped[st]].sort((a: any, b: any) =>
                        (a.employee?.nomeCompleto || "").localeCompare(b.employee?.nomeCompleto || "", "pt-BR")
                      );
                      return (
                        <div key={st} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                          <div className={`${cfg.bgColor} ${cfg.borderColor} border-b px-4 py-2.5 flex items-center gap-2`}>
                            <span>{cfg.icon}</span>
                            <span className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</span>
                            <span className={`text-xs ${cfg.color} ml-1`}>({items.length})</span>
                          </div>
                          <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-slate-50/50 border-b">
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Funcionário</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 hidden md:table-cell">Função na Obra</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 hidden md:table-cell">Desde</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 hidden md:table-cell">Info Status</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 hidden md:table-cell">Integrações</th>
                                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 print:hidden">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {items.map((f: any) => {
                                const empStatus = f.employee?.status || st;
                                const rowBg = empStatus === 'Aviso' ? 'bg-red-50/60' : empStatus === 'AvisoDispensado' ? 'bg-orange-50/60' : empStatus === 'Ferias' ? 'bg-amber-50/60' : empStatus === 'Afastado' ? 'bg-purple-50/60' : empStatus === 'Licenca' ? 'bg-cyan-50/60' : empStatus === 'Recluso' ? 'bg-gray-50/60' : '';
                                // Rev. 2932 — datas em formato seguro p/ iOS Safari (corta p/ YYYY-MM-DD e fixa meio-dia)
                                const fmtDataBR = (v: any) => { if (!v) return ""; const d = new Date(String(v).slice(0, 10) + "T12:00:00"); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR"); };
                                const todayStr = new Date().toISOString().slice(0, 10);
                                const expFim: string | null = f.employee?.experienciaFim2 || f.employee?.experienciaFim1 || null;
                                // só sinaliza experiência se houver fim futuro (evita falso-positivo do default 'em_experiencia')
                                const emExperiencia = f.employee?.experienciaStatus === 'em_experiencia' && !!expFim && String(expFim).slice(0, 10) >= todayStr;
                                const feriasAgendada: string | null = f.feriasAgendadaInicio || null;
                                const temStatusBadge = (empStatus === 'AvisoDispensado' && f.avisoDataFim) || (empStatus === 'Aviso' && f.avisoDataFim) || (empStatus === 'Ferias' && f.feriasDataFim) || empStatus === 'Afastado' || empStatus === 'Licenca';
                                const integ: Array<{ cliente: string; tipo: string; dataValidade: string | null; vencida: boolean; semVencimento: boolean }> = Array.isArray(f.integracoes) ? f.integracoes : [];
                                const nrs: Array<{ norma: string; nome: string; dataValidade: string | null; vencida: boolean }> = Array.isArray(f.nrs) ? f.nrs : [];
                                return (
                                <tr key={f.id} className={`hover:bg-slate-50/50 ${rowBg}`} style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-3">
                                      <PersonPhoto
                                        src={f.employee?.fotoUrl}
                                        alt={f.employee?.nomeCompleto || "—"}
                                        size="sm"
                                        caption={f.employee?.cargo || f.employee?.funcao || f.funcaoNaObra || undefined}
                                      />
                                      <div className="min-w-0">
                                        <p className="font-medium text-sm text-blue-700 cursor-pointer hover:underline inline-flex items-center gap-1.5 flex-wrap" onClick={() => setRaioXEmployeeId(f.employeeId)}>
                                          <span className="truncate">{f.employee?.nomeCompleto || "—"}</span>
                                          <CipaBadge
                                            ativo={f.cipaAtivo ?? f.employee?.cipaAtivo}
                                            estabilidade={f.cipaEstabilidade ?? f.employee?.cipaEstabilidade}
                                            fim={f.cipaFimEstabilidade ?? f.employee?.cipaFimEstabilidade}
                                            cargo={f.cipaCargo ?? f.employee?.cipaCargo}
                                          />
                                        </p>
                                        <p className="text-[11px] text-muted-foreground md:hidden">
                                          {f.employee?.cargo || f.employee?.funcao || f.funcaoNaObra || "—"}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-sm text-muted-foreground hidden md:table-cell">
                                    {f.employee?.cargo || f.employee?.funcao || f.funcaoNaObra || "—"}
                                  </td>
                                  <td className="px-4 py-2.5 text-sm text-muted-foreground hidden md:table-cell">
                                    {f.dataInicio ? new Date(f.dataInicio + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                                  </td>
                                  <td className="px-4 py-2.5 text-sm hidden md:table-cell">
                                    <div className="flex flex-col items-start gap-1">
                                      {empStatus === 'AvisoDispensado' && f.avisoDataFim ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-800 border border-orange-300" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                                          Dispensado - Fim: {fmtDataBR(f.avisoDataFim)}
                                        </span>
                                      ) : empStatus === 'Aviso' && f.avisoDataFim ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                                          Aviso prévio - Fim: {fmtDataBR(f.avisoDataFim)}
                                        </span>
                                      ) : empStatus === 'Ferias' && f.feriasDataFim ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                                          Férias - Retorno: {fmtDataBR(f.feriasDataFim)}
                                        </span>
                                      ) : empStatus === 'Afastado' ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-300" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                                          Afastado
                                        </span>
                                      ) : empStatus === 'Licenca' ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-100 text-cyan-800 border border-cyan-300" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                                          Em Licença
                                        </span>
                                      ) : null}
                                      {emExperiencia && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-300" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                                          <GraduationCap className="h-3 w-3" /> Experiência{expFim ? ` até ${fmtDataBR(expFim)}` : ''}
                                        </span>
                                      )}
                                      {feriasAgendada && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-100 text-teal-800 border border-teal-300" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}>
                                          <Plane className="h-3 w-3" /> Sai de férias: {fmtDataBR(feriasAgendada)}
                                        </span>
                                      )}
                                      {!temStatusBadge && !emExperiencia && !feriasAgendada && (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-sm hidden md:table-cell">
                                    <div className="flex flex-col gap-1.5 max-w-[320px]">
                                      {/* Integrações por CLIENTE (employee_integrations) */}
                                      {integ.length > 0 ? (
                                        integ.map((ig, i) => (
                                          <div
                                            key={i}
                                            className={`rounded-lg border px-2 py-1 ${ig.vencida ? 'bg-red-50 border-red-300' : 'bg-emerald-50 border-emerald-300'}`}
                                            style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}
                                          >
                                            {/* Cliente/referência + status de cor + validade */}
                                            <div className="flex items-center gap-1.5">
                                              <span className={`inline-block h-2.5 w-2.5 rounded-full ${ig.vencida ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }} />
                                              <ShieldCheck className={`h-3 w-3 ${ig.vencida ? 'text-red-700' : 'text-emerald-700'}`} />
                                              <span className={`text-[11px] font-semibold ${ig.vencida ? 'text-red-800' : 'text-emerald-800'}`}>{ig.cliente}</span>
                                            </div>
                                            <div className={`text-[10px] mt-0.5 ${ig.vencida ? 'text-red-700' : 'text-emerald-700'}`}>
                                              {ig.dataValidade ? `${ig.vencida ? 'Venceu' : 'Válida até'}: ${fmtDataBR(ig.dataValidade)}` : (ig.vencida ? 'Vencida' : 'Sem vencimento')}
                                            </div>
                                          </div>
                                        ))
                                      ) : (
                                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }} />
                                          Sem integração
                                        </span>
                                      )}
                                      {/* NRs (treinamentos) — coluna "Norma" do Controle de Documentos */}
                                      {nrs.length > 0 && (
                                        <div className="flex flex-wrap gap-1 pt-0.5">
                                          {nrs.map((nr, j) => {
                                            const nrKey = normalizeNrKey(nr.norma);
                                            const resumo = NR_RESUMOS[nrKey] || "Norma Regulamentadora (resumo não cadastrado).";
                                            return (
                                            <Popover key={j}>
                                              <PopoverTrigger asChild>
                                                <button
                                                  type="button"
                                                  aria-label={`${nrKey} — ver resumo da norma`}
                                                  title={`${nr.nome}${nr.dataValidade ? ` — ${nr.vencida ? 'Venceu' : 'Válido até'}: ${fmtDataBR(nr.dataValidade)}` : ''}`}
                                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border cursor-pointer hover:brightness-95 transition ${nr.vencida ? 'bg-red-50 text-red-700 border-red-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}`}
                                                  style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' as any }}
                                                >
                                                  <GraduationCap className="h-2.5 w-2.5" />{nr.norma}
                                                </button>
                                              </PopoverTrigger>
                                              <PopoverContent align="start" className="w-72 p-3 text-left">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${nr.vencida ? 'bg-red-50 text-red-700 border-red-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}`}>
                                                    <GraduationCap className="h-3 w-3" />{nrKey}
                                                  </span>
                                                  <span className={`text-[10px] font-semibold ${nr.vencida ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    {nr.dataValidade ? `${nr.vencida ? 'Venceu' : 'Válido até'}: ${fmtDataBR(nr.dataValidade)}` : (nr.vencida ? 'Vencido' : 'Sem vencimento')}
                                                  </span>
                                                </div>
                                                <p className="text-xs font-semibold text-slate-800 leading-snug">{nr.nome || nrKey}</p>
                                                <p className="text-xs text-slate-600 leading-snug mt-1">{resumo}</p>
                                              </PopoverContent>
                                            </Popover>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 print:hidden">
                                    <div className="flex items-center justify-end gap-1 flex-wrap">
                                      {/* Badge de override ativo */}
                                      {(f.insalubridadeOverride && f.insalubridadeOverride !== 'herda') || (f.periculosidadeOverride && f.periculosidadeOverride !== 'herda') || (f.adicionalEscolhido && f.adicionalEscolhido !== 'auto') ? (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">Override</span>
                                      ) : null}
                                      <Button variant="ghost" size="sm" title="Condições" aria-label="Condições" className="h-7 px-2 text-xs text-[#1B2A4A] hover:text-[#1B2A4A]" onClick={() => {
                                        setCondicoesDialogItem(f);
                                        setCondicoesForm({
                                          insalubridadeOverride: f.insalubridadeOverride ?? 'herda',
                                          periculosidadeOverride: f.periculosidadeOverride ?? 'herda',
                                          adicionalEscolhido: f.adicionalEscolhido ?? 'auto',
                                        });
                                        setCondicoesDialogOpen(true);
                                      }}>
                                        <Settings2 className="h-3.5 w-3.5 lg:mr-1" /> <span className="hidden lg:inline">Condições</span>
                                      </Button>
                                      <Button variant="ghost" size="sm" title="Histórico" aria-label="Histórico" className="h-7 px-2 text-xs" onClick={() => openHistory(f.employeeId)}>
                                        <History className="h-3.5 w-3.5 lg:mr-1" /> <span className="hidden lg:inline">Histórico</span>
                                      </Button>
                                      <Button variant="ghost" size="sm" title="Transferir" aria-label="Transferir" className="h-7 px-2 text-xs" onClick={() => { setSelectedEmployees([f.employeeId]); setAllocForm({ obraId: 0, dataInicio: new Date().toISOString().split("T")[0], motivo: "Transferência" }); setAllocDialogOpen(true); }}>
                                        <ArrowRightLeft className="h-3.5 w-3.5 lg:mr-1" /> <span className="hidden lg:inline">Transferir</span>
                                      </Button>
                                      <Button variant="ghost" size="sm" title="Remover" aria-label="Remover" className="h-7 px-2 text-xs text-red-600 hover:text-red-700" onClick={() => handleRemove(f.employeeId, f.employee?.nomeCompleto || "")}>
                                        <UserMinus className="h-3.5 w-3.5 lg:mr-1" /> <span className="hidden lg:inline">Remover</span>
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          </div>
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

      {/* Dialog de override de condições de trabalho por funcionário */}
      <Dialog open={condicoesDialogOpen} onOpenChange={setCondicoesDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-[#1B2A4A]" />
              Condições de Trabalho — {condicoesDialogItem?.employee?.nomeCompleto || "Funcionário"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Define se este funcionário herda as condições da obra ou tem configuração específica.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const obra = obrasAtivas.find((o: any) => o.id === selectedObraId);
            const obraInsGrau = obra?.insalubridadeGrau ?? 'none';
            const obraPeri = obra?.periculosidade === 1;
            const obraNoturno = obra?.adicionalNoturnoAtivo === 1;
            const grauLabels: Record<string, string> = { none: 'Não aplicável', minimo: 'Mínimo (10%)', medio: 'Médio (20%)', maximo: 'Máximo (40%)' };
            // Determinar se a escolha manual é contra o mais vantajoso (CLT Art. 193 §2)
            const insaGrauEfetivo = condicoesForm.insalubridadeOverride === 'herda' ? obraInsGrau
              : condicoesForm.insalubridadeOverride === 'none' ? 'none'
              : condicoesForm.insalubridadeOverride;
            const periEfetivo = condicoesForm.periculosidadeOverride === 'herda' ? obraPeri
              : condicoesForm.periculosidadeOverride === 'sim';
            const grauPct: Record<string, number> = { minimo: 0.10, medio: 0.20, maximo: 0.40, none: 0 };
            const insaValor = insaGrauEfetivo !== 'none' ? 1518 * (grauPct[insaGrauEfetivo] ?? 0) : 0;
            const periValor = periEfetivo ? ((parseFloat(condicoesDialogItem?.employee?.salario || '0') || 0) * 0.30) : 0;
            const escolhaContraClt = condicoesForm.adicionalEscolhido !== 'auto'
              && ((condicoesForm.adicionalEscolhido === 'insalubridade' && periValor > insaValor && periValor > 0)
              || (condicoesForm.adicionalEscolhido === 'periculosidade' && insaValor > periValor && insaValor > 0));
            return (
              <div className="space-y-5 py-2">
                {/* Condições da obra (referência) */}
                {obra && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Condições da Obra (padrão)</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium ${obraInsGrau !== 'none' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-500'}`}>
                        <Thermometer className="h-3 w-3" /> Insalubridade: {grauLabels[obraInsGrau] ?? obraInsGrau}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium ${obraPeri ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-500'}`}>
                        <Zap className="h-3 w-3" /> Periculosidade: {obraPeri ? 'Sim (30%)' : 'Não'}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium ${obraNoturno ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}>
                        <Moon className="h-3 w-3" /> Noturno: {obraNoturno ? 'Ativo' : 'Não'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Override: Insalubridade */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Thermometer className="h-4 w-4 text-yellow-600" /> Insalubridade individual
                  </Label>
                  <Select value={condicoesForm.insalubridadeOverride} onValueChange={v => setCondicoesForm(f => ({ ...f, insalubridadeOverride: v }))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="herda">Herdar da obra ({grauLabels[obraInsGrau] ?? obraInsGrau})</SelectItem>
                      <SelectItem value="none">Não aplicável (sem insalubridade)</SelectItem>
                      <SelectItem value="minimo">Grau Mínimo — 10% do salário mínimo</SelectItem>
                      <SelectItem value="medio">Grau Médio — 20% do salário mínimo</SelectItem>
                      <SelectItem value="maximo">Grau Máximo — 40% do salário mínimo</SelectItem>
                    </SelectContent>
                  </Select>
                  {insaValor > 0 && <p className="text-[11px] text-muted-foreground">Valor estimado: R$ {insaValor.toFixed(2).replace('.', ',')}/mês (SM = R$ 1.518,00)</p>}
                </div>

                {/* Override: Periculosidade */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-orange-600" /> Periculosidade individual
                  </Label>
                  <Select value={condicoesForm.periculosidadeOverride} onValueChange={v => setCondicoesForm(f => ({ ...f, periculosidadeOverride: v }))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="herda">Herdar da obra ({obraPeri ? 'Sim — 30% sal. base' : 'Não'})</SelectItem>
                      <SelectItem value="sim">Sim — 30% do salário base (Art. 193)</SelectItem>
                      <SelectItem value="nao">Não — isento de periculosidade</SelectItem>
                    </SelectContent>
                  </Select>
                  {periValor > 0 && <p className="text-[11px] text-muted-foreground">Valor estimado: R$ {periValor.toFixed(2).replace('.', ',')}/mês</p>}
                </div>

                {/* Adicional Escolhido */}
                {(insaValor > 0 || periValor > 0) && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">Adicional a aplicar na folha</Label>
                    <Select value={condicoesForm.adicionalEscolhido} onValueChange={v => setCondicoesForm(f => ({ ...f, adicionalEscolhido: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Automático — sistema escolhe o mais vantajoso ({insaValor >= periValor ? 'Insalubridade' : 'Periculosidade'} = R$ {Math.max(insaValor, periValor).toFixed(2).replace('.', ',')})</SelectItem>
                        {insaValor > 0 && <SelectItem value="insalubridade">Insalubridade — R$ {insaValor.toFixed(2).replace('.', ',')} (Art. 192)</SelectItem>}
                        {periValor > 0 && <SelectItem value="periculosidade">Periculosidade — R$ {periValor.toFixed(2).replace('.', ',')} (Art. 193)</SelectItem>}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">CLT Art. 193 §2: insalubridade e periculosidade não acumulam. O sistema aplica apenas um.</p>
                  </div>
                )}

                {/* Alerta: escolha contra o mais vantajoso */}
                {escolhaContraClt && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Escolha menos vantajosa ao funcionário</p>
                      <p className="text-xs text-red-700 mt-0.5">
                        O adicional de {condicoesForm.adicionalEscolhido === 'insalubridade' ? 'periculosidade' : 'insalubridade'} (R$ {Math.max(insaValor, periValor).toFixed(2).replace('.', ',')}) é mais vantajoso que o escolhido. Verifique se a escolha foi acordada com o funcionário.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCondicoesDialogOpen(false)}>Cancelar</Button>
            <Button
              className="bg-[#1B2A4A] text-white hover:bg-[#1B2A4A]/90"
              disabled={updateCondicoesMut.isPending}
              onClick={() => {
                if (!condicoesDialogItem?.id) return;
                updateCondicoesMut.mutate({
                  id: condicoesDialogItem.id,
                  insalubridadeOverride: condicoesForm.insalubridadeOverride as any,
                  periculosidadeOverride: condicoesForm.periculosidadeOverride as any,
                  adicionalEscolhido: condicoesForm.adicionalEscolhido as any,
                });
              }}
            >
              {updateCondicoesMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Salvar Condições
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintFooterLGPD />
    </DashboardLayout>
  );
}
