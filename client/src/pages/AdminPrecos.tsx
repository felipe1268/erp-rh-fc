import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { DollarSign, Loader2, Save, RotateCcw, TrendingUp, Building2, EyeOff, Eye, Wallet } from "lucide-react";
import { MODULES } from "@/pages/portal/modulesData";

const MODULE_ICON_MAP = new Map(MODULES.map(m => [m.id, m]));

function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AdminPrecos() {
  const [, navigate] = useLocation();
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

  const toggleMut = trpc.billing.adminSetModuleActive.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(
        variables.isActive
          ? "Módulo liberado para venda novamente."
          : "Módulo retirado da vitrine — novos clientes não verão mais esta opção."
      );
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

  const activeCount = data.modules.filter(m => m.isActive).length;
  const inactiveCount = data.modules.length - activeCount;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-orange-500" /> Catálogo de Módulos & Preços
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Aqui você controla o que aparece na vitrine ("/planos") para novos clientes: o
            <strong> valor cobrado</strong> por módulo e se ele está <strong>à venda</strong> no
            momento. Desativar um módulo tira ele da vitrine e do checkout, mas quem já contratou
            continua com acesso normalmente. Alterações de preço afetam apenas{" "}
            <strong>novas contratações e upgrades</strong>.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/admin/saas")} className="shrink-0">
          <Building2 className="w-4 h-4 mr-2" /> Empresas-cliente
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-sm">
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5">
          <Eye className="w-3.5 h-3.5" /> {activeCount} à venda
        </Badge>
        {inactiveCount > 0 && (
          <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200 gap-1.5">
            <EyeOff className="w-3.5 h-3.5" /> {inactiveCount} fora de venda
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.modules.map(m => {
          const currentDraftCents = Math.round(parseFloat((draft[m.id] || "0").replace(",", ".")) * 100);
          const changed = !isNaN(currentDraftCents) && currentDraftCents !== m.currentPriceCents;
          const isSeat = m.id === "seat";
          const disabled = !m.isActive;
          const moduleInfo = MODULE_ICON_MAP.get(m.id);
          const ModuleIcon = moduleInfo?.icon || Wallet;
          return (
            <div
              key={m.id}
              className={`rounded-xl border p-4 space-y-3 transition-colors ${
                disabled ? "bg-gray-50 border-gray-200" : "bg-white border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br ${
                      disabled ? "from-gray-300 to-gray-400" : moduleInfo?.color || "from-orange-500 to-amber-600"
                    }`}
                  >
                    <ModuleIcon className="w-[18px] h-[18px] text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${disabled ? "text-gray-400" : "text-gray-800"}`}>
                      {m.label}
                    </p>
                    {m.description && (
                      <p className={`text-xs mt-0.5 line-clamp-2 ${disabled ? "text-gray-400" : "text-gray-500"}`}>
                        {m.description}
                      </p>
                    )}
                  </div>
                </div>
                {!isSeat && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-medium ${disabled ? "text-gray-400" : "text-emerald-600"}`}>
                      {disabled ? "Fora de venda" : "À venda"}
                    </span>
                    <Switch
                      checked={m.isActive}
                      disabled={toggleMut.isPending}
                      onCheckedChange={(checked) => toggleMut.mutate({ id: m.id, isActive: checked })}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-gray-400">
                <span>Padrão de fábrica: {formatCentsBRL(m.defaultPriceCents)}</span>
                <span>Cobrado hoje: {formatCentsBRL(m.currentPriceCents)}</span>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400">R$</span>
                <Input
                  value={draft[m.id] ?? ""}
                  onChange={(e) => handleChange(m.id, e.target.value)}
                  className={`h-8 text-right flex-1 ${changed ? "border-orange-400 ring-1 ring-orange-200" : ""}`}
                  inputMode="decimal"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-orange-500 shrink-0"
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

      <div className="flex items-center justify-between rounded-xl border bg-orange-50 border-orange-200 p-4 flex-wrap gap-3">
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
