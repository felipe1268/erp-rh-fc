import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Switch } from "@/components/ui/switch";
import { Trophy, ChevronRight } from "lucide-react";
import { toast } from "sonner";

// Rev. 4209 — Toggle de acesso ao Scorecard do Gestor (beta gate).
// Default: desativado (só Admin Master vê a aba). Quando habilitado, todos
// os usuários com permissão "avaliacao_cliente" enxergam a aba Scorecard.
export function ScorecardBetaConfigSection() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;

  const [expanded, setExpanded] = useState(false);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.scorecard.getScorecardBetaAtivo.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const setMut = trpc.scorecard.setScorecardBetaAtivo.useMutation({
    onSuccess: (_, vars) => {
      utils.scorecard.getScorecardBetaAtivo.invalidate({ companyId });
      toast.success(
        vars.ativo
          ? "Scorecard do Gestor liberado para todos os usuários."
          : "Scorecard do Gestor restrito ao Admin Master."
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const ativo = !!data?.ativo;

  // Rev. 4867 — LGPD: modo "só total" nos Custos RH (Scorecard)
  const { data: soTotalData, isLoading: soTotalLoading } = trpc.scorecard.getCustosSoTotal.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const soTotalMut = trpc.scorecard.setCustosSoTotal.useMutation({
    onSuccess: (_, vars) => {
      utils.scorecard.getCustosSoTotal.invalidate({ companyId });
      utils.scorecard.getCustosRH.invalidate();
      toast.success(
        vars.ativo
          ? "Custos RH: gestores/engenheiros verão apenas o total da equipe."
          : "Custos RH: gestores/engenheiros voltam a ver o custo agrupado por função."
      );
    },
    onError: (e) => toast.error(e.message),
  });
  const soTotal = !!soTotalData?.ativo;

  return (
    <div className="border rounded-lg overflow-hidden border-amber-200">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 text-xs font-bold text-amber-700 uppercase tracking-wider border-b border-amber-200">
        <Trophy className="w-4 h-4" />
        Scorecard do Gestor
      </div>

      <div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-amber-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Trophy className="w-4 h-4 text-amber-500" />
            <span className="font-medium text-gray-800 text-sm">Acesso à aba Scorecard</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${ativo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
              {isLoading ? "Carregando…" : ativo ? "Visível para todos" : "Só Admin Master"}
            </span>
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>

        {expanded && (
          <div className="px-4 pb-4 pt-1 border-t border-amber-100 bg-amber-50/30 space-y-4">
            <p className="text-xs text-gray-600 leading-relaxed">
              Quando <strong>desativado</strong>, a aba "Scorecard" fica visível apenas para o login
              Admin Master — útil durante a validação inicial do módulo.
              Quando <strong>ativado</strong>, todos os usuários com permissão de "Avaliação de Cliente"
              poderão ver e interagir com o Scorecard do Gestor.
            </p>

            <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-amber-200">
              <Switch
                id="scorecard-beta"
                checked={ativo}
                disabled={isLoading || setMut.isPending || !companyId}
                onCheckedChange={(v) => setMut.mutate({ companyId, ativo: v })}
              />
              <label htmlFor="scorecard-beta" className="text-sm font-medium text-gray-700 cursor-pointer select-none">
                {ativo ? "Scorecard visível para todos os usuários" : "Scorecard visível apenas para Admin Master"}
              </label>
            </div>

            {/* Rev. 4867 — LGPD: visão de Custos RH p/ não-Admin Master */}
            <div className="space-y-2">
              <p className="text-xs text-gray-600 leading-relaxed">
                <strong>Privacidade dos Custos RH (LGPD):</strong> o Admin Master sempre vê o custo
                individual por funcionário. Para os demais usuários (gestor de obra, engenheiro de campo),
                escolha o nível de detalhe: agrupado por função (padrão) ou{" "}
                <strong>apenas o efetivo total e o custo total</strong> — sem nenhum valor isolado.
              </p>
              <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-amber-200">
                <Switch
                  id="scorecard-custos-so-total"
                  checked={soTotal}
                  disabled={soTotalLoading || soTotalMut.isPending || !companyId}
                  onCheckedChange={(v) => soTotalMut.mutate({ companyId, ativo: v })}
                />
                <label htmlFor="scorecard-custos-so-total" className="text-sm font-medium text-gray-700 cursor-pointer select-none">
                  {soTotal
                    ? "Custos RH: demais usuários veem apenas o total da equipe"
                    : "Custos RH: demais usuários veem custo agrupado por função"}
                </label>
              </div>
            </div>

            {!ativo && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                A aba "Scorecard" está em modo <strong>beta privado</strong>. Configure as alíquotas de impostos
                e overhead diretamente na aba antes de liberar para os gestores.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
