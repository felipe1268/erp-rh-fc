import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { DollarSign, Loader2, Save, RotateCcw, TrendingUp } from "lucide-react";

function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AdminPrecos() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.billing.adminGetPrices.useQuery();
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    const initial: Record<string, string> = {};
    for (const m of data.modules) initial[m.id] = (m.currentPriceCents / 100).toFixed(2);
    setDraft(initial);
  }, [data]);

  const saveMut = trpc.billing.adminUpdatePrices.useMutation({
    onSuccess: () => {
      toast.success("Preços atualizados. Novas contratações já usam os valores novos.");
      utils.billing.adminGetPrices.invalidate();
      utils.billing.getCatalog.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleChange = (id: string, value: string) => {
    setDraft(prev => ({ ...prev, [id]: value }));
  };

  const resetToDefault = (id: string, defaultCents: number) => {
    setDraft(prev => ({ ...prev, [id]: (defaultCents / 100).toFixed(2) }));
  };

  const handleSaveAll = () => {
    if (!data) return;
    const updates = data.modules
      .map(m => {
        const raw = draft[m.id];
        const parsed = Math.round(parseFloat((raw || "0").replace(",", ".")) * 100);
        return { id: m.id, monthlyPriceCents: isNaN(parsed) ? m.currentPriceCents : parsed };
      })
      .filter(u => u.monthlyPriceCents >= 0);
    saveMut.mutate({ updates });
  };

  if (isLoading || !data) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-orange-500" /> Ajuste de Preços do Catálogo
        </h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          Estratégia sugerida: comece com valores baixos para o cliente novo experimentar sem medo,
          e aumente gradualmente depois que ele já estiver acostumado com o sistema. Alterar aqui
          afeta apenas <strong>novas contratações e upgrades</strong> — quem já assina mantém o valor
          combinado no momento da adesão.
        </p>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-4 py-3 border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
          <span>Módulo</span>
          <span className="text-right">Padrão de fábrica</span>
          <span className="text-right">Valor atual cobrado</span>
          <span className="text-right">Novo valor (R$/mês)</span>
        </div>
        {data.modules.map(m => {
          const currentDraftCents = Math.round(parseFloat((draft[m.id] || "0").replace(",", ".")) * 100);
          const changed = !isNaN(currentDraftCents) && currentDraftCents !== m.currentPriceCents;
          return (
            <div key={m.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-4 py-3 border-b last:border-b-0">
              <span className="text-sm font-medium text-gray-800">{m.label}</span>
              <span className="text-sm text-gray-400 text-right">{formatCentsBRL(m.defaultPriceCents)}</span>
              <span className="text-sm text-gray-600 text-right">{formatCentsBRL(m.currentPriceCents)}</span>
              <div className="flex items-center gap-1 justify-end">
                <span className="text-xs text-gray-400">R$</span>
                <Input
                  value={draft[m.id] ?? ""}
                  onChange={(e) => handleChange(m.id, e.target.value)}
                  className={`w-24 h-8 text-right ${changed ? "border-orange-400 ring-1 ring-orange-200" : ""}`}
                  inputMode="decimal"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-orange-500"
                  title="Voltar ao padrão de fábrica"
                  onClick={() => resetToDefault(m.id, m.defaultPriceCents)}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-xl border bg-orange-50 border-orange-200 p-4">
        <div className="flex items-center gap-2 text-sm text-orange-700">
          <TrendingUp className="w-4 h-4" />
          Dica: comece baixo, aumente aos poucos conforme os clientes se acostumam.
        </div>
        <Button onClick={handleSaveAll} disabled={saveMut.isPending} className="bg-orange-500 hover:bg-orange-600">
          {saveMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar todos os preços
        </Button>
      </div>
    </div>
  );
}
