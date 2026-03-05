import DashboardLayout from "@/components/DashboardLayout";
import MonthSelector from "@/components/MonthSelector";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { removeAccents } from "@/lib/searchUtils";
import {
  UtensilsCrossed, Search, Upload, FileSpreadsheet, Users, DollarSign,
  Settings, ListChecks, History, CheckCircle, XCircle, Pencil, Trash2,
  RefreshCw, Plus, Building2, Coffee, Sandwich, Moon, CreditCard,
  ChevronDown, ChevronUp, AlertTriangle, Eye, Loader2, Ban
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { formatCPF, fmtNum } from "@/lib/formatters";
import { useAuth } from "@/_core/hooks/useAuth";

type TabKey = "lancamento" | "configuracao" | "historico";

function parseBRL(v: string | null | undefined): number {
  if (!v) return 0;
  return parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;
}

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtValor(v: string | null | undefined): string {
  const n = parseBRL(v);
  return n > 0 ? fmtBRL(n) : "-";
}

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800",
  aprovado: "bg-blue-100 text-blue-800",
  pago: "bg-green-100 text-green-800",
  cancelado: "bg-red-100 text-red-800",
};
const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  pago: "Pago",
  cancelado: "Cancelado",
};

export default function ValeAlimentacao() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const now = new Date();
  const [mesAno, setMesAno] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [tab, setTab] = useState<TabKey>("lancamento");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [diasUteis, setDiasUteis] = useState(22);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ valorTotal: "", observacoes: "", motivoAlteracao: "" });
  const [showGerarDialog, setShowGerarDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [configForm, setConfigForm] = useState<any>({});
  const [editingConfigId, setEditingConfigId] = useState<number | null>(null);
  const [histEmployeeId, setHistEmployeeId] = useState<number | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [detailRecord, setDetailRecord] = useState<any>(null);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [histDialogEmployeeId, setHistDialogEmployeeId] = useState<number | null>(null);
  const [histDialogName, setHistDialogName] = useState<string>("");

  // Queries
  const statsQ = trpc.valeAlimentacao.getStats.useQuery({ companyId, mesReferencia: mesAno }, { enabled: !!companyId });
  const lancamentosQ = trpc.valeAlimentacao.listLancamentos.useQuery({ companyId, mesReferencia: mesAno }, { enabled: !!companyId });
  const configsQ = trpc.avisoPrevio.avisoPrevio.listMealBenefitConfigs.useQuery({ companyId }, { enabled: !!companyId && tab === "configuracao" });
  const obrasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: !!companyId && tab === "configuracao" });
  const histQ = trpc.valeAlimentacao.historicoColaborador.useQuery(
    { companyId, employeeId: histEmployeeId! },
    { enabled: !!companyId && !!histEmployeeId && tab === "historico" }
  );
  const histDialogQ = trpc.valeAlimentacao.historicoColaborador.useQuery(
    { companyId, employeeId: histDialogEmployeeId! },
    { enabled: !!companyId && !!histDialogEmployeeId }
  );
  const employeesQ = trpc.employees.list.useQuery({ companyId }, { enabled: !!companyId && tab === "historico" });

  // Mutations
  const gerarMut = trpc.valeAlimentacao.gerarMes.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        lancamentosQ.refetch();
        statsQ.refetch();
        setShowGerarDialog(false);
      } else {
        toast.error(data.message);
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const regerarMut = trpc.valeAlimentacao.regerarMes.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      lancamentosQ.refetch();
      statsQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const editarMut = trpc.valeAlimentacao.editarLancamento.useMutation({
    onSuccess: () => {
      toast.success("Lançamento atualizado!");
      lancamentosQ.refetch();
      statsQ.refetch();
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const aprovarMut = trpc.valeAlimentacao.aprovarLote.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.aprovados} lançamentos aprovados!`);
      lancamentosQ.refetch();
      statsQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const pagarMut = trpc.valeAlimentacao.marcarPago.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.pagos} lançamentos marcados como pagos!`);
      lancamentosQ.refetch();
      statsQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const reverterPagoMut = trpc.valeAlimentacao.reverterPago.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.revertidos} lançamento(s) revertido(s) para Aprovado!`);
      lancamentosQ.refetch();
      statsQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelarMut = trpc.valeAlimentacao.cancelarLancamento.useMutation({
    onSuccess: () => {
      toast.success("Lançamento cancelado!");
      lancamentosQ.refetch();
      statsQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const saveConfigMut = trpc.avisoPrevio.avisoPrevio.saveMealBenefitConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração salva!");
      configsQ.refetch();
      setShowConfigDialog(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteConfigMut = trpc.avisoPrevio.avisoPrevio.deleteMealBenefitConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração excluída!");
      configsQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const limparMut = trpc.valeAlimentacao.limparMes.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.removidos} lançamentos removidos!`);
      lancamentosQ.refetch();
      statsQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const stats = statsQ.data;
  const lancamentos = lancamentosQ.data || [];
  const configs = (configsQ.data || []) as any[];
  const obras = (obrasQ.data || []) as any[];

  const filteredLancamentos = useMemo(() => {
    return lancamentos.filter((l: any) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (search) {
        const s = removeAccents(search);
        return removeAccents(l.nomeCompleto || '').includes(s) || l.cpf?.includes(s);
      }
      return true;
    });
  }, [lancamentos, statusFilter, search]);

  const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "lancamento", label: "Lançamento Mensal", icon: CreditCard },
    { key: "configuracao", label: "Configuração", icon: Settings },
    { key: "historico", label: "Histórico", icon: History },
  ];

  const mesLabel = (() => {
    const [y, m] = mesAno.split("-");
    const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return `${MESES[parseInt(m) - 1]} ${y}`;
  })();

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <UtensilsCrossed className="h-6 w-6 text-orange-600" />
              Vale Alimentação
            </h1>
            <p className="text-muted-foreground text-sm">Gestão de vale alimentação e refeição — iFood Benefícios</p>
          </div>
          <div className="flex items-center gap-2">
            <PrintActions title="Vale Alimentação" />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? "border-orange-600 text-orange-700"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ===== ABA LANÇAMENTO MENSAL ===== */}
        {tab === "lancamento" && (
          <div className="space-y-4">
            {/* Month selector + Actions */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <MonthSelector value={mesAno} onChange={setMesAno} />
              <div className="flex items-center gap-2 flex-wrap">
                {lancamentos.length === 0 ? (
                  <Button className="bg-orange-600 hover:bg-orange-700 text-white gap-2" onClick={() => setShowGerarDialog(true)}>
                    <Plus className="h-4 w-4" /> Gerar Lançamentos
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => {
                      if (confirm("Regerar todos os lançamentos pendentes? Lançamentos já pagos serão mantidos.")) {
                        regerarMut.mutate({ companyId, mesReferencia: mesAno, diasUteis });
                      }
                    }} disabled={regerarMut.isPending}>
                      <RefreshCw className="h-3.5 w-3.5" /> Regerar
                    </Button>
                    {stats && stats.pendentes > 0 && (
                      <Button size="sm" className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
                        if (confirm(`Aprovar todos os ${stats.pendentes} lançamentos pendentes?`)) {
                          aprovarMut.mutate({ companyId, mesReferencia: mesAno });
                        }
                      }} disabled={aprovarMut.isPending}>
                        <CheckCircle className="h-3.5 w-3.5" /> Aprovar Todos ({stats.pendentes})
                      </Button>
                    )}
                    {stats && stats.aprovados > 0 && (
                      <Button size="sm" className="gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => {
                        if (confirm(`Marcar ${stats.aprovados} lançamentos como pagos?`)) {
                          pagarMut.mutate({ companyId, mesReferencia: mesAno });
                        }
                      }} disabled={pagarMut.isPending}>
                        <DollarSign className="h-3.5 w-3.5" /> Marcar Pagos ({stats.aprovados})
                      </Button>
                    )}
                    {stats && stats.pagos > 0 && (
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => {
                        if (confirm(`Reverter ${stats.pagos} lançamento(s) de 'Pago' para 'Aprovado'?`)) {
                          reverterPagoMut.mutate({ companyId, mesReferencia: mesAno });
                        }
                      }} disabled={reverterPagoMut.isPending}>
                        <RefreshCw className="h-3.5 w-3.5" /> Reverter Pagos ({stats.pagos})
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* KPIs */}
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                      <Users className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{fmtNum(stats?.totalLancamentos || 0)}</p>
                      <p className="text-xs text-muted-foreground">Beneficiários</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                      <DollarSign className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{fmtBRL(stats?.totalValor || 0)}</p>
                      <p className="text-xs text-muted-foreground">Total {mesLabel}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{fmtNum(stats?.pendentes || 0)}</p>
                      <p className="text-xs text-muted-foreground">Pendentes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{fmtNum((stats?.aprovados || 0) + (stats?.pagos || 0))}</p>
                      <p className="text-xs text-muted-foreground">Aprovados/Pagos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar colaborador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tabela de lançamentos */}
            {lancamentos.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <UtensilsCrossed className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-lg font-medium text-muted-foreground mb-2">Nenhum lançamento para {mesLabel}</p>
                  <p className="text-sm text-muted-foreground mb-6">Clique em "Gerar Lançamentos" para criar os benefícios do mês com base nas configurações cadastradas.</p>
                  <Button className="bg-orange-600 hover:bg-orange-700 text-white gap-2" onClick={() => setShowGerarDialog(true)}>
                    <Plus className="h-4 w-4" /> Gerar Lançamentos
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left px-4 py-3 font-medium">Colaborador</th>
                          <th className="text-left px-3 py-3 font-medium">CPF</th>
                          <th className="text-right px-3 py-3 font-medium">
                            <span className="flex items-center gap-1 justify-end"><Coffee className="h-3.5 w-3.5" /> Café</span>
                          </th>
                          <th className="text-right px-3 py-3 font-medium">
                            <span className="flex items-center gap-1 justify-end"><Sandwich className="h-3.5 w-3.5" /> Lanche</span>
                          </th>
                          <th className="text-right px-3 py-3 font-medium">
                            <span className="flex items-center gap-1 justify-end"><Moon className="h-3.5 w-3.5" /> Jantar</span>
                          </th>
                          <th className="text-right px-3 py-3 font-medium">
                            <span className="flex items-center gap-1 justify-end"><UtensilsCrossed className="h-3.5 w-3.5" /> VA</span>
                          </th>
                          <th className="text-right px-3 py-3 font-medium font-bold">Total</th>
                          <th className="text-center px-3 py-3 font-medium">Dias</th>
                          <th className="text-center px-3 py-3 font-medium">Status</th>
                          <th className="text-center px-3 py-3 font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Totalizador no topo */}
                        <tr className="bg-muted/50 font-bold border-b-2 sticky top-0">
                          <td className="px-4 py-3" colSpan={2}>Total ({filteredLancamentos.filter((l: any) => l.status !== "cancelado").length} beneficiários)</td>
                          <td className="px-3 py-3 text-right text-xs">
                            {fmtBRL(filteredLancamentos.filter((l: any) => l.status !== "cancelado").reduce((s: number, l: any) => s + parseBRL(l.valorCafe), 0))}
                          </td>
                          <td className="px-3 py-3 text-right text-xs">
                            {fmtBRL(filteredLancamentos.filter((l: any) => l.status !== "cancelado").reduce((s: number, l: any) => s + parseBRL(l.valorLanche), 0))}
                          </td>
                          <td className="px-3 py-3 text-right text-xs">
                            {fmtBRL(filteredLancamentos.filter((l: any) => l.status !== "cancelado").reduce((s: number, l: any) => s + parseBRL(l.valorJanta), 0))}
                          </td>
                          <td className="px-3 py-3 text-right text-xs">
                            {fmtBRL(filteredLancamentos.filter((l: any) => l.status !== "cancelado").reduce((s: number, l: any) => s + parseBRL(l.valorVA), 0))}
                          </td>
                          <td className="px-3 py-3 text-right text-base">
                            {fmtBRL(filteredLancamentos.filter((l: any) => l.status !== "cancelado").reduce((s: number, l: any) => s + parseBRL(l.valorTotal), 0))}
                          </td>
                          <td colSpan={3}></td>
                        </tr>
                        {filteredLancamentos.map((l: any) => (
                          <tr key={l.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-2.5">
                              <div>
                                <span className="font-medium text-sm text-blue-700 cursor-pointer hover:underline" onClick={() => { setHistDialogEmployeeId(l.employeeId); setHistDialogName(l.nomeCompleto); }}>{l.nomeCompleto}</span>
                                {l.obraNome && (
                                  <span className="block text-xs text-muted-foreground"><Building2 className="h-3 w-3 inline mr-1" />{l.obraNome}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-xs font-mono">{formatCPF(l.cpf)}</td>
                            <td className="px-3 py-2.5 text-right text-xs">{fmtValor(l.valorCafe)}</td>
                            <td className="px-3 py-2.5 text-right text-xs">{fmtValor(l.valorLanche)}</td>
                            <td className="px-3 py-2.5 text-right text-xs">{fmtValor(l.valorJanta)}</td>
                            <td className="px-3 py-2.5 text-right text-xs">{fmtValor(l.valorVA)}</td>
                            <td className="px-3 py-2.5 text-right font-bold text-sm">{fmtValor(l.valorTotal)}</td>
                            <td className="px-3 py-2.5 text-center text-xs">{l.diasUteis || "-"}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[l.status] || "bg-gray-100 text-gray-600"}`}>
                                {STATUS_LABELS[l.status] || l.status}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center gap-1 justify-center">
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver detalhes" onClick={() => { setDetailRecord(l); setShowDetailDialog(true); }}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {l.status === "pendente" && (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => {
                                      setEditingId(l.id);
                                      setEditForm({ valorTotal: l.valorTotal, observacoes: l.observacoes || "", motivoAlteracao: "" });
                                    }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" title="Aprovar" onClick={() => {
                                      aprovarMut.mutate({ companyId, mesReferencia: mesAno, ids: [l.id] });
                                    }}>
                                      <CheckCircle className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" title="Cancelar" onClick={() => {
                                      if (confirm("Cancelar este lançamento?")) cancelarMut.mutate({ id: l.id });
                                    }}>
                                      <Ban className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                                {l.status === "aprovado" && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" title="Marcar como pago" onClick={() => {
                                    pagarMut.mutate({ companyId, mesReferencia: mesAno, ids: [l.id] });
                                  }}>
                                    <DollarSign className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {l.status === "pago" && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600" title="Reverter para Aprovado" onClick={() => {
                                    if (confirm("Reverter este lançamento de 'Pago' para 'Aprovado'?")) {
                                      reverterPagoMut.mutate({ companyId, mesReferencia: mesAno, ids: [l.id] });
                                    }
                                  }}>
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>

                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ===== ABA CONFIGURAÇÃO ===== */}
        {tab === "configuracao" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Configurações de Benefícios</h2>
                <p className="text-sm text-muted-foreground">Defina os valores de café, lanche, jantar e VA por obra ou como padrão da empresa.</p>
              </div>
              <Button className="bg-orange-600 hover:bg-orange-700 text-white gap-2" onClick={() => {
                setEditingConfigId(null);
                setConfigForm({
                  companyId,
                  obraId: null,
                  nome: "Padrão",
                  cafeManhaDia: "0",
                  lancheTardeDia: "0",
                  valeAlimentacaoMes: "0",
                  jantaDia: "0",
                  totalVA_iFood: "0",
                  diasUteisRef: 22,
                  cafeAtivo: true,
                  lancheAtivo: true,
                  jantaAtivo: false,
                  observacoes: "",
                });
                setShowConfigDialog(true);
              }}>
                <Plus className="h-4 w-4" /> Nova Configuração
              </Button>
            </div>

            {configs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Settings className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground mb-2">Nenhuma configuração cadastrada</p>
                  <p className="text-sm text-muted-foreground">Crie uma configuração padrão para definir os valores dos benefícios.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {configs.map((cfg: any) => (
                  <Card key={cfg.id} className={`${!cfg.obraId ? "border-orange-300 bg-orange-50/30" : ""}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          {cfg.obraId ? (
                            <><Building2 className="h-4 w-4 text-blue-600" /> {cfg.obraNome || `Obra #${cfg.obraId}`}</>
                          ) : (
                            <><Settings className="h-4 w-4 text-orange-600" /> Padrão da Empresa</>
                          )}
                        </CardTitle>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            setEditingConfigId(cfg.id);
                            setConfigForm({
                              id: cfg.id,
                              companyId,
                              obraId: cfg.obraId || null,
                              nome: cfg.nome || "Padrão",
                              cafeManhaDia: cfg.cafeManhaDia || "0",
                              lancheTardeDia: cfg.lancheTardeDia || "0",
                              valeAlimentacaoMes: cfg.valeAlimentacaoMes || "0",
                              jantaDia: cfg.jantaDia || "0",
                              totalVA_iFood: cfg.totalVA_iFood || "0",
                              diasUteisRef: cfg.diasUteisRef || 22,
                              cafeAtivo: cfg.cafeAtivo === 1 || cfg.cafeAtivo === true,
                              lancheAtivo: cfg.lancheAtivo === 1 || cfg.lancheAtivo === true,
                              jantaAtivo: cfg.jantaAtivo === 1 || cfg.jantaAtivo === true,
                              observacoes: cfg.observacoes || "",
                            });
                            setShowConfigDialog(true);
                          }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => {
                            if (confirm("Excluir esta configuração?")) deleteConfigMut.mutate({ id: cfg.id });
                          }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Coffee className={`h-4 w-4 ${cfg.cafeAtivo ? "text-orange-600" : "text-muted-foreground/30"}`} />
                          <div>
                            <p className="text-xs text-muted-foreground">Café/dia</p>
                            <p className={`font-medium ${cfg.cafeAtivo ? "" : "text-muted-foreground line-through"}`}>
                              {fmtValor(cfg.cafeManhaDia)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Sandwich className={`h-4 w-4 ${cfg.lancheAtivo ? "text-green-600" : "text-muted-foreground/30"}`} />
                          <div>
                            <p className="text-xs text-muted-foreground">Lanche/dia</p>
                            <p className={`font-medium ${cfg.lancheAtivo ? "" : "text-muted-foreground line-through"}`}>
                              {fmtValor(cfg.lancheTardeDia)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Moon className={`h-4 w-4 ${cfg.jantaAtivo ? "text-purple-600" : "text-muted-foreground/30"}`} />
                          <div>
                            <p className="text-xs text-muted-foreground">Jantar/dia</p>
                            <p className={`font-medium ${cfg.jantaAtivo ? "" : "text-muted-foreground line-through"}`}>
                              {fmtValor(cfg.jantaDia)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <UtensilsCrossed className="h-4 w-4 text-blue-600" />
                          <div>
                            <p className="text-xs text-muted-foreground">VA Mensal (iFood)</p>
                            <p className="font-medium">{fmtValor(cfg.valeAlimentacaoMes)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 pt-2 border-t text-xs text-muted-foreground flex items-center gap-4">
                        <span>Dias úteis ref.: <strong>{cfg.diasUteisRef || 22}</strong></span>
                        {cfg.totalVA_iFood && parseBRL(cfg.totalVA_iFood) > 0 && (
                          <span>Total iFood: <strong>{fmtValor(cfg.totalVA_iFood)}</strong></span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== ABA HISTÓRICO ===== */}
        {tab === "historico" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Histórico por Colaborador</h2>
              <p className="text-sm text-muted-foreground">Selecione um colaborador para ver o histórico de vale alimentação.</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={histEmployeeId ? String(histEmployeeId) : "none"} onValueChange={(v) => setHistEmployeeId(v === "none" ? null : Number(v))}>
                <SelectTrigger className="w-[350px]">
                  <SelectValue placeholder="Selecione um colaborador..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione...</SelectItem>
                  {(employeesQ.data || []).filter((e: any) => e.status === "Ativo").map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {histEmployeeId && (
              <Card>
                <CardContent className="p-0">
                  {histQ.isLoading ? (
                    <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando...</div>
                  ) : (histQ.data || []).length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">Nenhum lançamento encontrado para este colaborador.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left px-4 py-3 font-medium">Mês</th>
                            <th className="text-right px-3 py-3 font-medium">Café</th>
                            <th className="text-right px-3 py-3 font-medium">Lanche</th>
                            <th className="text-right px-3 py-3 font-medium">Jantar</th>
                            <th className="text-right px-3 py-3 font-medium">VA</th>
                            <th className="text-right px-3 py-3 font-medium font-bold">Total</th>
                            <th className="text-center px-3 py-3 font-medium">Dias</th>
                            <th className="text-center px-3 py-3 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(histQ.data || []).map((h: any) => (
                            <tr key={h.id} className="border-b last:border-0">
                              <td className="px-4 py-2.5 font-medium">{h.mesReferencia}</td>
                              <td className="px-3 py-2.5 text-right text-xs">{fmtValor(h.valorCafe)}</td>
                              <td className="px-3 py-2.5 text-right text-xs">{fmtValor(h.valorLanche)}</td>
                              <td className="px-3 py-2.5 text-right text-xs">{fmtValor(h.valorJanta)}</td>
                              <td className="px-3 py-2.5 text-right text-xs">{fmtValor(h.valorVA)}</td>
                              <td className="px-3 py-2.5 text-right font-bold">{fmtValor(h.valorTotal)}</td>
                              <td className="px-3 py-2.5 text-center text-xs">{h.diasUteis || "-"}</td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[h.status] || "bg-gray-100"}`}>
                                  {STATUS_LABELS[h.status] || h.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* ===== DIALOG: GERAR LANÇAMENTOS ===== */}
      <Dialog open={showGerarDialog} onOpenChange={setShowGerarDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-orange-600" /> Gerar Lançamentos — {mesLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Os lançamentos serão gerados automaticamente com base nas configurações de benefícios cadastradas para cada obra/empresa.
            </p>
            <div>
              <Label className="text-sm">Dias úteis do mês</Label>
              <Input type="number" value={diasUteis} onChange={e => setDiasUteis(Number(e.target.value))} min={1} max={31} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Usado para calcular benefícios diários (café, lanche, jantar).</p>
            </div>
            {!configsQ.data || (configsQ.data as any[]).length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <strong>Atenção:</strong> Nenhuma configuração de benefícios encontrada. Vá para a aba "Configuração" e cadastre os valores antes de gerar.
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGerarDialog(false)}>Cancelar</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" disabled={gerarMut.isPending} onClick={() => {
              gerarMut.mutate({ companyId, mesReferencia: mesAno, diasUteis });
            }}>
              {gerarMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Gerando...</> : "Gerar Lançamentos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG: EDITAR LANÇAMENTO ===== */}
      <Dialog open={!!editingId} onOpenChange={(o) => { if (!o) setEditingId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Valor Total (R$)</Label>
              <Input value={editForm.valorTotal} onChange={e => setEditForm(f => ({ ...f, valorTotal: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">Motivo da Alteração</Label>
              <Input value={editForm.motivoAlteracao} onChange={e => setEditForm(f => ({ ...f, motivoAlteracao: e.target.value }))} className="mt-1" placeholder="Ex: Ajuste por faltas" />
            </div>
            <div>
              <Label className="text-sm">Observações</Label>
              <Textarea value={editForm.observacoes} onChange={e => setEditForm(f => ({ ...f, observacoes: e.target.value }))} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
            <Button className="bg-[#1B2A4A] hover:bg-[#243658] text-white" disabled={editarMut.isPending} onClick={() => {
              if (!editingId) return;
              editarMut.mutate({ id: editingId, valorTotal: editForm.valorTotal, motivoAlteracao: editForm.motivoAlteracao, observacoes: editForm.observacoes });
            }}>
              {editarMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG: CONFIGURAÇÃO ===== */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingConfigId ? "Editar Configuração" : "Nova Configuração"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <Label className="text-sm">Nome</Label>
              <Input value={configForm.nome || ""} onChange={e => setConfigForm((f: any) => ({ ...f, nome: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">Obra (deixe vazio para padrão da empresa)</Label>
              <Select value={configForm.obraId ? String(configForm.obraId) : "none"} onValueChange={(v) => setConfigForm((f: any) => ({ ...f, obraId: v === "none" ? null : Number(v) }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Padrão da empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Padrão da empresa</SelectItem>
                  {obras.map((o: any) => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm flex items-center gap-1">
                  <Coffee className="h-3.5 w-3.5" /> Café da Manhã/dia (R$)
                </Label>
                <Input value={configForm.cafeManhaDia || ""} onChange={e => setConfigForm((f: any) => ({ ...f, cafeManhaDia: e.target.value }))} className="mt-1" />
                <label className="flex items-center gap-2 mt-1 text-xs">
                  <input type="checkbox" checked={configForm.cafeAtivo ?? true} onChange={e => setConfigForm((f: any) => ({ ...f, cafeAtivo: e.target.checked }))} />
                  Ativo
                </label>
              </div>
              <div>
                <Label className="text-sm flex items-center gap-1">
                  <Sandwich className="h-3.5 w-3.5" /> Lanche da Tarde/dia (R$)
                </Label>
                <Input value={configForm.lancheTardeDia || ""} onChange={e => setConfigForm((f: any) => ({ ...f, lancheTardeDia: e.target.value }))} className="mt-1" />
                <label className="flex items-center gap-2 mt-1 text-xs">
                  <input type="checkbox" checked={configForm.lancheAtivo ?? true} onChange={e => setConfigForm((f: any) => ({ ...f, lancheAtivo: e.target.checked }))} />
                  Ativo
                </label>
              </div>
              <div>
                <Label className="text-sm flex items-center gap-1">
                  <Moon className="h-3.5 w-3.5" /> Jantar/dia (R$)
                </Label>
                <Input value={configForm.jantaDia || ""} onChange={e => setConfigForm((f: any) => ({ ...f, jantaDia: e.target.value }))} className="mt-1" />
                <label className="flex items-center gap-2 mt-1 text-xs">
                  <input type="checkbox" checked={configForm.jantaAtivo ?? false} onChange={e => setConfigForm((f: any) => ({ ...f, jantaAtivo: e.target.checked }))} />
                  Ativo
                </label>
              </div>
              <div>
                <Label className="text-sm flex items-center gap-1">
                  <UtensilsCrossed className="h-3.5 w-3.5" /> VA Mensal iFood (R$)
                </Label>
                <Input value={configForm.valeAlimentacaoMes || ""} onChange={e => setConfigForm((f: any) => ({ ...f, valeAlimentacaoMes: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Total VA iFood (R$)</Label>
                <Input value={configForm.totalVA_iFood || ""} onChange={e => setConfigForm((f: any) => ({ ...f, totalVA_iFood: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Dias Úteis Referência</Label>
                <Input type="number" value={configForm.diasUteisRef || 22} onChange={e => setConfigForm((f: any) => ({ ...f, diasUteisRef: Number(e.target.value) }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-sm">Observações</Label>
              <Textarea value={configForm.observacoes || ""} onChange={e => setConfigForm((f: any) => ({ ...f, observacoes: e.target.value }))} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>Cancelar</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" disabled={saveConfigMut.isPending} onClick={() => {
              saveConfigMut.mutate({
                ...configForm,
                id: editingConfigId || undefined,
                companyId,
              });
            }}>
              {saveConfigMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG: DETALHE DO LANÇAMENTO ===== */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Lançamento</DialogTitle>
          </DialogHeader>
          {detailRecord && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Colaborador</span>
                <span className="font-medium">{detailRecord.nomeCompleto}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">CPF</span>
                <span className="font-mono">{formatCPF(detailRecord.cpf)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mês</span>
                <span>{detailRecord.mesReferencia}</span>
              </div>
              <div className="border-t pt-2 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1"><Coffee className="h-3.5 w-3.5" /> Café</span>
                  <span>{fmtValor(detailRecord.valorCafe)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1"><Sandwich className="h-3.5 w-3.5" /> Lanche</span>
                  <span>{fmtValor(detailRecord.valorLanche)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1"><Moon className="h-3.5 w-3.5" /> Jantar</span>
                  <span>{fmtValor(detailRecord.valorJanta)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1"><UtensilsCrossed className="h-3.5 w-3.5" /> VA</span>
                  <span>{fmtValor(detailRecord.valorVA)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold">
                  <span>Total</span>
                  <span>{fmtValor(detailRecord.valorTotal)}</span>
                </div>
              </div>
              <div className="border-t pt-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dias úteis</span>
                  <span>{detailRecord.diasUteis || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[detailRecord.status]}`}>
                    {STATUS_LABELS[detailRecord.status]}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Operadora</span>
                  <span>{detailRecord.operadora || "iFood"}</span>
                </div>
                {detailRecord.geradoPor && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gerado por</span>
                    <span>{detailRecord.geradoPor}</span>
                  </div>
                )}
                {detailRecord.observacoes && (
                  <div className="mt-2">
                    <span className="text-muted-foreground text-xs">Observações:</span>
                    <p className="text-xs mt-1">{detailRecord.observacoes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ===== DIALOG: HISTÓRICO DE RECEBÍVEIS DO FUNCIONÁRIO ===== */}
      <Dialog open={!!histDialogEmployeeId} onOpenChange={(o) => { if (!o) setHistDialogEmployeeId(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-orange-600" />
              Histórico de Recebíveis — {histDialogName}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[60vh]">
            {histDialogQ.isLoading ? (
              <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Carregando histórico...</div>
            ) : !histDialogQ.data || (histDialogQ.data as any[]).length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Nenhum lançamento encontrado para este colaborador.</div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Recebido</p>
                    <p className="text-lg font-bold text-orange-700">
                      {fmtBRL((histDialogQ.data as any[]).filter((h: any) => h.status === 'pago').reduce((s: number, h: any) => s + parseBRL(h.valorTotal), 0))}
                    </p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Meses com Benefício</p>
                    <p className="text-lg font-bold text-blue-700">{(histDialogQ.data as any[]).length}</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Média Mensal</p>
                    <p className="text-lg font-bold text-green-700">
                      {fmtBRL((histDialogQ.data as any[]).reduce((s: number, h: any) => s + parseBRL(h.valorTotal), 0) / ((histDialogQ.data as any[]).length || 1))}
                    </p>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium">Mês</th>
                      <th className="text-right px-3 py-2.5 font-medium">Café</th>
                      <th className="text-right px-3 py-2.5 font-medium">Lanche</th>
                      <th className="text-right px-3 py-2.5 font-medium">Jantar</th>
                      <th className="text-right px-3 py-2.5 font-medium">VA</th>
                      <th className="text-right px-3 py-2.5 font-medium font-bold">Total</th>
                      <th className="text-center px-3 py-2.5 font-medium">Dias</th>
                      <th className="text-center px-3 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(histDialogQ.data as any[]).map((h: any) => (
                      <tr key={h.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-2 font-medium">{h.mesReferencia}</td>
                        <td className="px-3 py-2 text-right text-xs">{fmtValor(h.valorCafe)}</td>
                        <td className="px-3 py-2 text-right text-xs">{fmtValor(h.valorLanche)}</td>
                        <td className="px-3 py-2 text-right text-xs">{fmtValor(h.valorJanta)}</td>
                        <td className="px-3 py-2 text-right text-xs">{fmtValor(h.valorVA)}</td>
                        <td className="px-3 py-2 text-right font-bold">{fmtValor(h.valorTotal)}</td>
                        <td className="px-3 py-2 text-center text-xs">{h.diasUteis || "-"}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[h.status] || "bg-gray-100"}`}>
                            {STATUS_LABELS[h.status] || h.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/50 font-bold border-t-2">
                      <td className="px-4 py-2.5">TOTAL</td>
                      <td className="px-3 py-2.5 text-right text-xs">{fmtBRL((histDialogQ.data as any[]).reduce((s: number, h: any) => s + parseBRL(h.valorCafe), 0))}</td>
                      <td className="px-3 py-2.5 text-right text-xs">{fmtBRL((histDialogQ.data as any[]).reduce((s: number, h: any) => s + parseBRL(h.valorLanche), 0))}</td>
                      <td className="px-3 py-2.5 text-right text-xs">{fmtBRL((histDialogQ.data as any[]).reduce((s: number, h: any) => s + parseBRL(h.valorJanta), 0))}</td>
                      <td className="px-3 py-2.5 text-right text-xs">{fmtBRL((histDialogQ.data as any[]).reduce((s: number, h: any) => s + parseBRL(h.valorVA), 0))}</td>
                      <td className="px-3 py-2.5 text-right text-base">{fmtBRL((histDialogQ.data as any[]).reduce((s: number, h: any) => s + parseBRL(h.valorTotal), 0))}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistDialogEmployeeId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
