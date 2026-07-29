/**
 * Rev. 4729 — Dashboard Gerencial de Compras: layout executivo (2 colunas no iPad)
 * + novo indicador "Perda de Oportunidade de Agrupamento" (compras picadas do mesmo
 * insumo em janela curta → perda de poder de compra, precificada pelo melhor preço
 * pago no próprio grupo). Rev. 4727/4728: página própria, tempo de resposta por
 * etapa, quando pedem, índice de planejamento por solicitante.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import DashboardLayout from "@/components/DashboardLayout";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";
import {
  ClipboardList, FileText, ShoppingCart, AlertTriangle, Clock,
  RefreshCw, Building2, Package, Users, BarChart3, TrendingDown,
  ChevronDown, ChevronRight,
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
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 shadow-sm text-left w-full">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide leading-tight">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-gray-400 leading-tight truncate">{sub}</p>}
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

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 ${className}`}>{children}</div>;
}

export default function DashboardGerencialCompras() {
  const { getCompanyIds } = useCompany();
  const companyIds = getCompanyIds();
  const hoje = new Date();
  const [gerAno, setGerAno] = useState(hoje.getFullYear());
  const [gerMes, setGerMes] = useState<number | null>(hoje.getMonth() + 1);
  const [gerObraId, setGerObraId] = useState<number | null>(null);
  const [solicitante, setSolicitante] = useState<string | null>(null);
  const [janela, setJanela] = useState(15);
  const [insumoAberto, setInsumoAberto] = useState<string | null>(null);

  const { data: gerData, isFetching: gerFetching } = trpc.compras.getDashboardGerencial.useQuery(
    { companyIds, ano: gerAno, mes: gerMes, obraId: gerObraId, solicitante, janelaAgrupamento: janela },
    { enabled: companyIds.length > 0 }
  );

  return (
    <DashboardLayout>
      <div className="p-5 min-h-screen bg-gray-50">
        <div className="max-w-[1500px] mx-auto space-y-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dashboard Gerencial de Compras</h1>
            <p className="text-sm text-gray-500">Volume, urgências, planejamento dos pedidos, tempo do fluxo e perda de poder de compra</p>
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
            const pa = g.perdaAgrupamento;
            const fetchCls = gerFetching ? "opacity-60" : "";
            return (<>
              {/* KPIs do período */}
              <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${fetchCls}`}>
                <KpiCard icon={ClipboardList} label="Solicitações no Período" value={g.kpis.scs}
                  sub={delta(g.kpis.scs, g.kpis.prev.scs)} color="bg-yellow-500" />
                <KpiCard icon={AlertTriangle} label="Urgentes" value={g.kpis.scsUrgentes}
                  sub={g.kpis.scs > 0 ? `${((g.kpis.scsUrgentes / g.kpis.scs) * 100).toFixed(0)}% do total` : "—"} color="bg-red-500" />
                <KpiCard icon={ShoppingCart} label="OCs Emitidas" value={g.kpis.ocs}
                  sub={`${BRL(g.kpis.valorOcs)} · ${delta(g.kpis.valorOcs, g.kpis.prev.valorOcs)}`} color="bg-emerald-600" />
                <KpiCard icon={TrendingDown} label="Perda por Compra Picada" value={BRL(pa.totalPerda)}
                  sub={pa.grupos > 0 ? `${pa.grupos} grupos · ${pa.comprasEnvolvidas} compras (janela ${pa.janelaDias}d)` : "nenhuma detectada"} color="bg-rose-600" />
              </div>

              {/* Perda de oportunidade de agrupamento */}
              <Card className={`border-rose-200 ${fetchCls}`}>
                <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-rose-600" />
                    <h3 className="font-semibold text-gray-800 text-sm">Perda de Oportunidade de Agrupamento</h3>
                    <span className="bg-rose-50 text-rose-700 text-xs px-2 py-0.5 rounded-full font-bold">{BRL(pa.totalPerda)}</span>
                  </div>
                  <label className="text-[11px] text-gray-500 flex items-center gap-1.5">
                    Janela:
                    <select value={janela} onChange={e => setJanela(Number(e.target.value))}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700">
                      <option value={7}>7 dias</option>
                      <option value={15}>15 dias</option>
                      <option value={30}>30 dias</option>
                    </select>
                  </label>
                </div>
                <p className="text-[11px] text-gray-500 mb-3">
                  Mesmo insumo comprado em 2+ OCs dentro de {pa.janelaDias} dias = compra picada (perde volume e poder de negociação).
                  Perda = quanto se pagou acima do <b>melhor preço obtido no próprio grupo</b> — valor conservador, já praticado pela empresa.
                </p>
                {pa.porInsumo.length === 0 ? <EmptyRow msg="Nenhuma compra picada detectada no período 🎉" /> : (
                  <>
                    <div className="space-y-1">
                      {pa.porInsumo.map(ins => {
                        const aberto = insumoAberto === ins.chave;
                        const variacao = ins.precoMin > 0 ? ((ins.precoMax - ins.precoMin) / ins.precoMin) * 100 : 0;
                        return (
                          <div key={ins.chave} className="border border-gray-100 rounded-lg">
                            <button type="button"
                              onClick={() => setInsumoAberto(aberto ? null : ins.chave)}
                              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-xs hover:bg-gray-50 rounded-lg">
                              <span className="flex items-center gap-1.5 text-gray-700 min-w-0">
                                {aberto ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                                <span className="truncate text-left" title={ins.descricao}>{ins.descricao}</span>
                              </span>
                              <span className="flex items-center gap-2.5 flex-shrink-0">
                                <span className="text-gray-400">{ins.compras} compras / {ins.grupos} grupo{ins.grupos > 1 ? "s" : ""}</span>
                                {variacao > 0.5 && (
                                  <span className="text-amber-600 font-semibold">{BRL(ins.precoMin)} → {BRL(ins.precoMax)} <span className="text-amber-500">(+{variacao.toFixed(0)}%)</span></span>
                                )}
                                <span className={`font-bold ${ins.perda > 0 ? "text-rose-600" : "text-gray-400"}`}>{ins.perda > 0 ? BRL(ins.perda) : "sem sobrepreço"}</span>
                              </span>
                            </button>
                            {aberto && (
                              <div className="px-2.5 pb-2 overflow-x-auto">
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="text-[9px] text-gray-400 uppercase border-b border-gray-100">
                                      <th className="text-left py-1 pr-2">Data</th>
                                      <th className="text-left py-1 px-2">OC</th>
                                      <th className="text-left py-1 px-2">Obra</th>
                                      <th className="text-left py-1 px-2">Solicitante</th>
                                      <th className="text-right py-1 px-2">Qtd</th>
                                      <th className="text-right py-1 px-2">Preço pago</th>
                                      <th className="text-right py-1 pl-2">Perda</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ins.detalhe.map((d, i) => {
                                      const obraNome = d.obraId != null
                                        ? (g.obras.find((o: any) => o.id === d.obraId)?.nome ?? `#${d.obraId}`) : "—";
                                      return (
                                        <tr key={i} className="border-b border-gray-50">
                                          <td className="py-1 pr-2 text-gray-600 whitespace-nowrap">{fmtDate(d.data)}</td>
                                          <td className="py-1 px-2 text-gray-500 whitespace-nowrap">{d.numeroOc ?? `#${d.ordemId}`}</td>
                                          <td className="py-1 px-2 text-gray-600 truncate max-w-[130px]" title={obraNome}>{obraNome}</td>
                                          <td className="py-1 px-2 text-gray-600 truncate max-w-[130px]" title={d.solicitante}>{d.solicitante}</td>
                                          <td className="py-1 px-2 text-right text-gray-700">{d.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {ins.unidade ?? ""}</td>
                                          <td className={`py-1 px-2 text-right font-semibold ${d.preco > d.melhorPreco ? "text-amber-700" : "text-emerald-600"}`}>{BRL(d.preco)}</td>
                                          <td className="py-1 pl-2 text-right">
                                            {d.perdaItem > 0.005 ? <span className="text-rose-600 font-semibold">{BRL(d.perdaItem)}</span> : <span className="text-emerald-500">melhor preço</span>}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {(pa.porObra.length > 0 || pa.porSolicitante.length > 0) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1.5">Perda por obra</p>
                          <div className="space-y-1">
                            {pa.porObra.map(o => (
                              <div key={String(o.obraId)} className="flex items-center justify-between text-xs">
                                <span className="text-gray-600 truncate" title={o.obraNome}>{o.obraNome}</span>
                                <span className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-gray-400">{o.compras} compras</span>
                                  <span className={`font-semibold ${o.perda > 0 ? "text-rose-600" : "text-gray-400"}`}>{BRL(o.perda)}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1.5">Perda por solicitante</p>
                          <div className="space-y-1">
                            {pa.porSolicitante.map(s => (
                              <div key={s.nome} className="flex items-center justify-between text-xs">
                                <span className="text-gray-600 truncate" title={s.nome}>{s.nome}</span>
                                <span className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-gray-400">{s.compras} compras</span>
                                  <span className={`font-semibold ${s.perda > 0 ? "text-rose-600" : "text-gray-400"}`}>{BRL(s.perda)}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>

              {/* Tempo de resposta por etapa */}
              <Card className={fetchCls}>
                <SectionHeader icon={Clock} title="Tempo de Resposta por Etapa" color="text-indigo-600" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {([
                    { titulo: "Resposta de Suprimentos", sub: "SC → Cotação", s: g.leadTime.det.scCot, destaque: false },
                    { titulo: "Decisão de Compra", sub: "Cotação → OC", s: g.leadTime.det.cotOc, destaque: false },
                    { titulo: "Tempo Total", sub: "SC → OC", s: g.leadTime.det.scOc, destaque: true },
                  ] as const).map(et => (
                    <div key={et.sub} className={`p-3 rounded-lg ${et.destaque ? "bg-indigo-50 border border-indigo-100" : "bg-gray-50"}`}>
                      <p className={`text-[10px] uppercase font-semibold ${et.destaque ? "text-indigo-500" : "text-gray-500"}`}>{et.titulo}</p>
                      <p className={`text-[10px] mb-1 ${et.destaque ? "text-indigo-400" : "text-gray-400"}`}>{et.sub} · {et.s.n} casos</p>
                      <p className={`text-xl font-bold ${et.destaque ? "text-indigo-700" : "text-gray-900"}`}>{fmtLead(et.s.media)}</p>
                      <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
                        <div>
                          <p className="text-xs font-semibold text-gray-700">{fmtLead(et.s.mediana)}</p>
                          <p className="text-[9px] text-gray-400 uppercase">Mediana</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-emerald-600">{et.s.pct24h === null ? "—" : `${et.s.pct24h.toFixed(0)}%`}</p>
                          <p className="text-[9px] text-gray-400 uppercase">≤ 24h</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-emerald-600">{et.s.pct48h === null ? "—" : `${et.s.pct48h.toFixed(0)}%`}</p>
                          <p className="text-[9px] text-gray-400 uppercase">≤ 48h</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-2">Mediana = metade dos casos foi respondida nesse tempo ou menos (não distorce com casos extremos).</p>
              </Card>

              {/* Quando pedem + Gargalo */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card>
                  <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-cyan-600" />
                      <h3 className="font-semibold text-gray-800 text-sm">Quando Pedem (dia × horário)</h3>
                    </div>
                    <select
                      value={solicitante ?? ""}
                      onChange={e => setSolicitante(e.target.value || null)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 max-w-[180px]"
                    >
                      <option value="">Todos os solicitantes</option>
                      {g.rankingSolicitantes.map(s => (
                        <option key={s.nome} value={s.nome}>{s.nome}</option>
                      ))}
                    </select>
                  </div>
                  {(() => {
                    const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                    const maxDow = Math.max(...g.quandoPedem.porDiaSemana, 1);
                    const maxH = Math.max(...g.quandoPedem.porHora, 1);
                    const totalQ = g.quandoPedem.porDiaSemana.reduce((s, v) => s + v, 0);
                    return totalQ === 0 ? <EmptyRow msg="Sem SCs no período (com esse filtro)" /> : (
                      <div className={fetchCls}>
                        <p className="text-[10px] text-gray-400 uppercase mb-1">Por dia da semana</p>
                        <div className="flex items-end gap-1.5 h-16 mb-1">
                          {g.quandoPedem.porDiaSemana.map((v, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center" title={`${dias[i]}: ${v} SCs`}>
                              <span className="text-[9px] text-gray-500">{v > 0 ? v : ""}</span>
                              <div className={`w-full rounded-t ${i === 0 || i === 6 ? "bg-amber-400" : "bg-cyan-500"}`}
                                style={{ height: `${Math.max((v / maxDow) * 44, v > 0 ? 3 : 1)}px` }} />
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-1.5 mb-3">
                          {dias.map(d => <span key={d} className="flex-1 text-center text-[9px] text-gray-400">{d}</span>)}
                        </div>
                        <p className="text-[10px] text-gray-400 uppercase mb-1">Por horário (Brasília)</p>
                        <div className="flex items-end gap-[2px] h-14">
                          {g.quandoPedem.porHora.map((v, i) => (
                            <div key={i} className="flex-1" title={`${i}h: ${v} SCs`}>
                              <div className={`w-full rounded-t ${i < 7 || i >= 18 ? "bg-red-400" : "bg-cyan-500"}`}
                                style={{ height: `${Math.max((v / maxH) * 52, v > 0 ? 3 : 1)}px` }} />
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                          <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1.5">Em vermelho/âmbar: fora do horário comercial (antes das 7h, depois das 18h, fim de semana).</p>
                      </div>
                    );
                  })()}
                </Card>
                <Card>
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
                  <div className="mt-4">
                    <SectionHeader icon={AlertTriangle} title="Quem Mais Pede Urgência" count={g.rankingUrgencia.length} color="text-red-600" />
                    {g.rankingUrgencia.length === 0 ? <EmptyRow msg="Nenhuma SC urgente no período 🎉" /> : (
                      <div className="space-y-1.5">
                        {g.rankingUrgencia.map((u, i) => (
                          <div key={u.nome} className="flex items-center justify-between text-xs">
                            <span className="text-gray-700 truncate" title={u.nome}>
                              <span className="text-gray-400 font-mono mr-1">{i + 1}.</span>{u.nome}
                            </span>
                            <span className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-gray-400">{u.total} SCs</span>
                              <span className="text-red-600 font-bold">{u.urgentes} urg. ({u.pct.toFixed(0)}%)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Índice de planejamento por solicitante */}
              <Card className={fetchCls}>
                <SectionHeader icon={ClipboardList} title="Índice de Planejamento por Solicitante" count={g.planejamento.length} color="text-emerald-600" />
                <p className="text-[11px] text-gray-500 mb-2">
                  Antecedência = data de necessidade informada − data do pedido. "Última hora" = necessidade para o mesmo dia ou já vencida.
                </p>
                {g.planejamento.length === 0 ? <EmptyRow msg="Sem SCs no período" /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] text-gray-400 uppercase border-b border-gray-100">
                          <th className="text-left py-1.5 pr-2">Solicitante</th>
                          <th className="text-right py-1.5 px-2">SCs</th>
                          <th className="text-right py-1.5 px-2">Antecedência média</th>
                          <th className="text-right py-1.5 px-2">Última hora</th>
                          <th className="text-right py-1.5 px-2">Urgentes</th>
                          <th className="text-right py-1.5 pl-2">Fora do horário</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.planejamento.map(p => {
                          const ultAlta = p.pctUltimaHora !== null && p.pctUltimaHora >= 50;
                          return (
                            <tr key={p.nome} className="border-b border-gray-50">
                              <td className="py-1.5 pr-2 text-gray-700 truncate max-w-[180px]" title={p.nome}>{p.nome}</td>
                              <td className="py-1.5 px-2 text-right font-semibold text-gray-800">{p.total}</td>
                              <td className="py-1.5 px-2 text-right">
                                {p.antecedenciaMedia === null ? <span className="text-gray-300">sem data</span> : (
                                  <span className={p.antecedenciaMedia < 1 ? "text-red-600 font-semibold" : p.antecedenciaMedia < 3 ? "text-amber-600" : "text-emerald-600"}>
                                    {p.antecedenciaMedia.toFixed(1)} dias
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 px-2 text-right">
                                {p.pctUltimaHora === null ? <span className="text-gray-300">—</span> : (
                                  <span className={ultAlta ? "text-red-600 font-bold" : "text-gray-700"}>{p.pctUltimaHora.toFixed(0)}%</span>
                                )}
                              </td>
                              <td className="py-1.5 px-2 text-right">
                                {p.urgentes > 0 ? <span className="text-red-600 font-semibold">{p.urgentes}</span> : <span className="text-gray-300">0</span>}
                              </td>
                              <td className="py-1.5 pl-2 text-right">
                                {p.foraHorario > 0 ? <span className="text-amber-600 font-semibold">{p.foraHorario}</span> : <span className="text-gray-300">0</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Ritmo diário */}
              <Card className={fetchCls}>
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
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Ranking de solicitantes */}
                <Card>
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
                </Card>

                {/* Ranking de materiais */}
                <Card>
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
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Por tipo */}
                <Card>
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
                </Card>

                {/* Por obra */}
                <Card>
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
                </Card>
              </div>
            </>);
          })()}
        </div>
      </div>
    </DashboardLayout>
  );
}
