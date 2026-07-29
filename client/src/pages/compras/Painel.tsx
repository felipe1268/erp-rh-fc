import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { formatNumeroScDisplay } from "@shared/numeroSc";
import { formatNumeroCotacaoDisplay } from "@shared/numeroCotacao";
import { formatNumeroOcDisplay } from "@shared/numeroOc";
import {
  ClipboardList, FileText, ShoppingCart, AlertTriangle,
  CheckCircle, Clock, TrendingUp, ArrowRight, RefreshCw, Building2,
  Bell, CreditCard, Truck, ShieldAlert, ChevronDown, ChevronUp,
  DollarSign, Package, Users, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";

const BRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "-";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

const fmtMes = (mes: string) => {
  const [y, m] = mes.split("-");
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[parseInt(m) - 1]}/${y.slice(2)}`;
};

const STATUS_SC: Record<string, { label: string; cls: string }> = {
  pendente:   { label: "Pendente",    cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  em_cotacao: { label: "Em Cotação",  cls: "bg-blue-100 text-blue-800 border-blue-200" },
  aprovada:   { label: "Aprovada",    cls: "bg-green-100 text-green-800 border-green-200" },
  recusada:   { label: "Recusada",    cls: "bg-red-100 text-red-800 border-red-200" },
  concluida:  { label: "Concluída",   cls: "bg-gray-100 text-gray-700 border-gray-200" },
  cancelado:  { label: "Cancelado",   cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const STATUS_COT: Record<string, { label: string; cls: string }> = {
  pendente:    { label: "Pendente",   cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  respondida:  { label: "Respondida", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  aprovada:    { label: "Aprovada",   cls: "bg-green-100 text-green-800 border-green-200" },
  cancelada:   { label: "Cancelada",  cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const STATUS_OC: Record<string, { label: string; cls: string }> = {
  pendente:  { label: "Pendente",  cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  aprovada:  { label: "Aprovada",  cls: "bg-blue-100 text-blue-800 border-blue-200" },
  enviada:   { label: "Enviada",   cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  entregue:  { label: "Entregue", cls: "bg-green-100 text-green-800 border-green-200" },
  parcial:   { label: "Parcial",  cls: "bg-orange-100 text-orange-800 border-orange-200" },
  cancelada: { label: "Cancelada",cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

function KpiCard({ icon: Icon, label, value, sub, color, onClick }: {
  icon: any; label: string; value: string | number; sub?: string; color: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 shadow-sm text-left w-full transition-all ${onClick ? "hover:shadow-md hover:border-gray-300 cursor-pointer" : "cursor-default"}`}
    >
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide leading-tight">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 leading-tight">{sub}</p>}
      </div>
      {onClick && <ArrowRight className="w-4 h-4 text-gray-300 ml-auto flex-shrink-0" />}
    </button>
  );
}

function SectionHeader({ icon: Icon, title, count, color, onVerTodos }: {
  icon: any; title: string; count?: number; color: string; onVerTodos?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className={`w-5 h-5 ${color}`} />
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
        {count !== undefined && (
          <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">{count}</span>
        )}
      </div>
      {onVerTodos && (
        <button onClick={onVerTodos} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium transition-colors">
          Ver todos <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function EmptyRow({ msg }: { msg: string }) {
  return <div className="py-6 text-center text-gray-400 text-sm">{msg}</div>;
}

export default function PainelCompras() {
  const { getCompanyIds } = useCompany();
  const companyIds = getCompanyIds();
  const [, navigate] = useLocation();

  const [abaAtiva, setAbaAtiva] = useState<"visao_geral" | "alertas" | "por_obra" | "gerencial">("visao_geral");
  const hoje = new Date();
  const [gerAno, setGerAno] = useState(hoje.getFullYear());
  const [gerMes, setGerMes] = useState<number | null>(hoje.getMonth() + 1);
  const [gerObraId, setGerObraId] = useState<number | null>(null);
  const [alertasExpanded, setAlertasExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading, refetch, isFetching } = trpc.compras.getDashboardCompras.useQuery(
    { companyIds },
    { enabled: companyIds.length > 0, refetchInterval: 60_000 }
  );

  const { data: alertasData } = trpc.compras.getAlertasCompras.useQuery(
    { companyIds },
    { enabled: companyIds.length > 0, refetchInterval: 60_000 }
  );

  const { data: gerData, isFetching: gerFetching } = trpc.compras.getDashboardGerencial.useQuery(
    { companyIds, ano: gerAno, mes: gerMes, obraId: gerObraId },
    { enabled: companyIds.length > 0 && abaAtiva === "gerencial" }
  );

  const { data: obraData } = trpc.compras.getDashboardPorObra.useQuery(
    { companyIds },
    { enabled: companyIds.length > 0, refetchInterval: 60_000 }
  );

  const totalAlertas = useMemo(() => {
    if (!alertasData) return 0;
    return (alertasData.pagamentos.vencidas.length) +
      (alertasData.entregas.atrasadas) +
      (alertasData.cobertura.totalSemCobertura) +
      (alertasData.divergencias.total);
  }, [alertasData]);

  const fornMap = useMemo(() => {
    const m: Record<number, string> = {};
    data?.fornecedores?.forEach((f: any) => { m[f.id] = f.nomeFantasia || f.razaoSocial; });
    return m;
  }, [data]);

  const maxGasto = useMemo(
    () => Math.max(...(data?.gastosMensais?.map((g: any) => g.valor) ?? [1]), 1),
    [data]
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
          <RefreshCw className="w-5 h-5 animate-spin" /> Carregando painel...
        </div>
      </DashboardLayout>
    );
  }

  const {
    kpis = {} as any,
    alertasOC = [],
    scsPendentesAprov = [],
    cotsPendentes = [],
    ocsRecentes = [],
    scsRecentes = [],
    gastosMensais = [],
    ocsAtrasadasPorObra = [],
  } = data ?? {};

  const urgentes = scsPendentesAprov.filter((sc: any) => sc.tipo === "emergencial" || sc.prioridade === "urgente");
  const totalPendAprov = scsPendentesAprov.length;

  return (
    <DashboardLayout>
      <div className="p-5 space-y-5 min-h-screen bg-gray-50">

        {totalPendAprov > 0 && (
          <div
            className={`rounded-xl border-2 p-4 flex items-center gap-4 cursor-pointer transition-all ${
              urgentes.length > 0
                ? "bg-red-50 border-red-300 animate-pulse"
                : "bg-amber-50 border-amber-300"
            }`}
            onClick={() => navigate("/compras/aprovacoes")}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              urgentes.length > 0 ? "bg-red-500" : "bg-amber-500"
            }`}>
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className={`font-bold text-sm ${urgentes.length > 0 ? "text-red-800" : "text-amber-800"}`}>
                  {urgentes.length > 0
                    ? `⚠ ${urgentes.length} Aprovação Urgente${urgentes.length > 1 ? "s" : ""} Pendente${urgentes.length > 1 ? "s" : ""}!`
                    : `${totalPendAprov} Aprovação${totalPendAprov > 1 ? "ões" : ""} Pendente${totalPendAprov > 1 ? "s" : ""}`
                  }
                </h3>
                {urgentes.length > 0 && (
                  <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold animate-bounce">
                    URGENTE
                  </span>
                )}
              </div>
              <p className={`text-xs mt-0.5 ${urgentes.length > 0 ? "text-red-600" : "text-amber-600"}`}>
                {totalPendAprov} solicitação{totalPendAprov > 1 ? "ões" : ""} aguardando aprovação
                {urgentes.length > 0 && ` (${urgentes.length} emergencial${urgentes.length > 1 ? "is" : ""})`}
                {alertasOC.length > 0 && ` · ${alertasOC.length} OC${alertasOC.length > 1 ? "s" : ""} com entrega atrasada`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${
                urgentes.length > 0 ? "bg-red-500 text-white" : "bg-amber-500 text-white"
              }`}>
                Aprovar Agora →
              </span>
            </div>
          </div>
        )}

        {alertasOC.length > 0 && (
          <div
            className="rounded-xl border-2 bg-orange-50 border-orange-300 p-4 flex items-center gap-4 cursor-pointer transition-all hover:bg-orange-100"
            onClick={() => setAbaAtiva("alertas")}
          >
            <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-sm text-orange-800">
                {alertasOC.length} Entrega{alertasOC.length > 1 ? "s" : ""} Atrasada{alertasOC.length > 1 ? "s" : ""}
              </h3>
              <p className="text-xs text-orange-600">Clique para ver detalhes na aba Alertas</p>
            </div>
          </div>
        )}

        {/* Header + Tabs */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Painel de Compras</h1>
            <p className="text-sm text-gray-500">Visão geral em tempo real do módulo de Compras</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1 shadow-sm">
          <button
            onClick={() => setAbaAtiva("visao_geral")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${abaAtiva === "visao_geral" ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> Visão Geral
          </button>
          <button
            onClick={() => setAbaAtiva("alertas")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${abaAtiva === "alertas" ? "bg-red-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <Bell className="w-3.5 h-3.5" /> Alertas
            {totalAlertas > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${abaAtiva === "alertas" ? "bg-white/20 text-white" : "bg-red-100 text-red-700"}`}>
                {totalAlertas}
              </span>
            )}
          </button>
          <button
            onClick={() => setAbaAtiva("por_obra")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${abaAtiva === "por_obra" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <Building2 className="w-3.5 h-3.5" /> Por Obra
          </button>
          <button
            onClick={() => setAbaAtiva("gerencial")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${abaAtiva === "gerencial" ? "bg-emerald-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Gerencial
          </button>
        </div>

        {/* KPI Cards — sempre visíveis */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard
            icon={ClipboardList} label="SCs Pendentes" value={kpis.scPendentes ?? 0}
            sub={`${kpis.scAguardandoAprov ?? 0} aguardando aprovação`}
            color="bg-yellow-500" onClick={() => navigate("/compras/solicitacoes")}
          />
          <KpiCard
            icon={FileText} label="Cotações Pendentes" value={kpis.cotPendentes ?? 0}
            sub="aguardando resposta"
            color="bg-blue-500" onClick={() => navigate("/compras/cotacoes")}
          />
          <KpiCard
            icon={ShoppingCart} label="OCs em Aberto" value={(kpis.ocPendentes ?? 0) + (kpis.ocAprovadas ?? 0)}
            sub={`${kpis.ocAprovadas ?? 0} aprovadas`}
            color="bg-indigo-600" onClick={() => navigate("/compras/ordens")}
          />
          <KpiCard
            icon={TrendingUp} label="Valor Total OCs" value={BRL(kpis.totalValorOCs ?? 0)}
            sub={`${kpis.fornecedoresAtivos ?? 0} fornecedores ativos`}
            color="bg-emerald-600"
          />
        </div>

        {abaAtiva === "visao_geral" && (<>
        {/* Atalhos de navegação rápida */}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => navigate("/compras/solicitacoes")}
            className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:bg-yellow-50 hover:border-yellow-200 transition-all shadow-sm group">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-yellow-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800 group-hover:text-yellow-700">Solicitações</p>
              <p className="text-xs text-gray-400">{kpis.scPendentes ?? 0} pendentes</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-yellow-500 transition-colors" />
          </button>

          <button onClick={() => navigate("/compras/cotacoes")}
            className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:bg-blue-50 hover:border-blue-200 transition-all shadow-sm group">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-700">Cotações</p>
              <p className="text-xs text-gray-400">{kpis.cotPendentes ?? 0} pendentes</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-blue-500 transition-colors" />
          </button>

          <button onClick={() => navigate("/compras/ordens")}
            className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 hover:bg-indigo-50 hover:border-indigo-200 transition-all shadow-sm group">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800 group-hover:text-indigo-700">Ordens de Compra</p>
              <p className="text-xs text-gray-400">{(kpis.ocPendentes ?? 0) + (kpis.ocAprovadas ?? 0)} em aberto</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-indigo-500 transition-colors" />
          </button>
        </div>

        {/* Main grid: 2/3 + 1/3 */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Coluna esquerda (2/3) */}
          <div className="xl:col-span-2 space-y-5">

            {/* SCs aguardando aprovação */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <SectionHeader icon={ClipboardList} title="SCs Aguardando Aprovação"
                count={scsPendentesAprov.length} color="text-yellow-600"
                onVerTodos={() => navigate("/compras/solicitacoes")} />
              {scsPendentesAprov.length === 0 ? (
                <EmptyRow msg="Nenhuma SC aguardando aprovação" />
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500 text-left">
                      <th className="pb-2 pr-3 font-medium">Número</th>
                      <th className="pb-2 pr-3 font-medium">Título / Obra</th>
                      <th className="pb-2 pr-3 font-medium">Necessidade</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scsPendentesAprov.map((sc: any) => {
                      const st = STATUS_SC[sc.status] ?? { label: sc.status, cls: "bg-gray-100 text-gray-600" };
                      return (
                        <tr key={sc.id}
                          className="border-b border-gray-50 hover:bg-yellow-50 transition-colors cursor-pointer"
                          onClick={() => navigate("/compras/solicitacoes")}>
                          <td className="py-2 pr-3 font-mono text-gray-700">{formatNumeroScDisplay(sc.numero || sc.numeroSc)}</td>
                          <td className="py-2 pr-3 max-w-[200px]">
                            <div className="text-gray-800 truncate">{sc.titulo}</div>
                            {sc.obraNome && <div className="text-[10px] text-blue-600 truncate">{sc.obraNome}</div>}
                          </td>
                          <td className="py-2 pr-3 text-gray-500">{fmtDate(sc.dataNecessidade)}</td>
                          <td className="py-2">
                            <span className={`border text-[10px] px-1.5 py-0.5 rounded font-medium ${st.cls}`}>{st.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Cotações pendentes */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <SectionHeader icon={FileText} title="Cotações Pendentes"
                count={cotsPendentes.length} color="text-blue-600"
                onVerTodos={() => navigate("/compras/cotacoes")} />
              {cotsPendentes.length === 0 ? (
                <EmptyRow msg="Nenhuma cotação pendente" />
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500 text-left">
                      <th className="pb-2 pr-3 font-medium">Número</th>
                      <th className="pb-2 pr-3 font-medium">Descrição</th>
                      <th className="pb-2 pr-3 font-medium">Vencimento</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cotsPendentes.map((cot: any) => {
                      const st = STATUS_COT[cot.status] ?? { label: cot.status, cls: "bg-gray-100 text-gray-600" };
                      return (
                        <tr key={cot.id}
                          className="border-b border-gray-50 hover:bg-blue-50 transition-colors cursor-pointer"
                          onClick={() => navigate("/compras/cotacoes")}>
                          <td className="py-2 pr-3 font-mono text-gray-700">{formatNumeroCotacaoDisplay(cot.numeroCotacao)}</td>
                          <td className="py-2 pr-3 text-gray-800 truncate max-w-[200px]">{cot.descricao || cot.titulo || "-"}</td>
                          <td className="py-2 pr-3 text-gray-500">{fmtDate(cot.dataValidade)}</td>
                          <td className="py-2">
                            <span className={`border text-[10px] px-1.5 py-0.5 rounded font-medium ${st.cls}`}>{st.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* OCs recentes */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <SectionHeader icon={ShoppingCart} title="Ordens de Compra Recentes"
                count={ocsRecentes.length} color="text-indigo-600"
                onVerTodos={() => navigate("/compras/ordens")} />
              {ocsRecentes.length === 0 ? (
                <EmptyRow msg="Nenhuma ordem de compra" />
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500 text-left">
                      <th className="pb-2 pr-3 font-medium">Número</th>
                      <th className="pb-2 pr-3 font-medium">Fornecedor / Obra</th>
                      <th className="pb-2 pr-3 font-medium text-right">Total</th>
                      <th className="pb-2 pr-3 font-medium">Entrega</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ocsRecentes.map((oc: any) => {
                      const st = STATUS_OC[oc.status] ?? { label: oc.status, cls: "bg-gray-100 text-gray-600" };
                      return (
                        <tr key={oc.id}
                          className="border-b border-gray-50 hover:bg-indigo-50 transition-colors cursor-pointer"
                          onClick={() => navigate("/compras/ordens")}>
                          <td className="py-2 pr-3 font-mono text-gray-700">{formatNumeroOcDisplay(oc.numeroOc)}</td>
                          <td className="py-2 pr-3 max-w-[140px]">
                            <div className="text-gray-800 truncate">{fornMap[oc.fornecedorId] || "—"}</div>
                            {oc.obraNome && <div className="text-[10px] text-blue-600 truncate">{oc.obraNome}</div>}
                          </td>
                          <td className="py-2 pr-3 text-right font-medium text-gray-700">{BRL(parseFloat(oc.total ?? "0"))}</td>
                          <td className="py-2 pr-3 text-gray-500">{fmtDate(oc.dataEntregaPrevista)}</td>
                          <td className="py-2">
                            <span className={`border text-[10px] px-1.5 py-0.5 rounded font-medium ${st.cls}`}>{st.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

          </div>

          {/* Coluna direita (1/3) */}
          <div className="space-y-5">

            {/* Alertas de entrega */}
            <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4">
              <SectionHeader icon={AlertTriangle} title="Alertas de Entrega"
                count={alertasOC.length} color="text-red-500"
                onVerTodos={() => navigate("/compras/ordens")} />
              {alertasOC.length === 0 ? (
                <div className="py-5 text-center">
                  <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-1" />
                  <p className="text-xs text-gray-400">Todas as entregas em dia</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alertasOC.map((oc: any) => (
                    <button key={oc.id} onClick={() => navigate("/compras/ordens")}
                      className={`w-full rounded-lg border px-3 py-2 text-left hover:opacity-80 transition-opacity ${oc.atrasado ? "border-red-200 bg-red-50" : "border-orange-200 bg-orange-50"}`}>
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-xs font-semibold text-gray-700">{formatNumeroOcDisplay(oc.numeroOc)}</span>
                        <span className={`text-[10px] font-bold ${oc.atrasado ? "text-red-600" : "text-orange-600"}`}>
                          {oc.atrasado ? "ATRASADA" : "HOJE"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-gray-500">{fornMap[oc.fornecedorId] || "Fornecedor"}</span>
                        <span className="text-xs text-gray-600 font-medium">{fmtDate(oc.dataEntregaPrevista)}</span>
                      </div>
                      <div className="text-xs text-gray-500 font-medium">{BRL(parseFloat(oc.total ?? "0"))}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {ocsAtrasadasPorObra.length > 0 && (
              <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4">
                <SectionHeader icon={AlertTriangle} title="OCs Atrasadas por Obra"
                  count={ocsAtrasadasPorObra.reduce((s: number, o: any) => s + o.count, 0)} color="text-red-500"
                  onVerTodos={() => navigate("/compras/ordens")} />
                <div className="space-y-2">
                  {ocsAtrasadasPorObra.map((item: any) => (
                    <div key={item.obraId} className="flex items-center justify-between px-3 py-2 rounded-lg border border-red-100 bg-red-50/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="h-4 w-4 text-red-400 flex-shrink-0" />
                        <span className="text-xs text-gray-700 truncate">{item.obraNome}</span>
                      </div>
                      <span className="text-xs font-bold text-red-600 flex-shrink-0 ml-2">
                        {item.count} OC{item.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gastos mensais */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <SectionHeader icon={TrendingUp} title="Gastos por Mês (OCs)" color="text-emerald-600" />
              {(!gastosMensais || gastosMensais.length === 0) ? (
                <EmptyRow msg="Sem dados de OCs ainda" />
              ) : (
                <div className="space-y-2">
                  {gastosMensais.map((g: any) => (
                    <div key={g.mes}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-gray-600 font-medium">{fmtMes(g.mes)}</span>
                        <span className="text-gray-800 font-semibold">{BRL(g.valor)}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${Math.max((g.valor / maxGasto) * 100, 4)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SCs recentes */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <SectionHeader icon={Clock} title="SCs Recentes" color="text-yellow-600"
                onVerTodos={() => navigate("/compras/solicitacoes")} />
              {scsRecentes.length === 0 ? (
                <EmptyRow msg="Nenhuma SC cadastrada" />
              ) : (
                <div className="space-y-1.5">
                  {scsRecentes.map((sc: any) => {
                    const st = STATUS_SC[sc.status] ?? { label: sc.status, cls: "bg-gray-100 text-gray-600" };
                    return (
                      <button key={sc.id} onClick={() => navigate("/compras/solicitacoes")}
                        className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg w-full hover:bg-gray-50 border-b border-gray-50 transition-colors">
                        <div className="min-w-0 text-left">
                          <div className="text-xs font-mono text-gray-600">{formatNumeroScDisplay(sc.numero || sc.numeroSc)}</div>
                          <div className="text-xs text-gray-800 truncate">{sc.titulo}</div>
                          {sc.obraNome && <div className="text-[10px] text-blue-600 truncate">{sc.obraNome}</div>}
                        </div>
                        <span className={`border text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${st.cls}`}>{st.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Fornecedores ativos */}
            <button onClick={() => navigate("/compras/fornecedores")}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 w-full flex items-center gap-3 hover:bg-teal-50 hover:border-teal-200 transition-all group">
              <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Fornecedores</p>
                <p className="text-2xl font-bold text-gray-900 leading-tight">{kpis.fornecedoresAtivos ?? 0}</p>
                <p className="text-xs text-gray-400">ativos cadastrados</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-teal-500 transition-colors" />
            </button>

          </div>
        </div>
        </>)}

        {abaAtiva === "alertas" && alertasData && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <div className={`rounded-xl border p-4 ${alertasData.pagamentos.vencidas.length > 0 ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className={`w-4 h-4 ${alertasData.pagamentos.vencidas.length > 0 ? "text-red-500" : "text-gray-400"}`} />
                  <span className="text-xs font-medium text-gray-600">Pagamentos Vencidos</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{alertasData.pagamentos.vencidas.length}</p>
                <p className="text-xs text-gray-500">{BRL(alertasData.pagamentos.totalVencido)}</p>
              </div>
              <div className={`rounded-xl border p-4 ${alertasData.pagamentos.proximas.length > 0 ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className={`w-4 h-4 ${alertasData.pagamentos.proximas.length > 0 ? "text-amber-500" : "text-gray-400"}`} />
                  <span className="text-xs font-medium text-gray-600">Vencem em 7 dias</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{alertasData.pagamentos.proximas.length}</p>
                <p className="text-xs text-gray-500">{BRL(alertasData.pagamentos.totalProximo)}</p>
              </div>
              <div className={`rounded-xl border p-4 ${alertasData.entregas.atrasadas > 0 ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Truck className={`w-4 h-4 ${alertasData.entregas.atrasadas > 0 ? "text-red-500" : "text-gray-400"}`} />
                  <span className="text-xs font-medium text-gray-600">Entregas Atrasadas</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{alertasData.entregas.atrasadas}</p>
                <p className="text-xs text-gray-500">{alertasData.entregas.proximas} nos próx. 7 dias</p>
              </div>
              <div className={`rounded-xl border p-4 ${alertasData.divergencias.total > 0 ? "border-orange-200 bg-orange-50" : "border-gray-200 bg-white"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <ShieldAlert className={`w-4 h-4 ${alertasData.divergencias.total > 0 ? "text-orange-500" : "text-gray-400"}`} />
                  <span className="text-xs font-medium text-gray-600">Divergências</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{alertasData.divergencias.total}</p>
                <p className="text-xs text-gray-500">não lidas</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {alertasData.entregas.listaAtrasadas?.length > 0 && (
                <div className="bg-white rounded-xl border border-red-200 shadow-sm p-4">
                  <button className="flex items-center justify-between w-full mb-2"
                    onClick={() => setAlertasExpanded(p => ({ ...p, entregasAtr: !p.entregasAtr }))}>
                    <SectionHeader icon={Truck} title="Entregas Atrasadas" count={alertasData.entregas.atrasadas} color="text-red-500"
                      onVerTodos={() => navigate("/compras/ordens?filtro=atrasadas")} />
                    {alertasExpanded.entregasAtr ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>
                  {(alertasExpanded.entregasAtr !== false) && (
                    <div className="space-y-1.5 max-h-[260px] overflow-auto">
                      {alertasData.entregas.listaAtrasadas.map((oc: any) => (
                        <button key={oc.id} onClick={() => navigate("/compras/ordens")}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs w-full hover:bg-red-100 transition-colors">
                          <div className="text-left min-w-0">
                            <span className="font-mono font-semibold text-gray-800">{formatNumeroOcDisplay(oc.numeroOc)}</span>
                            {oc.fornecedorNome && <span className="text-gray-500 ml-2 truncate">{oc.fornecedorNome}</span>}
                            {oc.obraNome && <span className="text-gray-400 ml-1 truncate hidden sm:inline">· {oc.obraNome}</span>}
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <span className="font-bold text-red-700">{oc.diasAtraso}d atraso</span>
                            <span className="text-gray-400 ml-2">{fmtDate(oc.dataEntregaPrevista)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {alertasData.pagamentos.vencidas.length > 0 && (
                <div className="bg-white rounded-xl border border-red-200 shadow-sm p-4">
                  <button className="flex items-center justify-between w-full mb-2"
                    onClick={() => setAlertasExpanded(p => ({ ...p, pagVencidas: !p.pagVencidas }))}>
                    <SectionHeader icon={CreditCard} title="Pagamentos Vencidos" count={alertasData.pagamentos.vencidas.length} color="text-red-500" />
                    {alertasExpanded.pagVencidas ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>
                  {(alertasExpanded.pagVencidas !== false) && (
                    <div className="space-y-1.5 max-h-[200px] overflow-auto">
                      {alertasData.pagamentos.vencidas.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs">
                          <div>
                            <span className="font-medium text-gray-800">{p.supplierNome || "—"}</span>
                            {p.parcelaTotal > 1 && <span className="text-gray-500 ml-1">({p.parcelaNumero}/{p.parcelaTotal})</span>}
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-red-700">{BRL(p.valorTotal)}</span>
                            <span className="text-gray-500 ml-2">{fmtDate(p.dataVencimento)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {alertasData.pagamentos.proximas.length > 0 && (
                <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-4">
                  <button className="flex items-center justify-between w-full mb-2"
                    onClick={() => setAlertasExpanded(p => ({ ...p, pagProx: !p.pagProx }))}>
                    <SectionHeader icon={Clock} title="Vencem em 7 Dias" count={alertasData.pagamentos.proximas.length} color="text-amber-500" />
                    {alertasExpanded.pagProx ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>
                  {(alertasExpanded.pagProx !== false) && (
                    <div className="space-y-1.5 max-h-[200px] overflow-auto">
                      {alertasData.pagamentos.proximas.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs">
                          <div>
                            <span className="font-medium text-gray-800">{p.supplierNome || "—"}</span>
                            {p.parcelaTotal > 1 && <span className="text-gray-500 ml-1">({p.parcelaNumero}/{p.parcelaTotal})</span>}
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-amber-700">{BRL(p.valorTotal)}</span>
                            <span className="text-gray-500 ml-2">{fmtDate(p.dataVencimento)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {alertasData.cobertura.scsSemCobertura.length > 0 && (
                <div className="bg-white rounded-xl border border-yellow-200 shadow-sm p-4">
                  <SectionHeader icon={AlertTriangle} title="SCs sem Cobertura Orçamentária"
                    count={alertasData.cobertura.totalSemCobertura} color="text-yellow-600"
                    onVerTodos={() => navigate("/compras/solicitacoes")} />
                  <div className="space-y-1.5 max-h-[200px] overflow-auto">
                    {alertasData.cobertura.scsSemCobertura.map((sc: any) => (
                      <button key={sc.scId} onClick={() => navigate("/compras/solicitacoes")}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-100 text-xs w-full hover:bg-yellow-100 transition-colors">
                        <div className="text-left">
                          <span className="font-mono font-medium text-gray-700">{sc.numero}</span>
                          <span className="text-gray-500 ml-2 truncate">{sc.titulo}</span>
                        </div>
                        <span className="text-yellow-700 font-bold flex-shrink-0">{sc.itensCount} {sc.itensCount === 1 ? "item" : "itens"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {alertasData.divergencias.total > 0 && (
                <div className="bg-white rounded-xl border border-orange-200 shadow-sm p-4">
                  <SectionHeader icon={ShieldAlert} title="Divergências Não Lidas"
                    count={alertasData.divergencias.total} color="text-orange-500" />
                  <div className="space-y-1.5 max-h-[200px] overflow-auto">
                    {[...alertasData.divergencias.compras, ...alertasData.divergencias.financeiro].map((notif: any) => (
                      <div key={notif.id} className="px-3 py-2 rounded-lg bg-orange-50 border border-orange-100 text-xs">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-medium text-gray-800">{notif.titulo}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${notif.destinoModulo === "compras" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                            {notif.destinoModulo === "compras" ? "Compras" : "Financeiro"}
                          </span>
                        </div>
                        <p className="text-gray-500 line-clamp-2">{notif.mensagem}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {alertasData.pagamentos.bloqueadas.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <SectionHeader icon={Package} title="Pagamentos Bloqueados (Aguardando Recebimento)"
                  count={alertasData.pagamentos.bloqueadas.length} color="text-gray-500" />
                <p className="text-xs text-gray-500 mb-2">
                  Total bloqueado: <span className="font-bold text-gray-700">{BRL(alertasData.pagamentos.totalBloqueado)}</span>
                </p>
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 max-h-[200px] overflow-auto">
                  {alertasData.pagamentos.bloqueadas.slice(0, 12).map((p: any) => (
                    <div key={p.id} className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                      <span className="font-medium text-gray-800">{p.supplierNome || "—"}</span>
                      <span className="text-gray-700 font-bold ml-2">{BRL(p.valorTotal)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totalAlertas === 0 && (
              <div className="bg-white rounded-xl border border-green-200 shadow-sm p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-600">Nenhum alerta ativo</p>
                <p className="text-xs text-gray-400">Todos os pagamentos, entregas e divergências estão em dia.</p>
              </div>
            )}
          </div>
        )}

        {abaAtiva === "por_obra" && obraData && (
          <div className="space-y-4">
            {obraData.obras.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-600">Nenhuma obra com movimentação de compras</p>
              </div>
            ) : (
              <div className="space-y-4">
                {obraData.obras.map((obra: any) => {
                  const maxMes = Math.max(...(obra.gastosMensais?.map((g: any) => g.valor) ?? [1]), 1);
                  return (
                    <div key={obra.obraId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-white">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-indigo-600" />
                            <h3 className="font-semibold text-gray-800 text-sm">{obra.obraNome}</h3>
                          </div>
                          {obra.ocsAtrasadas > 0 && (
                            <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                              {obra.ocsAtrasadas} OC{obra.ocsAtrasadas > 1 ? "s" : ""} atrasada{obra.ocsAtrasadas > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
                          <div className="text-center p-3 rounded-lg bg-gray-50">
                            <DollarSign className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                            <p className="text-lg font-bold text-gray-900">{BRL(obra.totalGasto)}</p>
                            <p className="text-[10px] text-gray-500 uppercase">Total Gasto</p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-gray-50">
                            <ShoppingCart className="w-4 h-4 text-indigo-500 mx-auto mb-1" />
                            <p className="text-lg font-bold text-gray-900">{obra.totalOCs}</p>
                            <p className="text-[10px] text-gray-500 uppercase">{obra.ocsPendentes} OCs abertas</p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-gray-50">
                            <ClipboardList className="w-4 h-4 text-yellow-500 mx-auto mb-1" />
                            <p className="text-lg font-bold text-gray-900">{obra.totalSCs}</p>
                            <p className="text-[10px] text-gray-500 uppercase">{obra.scsPendentes} SCs pendentes</p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-gray-50">
                            <Users className="w-4 h-4 text-teal-500 mx-auto mb-1" />
                            <p className="text-lg font-bold text-gray-900">{obra.fornecedoresCount}</p>
                            <p className="text-[10px] text-gray-500 uppercase">Fornecedores</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                          {obra.gastosMensais.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Gastos Mensais
                              </p>
                              <div className="space-y-1.5">
                                {obra.gastosMensais.map((g: any) => (
                                  <div key={g.mes}>
                                    <div className="flex items-center justify-between text-xs mb-0.5">
                                      <span className="text-gray-600">{fmtMes(g.mes)}</span>
                                      <span className="text-gray-800 font-semibold">{BRL(g.valor)}</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.max((g.valor / maxMes) * 100, 4)}%` }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                              <CreditCard className="w-3.5 h-3.5 text-blue-500" /> Financeiro
                            </p>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-green-50 border border-green-100 text-xs">
                                <span className="text-gray-600">Total Pago</span>
                                <span className="font-bold text-green-700">{BRL(obra.totalPago)}</span>
                              </div>
                              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-xs">
                                <span className="text-gray-600">A Pagar</span>
                                <span className="font-bold text-blue-700">{BRL(obra.totalAPagar)}</span>
                              </div>
                            </div>
                            {obra.topFornecedores.length > 0 && (
                              <div className="mt-3">
                                <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Principais Fornecedores</p>
                                <div className="flex flex-wrap gap-1">
                                  {obra.topFornecedores.map((f: any) => (
                                    <span key={f.id} className="bg-gray-100 text-gray-700 text-[10px] px-2 py-0.5 rounded-full">{f.nome}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {abaAtiva === "gerencial" && (
          <div className="space-y-5">
            <PeriodSelectorCard
              ano={gerAno} mes={gerMes} onAno={setGerAno} onMes={setGerMes}
              onAnoTodo={() => setGerMes(null)}
              actions={
                <select
                  value={gerObraId ?? ""}
                  onChange={e => setGerObraId(e.target.value ? Number(e.target.value) : null)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 max-w-[220px]"
                >
                  <option value="">Todas as obras</option>
                  {(gerData?.obras ?? []).map((o: any) => (
                    <option key={o.id} value={o.id}>{o.codigo ? `${o.codigo} – ${o.nome}` : o.nome}</option>
                  ))}
                </select>
              }
            />

            {!gerData ? (
              <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" /> Calculando análise gerencial...
              </div>
            ) : (() => {
              const g = gerData;
              const delta = (atual: number, prev: number) => {
                if (prev === 0) return atual > 0 ? "novo" : "—";
                const p = ((atual - prev) / prev) * 100;
                return `${p >= 0 ? "+" : ""}${p.toFixed(0)}% vs período anterior`;
              };
              const maxDia = Math.max(...g.seriePorDia.map(d => d.scs + d.cots + d.ocs), 1);
              const maxSol = Math.max(...g.rankingSolicitantes.map(s => s.total), 1);
              const maxMat = Math.max(...g.rankingMateriais.map(m => m.pedidos), 1);
              const maxObra = Math.max(...g.rankingObras.map(o => o.scs), 1);
              const totalTipo = g.porTipo.reduce((s, t) => s + t.total, 0) || 1;
              const TIPO_LABEL: Record<string, string> = { material: "Material", mdo: "Mão de Obra", pacote: "Pacote", equipamento: "Equipamento", emergencial: "Emergencial", compra: "Compra" };
              const TIPO_COR: Record<string, string> = { material: "bg-blue-500", mdo: "bg-amber-500", pacote: "bg-violet-500", equipamento: "bg-teal-500", emergencial: "bg-red-500", compra: "bg-indigo-500" };
              const fmtLead = (v: number | null) => v === null ? "—" : v < 1 ? `${Math.round(v * 24)}h` : `${v.toFixed(1)} dias`;
              return (<>
                {/* KPIs do período */}
                <div className={`grid grid-cols-2 xl:grid-cols-4 gap-3 ${gerFetching ? "opacity-60" : ""}`}>
                  <KpiCard icon={ClipboardList} label="Solicitações no Período" value={g.kpis.scs}
                    sub={delta(g.kpis.scs, g.kpis.prev.scs)} color="bg-yellow-500" />
                  <KpiCard icon={AlertTriangle} label="Urgentes" value={g.kpis.scsUrgentes}
                    sub={g.kpis.scs > 0 ? `${((g.kpis.scsUrgentes / g.kpis.scs) * 100).toFixed(0)}% do total` : "—"} color="bg-red-500" />
                  <KpiCard icon={FileText} label="Cotações Criadas" value={g.kpis.cotacoes}
                    sub={delta(g.kpis.cotacoes, g.kpis.prev.cotacoes)} color="bg-blue-500" />
                  <KpiCard icon={ShoppingCart} label="OCs Emitidas" value={g.kpis.ocs}
                    sub={`${BRL(g.kpis.valorOcs)} · ${delta(g.kpis.valorOcs, g.kpis.prev.valorOcs)}`} color="bg-emerald-600" />
                </div>

                {/* Lead time + gargalo */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <SectionHeader icon={Clock} title="Tempo Médio do Fluxo" color="text-indigo-600" />
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-3 rounded-lg bg-gray-50">
                        <p className="text-lg font-bold text-gray-900">{fmtLead(g.leadTime.scParaCotacao)}</p>
                        <p className="text-[10px] text-gray-500 uppercase">SC → Cotação</p>
                        <p className="text-[10px] text-gray-400">{g.leadTime.amostraScCot} casos</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-gray-50">
                        <p className="text-lg font-bold text-gray-900">{fmtLead(g.leadTime.cotacaoParaOc)}</p>
                        <p className="text-[10px] text-gray-500 uppercase">Cotação → OC</p>
                        <p className="text-[10px] text-gray-400">{g.leadTime.amostraCotOc} casos</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                        <p className="text-lg font-bold text-indigo-700">{fmtLead(g.leadTime.scParaOc)}</p>
                        <p className="text-[10px] text-indigo-500 uppercase font-semibold">SC → OC (total)</p>
                        <p className="text-[10px] text-indigo-400">{g.leadTime.amostraScOc} casos</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <SectionHeader icon={AlertTriangle} title="Gargalo Atual (hoje)" color="text-amber-600" />
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-3 rounded-lg bg-yellow-50 border border-yellow-100">
                        <p className="text-lg font-bold text-yellow-700">{g.gargalo.scsAguardandoAprov}</p>
                        <p className="text-[10px] text-yellow-600 uppercase">SCs aguardando aprovação</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-blue-50 border border-blue-100">
                        <p className="text-lg font-bold text-blue-700">{g.gargalo.cotacoesAbertas}</p>
                        <p className="text-[10px] text-blue-600 uppercase">Cotações abertas</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                        <p className="text-lg font-bold text-indigo-700">{g.gargalo.ocsAguardandoAprov}</p>
                        <p className="text-[10px] text-indigo-600 uppercase">OCs aguardando aprovação</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ritmo diário */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <SectionHeader icon={BarChart3} title="Ritmo Diário (SCs, Cotações e OCs criadas)" color="text-blue-600" />
                  {g.seriePorDia.length === 0 ? <EmptyRow msg="Sem movimentação no período" /> : (
                    <>
                      <div className="flex items-end gap-[3px] h-32 overflow-x-auto pb-1">
                        {g.seriePorDia.map(d => (
                          <div key={d.dia} className="flex flex-col items-center flex-shrink-0" style={{ width: g.seriePorDia.length > 40 ? 10 : 18 }}
                            title={`${fmtDate(d.dia)}: ${d.scs} SC · ${d.cots} Cot · ${d.ocs} OC`}>
                            <div className="flex flex-col-reverse w-full" style={{ height: `${Math.max(((d.scs + d.cots + d.ocs) / maxDia) * 112, 3)}px` }}>
                              {d.scs > 0 && <div className="w-full bg-yellow-400" style={{ flexGrow: d.scs }} />}
                              {d.cots > 0 && <div className="w-full bg-blue-500" style={{ flexGrow: d.cots }} />}
                              {d.ocs > 0 && <div className="w-full bg-emerald-500" style={{ flexGrow: d.ocs }} />}
                            </div>
                            <span className="text-[8px] text-gray-400 mt-0.5">{d.dia.slice(8, 10)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-500">
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-yellow-400 rounded-sm inline-block" /> Solicitações</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-blue-500 rounded-sm inline-block" /> Cotações</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm inline-block" /> OCs</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {/* Ranking de solicitantes */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <SectionHeader icon={Users} title="Quem Mais Solicita" count={g.rankingSolicitantes.length} color="text-teal-600" />
                    {g.rankingSolicitantes.length === 0 ? <EmptyRow msg="Sem solicitações no período" /> : (
                      <div className="space-y-2">
                        {g.rankingSolicitantes.map((s, i) => (
                          <div key={s.nome}>
                            <div className="flex items-center justify-between text-xs mb-0.5">
                              <span className="text-gray-700 truncate" title={s.nome}>
                                <span className="text-gray-400 font-mono mr-1">{i + 1}.</span>{s.nome}
                              </span>
                              <span className="flex items-center gap-2 flex-shrink-0">
                                {s.urgentes > 0 && <span className="text-red-600 font-semibold">{s.urgentes} urg.</span>}
                                <span className="text-gray-500">{s.diasComPedido} dia{s.diasComPedido > 1 ? "s" : ""}</span>
                                <span className="text-gray-800 font-bold">{s.total} SC{s.total > 1 ? "s" : ""}</span>
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-teal-500 rounded-full" style={{ width: `${Math.max((s.total / maxSol) * 100, 4)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Ranking de materiais */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <SectionHeader icon={Package} title="Materiais Mais Pedidos" count={g.rankingMateriais.length} color="text-violet-600" />
                    {g.rankingMateriais.length === 0 ? <EmptyRow msg="Sem itens no período" /> : (
                      <div className="space-y-2">
                        {g.rankingMateriais.map((m, i) => (
                          <div key={m.descricao}>
                            <div className="flex items-center justify-between text-xs mb-0.5">
                              <span className="text-gray-700 truncate" title={m.descricao}>
                                <span className="text-gray-400 font-mono mr-1">{i + 1}.</span>{m.descricao}
                              </span>
                              <span className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-gray-500">{m.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {m.unidade ?? ""}</span>
                                <span className="text-gray-800 font-bold">{m.pedidos}×</span>
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.max((m.pedidos / maxMat) * 100, 4)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {/* Por tipo */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <SectionHeader icon={ClipboardList} title="Solicitações por Tipo" color="text-blue-600" />
                    {g.porTipo.length === 0 ? <EmptyRow msg="Sem dados" /> : (
                      <>
                        <div className="w-full h-3 rounded-full overflow-hidden flex mb-3">
                          {g.porTipo.map(t => (
                            <div key={t.tipo} className={TIPO_COR[t.tipo] ?? "bg-gray-400"} style={{ width: `${(t.total / totalTipo) * 100}%` }} />
                          ))}
                        </div>
                        <div className="space-y-1.5">
                          {g.porTipo.map(t => (
                            <div key={t.tipo} className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1.5 text-gray-700">
                                <span className={`w-2.5 h-2.5 rounded-sm inline-block ${TIPO_COR[t.tipo] ?? "bg-gray-400"}`} />
                                {TIPO_LABEL[t.tipo] ?? t.tipo}
                              </span>
                              <span className="text-gray-800 font-semibold">{t.total} <span className="text-gray-400 font-normal">({((t.total / totalTipo) * 100).toFixed(0)}%)</span></span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Por obra */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <SectionHeader icon={Building2} title="Demanda por Obra" count={g.rankingObras.length} color="text-indigo-600" />
                    {g.rankingObras.length === 0 ? <EmptyRow msg="Sem dados" /> : (
                      <div className="space-y-2">
                        {g.rankingObras.map((o, i) => (
                          <div key={o.obraId}>
                            <div className="flex items-center justify-between text-xs mb-0.5">
                              <span className="text-gray-700 truncate" title={o.obraNome}>
                                <span className="text-gray-400 font-mono mr-1">{i + 1}.</span>{o.obraNome}
                              </span>
                              <span className="flex items-center gap-2 flex-shrink-0">
                                {o.urgentes > 0 && <span className="text-red-600 font-semibold">{o.urgentes} urg.</span>}
                                <span className="text-gray-500">{BRL(o.valorOcs)}</span>
                                <span className="text-gray-800 font-bold">{o.scs} SC{o.scs !== 1 ? "s" : ""}</span>
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.max((o.scs / maxObra) * 100, 4)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>);
            })()}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
