// ============================================================================
// Rev. 4039 — Dashboard Almoxarifado & Equipamentos: página "Ferramentas de
// Terceiros" (antes uma aba do arquivo único).
// ============================================================================
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { DashKpi } from "@/components/DashChart";
import { Wrench, ArrowLeftRight } from "lucide-react";
import { useAlmoxarifadoData } from "./useAlmoxarifadoData";
import { AlmoxPageHeader, MesesHeaderBar, DeltaCell, DrillDialog, fmtNum, fmtDate } from "./shared";

export default function DashFerramentasTerceiros() {
  const d = useAlmoxarifadoData();
  const { ferrAgg, opsAgg, obrasMap, periodoMeses, setPeriodoMeses, anosDisponiveis, monthlyAgg, carregando } = d;
  const [drillTerceiro, setDrillTerceiro] = useState<string | null>(null);

  const nomeDoTerceiro = (f: any) => f.empresa_terceira || f.empresaTerceira || f.responsavel_nome || "—";
  const rowsDoTerceiro = drillTerceiro ? ferrAgg.items.filter((f: any) => nomeDoTerceiro(f) === drillTerceiro) : [];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <AlmoxPageHeader icon={Wrench} title="Ferramentas de Terceiros" subtitle="Registros de ferramentas cedidas/emprestadas a empresas terceiras." carregando={carregando} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashKpi label="Registros" value={fmtNum(ferrAgg.total)} icon={Wrench} color="indigo" />
          <DashKpi label="Empréstimos abertos" value={fmtNum(opsAgg.loansAbertos)} icon={ArrowLeftRight} color="purple" sub="pendentes de devolução" />
        </div>

        <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">Ferramentas de terceiros — últimos 30 registros</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr><th className="text-left p-2">Data</th><th className="text-left p-2">Terceiro</th><th className="text-left p-2">Obra</th><th className="text-left p-2">Itens</th></tr>
              </thead>
              <tbody>
                {ferrAgg.items.map((f: any) => (
                  <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setDrillTerceiro(nomeDoTerceiro(f))}>
                    <td className="p-2 text-slate-600 whitespace-nowrap">{fmtDate(f.data_hora || f.dataHora || f.criado_em || f.criadoEm)}</td>
                    <td className="p-2 text-slate-800">{nomeDoTerceiro(f)}</td>
                    <td className="p-2 text-slate-700">{f.obra_nome || (f.obra_id ? (obrasMap.get(Number(f.obra_id)) || `#${f.obra_id}`) : (f.obraId ? (obrasMap.get(Number(f.obraId)) || `#${f.obraId}`) : "—"))}</td>
                    <td className="p-2 text-right">{Number(f.qtd_itens ?? f.qtdItens ?? 0)}</td>
                  </tr>
                ))}
                {ferrAgg.items.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-500">Nenhum registro de ferramentas de terceiros.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <MesesHeaderBar titulo="Registros mês a mês" periodoMeses={periodoMeses} setPeriodoMeses={setPeriodoMeses} anosDisponiveis={anosDisponiveis} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-b from-slate-50 to-slate-50/40 text-[11px] text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left p-2.5">Mês</th>
                  <th className="text-right p-2.5">Registros</th>
                </tr>
              </thead>
              <tbody>
                {monthlyAgg.months.map((m, i, arr) => {
                  const pk = arr[i - 1]?.key;
                  return (
                    <tr key={m.key} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">{m.label}</td>
                      <td className="p-2.5"><DeltaCell value={monthlyAgg.ferramentasReg[m.key]} prev={pk ? monthlyAgg.ferramentasReg[pk] : undefined} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <DrillDialog
        open={!!drillTerceiro}
        onClose={() => setDrillTerceiro(null)}
        title={`Registros — ${drillTerceiro || ""}`}
        rows={rowsDoTerceiro}
        columns={[
          { header: "Data", render: (f: any) => fmtDate(f.data_hora || f.dataHora || f.criado_em || f.criadoEm) },
          { header: "Obra", render: (f: any) => f.obra_nome || (f.obra_id ? (obrasMap.get(Number(f.obra_id)) || `#${f.obra_id}`) : "—") },
          { header: "Itens", align: "right", render: (f: any) => fmtNum(Number(f.qtd_itens ?? f.qtdItens ?? 0)) },
        ]}
      />
    </DashboardLayout>
  );
}
