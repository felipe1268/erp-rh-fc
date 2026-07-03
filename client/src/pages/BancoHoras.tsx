import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { toast } from "sonner";
import {
  ArrowLeftRight, AlertTriangle, Clock, CreditCard, RefreshCw,
  Users, FileText, Settings, Search, Printer, ChevronDown, ChevronRight, ChevronLeft,
  CalendarDays, Scale, Info, ShieldAlert,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";

function minsToHHMM(mins: number): string {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = String(Math.abs(mins) % 60).padStart(2, "0");
  return `${mins < 0 ? "-" : ""}${h}h${m}`;
}

function minsToHHMMSigned(mins: number): string {
  const n = Number(mins || 0);
  if (n === 0) return "—";
  return `${n > 0 ? "+" : ""}${minsToHHMM(n)}`;
}

// Rev. 3996 — nav mensal (mesmo padrão visual do calendário de Jan-Dez da Folha de Pagamento)
const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type TabView = "saldos" | "extrato" | "alertas" | "configuracao";

export default function BancoHoras() {
  const { isAdminMaster, hasGroup, groupCanAccessRoute, isLoading: permissionsLoading } = usePermissions();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const canAccess = isAdminMaster || !hasGroup || groupCanAccessRoute("/banco-horas");
  const [activeTab, setActiveTab] = useState<TabView>("saldos");
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);
  const [debitEmpId, setDebitEmpId] = useState<number | null>(null);
  const [debitHoras, setDebitHoras] = useState(0);
  const [debitMins, setDebitMins] = useState(0);
  const [debitData, setDebitData] = useState(new Date().toISOString().slice(0, 10));
  const [debitDesc, setDebitDesc] = useState("");

  const [extratoEmpId, setExtratoEmpId] = useState<number | null>(null);
  const [extratoAno, setExtratoAno] = useState(() => new Date().getFullYear());
  const [extratoMesNum, setExtratoMesNum] = useState(() => new Date().getMonth() + 1);
  const extratoMes = `${extratoAno}-${String(extratoMesNum).padStart(2, "0")}`;
  const [extratoPeriodoInicio, setExtratoPeriodoInicio] = useState("");
  const [extratoPeriodoFim, setExtratoPeriodoFim] = useState("");
  const extratoPeriodoAtivo = !!(extratoPeriodoInicio && extratoPeriodoFim);

  // Rev. 3996 — navegador mensal da aba "Saldos" (estilo Folha de Pagamento).
  const [anoBanco, setAnoBanco] = useState(() => new Date().getFullYear());
  const [mesBanco, setMesBanco] = useState(() => new Date().getMonth() + 1);
  const agora = new Date();
  const isMesAtual = anoBanco === agora.getFullYear() && mesBanco === (agora.getMonth() + 1);

  const destinoPadrao = trpc.horasExtras.getHeDestinoPadrao.useQuery(
    { companyId },
    { enabled: canAccess && companyId > 0 }
  );
  // Rev. 3977 — lista de funcionários CLT ativos para gestão da exceção bidirecional
  // (funcionário específico foge da regra padrão da empresa no destino de HE / débito de banco).
  const empListaExcecao = trpc.employees.list.useQuery(
    { companyId, status: "Ativo", excludeTerminated: true },
    { enabled: canAccess && companyId > 0 }
  );
  const [excecaoSearch, setExcecaoSearch] = useState("");
  const setExcecaoMut = trpc.employees.update.useMutation({
    onSuccess: () => {
      toast.success("Exceção atualizada.");
      empListaExcecao.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const setDestinoPadraoMut = trpc.horasExtras.setHeDestinoPadrao.useMutation({
    onSuccess: (data) => {
      toast.success(data.destino === "banco_horas"
        ? "Configurado: horas extras irão para o Banco de Horas"
        : "Configurado: horas extras serão pagas na folha");
      destinoPadrao.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const isBancoAtivo = (destinoPadrao.data ?? "banco_horas") === "banco_horas";

  const saldoBanco = trpc.horasExtras.getSaldoBanco.useQuery(
    { companyId },
    { enabled: canAccess && companyId > 0 }
  );
  // Rev. 3996 — saldo/movimento do mês navegado na aba "Saldos".
  const saldoBancoMensal = trpc.horasExtras.getSaldoBancoMensal.useQuery(
    { companyId, ano: anoBanco, mes: mesBanco },
    { enabled: canAccess && companyId > 0 }
  );
  const resumoMensalBanco = trpc.horasExtras.getResumoMensalBanco.useQuery(
    { companyId, ano: anoBanco },
    { enabled: canAccess && companyId > 0 }
  );
  const alertasExpiracao = trpc.horasExtras.getAlertasExpiracao.useQuery(
    { companyId },
    { enabled: canAccess && companyId > 0 }
  );
  // Rev. 3977 — alerta mensal de saldo negativo (débito de atraso/falta) e alerta
  // trimestral de saldo positivo elevado — apenas informativos, SEM auto-payout.
  const alertasSaldoNegativo = trpc.horasExtras.getAlertasSaldoNegativo.useQuery(
    { companyId },
    { enabled: canAccess && companyId > 0 }
  );
  const alertasSaldoPositivoTrimestral = trpc.horasExtras.getAlertasSaldoPositivoTrimestral.useQuery(
    { companyId },
    { enabled: canAccess && companyId > 0 }
  );
  const lancamentosSaldos = trpc.horasExtras.getLancamentos.useQuery(
    { employeeId: selectedEmpId ?? 0, companyId },
    { enabled: !!selectedEmpId && companyId > 0 }
  );
  const lancamentosExtrato = trpc.horasExtras.getLancamentos.useQuery(
    { employeeId: extratoEmpId ?? 0, companyId },
    { enabled: !!extratoEmpId && companyId > 0 }
  );

  const debitarBancoMut = trpc.horasExtras.debitarBanco.useMutation({
    onSuccess: () => {
      toast.success("Débito registrado com sucesso!");
      setDebitEmpId(null);
      setDebitDesc("");
      setDebitHoras(0);
      setDebitMins(0);
      saldoBanco.refetch();
      saldoBancoMensal.refetch();
      resumoMensalBanco.refetch();
      lancamentosSaldos.refetch();
      alertasExpiracao.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Rev. 2575 — seleção múltipla + dar baixa em lote
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Rev. 3996 — trocar de mês/ano no navegador da aba "Saldos" limpa a seleção em lote.
  const selecionarMes = (mes: number) => { setMesBanco(mes); setSelectedIds(new Set()); };
  const mudarAno = (delta: number) => { setAnoBanco(a => a + delta); setSelectedIds(new Set()); };
  const [showBaixaLote, setShowBaixaLote] = useState(false);
  const [baixaLoteDesc, setBaixaLoteDesc] = useState("Pagamento de horas extras na folha");
  const [baixaLoteData, setBaixaLoteData] = useState(new Date().toISOString().slice(0, 10));

  const debitarBancoLoteMut = trpc.horasExtras.debitarBancoLote.useMutation({
    onSuccess: (res: any) => {
      const ign = res?.ignorados?.length ? ` (${res.ignorados.length} sem saldo ignorado(s))` : "";
      const fal = res?.falhas?.length ?? 0;
      toast.success(`Baixa registrada para ${res?.processados ?? 0} funcionário(s)${ign}.`);
      if (fal > 0) toast.error(`${fal} funcionário(s) falharam e não tiveram o saldo alterado.`);
      setShowBaixaLote(false);
      setSelectedIds(new Set());
      saldoBanco.refetch();
      saldoBancoMensal.refetch();
      resumoMensalBanco.refetch();
      lancamentosSaldos.refetch();
      alertasExpiracao.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const saldos = useMemo(() => (saldoBanco.data ?? []) as any[], [saldoBanco.data]);
  const alertas = useMemo(() => (alertasExpiracao.data ?? []) as any[], [alertasExpiracao.data]);
  const alertasNegativos = useMemo(() => (alertasSaldoNegativo.data ?? []) as any[], [alertasSaldoNegativo.data]);
  const alertasPositivosTri = useMemo(() => (alertasSaldoPositivoTrimestral.data ?? []) as any[], [alertasSaldoPositivoTrimestral.data]);
  const empExcecaoList = useMemo(() => {
    const list = (empListaExcecao.data ?? []) as any[];
    const cltOnly = list.filter((e: any) => e.tipoContrato === "CLT");
    if (!excecaoSearch.trim()) return cltOnly;
    const s = excecaoSearch.toLowerCase();
    return cltOnly.filter((e: any) => String(e.nomeCompleto || "").toLowerCase().includes(s));
  }, [empListaExcecao.data, excecaoSearch]);
  const lancamentosSaldosList = useMemo(() => (lancamentosSaldos.data ?? []) as any[], [lancamentosSaldos.data]);
  const lancamentosExtratoList = useMemo(() => (lancamentosExtrato.data ?? []) as any[], [lancamentosExtrato.data]);
  const totalBancoMins = useMemo(() => saldos.reduce((acc: number, s: any) => acc + Number(s.saldoMinutos || 0), 0), [saldos]);

  const saldoMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of saldos) m.set(Number(s.employeeId), Number(s.saldoMinutos || 0));
    return m;
  }, [saldos]);

  // Rev. 2575 — total de minutos dos selecionados (com saldo > 0)
  const selecionadosComSaldo = useMemo(
    () => Array.from(selectedIds).filter((id) => (saldoMap.get(id) || 0) > 0),
    [selectedIds, saldoMap],
  );
  const totalSelecionadoMins = useMemo(
    () => selecionadosComSaldo.reduce((acc, id) => acc + (saldoMap.get(id) || 0), 0),
    [selecionadosComSaldo, saldoMap],
  );
  const toggleSelected = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const filteredSaldos = useMemo(() => {
    if (!searchTerm.trim()) return saldos;
    const term = searchTerm.toLowerCase();
    return saldos.filter((s: any) =>
      s.nomeCompleto?.toLowerCase().includes(term) || s.funcao?.toLowerCase().includes(term)
    );
  }, [saldos, searchTerm]);

  // Rev. 3996 — saldo/movimento do mês navegado (aba "Saldos"): saldo acumulado ATÉ O
  // FIM do mês selecionado + o líquido movimentado NAQUELE mês (histórico real, via soma
  // de banco_horas_lancamentos — ver getSaldoBancoMensal). Mês atual == saldo ao vivo.
  const saldosMensal = useMemo(() => (saldoBancoMensal.data ?? []) as any[], [saldoBancoMensal.data]);
  const totalBancoMensalMins = useMemo(
    () => saldosMensal.reduce((acc: number, s: any) => acc + Number(s.saldoMinutos || 0), 0),
    [saldosMensal],
  );
  const funcComSaldoMensalCount = useMemo(
    () => saldosMensal.filter((s: any) => Number(s.saldoMinutos || 0) !== 0).length,
    [saldosMensal],
  );
  const filteredSaldosMensal = useMemo(() => {
    if (!searchTerm.trim()) return saldosMensal;
    const term = searchTerm.toLowerCase();
    return saldosMensal.filter((s: any) =>
      s.nomeCompleto?.toLowerCase().includes(term) || s.funcao?.toLowerCase().includes(term)
    );
  }, [saldosMensal, searchTerm]);
  const mesesComLancamento = useMemo(() => {
    const s = new Set<number>();
    for (const r of (resumoMensalBanco.data ?? []) as any[]) s.add(Number(r.mes));
    return s;
  }, [resumoMensalBanco.data]);

  const debitarEmpNome = useMemo(() => {
    if (!debitEmpId) return "";
    return saldos.find((s: any) => Number(s.employeeId) === debitEmpId)?.nomeCompleto || "";
  }, [debitEmpId, saldos]);

  const selectedEmpNome = useMemo(() => {
    if (!selectedEmpId) return "";
    return saldos.find((s: any) => Number(s.employeeId) === selectedEmpId)?.nomeCompleto || "";
  }, [selectedEmpId, saldos]);

  const lancamentosFiltradosMes = useMemo(() => {
    if (extratoPeriodoAtivo) {
      return lancamentosExtratoList.filter((l: any) => {
        const d = String(l.data).slice(0, 10);
        return d >= extratoPeriodoInicio && d <= extratoPeriodoFim;
      });
    }
    if (!extratoMes) return lancamentosExtratoList;
    return lancamentosExtratoList.filter((l: any) => String(l.data).slice(0, 7) === extratoMes);
  }, [lancamentosExtratoList, extratoMes, extratoPeriodoAtivo, extratoPeriodoInicio, extratoPeriodoFim]);

  const tabs: { id: TabView; label: string; icon: any; count?: number }[] = [
    { id: "saldos", label: "Saldos", icon: Users, count: funcComSaldoMensalCount },
    { id: "extrato", label: "Extrato Mensal", icon: FileText },
    { id: "alertas", label: "Alertas", icon: AlertTriangle, count: alertas.length + alertasNegativos.length + alertasPositivosTri.length },
    { id: "configuracao", label: "Regras & Orientação", icon: Scale },
  ];

  if (permissionsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center text-muted-foreground">
            <RefreshCw className="h-10 w-10 mx-auto mb-3 animate-spin opacity-30" />
            <p className="text-sm">Verificando permissões...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!canAccess) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center text-muted-foreground">
            <ShieldAlert className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Acesso Restrito</p>
            <p className="text-sm">Você não tem permissão para acessar o Banco de Horas.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-5 bg-gray-50 min-h-screen">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Banco de Horas</h1>
              <p className="text-xs text-muted-foreground">Gestão de saldos, compensações e adequação legal (CLT Art. 59)</p>
            </div>
          </div>
        </div>

        <Card className={`border-2 ${isBancoAtivo ? "border-blue-400 bg-blue-50/40" : "border-orange-300 bg-orange-50/40"}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isBancoAtivo ? "bg-blue-600 text-white" : "bg-orange-500 text-white"}`}>
                  {isBancoAtivo ? <ArrowLeftRight className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                </div>
                <div>
                  <p className="font-bold text-base">
                    {isBancoAtivo ? "Banco de Horas ATIVO" : "Hora Extra (Pagamento) ATIVO"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isBancoAtivo
                      ? "As horas extras calculadas serão creditadas no banco para compensação futura"
                      : "As horas extras calculadas serão pagas na folha de pagamento"}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-3">
                  <Button
                    variant={isBancoAtivo ? "outline" : "default"}
                    className={!isBancoAtivo ? "bg-orange-500 hover:bg-orange-600" : ""}
                    disabled={setDestinoPadraoMut.isPending || !isBancoAtivo || !isAdminMaster}
                    title={!isAdminMaster ? "Somente o Administrador Master pode alterar esta configuração" : undefined}
                    onClick={() => setDestinoPadraoMut.mutate({ companyId, destino: "pagamento" })}
                  >
                    <CreditCard className="h-4 w-4 mr-1.5" />
                    Hora Extra
                  </Button>
                  <Button
                    variant={isBancoAtivo ? "default" : "outline"}
                    className={isBancoAtivo ? "bg-blue-600 hover:bg-blue-700" : ""}
                    disabled={setDestinoPadraoMut.isPending || isBancoAtivo || !isAdminMaster}
                    title={!isAdminMaster ? "Somente o Administrador Master pode alterar esta configuração" : undefined}
                    onClick={() => setDestinoPadraoMut.mutate({ companyId, destino: "banco_horas" })}
                  >
                    <ArrowLeftRight className="h-4 w-4 mr-1.5" />
                    Banco de Horas
                  </Button>
                </div>
                {!isAdminMaster && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" /> Somente Admin Master pode alterar
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rev. 3996 — navegador mensal (mesmo padrão da Folha de Pagamento) */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => mudarAno(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-bold text-lg min-w-[60px] text-center">{anoBanco}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => mudarAno(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500" /> Com lançamento</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-gray-200" /> Sem dados</div>
              </div>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {MESES_CURTOS.map((nome, i) => {
                const mes = i + 1;
                const isSelected = mes === mesBanco;
                const temDados = mesesComLancamento.has(mes);
                const statusClasses = temDados
                  ? "bg-blue-500 text-white hover:bg-blue-600 border-blue-600"
                  : "bg-gray-200 text-gray-500 hover:bg-gray-300 border-gray-300";
                const selectionClasses = isSelected ? "ring-2 ring-offset-1 ring-[#1B2A4A] shadow-md scale-105" : "";
                return (
                  <button key={mes} onClick={() => selecionarMes(mes)}
                    className={`relative rounded-lg py-2 px-1 text-center text-sm font-medium transition-all border-2 ${statusClasses} ${selectionClasses}`}>
                    {nome}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[#1B2A4A]" />
          <span className="text-sm font-semibold text-[#1B2A4A]">{MESES_LONGOS[mesBanco - 1]} {anoBanco}</span>
          {!isMesAtual && (
            <span className="text-xs text-muted-foreground">
              · saldo histórico até o fim do mês — ações de débito disponíveis apenas no mês atual
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <Card className="border-blue-200">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total em Banco</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{minsToHHMM(totalBancoMensalMins)}</p>
              <p className="text-xs text-muted-foreground mt-1">acumulado até {MESES_CURTOS[mesBanco - 1]}/{anoBanco}</p>
            </CardContent>
          </Card>
          <Card className="border-blue-200">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Funcionários com Saldo</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{funcComSaldoMensalCount}</p>
              <p className="text-xs text-muted-foreground mt-1">com banco ativo</p>
            </CardContent>
          </Card>
          <Card className={alertas.length > 0 ? "border-amber-300 bg-amber-50/30" : "border-gray-200"}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Alertas de Expiração</p>
              <p className={`text-2xl font-bold mt-1 ${alertas.length > 0 ? "text-amber-600" : "text-gray-400"}`}>{alertas.length}</p>
              <p className="text-xs text-muted-foreground mt-1">créditos a vencer (12 meses)</p>
            </CardContent>
          </Card>
          <Card className={alertasNegativos.length > 0 ? "border-red-300 bg-red-50/30" : "border-gray-200"}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Saldo Negativo (mensal)</p>
              <p className={`text-2xl font-bold mt-1 ${alertasNegativos.length > 0 ? "text-red-600" : "text-gray-400"}`}>{alertasNegativos.length}</p>
              <p className="text-xs text-muted-foreground mt-1">funcionários devendo horas</p>
            </CardContent>
          </Card>
          <Card className={alertasPositivosTri.length > 0 ? "border-sky-300 bg-sky-50/30" : "border-gray-200"}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Saldo Positivo (trimestral)</p>
              <p className={`text-2xl font-bold mt-1 ${alertasPositivosTri.length > 0 ? "text-sky-600" : "text-gray-400"}`}>{alertasPositivosTri.length}</p>
              <p className="text-xs text-muted-foreground mt-1">créditos há +3 meses</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  t.id === "alertas" && t.count > 0 ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "saldos" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[250px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar funcionário..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Rev. 2575 — barra de ação em lote (aparece com ≥1 selecionado) */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 flex-wrap bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 no-print">
                <span className="text-sm font-medium text-orange-800">
                  {selectedIds.size} selecionado(s)
                  {totalSelecionadoMins > 0 && (
                    <> · total a dar baixa: <strong className="text-orange-700">{minsToHHMM(totalSelecionadoMins)}</strong></>
                  )}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelectedIds(new Set())}>
                    Limpar seleção
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-orange-600 hover:bg-orange-700"
                    disabled={selecionadosComSaldo.length === 0}
                    onClick={() => {
                      setBaixaLoteData(new Date().toISOString().slice(0, 10));
                      setShowBaixaLote(true);
                    }}
                  >
                    <CreditCard className="h-4 w-4 mr-1.5" /> Dar baixa nos selecionados
                  </Button>
                </div>
              </div>
            )}

            {saldoBancoMensal.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando saldos...</div>
            ) : filteredSaldosMensal.length > 0 ? (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-gray-200 bg-gray-50/50">
                          <th className="py-3 px-4 w-10 no-print" onClick={e => e.stopPropagation()}>
                            <Checkbox
                              aria-label="Selecionar todos"
                              disabled={!isMesAtual}
                              checked={filteredSaldosMensal.length > 0 && filteredSaldosMensal.every((s: any) => selectedIds.has(Number(s.employeeId)))}
                              onCheckedChange={(c) => {
                                if (c) {
                                  setSelectedIds(new Set(filteredSaldosMensal.map((s: any) => Number(s.employeeId))));
                                } else {
                                  setSelectedIds(new Set());
                                }
                              }}
                            />
                          </th>
                          <th className="text-left py-3 px-4 font-semibold">Funcionário</th>
                          <th className="text-left py-3 px-4 font-semibold">Cargo</th>
                          <th className="text-right py-3 px-4 font-semibold">Movimento no Mês</th>
                          <th className="text-right py-3 px-4 font-semibold">Saldo{!isMesAtual ? ` (até ${MESES_CURTOS[mesBanco - 1]}/${anoBanco})` : ""}</th>
                          <th className="text-right py-3 px-4 font-semibold">Última Movimentação</th>
                          <th className="text-center py-3 px-4 font-semibold no-print">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSaldosMensal.map((s: any) => {
                          const isExpiring = alertas.some((a: any) => Number(a.employeeId) === Number(s.employeeId));
                          const isOpen = selectedEmpId === Number(s.employeeId);
                          const movimento = Number(s.movimentoMesMinutos || 0);
                          return (
                            <tr key={s.employeeId}
                              className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${isExpiring ? "bg-amber-50/30" : ""} ${isOpen ? "bg-blue-50/50" : ""}`}
                              onClick={() => setSelectedEmpId(isOpen ? null : Number(s.employeeId))}
                            >
                              <td className="py-3 px-4 w-10 no-print" onClick={e => e.stopPropagation()}>
                                <Checkbox
                                  aria-label={`Selecionar ${s.nomeCompleto}`}
                                  disabled={!isMesAtual}
                                  checked={selectedIds.has(Number(s.employeeId))}
                                  onCheckedChange={() => toggleSelected(Number(s.employeeId))}
                                />
                              </td>
                              <td className="py-3 px-4 font-medium">
                                <div className="flex items-center gap-2">
                                  {isOpen ? <ChevronDown className="h-4 w-4 text-blue-500" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                                  {s.nomeCompleto}
                                  {isExpiring && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">⚠ VENCENDO</span>}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-xs text-muted-foreground">{s.funcao || "—"}</td>
                              <td className={`text-right py-3 px-4 text-xs font-medium ${movimento > 0 ? "text-green-600" : movimento < 0 ? "text-orange-600" : "text-muted-foreground"}`}>
                                {minsToHHMMSigned(movimento)}
                              </td>
                              <td className={`text-right py-3 px-4 font-bold text-base ${Number(s.saldoMinutos) < 0 ? "text-red-600" : "text-blue-700"}`}>{minsToHHMM(Number(s.saldoMinutos))}</td>
                              <td className="text-right py-3 px-4 text-xs text-muted-foreground">
                                {s.ultimoLancamento ? new Date(s.ultimoLancamento).toLocaleDateString("pt-BR") : "—"}
                              </td>
                              <td className="text-center py-3 px-4 no-print" onClick={e => e.stopPropagation()}>
                                <div className="flex justify-center gap-1">
                                  <Button size="sm" variant="outline" className="h-7 text-xs"
                                    onClick={(e) => { e.stopPropagation(); setSelectedEmpId(isOpen ? null : Number(s.employeeId)); }}>
                                    {isOpen ? "Fechar" : "Histórico"}
                                  </Button>
                                  <Button size="sm" className="h-7 text-xs bg-orange-500 hover:bg-orange-600"
                                    disabled={!isMesAtual}
                                    title={!isMesAtual ? "Débito só é aplicado ao saldo atual — volte ao mês corrente" : undefined}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDebitEmpId(debitEmpId === Number(s.employeeId) ? null : Number(s.employeeId));
                                      setDebitDesc("");
                                      setDebitHoras(0);
                                      setDebitMins(0);
                                    }}>
                                    Debitar
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
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center text-muted-foreground text-sm">
                <ArrowLeftRight className="h-10 w-10 text-blue-300 mx-auto mb-3" />
                <p className="font-medium text-blue-700 mb-1">Nenhum funcionário com saldo no banco de horas em {MESES_LONGOS[mesBanco - 1]}/{anoBanco}</p>
                <p>Saldos aparecem após aprovação de períodos de HE com destinação "Banco de Horas" na tela de Folha de Pagamento.</p>
              </div>
            )}

            {selectedEmpId && (
              <Card className="border-blue-300">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      Histórico de Movimentações — {selectedEmpNome}
                    </p>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedEmpId(null)}>Fechar</Button>
                  </div>
                  {lancamentosSaldos.isLoading ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">Carregando histórico...</div>
                  ) : lancamentosSaldosList.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50/50">
                            <th className="text-left py-2 px-3">Data</th>
                            <th className="text-left py-2 px-3">Tipo</th>
                            <th className="text-right py-2 px-3">Horas</th>
                            <th className="text-left py-2 px-3">Descrição</th>
                            <th className="text-left py-2 px-3">Registrado por</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lancamentosSaldosList.map((l: any) => (
                            <tr key={l.id} className="border-b border-gray-100">
                              <td className="py-2 px-3 text-xs">{new Date(l.data).toLocaleDateString("pt-BR")}</td>
                              <td className="py-2 px-3">
                                <Badge className={`text-[10px] ${l.tipo === "credito" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                                  {l.tipo === "credito" ? "+ Crédito" : "− Débito"}
                                </Badge>
                              </td>
                              <td className="text-right py-2 px-3 font-medium">{minsToHHMM(Number(l.minutos))}</td>
                              <td className="py-2 px-3 text-xs text-muted-foreground">{l.descricao || "—"}</td>
                              <td className="py-2 px-3 text-xs text-muted-foreground">{l.criadoPor || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground text-sm py-4">Nenhum lançamento encontrado.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {debitEmpId && (
              <Card className="border-orange-300 bg-orange-50/20">
                <CardContent className="p-5">
                  <p className="font-semibold text-sm mb-4 flex items-center gap-2 text-orange-700">
                    <CreditCard className="h-4 w-4" /> Registrar Débito (Folga Compensatória) — {debitarEmpNome}
                    <span className="ml-auto text-xs text-muted-foreground font-normal">
                      Saldo atual: <strong className="text-blue-700">{minsToHHMM(saldoMap.get(debitEmpId) || 0)}</strong>
                    </span>
                  </p>
                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Data da Compensação</label>
                      <input type="date" value={debitData} onChange={e => setDebitData(e.target.value)}
                        className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Horas</label>
                      <input type="number" min="0" max="23" value={debitHoras}
                        onChange={e => setDebitHoras(Math.max(0, parseInt(e.target.value) || 0))}
                        className="border rounded px-3 py-1.5 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Minutos</label>
                      <input type="number" min="0" max="59" value={debitMins}
                        onChange={e => setDebitMins(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                        className="border rounded px-3 py-1.5 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-xs text-muted-foreground block mb-1">Motivo</label>
                      <input type="text" value={debitDesc} onChange={e => setDebitDesc(e.target.value)}
                        className="border rounded px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-300"
                        placeholder="Ex: Folga compensatória dia 20/03/2026" />
                    </div>
                    <Button className="bg-orange-600 hover:bg-orange-700"
                      disabled={debitarBancoMut.isPending || (debitHoras === 0 && debitMins === 0) || debitDesc.trim().length < 3}
                      onClick={() => debitarBancoMut.mutate({
                        employeeId: debitEmpId,
                        companyId,
                        minutos: debitHoras * 60 + debitMins,
                        descricao: debitDesc,
                        data: debitData,
                      })}>
                      {debitarBancoMut.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Registrando...</> : "Registrar Débito"}
                    </Button>
                    <Button variant="outline" onClick={() => setDebitEmpId(null)}>Cancelar</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Rev. 2575 — Dialog de confirmação da baixa em lote (zera o saldo) */}
            <Dialog open={showBaixaLote} onOpenChange={(o) => { if (!o) setShowBaixaLote(false); }}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-orange-700">
                    <CreditCard className="h-5 w-5" /> Dar baixa no banco de horas
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-sm">
                  <p className="text-muted-foreground">
                    Esta ação <strong>zera o saldo</strong> de{" "}
                    <strong className="text-orange-700">{selecionadosComSaldo.length} funcionário(s)</strong>{" "}
                    selecionado(s), totalizando{" "}
                    <strong className="text-orange-700">{minsToHHMM(totalSelecionadoMins)}</strong>. Use quando as horas
                    já foram pagas na folha. Cada baixa fica registrada no histórico.
                  </p>
                  {selectedIds.size !== selecionadosComSaldo.length && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      {selectedIds.size - selecionadosComSaldo.length} selecionado(s) sem saldo serão ignorados.
                    </p>
                  )}
                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Data da baixa</label>
                      <input type="date" value={baixaLoteData} onChange={e => setBaixaLoteData(e.target.value)}
                        className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    </div>
                    <div className="flex-1 min-w-[220px]">
                      <label className="text-xs text-muted-foreground block mb-1">Motivo</label>
                      <input type="text" value={baixaLoteDesc} onChange={e => setBaixaLoteDesc(e.target.value)}
                        className="border rounded px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-300"
                        placeholder="Ex: Pagamento de horas extras na folha" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowBaixaLote(false)}>Cancelar</Button>
                  <Button
                    className="bg-orange-600 hover:bg-orange-700"
                    disabled={debitarBancoLoteMut.isPending || selecionadosComSaldo.length === 0 || baixaLoteDesc.trim().length < 3}
                    onClick={() => debitarBancoLoteMut.mutate({
                      employeeIds: selecionadosComSaldo,
                      companyId,
                      descricao: baixaLoteDesc,
                      data: baixaLoteData,
                    })}
                  >
                    {debitarBancoLoteMut.isPending
                      ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Processando...</>
                      : `Dar baixa em ${selecionadosComSaldo.length}`}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {activeTab === "extrato" && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-[250px]">
                    <label className="text-xs text-muted-foreground block mb-1">Funcionário</label>
                    <Select value={extratoEmpId ? String(extratoEmpId) : ""} onValueChange={v => setExtratoEmpId(v ? Number(v) : null)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um funcionário" />
                      </SelectTrigger>
                      <SelectContent>
                        {saldos.map((s: any) => (
                          <SelectItem key={s.employeeId} value={String(s.employeeId)}>
                            {s.nomeCompleto} — {minsToHHMM(Number(s.saldoMinutos))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {extratoEmpId && (
                    <div className="self-end">
                      <Button variant="outline" className="gap-1.5" onClick={() => window.print()}>
                        <Printer className="h-4 w-4" /> Imprimir Extrato
                      </Button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Período de Referência (mês a mês)</label>
                  <PeriodSelectorCard
                    ano={extratoAno}
                    mes={extratoMesNum}
                    onAno={setExtratoAno}
                    onMes={(m) => {
                      setExtratoMesNum(m);
                      setExtratoPeriodoInicio("");
                      setExtratoPeriodoFim("");
                    }}
                    className={extratoPeriodoAtivo ? "opacity-50 pointer-events-none" : ""}
                  />
                </div>

                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-medium text-gray-600 mb-2">Ou pesquise um período específico (data a data)</p>
                  <div className="flex items-end gap-3 flex-wrap">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">De</label>
                      <input type="date" value={extratoPeriodoInicio} onChange={e => setExtratoPeriodoInicio(e.target.value)}
                        className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Até</label>
                      <input type="date" value={extratoPeriodoFim} onChange={e => setExtratoPeriodoFim(e.target.value)}
                        className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    </div>
                    {extratoPeriodoAtivo && (
                      <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setExtratoPeriodoInicio(""); setExtratoPeriodoFim(""); }}>
                        Limpar período
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {extratoEmpId ? (
              <Card className="print:shadow-none print:border-0" id="extrato-print">
                <CardContent className="p-6">
                  <div className="text-center mb-6 print:mb-4">
                    <h2 className="text-lg font-bold">EXTRATO DE BANCO DE HORAS</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {extratoPeriodoAtivo
                        ? `Período: ${new Date(extratoPeriodoInicio + "T00:00:00").toLocaleDateString("pt-BR")} a ${new Date(extratoPeriodoFim + "T00:00:00").toLocaleDateString("pt-BR")}`
                        : `Mês de Referência: ${extratoMes ? new Date(extratoMes + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "—"}`}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6 text-sm border rounded-lg p-4 bg-gray-50/50">
                    <div>
                      <p className="text-xs text-muted-foreground">Funcionário</p>
                      <p className="font-semibold">{saldos.find((s: any) => Number(s.employeeId) === extratoEmpId)?.nomeCompleto || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cargo</p>
                      <p className="font-semibold">{saldos.find((s: any) => Number(s.employeeId) === extratoEmpId)?.funcao || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Saldo Atual</p>
                      <p className="font-bold text-blue-700 text-lg">{minsToHHMM(saldoMap.get(extratoEmpId) || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Regime</p>
                      <p className="font-semibold">Acordo Individual — 6 meses (CLT Art. 59, §5º)</p>
                    </div>
                  </div>

                  {lancamentosExtrato.isLoading ? (
                    <div className="text-center py-6 text-muted-foreground">Carregando lançamentos...</div>
                  ) : lancamentosFiltradosMes.length > 0 ? (
                    <>
                      <table className="w-full text-sm border">
                        <thead>
                          <tr className="bg-gray-100 border-b">
                            <th className="text-left py-2 px-3 font-semibold">Data</th>
                            <th className="text-left py-2 px-3 font-semibold">Tipo</th>
                            <th className="text-right py-2 px-3 font-semibold">Horas Trabalhadas</th>
                            <th className="text-right py-2 px-3 font-semibold">Acréscimo Legal</th>
                            <th className="text-right py-2 px-3 font-semibold">Total</th>
                            <th className="text-right py-2 px-3 font-semibold">Saldo Acumulado</th>
                            <th className="text-left py-2 px-3 font-semibold">Descrição</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            let saldoAcumulado = 0;
                            const sortedLancs = [...lancamentosFiltradosMes].sort((a: any, b: any) =>
                              new Date(a.data).getTime() - new Date(b.data).getTime() || Number(a.id) - Number(b.id)
                            );
                            return sortedLancs.map((l: any) => {
                              const base = Number(l.minutosBase || l.minutos || 0);
                              const acrescimo = Number(l.minutosAcrescimo || 0);
                              const total = Number(l.minutos || 0);
                              if (l.tipo === "credito") {
                                saldoAcumulado += total;
                              } else {
                                saldoAcumulado -= total;
                              }
                              const isDsr = l.tipo === "debito_dsr";
                              const isAtrasoFalta = l.tipo === "debito_atraso_falta";
                              const badgeClass = l.tipo === "credito"
                                ? "bg-green-100 text-green-700"
                                : isDsr
                                  ? "bg-purple-100 text-purple-700"
                                  : isAtrasoFalta
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-red-100 text-red-700";
                              const badgeLabel = l.tipo === "credito"
                                ? "CRÉDITO"
                                : isDsr
                                  ? "DÉBITO DSR"
                                  : isAtrasoFalta
                                    ? "DÉBITO ATRASO/FALTA"
                                    : "DÉBITO";
                              const totalColorClass = l.tipo === "credito" ? "text-green-700" : isDsr ? "text-purple-700" : "text-orange-700";
                              return (
                                <tr key={l.id} className="border-b">
                                  <td className="py-2 px-3">{new Date(l.data).toLocaleDateString("pt-BR")}</td>
                                  <td className="py-2 px-3">
                                    <span className={`font-semibold text-xs px-2 py-0.5 rounded whitespace-nowrap ${badgeClass}`}>
                                      {badgeLabel}
                                    </span>
                                  </td>
                                  <td className="text-right py-2 px-3 font-medium">
                                    {l.tipo === "credito" ? minsToHHMM(base) : "—"}
                                  </td>
                                  <td className="text-right py-2 px-3 text-muted-foreground">
                                    {l.tipo === "credito" ? (acrescimo > 0 ? `+${minsToHHMM(acrescimo)}` : "0h00") : "—"}
                                  </td>
                                  <td className="text-right py-2 px-3 font-bold">
                                    <span className={totalColorClass}>
                                      {l.tipo === "credito" ? "+" : "−"}{minsToHHMM(total)}
                                    </span>
                                  </td>
                                  <td className={`text-right py-2 px-3 font-bold ${saldoAcumulado >= 0 ? "text-blue-700" : "text-red-600"}`}>
                                    {saldoAcumulado >= 0 ? "+" : ""}{minsToHHMM(saldoAcumulado)}
                                  </td>
                                  <td className="py-2 px-3 text-xs text-muted-foreground">{l.descricao || "—"}</td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50 border-t-2 font-bold">
                            <td colSpan={2} className="py-2 px-3">TOTAIS DO MÊS</td>
                            <td className="text-right py-2 px-3 text-green-700">
                              {minsToHHMM(lancamentosFiltradosMes.filter((l: any) => l.tipo === "credito").reduce((acc: number, l: any) => acc + Number(l.minutosBase || l.minutos || 0), 0))}
                            </td>
                            <td className="text-right py-2 px-3 text-muted-foreground">
                              {minsToHHMM(lancamentosFiltradosMes.filter((l: any) => l.tipo === "credito").reduce((acc: number, l: any) => acc + Number(l.minutosAcrescimo || 0), 0))}
                            </td>
                            <td className="text-right py-2 px-3 text-blue-700">
                              {(() => {
                                const totalCredito = lancamentosFiltradosMes.filter((l: any) => l.tipo === "credito").reduce((acc: number, l: any) => acc + Number(l.minutos), 0);
                                const totalDebito = lancamentosFiltradosMes.filter((l: any) => l.tipo !== "credito").reduce((acc: number, l: any) => acc + Number(l.minutos), 0);
                                const saldo = totalCredito - totalDebito;
                                return `${saldo >= 0 ? "+" : ""}${minsToHHMM(saldo)}`;
                              })()}
                            </td>
                            <td className="text-right py-2 px-3 text-blue-700 font-bold">
                              {minsToHHMM(saldoMap.get(extratoEmpId!) || 0)}
                            </td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">
                              (+{minsToHHMM(lancamentosFiltradosMes.filter((l: any) => l.tipo === "credito").reduce((acc: number, l: any) => acc + Number(l.minutos), 0))} créditos /
                              −{minsToHHMM(lancamentosFiltradosMes.filter((l: any) => l.tipo !== "credito").reduce((acc: number, l: any) => acc + Number(l.minutos), 0))} débitos)
                            </td>
                          </tr>
                        </tfoot>
                      </table>

                      {(() => {
                        const totalCredito = lancamentosFiltradosMes.filter((l: any) => l.tipo === "credito").reduce((acc: number, l: any) => acc + Number(l.minutos), 0);
                        const totalDebitoAtrasoFalta = lancamentosFiltradosMes.filter((l: any) => l.tipo === "debito_atraso_falta").reduce((acc: number, l: any) => acc + Number(l.minutos), 0);
                        const totalDebitoDsr = lancamentosFiltradosMes.filter((l: any) => l.tipo === "debito_dsr").reduce((acc: number, l: any) => acc + Number(l.minutos), 0);
                        const totalDebitoManual = lancamentosFiltradosMes.filter((l: any) => l.tipo === "debito").reduce((acc: number, l: any) => acc + Number(l.minutos), 0);
                        if (totalDebitoAtrasoFalta === 0 && totalDebitoDsr === 0 && totalDebitoManual === 0 && totalCredito === 0) return null;
                        return (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 print:hidden">
                            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                              <p className="text-[11px] text-green-700 font-medium">Total Crédito</p>
                              <p className="text-lg font-bold text-green-700">+{minsToHHMM(totalCredito)}</p>
                            </div>
                            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                              <p className="text-[11px] text-orange-700 font-medium">Débito Atraso/Falta</p>
                              <p className="text-lg font-bold text-orange-700">−{minsToHHMM(totalDebitoAtrasoFalta)}</p>
                            </div>
                            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                              <p className="text-[11px] text-purple-700 font-medium">Débito DSR</p>
                              <p className="text-lg font-bold text-purple-700">−{minsToHHMM(totalDebitoDsr)}</p>
                            </div>
                            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                              <p className="text-[11px] text-red-700 font-medium">Débito Manual</p>
                              <p className="text-lg font-bold text-red-700">−{minsToHHMM(totalDebitoManual)}</p>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="mt-8 pt-4 border-t text-sm text-muted-foreground print:mt-12">
                        <p className="mb-6">Declaro ter recebido o extrato detalhado do banco de horas referente ao mês acima indicado.</p>
                        <div className="grid grid-cols-2 gap-8 mt-6">
                          <div className="text-center">
                            <div className="border-t border-gray-400 pt-2 mt-8">Assinatura do Empregado</div>
                          </div>
                          <div className="text-center">
                            <div className="border-t border-gray-400 pt-2 mt-8">Assinatura do Empregador</div>
                          </div>
                        </div>
                        <p className="text-center text-[10px] text-gray-400 mt-6">
                          Conforme CLT Art. 59, §2º e §5º — extrato mensal obrigatório para validade do banco de horas.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Nenhuma movimentação encontrada para este mês.
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center text-muted-foreground text-sm">
                <FileText className="h-10 w-10 text-blue-300 mx-auto mb-3" />
                <p className="font-medium text-blue-700 mb-1">Selecione um funcionário para gerar o extrato</p>
                <p>O extrato mensal com créditos e débitos é obrigatório por lei para validade do banco de horas.</p>
                <p className="text-xs mt-2 text-blue-500">Deve ser entregue mensalmente ao trabalhador mediante recibo de entrega.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "alertas" && (
          <div className="space-y-4">
            {alertas.length > 0 ? (
              <Card className="border-amber-300">
                <CardContent className="p-5">
                  <p className="font-semibold text-sm mb-4 flex items-center gap-2 text-amber-700">
                    <AlertTriangle className="h-4 w-4" /> Créditos Prestes a Vencer
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Os créditos abaixo estão no banco há mais de 6 meses (acordo individual) ou 12 meses (CCT).
                    Conforme CLT Art. 59, §3º, se não compensados, devem ser pagos como hora extra com acréscimo legal.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-amber-200 bg-amber-50/50">
                          <th className="text-left py-2 px-3">Funcionário</th>
                          <th className="text-right py-2 px-3">Saldo</th>
                          <th className="text-right py-2 px-3">Crédito Mais Antigo</th>
                          <th className="text-right py-2 px-3">Dias no Banco</th>
                          <th className="text-center py-2 px-3 no-print">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alertas.map((a: any, i: number) => {
                          const dataAntigo = new Date(a.creditoMaisAntigo);
                          const diasNoBanco = Math.floor((Date.now() - dataAntigo.getTime()) / (1000 * 60 * 60 * 24));
                          return (
                            <tr key={i} className="border-b border-amber-100 hover:bg-amber-50/40">
                              <td className="py-2.5 px-3 font-medium">{a.nomeCompleto}</td>
                              <td className="text-right py-2.5 px-3 font-bold text-amber-700">{minsToHHMM(Number(a.saldoMinutos))}</td>
                              <td className="text-right py-2.5 px-3 text-xs">{dataAntigo.toLocaleDateString("pt-BR")}</td>
                              <td className="text-right py-2.5 px-3">
                                <Badge className={`text-[10px] ${diasNoBanco > 365 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                                  {diasNoBanco} dias
                                </Badge>
                              </td>
                              <td className="text-center py-2.5 px-3 no-print">
                                <Button size="sm" className="h-7 text-xs bg-orange-500 hover:bg-orange-600"
                                  onClick={() => {
                                    setDebitEmpId(Number(a.employeeId));
                                    setDebitDesc("");
                                    setDebitHoras(0);
                                    setDebitMins(0);
                                    setActiveTab("saldos");
                                  }}>
                                  Debitar Horas
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center text-sm">
                <div className="h-10 w-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-3">✓</div>
                <p className="font-medium text-green-700 mb-1">Nenhum alerta de expiração</p>
                <p className="text-muted-foreground">Todos os créditos estão dentro do prazo de compensação.</p>
              </div>
            )}

            {/* Rev. 3977 — Alerta MENSAL: saldo negativo (débito de atraso/falta acumulado) */}
            {alertasNegativos.length > 0 ? (
              <Card className="border-red-300">
                <CardContent className="p-5">
                  <p className="font-semibold text-sm mb-4 flex items-center gap-2 text-red-700">
                    <AlertTriangle className="h-4 w-4" /> Saldo Negativo no Banco de Horas (Alerta Mensal)
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Funcionários com débito de atraso/falta acumulado no banco de horas (empresa configurada para
                    debitar atraso/falta do banco em vez de desconto na folha). Apenas informativo — nenhum
                    desconto ou pagamento é gerado automaticamente a partir deste alerta.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-red-200 bg-red-50/50">
                          <th className="text-left py-2 px-3">Funcionário</th>
                          <th className="text-right py-2 px-3">Saldo</th>
                          <th className="text-right py-2 px-3">Última Movimentação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alertasNegativos.map((a: any, i: number) => (
                          <tr key={i} className="border-b border-red-100 hover:bg-red-50/40">
                            <td className="py-2.5 px-3 font-medium">{a.nomeCompleto}</td>
                            <td className="text-right py-2.5 px-3 font-bold text-red-700">{minsToHHMM(Number(a.saldoMinutos))}</td>
                            <td className="text-right py-2.5 px-3 text-xs text-muted-foreground">
                              {a.atualizadoEm ? new Date(a.atualizadoEm).toLocaleDateString("pt-BR") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center text-sm">
                <div className="h-10 w-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-3">✓</div>
                <p className="font-medium text-green-700 mb-1">Nenhum saldo negativo</p>
                <p className="text-muted-foreground">Nenhum funcionário está devendo horas ao banco.</p>
              </div>
            )}

            {/* Rev. 3977 — Alerta TRIMESTRAL: saldo positivo elevado (créditos há mais de 3 meses) */}
            {alertasPositivosTri.length > 0 ? (
              <Card className="border-sky-300">
                <CardContent className="p-5">
                  <p className="font-semibold text-sm mb-4 flex items-center gap-2 text-sky-700">
                    <AlertTriangle className="h-4 w-4" /> Saldo Positivo Acumulado (Alerta Trimestral)
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Funcionários com créditos no banco de horas há mais de 3 meses. Apenas informativo, para o RH
                    avaliar a compensação (folga) junto ao colaborador — nenhum pagamento automático é gerado.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-sky-200 bg-sky-50/50">
                          <th className="text-left py-2 px-3">Funcionário</th>
                          <th className="text-right py-2 px-3">Saldo</th>
                          <th className="text-right py-2 px-3">Crédito Mais Antigo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alertasPositivosTri.map((a: any, i: number) => (
                          <tr key={i} className="border-b border-sky-100 hover:bg-sky-50/40">
                            <td className="py-2.5 px-3 font-medium">{a.nomeCompleto}</td>
                            <td className="text-right py-2.5 px-3 font-bold text-sky-700">{minsToHHMM(Number(a.saldoMinutos))}</td>
                            <td className="text-right py-2.5 px-3 text-xs text-muted-foreground">
                              {a.creditoMaisAntigo ? new Date(a.creditoMaisAntigo).toLocaleDateString("pt-BR") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center text-sm">
                <div className="h-10 w-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-3">✓</div>
                <p className="font-medium text-green-700 mb-1">Nenhum saldo positivo acima de 3 meses</p>
                <p className="text-muted-foreground">Nenhum crédito com mais de um trimestre acumulado.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "configuracao" && (
          <div className="space-y-4">
            <Card className="border-blue-200">
              <CardContent className="p-6">
                <h3 className="font-bold text-base mb-4 flex items-center gap-2">
                  <Scale className="h-5 w-5 text-blue-600" />
                  Fundamentação Legal — CLT Art. 59
                </h3>

                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-sm text-blue-800 mb-2">Acordo por Convenção Coletiva (CCT)</h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      <li>• Compensação em até <strong>12 meses</strong> (CLT Art. 59, §2º)</li>
                      <li>• Proporção conforme CCT (ex: 1h trabalhada = 1h30 de descanso)</li>
                      <li>• Pode incluir domingos e feriados se a CCT permitir</li>
                      <li>• Verificar sempre a CCT de cada região/obra</li>
                    </ul>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h4 className="font-semibold text-sm text-amber-800 mb-2">Acordo Individual Escrito</h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      <li>• Compensação em até <strong>6 meses</strong> (CLT Art. 59, §5º)</li>
                      <li>• Proporção 1:1 (1h trabalhada = 1h de descanso)</li>
                      <li>• <strong>Não incluir</strong> horas trabalhadas em feriados ou domingos</li>
                      <li>• Contrato por escrito obrigatório, assinado pelas partes</li>
                      <li>• Validade de 6 meses, prorrogável por igual período via aditivo</li>
                    </ul>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-sm text-gray-800 mb-2">Regras Obrigatórias (ambos os regimes)</h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      <li>• Limite máximo de <strong>10 horas diárias</strong> de trabalho</li>
                      <li>• Horas não compensadas no prazo → <strong>pagas como hora extra</strong> com adicional legal</li>
                      <li>• <strong>Extrato mensal</strong> detalhado (créditos e débitos) entregue ao trabalhador com recibo</li>
                      <li>• Na rescisão, saldo positivo pago pelo valor da remuneração na data (CLT Art. 59, §3º)</li>
                      <li>• Prestação habitual de HE não descaracteriza o acordo (CLT Art. 59-B, §único)</li>
                    </ul>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="font-semibold text-sm text-green-800 mb-2">Cláusulas do Acordo Individual (modelo)</h4>
                    <div className="text-sm text-gray-700 space-y-2">
                      <p><strong>1ª</strong> — Jornada prorrogável até 10h diárias para compensação</p>
                      <p><strong>2ª</strong> — Compensação em até 6 meses por diminuição de jornada ou folga</p>
                      <p><strong>3ª</strong> — Não havendo compensação → horas remuneradas como extras</p>
                      <p><strong>4ª</strong> — Trabalho aos domingos → folga correspondente ou remuneração em dobro</p>
                      <p><strong>5ª</strong> — HE habitual não descaracteriza o acordo</p>
                      <p><strong>6ª</strong> — Validade de 6 meses, prorrogável via aditivo</p>
                      <p><strong>7ª</strong> — Rescisão → saldo positivo pago na remuneração da data</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardContent className="p-6">
                <h3 className="font-bold text-base mb-1 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-gray-500" />
                  Exceções por Funcionário
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  A regra padrão da empresa (Hora Extra × Banco de Horas, e o débito de atraso/falta no banco)
                  vale para todos os funcionários CLT. Marque a exceção para que um funcionário específico
                  siga a regra OPOSTA — tanto para o destino de HE quanto para o débito de atraso/falta.
                  {!isBancoAtivo && (
                    <span className="block mt-1 text-orange-600 font-medium">
                      A empresa está com "Hora Extra" (pagamento) como padrão — enquanto isso, exceções não têm
                      efeito, pois toda a empresa usa pagamento padrão.
                    </span>
                  )}
                </p>
                <div className="relative mb-3 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar funcionário..."
                    value={excecaoSearch}
                    onChange={e => setExcecaoSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {empListaExcecao.isLoading ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">Carregando funcionários...</div>
                ) : empExcecaoList.length > 0 ? (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-gray-200 bg-gray-50/50">
                          <th className="text-left py-2 px-3 font-semibold">Funcionário</th>
                          <th className="text-left py-2 px-3 font-semibold">Cargo</th>
                          <th className="text-center py-2 px-3 font-semibold">Exceção (regra oposta à empresa)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empExcecaoList.map((e: any) => {
                          const isExcecao = Number(e.bancoHorasExcecao || 0) === 1;
                          return (
                            <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-2 px-3 font-medium">{e.nomeCompleto}</td>
                              <td className="py-2 px-3 text-xs text-muted-foreground">{e.funcao || e.cargo || "—"}</td>
                              <td className="text-center py-2 px-3">
                                <Checkbox
                                  aria-label={`Exceção para ${e.nomeCompleto}`}
                                  checked={isExcecao}
                                  disabled={setExcecaoMut.isPending}
                                  onCheckedChange={(c) => {
                                    setExcecaoMut.mutate({
                                      id: e.id,
                                      companyId,
                                      bancoHorasExcecao: c ? 1 : 0,
                                    });
                                  }}
                                />
                                {isExcecao && (
                                  <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold align-middle">
                                    EXCEÇÃO ATIVA
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-sm">Nenhum funcionário CLT encontrado.</div>
                )}
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardContent className="p-6">
                <h3 className="font-bold text-base mb-3 flex items-center gap-2">
                  <Info className="h-5 w-5 text-gray-500" />
                  Como funciona no sistema
                </h3>
                <div className="text-sm text-gray-700 space-y-3">
                  <div className="flex gap-3 items-start">
                    <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <div>
                      <p className="font-semibold">Cálculo de HE (Folha de Pagamento)</p>
                      <p className="text-muted-foreground">Ao calcular as horas extras de um período, defina a destinação de cada funcionário: "Pagamento" ou "Banco de Horas".</p>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <div>
                      <p className="font-semibold">Aprovação do Período</p>
                      <p className="text-muted-foreground">Ao aprovar, os minutos dos funcionários marcados como "Banco de Horas" são creditados automaticamente aqui.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <div>
                      <p className="font-semibold">Compensação (Débito)</p>
                      <p className="text-muted-foreground">Registre as folgas compensatórias nesta tela, indicando data, quantidade de horas e motivo.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">4</span>
                    <div>
                      <p className="font-semibold">Extrato Mensal</p>
                      <p className="text-muted-foreground">Gere e imprima o extrato mensal por funcionário. Entregue com recibo de assinatura (obrigatório por lei).</p>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <span className="bg-amber-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">!</span>
                    <div>
                      <p className="font-semibold">Alertas de Vencimento</p>
                      <p className="text-muted-foreground">Créditos não compensados dentro do prazo (6 ou 12 meses) geram alertas. Devem ser pagos como hora extra.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
