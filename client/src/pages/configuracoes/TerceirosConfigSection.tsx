// Rev. 5002 — Critério de Medição padrão da EMPRESA (herdado por toda obra nova;
// cada obra pode sobrescrever em Editar Obra › aba Critério de Medição).
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { ChevronRight, Handshake, Ruler, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import CriterioMedicaoMdoEditor, { parseCriterioMedicaoMdo, CRITERIO_MEDICAO_MDO_DEFAULT } from "@/components/CriterioMedicaoMdoEditor";

export function TerceirosConfigSection() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const [expanded, setExpanded] = useState(false);
  const [valor, setValor] = useState<string | null>(null);

  const q = trpc.terceiroContratos.getCriterioMedicaoPadrao.useQuery({ companyId }, { enabled: !!companyId });
  useEffect(() => { setValor(q.data?.valor ?? null); }, [q.data]);

  const utils = trpc.useUtils();
  const salvarMut = trpc.terceiroContratos.setCriterioMedicaoPadrao.useMutation({
    onSuccess: () => {
      toast.success("Critério de Medição padrão salvo! Obras novas já nascem com ele.");
      utils.terceiroContratos.getCriterioMedicaoPadrao.invalidate({ companyId });
    },
    onError: (e) => toast.error(e.message),
  });

  const definido = !!parseCriterioMedicaoMdo(valor).tipo;

  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 overflow-hidden">
      <div className="px-4 py-2 border-b border-cyan-200 bg-cyan-50 flex items-center gap-2">
        <Handshake className="w-4 h-4 text-cyan-700" />
        <span className="text-xs font-bold text-cyan-800 uppercase tracking-wide">Terceiros</span>
      </div>
      <button type="button" className="w-full flex items-center gap-3 px-4 py-3 hover:bg-cyan-50/60 text-left" onClick={() => setExpanded(e => !e)}>
        <Ruler className="w-4 h-4 text-cyan-700 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-800">Critério de Medição padrão (Mão de Obra)</div>
          <div className="text-xs text-muted-foreground">Toda obra nova é criada com este critério; cada obra pode ter condição diferente em Editar Obra.</div>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${definido ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {definido ? "Definido" : "Não definido"}
        </span>
        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {!definido && (
            <div className="flex items-center justify-between gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
              <span>Sem o padrão definido, obras sem critério próprio ficam bloqueadas para gerar contrato de terceiros.</span>
              <Button size="sm" variant="outline" className="h-6 text-[11px] shrink-0" onClick={() => setValor(CRITERIO_MEDICAO_MDO_DEFAULT)}>Usar sugestão FC</Button>
            </div>
          )}
          {/* Rev. 5003 — Datas padrão do fluxo (herdadas pelas obras novas) */}
          {(() => {
            const cm = parseCriterioMedicaoMdo(valor);
            const setNum = (key: "diaMedicao" | "prazoAprovacaoDias" | "prazoPagamentoDias", raw: string, max: number) => {
              const n = raw === "" ? null : Math.min(max, Math.max(1, parseInt(raw) || 1));
              setValor(JSON.stringify({ ...cm, [key]: n }));
            };
            const dm = cm.diaMedicao ?? 25, pa = cm.prazoAprovacaoDias ?? 5, pp = cm.prazoPagamentoDias ?? 10;
            return (
              <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2.5">
                <div>
                  <div className="text-xs font-semibold text-slate-700">Datas padrão do fluxo de medição</div>
                  <div className="text-[11px] text-muted-foreground">Toda obra nova herda estas datas (cada obra pode ajustar em Editar Obra › Medição & Pagamento).</div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-[11px] font-medium text-slate-600 mb-1">Dia da Medição (corte)</div>
                    <input type="number" min={1} max={31} className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm" value={cm.diaMedicao ?? ""} placeholder="25" onChange={e => setNum("diaMedicao", e.target.value, 31)} />
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-slate-600 mb-1">Aprovação (dias úteis)</div>
                    <input type="number" min={1} max={60} className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm" value={cm.prazoAprovacaoDias ?? ""} placeholder="5" onChange={e => setNum("prazoAprovacaoDias", e.target.value, 60)} />
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-slate-600 mb-1">Pagamento (dias úteis após a NF)</div>
                    <input type="number" min={1} max={90} className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm" value={cm.prazoPagamentoDias ?? ""} placeholder="10" onChange={e => setNum("prazoPagamentoDias", e.target.value, 90)} />
                  </div>
                </div>
                <p className="text-[11px] font-medium text-blue-900 bg-white border border-blue-200 rounded-md px-2.5 py-1.5">
                  Fluxo padrão: corte da medição dia <b>{dm}</b> → aprovação em até <b>{pa} dias úteis</b> → aprovada, o terceiro emite a NF → pagamento em até <b>{pp} dias úteis</b> após a emissão da NF. Prazos em dias úteis: feriado e fim de semana não contam.
                </p>
              </div>
            );
          })()}
          <CriterioMedicaoMdoEditor value={valor} onChange={setValor} />
          <div className="flex justify-end">
            <Button size="sm" disabled={salvarMut.isPending || !parseCriterioMedicaoMdo(valor).tipo} onClick={() => salvarMut.mutate({ companyId, valor: valor! })}>
              {salvarMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Salvar padrão da empresa
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
