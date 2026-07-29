/**
 * Rev. 4727 — Dashboard Gerencial de Compras (página própria no menu lateral).
 * Antes vivia como aba "Gerencial" do Painel de Compras (Rev. 4726).
 * KPIs do período, ritmo diário, rankings (solicitantes/materiais/obras),
 * distribuição por tipo, lead time SC→Cotação→OC e gargalo atual.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import DashboardLayout from "@/components/DashboardLayout";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";
import {
  ClipboardList, FileText, ShoppingCart, AlertTriangle, Clock,
  RefreshCw, Building2, Package, Users, BarChart3,
} from "lucide-react";

const BRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "-";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 shadow-sm text-left w-full">
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

function SectionHeader({ icon: Icon, title, count, color }: {
  icon: any; title: string; count?: number; color: string;
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
    </div>
  );
}

function EmptyRow({ msg }: { msg: string }) {
  return <div className="py-6 text-center text-gray-400 text-sm">{msg}</div>;
}

export default function DashboardGerencialCompras() {
  const { getCompanyIds } = useCompany();
  const companyIds = getCompanyIds();
  const hoje = new Date();
  const [gerAno, setGerAno] = useState(hoje.getFullYear());
  const [gerMes, setGerMes] = useState<number | null>(hoje.getMonth() + 1);
  const [gerObraId, setGerObraId] = useState<number | null>(null);

  const { data: gerData, isFetching: gerFetching } = trpc.compras.getDashboardGerencial.useQuery(
    { companyIds, ano: gerAno, mes: gerMes, obraId: gerObraId },
    { enabled: companyIds.length > 0 }
  );

  return (
    <DashboardLayout>
      <div className="p-5 space-y-5 min-h-screen bg-gray-50">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard Gerencial de Compras</h1>
          <p className="text-sm text-gray-500">Análise para gestão: volume, urgências, quem pede, o que pede e tempo do fluxo</p>
        </div>

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
    </DashboardLayout>
  );
}
