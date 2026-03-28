import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Building2, TrendingUp, DollarSign, AlertTriangle, ShoppingCart,
  FileText, ClipboardList, ChevronRight, Loader2, Search,
  Calendar, Filter, X, Package, ArrowRight,
} from "lucide-react";

const BRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "-";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

const STATUS_OC: Record<string, { label: string; cls: string }> = {
  pendente:   { label: "Pendente",   cls: "bg-yellow-100 text-yellow-800" },
  aprovada:   { label: "Aprovada",   cls: "bg-blue-100 text-blue-800" },
  emitida:    { label: "Emitida",    cls: "bg-indigo-100 text-indigo-800" },
  em_entrega: { label: "Em Entrega", cls: "bg-purple-100 text-purple-800" },
  recebido:   { label: "Recebido",   cls: "bg-green-100 text-green-800" },
  entregue:   { label: "Entregue",   cls: "bg-green-100 text-green-800" },
  parcial:    { label: "Parcial",    cls: "bg-orange-100 text-orange-800" },
  cancelada:  { label: "Cancelada",  cls: "bg-gray-100 text-gray-500" },
};

const STATUS_SC: Record<string, { label: string; cls: string }> = {
  pendente:    { label: "Pendente",    cls: "bg-yellow-100 text-yellow-800" },
  aprovada:    { label: "Aprovada",    cls: "bg-green-100 text-green-800" },
  em_cotacao:  { label: "Em Cotação",  cls: "bg-blue-100 text-blue-800" },
  em_oc:       { label: "Em OC",       cls: "bg-indigo-100 text-indigo-800" },
  recusada:    { label: "Recusada",    cls: "bg-red-100 text-red-800" },
  cancelada:   { label: "Cancelada",   cls: "bg-gray-100 text-gray-500" },
};

const STATUS_COT: Record<string, { label: string; cls: string }> = {
  aberta:     { label: "Aberta",     cls: "bg-yellow-100 text-yellow-800" },
  pendente:   { label: "Pendente",   cls: "bg-yellow-100 text-yellow-800" },
  encerrada:  { label: "Encerrada",  cls: "bg-green-100 text-green-800" },
  cancelada:  { label: "Cancelada",  cls: "bg-gray-100 text-gray-500" },
};

function ProgressBar({ percent, alert }: { percent: number; alert: boolean }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  let barColor = "bg-emerald-500";
  if (clamped >= 90) barColor = alert ? "bg-red-500" : "bg-orange-500";
  else if (clamped >= 70) barColor = "bg-yellow-500";

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">Execução</span>
        <span className={`text-xs font-bold ${clamped >= 90 ? "text-red-600" : "text-gray-700"}`}>
          {clamped.toFixed(1)}%
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status, map }: { status: string; map: Record<string, { label: string; cls: string }> }) {
  const info = map[status] || { label: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${info.cls}`}>
      {info.label}
    </span>
  );
}

function ObraCard({ data, onDrillDown }: { data: any; onDrillDown: () => void }) {
  return (
    <div
      className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer ${
        data.alertaSaldo ? "border-red-300 ring-1 ring-red-100" : "border-gray-200"
      }`}
      onClick={onDrillDown}
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <h3 className="text-sm font-bold text-gray-900 truncate">{data.obra.nome}</h3>
            </div>
            {data.obra.codigo && (
              <p className="text-[10px] text-gray-400 mt-0.5 ml-6">Cód: {data.obra.codigo}</p>
            )}
            {data.obra.cliente && (
              <p className="text-xs text-gray-500 mt-0.5 ml-6 truncate">{data.obra.cliente}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {data.alertaSaldo && (
              <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span className="text-[10px] font-semibold text-red-700">Saldo Baixo</span>
              </div>
            )}
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Orçado (Meta)</p>
            <p className="text-sm font-bold text-gray-900">{BRL(data.totalOrcado)}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-2.5">
            <p className="text-[10px] text-blue-500 uppercase tracking-wide">Comprometido</p>
            <p className="text-sm font-bold text-blue-700">{BRL(data.totalComprado)}</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-2.5">
            <p className="text-[10px] text-amber-500 uppercase tracking-wide">Em Cotação</p>
            <p className="text-sm font-bold text-amber-700">{BRL(data.totalEmCotacao)}</p>
          </div>
          <div className={`rounded-lg p-2.5 ${data.saldoDisponivel < 0 ? "bg-red-50" : "bg-emerald-50"}`}>
            <p className={`text-[10px] uppercase tracking-wide ${data.saldoDisponivel < 0 ? "text-red-500" : "text-emerald-500"}`}>Saldo Disponível</p>
            <p className={`text-sm font-bold ${data.saldoDisponivel < 0 ? "text-red-700" : "text-emerald-700"}`}>{BRL(data.saldoDisponivel)}</p>
          </div>
        </div>

        <ProgressBar percent={data.percentualExecucao} alert={data.alertaSaldo} />

        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
          <div className="flex items-center gap-1">
            <ClipboardList className="h-3 w-3" />
            <span>{data.totalSCs} SCs</span>
          </div>
          <div className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            <span>{data.totalCotacoes} Cotações</span>
          </div>
          <div className="flex items-center gap-1">
            <ShoppingCart className="h-3 w-3" />
            <span>{data.totalOCs} OCs</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DrillDownDialog({ data, open, onClose }: { data: any; open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"scs" | "cotacoes" | "ocs">("scs");

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-500" />
            {data.obra.nome}
            {data.obra.codigo && <span className="text-sm text-gray-400 font-normal">({data.obra.codigo})</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Orçado</p>
            <p className="text-base font-bold text-gray-900">{BRL(data.totalOrcado)}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-blue-500 uppercase tracking-wide">Comprometido</p>
            <p className="text-base font-bold text-blue-700">{BRL(data.totalComprado)}</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-amber-500 uppercase tracking-wide">Em Cotação</p>
            <p className="text-base font-bold text-amber-700">{BRL(data.totalEmCotacao)}</p>
          </div>
          <div className={`rounded-lg p-3 text-center ${data.saldoDisponivel < 0 ? "bg-red-50" : "bg-emerald-50"}`}>
            <p className={`text-[10px] uppercase tracking-wide ${data.saldoDisponivel < 0 ? "text-red-500" : "text-emerald-500"}`}>Saldo</p>
            <p className={`text-base font-bold ${data.saldoDisponivel < 0 ? "text-red-700" : "text-emerald-700"}`}>{BRL(data.saldoDisponivel)}</p>
          </div>
        </div>

        <ProgressBar percent={data.percentualExecucao} alert={data.alertaSaldo} />

        <div className="flex gap-1 mt-4 border-b border-gray-200">
          {(["scs", "cotacoes", "ocs"] as const).map((t) => {
            const labels = { scs: "Solicitações", cotacoes: "Cotações", ocs: "Ordens de Compra" };
            const counts = { scs: data.scs?.length || 0, cotacoes: data.cotacoes?.length || 0, ocs: data.ocs?.length || 0 };
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition ${
                  tab === t ? "border-blue-500 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {labels[t]} ({counts[t]})
              </button>
            );
          })}
        </div>

        <div className="mt-3">
          {tab === "scs" && (
            <div className="space-y-2">
              {(!data.scs || data.scs.length === 0) ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhuma solicitação encontrada</p>
              ) : (
                data.scs.map((sc: any) => (
                  <div key={sc.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-xs font-semibold text-gray-700">SC #{sc.id}</span>
                        <StatusBadge status={sc.status} map={STATUS_SC} />
                        {sc.emergencial && (
                          <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">EMERGENCIAL</span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5 ml-5">
                        {sc.solicitante && <span>{sc.solicitante} · </span>}
                        {fmtDate(sc.data)}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-gray-700">{BRL(sc.valorEstimado)}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "cotacoes" && (
            <div className="space-y-2">
              {(!data.cotacoes || data.cotacoes.length === 0) ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhuma cotação encontrada</p>
              ) : (
                data.cotacoes.map((c: any, i: number) => (
                  <div key={`${c.source}-${c.id}`} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-xs font-semibold text-gray-700">Cotação #{c.id}</span>
                        <StatusBadge status={c.status} map={STATUS_COT} />
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5 ml-5">
                        {c.comprador && <span>{c.comprador} · </span>}
                        {fmtDate(c.data)}
                        {c.validadeAte && <span> · Validade: {fmtDate(c.validadeAte)}</span>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "ocs" && (
            <div className="space-y-2">
              {(!data.ocs || data.ocs.length === 0) ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhuma ordem de compra encontrada</p>
              ) : (
                data.ocs.map((oc: any) => (
                  <div key={`${oc.source}-${oc.id}`} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-xs font-mono font-semibold text-gray-700">{oc.numero}</span>
                        <StatusBadge status={oc.status} map={STATUS_OC} />
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5 ml-5">
                        {oc.fornecedor && <span>{oc.fornecedor} · </span>}
                        {fmtDate(oc.data)}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-gray-700">{BRL(oc.valor)}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DashboardObra() {
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0");

  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [drillDown, setDrillDown] = useState<any>(null);

  const dashQ = trpc.compras.dashboardPorObra.useQuery(
    {
      companyId,
      periodoInicio: periodoInicio || undefined,
      periodoFim: periodoFim || undefined,
      statusFiltro: statusFiltro !== "todos" ? statusFiltro : undefined,
    },
    { enabled: companyId > 0 }
  );

  const filtered = useMemo(() => {
    if (!dashQ.data) return [];
    if (!busca) return dashQ.data;
    const b = busca.toLowerCase();
    return dashQ.data.filter((d: any) =>
      d.obra.nome.toLowerCase().includes(b) ||
      d.obra.codigo?.toLowerCase().includes(b) ||
      d.obra.cliente?.toLowerCase().includes(b)
    );
  }, [dashQ.data, busca]);

  const totals = useMemo(() => {
    if (!filtered.length) return { orcado: 0, comprado: 0, cotacao: 0, saldo: 0 };
    return filtered.reduce(
      (acc: any, d: any) => ({
        orcado: acc.orcado + d.totalOrcado,
        comprado: acc.comprado + d.totalComprado,
        cotacao: acc.cotacao + d.totalEmCotacao,
        saldo: acc.saldo + d.saldoDisponivel,
      }),
      { orcado: 0, comprado: 0, cotacao: 0, saldo: 0 }
    );
  }, [filtered]);

  const alertCount = filtered.filter((d: any) => d.alertaSaldo).length;

  return (
    <DashboardLayout title="Dashboard por Obra">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dashboard de Compras por Obra</h1>
            <p className="text-sm text-gray-500 mt-0.5">Visão consolidada da situação financeira de compras por obra</p>
          </div>
          {alertCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-semibold text-red-700">
                {alertCount} obra{alertCount > 1 ? "s" : ""} com saldo abaixo de 10%
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Orçado</p>
                <p className="text-lg font-bold text-gray-900">{BRL(totals.orcado)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-blue-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] text-blue-500 uppercase tracking-wide">Total Comprometido</p>
                <p className="text-lg font-bold text-blue-700">{BRL(totals.comprado)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <FileText className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-[10px] text-amber-500 uppercase tracking-wide">Em Cotação</p>
                <p className="text-lg font-bold text-amber-700">{BRL(totals.cotacao)}</p>
              </div>
            </div>
          </div>
          <div className={`bg-white rounded-xl border p-4 shadow-sm ${totals.saldo < 0 ? "border-red-200" : "border-emerald-200"}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${totals.saldo < 0 ? "bg-red-100" : "bg-emerald-100"}`}>
                <TrendingUp className={`h-5 w-5 ${totals.saldo < 0 ? "text-red-600" : "text-emerald-600"}`} />
              </div>
              <div>
                <p className={`text-[10px] uppercase tracking-wide ${totals.saldo < 0 ? "text-red-500" : "text-emerald-500"}`}>Saldo Total</p>
                <p className={`text-lg font-bold ${totals.saldo < 0 ? "text-red-700" : "text-emerald-700"}`}>{BRL(totals.saldo)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar obra por nome, código ou cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-8 text-sm border-0 shadow-none focus-visible:ring-0 p-0"
            />
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <Input
              type="date"
              value={periodoInicio}
              onChange={(e) => setPeriodoInicio(e.target.value)}
              className="h-8 text-xs w-36"
              placeholder="Data início"
            />
            <span className="text-xs text-gray-400">até</span>
            <Input
              type="date"
              value={periodoFim}
              onChange={(e) => setPeriodoFim(e.target.value)}
              className="h-8 text-xs w-36"
              placeholder="Data fim"
            />
          </div>

          <Select value={statusFiltro} onValueChange={setStatusFiltro}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as obras</SelectItem>
              <SelectItem value="alerta">Com alerta de saldo</SelectItem>
              <SelectItem value="sem_orcamento">Sem orçamento</SelectItem>
            </SelectContent>
          </Select>

          {(busca || periodoInicio || periodoFim || statusFiltro !== "todos") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setBusca(""); setPeriodoInicio(""); setPeriodoFim(""); setStatusFiltro("todos"); }}
              className="h-8 text-xs text-gray-500"
            >
              <X className="h-3 w-3 mr-1" /> Limpar
            </Button>
          )}
        </div>

        {dashQ.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-3 text-gray-500">Carregando dados das obras...</span>
          </div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Building2 className="h-12 w-12 mb-3" />
            <p className="text-sm font-medium">Nenhuma obra ativa encontrada</p>
            <p className="text-xs mt-1">Cadastre obras e orçamentos para visualizar o dashboard</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((d: any) => (
              <ObraCard
                key={d.obra.id}
                data={d}
                onDrillDown={() => setDrillDown(d)}
              />
            ))}
          </div>
        )}

        <DrillDownDialog
          data={drillDown}
          open={!!drillDown}
          onClose={() => setDrillDown(null)}
        />
      </div>
    </DashboardLayout>
  );
}
