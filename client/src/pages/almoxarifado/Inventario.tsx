import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  ClipboardList, Loader2, CheckCircle2, AlertTriangle,
  Play, Package, ChevronRight, XCircle, Building2, HardHat, Search,
} from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

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
  podeEditar,
}: {
  item: SessionItem;
  onConfirm: (id: number, qtd: number, obs?: string) => void;
  podeEditar: boolean;
}) {
  // Rev. 4005 — permite reabrir um item já conferido/divergente para correção
  // ENQUANTO a sessão ainda está em andamento (o backend já aceitava re-confirmar,
  // só faltava a UI expor isso — sem isso um toque errado ficava travado até finalizar).
  const [modo, setModo] = useState<"idle" | "divergente" | "editando">("idle");
  const [qtdFisica, setQtdFisica] = useState("");
  const [obs, setObs] = useState("");
  // Rev. 2439 — overlay de foto ampliada (toque na thumb).
  const [fotoExpandida, setFotoExpandida] = useState<string | null>(null);
  const sistemaQtd = n(item.quantidadeSistema);

  // Rev. 2439 — Overlay reutilizado pelos 3 states (conferido, divergente, idle).
  const overlay = fotoExpandida ? (
    <div
      className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4"
      onClick={() => setFotoExpandida(null)}
    >
      <img src={fotoExpandida} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
      <button
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 text-gray-800 font-bold shadow-lg flex items-center justify-center"
        onClick={() => setFotoExpandida(null)}
        aria-label="Fechar"
      >×</button>
    </div>
  ) : null;

  const fotoUrlBase: string | null = (item as any).itemFotoUrl ?? null;
  const unidadeBase: string = (item as any).itemUnidade ?? "un";

  function abrirEdicao() {
    setQtdFisica(item.quantidadeFisica ?? "");
    setObs(item.observacoes ?? "");
    setModo("editando");
  }

  if ((item.status === "conferido" || item.status === "divergente") && modo !== "editando") {
    const isConferido = item.status === "conferido";
    const fUrl = fotoUrlBase;
    return (
      <div className={`${isConferido ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"} border rounded-xl p-4 flex items-center gap-3`}>
        {overlay}
        {fUrl ? (
          <img
            src={fUrl}
            alt={item.itemNome ?? ""}
            className={`w-12 h-12 rounded-lg object-cover flex-shrink-0 border cursor-pointer ${isConferido ? "border-emerald-200" : "border-orange-200"}`}
            loading="lazy"
            onClick={() => setFotoExpandida(fUrl)}
          />
        ) : isConferido ? (
          <CheckCircle2 className="w-8 h-8 text-emerald-500 flex-shrink-0" />
        ) : (
          <AlertTriangle className="w-8 h-8 text-orange-500 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{item.itemNome}</p>
          {isConferido ? (
            <p className="text-sm text-emerald-600">✅ Conferido — {fmt(item.quantidadeFisica)} un</p>
          ) : (
            <p className="text-sm text-orange-700">
              ⚠️ Divergência: sistema {fmt(item.quantidadeSistema)} → físico {fmt(item.quantidadeFisica)}
              {" "}({n(item.diferenca) >= 0 ? "+" : ""}{fmt(item.diferenca)})
            </p>
          )}
        </div>
        {podeEditar && (
          <button
            type="button"
            onClick={abrirEdicao}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition"
            title="Corrigir esta contagem"
          >
            Corrigir
          </button>
        )}
      </div>
    );
  }

  // Rev. 2439 — Thumbnail da foto do item (vem do JOIN com almoxarifado_itens).
  // Clicável: abre overlay com foto ampliada (facilita aferição no iPad).
  const fotoUrl = fotoUrlBase;
  const unidade = unidadeBase;

  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      {overlay}
      <div className="flex items-center gap-3">
        {fotoUrl ? (
          <img
            src={fotoUrl}
            alt={item.itemNome ?? ""}
            className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-gray-200 cursor-pointer hover:ring-2 hover:ring-emerald-300 transition"
            loading="lazy"
            onClick={() => setFotoExpandida(fotoUrl)}
            title="Toque pra ampliar"
          />
        ) : (
          <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Package className="w-6 h-6 text-gray-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{item.itemNome}</p>
          <p className="text-sm text-gray-500">Sistema diz: <strong>{fmt(sistemaQtd)}</strong> {unidade}</p>
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
          {modo === "editando" && (
            <p className="text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg px-2 py-1">✏️ Corrigindo contagem já registrada</p>
          )}
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
              onClick={() => { onConfirm(item.id, parseFloat(qtdFisica), obs || undefined); setModo("idle"); }}
            >
              {modo === "editando" ? "Salvar correção" : "Confirmar divergência"}
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
  // Rev. 2432 — abre AlertDialog estilizado no lugar do window.confirm nativo.
  const [confirmCancelar, setConfirmCancelar] = useState(false);
  // Rev. 2659 — campo de busca por nome/código do item.
  const [busca, setBusca] = useState("");

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

  const conferidos = sessionItems.filter(i => i.status !== "pendente").length;
  const divergentes = sessionItems.filter(i => i.status === "divergente").length;
  const total = sessionItems.length;
  const progresso = total > 0 ? Math.round((conferidos / total) * 100) : 0;

  // Rev. 2659 — busca por nome/código do item (igual ao Almoxarifado): filtra
  // as listas exibidas sem mexer nos totais/progresso (que seguem a sessão inteira).
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const matchBusca = (i: any) => {
    const q = norm(busca.trim());
    if (!q) return true;
    const nome = norm(String(i.itemNome ?? ""));
    const codigo = norm(String(i.itemCodigoInterno ?? ""));
    return nome.includes(q) || codigo.includes(q);
  };
  const pendentes = useMemo(
    () => sessionItems.filter(i => i.status === "pendente" && matchBusca(i)),
    [sessionItems, busca],
  );
  const finalizados = useMemo(
    () => sessionItems.filter(i => i.status !== "pendente" && matchBusca(i)),
    [sessionItems, busca],
  );

  const nomeContexto = obraContexto === null
    ? "Central"
    : obrasAtivas.find((o: any) => o.id === obraContexto)?.nome ?? "Obra";

  // Rev. 2546 — early return DEPOIS de todos os hooks (evita
  // "Rendered more hooks than during the previous render").
  if (loadingSession) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Seletor de contexto */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {obraContexto === null
            ? <Building2 className="h-4 w-4 text-emerald-600 shrink-0" />
            : <HardHat className="h-4 w-4 text-blue-600 shrink-0" />}
          <select
            value={obraContexto ?? "central"}
            onChange={e => {
              const v = e.target.value;
              setObraContexto(v === "central" ? null : Number(v));
            }}
            className="flex-1 h-9 text-sm font-medium border border-gray-200 rounded-lg px-3 bg-white text-gray-800 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
          >
            <option value="central">🏢 Almoxarifado Central</option>
            {obrasAtivas.length > 0 && (
              <optgroup label="── Por Obra ──">
                {obrasAtivas.map((obra: any) => (
                  <option key={obra.id} value={obra.id}>
                    🏗️ {obra.codigo ? `${obra.codigo} – ${obra.nome}` : obra.nome}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
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
              onClick={() => setConfirmCancelar(true)}
            >
              {cancelSession.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <XCircle className="w-4 h-4" />}
              Cancelar
            </button>
          )}
        </div>

        {/* Rev. 2432 — AlertDialog substitui window.confirm nativo (mostrava
            URL do host + "Bloquear caixas de diálogo" no iOS). */}
        <AlertDialog open={confirmCancelar} onOpenChange={setConfirmCancelar}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" /> Cancelar inventário desta semana?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 pt-2">
                <span className="block">
                  Todos os dados registrados nesta sessão serão <span className="font-semibold text-red-600">apagados</span> e a contagem terá que ser refeita do zero.
                </span>
                {session && (
                  <span className="block text-xs text-slate-500">
                    Semana <span className="font-mono font-semibold text-slate-700">{session.semanaRef}</span> · {nomeContexto}
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelSession.isPending}>Manter inventário</AlertDialogCancel>
              <AlertDialogAction
                disabled={cancelSession.isPending}
                onClick={() => {
                  if (session) cancelSession.mutate({ sessionId: session.id });
                  setConfirmCancelar(false);
                }}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                {cancelSession.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                Sim, cancelar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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

            {/* Rev. 2659 — Busca por nome/código do item (igual ao Almoxarifado) */}
            {total > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar item por nome ou código…"
                  className="w-full h-11 pl-10 pr-10 text-sm border border-gray-200 rounded-xl bg-white text-gray-800 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                />
                {busca && (
                  <button
                    onClick={() => setBusca("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label="Limpar busca"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
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
                        podeEditar={session.status === "em_andamento"}
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
                        podeEditar={session.status === "em_andamento"}
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

                {busca.trim() && pendentes.length === 0 && finalizados.length === 0 && (
                  <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
                    <Search className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">
                      Nenhum item encontrado para <span className="font-semibold text-gray-700">"{busca}"</span>.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
