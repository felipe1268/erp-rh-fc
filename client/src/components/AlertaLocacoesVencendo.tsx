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

  const vencidos = (itens as any[]).filter((i) => i.diasParaVencimento <= 0).length;
  const aVencer = itens.length - vencidos;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm">
      <div className="absolute inset-0 bg-slate-50 flex flex-col overflow-hidden">
        {/* Header full-width moderno */}
        <div className="relative flex-shrink-0 bg-gradient-to-br from-slate-900 via-slate-800 to-amber-900 text-white overflow-hidden">
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 left-1/3 w-72 h-72 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />
          <div className="relative max-w-6xl mx-auto w-full px-4 sm:px-6 pt-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/20 ring-1 ring-amber-400/40 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-amber-300" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight break-words">Locações a Vencer</h2>
                  <p className="text-xs text-slate-300 break-words">Renove direto daqui — a nova OC é gerada no Compras e segue ao Contas a Pagar.</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition flex-shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3 max-w-md">
              <div className="rounded-xl bg-white/10 ring-1 ring-white/10 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-300 font-semibold">Total</p>
                <p className="text-xl font-bold leading-tight">{itens.length}</p>
              </div>
              <div className="rounded-xl bg-red-500/15 ring-1 ring-red-400/30 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-red-300 font-semibold">Vencidas</p>
                <p className="text-xl font-bold leading-tight text-red-200">{vencidos}</p>
              </div>
              <div className="rounded-xl bg-amber-500/15 ring-1 ring-amber-400/30 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold">A vencer</p>
                <p className="text-xl font-bold leading-tight text-amber-200">{aVencer}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Grid de cards */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
          {(itens as any[]).map((i) => {
            const vencido = i.diasParaVencimento <= 0;
            const renov = Number(i.renovacoesCount) || 0;
            const emRenovacao = renId != null && renId === i.equipamentoLocadoId;
            return (
              <div key={i.id} className="rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                {/* Faixa de status no topo */}
                <div className={`h-1.5 w-full ${vencido ? "bg-red-500" : "bg-amber-400"}`} />
                <div className="p-4 flex items-start gap-3">
                  {i.fotoLocado ? (
                    <img src={i.fotoLocado} className="w-16 h-16 rounded-xl object-cover ring-1 ring-slate-200 flex-shrink-0 pointer-events-none select-none" alt="" loading="lazy" draggable={false} />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
                      <Camera className="h-5 w-5 text-slate-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 break-words leading-snug">{i.nome}</p>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${vencido ? "bg-red-100 text-red-700 ring-1 ring-red-200" : "bg-amber-100 text-amber-800 ring-1 ring-amber-200"}`}>
                        {vencido
                          ? `Vencido${i.diasParaVencimento < 0 ? ` há ${Math.abs(i.diasParaVencimento)}d` : " hoje"}`
                          : `Vence em ${i.diasParaVencimento}d`}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${renov > 0 ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"}`}>
                        <RefreshCw className="h-2.5 w-2.5" />
                        {renov > 0 ? `${renov}ª Renovação` : "1ª Locação"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="px-4 pb-3 space-y-1 text-xs text-slate-600">
                  {i.obraNome && <p className="break-words"><span className="text-slate-400 font-medium">Obra:</span> {i.obraNome}</p>}
                  {i.fornecedorLocacao && <p className="break-words"><span className="text-slate-400 font-medium">Fornecedor:</span> {i.fornecedorLocacao}</p>}
                  <div className="flex items-center justify-between pt-1">
                    {i.dataVencimentoLocacao ? (
                      <span>Venc.: <b className="text-slate-800">{new Date(i.dataVencimentoLocacao + "T00:00:00").toLocaleDateString("pt-BR")}</b></span>
                    ) : <span />}
                    {i.valorLocacaoMensal != null && (
                      <span className="font-bold text-slate-900">R$ {Number(i.valorLocacaoMensal).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="text-[10px] font-medium text-slate-500">/mês</span></span>
                    )}
                  </div>
                </div>
                {i.equipamentoLocadoId != null && !emRenovacao && (
                  <div className="px-4 pb-4 mt-auto">
                    <button
                      onClick={() => abrirRenInline(i)}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition shadow-sm">
                      <RefreshCw className="h-3.5 w-3.5" /> Renovar ({renov + 1}ª renovação)
                    </button>
                  </div>
                )}
                {emRenovacao && (
                  <div className="px-4 pb-4 mt-auto">
                    <div className="bg-indigo-50/60 rounded-xl border border-indigo-200 p-3 space-y-2">
                      <p className="text-[11px] text-indigo-800 break-words">Gera nova OC de locação no Compras e atualiza o vencimento.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="min-w-0">
                          <label className="block text-[10px] font-semibold text-gray-600 mb-0.5">Novo vencimento</label>
                          <input type="date" value={renData} onChange={e => setRenData(e.target.value)}
                            className="w-full min-w-0 max-w-full appearance-none border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div className="min-w-0">
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
        </div>

        {/* Footer fixo */}
        <div className="flex-shrink-0 bg-white/90 backdrop-blur border-t border-slate-200">
          <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-3 flex gap-3">
            <button onClick={() => setOpen(false)} className="flex-1 sm:flex-none sm:px-8 h-11 text-sm border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50 font-medium transition">Fechar</button>
            <button
              onClick={() => { setOpen(false); setLocation("/equipamentos/locados"); }}
              className="flex-1 h-11 text-sm rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold transition shadow-sm"
            >
              Ver Equipamentos Locados
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
