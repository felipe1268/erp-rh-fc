// ============================================================================
// Rev. 4039 — Dashboard Almoxarifado & Equipamentos: página "Visão Geral"
// (antes uma aba do arquivo único DashAlmoxarifadoEquipamentos.tsx). Agora
// página própria com item de sidebar dedicado. Adiciona análise por
// funcionário (quem mais retira material + quem está com empréstimo aberto)
// pedida pelo usuário, com drill-down clicável nos gráficos.
// ============================================================================
import { useState } from "react";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi, type ChartClickInfo } from "@/components/DashChart";
import {
  Warehouse, Package, DollarSign, HardHat, Truck, AlertTriangle, ShieldAlert,
  Clock, ArrowLeftRight, Wrench, User, PackageCheck, CalendarRange,
} from "lucide-react";
import { useAlmoxarifadoData } from "./useAlmoxarifadoData";
import { AlmoxPageHeader, MesesHeaderBar, DeltaCell, DrillDialog, fmtBRL, fmtNum, fmtDate, fmtDayBR } from "./shared";

export default function DashVisaoGeral() {
  const d = useAlmoxarifadoData();
  const { stockAgg, proprAgg, locAgg, opsAgg, ferrAgg, visaoGeralMovs, periodoMeses, setPeriodoMeses, anosDisponiveis, monthlyAgg, porFuncionarioQ, carregando } = d;

  const [drillFuncionario, setDrillFuncionario] = useState<{ tipo: "retiradas" | "emprestimos"; funcionarioId: string } | null>(null);

  const topRetiradas = (porFuncionarioQ.data?.topRetiradas || []) as any[];
  const comEmprestimo = (porFuncionarioQ.data?.comEmprestimoAberto || []) as any[];

  const handleClickRetirada = (info: ChartClickInfo) => {
    const row = topRetiradas[info.dataIndex];
    if (row) setDrillFuncionario({ tipo: "retiradas", funcionarioId: String(row.funcionario_id) });
  };
  const handleClickEmprestimo = (info: ChartClickInfo) => {
    const row = comEmprestimo[info.dataIndex];
    if (row) setDrillFuncionario({ tipo: "emprestimos", funcionarioId: String(row.funcionario_id) });
  };

  const rowDrill = drillFuncionario
    ? drillFuncionario.tipo === "retiradas"
      ? topRetiradas.find(r => String(r.funcionario_id) === drillFuncionario.funcionarioId)
      : comEmprestimo.find(r => String(r.funcionario_id) === drillFuncionario.funcionarioId)
    : null;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AlmoxPageHeader icon={Warehouse} title="Visão Geral — Almoxarifado & Equipamentos" subtitle="Panorama consolidado de estoque, movimentações, equipamentos e ferramentas de terceiros." carregando={carregando} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashKpi label="Itens cadastrados" value={fmtNum(stockAgg.total)} icon={Package} color="blue" />
          <DashKpi label="Valor do estoque" value={fmtBRL(stockAgg.valorTotal)} icon={DollarSign} color="teal" />
          <DashKpi label="Equip. próprios" value={fmtNum(proprAgg.total)} icon={HardHat} color="indigo" />
          <DashKpi label="Locados ativos" value={fmtNum(locAgg.ativos)} icon={Truck} color="green" sub={fmtBRL(locAgg.custoMes) + "/mês"} />

          <DashKpi label="Abaixo do mínimo" value={fmtNum(stockAgg.abaixoMin)} icon={AlertTriangle} color="amber" />
          <DashKpi label="Sem estoque" value={fmtNum(stockAgg.semEstoque)} icon={ShieldAlert} color="red" />
          <DashKpi label="Locações vencendo (30d)" value={fmtNum(locAgg.vencendo30)} icon={Clock} color="amber" />
          <DashKpi label="Locados em atraso" value={fmtNum(locAgg.atrasados)} icon={AlertTriangle} color="red" />

          <DashKpi label="Empréstimos abertos" value={fmtNum(opsAgg.loansAbertos)} icon={ArrowLeftRight} color="purple" />
          <DashKpi label="Insumos (saídas)" value={fmtNum(opsAgg.insumos)} icon={ArrowLeftRight} color="orange" />
          <DashKpi label="Transferências" value={fmtNum(opsAgg.transferencias)} icon={ArrowLeftRight} color="blue" />
          <DashKpi label="Ferramentas terceiros" value={fmtNum(ferrAgg.total)} icon={Wrench} color="indigo" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DashChart
            title="Movimentações por dia (últimos 30 dias)"
            type="line"
            labels={Object.keys(visaoGeralMovs.porDia).map(fmtDayBR)}
            datasets={[
              { label: "Entradas", data: Object.values(visaoGeralMovs.porDia).map(d => d.entradas), borderColor: "#10B981", backgroundColor: "rgba(16,185,129,0.15)", fill: true, tension: 0.3 },
              { label: "Saídas",   data: Object.values(visaoGeralMovs.porDia).map(d => d.saidas),   borderColor: "#DC2626", backgroundColor: "rgba(220,38,38,0.15)", fill: true, tension: 0.3 },
            ]}
          />
          <DashChart
            title="Custo mensal de locação por obra"
            type="doughnut"
            labels={locAgg.porObra.slice(0, 8).map(o => o.nome)}
            datasets={[{ data: locAgg.porObra.slice(0, 8).map(o => Math.round(o.custo)) }]}
            valueFormatter={fmtBRL}
          />
        </div>

        {/* Rev. 4039 — Quem mais retira material + quem está com equipamento emprestado */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 flex items-center gap-2">
              <User className="h-4 w-4 text-orange-600" /> Quem mais retira material (top 10)
              <span className="text-[11px] font-normal text-slate-400">— clique numa barra p/ detalhar</span>
            </div>
            {topRetiradas.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">Sem retiradas registradas por funcionário.</div>
            ) : (
              <DashChart
                title=""
                className="border-none shadow-none"
                type="horizontalBar"
                labels={topRetiradas.slice(0, 10).map(r => r.funcionario_nome)}
                datasets={[{ label: "Valor retirado (R$)", data: topRetiradas.slice(0, 10).map(r => Math.round(Number(r.valor_total || 0))) }]}
                valueFormatter={fmtBRL}
                onChartClick={handleClickRetirada}
              />
            )}
          </div>
          <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800 flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-purple-600" /> Quem está com ferramentas/equipamentos emprestados agora (top 10)
              <span className="text-[11px] font-normal text-slate-400">— clique numa barra p/ detalhar</span>
            </div>
            {comEmprestimo.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">Nenhum empréstimo aberto por funcionário no momento.</div>
            ) : (
              <DashChart
                title=""
                className="border-none shadow-none"
                type="horizontalBar"
                labels={comEmprestimo.slice(0, 10).map(r => r.funcionario_nome)}
                datasets={[{ label: "Itens em mãos", data: comEmprestimo.slice(0, 10).map(r => Number(r.itens_em_maos || 0)) }]}
                onChartClick={handleClickEmprestimo}
              />
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <MesesHeaderBar titulo="Comparativo mês a mês" periodoMeses={periodoMeses} setPeriodoMeses={setPeriodoMeses} anosDisponiveis={anosDisponiveis} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left p-2.5">Mês</th>
                  <th className="text-right p-2.5">Movs</th>
                  <th className="text-right p-2.5 text-emerald-700">Entradas (qtd)</th>
                  <th className="text-right p-2.5 text-red-700">Saídas (qtd)</th>
                  <th className="text-right p-2.5">Locados iniciados</th>
                  <th className="text-right p-2.5">Próprios adquiridos</th>
                  <th className="text-right p-2.5">Ferramentas terc.</th>
                  <th className="text-right p-2.5">Itens cadastrados</th>
                </tr>
              </thead>
              <tbody>
                {monthlyAgg.months.map((m, i, arr) => {
                  const pk = arr[i - 1]?.key;
                  const p = (f: Record<string, number>) => (pk !== undefined ? f[pk] : undefined);
                  return (
                    <tr key={m.key} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">{m.label}</td>
                      <td className="p-2.5"><DeltaCell value={monthlyAgg.movsCount[m.key]} prev={p(monthlyAgg.movsCount)} /></td>
                      <td className="p-2.5"><DeltaCell value={monthlyAgg.movsEntradas[m.key]} prev={p(monthlyAgg.movsEntradas)} accent="text-emerald-700" /></td>
                      <td className="p-2.5"><DeltaCell value={monthlyAgg.movsSaidas[m.key]} prev={p(monthlyAgg.movsSaidas)} accent="text-red-700" /></td>
                      <td className="p-2.5"><DeltaCell value={monthlyAgg.locadosIniciados[m.key]} prev={p(monthlyAgg.locadosIniciados)} /></td>
                      <td className="p-2.5"><DeltaCell value={monthlyAgg.propriosNovos[m.key]} prev={p(monthlyAgg.propriosNovos)} /></td>
                      <td className="p-2.5"><DeltaCell value={monthlyAgg.ferramentasReg[m.key]} prev={p(monthlyAgg.ferramentasReg)} /></td>
                      <td className="p-2.5"><DeltaCell value={monthlyAgg.itensCadastrados[m.key]} prev={p(monthlyAgg.itensCadastrados)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {rowDrill && (
        <DrillDialog
          open={!!drillFuncionario}
          onClose={() => setDrillFuncionario(null)}
          title={rowDrill.funcionario_nome}
          subtitle={drillFuncionario?.tipo === "retiradas" ? "Detalhe de retiradas de material" : "Detalhe de empréstimos em aberto"}
          rows={[rowDrill]}
          columns={
            drillFuncionario?.tipo === "retiradas"
              ? [
                  { header: "Código", render: (r: any) => r.funcionario_codigo || "—" },
                  { header: "Retiradas", align: "right", render: (r: any) => fmtNum(Number(r.retiradas || 0)) },
                  { header: "Qtd. total", align: "right", render: (r: any) => fmtNum(Number(r.qtd_total || 0)) },
                  { header: "Valor total", align: "right", render: (r: any) => fmtBRL(Number(r.valor_total || 0)) },
                  { header: "Última retirada", render: (r: any) => fmtDate(r.ultima_retirada) },
                ]
              : [
                  { header: "Código", render: (r: any) => r.funcionario_codigo || "—" },
                  { header: "Itens em mãos", align: "right", render: (r: any) => fmtNum(Number(r.itens_em_maos || 0)) },
                  { header: "Empréstimo mais antigo", render: (r: any) => fmtDate(r.emprestimo_mais_antigo) },
                ]
          }
        />
      )}
    </DashboardLayout>
  );
}
