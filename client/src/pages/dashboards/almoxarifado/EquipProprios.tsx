// ============================================================================
// Rev. 4039 — Dashboard Almoxarifado & Equipamentos: página "Equipamentos
// Próprios" (antes uma aba do arquivo único).
// ============================================================================
import { useState } from "react";
import { Link } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi, type ChartClickInfo } from "@/components/DashChart";
import { HardHat, DollarSign, Activity, AlertTriangle, ArrowUp } from "lucide-react";
import { useAlmoxarifadoData } from "./useAlmoxarifadoData";
import { AlmoxPageHeader, MesesHeaderBar, DeltaCell, DrillDialog, statusProprioTheme, fmtBRL, fmtNum } from "./shared";

export default function DashEquipProprios() {
  const d = useAlmoxarifadoData();
  const { proprAgg, propriosQ, periodoMeses, setPeriodoMeses, anosDisponiveis, monthlyAgg, carregando } = d;
  const [drillStatus, setDrillStatus] = useState<string | null>(null);

  const todos = (propriosQ.data || []) as any[];
  const lista = todos.slice(0, 20);
  const semValor = todos.filter((p: any) => !(Number(p.valorAquisicao) > 0)).length;
  const rowsDoStatus = drillStatus ? todos.filter((p: any) => String(p.status || "indefinido") === drillStatus) : [];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AlmoxPageHeader icon={HardHat} title="Equipamentos Próprios" subtitle="Frota própria de equipamentos e ferramentas patrimoniadas." carregando={carregando} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashKpi label="Total cadastrados" value={fmtNum(proprAgg.total)} icon={HardHat} color="indigo" />
          <DashKpi label="Valor em ativos" value={fmtBRL(proprAgg.valorAtivos)} icon={DollarSign} color="teal" sub="aquisição acumulada" />
          {proprAgg.porStatus.slice(0, 2).map(([st, ct]) => (
            <DashKpi key={st} label={`Status: ${st}`} value={fmtNum(ct)} icon={Activity} color="blue" />
          ))}
        </div>

        <DashChart
          title="Equipamentos próprios por status"
          type="doughnut"
          labels={proprAgg.porStatus.map(([s]) => s)}
          datasets={[{ data: proprAgg.porStatus.map(([, c]) => c) }]}
          onChartClick={(info: ChartClickInfo) => setDrillStatus(info.label)}
        />

        <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-indigo-100 ring-1 ring-indigo-200 flex items-center justify-center shrink-0">
                <HardHat className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 leading-tight">Equipamentos cadastrados</div>
                <div className="text-[11px] text-slate-500">Exibindo {lista.length} de {fmtNum(todos.length)} — mais recentes primeiro</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {semValor > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200 rounded-full px-2 py-0.5">
                  <AlertTriangle className="h-3 w-3" /> {fmtNum(semValor)} sem valor
                </span>
              )}
              <Link href="/equipamentos/proprios"><a className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">Ver todos <ArrowUp className="h-3 w-3 rotate-45" /></a></Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Descrição</th>
                  <th className="text-left px-4 py-2.5 font-medium">Patrimônio</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium">Valor aquisição</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p: any) => {
                  const st = statusProprioTheme(p.status);
                  const valor = Number(p.valorAquisicao || 0);
                  const temValor = valor > 0;
                  return (
                    <tr key={p.id} className="border-t border-slate-100 hover:bg-indigo-50/40 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{p.descricao}</td>
                      <td className="px-4 py-2.5">
                        {(p.codigoPatrimonio || p.codigoInterno)
                          ? <span className="font-mono text-[11px] text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">{p.codigoPatrimonio || p.codigoInterno}</span>
                          : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {temValor
                          ? <span className="font-semibold text-slate-800">{fmtBRL(valor)}</span>
                          : <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600"><AlertTriangle className="h-3 w-3" /> Sem valor</span>}
                      </td>
                    </tr>
                  );
                })}
                {todos.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-500">Nenhum equipamento próprio cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <MesesHeaderBar titulo="Aquisições mês a mês" periodoMeses={periodoMeses} setPeriodoMeses={setPeriodoMeses} anosDisponiveis={anosDisponiveis} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left p-2.5">Mês</th>
                  <th className="text-right p-2.5">Equipamentos</th>
                  <th className="text-right p-2.5">Valor adquirido</th>
                </tr>
              </thead>
              <tbody>
                {monthlyAgg.months.map((m, i, arr) => {
                  const pk = arr[i - 1]?.key;
                  return (
                    <tr key={m.key} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">{m.label}</td>
                      <td className="p-2.5"><DeltaCell value={monthlyAgg.propriosNovos[m.key]} prev={pk ? monthlyAgg.propriosNovos[pk] : undefined} /></td>
                      <td className="p-2.5"><DeltaCell value={monthlyAgg.propriosValor[m.key]} prev={pk ? monthlyAgg.propriosValor[pk] : undefined} money /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <DrillDialog
        open={!!drillStatus}
        onClose={() => setDrillStatus(null)}
        title={`Equipamentos — status "${drillStatus || ""}"`}
        rows={rowsDoStatus}
        searchable
        searchPredicate={(p: any, busca) => String(p.descricao || "").toLowerCase().includes(busca)}
        columns={[
          { header: "Descrição", render: (p: any) => p.descricao || "—" },
          { header: "Patrimônio", render: (p: any) => p.codigoPatrimonio || p.codigoInterno || "—" },
          { header: "Valor aquisição", align: "right", render: (p: any) => fmtBRL(Number(p.valorAquisicao || 0)) },
        ]}
      />
    </DashboardLayout>
  );
}
