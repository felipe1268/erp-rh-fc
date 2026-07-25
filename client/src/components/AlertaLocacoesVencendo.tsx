/**
 * Rev. 4558 — Alerta GLOBAL de Locações a Vencer (abre no login) — REDESIGN.
 *
 * Evolução da Rev. 4554: além do aviso, agora o modal mostra a FOTO do
 * equipamento, o ciclo atual ("1ª Locação" / "Nª Renovação") e permite
 * RENOVAR DIRETO daqui (mini-formulário inline por item) — a renovação gera
 * uma nova OC de locação no Compras (fluxo real até o Contas a Pagar) e
 * registra o evento RENOVACAO na linha do tempo do equipamento.
 * Regras preservadas:
 * - 1x por sessão por empresa (sessionStorage `fcAlertaLocacaoShown:<companyId>`).
 * - Respeita o critério `almox_alerta_locacao_auto` (Critérios do Sistema);
 *   só decide DEPOIS da query de critérios resolver (sem race).
 * - O endpoint getItensLocadosVencendo já filtra pelas obras que o usuário
 *   tem permissão (getAlmoxAllowedObraIdSet).
 * - CTA leva a /equipamentos/locados (Devolver e detalhes ficam lá).
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, Camera, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";

export function AlertaLocacoesVencendo() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const [open, setOpen] = useState(false);
  // Mini-form de renovação inline (1 item expandido por vez)
  const [renId, setRenId] = useState<number | null>(null);
  const [renData, setRenData] = useState("");
  const [renValor, setRenValor] = useState("");

  const utils = trpc.useUtils();
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

  const renovarMut = trpc.equipamentos.locadoRenovar.useMutation({
    onSuccess: (data) => {
      utils.compras.getItensLocadosVencendo.invalidate();
      utils.equipamentos.locadosListar.invalidate();
      setRenId(null);
      toast.success(`${data.numeroCiclo}ª renovação registrada — OC ${data.numeroOc} gerada no Compras.`);
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao renovar a locação."),
  });

  useEffect(() => {
    if (!companyId || !alertaAtivo || itens.length === 0) return;
    const flagKey = `fcAlertaLocacaoShown:${companyId}`;
    if (sessionStorage.getItem(flagKey)) return;
    sessionStorage.setItem(flagKey, "1");
    setOpen(true);
  }, [companyId, alertaAtivo, itens.length]);

  if (!open || itens.length === 0) return null;

  function abrirRenInline(i: any) {
    setRenId(i.equipamentoLocadoId);
    try {
      const base = i.dataVencimentoLocacao || new Date().toISOString().slice(0, 10);
      const d = new Date(base + "T00:00:00");
      d.setDate(d.getDate() + 30);
      setRenData(d.toISOString().slice(0, 10));
    } catch { setRenData(""); }
    setRenValor(i.valorLocacaoMensal != null ? String(i.valorLocacaoMensal) : "");
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-xl mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-bold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Locações a Vencer ({itens.length})
          </h2>
          <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 pt-3">
          <p className="text-xs text-gray-600 break-words">
            Existem equipamentos locados com vencimento próximo ou vencido nas suas obras. Você pode <span className="font-semibold text-indigo-700">renovar direto por aqui</span> (gera a nova OC no Compras) ou abrir a tela de locados para devolver.
          </p>
        </div>
        <div className="p-4 space-y-2 overflow-y-auto">
          {(itens as any[]).map((i) => {
            const vencido = i.diasParaVencimento <= 0;
            const renov = Number(i.renovacoesCount) || 0;
            const emRenovacao = renId != null && renId === i.equipamentoLocadoId;
            return (
              <div key={i.id} className={`rounded-xl border overflow-hidden ${vencido ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                <div className="p-3 flex items-start gap-3">
                  {i.fotoLocado ? (
                    <img src={i.fotoLocado} className="w-14 h-14 rounded-lg object-cover ring-1 ring-black/10 flex-shrink-0" alt="" loading="lazy" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-white/70 ring-1 ring-black/10 flex items-center justify-center flex-shrink-0">
                      <Camera className="h-5 w-5 text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 break-words">{i.nome}</p>
                      <span className={`shrink-0 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${vencido ? "bg-red-600 text-white" : "bg-amber-500 text-white"}`}>
                        {vencido
                          ? `Vencido${i.diasParaVencimento < 0 ? ` há ${Math.abs(i.diasParaVencimento)}d` : " hoje"}`
                          : `Vence em ${i.diasParaVencimento}d`}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${renov > 0 ? "bg-indigo-100 text-indigo-700 border-indigo-300" : "bg-white text-gray-600 border-gray-300"}`}>
                        <RefreshCw className="h-2.5 w-2.5" />
                        {renov > 0 ? `${renov}ª Renovação` : "1ª Locação"}
                      </span>
                      {i.obraNome && <span className="text-[10px] text-gray-600 font-medium truncate">{i.obraNome}</span>}
                    </div>
                    <div className="text-xs text-gray-600 mt-1 space-x-2">
                      {i.dataVencimentoLocacao && (
                        <span>Venc.: <b>{new Date(i.dataVencimentoLocacao + "T00:00:00").toLocaleDateString("pt-BR")}</b></span>
                      )}
                      {i.valorLocacaoMensal != null && (
                        <span>R$ <b>{Number(i.valorLocacaoMensal).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>/mês</span>
                      )}
                    </div>
                    {i.fornecedorLocacao && <p className="text-[11px] text-gray-500 truncate mt-0.5">{i.fornecedorLocacao}</p>}
                  </div>
                </div>
                {i.equipamentoLocadoId != null && !emRenovacao && (
                  <div className="px-3 pb-3 flex justify-end">
                    <button
                      onClick={() => abrirRenInline(i)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition shadow-sm">
                      <RefreshCw className="h-3.5 w-3.5" /> Renovar ({renov + 1}ª renovação)
                    </button>
                  </div>
                )}
                {emRenovacao && (
                  <div className="px-3 pb-3">
                    <div className="bg-white rounded-lg border border-indigo-200 p-3 space-y-2">
                      <p className="text-[11px] text-indigo-800 break-words">Gera nova OC de locação no Compras e atualiza o vencimento.</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">Novo vencimento</label>
                          <input type="date" value={renData} onChange={e => setRenData(e.target.value)}
                            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">Valor da nova OC (R$)</label>
                          <input type="number" min="0.01" step="0.01" value={renValor} onChange={e => setRenValor(e.target.value)}
                            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0,00" />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setRenId(null)} disabled={renovarMut.isPending}
                          className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition disabled:opacity-50">Cancelar</button>
                        <button
                          onClick={() => {
                            const v = parseFloat(renValor);
                            if (!renData) { toast.error("Informe o novo vencimento."); return; }
                            if (!v || v <= 0) { toast.error("Informe o valor da nova OC."); return; }
                            renovarMut.mutate({ companyId, id: i.equipamentoLocadoId, novaDataFim: renData, valorOc: v });
                          }}
                          disabled={renovarMut.isPending}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition disabled:opacity-60 inline-flex items-center gap-1.5">
                          {renovarMut.isPending ? (<><Loader2 className="h-3 w-3 animate-spin" /> Renovando…</>) : (<><RefreshCw className="h-3 w-3" /> Confirmar</>)}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0">
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
