/**
 * Rev. 4554 — Alerta GLOBAL de Locações a Vencer (abre no login).
 *
 * Evolução da Rev. 4553 (que abria só ao entrar no Almoxarifado): a pedido do
 * usuário, o modal agora abre AUTOMATICAMENTE logo após o login, em QUALQUER
 * tela do ERP, quando há locações vencendo/vencidas — assim ninguém esquece de
 * renovar. Regras preservadas:
 * - 1x por sessão por empresa (sessionStorage `fcAlertaLocacaoShown:<companyId>`).
 * - Respeita o critério `almox_alerta_locacao_auto` (Critérios do Sistema);
 *   só decide DEPOIS da query de critérios resolver (sem race).
 * - O endpoint getItensLocadosVencendo já filtra pelas obras que o usuário
 *   tem permissão (getAlmoxAllowedObraIdSet).
 * - CTA leva a /equipamentos/locados (Renovar/Devolver ficam lá).
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";

export function AlertaLocacoesVencendo() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const [open, setOpen] = useState(false);

  const criteriosQuery = trpc.criteria.getByCategory.useQuery(
    { companyId, categoria: "almoxarifado" },
    { enabled: isAuthenticated && companyId > 0, staleTime: 300_000 },
  );
  const alertaAtivo = useMemo(() => {
    if (!criteriosQuery.isSuccess) return false; // aguarda resolver — nunca decide "ligado" durante loading
    const c = ((criteriosQuery.data ?? []) as any[]).find((x) => x.chave === "almox_alerta_locacao_auto");
    return c ? c.valor === "1" : true; // resolvido e sem seed = ligado por padrão
  }, [criteriosQuery.isSuccess, criteriosQuery.data]);

  const { data: itens = [] } = trpc.compras.getItensLocadosVencendo.useQuery(
    { companyId },
    { enabled: isAuthenticated && companyId > 0 && alertaAtivo, staleTime: 60_000 },
  );

  useEffect(() => {
    if (!companyId || !alertaAtivo || itens.length === 0) return;
    const flagKey = `fcAlertaLocacaoShown:${companyId}`;
    if (sessionStorage.getItem(flagKey)) return;
    sessionStorage.setItem(flagKey, "1");
    setOpen(true);
  }, [companyId, alertaAtivo, itens.length]);

  if (!open || itens.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Locações a Vencer ({itens.length})
          </h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 pt-3">
          <p className="text-xs text-gray-600">
            Existem equipamentos locados com vencimento próximo ou vencido nas suas obras. Valide a <span className="font-semibold">renovação</span> ou a <span className="font-semibold">devolução</span>.
          </p>
        </div>
        <div className="p-4 space-y-2 overflow-y-auto">
          {(itens as any[]).map((i) => {
            const vencido = i.diasParaVencimento <= 0;
            return (
              <div key={i.id} className={`rounded-lg border p-3 ${vencido ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{i.nome}</p>
                    {i.obraNome && (
                      <p className="text-xs text-gray-600 mt-0.5">Obra: <span className="font-medium">{i.obraNome}</span></p>
                    )}
                    {i.fornecedorLocacao && (
                      <p className="text-xs text-gray-600">Fornecedor: <span className="font-medium">{i.fornecedorLocacao}</span></p>
                    )}
                    {i.dataVencimentoLocacao && (
                      <p className="text-xs text-gray-600">
                        Vencimento: <span className="font-medium">{new Date(i.dataVencimentoLocacao + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                      </p>
                    )}
                    {i.valorLocacaoMensal != null && (
                      <p className="text-xs text-gray-600">
                        Valor mensal: <span className="font-medium">R$ {Number(i.valorLocacaoMensal).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`inline-block text-xs font-bold px-2 py-1 rounded-full ${vencido ? "bg-red-600 text-white" : "bg-amber-500 text-white"}`}>
                      {vencido
                        ? `Vencido${i.diasParaVencimento < 0 ? ` há ${Math.abs(i.diasParaVencimento)}d` : ""}`
                        : `${i.diasParaVencimento}d`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={() => setOpen(false)} className="flex-1 h-9 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 font-medium transition">Fechar</button>
          <button
            onClick={() => { setOpen(false); setLocation("/equipamentos/locados"); }}
            className="flex-1 h-9 text-sm rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition"
          >
            Ver Equipamentos Locados
          </button>
        </div>
      </div>
    </div>
  );
}
