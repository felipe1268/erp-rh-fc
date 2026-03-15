import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  ClipboardList, Loader2, CheckCircle2, AlertTriangle,
  Play, Package, ChevronRight, XCircle, Building2, HardHat,
} from "lucide-react";

function n(v: any) { return parseFloat(v ?? "0") || 0; }
function fmt(v: any) { return n(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 }); }

type SessionItem = {
  id: number;
  itemId: number;
  itemNome: string | null;
  quantidadeSistema: string | null;
  quantidadeFisica: string | null;
  diferenca: string | null;
  status: string;
  observacoes: string | null;
  conferidoEm: string | null;
};

function ItemCard({
  item,
  onConfirm,
}: {
  item: SessionItem;
  onConfirm: (id: number, qtd: number, obs?: string) => void;
}) {
  const [modo, setModo] = useState<"idle" | "divergente">("idle");
  const [qtdFisica, setQtdFisica] = useState("");
  const [obs, setObs] = useState("");
  const sistemaQtd = n(item.quantidadeSistema);

  if (item.status === "conferido") {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle2 className="w-8 h-8 text-emerald-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{item.itemNome}</p>
          <p className="text-sm text-emerald-600">✅ Conferido — {fmt(item.quantidadeFisica)} un</p>
        </div>
      </div>
    );
  }

  if (item.status === "divergente") {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3">
        <AlertTriangle className="w-8 h-8 text-orange-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{item.itemNome}</p>
          <p className="text-sm text-orange-700">
            ⚠️ Divergência: sistema {fmt(item.quantidadeSistema)} → físico {fmt(item.quantidadeFisica)}
            {" "}({n(item.diferenca) >= 0 ? "+" : ""}{fmt(item.diferenca)})
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
          <Package className="w-5 h-5 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{item.itemNome}</p>
          <p className="text-sm text-gray-500">Sistema diz: <strong>{fmt(sistemaQtd)}</strong> un</p>
        </div>
      </div>

      {modo === "idle" ? (
        <div className="flex gap-2">
          <button
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl text-base active:scale-95 transition"
            onClick={() => onConfirm(item.id, sistemaQtd)}
          >
            ✅ BATE
          </button>
          <button
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-xl text-base active:scale-95 transition"
            onClick={() => { setModo("divergente"); setQtdFisica(""); }}
          >
            ⚠️ DIFERENTE
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Quantidade física encontrada:</label>
          <input
            type="number"
            inputMode="decimal"
            className="w-full border-2 border-orange-300 rounded-xl p-4 text-xl font-bold text-center focus:outline-none focus:border-orange-500"
            placeholder="0"
            value={qtdFisica}
            onChange={e => setQtdFisica(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            className="w-full border rounded-xl p-3 text-sm"
            placeholder="Observação (opcional)"
            value={obs}
            onChange={e => setObs(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="flex-1 bg-gray-200 text-gray-700 font-bold py-3 rounded-xl text-sm"
              onClick={() => setModo("idle")}
            >
              Cancelar
            </button>
            <button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50"
              disabled={!qtdFisica}
              onClick={() => onConfirm(item.id, parseFloat(qtdFisica), obs || undefined)}
            >
              Confirmar divergência
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AlmoxarifadoInventario() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;
  const utils = trpc.useUtils();

  const [obraContexto, setObraContexto] = useState<number | null>(null);

  const { data: obrasAtivas = [] } = trpc.obras.listActive.useQuery(
    { companyId, companyIds: [companyId] }, { enabled: !!companyId }
  );

  const { data: session, isLoading: loadingSession } = trpc.warehouse.getInventorySession.useQuery(
    { companyId, obraId: obraContexto },
    { enabled: !!companyId }
  );

  const { data: sessionItems = [], isLoading: loadingItems } = trpc.warehouse.getInventorySessionItems.useQuery(
    { sessionId: session?.id ?? 0 },
    { enabled: !!session?.id }
  );

  const startSession = trpc.warehouse.startInventorySession.useMutation({
    onSuccess: () => {
      utils.warehouse.getInventorySession.invalidate();
      toast.success("Sessão de inventário iniciada!");
    },
    onError: (e) => toast.error(e.message),
  });

  const confirmItem = trpc.warehouse.confirmInventoryItem.useMutation({
    onSuccess: (data) => {
      utils.warehouse.getInventorySessionItems.invalidate();
      utils.warehouse.getInventorySession.invalidate();
      if (data.status === "conferido") toast.success("Item conferido ✅");
      else toast.warning(`Divergência registrada: ${data.diferenca >= 0 ? "+" : ""}${fmt(data.diferenca)}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const finishSession = trpc.warehouse.finishInventorySession.useMutation({
    onSuccess: () => {
      utils.warehouse.getInventorySession.invalidate();
      toast.success("Inventário concluído!");
    },
  });

  const cancelSession = trpc.warehouse.cancelInventorySession.useMutation({
    onSuccess: () => {
      utils.warehouse.getInventorySession.invalidate();
      utils.warehouse.getInventorySessionItems.invalidate();
      toast.success("Inventário cancelado.");
    },
    onError: (e) => toast.error(e.message),
  });

  if (loadingSession) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
        </div>
      </DashboardLayout>
    );
  }

  const conferidos = sessionItems.filter(i => i.status !== "pendente").length;
  const divergentes = sessionItems.filter(i => i.status === "divergente").length;
  const total = sessionItems.length;
  const progresso = total > 0 ? Math.round((conferidos / total) * 100) : 0;
  const pendentes = sessionItems.filter(i => i.status === "pendente");
  const finalizados = sessionItems.filter(i => i.status !== "pendente");

  const nomeContexto = obraContexto === null
    ? "Central"
    : obrasAtivas.find((o: any) => o.id === obraContexto)?.nome ?? "Obra";

  return (
    <DashboardLayout>
      {/* Seletor de contexto */}
      <div className="bg-white border-b border-gray-100 px-4 py-2">
        <div className="max-w-2xl mx-auto flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setObraContexto(null)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition shrink-0 ${
              obraContexto === null
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            Central
          </button>
          {obrasAtivas.map((obra: any) => (
            <button
              key={obra.id}
              onClick={() => setObraContexto(obra.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition shrink-0 ${
                obraContexto === obra.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <HardHat className="h-3.5 w-3.5" />
              {obra.codigo ? `${obra.codigo} – ${obra.nome}` : obra.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 max-w-2xl mx-auto px-2 pt-4">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inventário Semanal</h1>
            <p className="text-sm text-gray-500 mt-1">
              {session
                ? `${nomeContexto} · Semana ${session.semanaRef}`
                : `${nomeContexto} · Nenhuma sessão ativa esta semana`}
            </p>
          </div>
          {session && session.status === "em_andamento" && (
            <button
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 text-sm font-semibold active:scale-95 transition disabled:opacity-50"
              disabled={cancelSession.isPending}
              onClick={() => {
                if (window.confirm("Cancelar o inventário desta semana? Todos os dados registrados serão apagados.")) {
                  cancelSession.mutate({ sessionId: session.id });
                }
              }}
            >
              {cancelSession.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <XCircle className="w-4 h-4" />}
              Cancelar
            </button>
          )}
        </div>

        {/* Sem sessão ativa */}
        {!session && (
          <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-10 text-center space-y-4">
            <ClipboardList className="w-16 h-16 text-gray-300 mx-auto" />
            <div>
              <p className="text-lg font-semibold text-gray-700">Nenhum inventário desta semana</p>
              <p className="text-sm text-gray-500 mt-1">
                Inicie para contar todos os itens do almoxarifado
              </p>
            </div>
            <button
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-8 py-4 rounded-xl text-lg flex items-center gap-2 mx-auto active:scale-95 transition disabled:opacity-50"
              disabled={startSession.isPending}
              onClick={() => startSession.mutate({ companyId, obraId: obraContexto })}
            >
              {startSession.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Play className="w-5 h-5" />
              )}
              Iniciar Inventário
            </button>
          </div>
        )}

        {/* Sessão ativa */}
        {session && (
          <>
            {/* Barra de progresso */}
            <div className="bg-white rounded-xl border p-4 space-y-3">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-gray-600">Progresso</span>
                <span className="text-gray-900">{conferidos}/{total} itens</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                  className="h-4 rounded-full transition-all duration-500"
                  style={{
                    width: `${progresso}%`,
                    background: progresso === 100 ? "#10b981" : "#3b82f6",
                  }}
                />
              </div>
              <div className="flex gap-4 text-xs text-center">
                <div className="flex-1 bg-gray-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-gray-900">{total - conferidos}</p>
                  <p className="text-gray-500">Pendentes</p>
                </div>
                <div className="flex-1 bg-emerald-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-emerald-700">{conferidos - divergentes}</p>
                  <p className="text-emerald-600">OK</p>
                </div>
                <div className="flex-1 bg-orange-50 rounded-lg p-2">
                  <p className="text-lg font-bold text-orange-700">{divergentes}</p>
                  <p className="text-orange-600">Divergentes</p>
                </div>
              </div>
            </div>

            {/* Botão concluir */}
            {session.status === "em_andamento" && conferidos === total && total > 0 && (
              <button
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-2 active:scale-95 transition"
                onClick={() => finishSession.mutate({ sessionId: session.id })}
              >
                <CheckCircle2 className="w-5 h-5" />
                Concluir Inventário
              </button>
            )}

            {/* Inventário concluído */}
            {session.status === "concluido" && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                <p className="text-lg font-bold text-emerald-800">Inventário Concluído!</p>
                <p className="text-sm text-emerald-600 mt-1">
                  {conferidos - divergentes} itens OK · {divergentes} divergências
                </p>
              </div>
            )}

            {/* Itens pendentes */}
            {loadingItems ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              </div>
            ) : (
              <div className="space-y-2">
                {pendentes.length > 0 && (
                  <>
                    <p className="text-sm font-semibold text-gray-700 px-1">
                      Aguardando conferência ({pendentes.length})
                    </p>
                    {pendentes.map(item => (
                      <ItemCard
                        key={item.id}
                        item={item as any}
                        onConfirm={(id, qtd, obs) =>
                          confirmItem.mutate({
                            sessionItemId: id,
                            quantidadeFisica: qtd,
                            observacoes: obs,
                          })
                        }
                      />
                    ))}
                  </>
                )}

                {finalizados.length > 0 && (
                  <>
                    <p className="text-sm font-semibold text-gray-500 px-1 mt-4">
                      Já conferidos ({finalizados.length})
                    </p>
                    {finalizados.map(item => (
                      <ItemCard
                        key={item.id}
                        item={item as any}
                        onConfirm={(id, qtd, obs) =>
                          confirmItem.mutate({
                            sessionItemId: id,
                            quantidadeFisica: qtd,
                            observacoes: obs,
                          })
                        }
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
