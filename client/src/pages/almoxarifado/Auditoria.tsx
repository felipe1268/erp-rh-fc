/**
 * Rev. 2450 — Tela de validação de auditoria do Almoxarifado.
 *
 * Lista todas as operações que ficaram registradas em
 * `almoxarifado_auditoria` (excluir item, excluir unidade, alterar
 * quantidade manual) e permite que admin / aprovador da obra valide
 * ou rejeite. Visualiza dadosAntes/Depois pra entender o impacto
 * antes de aprovar.
 *
 * Acesso: gestor da obra OU admin/admin_master. Filtragem por status,
 * obra e busca textual. Banner global complementar em DashboardLayout
 * avisa o user quando tem pendências na sua conta (qualquer tela).
 */
import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  ShieldAlert, CheckCircle2, XCircle, Clock, Search, Building2,
  User as UserIcon, AlertTriangle, FileText, RefreshCw, Trash2, Edit3, Box,
} from "lucide-react";

const ACAO_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  excluir_item:        { label: "Excluiu item",          icon: Trash2, color: "bg-red-100 text-red-700" },
  excluir_unidade:     { label: "Excluiu unidade",       icon: Trash2, color: "bg-red-100 text-red-700" },
  alterar_quantidade:  { label: "Alterou quantidade",    icon: Edit3,  color: "bg-amber-100 text-amber-700" },
};
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pendente:  { label: "Pendente validação",  cls: "bg-amber-100 text-amber-800 border-amber-300" },
  validado:  { label: "Validado",            cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  rejeitado: { label: "Rejeitado",           cls: "bg-red-100 text-red-800 border-red-300" },
};

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch { return s; }
}

function diffQuantidade(antes: any, depois: any): { antes: number; depois: number; delta: number } | null {
  const a = Number(antes?.quantidadeAtual ?? antes?.quantidade_atual);
  const d = Number(depois?.quantidadeAtual ?? depois?.quantidade_atual);
  if (Number.isNaN(a) || Number.isNaN(d)) return null;
  return { antes: a, depois: d, delta: d - a };
}

export default function AuditoriaAlmoxarifado() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const utils = trpc.useUtils();

  const [statusFiltro, setStatusFiltro] = useState<"todos" | "pendente" | "validado" | "rejeitado">("pendente");
  const [busca, setBusca] = useState("");
  const [modalValidar, setModalValidar] = useState<{ aud: any; aprovar: boolean } | null>(null);
  const [observacao, setObservacao] = useState("");

  const listaQ = trpc.auditoriaAlmoxarifado.listar.useQuery(
    { companyId, status: statusFiltro === "todos" ? undefined : statusFiltro, limit: 300 },
    { enabled: !!companyId, refetchOnWindowFocus: false },
  );
  const validarMut = trpc.auditoriaAlmoxarifado.validar.useMutation({
    onSuccess: () => {
      toast.success(modalValidar?.aprovar ? "Operação aprovada." : "Operação rejeitada.");
      utils.auditoriaAlmoxarifado.listar.invalidate();
      utils.auditoriaAlmoxarifado.minhasPendencias.invalidate();
      setModalValidar(null);
      setObservacao("");
    },
    onError: (e) => toast.error(e.message),
  });

  const itens = useMemo(() => {
    const rows = listaQ.data ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      String(r.entidadeNome || "").toLowerCase().includes(q) ||
      String(r.userNome || "").toLowerCase().includes(q) ||
      String(r.obraNome || "").toLowerCase().includes(q) ||
      String(r.justificativa || "").toLowerCase().includes(q),
    );
  }, [listaQ.data, busca]);

  const counts = useMemo(() => {
    const rows = listaQ.data ?? [];
    return {
      pendente:  rows.filter(r => r.statusValidacao === "pendente").length,
      validado:  rows.filter(r => r.statusValidacao === "validado").length,
      rejeitado: rows.filter(r => r.statusValidacao === "rejeitado").length,
    };
  }, [listaQ.data]);

  function abrirModal(aud: any, aprovar: boolean) {
    setModalValidar({ aud, aprovar });
    setObservacao("");
  }
  function confirmar() {
    if (!modalValidar) return;
    if (!modalValidar.aprovar && observacao.trim().length < 5) {
      toast.error("Justifique a rejeição (mínimo 5 caracteres).");
      return;
    }
    validarMut.mutate({
      id: modalValidar.aud.id,
      aprovar: modalValidar.aprovar,
      observacao: observacao.trim() || undefined,
    });
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl p-3">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Auditoria do Almoxarifado</h1>
              <p className="text-sm text-slate-600">Valide ou rejeite operações sensíveis (exclusão de itens, baixa manual de saldo, exclusão de unidades).</p>
            </div>
          </div>
          <button onClick={() => listaQ.refetch()} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium">
            <RefreshCw className={`h-4 w-4 ${listaQ.isFetching ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </header>

        {/* KPIs por status */}
        <div className="grid grid-cols-3 gap-3">
          {(["pendente", "validado", "rejeitado"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFiltro(statusFiltro === s ? "todos" : s)}
              className={`rounded-xl border-2 p-3 text-left transition ${statusFiltro === s ? "border-amber-500 shadow-md" : "border-slate-200 hover:border-slate-300"} bg-white`}>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{STATUS_BADGE[s].label}</div>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">{counts[s]}</div>
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por item, usuário, obra ou justificativa…"
              className="w-full pl-10 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none"
            />
          </div>
          <button
            onClick={() => setStatusFiltro("todos")}
            className={`px-3 py-2 text-sm rounded-lg border font-medium ${statusFiltro === "todos" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}>
            Mostrar todos
          </button>
        </div>

        {/* Lista */}
        {listaQ.isLoading ? (
          <div className="text-center py-16 text-slate-500"><Clock className="h-6 w-6 animate-spin inline mr-2" /> Carregando…</div>
        ) : itens.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-slate-700 font-semibold">Nada pra validar agora.</p>
            <p className="text-sm text-slate-500 mt-1">
              {statusFiltro === "pendente"
                ? "Nenhuma operação pendente — equipe está em dia."
                : "Nenhum registro com os filtros atuais."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {itens.map((r: any) => {
              const meta = ACAO_LABELS[r.acao] ?? { label: r.acao, icon: FileText, color: "bg-slate-100 text-slate-700" };
              const Icon = meta.icon;
              const status = STATUS_BADGE[r.statusValidacao] ?? STATUS_BADGE.pendente;
              const isPendente = r.statusValidacao === "pendente";
              const diff = r.acao === "alterar_quantidade" ? diffQuantidade(r.dadosAntes, r.dadosDepois) : null;
              return (
                <div key={r.id} className={`bg-white rounded-xl border-2 ${isPendente ? "border-amber-300 shadow-sm" : "border-slate-200"} overflow-hidden`}>
                  <div className="p-4 flex items-start gap-3">
                    <div className={`flex-shrink-0 rounded-lg p-2 ${meta.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="font-semibold text-slate-900">
                          {meta.label}: <span className="font-bold">{r.entidadeNome || `#${r.entidadeId}`}</span>
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${status.cls}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600">
                        <span className="inline-flex items-center gap-1"><UserIcon className="h-3.5 w-3.5" /> {r.userNome || `user #${r.userId}`}</span>
                        {r.obraNome && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {r.obraNome}</span>}
                        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {fmtDateTime(r.createdAt)}</span>
                        {r.ip && <span className="font-mono text-slate-400">IP {r.ip}</span>}
                      </div>

                      {/* Diff de quantidade quando aplicável */}
                      {diff && (
                        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                          <Box className="h-4 w-4" />
                          <span className="font-mono">{diff.antes.toLocaleString("pt-BR")}</span>
                          <span>→</span>
                          <span className="font-mono font-bold">{diff.depois.toLocaleString("pt-BR")}</span>
                          <span className={`font-bold ${diff.delta < 0 ? "text-red-700" : "text-emerald-700"}`}>
                            ({diff.delta > 0 ? "+" : ""}{diff.delta.toLocaleString("pt-BR")})
                          </span>
                        </div>
                      )}

                      {/* Justificativa do operador */}
                      <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                        <span className="font-semibold text-slate-600 text-[11px] uppercase tracking-wider">Justificativa: </span>
                        {r.justificativa}
                      </div>

                      {/* Validação prévia */}
                      {!isPendente && (
                        <div className="mt-2 text-[12px] text-slate-600 flex items-center gap-1">
                          {r.statusValidacao === "validado" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-red-600" />}
                          {r.statusValidacao === "validado" ? "Validado" : "Rejeitado"} por <b>{r.validadoPorNome ?? "—"}</b> em {fmtDateTime(r.validadoEm)}
                          {r.observacaoValidacao && <> · "<i>{r.observacaoValidacao}</i>"</>}
                        </div>
                      )}
                    </div>
                  </div>
                  {isPendente && (
                    <div className="px-4 pb-3 pt-1 flex items-center gap-2 justify-end border-t border-slate-100">
                      <button
                        onClick={() => abrirModal(r, false)}
                        className="px-3 py-2 text-sm rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold inline-flex items-center gap-1.5">
                        <XCircle className="h-4 w-4" /> Rejeitar
                      </button>
                      <button
                        onClick={() => abrirModal(r, true)}
                        className="px-3 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 shadow-sm">
                        <CheckCircle2 className="h-4 w-4" /> Aprovar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal confirmar */}
        {modalValidar && (
          <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4" onClick={() => !validarMut.isPending && setModalValidar(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className={`px-6 pt-6 pb-5 text-white text-center ${modalValidar.aprovar ? "bg-gradient-to-br from-emerald-500 to-emerald-600" : "bg-gradient-to-br from-red-500 to-rose-600"}`}>
                <div className="mx-auto bg-white/20 rounded-full p-3 w-fit mb-3">
                  {modalValidar.aprovar ? <CheckCircle2 className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
                </div>
                <h3 className="text-xl font-bold leading-tight">
                  {modalValidar.aprovar ? "Aprovar operação?" : "Rejeitar operação?"}
                </h3>
                <p className="text-sm opacity-95 mt-1 break-words">
                  {ACAO_LABELS[modalValidar.aud.acao]?.label ?? modalValidar.aud.acao}: <b>{modalValidar.aud.entidadeNome}</b>
                </p>
              </div>
              <div className="px-6 py-5 space-y-4 text-sm text-slate-700">
                {!modalValidar.aprovar && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-amber-900">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div className="text-xs leading-relaxed">
                      <strong>Atenção:</strong> rejeitar NÃO desfaz a operação no estoque. Use essa flag pra avisar a equipe de campo que algo precisa ser corrigido manualmente (repor item, abrir solicitação, etc.).
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {modalValidar.aprovar ? "Observação (opcional)" : "Motivo da rejeição*"}
                  </label>
                  <textarea
                    value={observacao}
                    onChange={e => setObservacao(e.target.value)}
                    rows={3}
                    placeholder={modalValidar.aprovar ? "Ex.: Conferido contra o contagem física da semana." : "Ex.: Saldo não bate com a contagem; pedir recontagem."}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none resize-none"
                    autoFocus
                  />
                </div>
              </div>
              <div className="px-5 py-4 bg-slate-50 flex items-center gap-2 border-t border-slate-200">
                <button onClick={() => setModalValidar(null)} disabled={validarMut.isPending} className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition disabled:opacity-50">Cancelar</button>
                <button onClick={confirmar} disabled={validarMut.isPending} className={`flex-1 px-4 py-3 text-sm font-semibold text-white rounded-lg transition shadow-sm disabled:opacity-60 ${modalValidar.aprovar ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}>
                  {validarMut.isPending ? "Salvando…" : (modalValidar.aprovar ? "Confirmar aprovação" : "Confirmar rejeição")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
