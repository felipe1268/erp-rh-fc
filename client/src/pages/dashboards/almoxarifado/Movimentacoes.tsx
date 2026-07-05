// ============================================================================
// Rev. 4039 — Dashboard Almoxarifado & Equipamentos: página "Movimentações"
// (antes uma aba do arquivo único). Adiciona "top itens por valor
// movimentado" + drill-down clicável em todos os gráficos.
// ============================================================================
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi, type ChartClickInfo } from "@/components/DashChart";
import { ArrowLeftRight, TrendingUp, TrendingDown, Activity, Package, CalendarRange, Building2, DollarSign } from "lucide-react";
import { useAlmoxarifadoData } from "./useAlmoxarifadoData";
import { AlmoxPageHeader, MesesHeaderBar, DeltaCell, DeltaSub, DrillDialog, fmtBRL, fmtNum, fmtDate, fmtDayBR, DIAS_SEMANA_PT } from "./shared";

export default function DashMovimentacoes() {
  const d = useAlmoxarifadoData();
  const { movsQ, obrasMap, movsPeriodoDias, setMovsPeriodoDias, movAgg, periodoMeses, setPeriodoMeses, anosDisponiveis, monthlyAgg, carregando } = d;

  const [drillDia, setDrillDia] = useState<string | null>(null);
  const [drillItensLista, setDrillItensLista] = useState<{ title: string; rows: any[] } | null>(null);

  const movsFiltradas = (movsQ.data || []) as any[];

  const rowsDoDia = drillDia
    ? movAgg.periodoAtual.filter(m => {
        const [dd, mm] = drillDia.split("/");
        const k = new Date(m.criadoEm);
        return String(k.getDate()).padStart(2, "0") === dd && String(k.getMonth() + 1).padStart(2, "0") === mm;
      })
    : [];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AlmoxPageHeader icon={ArrowLeftRight} title="Movimentações — Almoxarifado" subtitle="Entradas, saídas e fluxo de materiais no período." carregando={carregando} />

        <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-white flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 h-9 w-9 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/60 ring-1 ring-blue-200/60 flex items-center justify-center">
                <ArrowLeftRight className="h-4.5 w-4.5 text-blue-700" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 text-[15px] leading-tight">Análise de Movimentações</div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                  Últimos {movAgg.dias} dias · comparado com {movAgg.dias} dias anteriores
                </div>
              </div>
            </div>
            <div className="inline-flex items-center gap-0.5 p-1 rounded-full bg-slate-100/80 ring-1 ring-slate-200/70" role="tablist" aria-label="Período de análise">
              {([7, 30, 90] as const).map(dd => {
                const ativo = movsPeriodoDias === dd;
                return (
                  <button
                    key={dd}
                    type="button"
                    role="tab"
                    aria-selected={ativo}
                    onClick={() => setMovsPeriodoDias(dd)}
                    className={[
                      "shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 whitespace-nowrap",
                      ativo
                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                        : "text-slate-500 hover:text-slate-800 hover:bg-white/60",
                    ].join(" ")}
                  >
                    {dd} dias
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashKpi
            label={`Movimentações (${movAgg.dias}d)`}
            value={fmtNum(movAgg.totalMovs)}
            icon={ArrowLeftRight}
            color="blue"
            sub={(<DeltaSub current={movAgg.totalMovs} previous={movAgg.movsAnt} mediaDia={movAgg.mediaDiaMovs} />) as any}
          />
          <DashKpi
            label="Entradas (qtd)"
            value={fmtNum(movAgg.totalEntradas)}
            icon={TrendingUp}
            color="green"
            sub={(<DeltaSub current={movAgg.totalEntradas} previous={movAgg.entAnt} mediaDia={movAgg.mediaDiaEntradas} />) as any}
          />
          <DashKpi
            label="Saídas (qtd)"
            value={fmtNum(movAgg.totalSaidas)}
            icon={TrendingDown}
            color="red"
            sub={(<DeltaSub current={movAgg.totalSaidas} previous={movAgg.saiAnt} mediaDia={movAgg.mediaDiaSaidas} />) as any}
          />
          <DashKpi
            label="Saldo (qtd)"
            value={fmtNum(movAgg.totalEntradas - movAgg.totalSaidas)}
            icon={Activity}
            color={movAgg.totalEntradas >= movAgg.totalSaidas ? "green" : "red"}
            sub={`${movAgg.totalEntradas >= movAgg.totalSaidas ? "+" : ""}${fmtNum(movAgg.totalEntradas - movAgg.totalSaidas)} unidades líquidas`}
          />
        </div>

        <DashChart
          title={`Entradas vs Saídas por dia (últimos ${movAgg.dias} dias)`}
          type="bar"
          labels={Object.keys(movAgg.porDia).map(fmtDayBR)}
          datasets={[
            { label: "Entradas", data: Object.values(movAgg.porDia).map(dd => dd.entradas), backgroundColor: "#10B981" },
            { label: "Saídas",   data: Object.values(movAgg.porDia).map(dd => dd.saidas),   backgroundColor: "#DC2626" },
          ]}
          height={320}
          onChartClick={(info: ChartClickInfo) => setDrillDia(info.label)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden lg:col-span-2">
            <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600" /> Top 10 itens mais movimentados
            </div>
            <div className="p-3 space-y-2">
              {movAgg.topItens.length === 0 && <div className="p-4 text-center text-sm text-slate-500">Sem itens no período.</div>}
              {movAgg.topItens.map((it, idx) => {
                const maxTotal = movAgg.topItens[0]?.total || 1;
                const pct = (it.total / maxTotal) * 100;
                const pctEnt = it.total > 0 ? (it.entradas / it.total) * 100 : 0;
                return (
                  <div key={`${it.nome}-${idx}`} className="group">
                    <div className="flex items-center justify-between gap-2 text-xs mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 h-5 w-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center">{idx + 1}</span>
                        <span className="font-medium text-slate-800 truncate" title={it.nome}>{it.nome}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 whitespace-nowrap tabular-nums">
                        <span className="text-emerald-600 font-semibold">↑{fmtNum(it.entradas)}</span>
                        {" · "}
                        <span className="text-red-600 font-semibold">↓{fmtNum(it.saidas)}</span>
                        {" = "}
                        <span className="font-bold text-slate-700">{fmtNum(it.total)}</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                      <div className="h-full bg-emerald-500" style={{ width: `${pct * pctEnt / 100}%` }} title={`Entradas: ${fmtNum(it.entradas)}`} />
                      <div className="h-full bg-red-500" style={{ width: `${pct * (100 - pctEnt) / 100}%` }} title={`Saídas: ${fmtNum(it.saidas)}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <DashChart
              title={`Por tipo (${movAgg.dias}d)`}
              type="doughnut"
              labels={movAgg.porTipo.map(t => t.tipo)}
              datasets={[{ data: movAgg.porTipo.map(t => t.count) }]}
              onChartClick={(info: ChartClickInfo) => {
                const rows = movAgg.periodoAtual.filter(m => m.tipo === info.label);
                setDrillItensLista({ title: `Movimentações do tipo "${info.label}"`, rows });
              }}
            />
            <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 text-sm flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-purple-600" /> Por dia da semana
              </div>
              <div className="p-3">
                {(() => {
                  const max = Math.max(1, ...movAgg.porDiaSemana);
                  return (
                    <div className="flex items-end justify-between gap-1.5 h-28">
                      {movAgg.porDiaSemana.map((v, idx) => {
                        const h = (v / max) * 100;
                        const isFimSem = idx === 0 || idx === 6;
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                            <div className="text-[10px] font-semibold text-slate-500 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">{v}</div>
                            <div className="w-full bg-slate-100 rounded-t flex items-end" style={{ height: "70%" }}>
                              <div
                                className={`w-full rounded-t transition-all ${isFimSem ? "bg-slate-300" : "bg-blue-500"}`}
                                style={{ height: `${h}%` }}
                                title={`${DIAS_SEMANA_PT[idx]}: ${fmtNum(v)} movs`}
                              />
                            </div>
                            <div className={`text-[10px] ${isFimSem ? "text-slate-400" : "text-slate-600 font-medium"}`}>{DIAS_SEMANA_PT[idx]}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Rev. 4039 — Top itens por VALOR movimentado */}
        <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-600" /> Top itens por valor movimentado ({movAgg.dias}d)
          </div>
          {movAgg.topItensPorValor.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">Sem itens no período.</div>
          ) : (
            <DashChart
              title=""
              className="border-none shadow-none"
              type="horizontalBar"
              labels={movAgg.topItensPorValor.map(t => t.nome)}
              datasets={[{ label: "R$ movimentado", data: movAgg.topItensPorValor.map(t => Math.round(t.valor)) }]}
              valueFormatter={fmtBRL}
            />
          )}
        </div>

        {movAgg.topObras.length > 0 && (
          <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-emerald-600" /> Obras com mais movimentações (top 8)
            </div>
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
              {movAgg.topObras.map((o, idx) => {
                const maxTotal = movAgg.topObras[0]?.total || 1;
                const pct = (o.total / maxTotal) * 100;
                return (
                  <button key={`${o.nome}-${idx}`} className="text-left" onClick={() => setDrillItensLista({ title: `Movimentações — ${o.nome}`, rows: movAgg.periodoAtual.filter(m => (m.obraNome || (m.obraId ? (obrasMap.get(Number(m.obraId)) || `Obra #${m.obraId}`) : "— sem obra —")) === o.nome) })}>
                    <div className="flex items-center justify-between gap-2 text-xs mb-1">
                      <span className="font-medium text-slate-800 truncate" title={o.nome}>{o.nome}</span>
                      <span className="text-[11px] text-slate-500 whitespace-nowrap tabular-nums font-semibold">{fmtNum(o.total)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500" style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">Últimas 15 movimentações</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left p-2.5">Data</th>
                  <th className="text-left p-2.5">Tipo</th>
                  <th className="text-left p-2.5">Item</th>
                  <th className="text-left p-2.5">Obra</th>
                  <th className="text-left p-2.5">Responsável</th>
                  <th className="text-right p-2.5">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {movsFiltradas.slice(0, 15).map((m: any) => {
                  const isEntrada = String(m.tipo || "").toLowerCase().includes("entrada");
                  const obraNome = m.obraNome || (m.obraId ? (obrasMap.get(Number(m.obraId)) || `#${m.obraId}`) : "—");
                  return (
                    <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="p-2.5 text-slate-600 whitespace-nowrap tabular-nums">{fmtDate(m.criadoEm)}</td>
                      <td className="p-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${isEntrada ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-red-50 text-red-700 ring-1 ring-red-200"}`}>{m.tipo}</span>
                      </td>
                      <td className="p-2.5 text-slate-800 truncate max-w-[200px]" title={m.itemNome}>{m.itemNome || "—"}</td>
                      <td className="p-2.5 text-slate-700 truncate max-w-[180px]" title={obraNome}>{obraNome}</td>
                      <td className="p-2.5 text-slate-600 truncate max-w-[140px]" title={m.usuarioNome || ""}>{m.usuarioNome || "—"}</td>
                      <td className={`p-2.5 text-right font-semibold tabular-nums ${isEntrada ? "text-emerald-700" : "text-red-700"}`}>
                        {isEntrada ? "+" : "−"}{fmtNum(Math.abs(Number(m.quantidade || 0)))}
                      </td>
                    </tr>
                  );
                })}
                {movsFiltradas.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">Sem movimentações.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <MesesHeaderBar titulo="Movimentações mês a mês" periodoMeses={periodoMeses} setPeriodoMeses={setPeriodoMeses} anosDisponiveis={anosDisponiveis} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left p-2.5">Mês</th>
                  <th className="text-right p-2.5">Movs (#)</th>
                  <th className="text-right p-2.5 text-emerald-700">Entradas (qtd)</th>
                  <th className="text-right p-2.5 text-red-700">Saídas (qtd)</th>
                  <th className="text-right p-2.5">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {monthlyAgg.months.map((m, i, arr) => {
                  const pk = arr[i - 1]?.key;
                  const ent = monthlyAgg.movsEntradas[m.key];
                  const sai = monthlyAgg.movsSaidas[m.key];
                  const saldo = ent - sai;
                  const prevEnt = pk ? monthlyAgg.movsEntradas[pk] : undefined;
                  const prevSai = pk ? monthlyAgg.movsSaidas[pk] : undefined;
                  const prevSaldo = pk ? (monthlyAgg.movsEntradas[pk] - monthlyAgg.movsSaidas[pk]) : undefined;
                  const prevCount = pk ? monthlyAgg.movsCount[pk] : undefined;
                  return (
                    <tr key={m.key} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">{m.label}</td>
                      <td className="p-2.5"><DeltaCell value={monthlyAgg.movsCount[m.key]} prev={prevCount} /></td>
                      <td className="p-2.5"><DeltaCell value={ent} prev={prevEnt} accent="text-emerald-700" /></td>
                      <td className="p-2.5"><DeltaCell value={sai} prev={prevSai} accent="text-red-700" /></td>
                      <td className="p-2.5"><DeltaCell value={saldo} prev={prevSaldo} accent={saldo >= 0 ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <DrillDialog
        open={!!drillDia}
        onClose={() => setDrillDia(null)}
        title={`Movimentações do dia ${drillDia || ""}`}
        rows={rowsDoDia}
        columns={[
          { header: "Tipo", render: (m: any) => m.tipo },
          { header: "Item", render: (m: any) => m.itemNome || "—" },
          { header: "Obra", render: (m: any) => m.obraNome || (m.obraId ? (obrasMap.get(Number(m.obraId)) || `#${m.obraId}`) : "—") },
          { header: "Qtd", align: "right", render: (m: any) => fmtNum(Math.abs(Number(m.quantidade || 0))) },
        ]}
      />

      <DrillDialog
        open={!!drillItensLista}
        onClose={() => setDrillItensLista(null)}
        title={drillItensLista?.title || ""}
        rows={drillItensLista?.rows || []}
        searchable
        searchPredicate={(m: any, busca) => String(m.itemNome || "").toLowerCase().includes(busca)}
        columns={[
          { header: "Data", render: (m: any) => fmtDate(m.criadoEm) },
          { header: "Tipo", render: (m: any) => m.tipo },
          { header: "Item", render: (m: any) => m.itemNome || "—" },
          { header: "Qtd", align: "right", render: (m: any) => fmtNum(Math.abs(Number(m.quantidade || 0))) },
        ]}
      />
    </DashboardLayout>
  );
}
