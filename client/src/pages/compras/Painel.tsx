import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ClipboardList, FileText, ShoppingCart, AlertTriangle,
  CheckCircle, Clock, TrendingUp, Users, Package,
  ArrowRight, RefreshCw, Building2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  pendente:      { label: "Pendente",      cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  em_cotacao:    { label: "Em Cotação",    cls: "bg-blue-100 text-blue-800 border-blue-200" },
  aprovada:      { label: "Aprovada",      cls: "bg-green-100 text-green-800 border-green-200" },
  recusada:      { label: "Recusada",      cls: "bg-red-100 text-red-800 border-red-200" },
  concluida:     { label: "Concluída",     cls: "bg-gray-100 text-gray-700 border-gray-200" },
  cancelado:     { label: "Cancelado",     cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const STATUS_COT: Record<string, { label: string; cls: string }> = {
  pendente:      { label: "Pendente",      cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  respondida:    { label: "Respondida",    cls: "bg-blue-100 text-blue-800 border-blue-200" },
  aprovada:      { label: "Aprovada",      cls: "bg-green-100 text-green-800 border-green-200" },
  cancelada:     { label: "Cancelada",     cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const STATUS_OC: Record<string, { label: string; cls: string }> = {
  pendente:      { label: "Pendente",      cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  aprovada:      { label: "Aprovada",      cls: "bg-blue-100 text-blue-800 border-blue-200" },
  enviada:       { label: "Enviada",       cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  entregue:      { label: "Entregue",      cls: "bg-green-100 text-green-800 border-green-200" },
  parcial:       { label: "Parcial",       cls: "bg-orange-100 text-orange-800 border-orange-200" },
  cancelada:     { label: "Cancelada",     cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 shadow-sm">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide leading-tight">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 leading-tight">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count, color, href }: {
  icon: any; title: string; count?: number; color: string; href?: string;
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
      {href && (
        <a href={href} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium">
          Ver todos <ArrowRight className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

function EmptyRow({ msg }: { msg: string }) {
  return (
    <div className="py-6 text-center text-gray-400 text-sm">{msg}</div>
  );
}

export default function PainelCompras() {
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0");

  const { data, isLoading, refetch, isFetching } = trpc.compras.getDashboardCompras.useQuery(
    { companyId },
    { enabled: companyId > 0, refetchInterval: 60_000 }
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

  const { kpis, alertasOC, scsPendentesAprov, cotsPendentes, ocsRecentes, scsRecentes, gastosMensais } = data ?? {
    kpis: {}, alertasOC: [], scsPendentesAprov: [], cotsPendentes: [], ocsRecentes: [], scsRecentes: [], gastosMensais: []
  };

  return (
    <DashboardLayout>
    <div className="p-5 space-y-5 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Painel de Compras</h1>
          <p className="text-sm text-gray-500">Visão geral em tempo real do módulo de Compras</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}
          className="gap-2 text-xs">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard icon={ClipboardList} label="SCs Pendentes" value={kpis.scPendentes ?? 0}
          sub={`${kpis.scAguardandoAprov ?? 0} aguardando aprovação`} color="bg-yellow-500" />
        <KpiCard icon={FileText} label="Cotações Pendentes" value={kpis.cotPendentes ?? 0}
          sub="aguardando resposta" color="bg-blue-500" />
        <KpiCard icon={ShoppingCart} label="OCs em Aberto" value={(kpis.ocPendentes ?? 0) + (kpis.ocAprovadas ?? 0)}
          sub={`${kpis.ocAprovadas ?? 0} aprovadas`} color="bg-indigo-600" />
        <KpiCard icon={TrendingUp} label="Valor Total OCs" value={BRL(kpis.totalValorOCs ?? 0)}
          sub={`${kpis.fornecedoresAtivos ?? 0} fornecedores ativos`} color="bg-emerald-600" />
      </div>

      {/* Main grid: 2/3 + 1/3 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Left column (2/3) */}
        <div className="xl:col-span-2 space-y-5">

          {/* SCs aguardando aprovação */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <SectionHeader icon={ClipboardList} title="SCs Aguardando Aprovação"
              count={scsPendentesAprov.length} color="text-yellow-600" href="/compras/solicitacoes" />
            {scsPendentesAprov.length === 0 ? (
              <EmptyRow msg="Nenhuma SC aguardando aprovação" />
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-left">
                    <th className="pb-2 pr-3 font-medium">Número</th>
                    <th className="pb-2 pr-3 font-medium">Título</th>
                    <th className="pb-2 pr-3 font-medium">Necessidade</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scsPendentesAprov.map((sc: any) => {
                    const st = STATUS_SC[sc.status] ?? { label: sc.status, cls: "bg-gray-100 text-gray-600" };
                    return (
                      <tr key={sc.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-2 pr-3 font-mono text-gray-700">{sc.numero}</td>
                        <td className="py-2 pr-3 text-gray-800 truncate max-w-[200px]">{sc.titulo}</td>
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
              count={cotsPendentes.length} color="text-blue-600" href="/compras/cotacoes" />
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
                      <tr key={cot.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
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
              count={ocsRecentes.length} color="text-indigo-600" href="/compras/ordens" />
            {ocsRecentes.length === 0 ? (
              <EmptyRow msg="Nenhuma ordem de compra" />
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-left">
                    <th className="pb-2 pr-3 font-medium">Número</th>
                    <th className="pb-2 pr-3 font-medium">Fornecedor</th>
                    <th className="pb-2 pr-3 font-medium text-right">Total</th>
                    <th className="pb-2 pr-3 font-medium">Entrega</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ocsRecentes.map((oc: any) => {
                    const st = STATUS_OC[oc.status] ?? { label: oc.status, cls: "bg-gray-100 text-gray-600" };
                    return (
                      <tr key={oc.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-2 pr-3 font-mono text-gray-700">{oc.numeroOc}</td>
                        <td className="py-2 pr-3 text-gray-800 truncate max-w-[160px]">
                          {fornMap[oc.fornecedorId] || "—"}
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

        {/* Right column (1/3) */}
        <div className="space-y-5">

          {/* Alertas de entrega */}
          <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4">
            <SectionHeader icon={AlertTriangle} title="Alertas de Entrega"
              count={alertasOC.length} color="text-red-500" href="/compras/ordens" />
            {alertasOC.length === 0 ? (
              <div className="py-5 text-center">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-1" />
                <p className="text-xs text-gray-400">Todas as entregas em dia</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alertasOC.map((oc: any) => (
                  <div key={oc.id}
                    className={`rounded-lg border px-3 py-2 ${oc.atrasado ? "border-red-200 bg-red-50" : "border-orange-200 bg-orange-50"}`}>
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
                  </div>
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
            <SectionHeader icon={Clock} title="SCs Recentes" color="text-yellow-600" href="/compras/solicitacoes" />
            {scsRecentes.length === 0 ? (
              <EmptyRow msg="Nenhuma SC cadastrada" />
            ) : (
              <div className="space-y-1.5">
                {scsRecentes.map((sc: any) => {
                  const st = STATUS_SC[sc.status] ?? { label: sc.status, cls: "bg-gray-100 text-gray-600" };
                  return (
                    <div key={sc.id} className="flex items-center justify-between gap-2 py-1 border-b border-gray-50">
                      <div className="min-w-0">
                        <div className="text-xs font-mono text-gray-600">{sc.numero}</div>
                        <div className="text-xs text-gray-800 truncate">{sc.titulo}</div>
                      </div>
                      <span className={`border text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${st.cls}`}>{st.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Fornecedores ativos */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Fornecedores</p>
                <p className="text-2xl font-bold text-gray-900 leading-tight">{kpis.fornecedoresAtivos ?? 0}</p>
                <p className="text-xs text-gray-400">ativos cadastrados</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
