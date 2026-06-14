import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, ChevronRight, Ruler, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

// Rev. 3078 — Painel de Controle das Medições (Configurações → Critérios do Sistema).
// Governa o comportamento dos módulos "Medição de Terceiros" e "Medição de Cliente"
// por empresa. Tudo configurável aqui (nada hardcoded).
type Cfg = {
  terceirosAtivo: boolean;
  clienteAtivo: boolean;
  levantamentoObrigatorio: boolean;
  fotosObrigatorias: boolean;
  aprovacaoTresNiveis: boolean;
  divergenciaToleranciaPct: number;
  diaMedicaoPadrao: number;
};

const DEFAULTS: Cfg = {
  terceirosAtivo: true,
  clienteAtivo: true,
  levantamentoObrigatorio: true,
  fotosObrigatorias: true,
  aprovacaoTresNiveis: true,
  divergenciaToleranciaPct: 5,
  diaMedicaoPadrao: 25,
};

export function MedicaoConfigSection() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const [expanded, setExpanded] = useState(false);
  const [cfg, setCfg] = useState<Cfg>(DEFAULTS);

  const utils = trpc.useUtils();
  const { data } = trpc.medicaoConfig.getConfig.useQuery({ companyId }, { enabled: !!companyId });

  useEffect(() => {
    if (data) setCfg({ ...DEFAULTS, ...data });
  }, [data]);

  const salvarMut = trpc.medicaoConfig.salvar.useMutation({
    onSuccess: () => {
      toast.success("Configurações de Medição salvas!");
      utils.medicaoConfig.getConfig.invalidate({ companyId });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar configurações de Medição"),
  });

  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg(prev => ({ ...prev, [k]: v }));

  const toggles: { key: keyof Cfg; label: string; desc: string }[] = [
    { key: "terceirosAtivo", label: "Módulo Medição de Terceiros", desc: "Habilita o módulo a pagar (com levantamento em campo)." },
    { key: "clienteAtivo", label: "Módulo Medição de Cliente", desc: "Habilita o módulo a receber (automático pelo avanço semanal/REFIS)." },
    { key: "levantamentoObrigatorio", label: "Levantamento obrigatório (Terceiros)", desc: "Exige levantamento em campo (PDF + contornos) em toda medição de terceiro." },
    { key: "fotosObrigatorias", label: "Fotos por ambiente obrigatórias", desc: "Cada ambiente medido precisa de ao menos uma foto." },
    { key: "aprovacaoTresNiveis", label: "Aprovação em 3 níveis", desc: "Mede → gestor da obra → sócio adm (libera o financeiro)." },
  ];

  return (
    <div className="border rounded-lg overflow-hidden border-teal-200">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-teal-50 text-xs font-bold text-teal-700 uppercase tracking-wider border-b border-teal-200">
        <Ruler className="w-4 h-4" />
        Medições
      </div>

      <div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-teal-50/50 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <ClipboardCheck className="w-4 h-4 text-teal-500 shrink-0" />
            <span className="font-medium text-gray-800 text-sm truncate">Comportamento dos módulos de Medição</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`} />
        </button>

        {expanded && (
          <div className="px-4 pb-4 bg-white space-y-4">
            <div className="divide-y divide-gray-100 border rounded-lg">
              {toggles.map(t => (
                <div key={String(t.key)} className="flex items-start justify-between gap-4 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{t.label}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{t.desc}</p>
                  </div>
                  <Switch
                    checked={!!cfg[t.key]}
                    onCheckedChange={(v) => set(t.key, v as Cfg[typeof t.key])}
                    className="shrink-0 mt-0.5"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-600">Tolerância do alerta de divergência (%)</Label>
                <Input
                  type="number" min={0} max={100} step="0.5"
                  className="mt-1 h-10"
                  value={cfg.divergenciaToleranciaPct}
                  onChange={(e) => set("divergenciaToleranciaPct", e.target.value === "" ? 0 : Number(e.target.value))}
                />
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                  Acima desta diferença entre o levantado em campo e o avanço do cronograma, a medição de terceiro alerta antes da aprovação final.
                </p>
              </div>
              <div>
                <Label className="text-xs text-gray-600">Dia da Medição padrão (corte)</Label>
                <Input
                  type="number" min={1} max={31} step="1"
                  className="mt-1 h-10"
                  value={cfg.diaMedicaoPadrao}
                  onChange={(e) => set("diaMedicaoPadrao", e.target.value === "" ? 1 : Number(e.target.value))}
                />
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                  Dia de corte padrão sugerido ao criar novos contratos (pode variar por obra antes da assinatura).
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t">
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={salvarMut.isPending || !companyId}
                onClick={() => salvarMut.mutate({ companyId, ...cfg })}
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                {salvarMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
