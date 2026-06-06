import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sparkles, ChevronRight, Power, PowerOff, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { QA_CHAT_MODULES, type QaChatModuleKey } from "@shared/aiModules";

// Rev. 2809 — Painel "Inteligência Artificial" das Configurações. Controla
// EXCLUSIVAMENTE o chat de "Perguntas e Respostas" (o botão verde flutuante /
// IAModuloChat), por persona ou todas de uma vez. Quando NENHUMA empresa está
// resolvível (admin-master, companyId = 0), o escopo é GLOBAL (vale p/ todas).
export function IAConfigSection() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;

  const [expanded, setExpanded] = useState(false);

  const utils = trpc.useUtils();
  // Sempre habilitada: companyId = 0 = escopo GLOBAL (não bloqueia mais a query,
  // que era a causa do antigo "0 de 0 ativas").
  const { data, isLoading } = trpc.aiConfig.getQaConfig.useQuery({ companyId });

  const invalidate = () => {
    utils.aiConfig.getQaConfig.invalidate({ companyId });
    utils.aiConfig.isQaModuloEnabled.invalidate();
  };

  const setModuloMut = trpc.aiConfig.setQaModulo.useMutation({
    onSuccess: invalidate,
    onError: () => toast.error("Erro ao salvar configuração de IA"),
  });
  const setTodosMut = trpc.aiConfig.setQaTodos.useMutation({
    onSuccess: invalidate,
    onError: () => toast.error("Erro ao atualizar IAs"),
  });

  // Lista SEMPRE a partir do catálogo estático (nunca "0 de 0"); o estado
  // ligado/desligado vem do servidor, default habilitado.
  const enabledMap = new Map((data?.modulos ?? []).map(m => [m.key, m.enabled]));
  const modulos = QA_CHAT_MODULES.map(m => ({
    ...m,
    enabled: enabledMap.get(m.key) ?? true,
  }));
  const ativas = modulos.filter(m => m.enabled).length;
  const total = modulos.length;
  const todasAtivas = ativas === total;

  const handleToggle = (modulo: QaChatModuleKey, enabled: boolean) => {
    setModuloMut.mutate(
      { companyId, modulo, enabled },
      {
        onSuccess: () =>
          toast.success(
            `Assistente de ${modulos.find(m => m.key === modulo)?.label ?? modulo} ${enabled ? "ativado" : "desativado"}`,
          ),
      },
    );
  };

  const handleTodos = (enabled: boolean) => {
    setTodosMut.mutate(
      { companyId, enabled },
      { onSuccess: () => toast.success(enabled ? "Assistente de IA ativado em todos os módulos" : "Assistente de IA desativado em todos os módulos") },
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
            <MessageCircle className="w-4 h-4 text-violet-500" />
            <span className="font-medium text-gray-800 text-sm">Assistente de Perguntas e Respostas</span>
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
              Liga/desliga o <strong>assistente de perguntas e respostas</strong> (o botão verde
              flutuante com o ícone <Sparkles className="inline w-3 h-3 -mt-0.5 text-emerald-600" />).
              Desative por módulo ou todos de uma vez. Ao desativar um módulo, o botão daquele
              módulo deixa de aparecer e as perguntas ficam bloqueadas (o restante do sistema
              continua normal). Padrão: todos ativos.
            </p>

            {/* Ações em massa */}
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <Button
                size="sm"
                variant="outline"
                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                disabled={setTodosMut.isPending || todasAtivas}
                onClick={() => handleTodos(true)}
              >
                <Power className="w-3.5 h-3.5 mr-1" />
                Ativar todos
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-gray-600 border-gray-200 hover:bg-gray-50"
                disabled={setTodosMut.isPending || ativas === 0}
                onClick={() => handleTodos(false)}
              >
                <PowerOff className="w-3.5 h-3.5 mr-1" />
                Desativar todos
              </Button>
            </div>

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
                        {m.enabled ? "Ligado" : "Desligado"}
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
          </div>
        )}
      </div>
    </div>
  );
}
