import { CreditCard, AlertTriangle, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";

/**
 * Rev. 4017 — Item 12 do docx de ajustes de Compras: mostrar os cartões de
 * crédito disponíveis (limite disponível estimado + fechamento/vencimento)
 * assim que "Cartão de Crédito" for selecionado como forma de pagamento em
 * Cotação/OC, pra ajudar a escolher o melhor cartão sem sair da tela de compra.
 *
 * Rev. 4019 — passa a considerar SÓ cartões escopo "FC" (nunca "local") e
 * destaca o cartão RECOMENDADO (melhor data de compra pro ciclo de fechamento/
 * vencimento + limite suficiente pro valor da compra, quando informado). A
 * escolha final é sempre do usuário — a recomendação é só uma sugestão.
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
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-400">
        Carregando cartões...
      </div>
    );
  }

  if (cartoes.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Nenhum cartão FC cadastrado (cartões "local" não entram aqui). Cadastre em Financeiro &gt; Cartões.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-2">
      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
        <CreditCard className="h-3.5 w-3.5" /> Cartões FC disponíveis
      </p>
      {recomendado && (
        <p className="text-xs text-blue-700 flex items-center gap-1.5 bg-blue-100/70 rounded-md px-2 py-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          Sugestão: <strong>{recomendado.banco || "Cartão"} {recomendado.final4 ? `•••• ${recomendado.final4}` : ""}</strong>
          {" "}— melhor data de compra{recomendado.diasFloat != null ? ` (~${recomendado.diasFloat} dias até o vencimento)` : ""}
          {valorCompra != null && recomendado.cabeNoLimite === false ? " · atenção: pode faltar limite" : ""}. Você pode escolher outro cartão se preferir.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {cartoes.map((c: any) => {
          const selecionado = cartaoIdSelecionado === c.id;
          return (
            <button
              key={c.id}
              type="button"
              disabled={!onSelecionarCartao}
              onClick={() => onSelecionarCartao?.(c.id)}
              className={`text-left bg-white rounded-md border p-2.5 transition-colors ${
                selecionado
                  ? "border-blue-500 ring-1 ring-blue-500"
                  : c.recomendado
                  ? "border-blue-300"
                  : "border-gray-200"
              } ${onSelecionarCartao ? "cursor-pointer hover:border-blue-400" : ""}`}
            >
              <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5 flex-wrap">
                {c.banco || "Cartão"} {c.final4 ? `•••• ${c.final4}` : ""}
                {c.alertaPessoal && <span className="text-[9px] font-bold text-amber-600 uppercase">(PF)</span>}
                {c.recomendado && (
                  <span className="text-[9px] font-bold text-blue-700 uppercase bg-blue-100 rounded px-1 py-0.5 flex items-center gap-0.5">
                    <Sparkles className="h-2.5 w-2.5" /> Recomendado
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-500">
                Fechamento: dia {c.diaFechamento ?? "—"} · Vencimento: dia {c.diaVencimento ?? "—"}
              </p>
              <p className={`text-sm font-semibold mt-1 ${c.cabeNoLimite === false ? "text-red-600" : "text-emerald-700"}`}>
                {c.limiteDisponivel != null
                  ? `Disponível (estimado): ${c.limiteDisponivel.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                  : "Limite não cadastrado"}
                {c.cabeNoLimite === false && " · insuficiente"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
