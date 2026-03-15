import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ClipboardList, FileText, ShoppingCart, AlertTriangle,
  CheckCircle, Clock, TrendingUp, ArrowRight, RefreshCw, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

  const { data, isLoading, refetch, isFetching } = trpc.compras.getDashboardCompras.useQuery(
    { companyIds },
    { enabled: companyIds.length > 0, refetchInterval: 60_000 }
  );

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
  } = data ?? {};

  return (
    <DashboardLayout>
      <div className="p-5 space-y-5 min-h-screen bg-gray-50">

        {/* Header */}
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

        {/* KPI Cards — todos clicáveis */}
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
                          <td className="py-2 pr-3 font-mono text-gray-700">{sc.numero || sc.numeroSc}</td>
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
                          <td className="py-2 pr-3 font-mono text-gray-700">{cot.numeroCotacao}</td>
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
                          <td className="py-2 pr-3 font-mono text-gray-700">{oc.numeroOc}</td>
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
                        <span className="font-mono text-xs font-semibold text-gray-700">{oc.numeroOc}</span>
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
                          <div className="text-xs font-mono text-gray-600">{sc.numero || sc.numeroSc}</div>
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
      </div>
    </DashboardLayout>
  );
}
