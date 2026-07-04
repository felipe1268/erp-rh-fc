import { CreditCard, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";

/**
 * Rev. 4017 — Item 12 do docx de ajustes de Compras: mostrar os cartões de
 * crédito disponíveis (limite disponível estimado + fechamento/vencimento)
 * assim que "Cartão de Crédito" for selecionado como forma de pagamento em
 * Cotação/OC, pra ajudar a escolher o melhor cartão sem sair da tela de compra.
 */
export function CartaoDisponivelCard({ companyId }: { companyId: number }) {
  const q = trpc.cartao.resumoParaCompra.useQuery({ companyId }, { enabled: !!companyId });
  const cartoes = q.data ?? [];

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
        Nenhum cartão de crédito cadastrado. Cadastre em Financeiro &gt; Cartões.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-2">
      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
        <CreditCard className="h-3.5 w-3.5" /> Cartões disponíveis
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {cartoes.map((c: any) => (
          <div key={c.id} className="bg-white rounded-md border border-gray-200 p-2.5">
            <p className="text-sm font-medium text-gray-900">
              {c.banco || "Cartão"} {c.final4 ? `•••• ${c.final4}` : ""}
              {c.alertaPessoal && <span className="ml-1 text-[9px] font-bold text-amber-600 uppercase">(PF)</span>}
            </p>
            <p className="text-xs text-gray-500">
              Fechamento: dia {c.diaFechamento ?? "—"} · Vencimento: dia {c.diaVencimento ?? "—"}
            </p>
            <p className="text-sm font-semibold text-emerald-700 mt-1">
              {c.limiteDisponivel != null
                ? `Disponível (estimado): ${c.limiteDisponivel.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                : "Limite não cadastrado"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
