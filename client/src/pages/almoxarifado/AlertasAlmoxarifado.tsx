import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Bell, CheckCircle2, X, Package, Truck, AlertTriangle,
  Clock, ChevronDown, ChevronUp, Eye,
} from "lucide-react";

const TIPO_LABELS: Record<string, { label: string; icon: typeof Bell; color: string }> = {
  oc_emitida:          { label: "OC Emitida",          icon: Package,       color: "text-blue-600 bg-blue-50" },
  entrega_programada:  { label: "Entrega Programada",  icon: Truck,         color: "text-green-600 bg-green-50" },
  entrega_proxima:     { label: "Entrega Próxima",     icon: Clock,         color: "text-amber-600 bg-amber-50" },
  divergencia:         { label: "Divergência",         icon: AlertTriangle, color: "text-red-600 bg-red-50" },
};

export default function AlertasAlmoxarifado({ companyId }: { companyId: number }) {
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | "pendentes">("pendentes");
  const [expandido, setExpandido] = useState<number | null>(null);

  const { data: alertas = [], refetch, isLoading } = trpc.warehouse.getNotificacoes.useQuery(
    { companyId, modulo: "almoxarifado", apenasNaoLidas: filtro === "pendentes" },
    { enabled: !!companyId }
  );

  const marcarLida = trpc.warehouse.marcarNotificacaoLida.useMutation({
    onSuccess: () => { refetch(); toast.success("Alerta marcado como recebido"); },
    onError: (err: any) => { toast.error(`Erro ao marcar alerta: ${err?.message || "Erro desconhecido"}`); },
  });

  const naoLidas = alertas.filter((a: any) => !a.lida).length;

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="relative flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-sm font-medium px-3 py-2 rounded-lg transition"
      >
        <Bell className="h-4 w-4" />
        Alertas
        {naoLidas > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end">
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right">
        <div className="bg-emerald-600 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Bell className="h-5 w-5" />
            <h2 className="text-lg font-bold">Alertas do Almoxarifado</h2>
          </div>
          <button onClick={() => setAberto(false)} className="text-white/80 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-2 px-5 py-3 border-b border-gray-100">
          <button
            onClick={() => setFiltro("pendentes")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition ${filtro === "pendentes" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            Pendentes ({naoLidas})
          </button>
          <button
            onClick={() => setFiltro("todos")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition ${filtro === "todos" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            Todos
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {isLoading && (
            <div className="text-center text-gray-400 py-10 text-sm">Carregando...</div>
          )}
          {!isLoading && alertas.length === 0 && (
            <div className="text-center text-gray-400 py-10">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Nenhum alerta {filtro === "pendentes" ? "pendente" : ""}</p>
            </div>
          )}
          {alertas.map((alerta: any) => {
            const tipoInfo = TIPO_LABELS[alerta.tipo] || { label: alerta.tipo, icon: Bell, color: "text-gray-600 bg-gray-50" };
            const IconComp = tipoInfo.icon;
            const isExpanded = expandido === alerta.id;

            return (
              <div
                key={alerta.id}
                className={`border rounded-lg transition ${alerta.lida ? "border-gray-100 bg-gray-50/50 opacity-70" : "border-emerald-200 bg-white shadow-sm"}`}
              >
                <div
                  className="flex items-start gap-3 p-3 cursor-pointer"
                  onClick={() => setExpandido(isExpanded ? null : alerta.id)}
                >
                  <div className={`rounded-full p-2 mt-0.5 ${tipoInfo.color}`}>
                    <IconComp className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${tipoInfo.color}`}>
                        {tipoInfo.label}
                      </span>
                      {!alerta.lida && (
                        <span className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-800 mt-1 truncate">{alerta.titulo}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(alerta.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!alerta.lida && (
                      <button
                        onClick={(e) => { e.stopPropagation(); marcarLida.mutate({ companyId, notificacaoId: alerta.id }); }}
                        className="text-emerald-600 hover:bg-emerald-50 rounded p-1 transition"
                        title="Marcar como recebido"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </div>

                {isExpanded && alerta.mensagem && (
                  <div className="px-4 pb-3 border-t border-gray-100">
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap mt-2 leading-relaxed font-sans">{alerta.mensagem}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
