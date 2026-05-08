import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  CheckCircle, XCircle, AlertTriangle, Search, Clock, Eye,
  ThumbsUp, ThumbsDown, Receipt, DollarSign, User, Calendar,
  Store, Filter, FileText, ShoppingCart, RotateCcw, MessageSquare,
  ChevronLeft, ChevronRight
} from "lucide-react";

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const fmtBRL = (v: number | string) => {
  const n = typeof v === "string" ? parseFloat(v || "0") : Number(v || 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

// Verifica se uma `dataCompra` (YYYY-MM-DD ou ISO) pertence ao intervalo
// [cycleStart, cycleEnd] do ciclo retornado pelo backend.
function dataDentroDoCiclo(
  dataCompra: string | null | undefined,
  cycleStart: string | null | undefined,
  cycleEnd: string | null | undefined,
): boolean {
  if (!dataCompra || !cycleStart || !cycleEnd) return true;
  const iso = String(dataCompra).slice(0, 10);
  return iso >= cycleStart && iso <= cycleEnd;
}

function formatIsoBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  if (!y || !m || !d) return iso || "";
  return `${d}/${m}/${y}`;
}

function formatCompetenciaLabel(comp?: string | null): string {
  if (!comp) return "";
  const [y, m] = comp.split("-");
  if (!y || !m) return comp;
  return `${m}/${y}`;
}

export default function AprovacoesParceiros() {
  const { user } = useAuth();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"pendente" | "aprovado" | "rejeitado" | "todos">("pendente");
  const [filtroParceiroId, setFiltroParceiroId] = useState<string>("todos");
  const [selectedLancamento, setSelectedLancamento] = useState<any>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [cancelarLancamento, setCancelarLancamento] = useState<any>(null);
  const [comentarioCancelar, setComentarioCancelar] = useState("");
  const [foraCicloLancamento, setForaCicloLancamento] = useState<any>(null);
  const [foraCicloComentario, setForaCicloComentario] = useState("");
  const [competencia, setCompetencia] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const utils = trpc.useUtils();
  const { data: lancamentos, isLoading, refetch } = trpc.parceiros.lancamentos.list.useQuery(
    {
      companyId: companyId ?? 0,
      // status NÃO é enviado: queremos a lista completa do ciclo para alimentar
      // os 4 cards (Pendentes/Aprovados/Rejeitados/Valor Pendente). O filtro
      // de status é aplicado em memória abaixo, mantendo os contadores corretos.
      parceiroId: filtroParceiroId !== "todos" ? parseInt(filtroParceiroId) : undefined,
      competencia: competencia || undefined,
    },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const invalidarTudo = () => {
    utils.parceiros.lancamentos.list.invalidate();
    utils.parceiros.painel.invalidate();
  };

  const { data: parceirosData } = trpc.parceiros.cadastro.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  // === Seletor visual de competência (Ano + 12 meses coloridos) ===
  const compAno = useMemo(() => {
    const [y] = (competencia || "").split("-");
    return Number(y) || new Date().getFullYear();
  }, [competencia]);
  const compMes = useMemo(() => {
    const [, m] = (competencia || "").split("-");
    return Number(m) || new Date().getMonth() + 1;
  }, [competencia]);
  const anoIni = `${compAno - 1}-12-16`;
  const anoFim = `${compAno}-12-15`;
  const { data: lancamentosAno = [] } = trpc.parceiros.lancamentos.list.useQuery(
    {
      companyId: companyId ?? 0,
      dataInicio: anoIni,
      dataFim: anoFim,
      parceiroId: filtroParceiroId !== "todos" ? parseInt(filtroParceiroId) : undefined,
    },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );
  const resumoPorMes = useMemo(() => {
    const mapa = new Map<number, { qtd: number; total: number; pend: number; aprov: number; rej: number }>();
    for (const l of lancamentosAno as any[]) {
      const iso = String(l.dataCompra || "").slice(0, 10);
      if (!iso) continue;
      const [yS, mS, dS] = iso.split("-");
      let y = Number(yS); let m = Number(mS); const d = Number(dS);
      if (d >= 16) { m += 1; if (m > 12) { m = 1; y += 1; } }
      if (y !== compAno) continue;
      const cur = mapa.get(m) || { qtd: 0, total: 0, pend: 0, aprov: 0, rej: 0 };
      cur.qtd += 1;
      cur.total += parseFloat(l.valor || "0");
      if (l.status === "pendente") cur.pend += 1;
      else if (l.status === "aprovado") cur.aprov += 1;
      else if (l.status === "rejeitado") cur.rej += 1;
      mapa.set(m, cur);
    }
    return mapa;
  }, [lancamentosAno, compAno]);

  // Janela do ciclo (cycleStart..cycleEnd) e dia de corte da empresa
  // calculados pelo backend — mesma fonte de verdade do filtro de listagem.
  const { data: cicloInfo, isLoading: cicloInfoLoading } = trpc.parceiros.lancamentos.cicloInfo.useQuery(
    { companyId: companyId ?? 0, competencia },
    { enabled: companyId > 0 && !!competencia }
  );

  // Quando a competência está definida mas a janela do ciclo ainda não chegou,
  // desabilita o botão "Aprovar" para garantir que o aviso de fora-do-ciclo
  // seja sempre apresentado antes da aprovação.
  const aprovarBloqueadoPorCiclo = !!competencia && companyId > 0 && cicloInfoLoading;

  const aprovarMutation = trpc.parceiros.lancamentos.aprovar.useMutation({
    onSuccess: () => {
      toast.success("Lançamento processado com sucesso");
      invalidarTudo();
      setSelectedLancamento(null);
      setMotivoRejeicao("");
      setForaCicloLancamento(null);
      setForaCicloComentario("");
    },
    onError: () => toast.error("Erro ao processar lançamento"),
  });

  const cancelarMutation = trpc.parceiros.lancamentos.cancelarAprovacao.useMutation({
    onSuccess: () => { toast.success("Status cancelado - lançamento voltou para pendente"); invalidarTudo(); setCancelarLancamento(null); setComentarioCancelar(""); },
    onError: () => toast.error("Erro ao cancelar status"),
  });

  const parceiros = parceirosData || [];

  const lancamentosFiltrados = useMemo(() => {
    if (!lancamentos) return [];
    let filtered = lancamentos as any[];
    if (filtroStatus !== "todos") {
      filtered = filtered.filter((l: any) => l.status === filtroStatus);
    }
    if (search) {
      filtered = filtered.filter((l: any) =>
        l.employeeNome?.toLowerCase().includes(search.toLowerCase()) ||
        l.descricaoItens?.toLowerCase().includes(search.toLowerCase())
      );
    }
    return filtered;
  }, [lancamentos, search, filtroStatus]);

  const getParceiroNome = (parceiroId: number) => {
    const p = parceiros.find((p: any) => p.id === parceiroId);
    return p?.nomeFantasia || p?.razaoSocial || `Parceiro #${parceiroId}`;
  };

  const totalPendentes = lancamentos ? (lancamentos as any[]).filter((l: any) => l.status === "pendente").length : 0;
  const totalAprovados = lancamentos ? (lancamentos as any[]).filter((l: any) => l.status === "aprovado").length : 0;
  const totalRejeitados = lancamentos ? (lancamentos as any[]).filter((l: any) => l.status === "rejeitado").length : 0;
  const valorTotalPendente = lancamentos
    ? (lancamentos as any[]).filter((l: any) => l.status === "pendente").reduce((sum: number, l: any) => sum + parseFloat(l.valor || "0"), 0)
    : 0;

  const handleAprovar = (id: number, comentario?: string) => {
    aprovarMutation.mutate({
      id,
      aprovado: true,
      comentarioAdmin: comentario || undefined,
      competenciaSelecionada: competencia || undefined,
    });
  };

  // Verifica se a dataCompra do lançamento pertence ao ciclo (cycleStart..cycleEnd)
  // calculado pelo backend para a competência selecionada (usando o
  // `ponto_dia_corte` configurado na empresa). Se estiver fora, abre diálogo
  // de confirmação. Caso `cicloInfo` ainda não esteja carregado, aprova direto.
  const tentarAprovar = (lancamento: any) => {
    if (!competencia || !cicloInfo?.cycleStart || !cicloInfo?.cycleEnd) {
      handleAprovar(lancamento.id);
      return;
    }
    if (!dataDentroDoCiclo(lancamento?.dataCompra, cicloInfo.cycleStart, cicloInfo.cycleEnd)) {
      setForaCicloLancamento(lancamento);
      setForaCicloComentario("");
      return;
    }
    handleAprovar(lancamento.id);
  };

  const confirmarAprovarForaCiclo = () => {
    if (!foraCicloLancamento) return;
    const dataStr = foraCicloLancamento.dataCompra
      ? new Date(foraCicloLancamento.dataCompra).toLocaleDateString("pt-BR")
      : "";
    const cycleLabel = cicloInfo?.cycleStart && cicloInfo?.cycleEnd
      ? `${formatIsoBR(cicloInfo.cycleStart)} a ${formatIsoBR(cicloInfo.cycleEnd)}`
      : formatCompetenciaLabel(competencia);
    const baseAviso = `Aprovação fora do ciclo: dataCompra ${dataStr} fora do ciclo ${formatCompetenciaLabel(competencia)} (${cycleLabel}).`;
    const extra = foraCicloComentario.trim();
    const comentario = extra ? `${baseAviso} ${extra}` : baseAviso;
    handleAprovar(foraCicloLancamento.id, comentario);
  };

  const handleRejeitar = (id: number) => {
    if (!motivoRejeicao.trim()) {
      toast.error("Informe o motivo da rejeição");
      return;
    }
    aprovarMutation.mutate({ id, aprovado: false, motivoRejeicao, comentarioAdmin: motivoRejeicao });
  };

  const handleCancelar = () => {
    if (!cancelarLancamento) return;
    cancelarMutation.mutate({
      id: cancelarLancamento.id,
      comentario: comentarioCancelar || undefined,
    });
  };

  const formatCurrency = (value: number | string) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <DashboardLayout>
      <div className="w-full max-w-[1400px] mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CheckCircle className="w-7 h-7 text-purple-500" /> Aprovações de Parceiros
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Aprovação de lançamentos de conveniados para desconto em folha</p>
          </div>
          <div className="text-sm text-muted-foreground">
            Competência atual:{" "}
            <span className="font-semibold text-foreground">
              {MESES_ABREV[compMes - 1]}/{compAno}
            </span>
          </div>
        </div>

        {/* Seletor de Competência (Ano + Meses coloridos) */}
        <div className="rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCompetencia(`${compAno - 1}-${String(compMes).padStart(2, "0")}`)}
                className="p-1 rounded hover:bg-muted"
                title="Ano anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-bold text-base flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-purple-500" />
                {compAno}
              </span>
              <button
                type="button"
                onClick={() => setCompetencia(`${compAno + 1}-${String(compMes).padStart(2, "0")}`)}
                className="p-1 rounded hover:bg-muted"
                title="Próximo ano"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <span className="text-xs text-muted-foreground">
              Ciclo da competência selecionada (16/{String(((compMes - 2 + 12) % 12) + 1).padStart(2, "0")} a 15/{String(compMes).padStart(2, "0")}/{compAno})
            </span>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
            {MESES_ABREV.map((nome, i) => {
              const m = i + 1;
              const sel = m === compMes;
              const hoje = new Date();
              const atual = compAno === hoje.getFullYear() && m === hoje.getMonth() + 1;
              const info = resumoPorMes.get(m);
              const temDados = !!info && info.qtd > 0;
              let corClasse = "bg-card text-foreground border-border hover:bg-muted";
              if (sel) {
                corClasse = "bg-purple-500 text-white border-purple-600 ring-2 ring-purple-300";
              } else if (temDados) {
                if (info!.rej > 0) corClasse = "bg-red-50 text-red-700 border-red-300 hover:bg-red-100";
                else if (info!.pend > 0) corClasse = "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100";
                else corClasse = "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100";
              } else if (atual) {
                corClasse = "bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100";
              }
              const tooltip = temDados
                ? `${nome}/${compAno}: ${info!.qtd} lanç. — ${fmtBRL(info!.total)} (✓${info!.aprov} ⏳${info!.pend} ✗${info!.rej})`
                : `Competência ${nome}/${compAno} (sem lançamentos)`;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCompetencia(`${compAno}-${String(m).padStart(2, "0")}`)}
                  className={`relative px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${corClasse}`}
                  title={tooltip}
                >
                  {nome}
                  {temDados && !sel && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center shadow">
                      {info!.qtd}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200 border border-emerald-300"></span>Todos aprovados</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 border border-amber-300"></span>Tem pendente</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 border border-red-300"></span>Tem rejeitado</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500"></span>Selecionado</span>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card border rounded-lg p-4 text-center cursor-pointer hover:border-yellow-300 transition-colors"
            onClick={() => setFiltroStatus("pendente")}>
            <Clock className="w-6 h-6 mx-auto text-yellow-500 mb-2" />
            <div className="text-2xl font-bold text-yellow-600">{totalPendentes}</div>
            <div className="text-xs text-muted-foreground">Pendentes</div>
          </div>
          <div className="bg-card border rounded-lg p-4 text-center cursor-pointer hover:border-green-300 transition-colors"
            onClick={() => setFiltroStatus("aprovado")}>
            <ThumbsUp className="w-6 h-6 mx-auto text-green-500 mb-2" />
            <div className="text-2xl font-bold text-green-600">{totalAprovados}</div>
            <div className="text-xs text-muted-foreground">Aprovados</div>
          </div>
          <div className="bg-card border rounded-lg p-4 text-center cursor-pointer hover:border-red-300 transition-colors"
            onClick={() => setFiltroStatus("rejeitado")}>
            <ThumbsDown className="w-6 h-6 mx-auto text-red-500 mb-2" />
            <div className="text-2xl font-bold text-red-600">{totalRejeitados}</div>
            <div className="text-xs text-muted-foreground">Rejeitados</div>
          </div>
          <div className="bg-card border rounded-lg p-4 text-center">
            <DollarSign className="w-6 h-6 mx-auto text-purple-500 mb-2" />
            <div className="text-xl font-bold text-purple-600">{formatCurrency(valorTotalPendente)}</div>
            <div className="text-xs text-muted-foreground">Valor Pendente</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por colaborador ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={filtroParceiroId} onValueChange={setFiltroParceiroId}>
            <SelectTrigger className="w-[220px]">
              <Store className="w-4 h-4 mr-1" />
              <SelectValue placeholder="Parceiro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Parceiros</SelectItem>
              {parceiros.map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.nomeFantasia || p.razaoSocial}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            {(["pendente", "aprovado", "rejeitado", "todos"] as const).map((s) => (
              <Button key={s} variant={filtroStatus === s ? "default" : "outline"} size="sm"
                onClick={() => setFiltroStatus(s)}
                className={filtroStatus === s ? "bg-purple-600 hover:bg-purple-700" : ""}>
                {s === "pendente" ? "Pendentes" : s === "aprovado" ? "Aprovados" : s === "rejeitado" ? "Rejeitados" : "Todos"}
              </Button>
            ))}
          </div>
        </div>

        {/* Lancamentos List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-3"></div>
            Carregando lançamentos...
          </div>
        ) : lancamentosFiltrados.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum lançamento encontrado</p>
          </div>
        ) : (
          <TooltipProvider delayDuration={150}>
          <div className="space-y-3">
            {lancamentosFiltrados.map((lancamento: any) => {
              const foraDoCiclo = !!cicloInfo?.cycleStart && !!cicloInfo?.cycleEnd
                && !dataDentroDoCiclo(lancamento?.dataCompra, cicloInfo.cycleStart, cicloInfo.cycleEnd);
              const cycleLabel = cicloInfo?.cycleStart && cicloInfo?.cycleEnd
                ? `${formatIsoBR(cicloInfo.cycleStart)} a ${formatIsoBR(cicloInfo.cycleEnd)}`
                : formatCompetenciaLabel(competencia);
              return (
              <div key={lancamento.id}
                data-fora-ciclo={foraDoCiclo ? "true" : undefined}
                className={`bg-card border rounded-lg p-4 transition-all hover:shadow-md ${
                  foraDoCiclo ? "ring-1 ring-amber-300 bg-amber-50/40 " : ""
                }${
                  lancamento.status === "pendente" ? "border-l-4 border-l-yellow-400" :
                  lancamento.status === "aprovado" ? "border-l-4 border-l-green-400" :
                  "border-l-4 border-l-red-400"
                }`}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground text-sm">{lancamento.employeeNome}</h3>
                      <Badge variant={
                        lancamento.status === "pendente" ? "secondary" :
                        lancamento.status === "aprovado" ? "default" : "destructive"
                      } className={`text-xs ${lancamento.status === "aprovado" ? "bg-green-100 text-green-700 border-green-200" : ""}`}>
                        {lancamento.status === "pendente" ? "Pendente" : lancamento.status === "aprovado" ? "Aprovado" : "Rejeitado"}
                      </Badge>
                      {foraDoCiclo && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className="text-xs border-amber-300 bg-amber-100 text-amber-800 flex items-center gap-1 cursor-help"
                              data-testid={`badge-fora-ciclo-${lancamento.id}`}
                            >
                              <AlertTriangle className="w-3 h-3" /> Fora do ciclo
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs">
                              Data da compra ({lancamento.dataCompra ? new Date(lancamento.dataCompra).toLocaleDateString("pt-BR") : ""})
                              {" "}não pertence ao ciclo de {formatCompetenciaLabel(competencia)} ({cycleLabel}).
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <span className="text-lg font-bold text-purple-600">{formatCurrency(lancamento.valor)}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Store className="w-3.5 h-3.5" /> {getParceiroNome(lancamento.parceiroId)}
                      </span>
                      <span className={`flex items-center gap-1 ${foraDoCiclo ? "text-amber-700 font-medium" : ""}`}>
                        <Calendar className="w-3.5 h-3.5" /> {lancamento.dataCompra ? new Date(lancamento.dataCompra).toLocaleDateString("pt-BR") : ""}
                      </span>
                      {lancamento.competenciaDesconto && (
                        <span className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" /> Desc: {lancamento.competenciaDesconto}
                        </span>
                      )}
                    </div>
                    {lancamento.descricaoItens && (
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <ShoppingCart className="w-3.5 h-3.5" /> {lancamento.descricaoItens}
                      </p>
                    )}
                    {lancamento.status === "aprovado" && lancamento.aprovadoPor && (
                      <p className="text-xs text-green-600 mt-1">
                        Aprovado por {lancamento.aprovadoPor} em {lancamento.aprovadoEm ? new Date(lancamento.aprovadoEm).toLocaleDateString("pt-BR") : ""}
                      </p>
                    )}
                    {lancamento.status === "rejeitado" && lancamento.motivoRejeicao && (
                      <p className="text-xs text-red-600 mt-1">
                        Motivo: {lancamento.motivoRejeicao}
                      </p>
                    )}
                    {lancamento.comentarioAdmin && (
                      <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> Comentário: {lancamento.comentarioAdmin}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    {lancamento.comprovanteUrl && (
                      <a href={lancamento.comprovanteUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4 mr-1" /> Comprovante
                        </Button>
                      </a>
                    )}
                    {lancamento.status === "pendente" && (
                      <>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => tentarAprovar(lancamento)}
                          disabled={aprovarMutation.isPending || aprovarBloqueadoPorCiclo}
                          title={aprovarBloqueadoPorCiclo ? "Carregando ciclo da competência..." : undefined}
                        >
                          <ThumbsUp className="w-4 h-4 mr-1" /> Aprovar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { setSelectedLancamento(lancamento); setMotivoRejeicao(""); }}>
                          <ThumbsDown className="w-4 h-4 mr-1" /> Rejeitar
                        </Button>
                      </>
                    )}
                    {(lancamento.status === "aprovado" || lancamento.status === "rejeitado") && (
                      <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50"
                        onClick={() => { setCancelarLancamento(lancamento); setComentarioCancelar(""); }}>
                        <RotateCcw className="w-4 h-4 mr-1" /> Cancelar {lancamento.status === "aprovado" ? "Aprovação" : "Rejeição"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
          </TooltipProvider>
        )}

        {/* Rejeição Dialog */}
        <FullScreenDialog
          open={!!selectedLancamento}
          onClose={() => { setSelectedLancamento(null); setMotivoRejeicao(""); }}
          title="Rejeitar Lançamento"
          subtitle={`${selectedLancamento?.employeeNome || ""} - ${selectedLancamento ? formatCurrency(selectedLancamento.valor) : ""}`}
          icon={<ThumbsDown className="w-5 h-5" />}
          headerColor="bg-gradient-to-r from-red-600 to-red-400"
        >
          {selectedLancamento && (
            <div className="p-4 sm:p-6 space-y-6 max-w-2xl mx-auto">
              <div className="bg-card border rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-foreground">Detalhes do Lançamento</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Colaborador:</span>
                    <p className="font-medium">{selectedLancamento.employeeNome}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Parceiro:</span>
                    <p className="font-medium">{getParceiroNome(selectedLancamento.parceiroId)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor:</span>
                    <p className="font-medium text-purple-600">{formatCurrency(selectedLancamento.valor)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Data da Compra:</span>
                    <p className="font-medium">{selectedLancamento.dataCompra ? new Date(selectedLancamento.dataCompra).toLocaleDateString("pt-BR") : ""}</p>
                  </div>
                </div>
                {selectedLancamento.descricaoItens && (
                  <div>
                    <span className="text-sm text-muted-foreground">Descrição:</span>
                    <p className="text-sm">{selectedLancamento.descricaoItens}</p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Motivo da Rejeição / Comentário para o Fornecedor *</label>
                <Textarea
                  value={motivoRejeicao}
                  onChange={(e) => setMotivoRejeicao(e.target.value)}
                  placeholder="Informe o motivo da rejeição. Este comentário será visível para o parceiro..."
                  rows={4}
                />
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => { setSelectedLancamento(null); setMotivoRejeicao(""); }}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={() => handleRejeitar(selectedLancamento.id)} disabled={aprovarMutation.isPending}>
                  <ThumbsDown className="w-4 h-4 mr-1" /> {aprovarMutation.isPending ? "Processando..." : "Confirmar Rejeição"}
                </Button>
              </div>
            </div>
          )}
        </FullScreenDialog>

        {/* Aviso de aprovação fora do ciclo */}
        <Dialog open={!!foraCicloLancamento} onOpenChange={(o) => { if (!o) { setForaCicloLancamento(null); setForaCicloComentario(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
                Lançamento fora do ciclo selecionado
              </DialogTitle>
              <DialogDescription>
                A data da compra deste lançamento não pertence ao mesmo ciclo da competência selecionada.
              </DialogDescription>
            </DialogHeader>
            {foraCicloLancamento && (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm space-y-1">
                  <p><strong>Colaborador:</strong> {foraCicloLancamento.employeeNome}</p>
                  <p><strong>Valor:</strong> {formatCurrency(foraCicloLancamento.valor)}</p>
                  <p>
                    <strong>Data da Compra:</strong>{" "}
                    {foraCicloLancamento.dataCompra ? new Date(foraCicloLancamento.dataCompra).toLocaleDateString("pt-BR") : ""}
                  </p>
                  <p>
                    <strong>Ciclo selecionado:</strong> {formatCompetenciaLabel(competencia)}
                    {cicloInfo?.cycleStart && cicloInfo?.cycleEnd && (
                      <> ({formatIsoBR(cicloInfo.cycleStart)} a {formatIsoBR(cicloInfo.cycleEnd)})</>
                    )}
                  </p>
                  {cicloInfo?.diaCorte != null && (
                    <p className="text-xs text-amber-700">
                      Dia de corte da empresa: {cicloInfo.diaCorte}
                    </p>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Verifique se a data da compra foi digitada corretamente. Você pode confirmar a aprovação mesmo assim — o motivo será registrado no comentário do administrador.
                </p>
                <div>
                  <label className="text-sm font-medium mb-1 block">Comentário adicional (opcional)</label>
                  <Textarea
                    value={foraCicloComentario}
                    onChange={(e) => setForaCicloComentario(e.target.value)}
                    placeholder="Ex.: Aprovado a pedido do gestor para incluir nesta competência."
                    rows={3}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setForaCicloLancamento(null); setForaCicloComentario(""); }}>
                Cancelar
              </Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={aprovarMutation.isPending}
                onClick={confirmarAprovarForaCiclo}
              >
                <ThumbsUp className="w-4 h-4 mr-1" />
                {aprovarMutation.isPending ? "Processando..." : "Aprovar mesmo assim"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancelar Aprovação/Rejeição Dialog */}
        <Dialog open={!!cancelarLancamento} onOpenChange={(o) => { if (!o) { setCancelarLancamento(null); setComentarioCancelar(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-orange-500" />
                Cancelar {cancelarLancamento?.status === "aprovado" ? "Aprovação" : "Rejeição"}
              </DialogTitle>
            </DialogHeader>
            {cancelarLancamento && (
              <div className="space-y-4">
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-sm text-orange-800">
                    O lançamento de <strong>{cancelarLancamento.employeeNome}</strong> no valor de <strong>{formatCurrency(cancelarLancamento.valor)}</strong> será
                    retornado para o status <strong>Pendente</strong>.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Comentário para o Fornecedor (opcional)</label>
                  <Textarea
                    value={comentarioCancelar}
                    onChange={(e) => setComentarioCancelar(e.target.value)}
                    placeholder="Informe o motivo do cancelamento. Este comentário será visível para o parceiro..."
                    rows={3}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCancelarLancamento(null); setComentarioCancelar(""); }}>Voltar</Button>
              <Button className="bg-orange-600 hover:bg-orange-700 text-white" disabled={cancelarMutation.isPending} onClick={handleCancelar}>
                <RotateCcw className="w-4 h-4 mr-1" /> {cancelarMutation.isPending ? "Processando..." : "Confirmar Cancelamento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
