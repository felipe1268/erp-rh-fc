import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sparkles, ChevronRight, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";

export function IAConfigSection() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;

  const [expanded, setExpanded] = useState(false);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.aiConfig.getConfig.useQuery(
    { companyId },
    { enabled: !!companyId },
  );

  const setModuloMut = trpc.aiConfig.setModulo.useMutation({
    onSuccess: () => utils.aiConfig.getConfig.invalidate({ companyId }),
    onError: () => toast.error("Erro ao salvar configuração de IA"),
  });
  const setTodosMut = trpc.aiConfig.setTodos.useMutation({
    onSuccess: () => {
      utils.aiConfig.getConfig.invalidate({ companyId });
    },
    onError: () => toast.error("Erro ao atualizar IAs"),
  });

  const modulos = data?.modulos ?? [];
  const ativas = modulos.filter(m => m.enabled).length;
  const total = modulos.length;
  const todasAtivas = total > 0 && ativas === total;

  const handleToggle = (modulo: string, enabled: boolean) => {
    setModuloMut.mutate(
      { companyId, modulo: modulo as any, enabled },
      {
        onSuccess: () =>
          toast.success(`IA de ${modulos.find(m => m.key === modulo)?.label ?? modulo} ${enabled ? "ativada" : "desativada"}`),
      },
    );
  };

  const handleTodos = (enabled: boolean) => {
    setTodosMut.mutate(
      { companyId, enabled },
      { onSuccess: () => toast.success(enabled ? "Todas as IAs ativadas" : "Todas as IAs desativadas") },
    );
  };

  return (
    <div className="border rounded-lg overflow-hidden border-violet-200">
      {/* Header da seção de IA */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-50 text-xs font-bold text-violet-700 uppercase tracking-wider border-b border-violet-200">
        <Sparkles className="w-4 h-4" />
        Inteligência Artificial
      </div>

      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-violet-50/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <span className="font-medium text-gray-800 text-sm">Habilitar / Desabilitar IA por Módulo</span>
            {!isLoading && (
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  ativas === 0
                    ? "bg-gray-200 text-gray-600"
                    : todasAtivas
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                }`}
              >
                {ativas} de {total} ativas
              </span>
            )}
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>

        {expanded && (
          <div className="px-4 pb-4 bg-white space-y-3">
            <p className="text-xs text-gray-500">
              Controle, por empresa, quais funcionalidades de IA ficam disponíveis. Ao desativar
              um módulo, as ações de IA daquele módulo deixam de funcionar (o restante do sistema
              continua normal). Padrão: todas ativas.
            </p>

            {/* Ações em massa */}
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <Button
                size="sm"
                variant="outline"
                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                disabled={setTodosMut.isPending || todasAtivas || total === 0}
                onClick={() => handleTodos(true)}
              >
                <Power className="w-3.5 h-3.5 mr-1" />
                Ativar todas
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-gray-600 border-gray-200 hover:bg-gray-50"
                disabled={setTodosMut.isPending || ativas === 0 || total === 0}
                onClick={() => handleTodos(false)}
              >
                <PowerOff className="w-3.5 h-3.5 mr-1" />
                Desativar todas
              </Button>
            </div>

            {isLoading ? (
              <div className="text-center py-6 text-gray-400 text-sm">Carregando...</div>
            ) : (
              <div className="divide-y border rounded-lg">
                {modulos.map(m => (
                  <div key={m.key} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{m.label}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            m.enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {m.enabled ? "Ligada" : "Desligada"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{m.descricao}</p>
                    </div>
                    <Switch
                      checked={m.enabled}
                      disabled={setModuloMut.isPending || setTodosMut.isPending}
                      onCheckedChange={checked => handleToggle(m.key, checked)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
