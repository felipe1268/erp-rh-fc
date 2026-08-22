import { CreditCard, AlertTriangle, Sparkles, CheckCircle2, CalendarClock, Wallet2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

/**
 * Rev. 4017 — Item 12 do docx de ajustes de Compras: mostrar os cartões de
 * crédito disponíveis (limite disponível estimado + fechamento/vencimento)
 * assim que "Cartão de Crédito" for selecionado como forma de pagamento em
 * Cotação/OC, pra ajudar a escolher o melhor cartão sem sair da tela de compra.
 *
 * Mostra todos os cartões ativos cadastrados na empresa, inclusive os de
 * escopo local, e destaca o cartão RECOMENDADO (melhor data de compra pro
 * ciclo de fechamento/vencimento + limite suficiente pro valor da compra,
 * quando informado). A escolha final é sempre do usuário — a recomendação
 * é só uma sugestão.
 *
 * Rev. 4020 — layout modernizado pra combinar com o resto do modal de
 * Condições de Pagamento (cards com ring/hover, badges arredondados, ícones
 * em box colorido) — puramente visual, mesma lógica de dados.
 */
export function CartaoDisponivelCard({
  companyId,
  valorCompra,
  cartaoIdSelecionado,
  onSelecionarCartao,
}: {
  companyId: number;
  valorCompra?: number | null;
  cartaoIdSelecionado?: number | null;
  onSelecionarCartao?: (cartaoId: number) => void;
}) {
  const q = trpc.cartao.resumoParaCompra.useQuery(
    { companyId, valorCompra: valorCompra ?? undefined },
    { enabled: !!companyId },
  );
  const cartoes = q.data ?? [];
  const recomendado = cartoes.find((c: any) => c.recomendado);

  if (q.isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-400 flex items-center gap-2">
        <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin" />
        Carregando cartões...
      </div>
    );
  }

  if (cartoes.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="h-4 w-4" />
        </div>
        Nenhum cartão ativo habilitado para Compras. Cadastre/ajuste em Financeiro &gt; Cartões.
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/70 via-white to-white p-4 lg:p-5 shadow-sm space-y-3.5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center">
            <CreditCard className="w-4 h-4" />
          </div>
          <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-[0.12em]">Cartões habilitados para Compras</h4>
        </div>
        {cartaoIdSelecionado != null && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Selecionado
          </span>
        )}
      </div>

      {recomendado && (
        <div className="flex items-start gap-2.5 rounded-lg border border-violet-200 bg-violet-100/60 px-3 py-2.5">
          <Sparkles className="h-4 w-4 shrink-0 text-violet-600 mt-0.5" />
          <p className="text-xs text-violet-800 leading-snug">
            <strong>Sugestão:</strong> {recomendado.banco || "Cartão"} {recomendado.final4 ? `•••• ${recomendado.final4}` : ""}
            {" "}— melhor data de compra{recomendado.diasFloat != null ? ` (~${recomendado.diasFloat} dias até o vencimento)` : ""}
            {valorCompra != null && recomendado.cabeNoLimite === false ? " · atenção: pode faltar limite" : ""}.
            {" "}Você pode escolher outro cartão se preferir.
          </p>
        </div>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2">
        {cartoes.map((c: any) => {
          const selecionado = cartaoIdSelecionado === c.id;
          const semLimiteInfo = c.limiteDisponivel == null;
          const insuficiente = c.cabeNoLimite === false;
          return (
            <button
              key={c.id}
              type="button"
              disabled={!onSelecionarCartao}
              onClick={() => onSelecionarCartao?.(c.id)}
              className={`relative text-left bg-white rounded-xl border-2 p-3.5 transition-all ${
                selecionado
                  ? "border-violet-500 ring-2 ring-violet-200 shadow-md"
                  : c.recomendado
                  ? "border-violet-300 hover:border-violet-400 hover:shadow-sm"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              } ${onSelecionarCartao ? "cursor-pointer" : "cursor-default"}`}
            >
              {selecionado && (
                <span className="absolute top-2.5 right-2.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-600 text-white">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </span>
              )}
              <div className="flex items-center gap-2 flex-wrap pr-6">
                <p className="text-sm font-bold text-gray-900">
                  {c.banco || "Cartão"} {c.final4 ? `•••• ${c.final4}` : ""}
                </p>
                {c.alertaPessoal && (
                  <span className="text-[9px] font-bold text-amber-700 uppercase bg-amber-100 rounded-full px-1.5 py-0.5">PF</span>
                )}
                {c.finalidade === "recorrentes" && (
                  <span className="text-[9px] font-bold text-blue-700 uppercase bg-blue-100 rounded-full px-1.5 py-0.5">Recorrentes</span>
                )}
                {c.recomendado && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-violet-700 uppercase bg-violet-100 rounded-full px-1.5 py-0.5">
                    <Sparkles className="h-2.5 w-2.5" /> Recomendado
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
                <CalendarClock className="w-3 h-3 flex-shrink-0" />
                Fechamento dia {c.diaFechamento ?? "—"} · Vencimento dia {c.diaVencimento ?? "—"}
              </div>
              <div className={`mt-2 flex items-center gap-1.5 text-sm font-semibold ${insuficiente ? "text-red-600" : semLimiteInfo ? "text-gray-400 font-normal" : "text-emerald-700"}`}>
                <Wallet2 className="w-3.5 h-3.5 flex-shrink-0" />
                {c.limiteDisponivel != null
                  ? `${c.limiteDisponivel.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} disponível`
                  : "Limite não cadastrado"}
                {insuficiente && (
                  <span className="text-[9px] font-bold uppercase bg-red-100 text-red-700 rounded-full px-1.5 py-0.5">Insuficiente</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
