import DashboardLayout from "@/components/DashboardLayout";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
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
  ChevronDown, ChevronUp, AlertTriangle, Eye, Loader2, Ban, Calculator, Info, MinusCircle,
  CalendarRange
} from "lucide-react";
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { formatCPF, fmtNum } from "@/lib/formatters";
import { useAuth } from "@/_core/hooks/useAuth";

type TabKey = "lancamento" | "por_obra" | "alertas_faltas" | "configuracao" | "historico";

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

function ObraGroupCard({ group }: { group: { obraKey: string; obraNome: string; funcs: any[]; totalCafe: number; totalLanche: number; totalJanta: number; totalVA: number; totalGeral: number } }) {
  const [expanded, setExpanded] = useState(false);
  const pendentes = group.funcs.filter((f: any) => f.status === "pendente").length;
  const aprovados = group.funcs.filter((f: any) => f.status === "aprovado" || f.status === "pago").length;

  return (
    <Card>
      <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-orange-500" />
            <div>
              <CardTitle className="text-base">{group.obraNome}</CardTitle>
              <p className="text-xs text-muted-foreground">{group.funcs.length} colaborador{group.funcs.length !== 1 ? "es" : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {pendentes > 0 && <Badge className="bg-amber-100 text-amber-800 text-xs">{pendentes} pendente{pendentes !== 1 ? "s" : ""}</Badge>}
              {aprovados > 0 && <Badge className="bg-green-100 text-green-800 text-xs">{aprovados} aprovado{aprovados !== 1 ? "s" : ""}</Badge>}
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-orange-600">R$ {fmtNum(group.totalGeral)}</p>
            </div>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mt-2 text-xs text-muted-foreground">
          <span><Coffee className="inline h-3 w-3" /> Café: <strong className="text-foreground">R$ {fmtNum(group.totalCafe)}</strong></span>
          <span><Sandwich className="inline h-3 w-3" /> Lanche: <strong className="text-foreground">R$ {fmtNum(group.totalLanche)}</strong></span>
          <span><Moon className="inline h-3 w-3" /> Jantar: <strong className="text-foreground">R$ {fmtNum(group.totalJanta)}</strong></span>
          <span><CreditCard className="inline h-3 w-3" /> VA: <strong className="text-foreground">R$ {fmtNum(group.totalVA)}</strong></span>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 px-4 pb-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 font-medium">Colaborador</th>
                  <th className="text-right py-2 font-medium">Café</th>
                  <th className="text-right py-2 font-medium">Lanche</th>
                  <th className="text-right py-2 font-medium">Jantar</th>
                  <th className="text-right py-2 font-medium">VA</th>
                  <th className="text-right py-2 font-medium">Total</th>
                  <th className="text-center py-2 font-medium">Dias</th>
                  <th className="text-center py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {group.funcs.map((f: any) => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="py-2">
                      <span className="font-medium">{f.nomeCompleto || f.empNome || "—"}</span>
                    </td>
                    <td className="text-right py-2">{fmtValor(f.valorCafe)}</td>
                    <td className="text-right py-2">{fmtValor(f.valorLanche)}</td>
                    <td className="text-right py-2">{fmtValor(f.valorJanta)}</td>
                    <td className="text-right py-2">{fmtValor(f.valorVa || f.valorVA)}</td>
                    <td className="text-right py-2 font-semibold">{fmtValor(f.valorTotal)}</td>
                    <td className="text-center py-2">{f.diasUteis || "—"}</td>
                    <td className="text-center py-2">
                      <Badge className={`text-xs ${STATUS_COLORS[f.status] || "bg-gray-100 text-gray-800"}`}>
                        {STATUS_LABELS[f.status] || f.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function ValeAlimentacao() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const { user } = useAuth();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const mesStr = `${ano}-${String(mes).padStart(2, "0")}`;
  const [tab, setTab] = useState<TabKey>("lancamento");
  const [showCfgHist, setShowCfgHist] = useState(false); // Rev. 4763 — guia Histórico de configurações
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [diasUteis, setDiasUteis] = useState(22);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ valorTotal: "", valorCafe: "", valorLanche: "", valorVa: "", observacoes: "", motivoAlteracao: "" });
  const [showGerarDialog, setShowGerarDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [configForm, setConfigForm] = useState<any>({});
  const [editingConfigId, setEditingConfigId] = useState<number | null>(null);
  const [histEmployeeId, setHistEmployeeId] = useState<number | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [detailRecord, setDetailRecord] = useState<any>(null);
  const [confirmAction, setConfirmAction] = useState<{ msg: string; onConfirm: () => void } | null>(null);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [histDialogEmployeeId, setHistDialogEmployeeId] = useState<number | null>(null);
  const [histDialogName, setHistDialogName] = useState<string>("");
  const [alertaFilter, setAlertaFilter] = useState<'todos' | 'pendente' | 'descontar' | 'abonar'>('pendente');
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [progressState, setProgressState] = useState<{ active: boolean; percent: number; phase: string; } | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showReajusteDialog, setShowReajusteDialog] = useState(false);
  const [reajusteAno, setReajusteAno] = useState(now.getFullYear());

  // Queries
  const statsQ = trpc.valeAlimentacao.getStats.useQuery({ companyId, companyIds, mesReferencia: mesStr }, { enabled: !!companyId || companyIds?.length > 0 });
  const lancamentosQ = trpc.valeAlimentacao.listLancamentos.useQuery({ companyId, companyIds, mesReferencia: mesStr }, { enabled: !!companyId || companyIds?.length > 0 });
  const configsQ = trpc.avisoPrevio.avisoPrevio.listMealBenefitConfigs.useQuery({ companyId, companyIds }, { enabled: (!!companyId || companyIds?.length > 0) && tab === "configuracao" });
  const histQ = trpc.valeAlimentacao.historicoColaborador.useQuery(
    { companyId, employeeId: histEmployeeId! },
    { enabled: (!!companyId || companyIds?.length > 0) && !!histEmployeeId && tab === "historico" }
  );
  const histDialogQ = trpc.valeAlimentacao.historicoColaborador.useQuery(
    { companyId, employeeId: histDialogEmployeeId! },
    { enabled: (!!companyId || companyIds?.length > 0) && !!histDialogEmployeeId }
  );
  const employeesQ = trpc.employees.list.useQuery({ companyId, companyIds, excludeTerminated: true }, { enabled: (!!companyId || companyIds?.length > 0) && tab === "historico" });
  const alertasQ = trpc.valeAlimentacao.listarAlertasFaltas.useQuery({ companyId, companyIds, mesReferencia: mesStr, status: alertaFilter }, { enabled: (!!companyId || companyIds?.length > 0) && tab === "alertas_faltas" });
  const previewReajusteQ = trpc.avisoPrevio.avisoPrevio.previewReajusteBeneficios.useQuery(
    { companyId, companyIds, ano: reajusteAno },
    { enabled: (!!companyId || companyIds?.length > 0) && showReajusteDialog }
  );

  // Mutations
  const gerarMut = trpc.valeAlimentacao.gerarMes.useMutation({
    onSuccess: (data) => {
      stopProgress(!!data.success);
      if (data.success) {
        toast.success(data.message);
        lancamentosQ.refetch();
        statsQ.refetch();
        setShowGerarDialog(false);
      } else {
        toast.error(data.message);
      }
    },
    onError: (e) => {
      stopProgress(false);
      toast.error(e.message);
    },
  });
  const startProgress = useCallback((totalFuncs: number) => {
    const phases = [
      "Carregando configurações...",
      "Consultando calendário de feriados...",
      "Calculando dias úteis por cidade...",
      "Processando férias e licenças...",
      "Gerando lançamentos individuais...",
      "Verificando faltas e alertas...",
      "Finalizando...",
    ];
    let currentPercent = 0;
    let phaseIdx = 0;
    setProgressState({ active: true, percent: 0, phase: phases[0] });
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    const step = Math.max(0.3, 80 / (totalFuncs * 2));
    progressTimerRef.current = setInterval(() => {
      currentPercent = Math.min(currentPercent + step + Math.random() * step * 0.5, 92);
      const newPhaseIdx = Math.min(Math.floor(currentPercent / (92 / phases.length)), phases.length - 1);
      if (newPhaseIdx !== phaseIdx) phaseIdx = newPhaseIdx;
      setProgressState({ active: true, percent: Math.round(currentPercent), phase: phases[phaseIdx] });
    }, 200);
  }, []);

  const stopProgress = useCallback((success: boolean) => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setProgressState({ active: true, percent: 100, phase: success ? "Concluído!" : "Erro no processamento" });
    setTimeout(() => setProgressState(null), 1500);
  }, []);

  const regerarMut = trpc.valeAlimentacao.regerarMes.useMutation({
    onSuccess: (data) => {
      stopProgress(!!data.success);
      if (data.success) {
        toast.success(data.message);
        lancamentosQ.refetch();
        statsQ.refetch();
      } else {
        toast.error(data.message);
      }
    },
    onError: (e) => {
      stopProgress(false);
      toast.error(e.message);
    },
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
  const aplicarReajusteMut = trpc.avisoPrevio.avisoPrevio.aplicarReajusteBeneficios.useMutation({
    onSuccess: (data) => {
      toast.success(`Reajuste de ${data.percentual}% aplicado a ${data.atualizados} configuração(ões)!`);
      configsQ.refetch();
      previewReajusteQ.refetch();
      setShowReajusteDialog(false);
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
  const decidirAlertaMut = trpc.valeAlimentacao.decidirAlertaFalta.useMutation({
    onSuccess: () => {
      toast.success("Decisão registrada!");
      alertasQ.refetch();
      lancamentosQ.refetch();
      statsQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const decidirAlertaLoteMut = trpc.valeAlimentacao.decidirAlertasFaltaLote.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.processados} alerta(s) processado(s)!`);
      alertasQ.refetch();
      lancamentosQ.refetch();
      statsQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const stats = statsQ.data;
  const lancamentos = lancamentosQ.data || [];
  const configs = (configsQ.data || []) as any[];
  // Rev. 4763 — só a config vigente na tela; encerradas vão pra guia "Histórico" (poka-yoke)
  // Normaliza string OU Date (superjson pode devolver Date; String(Date).slice = "Fri May 15" — bug conhecido)
  const isoDateCfg = (v: any): string | null => v == null ? null : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const hojeIsoCfg = new Date().toISOString().slice(0, 10);
  const cfgVigentes = configs.filter((c: any) => { const f = isoDateCfg(c.vigencia_fim); return !f || f >= hojeIsoCfg; });
  const cfgEncerradas = configs.filter((c: any) => { const f = isoDateCfg(c.vigencia_fim); return f != null && f < hojeIsoCfg; });

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

  const alertasPendentes = stats?.alertasFaltasPendentes || 0;
  const TABS: { key: TabKey; label: string; icon: React.ElementType; badge?: number }[] = [
    { key: "lancamento", label: "Lançamento Mensal", icon: CreditCard },
    { key: "por_obra", label: "Por Obra", icon: Building2 },
    { key: "alertas_faltas", label: "Alertas de Faltas", icon: AlertTriangle, badge: alertasPendentes },
    { key: "configuracao", label: "Configuração", icon: Settings },
    { key: "historico", label: "Histórico", icon: History },
  ];

  const obraGroups = useMemo(() => {
    if (!lancamentos || lancamentos.length === 0) return [];
    const map = new Map<string, { obraKey: string; obraNome: string; funcs: any[]; totalCafe: number; totalLanche: number; totalJanta: number; totalVA: number; totalGeral: number }>();
    for (const l of lancamentos as any[]) {
      const obraNome = l.obraNome || "Sem Obra";
      if (!map.has(obraNome)) map.set(obraNome, { obraKey: obraNome, obraNome, funcs: [], totalCafe: 0, totalLanche: 0, totalJanta: 0, totalVA: 0, totalGeral: 0 });
      const g = map.get(obraNome)!;
      g.funcs.push(l);
      g.totalCafe += parseBRL(l.valorCafe);
      g.totalLanche += parseBRL(l.valorLanche);
      g.totalJanta += parseBRL(l.valorJanta);
      g.totalVA += parseBRL(l.valorVa || l.valorVA);
      g.totalGeral += parseBRL(l.valorTotal);
    }
    return Array.from(map.values()).sort((a, b) => a.obraNome.localeCompare(b.obraNome));
  }, [lancamentos]);

  const mesLabel = (() => {
    const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return `${MESES[mes - 1]} ${ano}`;
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
              {t.badge && t.badge > 0 ? (
                <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold rounded-full bg-red-500 text-white">{t.badge}</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* ===== ABA LANÇAMENTO MENSAL ===== */}
        {tab === "lancamento" && (
          <div className="space-y-4">
            {/* Period selector padrão white-card */}
            <PeriodSelectorCard ano={ano} mes={mes} onAno={setAno} onMes={setMes} />
            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="flex items-center gap-2 flex-wrap">
                {lancamentos.length === 0 ? (
                  <Button className="bg-orange-600 hover:bg-orange-700 text-white gap-2" onClick={() => setShowGerarDialog(true)}>
                    <Plus className="h-4 w-4" /> Gerar Lançamentos
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => {
                      setConfirmAction({
                        msg: "Regerar todos os lançamentos pendentes?\nLançamentos já pagos serão mantidos.",
                        onConfirm: () => {
                          const totalFuncs = lancamentos.length || 50;
                          startProgress(totalFuncs);
                          regerarMut.mutate({ companyId, companyIds, mesReferencia: mesStr, diasUteis });
                        }
                      });
                    }} disabled={regerarMut.isPending || !!progressState}>
                      <RefreshCw className="h-3.5 w-3.5" /> Regerar
                    </Button>
                    {stats && stats.pendentes > 0 && (
                      <Button size="sm" className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
                        setConfirmAction({
                          msg: `Aprovar todos os ${stats.pendentes} lançamentos pendentes?`,
                          onConfirm: () => aprovarMut.mutate({ companyId, companyIds, mesReferencia: mesStr })
                        });
                      }} disabled={aprovarMut.isPending}>
                        <CheckCircle className="h-3.5 w-3.5" /> Aprovar Todos ({stats.pendentes})
                      </Button>
                    )}
                    {stats && stats.aprovados > 0 && (
                      <Button size="sm" className="gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => {
                        if (confirm(`Marcar ${stats.aprovados} lançamentos como pagos?`)) {
                          pagarMut.mutate({ companyId, companyIds, mesReferencia: mesStr });
                        }
                      }} disabled={pagarMut.isPending}>
                        <DollarSign className="h-3.5 w-3.5" /> Marcar Pagos ({stats.aprovados})
                      </Button>
                    )}
                    {stats && stats.pagos > 0 && (
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => {
                        if (confirm(`Reverter ${stats.pagos} lançamento(s) de 'Pago' para 'Aprovado'?`)) {
                          reverterPagoMut.mutate({ companyId, companyIds, mesReferencia: mesStr });
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

            {progressState && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center backdrop-blur-sm">
                <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md mx-4 space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                      <RefreshCw className={`h-5 w-5 text-orange-600 ${progressState.percent < 100 ? 'animate-spin' : ''}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Regenerando Lançamentos</h3>
                      <p className="text-sm text-muted-foreground">{mesLabel}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{progressState.phase}</span>
                      <span className="font-mono font-semibold text-orange-600">{progressState.percent}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ease-out ${progressState.percent >= 100 ? 'bg-green-500' : 'bg-gradient-to-r from-orange-400 to-orange-600'}`}
                        style={{ width: `${progressState.percent}%` }}
                      />
                    </div>
                  </div>
                  {progressState.percent >= 100 && (
                    <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                      <CheckCircle className="h-4 w-4" />
                      Processamento concluído!
                    </div>
                  )}
                </div>
              </div>
            )}

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
                          <th className="text-right px-3 py-3 font-medium">
                            <span className="flex items-center gap-1 justify-end text-red-600"><MinusCircle className="h-3.5 w-3.5" /> Desc. Faltas</span>
                          </th>
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
                            {fmtBRL(filteredLancamentos.filter((l: any) => l.status !== "cancelado").reduce((s: number, l: any) => s + parseBRL(l.valorVa || l.valorVA), 0))}
                          </td>
                          <td className="px-3 py-3 text-right text-base">
                            {fmtBRL(filteredLancamentos.filter((l: any) => l.status !== "cancelado").reduce((s: number, l: any) => s + parseBRL(l.valorTotal), 0))}
                          </td>
                          <td className="px-3 py-3 text-right text-xs text-red-600">
                            {(() => {
                              const totalDesc = filteredLancamentos.filter((l: any) => l.status !== "cancelado").reduce((s: number, l: any) => {
                                const d = (l.diasDescontados || 0);
                                if (d <= 0) return s;
                                try {
                                  const mc = l.memoriaCalculo ? (typeof l.memoriaCalculo === 'string' ? JSON.parse(l.memoriaCalculo) : l.memoriaCalculo) : null;
                                  if (mc && mc.valorTotal) return s + (mc.valorTotal - parseBRL(l.valorTotal));
                                } catch {}
                                return s;
                              }, 0);
                              return totalDesc > 0 ? `- ${fmtBRL(totalDesc)}` : '-';
                            })()}
                          </td>
                          <td colSpan={3}></td>
                        </tr>
                        {filteredLancamentos.map((l: any) => {
                          const isExpanded = expandedRowId === l.id;
                          let mc: any = null;
                          try {
                            if (l.memoriaCalculo) {
                              mc = typeof l.memoriaCalculo === 'string' ? JSON.parse(l.memoriaCalculo) : l.memoriaCalculo;
                            }
                          } catch {}
                          return (
                          <React.Fragment key={l.id}>
                          <tr className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${isExpanded ? 'bg-blue-50/50' : ''}`}>
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
                            <td className="px-3 py-2.5 text-right text-xs">{fmtValor(l.valorVa || l.valorVA)}</td>
                            <td className="px-3 py-2.5 text-right font-bold text-sm">{fmtValor(l.valorTotal)}</td>
                            <td className="px-3 py-2.5 text-right text-xs text-red-600">
                              {(() => {
                                const d = l.diasDescontados || 0;
                                if (d <= 0) return <span className="text-muted-foreground">-</span>;
                                try {
                                  const mcD = l.memoriaCalculo ? (typeof l.memoriaCalculo === 'string' ? JSON.parse(l.memoriaCalculo) : l.memoriaCalculo) : null;
                                  if (mcD && mcD.valorTotal) {
                                    const desc = mcD.valorTotal - parseBRL(l.valorTotal);
                                    return desc > 0 ? <span title={`${d} falta(s) descontada(s)`}>- {fmtBRL(desc)}</span> : <span className="text-muted-foreground">-</span>;
                                  }
                                } catch {}
                                return <span className="text-muted-foreground">-</span>;
                              })()}
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs">{l.diasUteis || "-"}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[l.status] || "bg-gray-100 text-gray-600"}`}>
                                {STATUS_LABELS[l.status] || l.status}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center gap-1 justify-center">
                                <Button variant="ghost" size="icon" className={`h-7 w-7 ${isExpanded ? 'text-blue-600 bg-blue-100' : ''}`} title="Memória de Cálculo" onClick={() => setExpandedRowId(isExpanded ? null : l.id)}>
                                  <Calculator className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver detalhes" onClick={() => { setDetailRecord(l); setShowDetailDialog(true); }}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {l.status === "pendente" && (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => {
                                      setEditingId(l.id);
                                      setEditForm({ valorTotal: l.valorTotal, valorCafe: l.valorCafe || "", valorLanche: l.valorLanche || "", valorVa: l.valorVa || "", observacoes: l.observacoes || "", motivoAlteracao: "" });
                                    }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" title="Aprovar" onClick={() => {
                                      aprovarMut.mutate({ companyId, companyIds, mesReferencia: mesStr, ids: [l.id] });
                                    }}>
                                      <CheckCircle className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" title="Cancelar" onClick={() => {
                                      if (confirm("Cancelar este lançamento?")) cancelarMut.mutate({ id: l.id, companyId });
                                    }}>
                                      <Ban className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                                {l.status === "aprovado" && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" title="Marcar como pago" onClick={() => {
                                    pagarMut.mutate({ companyId, companyIds, mesReferencia: mesStr, ids: [l.id] });
                                  }}>
                                    <DollarSign className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {l.status === "pago" && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600" title="Reverter para Aprovado" onClick={() => {
                                    if (confirm("Reverter este lançamento de 'Pago' para 'Aprovado'?")) {
                                      reverterPagoMut.mutate({ companyId, companyIds, mesReferencia: mesStr, ids: [l.id] });
                                    }
                                  }}>
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-blue-50/30 border-b">
                              <td colSpan={10} className="px-4 py-3">
                                {mc ? (
                                  <div className="rounded-lg border border-blue-200 bg-white p-4 space-y-3 max-w-2xl">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                                      <Calculator className="h-4 w-4" />
                                      Memória de Cálculo
                                      {mc.isProporcional && <Badge className="bg-amber-100 text-amber-800 text-[10px] ml-2">Proporcional</Badge>}
                                      {mc.cidade && <span className="text-xs font-normal text-muted-foreground ml-2">Cidade: {mc.cidade}</span>}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                                      <div className="flex items-center gap-1 text-muted-foreground">
                                        <Info className="h-3 w-3" />
                                        <span>Total iFood mensal configurado:</span>
                                        <span className="font-semibold text-foreground">{fmtBRL(mc.totalIFood)}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-muted-foreground">
                                        <Info className="h-3 w-3" />
                                        <span>Dias úteis ref. (config):</span>
                                        <span className="font-semibold text-foreground">{mc.diasUteisRef}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-muted-foreground">
                                        <Info className="h-3 w-3" />
                                        <span>Dias úteis do mês (cidade):</span>
                                        <span className="font-semibold text-foreground">{mc.diasUteisOriginal}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-muted-foreground">
                                        <Info className="h-3 w-3" />
                                        <span>Dias efetivos trabalhados:</span>
                                        <span className="font-semibold text-foreground">{mc.diasEfetivos}</span>
                                      </div>
                                      {mc.diasFerias > 0 && (
                                        <div className="flex items-center gap-1 text-amber-700">
                                          <AlertTriangle className="h-3 w-3" />
                                          <span>Dias de férias descontados: {mc.diasFerias}</span>
                                        </div>
                                      )}
                                      {mc.diasLicenca > 0 && (
                                        <div className="flex items-center gap-1 text-amber-700">
                                          <AlertTriangle className="h-3 w-3" />
                                          <span>Dias de licença descontados: {mc.diasLicenca}</span>
                                        </div>
                                      )}
                                    </div>

                                    <div className="border-t pt-3 space-y-2">
                                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fórmulas</p>
                                      <div className="space-y-1.5 text-xs font-mono bg-muted/30 rounded p-3">
                                        {mc.cafeAtivo && (
                                          <div className="flex items-start gap-2">
                                            <Coffee className="h-3.5 w-3.5 text-orange-500 mt-0.5 shrink-0" />
                                            <div>
                                              <span className="text-muted-foreground">Café da Manhã:</span>{' '}
                                              <span>{fmtBRL(mc.cafeDia)}/dia × {mc.diasEfetivos} dias = <strong className="text-foreground">{fmtBRL(mc.valorCafe)}</strong></span>
                                              <span className="text-muted-foreground text-[10px] block">Mensal ref: {fmtBRL(mc.cafeDia)} × {mc.diasUteisRef} = {fmtBRL(mc.cafeMensal)}</span>
                                            </div>
                                          </div>
                                        )}
                                        {mc.lancheAtivo && (
                                          <div className="flex items-start gap-2">
                                            <Sandwich className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                                            <div>
                                              <span className="text-muted-foreground">Lanche Tarde:</span>{' '}
                                              <span>{fmtBRL(mc.lancheDia)}/dia × {mc.diasEfetivos} dias = <strong className="text-foreground">{fmtBRL(mc.valorLanche)}</strong></span>
                                              <span className="text-muted-foreground text-[10px] block">Mensal ref: {fmtBRL(mc.lancheDia)} × {mc.diasUteisRef} = {fmtBRL(mc.lancheMensal)}</span>
                                            </div>
                                          </div>
                                        )}
                                        {mc.jantaAtivo && (
                                          <div className="flex items-start gap-2">
                                            <Moon className="h-3.5 w-3.5 text-indigo-500 mt-0.5 shrink-0" />
                                            <div>
                                              <span className="text-muted-foreground">Jantar:</span>{' '}
                                              <span>{fmtBRL(mc.jantaDia)}/dia × {mc.diasEfetivos} dias = <strong className="text-foreground">{fmtBRL(mc.valorJanta)}</strong></span>
                                            </div>
                                          </div>
                                        )}
                                        <div className="flex items-start gap-2">
                                          <UtensilsCrossed className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                                          <div>
                                            <span className="text-muted-foreground">VA (Vale Alimentação):</span>{' '}
                                            {mc.isProporcional ? (
                                              <span>{fmtBRL(mc.vaMensal)} × {mc.diasEfetivos}/{mc.diasUteisOriginal} = <strong className="text-foreground">{fmtBRL(mc.valorVA)}</strong></span>
                                            ) : (
                                              <span>Fixo mensal = <strong className="text-foreground">{fmtBRL(mc.vaMensal)}</strong></span>
                                            )}
                                            <span className="text-muted-foreground text-[10px] block">
                                              VA mensal = {fmtBRL(mc.totalIFood)} - {fmtBRL(mc.cafeMensal)} (café) - {fmtBRL(mc.lancheMensal)} (lanche){mc.jantaMensal > 0 ? ` - ${fmtBRL(mc.jantaMensal)} (jantar)` : ''} = {fmtBRL(mc.vaMensal)}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="border-t pt-2 mt-2 flex items-center gap-2 font-bold text-sm">
                                          <DollarSign className="h-4 w-4 text-green-600 shrink-0" />
                                          <span>Total: {fmtBRL(mc.valorTotal)}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {mc.isProporcional && mc.proporcionalDias && (
                                      <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 flex items-start gap-1.5">
                                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                        <span>Admissão no meio do mês — {mc.proporcionalDias} dias úteis proporcionais de {mc.diasUteisOriginal} dias do mês. Café e lanche calculados por dia; VA proporcionado.</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-xs text-muted-foreground italic flex items-center gap-2">
                                    <Info className="h-4 w-4" />
                                    Memória de cálculo não disponível para este lançamento. Regere os lançamentos para gerar.
                                  </div>
                                )}
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
        )}

        {/* ===== ABA POR OBRA ===== */}
        {tab === "por_obra" && (
          <div className="space-y-4">
            <PeriodSelectorCard ano={ano} mes={mes} onAno={setAno} onMes={setMes} />
            <div>
              <h2 className="text-lg font-semibold">Valores por Obra — {mesLabel}</h2>
              <p className="text-sm text-muted-foreground">Resumo dos benefícios agrupados por obra/centro de custo.</p>
            </div>

            {lancamentosQ.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : obraGroups.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>Nenhum lançamento encontrado para {mesLabel}.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {/* Totalizador geral */}
                <Card className="border-orange-200 bg-orange-50/50">
                  <CardContent className="py-4">
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Obras</p>
                        <p className="text-lg font-bold">{obraGroups.length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground"><Coffee className="inline h-3 w-3" /> Café</p>
                        <p className="text-lg font-semibold">R$ {fmtNum(obraGroups.reduce((s, g) => s + g.totalCafe, 0))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground"><Sandwich className="inline h-3 w-3" /> Lanche</p>
                        <p className="text-lg font-semibold">R$ {fmtNum(obraGroups.reduce((s, g) => s + g.totalLanche, 0))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground"><Moon className="inline h-3 w-3" /> Jantar</p>
                        <p className="text-lg font-semibold">R$ {fmtNum(obraGroups.reduce((s, g) => s + g.totalJanta, 0))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground"><CreditCard className="inline h-3 w-3" /> VA</p>
                        <p className="text-lg font-semibold">R$ {fmtNum(obraGroups.reduce((s, g) => s + g.totalVA, 0))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground"><DollarSign className="inline h-3 w-3" /> Total Geral</p>
                        <p className="text-xl font-bold text-orange-600">R$ {fmtNum(obraGroups.reduce((s, g) => s + g.totalGeral, 0))}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {obraGroups.map((g) => (
                  <ObraGroupCard key={g.obraKey} group={g} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== ABA ALERTAS DE FALTAS ===== */}
        {tab === "alertas_faltas" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Alertas de Faltas — {mesLabel}
                </h2>
                {(() => {
                  const [a, m] = [ano, mes];
                  const iniM = m - 1 <= 0 ? 12 : m - 1;
                  const iniA = m - 1 <= 0 ? a - 1 : a;
                  const mesesNome = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                  return (
                    <p className="text-sm text-muted-foreground">
                      Competência das faltas: <strong>16/{String(iniM).padStart(2,'0')}/{iniA} a 15/{String(m).padStart(2,'0')}/{a}</strong> ({mesesNome[iniM]}/{iniA} – {mesesNome[m]}/{a}). Faltas sem atestado nesse período geram desconto no VA de {mesLabel}.
                    </p>
                  );
                })()}
              </div>
              <PeriodSelectorCard ano={ano} mes={mes} onAno={setAno} onMes={setMes} />
              <div className="flex items-center gap-2">
                <Select value={alertaFilter} onValueChange={(v) => setAlertaFilter(v as any)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendentes</SelectItem>
                    <SelectItem value="descontar">Descontados</SelectItem>
                    <SelectItem value="abonar">Abonados</SelectItem>
                    <SelectItem value="todos">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(() => {
              const conflitos = (alertasQ.data || []).filter((a: any) => a.tipoFalta === 'conflito_feriado' || a.feriadoInfo);
              if (conflitos.length > 0) {
                return (
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
                    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-amber-900">Conflito Feriado x Falta Detectado</h4>
                      <p className="text-sm text-amber-800 mt-1">
                        <strong>{conflitos.length} falta{conflitos.length > 1 ? 's' : ''}</strong> {conflitos.length > 1 ? 'foram registradas' : 'foi registrada'} em datas que são feriados oficiais.
                        Isso pode indicar erro no ponto ou que houve expediente excepcional. <strong>Verifique cada caso</strong> antes de descontar.
                      </p>
                      <ul className="mt-2 text-xs text-amber-700 space-y-1">
                        {conflitos.slice(0, 5).map((c: any) => {
                          let info: any = null;
                          try { info = typeof c.feriadoInfo === 'string' ? JSON.parse(c.feriadoInfo) : c.feriadoInfo; } catch { /* */ }
                          return (
                            <li key={c.id} className="flex items-center gap-1.5">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <strong>{c.nomeCompleto}</strong> — {new Date(c.dataFalta + 'T12:00:00').toLocaleDateString('pt-BR')}
                              {info?.nomeFeriado && <span className="text-amber-600">({info.nomeFeriado} — {info.tipoFeriado})</span>}
                            </li>
                          );
                        })}
                        {conflitos.length > 5 && <li className="text-amber-600 font-medium">... e mais {conflitos.length - 5} conflito{conflitos.length - 5 > 1 ? 's' : ''}</li>}
                      </ul>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {alertasQ.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !alertasQ.data || alertasQ.data.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-40 text-green-500" />
                  <p className="font-medium">Nenhum alerta de falta {alertaFilter === 'pendente' ? 'pendente' : ''} para {mesLabel}.</p>
                  <p className="text-xs text-muted-foreground mt-1">Regere os lançamentos do mês para detectar faltas no período de aferição.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">

                {(() => {
                  const alertas = alertasQ.data || [];
                  const resumo: Record<string, { nome: string; faltas: number; cafe: number; lanche: number; jantar: number; total: number; datas: string[] }> = {};
                  for (const a of alertas) {
                    const key = a.employeeId || a.nomeCompleto;
                    if (!resumo[key]) resumo[key] = { nome: a.nomeCompleto || '—', faltas: 0, cafe: 0, lanche: 0, jantar: 0, total: 0, datas: [] };
                    resumo[key].faltas++;
                    resumo[key].cafe += parseBRL(a.valorDescontoCafe);
                    resumo[key].lanche += parseBRL(a.valorDescontoLanche);
                    resumo[key].jantar += parseBRL(a.valorDescontoJantar);
                    resumo[key].total += parseBRL(a.valorDescontoCafe) + parseBRL(a.valorDescontoLanche) + parseBRL(a.valorDescontoJantar);
                    if (a.dataFalta) resumo[key].datas.push(new Date(a.dataFalta + 'T12:00:00').toLocaleDateString('pt-BR'));
                  }
                  const resumoArr = Object.values(resumo).sort((a, b) => b.total - a.total);
                  const totalCafe = resumoArr.reduce((s, r) => s + r.cafe, 0);
                  const totalLanche = resumoArr.reduce((s, r) => s + r.lanche, 0);
                  const totalJantar = resumoArr.reduce((s, r) => s + r.jantar, 0);
                  const totalGeral = resumoArr.reduce((s, r) => s + r.total, 0);
                  if (resumoArr.length === 0) return null;
                  return (
                    <Card className="border-orange-200 bg-gradient-to-b from-orange-50/50 to-white">
                      <CardContent className="p-0">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-orange-200 bg-orange-50/80">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-orange-600" />
                            <p className="text-sm font-semibold text-gray-800">Resumo de Descontos por Funcionário</p>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-gray-500">{resumoArr.length} func.</span>
                            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-semibold">{alertas.length} faltas</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-orange-100">
                          <div className="px-4 py-3 border-r border-orange-100 last:border-r-0">
                            <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Desc. Café</p>
                            <p className="text-base font-bold text-gray-800 tabular-nums">R$ {totalCafe.toFixed(2)}</p>
                          </div>
                          <div className="px-4 py-3 border-r border-orange-100 last:border-r-0">
                            <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Desc. Lanche</p>
                            <p className="text-base font-bold text-gray-800 tabular-nums">R$ {totalLanche.toFixed(2)}</p>
                          </div>
                          <div className="px-4 py-3 border-r border-orange-100 last:border-r-0">
                            <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Desc. Jantar</p>
                            <p className="text-base font-bold text-gray-800 tabular-nums">R$ {totalJantar.toFixed(2)}</p>
                          </div>
                          <div className="px-4 py-3 bg-red-50/50">
                            <p className="text-[10px] text-red-500 uppercase font-medium mb-0.5">Total Desconto</p>
                            <p className="text-base font-bold text-red-700 tabular-nums">R$ {totalGeral.toFixed(2)}</p>
                          </div>
                        </div>

                        <div className="max-h-[420px] overflow-y-auto">
                          <table className="w-full text-[13px]">
                            <thead className="sticky top-0 z-10">
                              <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left py-2.5 pl-4 pr-2 font-semibold text-gray-600 text-xs uppercase tracking-wider" style={{width: '40%'}}>Funcionário</th>
                                <th className="text-center py-2.5 px-2 font-semibold text-gray-600 text-xs uppercase tracking-wider" style={{width: '10%'}}>Faltas</th>
                                <th className="text-right py-2.5 px-2 font-semibold text-gray-600 text-xs uppercase tracking-wider" style={{width: '14%'}}>Café</th>
                                <th className="text-right py-2.5 px-2 font-semibold text-gray-600 text-xs uppercase tracking-wider" style={{width: '14%'}}>Lanche</th>
                                <th className="text-right py-2.5 px-2 font-semibold text-gray-600 text-xs uppercase tracking-wider" style={{width: '14%'}}>Jantar</th>
                                <th className="text-right py-2.5 pl-2 pr-4 font-semibold text-red-700 text-xs uppercase tracking-wider" style={{width: '14%'}}>Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {resumoArr.map((r, i) => (
                                <tr key={i} className="hover:bg-orange-50/40 transition-colors" title={`Datas: ${r.datas.join(', ')}`}>
                                  <td className="py-2 pl-4 pr-2">
                                    <span className="font-medium text-gray-900 text-[13px]">{r.nome}</span>
                                  </td>
                                  <td className="text-center py-2 px-2">
                                    <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 bg-orange-100 text-orange-800 rounded text-xs font-bold">{r.faltas}</span>
                                  </td>
                                  <td className="text-right py-2 px-2 tabular-nums text-gray-700">{r.cafe > 0 ? r.cafe.toLocaleString('pt-BR', {style:'currency',currency:'BRL'}) : '—'}</td>
                                  <td className="text-right py-2 px-2 tabular-nums text-gray-700">{r.lanche > 0 ? r.lanche.toLocaleString('pt-BR', {style:'currency',currency:'BRL'}) : '—'}</td>
                                  <td className="text-right py-2 px-2 tabular-nums text-gray-700">{r.jantar > 0 ? r.jantar.toLocaleString('pt-BR', {style:'currency',currency:'BRL'}) : '—'}</td>
                                  <td className="text-right py-2 pl-2 pr-4 font-bold text-red-700 tabular-nums">{r.total.toLocaleString('pt-BR', {style:'currency',currency:'BRL'})}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-gray-50 border-t-2 border-gray-300">
                                <td className="py-2.5 pl-4 pr-2 font-bold text-gray-700 text-xs uppercase">Total</td>
                                <td className="text-center py-2.5 px-2 font-bold text-gray-700 text-xs">{alertas.length}</td>
                                <td className="text-right py-2.5 px-2 font-bold text-gray-800 tabular-nums text-xs">{totalCafe.toLocaleString('pt-BR', {style:'currency',currency:'BRL'})}</td>
                                <td className="text-right py-2.5 px-2 font-bold text-gray-800 tabular-nums text-xs">{totalLanche.toLocaleString('pt-BR', {style:'currency',currency:'BRL'})}</td>
                                <td className="text-right py-2.5 px-2 font-bold text-gray-800 tabular-nums text-xs">{totalJantar.toLocaleString('pt-BR', {style:'currency',currency:'BRL'})}</td>
                                <td className="text-right py-2.5 pl-2 pr-4 font-bold text-red-700 tabular-nums text-xs">{totalGeral.toLocaleString('pt-BR', {style:'currency',currency:'BRL'})}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                {alertaFilter === 'pendente' && alertasQ.data.length > 0 && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      disabled={decidirAlertaLoteMut.isPending}
                      onClick={() => {
                        setConfirmAction({
                          msg: `Descontar café/lanche/jantar de TODAS as ${alertasQ.data.length} faltas pendentes?`,
                          onConfirm: () => decidirAlertaLoteMut.mutate({ companyId, ids: alertasQ.data.map((a: any) => a.id), decisao: 'descontar' })
                        });
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-1" /> Descontar Todos ({alertasQ.data.length})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-green-600 border-green-200 hover:bg-green-50"
                      disabled={decidirAlertaLoteMut.isPending}
                      onClick={() => {
                        setConfirmAction({
                          msg: `Abonar (NÃO descontar) TODAS as ${alertasQ.data.length} faltas pendentes?`,
                          onConfirm: () => decidirAlertaLoteMut.mutate({ companyId, ids: alertasQ.data.map((a: any) => a.id), decisao: 'abonar' })
                        });
                      }}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" /> Abonar Todos ({alertasQ.data.length})
                    </Button>
                  </div>
                )}

                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                            <th className="text-left py-2.5 px-3 font-medium">Colaborador</th>
                            <th className="text-left py-2.5 px-3 font-medium">Obra</th>
                            <th className="text-center py-2.5 px-3 font-medium">Data da Falta</th>
                            <th className="text-right py-2.5 px-3 font-medium">Desc. Café</th>
                            <th className="text-right py-2.5 px-3 font-medium">Desc. Lanche</th>
                            <th className="text-right py-2.5 px-3 font-medium">Desc. Jantar</th>
                            <th className="text-center py-2.5 px-3 font-medium">Status</th>
                            <th className="text-center py-2.5 px-3 font-medium">Decisão</th>
                            <th className="text-center py-2.5 px-3 font-medium">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {alertasQ.data.map((a: any) => {
                            const isFeriadoConflito = a.tipoFalta === 'conflito_feriado' || !!a.feriadoInfo;
                            let feriadoInfo: any = null;
                            if (isFeriadoConflito && a.feriadoInfo) { try { feriadoInfo = typeof a.feriadoInfo === 'string' ? JSON.parse(a.feriadoInfo) : a.feriadoInfo; } catch { /* */ } }
                            return (
                            <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/20 ${isFeriadoConflito ? 'bg-amber-50/60' : ''}`}>
                              <td className="py-2.5 px-3">
                                <span className="font-medium">{a.nomeCompleto || '—'}</span>
                                {a.cpf && <span className="text-xs text-muted-foreground ml-2">{formatCPF(a.cpf)}</span>}
                              </td>
                              <td className="py-2.5 px-3 text-xs">{a.obraNome || 'Sem obra'}</td>
                              <td className="text-center py-2.5 px-3">
                                <div className="flex items-center justify-center gap-1.5">
                                  {a.dataFalta ? new Date(a.dataFalta + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                                  {isFeriadoConflito && (
                                    <span className="relative group cursor-help">
                                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-200 text-amber-700 text-xs font-bold" title={feriadoInfo?.mensagem || 'Conflito com feriado'}>!</span>
                                      <span className="absolute z-50 hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-amber-900 text-amber-50 text-xs rounded-lg shadow-xl leading-relaxed">
                                        <span className="font-bold block mb-1">Possível feriado nesta data</span>
                                        {feriadoInfo?.nomeFeriado && <span className="block">Feriado: <strong>{feriadoInfo.nomeFeriado}</strong></span>}
                                        {feriadoInfo?.tipoFeriado && <span className="block">Tipo: {feriadoInfo.tipoFeriado === 'nacional' ? 'Nacional' : feriadoInfo.tipoFeriado === 'estadual' ? 'Estadual' : 'Municipal'}</span>}
                                        {feriadoInfo?.cidadeFeriado && <span className="block">Cidade: {feriadoInfo.cidadeFeriado}</span>}
                                        <span className="block mt-1.5 text-amber-200">Verifique se houve expediente nesta data antes de descontar.</span>
                                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-amber-900"></span>
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="text-right py-2.5 px-3 text-xs">{fmtValor(a.valorDescontoCafe)}</td>
                              <td className="text-right py-2.5 px-3 text-xs">{fmtValor(a.valorDescontoLanche)}</td>
                              <td className="text-right py-2.5 px-3 text-xs">{fmtValor(a.valorDescontoJantar)}</td>
                              <td className="text-center py-2.5 px-3">
                                <Badge className={`text-xs ${
                                  a.decisao === 'pendente' ? 'bg-amber-100 text-amber-800' :
                                  a.decisao === 'descontar' ? 'bg-red-100 text-red-800' :
                                  'bg-green-100 text-green-800'
                                }`}>
                                  {a.decisao === 'pendente' ? 'Pendente' : a.decisao === 'descontar' ? 'Descontado' : 'Abonado'}
                                </Badge>
                              </td>
                              <td className="text-center py-2.5 px-3 text-xs text-muted-foreground">
                                {a.decidido_por ? `${a.decidido_por}` : '—'}
                              </td>
                              <td className="text-center py-2.5 px-3">
                                {a.decisao === 'pendente' && (
                                  <div className="flex items-center gap-1 justify-center">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-red-600 hover:bg-red-50"
                                      disabled={decidirAlertaMut.isPending}
                                      onClick={() => decidirAlertaMut.mutate({ id: a.id, companyId, decisao: 'descontar' })}
                                      title="Descontar"
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-green-600 hover:bg-green-50"
                                      disabled={decidirAlertaMut.isPending}
                                      onClick={() => decidirAlertaMut.mutate({ id: a.id, companyId, decisao: 'abonar' })}
                                      title="Abonar"
                                    >
                                      <CheckCircle className="h-3.5 w-3.5" />
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
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ===== ABA CONFIGURAÇÃO ===== */}
        {tab === "configuracao" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Configurações de Benefícios</h2>
                <p className="text-sm text-muted-foreground">Valor único para TODOS os CLTs da empresa (café da manhã, café da tarde e VR 100%) — sem separação por obra ou escritório.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2" onClick={() => {
                  setReajusteAno(ano);
                  setShowReajusteDialog(true);
                }}>
                  <Calculator className="h-4 w-4" /> Calcular Reajuste
                </Button>
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
                    descontoVaPercentual: "0",
                    cafeTotalMes: "",
                    lancheTotalMes: "",
                    jantaTotalMes: "",
                    vaTotalMes: "",
                    observacoes: "",
                    vigenciaInicio: "",
                    vigenciaFim: "",
                  });
                  setShowConfigDialog(true);
                }}>
                  <Plus className="h-4 w-4" /> Nova Configuração
                </Button>
              </div>
            </div>

            {/* Guias: Vigente × Histórico (poka-yoke: encerradas não poluem a tela) */}
            <div className="flex items-center gap-1.5">
              <Button variant={!showCfgHist ? "default" : "outline"} size="sm" className={`gap-1.5 rounded-full ${!showCfgHist ? "bg-orange-600 hover:bg-orange-700 text-white" : ""}`} onClick={() => setShowCfgHist(false)}>
                ✅ Vigente {cfgVigentes.length > 0 && <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[10px]">{cfgVigentes.length}</Badge>}
              </Button>
              <Button variant={showCfgHist ? "default" : "outline"} size="sm" className={`gap-1.5 rounded-full ${showCfgHist ? "bg-slate-600 hover:bg-slate-700 text-white" : "text-muted-foreground"}`} onClick={() => setShowCfgHist(true)}>
                🕓 Histórico {cfgEncerradas.length > 0 && <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[10px]">{cfgEncerradas.length}</Badge>}
              </Button>
            </div>
            {(showCfgHist ? cfgEncerradas : cfgVigentes).length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Settings className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground mb-2">{showCfgHist ? "Nenhuma configuração encerrada" : "Nenhuma configuração vigente"}</p>
                  <p className="text-sm text-muted-foreground">{showCfgHist ? "Quando um valor for reajustado, a versão antiga aparece aqui automaticamente." : "Crie uma configuração padrão para definir os valores dos benefícios."}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {(showCfgHist ? cfgEncerradas : cfgVigentes).map((cfg: any) => (
                  <Card key={cfg.id} className={showCfgHist ? "border-slate-200 bg-slate-50/70 opacity-70 grayscale-[.4]" : `${!cfg.obraId ? "border-orange-300 bg-orange-50/30" : ""}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <CardTitle className="text-sm flex items-center gap-2">
                            {cfg.obraId ? (
                              <><Building2 className="h-4 w-4 text-blue-600" /> {cfg.obraNome || `Obra #${cfg.obraId}`}</>
                            ) : (
                              <><Settings className="h-4 w-4 text-orange-600" /> Padrão da Empresa</>
                            )}
                          </CardTitle>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarRange className="h-3 w-3" />
                            {cfg.vigencia_inicio ? new Date(cfg.vigencia_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : "início indefinido"}
                            {" — "}
                            {cfg.vigencia_fim ? (
                              <span className="text-red-500">encerrada em {new Date(cfg.vigencia_fim + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                            ) : (
                              <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px] border-green-400 text-green-700 bg-green-50">vigente</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            setEditingConfigId(cfg.id);
                            {
                              const dias = cfg.diasUteisRef || 22;
                              const hasTotals = parseBRL(cfg.cafe_total_mes || cfg.cafeTotalMes) > 0 || parseBRL(cfg.lanche_total_mes || cfg.lancheTotalMes) > 0 || parseBRL(cfg.va_total_mes || cfg.vaTotalMes) > 0 || parseBRL(cfg.janta_total_mes || cfg.jantaTotalMes) > 0;
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
                                diasUteisRef: dias,
                                cafeAtivo: cfg.cafeAtivo === 1 || cfg.cafeAtivo === true,
                                lancheAtivo: cfg.lancheAtivo === 1 || cfg.lancheAtivo === true,
                                jantaAtivo: cfg.jantaAtivo === 1 || cfg.jantaAtivo === true,
                                descontoVaPercentual: cfg.descontoVaPercentual || "0",
                                cafeTotalMes: hasTotals ? (cfg.cafe_total_mes || cfg.cafeTotalMes || "0") : (parseBRL(cfg.cafeManhaDia) * dias).toFixed(2).replace('.', ','),
                                lancheTotalMes: hasTotals ? (cfg.lanche_total_mes || cfg.lancheTotalMes || "0") : (parseBRL(cfg.lancheTardeDia) * dias).toFixed(2).replace('.', ','),
                                jantaTotalMes: hasTotals ? (cfg.janta_total_mes || cfg.jantaTotalMes || "0") : (parseBRL(cfg.jantaDia) * dias).toFixed(2).replace('.', ','),
                                vaTotalMes: hasTotals ? (cfg.va_total_mes || cfg.vaTotalMes || "0") : (parseBRL(cfg.valeAlimentacaoMes) * dias).toFixed(2).replace('.', ','),
                                observacoes: cfg.observacoes || "",
                                vigenciaInicio: cfg.vigencia_inicio ? String(cfg.vigencia_inicio).slice(0, 10) : "",
                                vigenciaFim: cfg.vigencia_fim ? String(cfg.vigencia_fim).slice(0, 10) : "",
                              });
                            }
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
                      {(() => {
                        const dias = cfg.diasUteisRef || 22;
                        const cafeMes = parseBRL(cfg.cafe_total_mes || cfg.cafeTotalMes) || (parseBRL(cfg.cafeManhaDia) * dias);
                        const lancheMes = parseBRL(cfg.lanche_total_mes || cfg.lancheTotalMes) || (parseBRL(cfg.lancheTardeDia) * dias);
                        const jantaMes = parseBRL(cfg.janta_total_mes || cfg.jantaTotalMes) || (parseBRL(cfg.jantaDia) * dias);
                        const vaMes = parseBRL(cfg.va_total_mes || cfg.vaTotalMes) || (parseBRL(cfg.valeAlimentacaoMes) * dias);
                        const cafeDia = dias > 0 ? cafeMes / dias : 0;
                        const lancheDia = dias > 0 ? lancheMes / dias : 0;
                        const jantaDia = dias > 0 ? jantaMes / dias : 0;
                        const vaDia = dias > 0 ? vaMes / dias : 0;
                        return (
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex items-center gap-2">
                              <Coffee className={`h-4 w-4 ${cfg.cafeAtivo ? "text-orange-600" : "text-muted-foreground/30"}`} />
                              <div>
                                <p className="text-xs text-muted-foreground">Café/mês</p>
                                <p className={`font-medium ${cfg.cafeAtivo ? "" : "text-muted-foreground line-through"}`}>
                                  {fmtBRL(cafeMes)}
                                </p>
                                <p className="text-[10px] text-muted-foreground">R$ {cafeDia.toFixed(2).replace('.', ',')}/dia</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Sandwich className={`h-4 w-4 ${cfg.lancheAtivo ? "text-green-600" : "text-muted-foreground/30"}`} />
                              <div>
                                <p className="text-xs text-muted-foreground">Lanche/mês</p>
                                <p className={`font-medium ${cfg.lancheAtivo ? "" : "text-muted-foreground line-through"}`}>
                                  {fmtBRL(lancheMes)}
                                </p>
                                <p className="text-[10px] text-muted-foreground">R$ {lancheDia.toFixed(2).replace('.', ',')}/dia</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Moon className={`h-4 w-4 ${cfg.jantaAtivo ? "text-purple-600" : "text-muted-foreground/30"}`} />
                              <div>
                                <p className="text-xs text-muted-foreground">Jantar/mês</p>
                                <p className={`font-medium ${cfg.jantaAtivo ? "" : "text-muted-foreground line-through"}`}>
                                  {jantaMes > 0 ? fmtBRL(jantaMes) : '-'}
                                </p>
                                <p className="text-[10px] text-muted-foreground">R$ {jantaDia.toFixed(2).replace('.', ',')}/dia</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <UtensilsCrossed className="h-4 w-4 text-blue-600" />
                              <div>
                                <p className="text-xs text-muted-foreground">VA iFood/mês</p>
                                <p className="font-medium">
                                  {fmtBRL(vaMes)}
                                </p>
                                <p className="text-[10px] text-muted-foreground">R$ {vaDia.toFixed(2).replace('.', ',')}/dia</p>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="mt-3 pt-2 border-t text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
                        <span>Dias úteis ref.: <strong>{cfg.diasUteisRef || 22}</strong></span>
                        {cfg.totalVA_iFood && parseBRL(cfg.totalVA_iFood) > 0 && (
                          <span>Total iFood: <strong>{fmtValor(cfg.totalVA_iFood)}</strong></span>
                        )}
                        {parseBRL(cfg.descontoVaPercentual) > 0 && (
                          <span className="text-red-600">Desconto VA: <strong>{cfg.descontoVaPercentual}%</strong></span>
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
                              <td className="px-3 py-2.5 text-right text-xs">{fmtValor(h.valorVa || h.valorVA)}</td>
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
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" disabled={gerarMut.isPending || !!progressState} onClick={() => {
              startProgress(50);
              gerarMut.mutate({ companyId, companyIds, mesReferencia: mesStr, diasUteis });
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Café (R$)</Label>
                <Input value={editForm.valorCafe} onChange={e => {
                  const valorCafe = e.target.value;
                  setEditForm(f => {
                    const cafe = parseFloat(valorCafe.replace(/\./g, "").replace(",", ".")) || 0;
                    const lanche = parseFloat(f.valorLanche.replace(/\./g, "").replace(",", ".")) || 0;
                    const va = parseFloat(f.valorVa.replace(/\./g, "").replace(",", ".")) || 0;
                    const desc = va * 0.05;
                    const total = (cafe + lanche + va - desc).toFixed(2).replace(".", ",");
                    return { ...f, valorCafe, valorTotal: total };
                  });
                }} className="mt-1" placeholder="0,00" />
              </div>
              <div>
                <Label className="text-sm">Lanche (R$)</Label>
                <Input value={editForm.valorLanche} onChange={e => {
                  const valorLanche = e.target.value;
                  setEditForm(f => {
                    const cafe = parseFloat(f.valorCafe.replace(/\./g, "").replace(",", ".")) || 0;
                    const lanche = parseFloat(valorLanche.replace(/\./g, "").replace(",", ".")) || 0;
                    const va = parseFloat(f.valorVa.replace(/\./g, "").replace(",", ".")) || 0;
                    const desc = va * 0.05;
                    const total = (cafe + lanche + va - desc).toFixed(2).replace(".", ",");
                    return { ...f, valorLanche, valorTotal: total };
                  });
                }} className="mt-1" placeholder="0,00" />
              </div>
            </div>
            <div>
              <Label className="text-sm">VA (R$)</Label>
              <Input value={editForm.valorVa} onChange={e => {
                const valorVa = e.target.value;
                setEditForm(f => {
                  const cafe = parseFloat(f.valorCafe.replace(/\./g, "").replace(",", ".")) || 0;
                  const lanche = parseFloat(f.valorLanche.replace(/\./g, "").replace(",", ".")) || 0;
                  const va = parseFloat(valorVa.replace(/\./g, "").replace(",", ".")) || 0;
                  const desc = va * 0.05;
                  const total = (cafe + lanche + va - desc).toFixed(2).replace(".", ",");
                  return { ...f, valorVa, valorTotal: total };
                });
              }} className="mt-1" placeholder="0,00" />
            </div>
            <div className="rounded-md bg-gray-50 p-3 border">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Desconto VA (5%)</span>
                <span className="text-red-600 font-medium">
                  - R$ {((parseFloat(editForm.valorVa.replace(/\./g, "").replace(",", ".")) || 0) * 0.05).toFixed(2).replace(".", ",")}
                </span>
              </div>
              <div className="flex justify-between text-sm font-semibold mt-1 pt-1 border-t">
                <span>Valor Total</span>
                <span className="text-[#1B2A4A]">R$ {editForm.valorTotal}</span>
              </div>
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
              editarMut.mutate({
                id: editingId, companyId,
                valorTotal: editForm.valorTotal,
                valorCafe: editForm.valorCafe,
                valorLanche: editForm.valorLanche,
                valorVA: editForm.valorVa,
                motivoAlteracao: editForm.motivoAlteracao,
                observacoes: editForm.observacoes,
              });
            }}>
              {editarMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG: CONFIGURAÇÃO ===== */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingConfigId ? "Editar Configuração" : "Nova Configuração"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Nome</Label>
              <Input value={configForm.nome || ""} onChange={e => setConfigForm((f: any) => ({ ...f, nome: e.target.value }))} className="mt-1" />
            </div>
            <p className="text-xs rounded-md border border-blue-200 bg-blue-50/60 text-blue-800 p-2.5">
              Configuração única da empresa: vale para <b>todos os CLTs</b> (obras e escritório), com café da manhã, café da tarde e VR 100%. Não existe mais separação por obra/escritório.
            </p>
            <div className="grid grid-cols-2 gap-3 rounded-md border border-orange-200 bg-orange-50/50 p-3">
              <div>
                <Label className="text-sm flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" /> Vigência — Início</Label>
                <Input type="date" value={configForm.vigenciaInicio || ""} onChange={e => setConfigForm((f: any) => ({ ...f, vigenciaInicio: e.target.value }))} className="mt-1 bg-white" />
                <p className="text-xs text-muted-foreground mt-1">
                  {editingConfigId ? "Ajuste manual (correção). Deixe vazio para não alterar." : "Vazio = hoje. Uma config aberta existente nesta obra/empresa será encerrada automaticamente na véspera."}
                </p>
              </div>
              <div>
                <Label className="text-sm flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" /> Vigência — Fim (opcional)</Label>
                <Input type="date" value={configForm.vigenciaFim || ""} onChange={e => setConfigForm((f: any) => ({ ...f, vigenciaFim: e.target.value }))} className="mt-1 bg-white" />
                <p className="text-xs text-muted-foreground mt-1">Vazio = em aberto (config atual)</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Dias Úteis Referência</Label>
                <Input type="number" value={configForm.diasUteisRef || 22} onChange={e => setConfigForm((f: any) => ({ ...f, diasUteisRef: Number(e.target.value) }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-sm">Desconto s/ VA (%)</Label>
                <Input value={configForm.descontoVaPercentual || "0"} onChange={e => setConfigForm((f: any) => ({ ...f, descontoVaPercentual: e.target.value }))} className="mt-1" placeholder="Ex: 5" />
                <p className="text-xs text-muted-foreground mt-1">PAT — incide apenas sobre o VA</p>
              </div>
            </div>

            {(() => {
              const dias = configForm.diasUteisRef || 22;
              const descPct = parseBRL(configForm.descontoVaPercentual) || 0;

              const cafeTotalMes = parseBRL(configForm.cafeTotalMes);
              const lancheTotalMes = parseBRL(configForm.lancheTotalMes);
              const jantaTotalMes = parseBRL(configForm.jantaTotalMes);
              const vaTotalMes = parseBRL(configForm.vaTotalMes);

              const cafeDia = dias > 0 ? cafeTotalMes / dias : 0;
              const lancheDia = dias > 0 ? lancheTotalMes / dias : 0;
              const jantaDia = dias > 0 ? jantaTotalMes / dias : 0;
              const vaDia = dias > 0 ? vaTotalMes / dias : 0;

              const brutoTotal = cafeTotalMes + lancheTotalMes + jantaTotalMes + vaTotalMes;
              const desconto = vaTotalMes * (descPct / 100);
              const totalLiquido = brutoTotal - desconto;

              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm flex items-center gap-1">
                        <Coffee className="h-3.5 w-3.5" /> Café da Manhã — Total/mês (R$)
                      </Label>
                      <Input value={configForm.cafeTotalMes ?? ""} onChange={e => setConfigForm((f: any) => ({ ...f, cafeTotalMes: e.target.value }))} className="mt-1" placeholder="Ex: 120" />
                      <div className="flex items-center justify-between mt-1">
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={configForm.cafeAtivo ?? true} onChange={e => setConfigForm((f: any) => ({ ...f, cafeAtivo: e.target.checked }))} />
                          Ativo
                        </label>
                        {cafeTotalMes > 0 && <span className="text-xs text-muted-foreground">= R$ {cafeDia.toFixed(2).replace('.', ',')}/dia</span>}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm flex items-center gap-1">
                        <Sandwich className="h-3.5 w-3.5" /> Lanche da Tarde — Total/mês (R$)
                      </Label>
                      <Input value={configForm.lancheTotalMes ?? ""} onChange={e => setConfigForm((f: any) => ({ ...f, lancheTotalMes: e.target.value }))} className="mt-1" placeholder="Ex: 100" />
                      <div className="flex items-center justify-between mt-1">
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={configForm.lancheAtivo ?? true} onChange={e => setConfigForm((f: any) => ({ ...f, lancheAtivo: e.target.checked }))} />
                          Ativo
                        </label>
                        {lancheTotalMes > 0 && <span className="text-xs text-muted-foreground">= R$ {lancheDia.toFixed(2).replace('.', ',')}/dia</span>}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm flex items-center gap-1">
                        <Moon className="h-3.5 w-3.5" /> Jantar — Total/mês (R$)
                      </Label>
                      <Input value={configForm.jantaTotalMes ?? ""} onChange={e => setConfigForm((f: any) => ({ ...f, jantaTotalMes: e.target.value }))} className="mt-1" placeholder="Ex: 0" />
                      <div className="flex items-center justify-between mt-1">
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={configForm.jantaAtivo ?? false} onChange={e => setConfigForm((f: any) => ({ ...f, jantaAtivo: e.target.checked }))} />
                          Ativo
                        </label>
                        {jantaTotalMes > 0 && <span className="text-xs text-muted-foreground">= R$ {jantaDia.toFixed(2).replace('.', ',')}/dia</span>}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm flex items-center gap-1">
                        <UtensilsCrossed className="h-3.5 w-3.5" /> VA iFood — Total/mês (R$)
                      </Label>
                      <Input value={configForm.vaTotalMes ?? ""} onChange={e => setConfigForm((f: any) => ({ ...f, vaTotalMes: e.target.value }))} className="mt-1" placeholder="Ex: 485" />
                      {vaTotalMes > 0 && <p className="text-xs text-muted-foreground mt-1">= R$ {vaDia.toFixed(2).replace('.', ',')}/dia</p>}
                    </div>
                  </div>

                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Resumo por funcionário/mês</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {cafeTotalMes > 0 && <span>Café: <strong>R$ {fmtNum(cafeTotalMes)}</strong></span>}
                      {lancheTotalMes > 0 && <span>Lanche: <strong>R$ {fmtNum(lancheTotalMes)}</strong></span>}
                      {jantaTotalMes > 0 && <span>Jantar: <strong>R$ {fmtNum(jantaTotalMes)}</strong></span>}
                      {vaTotalMes > 0 && <span>VA: <strong>R$ {fmtNum(vaTotalMes)}</strong></span>}
                    </div>
                    <div className="mt-2 pt-2 border-t flex items-center gap-3 text-sm">
                      <span>Bruto: <strong>R$ {fmtNum(brutoTotal)}</strong></span>
                      {descPct > 0 && <span className="text-red-600">− {descPct}% s/ VA: <strong>R$ {fmtNum(desconto)}</strong></span>}
                      <span className="text-orange-600 font-bold text-base">Total: R$ {fmtNum(totalLiquido)}</span>
                    </div>
                  </div>
                </>
              );
            })()}
            <div>
              <Label className="text-sm">Observações</Label>
              <Textarea value={configForm.observacoes || ""} onChange={e => setConfigForm((f: any) => ({ ...f, observacoes: e.target.value }))} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>Cancelar</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" disabled={saveConfigMut.isPending} onClick={() => {
              const dias = configForm.diasUteisRef || 22;
              const cafeTotalMes = parseBRL(configForm.cafeTotalMes);
              const lancheTotalMes = parseBRL(configForm.lancheTotalMes);
              const jantaTotalMes = parseBRL(configForm.jantaTotalMes);
              const vaTotalMes = parseBRL(configForm.vaTotalMes);

              const cafeDia = dias > 0 ? cafeTotalMes / dias : 0;
              const lancheDia = dias > 0 ? lancheTotalMes / dias : 0;
              const jantaDia = dias > 0 ? jantaTotalMes / dias : 0;
              const vaDia = dias > 0 ? vaTotalMes / dias : 0;

              // Poka-yoke (Rev. 4764): valor preenchido com benefício DESATIVADO gera lançamento
              // zerado no mês seguinte sem ninguém perceber — confirma explicitamente antes.
              const inconsistentes: string[] = [];
              if (!(configForm.cafeAtivo ?? true) && cafeTotalMes > 0) inconsistentes.push(`Café da manhã (R$ ${cafeTotalMes.toFixed(2).replace('.', ',')}/mês)`);
              if (!(configForm.lancheAtivo ?? true) && lancheTotalMes > 0) inconsistentes.push(`Café da tarde (R$ ${lancheTotalMes.toFixed(2).replace('.', ',')}/mês)`);
              if (!(configForm.jantaAtivo ?? false) && jantaTotalMes > 0) inconsistentes.push(`Jantar (R$ ${jantaTotalMes.toFixed(2).replace('.', ',')}/mês)`);
              if (inconsistentes.length > 0) {
                const ok = confirm(`⚠️ Atenção: ${inconsistentes.join(" e ")} tem VALOR preenchido mas está DESATIVADO.\n\nAssim, os lançamentos mensais sairão com R$ 0,00 nesse item.\n\nQuer salvar mesmo assim? (Cancele para voltar e ativar o benefício)`);
                if (!ok) return;
              }

              const brutoTotal = cafeTotalMes + lancheTotalMes + jantaTotalMes + vaTotalMes;
              const descPct = parseBRL(configForm.descontoVaPercentual) || 0;
              const totalCalc = brutoTotal - vaTotalMes * (descPct / 100);

              saveConfigMut.mutate({
                ...configForm,
                cafeManhaDia: cafeDia.toFixed(10).replace(".", ","),
                lancheTardeDia: lancheDia.toFixed(10).replace(".", ","),
                jantaDia: jantaDia.toFixed(10).replace(".", ","),
                valeAlimentacaoMes: vaDia.toFixed(10).replace(".", ","),
                cafeTotalMes: cafeTotalMes.toFixed(2).replace(".", ","),
                lancheTotalMes: lancheTotalMes.toFixed(2).replace(".", ","),
                jantaTotalMes: jantaTotalMes.toFixed(2).replace(".", ","),
                vaTotalMes: vaTotalMes.toFixed(2).replace(".", ","),
                totalVA_iFood: totalCalc.toFixed(2).replace(".", ","),
                id: editingConfigId || undefined,
                companyId,
              });
            }}>
              {saveConfigMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG: CALCULAR REAJUSTE (DISSÍDIO) ===== */}
      <Dialog open={showReajusteDialog} onOpenChange={setShowReajusteDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-orange-600" /> Calcular Reajuste dos Benefícios</DialogTitle>
            <DialogDescription>
              Aplica o percentual de reajuste do Dissídio (data-base de maio) sobre café, lanche, VA e janta de todas as configurações ativas.
              A config atual é encerrada na véspera da data-base e uma NOVA versão vigente é criada com os valores reajustados — o histórico é preservado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Label className="whitespace-nowrap">Ano do Dissídio</Label>
              <Input
                type="number"
                className="w-32"
                value={reajusteAno}
                onChange={(e) => setReajusteAno(parseInt(e.target.value, 10) || now.getFullYear())}
              />
            </div>

            {previewReajusteQ.isFetching ? (
              <div className="py-8 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Carregando dados do dissídio...
              </div>
            ) : !previewReajusteQ.data?.dissidio ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                Nenhum dissídio cadastrado para {reajusteAno}. Cadastre o dissídio (menu Folha de Pagamento → Dissídio) antes de calcular o reajuste.
              </div>
            ) : (
              <>
                <div className="rounded-lg border bg-orange-50 border-orange-200 p-3 text-sm flex items-center justify-between">
                  <div>
                    <p className="font-medium text-orange-900">{previewReajusteQ.data.dissidio.titulo || `Dissídio ${previewReajusteQ.data.dissidio.anoReferencia}`}</p>
                    <p className="text-xs text-orange-700">Status: {previewReajusteQ.data.dissidio.status} · Data-base: mês {previewReajusteQ.data.dissidio.mesDataBase}</p>
                  </div>
                  <div className="text-2xl font-bold text-orange-700">+{previewReajusteQ.data.percentual}%</div>
                </div>

                {previewReajusteQ.data.configs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma configuração de benefícios ativa encontrada.</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2">Configuração</th>
                          <th className="text-right p-2">Café</th>
                          <th className="text-right p-2">Lanche</th>
                          <th className="text-right p-2">VA/mês</th>
                          <th className="text-right p-2">Janta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewReajusteQ.data.configs.map((cfg: any) => (
                          <tr key={cfg.id} className="border-t">
                            <td className="p-2">
                              {cfg.nome} {cfg.obraNome ? `(${cfg.obraNome})` : "(Padrão)"}
                              {cfg.jaReajustado && <span className="ml-2 text-xs text-amber-600">já reajustado neste ano</span>}
                            </td>
                            <td className="p-2 text-right">R$ {cfg.cafeManhaDia.atual} <span className="text-muted-foreground">→</span> <span className="font-medium text-green-700">R$ {cfg.cafeManhaDia.novo}</span></td>
                            <td className="p-2 text-right">R$ {cfg.lancheTardeDia.atual} <span className="text-muted-foreground">→</span> <span className="font-medium text-green-700">R$ {cfg.lancheTardeDia.novo}</span></td>
                            <td className="p-2 text-right">R$ {cfg.valeAlimentacaoMes.atual} <span className="text-muted-foreground">→</span> <span className="font-medium text-green-700">R$ {cfg.valeAlimentacaoMes.novo}</span></td>
                            <td className="p-2 text-right">R$ {cfg.jantaDia.atual} <span className="text-muted-foreground">→</span> <span className="font-medium text-green-700">R$ {cfg.jantaDia.novo}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReajusteDialog(false)}>Cancelar</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              disabled={!previewReajusteQ.data?.dissidio || !previewReajusteQ.data?.configs?.length || aplicarReajusteMut.isPending}
              onClick={() => {
                setConfirmAction({
                  msg: `Aplicar reajuste de +${previewReajusteQ.data?.percentual}% (Dissídio ${reajusteAno}) em ${previewReajusteQ.data?.configs.length} configuração(ões) de benefícios? Cada configuração atual será encerrada e uma nova versão vigente será criada com os valores reajustados (histórico preservado).`,
                  onConfirm: () => aplicarReajusteMut.mutate({ companyId, companyIds, ano: reajusteAno }),
                });
              }}
            >
              {aplicarReajusteMut.isPending ? "Aplicando..." : "Aplicar Reajuste"}
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
                  <span>{fmtValor(detailRecord.valorVa || detailRecord.valorVA)}</span>
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
                        <td className="px-3 py-2 text-right text-xs">{fmtValor(h.valorVa || h.valorVA)}</td>
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
                      <td className="px-3 py-2.5 text-right text-xs">{fmtBRL((histDialogQ.data as any[]).reduce((s: number, h: any) => s + parseBRL(h.valorVa || h.valorVA), 0))}</td>
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
      <Dialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmação</DialogTitle>
            <DialogDescription className="whitespace-pre-line pt-2">{confirmAction?.msg}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancelar</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => { confirmAction?.onConfirm(); setConfirmAction(null); }}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
