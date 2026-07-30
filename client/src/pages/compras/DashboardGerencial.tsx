/**
 * Rev. 4731 — Dashboard Gerencial de Compras: reformulação completa após auditoria.
 * - CORREÇÃO do cálculo de Perda de Agrupamento: agrupar por insumo_codigo estava
 *   ERRADO (é código de categoria, não de produto — "01.04" cobre 174 produtos).
 *   Agora agrupa só por descrição idêntica + unidade, com trava de sanidade (variação
 *   > 4× = inconsistência de cadastro, fora do cálculo, listada à parte).
 * - Layout enxuto p/ reunião: 4 KPIs + 3 blocos (Perda, Fluxo, Planejamento).
 * - Rastreabilidade total: todo número expande e mostra as SCs/OCs de origem
 *   (nº do documento, data, obra, solicitante) + nota "Fonte & método" por bloco.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import DashboardLayout from "@/components/DashboardLayout";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";
import {
  ClipboardList, ShoppingCart, AlertTriangle, Clock,
  RefreshCw, Users, TrendingDown, ChevronDown, ChevronRight, Info,
} from "lucide-react";

const BRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

const fmtDias = (v: number | null | undefined) => {
  if (v == null) return "—";
  if (v < 1) return `${Math.round(v * 24)}h`;
  return `${v.toFixed(1).replace(".", ",")} dias`;
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
        {sub && <p className="text-[10px] text-gray-400 leading-tight">{sub}</p>}
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5 ${className}`}>{children}</div>;
}

/** Nota "Fonte & método" — rastreabilidade metodológica de cada bloco */
function FonteNote({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1 text-[11px] text-blue-600 font-medium">
        <Info className="w-3.5 h-3.5" /> Fonte &amp; método {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-2 text-[11px] leading-relaxed text-gray-600 bg-blue-50/60 border border-blue-100 rounded-lg p-3">
          {children}
        </div>
      )}
    </div>
  );
}

export default function DashboardGerencialCompras() {
  const { getCompanyIds } = useCompany();
  const companyIds = getCompanyIds();
  const hoje = new Date();
  const [gerAno, setGerAno] = useState(hoje.getFullYear());
  const [gerMes, setGerMes] = useState<number | null>(hoje.getMonth() + 1);
  const [gerObraId, setGerObraId] = useState<number | null>(null);
  const [janela, setJanela] = useState(15);
  const [insumoAberto, setInsumoAberto] = useState<string | null>(null);
  const [solAberto, setSolAberto] = useState<string | null>(null);
  const [casosAbertos, setCasosAbertos] = useState(false);
  const [inconsAberto, setInconsAberto] = useState(false);

  const { data: gerData } = trpc.compras.getDashboardGerencial.useQuery(
    { companyIds, ano: gerAno, mes: gerMes, obraId: gerObraId, solicitante: null, janelaAgrupamento: janela },
    { enabled: companyIds.length > 0 }
  );

  return (
    <DashboardLayout>
      <div className="p-5 min-h-screen bg-gray-50">
        <div className="max-w-[1300px] mx-auto space-y-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dashboard Gerencial de Compras</h1>
            <p className="text-sm text-gray-500">Visão executiva: volume, perda de poder de compra, tempo do fluxo e planejamento — todo número é rastreável até a SC/OC de origem</p>
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
            const pa: any = g.perdaAgrupamento;
            const lt: any = g.leadTime;
            const plan: any[] = g.planejamento as any[];

            return (
              <>
                {/* ── KPIs ── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard icon={ClipboardList} label="Solicitações (SCs)" value={g.kpis.scs}
                    sub={`vs ${g.kpis.prev.scs} no período anterior`} color="bg-amber-500" />
                  <KpiCard icon={AlertTriangle} label="Urgentes" value={g.kpis.scsUrgentes}
                    sub={g.kpis.scs ? `${((g.kpis.scsUrgentes / g.kpis.scs) * 100).toFixed(0)}% do total` : "—"} color="bg-red-500" />
                  <KpiCard icon={ShoppingCart} label="OCs emitidas" value={g.kpis.ocs}
                    sub={BRL(g.kpis.valorOcs)} color="bg-emerald-600" />
                  <KpiCard icon={TrendingDown} label="Perda por compra picada" value={BRL(pa.totalPerda)}
                    sub={`${pa.grupos} grupos · ${pa.comprasEnvolvidas} OCs · janela ${pa.janelaDias}d`} color="bg-rose-600" />
                </div>

                {/* ── Bloco 1: Perda de Oportunidade de Agrupamento ── */}
                <Card>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-5 h-5 text-rose-600" />
                      <h3 className="font-semibold text-gray-800">Perda de Oportunidade de Agrupamento</h3>
                      <span className="text-rose-600 font-bold">{BRL(pa.totalPerda)}</span>
                    </div>
                    <label className="text-xs text-gray-500 flex items-center gap-2">
                      Janela:
                      <select value={janela} onChange={e => setJanela(Number(e.target.value))}
                        className="border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700">
                        <option value={7}>7 dias</option>
                        <option value={15}>15 dias</option>
                        <option value={30}>30 dias</option>
                      </select>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Mesmo produto (descrição idêntica + mesma unidade) comprado em 2+ OCs dentro de {pa.janelaDias} dias = compra picada.
                    Perda = quanto se pagou acima do <b>melhor preço obtido no próprio grupo</b>.
                  </p>
                  <FonteNote>
                    <b>Fonte:</b> itens das Ordens de Compra (Compras → OCs) ativas do período, excluídas canceladas e locações.<br />
                    <b>Agrupamento:</b> descrição normalizada (sem acento/caixa) + unidade — <b>nunca</b> pelo código de insumo, que é código de categoria e misturava produtos diferentes.<br />
                    <b>Fórmula:</b> perda = Σ (preço pago − melhor preço unitário do grupo) × quantidade.<br />
                    <b>Trava de sanidade:</b> grupos com variação de preço &gt; 4× são tratados como inconsistência de cadastro e ficam <b>fora</b> do total (lista abaixo).
                    Cada linha expande e mostra as OCs de origem para conferência.
                  </FonteNote>

                  <div className="mt-3 divide-y divide-gray-100">
                    {pa.porInsumo.length === 0 && <div className="py-6 text-center text-gray-400 text-sm">Nenhuma compra picada detectada no período.</div>}
                    {pa.porInsumo.map((ins: any) => {
                      const aberto = insumoAberto === ins.chave;
                      const varPct = ins.precoMin > 0 ? ((ins.precoMax - ins.precoMin) / ins.precoMin) * 100 : 0;
                      return (
                        <div key={ins.chave}>
                          <button onClick={() => setInsumoAberto(aberto ? null : ins.chave)}
                            className="w-full flex items-center gap-2 py-2.5 text-left">
                            {aberto ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                            <span className="text-sm text-gray-800 font-medium flex-1 min-w-0 break-words">{ins.descricao}{ins.unidade ? ` (${ins.unidade})` : ""}</span>
                            <span className="text-[11px] text-gray-400 hidden sm:inline">{ins.compras} OCs</span>
                            <span className="text-[11px] text-gray-500 hidden md:inline">{BRL(ins.precoMin)} → {BRL(ins.precoMax)} <span className="text-amber-600">(+{varPct.toFixed(0)}%)</span></span>
                            <span className="text-sm font-bold text-rose-600 flex-shrink-0">{BRL(ins.perda)}</span>
                          </button>
                          {aberto && (
                            <div className="pb-3 pl-6 overflow-x-auto">
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="text-gray-400 text-left">
                                    <th className="py-1 pr-2 font-medium">Data</th>
                                    <th className="py-1 pr-2 font-medium">OC</th>
                                    <th className="py-1 pr-2 font-medium">SC</th>
                                    <th className="py-1 pr-2 font-medium">Obra</th>
                                    <th className="py-1 pr-2 font-medium">Solicitante</th>
                                    <th className="py-1 pr-2 font-medium text-right">Qtd</th>
                                    <th className="py-1 pr-2 font-medium text-right">Preço pago</th>
                                    <th className="py-1 pr-2 font-medium text-right">Melhor preço</th>
                                    <th className="py-1 font-medium text-right">Perda</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ins.detalhe.map((d: any, i: number) => (
                                    <tr key={i} className="border-t border-gray-50 text-gray-700">
                                      <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(d.data)}</td>
                                      <td className="py-1 pr-2 font-medium whitespace-nowrap">{d.numeroOc ?? `#${d.ordemId}`}</td>
                                      <td className="py-1 pr-2 whitespace-nowrap">{d.numeroSc ?? "—"}</td>
                                      <td className="py-1 pr-2 max-w-[160px] break-words">{d.obraId != null ? ((g.obras.find((o: any) => o.id === d.obraId)?.nome) ?? `#${d.obraId}`) : "—"}</td>
                                      <td className="py-1 pr-2 max-w-[140px] break-words">{d.solicitante}</td>
                                      <td className="py-1 pr-2 text-right">{d.qtd}</td>
                                      <td className="py-1 pr-2 text-right">{BRL(d.preco)}</td>
                                      <td className="py-1 pr-2 text-right text-emerald-700">{BRL(d.melhorPreco)}</td>
                                      <td className={`py-1 text-right font-semibold ${d.perdaItem > 0 ? "text-rose-600" : "text-gray-400"}`}>{d.perdaItem > 0 ? BRL(d.perdaItem) : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {(pa.porObra.length > 0 || pa.porSolicitante.length > 0) && (
                    <div className="grid sm:grid-cols-2 gap-4 mt-4 pt-3 border-t border-gray-100">
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Perda por obra</p>
                        {pa.porObra.slice(0, 6).map((o: any) => (
                          <div key={String(o.obraId)} className="flex justify-between text-xs py-0.5">
                            <span className="text-gray-600 break-words min-w-0 pr-2">{o.obraNome}</span>
                            <span className="font-semibold text-rose-600 whitespace-nowrap">{BRL(o.perda)}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Perda por solicitante</p>
                        {pa.porSolicitante.slice(0, 6).map((s: any) => (
                          <div key={s.nome} className="flex justify-between text-xs py-0.5">
                            <span className="text-gray-600 break-words min-w-0 pr-2">{s.nome}</span>
                            <span className="font-semibold text-rose-600 whitespace-nowrap">{BRL(s.perda)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {pa.inconsistentes?.grupos > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <button onClick={() => setInconsAberto(v => !v)} className="flex items-center gap-1.5 text-xs text-amber-700 font-medium">
                        <AlertTriangle className="w-4 h-4" />
                        {pa.inconsistentes.grupos} grupos com variação &gt; 4× excluídos do cálculo (provável inconsistência de cadastro)
                        {inconsAberto ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </button>
                      {inconsAberto && (
                        <div className="mt-2 space-y-1">
                          {pa.inconsistentes.exemplos.map((e: any, i: number) => (
                            <div key={i} className="text-[11px] text-gray-600 bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-1.5">
                              <b>{e.descricao}</b>{e.unidade ? ` (${e.unidade})` : ""}: {BRL(e.precoMin)} a {BRL(e.precoMax)} — OCs {e.ocs.join(", ")}.
                              Confira se são realmente o mesmo produto ou se o preço foi digitado errado.
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>

                {/* ── Bloco 2: Tempo do fluxo ── */}
                <Card>
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-800">Tempo de Resposta do Fluxo de Compras</h3>
                  </div>
                  <FonteNote>
                    <b>Fonte:</b> datas de criação de SC, Cotação e OC (Compras), pelos documentos criados no período, cancelados excluídos.<br />
                    <b>Mediana</b> = metade dos casos foi respondida nesse tempo ou menos (não distorce com casos extremos).
                    O drill-down lista os 10 casos mais lentos SC→OC com nº dos documentos para auditoria.
                  </FonteNote>
                  <div className="grid sm:grid-cols-3 gap-3 mt-3">
                    {[
                      { t: "Suprimentos responde (SC → Cotação)", s: lt.det.scCot },
                      { t: "Decisão de compra (Cotação → OC)", s: lt.det.cotOc },
                      { t: "Tempo total (SC → OC)", s: lt.det.scOc, destaque: true },
                    ].map((b: any) => (
                      <div key={b.t} className={`rounded-lg border p-3 ${b.destaque ? "border-blue-200 bg-blue-50/50" : "border-gray-100 bg-gray-50/50"}`}>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{b.t}</p>
                        <p className={`text-xl font-bold ${b.destaque ? "text-blue-700" : "text-gray-800"}`}>{fmtDias(b.s.mediana)}</p>
                        <p className="text-[11px] text-gray-500">
                          mediana · {b.s.n} casos · {b.s.pct24h != null ? `${b.s.pct24h.toFixed(0)}% ≤ 24h` : "—"} · {b.s.pct48h != null ? `${b.s.pct48h.toFixed(0)}% ≤ 48h` : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                  {lt.casosLentos?.length > 0 && (
                    <div className="mt-3">
                      <button onClick={() => setCasosAbertos(v => !v)} className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                        {casosAbertos ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        Ver os 10 casos mais lentos (SC → OC)
                      </button>
                      {casosAbertos && (
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-gray-400 text-left">
                                <th className="py-1 pr-2 font-medium">SC</th>
                                <th className="py-1 pr-2 font-medium">Criada em</th>
                                <th className="py-1 pr-2 font-medium">OC</th>
                                <th className="py-1 pr-2 font-medium">Emitida em</th>
                                <th className="py-1 pr-2 font-medium">Obra</th>
                                <th className="py-1 font-medium text-right">Tempo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lt.casosLentos.map((c: any, i: number) => (
                                <tr key={i} className="border-t border-gray-50 text-gray-700">
                                  <td className="py-1 pr-2 font-medium whitespace-nowrap">{c.numeroSc ?? "—"}</td>
                                  <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(c.dataSc)}</td>
                                  <td className="py-1 pr-2 font-medium whitespace-nowrap">{c.numeroOc ?? "—"}</td>
                                  <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(c.dataOc)}</td>
                                  <td className="py-1 pr-2 max-w-[180px] break-words">{c.obraNome ?? "—"}</td>
                                  <td className="py-1 text-right font-semibold text-rose-600 whitespace-nowrap">{fmtDias(c.dias)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </Card>

                {/* ── Bloco 3: Planejamento por solicitante ── */}
                <Card>
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-600" />
                    <h3 className="font-semibold text-gray-800">Planejamento por Solicitante</h3>
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">{plan.length}</span>
                  </div>
                  <FonteNote>
                    <b>Fonte:</b> SCs ativas do período. <b>Antecedência</b> = data de necessidade informada − data do pedido (negativa = pediu para data já vencida).
                    <b> Última hora</b> = necessidade para o mesmo dia ou já vencida. <b>Fora do horário</b> = antes das 7h, depois das 18h ou fim de semana (Brasília).
                    Clique no nome para ver as SCs da pessoa (nº, datas, obra) e conferir uma a uma.
                  </FonteNote>
                  <div className="mt-2 divide-y divide-gray-100">
                    {plan.map((p: any) => {
                      const aberto = solAberto === p.nome;
                      return (
                        <div key={p.nome}>
                          <button onClick={() => setSolAberto(aberto ? null : p.nome)} className="w-full flex items-center gap-2 py-2.5 text-left">
                            {aberto ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                            <span className="text-sm text-gray-800 font-medium flex-1 min-w-0 break-words">{p.nome}</span>
                            <span className="text-[11px] text-gray-500 whitespace-nowrap">{p.total} SCs</span>
                            <span className={`text-[11px] whitespace-nowrap ${p.antecedenciaMedia != null && p.antecedenciaMedia < 2 ? "text-rose-600 font-semibold" : "text-gray-500"}`}>
                              {p.antecedenciaMedia != null ? `${p.antecedenciaMedia.toFixed(1).replace(".", ",")}d antecedência` : "sem data de necessidade"}
                            </span>
                            {p.urgentes > 0 && <span className="text-[11px] text-red-600 font-semibold whitespace-nowrap">{p.urgentes} urg.</span>}
                          </button>
                          {aberto && (
                            <div className="pb-3 pl-6 overflow-x-auto">
                              <p className="text-[11px] text-gray-400 mb-1">
                                {p.comNecessidade} de {p.total} SCs com data de necessidade · {p.pctUltimaHora != null ? `${p.pctUltimaHora.toFixed(0)}% de última hora` : "—"} · {p.foraHorario} fora do horário comercial · últimas {p.scs.length} SCs:
                              </p>
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="text-gray-400 text-left">
                                    <th className="py-1 pr-2 font-medium">SC</th>
                                    <th className="py-1 pr-2 font-medium">Pedido</th>
                                    <th className="py-1 pr-2 font-medium">Necessidade</th>
                                    <th className="py-1 pr-2 font-medium text-right">Antecedência</th>
                                    <th className="py-1 pr-2 font-medium">Obra</th>
                                    <th className="py-1 font-medium">Urgente</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.scs.map((s: any, i: number) => (
                                    <tr key={`${s.numeroSc}|${s.data}|${i}`} className="border-t border-gray-50 text-gray-700">
                                      <td className="py-1 pr-2 font-medium whitespace-nowrap">{s.numeroSc}</td>
                                      <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(s.data)}</td>
                                      <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(s.necessidade)}</td>
                                      <td className={`py-1 pr-2 text-right whitespace-nowrap ${s.antecedencia != null && s.antecedencia <= 0 ? "text-rose-600 font-semibold" : ""}`}>
                                        {s.antecedencia != null ? `${s.antecedencia.toFixed(0)}d` : "—"}
                                      </td>
                                      <td className="py-1 pr-2 max-w-[180px] break-words">{s.obraNome ?? "—"}</td>
                                      <td className="py-1">{s.urgente ? <span className="text-red-600 font-semibold">Sim</span> : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </>
            );
          })()}
        </div>
      </div>
    </DashboardLayout>
  );
}
