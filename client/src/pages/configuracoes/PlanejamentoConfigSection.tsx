import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, ChevronRight, CalendarRange, TrendingUp } from "lucide-react";
import { toast } from "sonner";

// Rev. 2633 — Interruptor GLOBAL do "% Previsto" do Planejamento (por empresa):
//   • "motor"  → curva calculada pelo Caminho B sobre a baseline (padrão).
//   • "manual" → curva alimentada por upload semanal de XML (aba "Previsto").
export function PlanejamentoConfigSection() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;

  const [expanded, setExpanded] = useState<"previsto" | null>(null);
  const [previstoFonte, setPrevistoFonte] = useState<"motor" | "manual">("motor");

  const { data } = trpc.purchase.getConfigCompras.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  useEffect(() => {
    if (data?.config) {
      const f = (data.config as any).previstoFonte;
      setPrevistoFonte(f === "manual" ? "manual" : "motor");
    }
  }, [data]);

  const utils = trpc.useUtils();
  const salvarMut = trpc.purchase.salvarConfigOC.useMutation({
    onSuccess: () => {
      toast.success("Fonte do % Previsto salva!");
      utils.purchase.getConfigCompras.invalidate({ companyId });
    },
    onError: () => toast.error("Erro ao salvar configuração de Planejamento"),
  });

  return (
    <div className="border rounded-lg overflow-hidden border-indigo-200">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 text-xs font-bold text-indigo-700 uppercase tracking-wider border-b border-indigo-200">
        <CalendarRange className="w-4 h-4" />
        Planejamento
      </div>

      <div>
        <button
          onClick={() => setExpanded(expanded === "previsto" ? null : "previsto")}
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-indigo-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            <span className="font-medium text-gray-800 text-sm">Fonte do "% Previsto"</span>
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
              {previstoFonte === "manual" ? "Manual (upload semanal)" : "Motor (Caminho B)"}
            </span>
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded === "previsto" ? "rotate-90" : ""}`} />
        </button>

        {expanded === "previsto" && (
          <div className="px-4 pb-4 bg-white space-y-4">
            <div className="max-w-md">
              <Select value={previstoFonte} onValueChange={(v) => setPrevistoFonte(v as "motor" | "manual")}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="motor">Motor — calculado na baseline (Caminho B)</SelectItem>
                  <SelectItem value="manual">Manual — upload semanal de XML (% Concluída)</SelectItem>
                </SelectContent>
              </Select>
              <div className="mt-3 text-xs text-gray-500 space-y-2 leading-relaxed">
                <p>
                  <strong className="text-gray-700">Motor:</strong> o ERP calcula o "% Previsto" automaticamente
                  a partir da baseline do cronograma (régua de tempo útil minuto-a-minuto).
                </p>
                <p>
                  <strong className="text-gray-700">Manual:</strong> o "% Previsto" passa a ser FORNECIDO. Na aba
                  <span className="font-medium"> "Previsto"</span> de cada obra, o engenheiro sobe 1 XML por semana e
                  o ERP lê a coluna <span className="font-mono">% Concluída (PercentComplete)</span> da raiz e de cada
                  atividade — sem nenhum cálculo próprio.
                </p>
                <p className="text-amber-600">
                  Atenção: este interruptor é GLOBAL para a empresa selecionada e vale para todas as obras dela.
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t">
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                disabled={salvarMut.isPending || !companyId}
                onClick={() => salvarMut.mutate({ companyId, previstoFonte } as any)}
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
