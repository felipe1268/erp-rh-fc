// ============================================================================
// Rev. 4039 — Dashboard Almoxarifado & Equipamentos: página "Estoque"
// (antes uma aba do arquivo único). Adiciona alerta de itens sem categoria e
// gráfico de top itens por valor, com drill-down clicável.
// ============================================================================
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi, type ChartClickInfo } from "@/components/DashChart";
import { Package, DollarSign, Layers, Tag, AlertTriangle, ShieldAlert, CheckCircle2, TrendingUp } from "lucide-react";
import { useAlmoxarifadoData } from "./useAlmoxarifadoData";
import { AlmoxPageHeader, MesesHeaderBar, DeltaCell, DrillDialog, fmtBRL, fmtNum } from "./shared";

export default function DashEstoque() {
  const d = useAlmoxarifadoData();
  const { stockAgg, periodoMeses, setPeriodoMeses, anosDisponiveis, monthlyAgg, carregando } = d;

  const [drillCategoria, setDrillCategoria] = useState<string | null>(null);
  const [drillSemCategoria, setDrillSemCategoria] = useState(false);
  const [drillTopValor, setDrillTopValor] = useState(false);

  const itensDaCategoria = drillCategoria
    ? stockAgg.topPorValor.filter(t => (t.item.categoria ? String(t.item.categoria).trim() : "— sem categoria —") === drillCategoria)
    : [];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AlmoxPageHeader icon={Package} title="Estoque — Almoxarifado" subtitle="Itens, categorias e cobertura de estoque." carregando={carregando} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashKpi label="Itens cadastrados" value={fmtNum(stockAgg.total)} icon={Package} color="blue" />
          <DashKpi label="Unidades em estoque" value={fmtNum(stockAgg.unidadesEstoque)} icon={Layers} color="teal" />
          <DashKpi label="Valor total" value={fmtBRL(stockAgg.valorTotal)} icon={DollarSign} color="green" />
          <DashKpi label="Categorias" value={fmtNum(stockAgg.cats.length)} icon={Tag} color="purple" />
          <DashKpi label="Abaixo do mínimo" value={fmtNum(stockAgg.abaixoMin)} icon={AlertTriangle} color="amber" sub="reposição necessária" />
          <DashKpi label="Sem estoque" value={fmtNum(stockAgg.semEstoque)} icon={ShieldAlert} color="red" />
          <DashKpi label="Saudáveis" value={fmtNum(Math.max(0, stockAgg.total - stockAgg.abaixoMin - stockAgg.semEstoque))} icon={CheckCircle2} color="green" />
          <DashKpi label="Cobertura mensal (R$)" value={fmtBRL(stockAgg.valorTotal)} icon={TrendingUp} color="blue" sub="valor parado" />
        </div>

        {/* Rev. 4039 — Alerta de itens sem categoria */}
        {stockAgg.semCategoriaItens.length > 0 && (
          <button
            onClick={() => setDrillSemCategoria(true)}
            className="w-full text-left bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3 hover:bg-amber-100/70 transition-colors"
          >
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-amber-800 text-sm">{fmtNum(stockAgg.semCategoriaItens.length)} item(ns) sem categoria cadastrada</div>
              <div className="text-xs text-amber-700/80">Clique para ver a lista e organizar o cadastro.</div>
            </div>
          </button>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DashChart
            title="Valor do estoque por categoria (top 10)"
            type="horizontalBar"
            labels={stockAgg.cats.slice(0, 10).map(c => c.categoria)}
            datasets={[{ label: "R$", data: stockAgg.cats.slice(0, 10).map(c => Math.round(c.valor)) }]}
            valueFormatter={fmtBRL}
            onChartClick={(info: ChartClickInfo) => setDrillCategoria(info.label)}
          />
          <DashChart
            title="Itens por categoria (top 10)"
            type="doughnut"
            labels={stockAgg.cats.slice(0, 10).map(c => c.categoria)}
            datasets={[{ data: stockAgg.cats.slice(0, 10).map(c => c.qtd) }]}
            onChartClick={(info: ChartClickInfo) => setDrillCategoria(info.label)}
          />
        </div>

        {/* Rev. 4039 — Top itens por valor */}
        <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-emerald-600" /> Top 15 itens por valor em estoque</span>
            <button onClick={() => setDrillTopValor(true)} className="text-xs font-medium text-emerald-700 hover:underline">Ver lista completa</button>
          </div>
          <div className="p-3 space-y-2">
            {stockAgg.topPorValor.length === 0 && <div className="p-4 text-center text-sm text-slate-500">Sem itens cadastrados.</div>}
            {stockAgg.topPorValor.map((t, idx) => {
              const max = stockAgg.topPorValor[0]?.valor || 1;
              const pct = (t.valor / max) * 100;
              return (
                <div key={t.item.id ?? idx} className="group">
                  <div className="flex items-center justify-between gap-2 text-xs mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 h-5 w-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center">{idx + 1}</span>
                      <span className="font-medium text-slate-800 truncate" title={t.item.nome || t.item.descricao}>{t.item.nome || t.item.descricao || "—"}</span>
                    </div>
                    <span className="font-bold text-slate-700 whitespace-nowrap tabular-nums">{fmtBRL(t.valor)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 flex items-center gap-2">
            <Tag className="h-4 w-4 text-slate-500" /> Categorias — detalhe
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr><th className="text-left p-2.5">Categoria</th><th className="text-right p-2.5">Itens</th><th className="text-right p-2.5">Valor parado</th></tr>
              </thead>
              <tbody>
                {stockAgg.cats.slice(0, 20).map(c => (
                  <tr key={c.categoria} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setDrillCategoria(c.categoria)}>
                    <td className="p-2.5 text-slate-800">{c.categoria}</td>
                    <td className="p-2.5 text-right">{fmtNum(c.qtd)}</td>
                    <td className="p-2.5 text-right font-medium">{fmtBRL(c.valor)}</td>
                  </tr>
                ))}
                {stockAgg.cats.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-slate-500">Sem dados.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <MesesHeaderBar titulo="Itens cadastrados mês a mês" periodoMeses={periodoMeses} setPeriodoMeses={setPeriodoMeses} anosDisponiveis={anosDisponiveis} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left p-2.5">Mês</th>
                  <th className="text-right p-2.5">Novos itens</th>
                  <th className="text-right p-2.5">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let acc = 0;
                  let prevN: number | undefined;
                  let prevAcc: number | undefined;
                  return monthlyAgg.months.map(m => {
                    const n = monthlyAgg.itensCadastrados[m.key];
                    acc += n;
                    const row = (
                      <tr key={m.key} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">{m.label}</td>
                        <td className="p-2.5"><DeltaCell value={n} prev={prevN} /></td>
                        <td className="p-2.5"><DeltaCell value={acc} prev={prevAcc} accent="text-slate-600" /></td>
                      </tr>
                    );
                    prevN = n;
                    prevAcc = acc;
                    return row;
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <DrillDialog
        open={!!drillCategoria}
        onClose={() => setDrillCategoria(null)}
        title={`Categoria: ${drillCategoria || ""}`}
        subtitle="Itens desta categoria (ordenados por valor)"
        rows={itensDaCategoria}
        searchable
        searchPredicate={(t, busca) => String(t.item.nome || t.item.descricao || "").toLowerCase().includes(busca)}
        columns={[
          { header: "Item", render: (t: any) => t.item.nome || t.item.descricao || "—" },
          { header: "Saldo", align: "right", render: (t: any) => fmtNum(t.saldo) },
          { header: "Valor unitário", align: "right", render: (t: any) => fmtBRL(t.preco) },
          { header: "Valor total", align: "right", render: (t: any) => fmtBRL(t.valor) },
        ]}
      />

      <DrillDialog
        open={drillSemCategoria}
        onClose={() => setDrillSemCategoria(false)}
        title="Itens sem categoria"
        subtitle="Cadastre a categoria destes itens para melhorar a organização do estoque"
        rows={stockAgg.semCategoriaItens}
        searchable
        searchPredicate={(it: any, busca) => String(it.nome || it.descricao || "").toLowerCase().includes(busca)}
        columns={[
          { header: "Item", render: (it: any) => it.nome || it.descricao || "—" },
          { header: "Saldo", align: "right", render: (it: any) => fmtNum(Number(it.quantidadeAtual ?? it.saldoAtual ?? it.quantidade ?? 0)) },
          { header: "Valor unitário", align: "right", render: (it: any) => fmtBRL(Number(it.valorUnitario ?? it.precoMedio ?? it.precoUnitario ?? 0)) },
        ]}
      />

      <DrillDialog
        open={drillTopValor}
        onClose={() => setDrillTopValor(false)}
        title="Top itens por valor em estoque"
        rows={stockAgg.topPorValor}
        searchable
        searchPredicate={(t: any, busca) => String(t.item.nome || t.item.descricao || "").toLowerCase().includes(busca)}
        columns={[
          { header: "Item", render: (t: any) => t.item.nome || t.item.descricao || "—" },
          { header: "Categoria", render: (t: any) => t.item.categoria || "— sem categoria —" },
          { header: "Saldo", align: "right", render: (t: any) => fmtNum(t.saldo) },
          { header: "Valor unitário", align: "right", render: (t: any) => fmtBRL(t.preco) },
          { header: "Valor total", align: "right", render: (t: any) => fmtBRL(t.valor) },
        ]}
      />
    </DashboardLayout>
  );
}
