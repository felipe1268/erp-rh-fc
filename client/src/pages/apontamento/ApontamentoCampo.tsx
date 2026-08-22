// APONTAMENTO DE CAMPO — ronda diária de produção (mobile-first, uso em obra).
// UX guiada pelas melhores práticas de campo (Lean Construction / Last Planner,
// takt por zona; apps de referência: Fieldwire, PlanRadar):
//  1. OBRAS primeiro — cartões grandes com o pulso do dia (toque único).
//  2. PROJETOS depois — pavimentos do levantamento com progresso visual.
//  3. Apontar em 2 toques: trecho → % → salvar. Mínimo de digitação.
// O apontamento é fato primário: alimenta medição, RDO e produtividade —
// nunca gera dinheiro sozinho. Ledger no server impede passar de 100%.
import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ClipboardList, Loader2, MapPin, Plus, Trash2, CheckCircle2, ChevronLeft,
  Building2, Target, FileBarChart, AlertTriangle, Search, Layers, Users,
  CalendarDays, ChevronRight, ChevronDown, Sun, Map as MapIcon, Camera, X, FileSpreadsheet,
} from "lucide-react";
import { lazy, Suspense } from "react";
import ApontamentoDialog, { type NovoApontamento } from "./ApontamentoDialog";
const PlantaViewer = lazy(() => import("./PlantaViewer"));

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const brQtd = (v: any) => {
  const n = Number(v);
  return isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—";
};
const dataLonga = () => new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

type TabKey = "ronda" | "producao" | "frentes";

export default function ApontamentoCampo() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const tab: TabKey = (params.get("tab") as TabKey) || "ronda";
  const obraSel = params.get("obra") ? Number(params.get("obra")) : null;

  const obrasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const obras: any[] = obrasQ.data ?? [];
  const obra = obras.find((o) => o.id === obraSel) || null;

  const irPara = (obraId: number | null, t: TabKey = "ronda") => {
    const p = new URLSearchParams();
    if (obraId) p.set("obra", String(obraId));
    if (t !== "ronda") p.set("tab", t);
    navigate(`/apontamento${p.toString() ? `?${p.toString()}` : ""}`);
  };

  return (
    <DashboardLayout>
      <div className="p-3 md:p-6 max-w-5xl mx-auto space-y-4 pb-24">
        {!obraSel || !obra ? (
          <SelecaoObra companyId={companyId} obras={obras} loading={obrasQ.isLoading} onEscolher={(id) => irPara(id)} />
        ) : (
          <>
            {/* Cabeçalho da obra — volta com 1 toque */}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => irPara(null)}
                className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 active:scale-95">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-base md:text-lg font-bold text-gray-800 truncate" title={obra.nome}>{obra.nome}</h1>
                <p className="text-[11px] text-gray-500 capitalize flex items-center gap-1"><Sun className="w-3 h-3 text-amber-400" /> {dataLonga()}</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-lime-100 flex items-center justify-center shrink-0"><ClipboardList className="w-5 h-5 text-lime-700" /></div>
            </div>

            {/* Abas grandes (dedo com luva) */}
            <div className="grid grid-cols-3 gap-0 rounded-2xl bg-slate-100 p-1">
              {([["ronda", "Ronda", ClipboardList], ["producao", "Produção", FileBarChart], ["frentes", "Frentes", Target]] as const).map(([k, l, Ic]) => (
                <button key={k} type="button"
                  className={`rounded-xl px-2 py-2.5 text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-all ${tab === k ? "bg-white shadow text-gray-900" : "text-gray-400"}`}
                  onClick={() => irPara(obraSel, k)}>
                  <Ic className="w-4 h-4" /> {l}
                </button>
              ))}
            </div>

            {tab === "ronda" ? <RondaTab companyId={companyId} obraId={obraSel} />
              : tab === "producao" ? <ProducaoTab companyId={companyId} obraId={obraSel} />
              : <FrentesTab companyId={companyId} obraId={obraSel} />}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

// ───────────────────────────── NÍVEL 1 — ESCOLHA DA OBRA ─────────────────────────────
function SelecaoObra({ companyId, obras, loading, onEscolher }: { companyId: number; obras: any[]; loading: boolean; onEscolher: (id: number) => void }) {
  const resumoQ = trpc.apontamentoCampo.resumoObras.useQuery({ companyId }, { enabled: companyId > 0 });
  const resumo: any[] = resumoQ.data ?? [];
  const rMap = useMemo(() => Object.fromEntries(resumo.map((r: any) => [Number(r.obraId), r])), [resumo]);
  const [busca, setBusca] = useState("");

  // Obras com ronda montada (levantamento) em destaque; as demais numa lista compacta.
  const { ativas, livres } = useMemo(() => {
    const f = busca.trim().toLowerCase();
    const arr = obras.filter((o) => !f || String(o.nome).toLowerCase().includes(f));
    const ordenadas = [...arr].sort((a, b) => {
      const ra = rMap[a.id], rb = rMap[b.id];
      const sa = (ra?.apontamentosHoje || 0) * 1000 + (ra?.ambientes || 0) + (ra?.pavimentos || 0);
      const sb = (rb?.apontamentosHoje || 0) * 1000 + (rb?.ambientes || 0) + (rb?.pavimentos || 0);
      return sb - sa;
    });
    return {
      ativas: ordenadas.filter((o) => (rMap[o.id]?.ambientes || 0) > 0 || (rMap[o.id]?.apontamentosHoje || 0) > 0),
      livres: ordenadas.filter((o) => !((rMap[o.id]?.ambientes || 0) > 0 || (rMap[o.id]?.apontamentosHoje || 0) > 0)),
    };
  }, [obras, rMap, busca]);
  const lista = ativas.length + livres.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-lime-500 to-green-600 flex items-center justify-center shadow-md shrink-0">
          <ClipboardList className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-800">Ronda do Dia</h1>
          <p className="text-xs text-gray-500 capitalize">{dataLonga()} — escolha a obra e aponte a produção.</p>
        </div>
      </div>

      {obras.length > 6 && (
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input className="h-11 pl-9 rounded-xl" placeholder="Buscar obra..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
      ) : !lista ? (
        <div className="text-center py-16 text-gray-400 text-sm">Nenhuma obra ativa encontrada.</div>
      ) : (
        /* Todas as obras — grade única de botões-cartão, iguais e grandes (iPad-friendly) */
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[...ativas, ...livres].map((o) => {
            const r = rMap[o.id];
            const total = r?.ambientes || 0;
            const pronta = total > 0;
            const feitos = Math.min(r?.ambientesConcluidos || 0, total);
            const pct = total > 0 ? (feitos / total) * 100 : 0;
            const hoje = r?.apontamentosHoje || 0;
            return (
              <button key={o.id} type="button" onClick={() => onEscolher(o.id)}
                className={`relative text-left rounded-2xl border bg-white p-4 min-h-[128px] flex flex-col transition-all active:scale-[0.97] hover:shadow-md ${
                  pronta ? "border-lime-200 shadow-sm hover:border-lime-400" : "border-slate-200 hover:border-slate-300"}`}>
                {hoje > 0 && (
                  <span className="absolute top-2.5 right-2.5 text-[10px] font-bold text-lime-700 bg-lime-100 border border-lime-200 rounded-full px-2 py-0.5">{hoje} hoje</span>
                )}
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mb-2.5 ${
                  pronta ? "bg-gradient-to-br from-lime-500 to-green-600 shadow-sm" : "bg-slate-100"}`}>
                  <Building2 className={`w-5 h-5 ${pronta ? "text-white" : "text-slate-400"}`} />
                </div>
                <div className="font-bold text-[13px] leading-snug text-gray-800 line-clamp-2 flex-1" title={o.nome}>{o.nome}</div>
                {pronta ? (
                  <div className="mt-2.5">
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : "bg-lime-500"}`} style={{ width: `${Math.max(pct, 3)}%` }} />
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">{feitos}/{total} ambientes</div>
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-400 mt-2.5">
                    {r?.contratos ? `${r.contratos} contrato${r.contratos > 1 ? "s" : ""}` : "lançamento livre"}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── NÍVEL 2 — RONDA (pavimentos → ambientes) ─────────────────────────────
// Task 150 — a PLANTA é a única navegação: tocar no pavimento abre o EDITOR
// COMPLETO de levantamento (mesmo editor do Medição, em modo Ronda). A lista
// de cards de ambientes foi removida; a busca vive como overlay no editor.
function RondaTab({ companyId, obraId }: { companyId: number; obraId: number }) {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const rondaQ = trpc.apontamentoCampo.getRonda.useQuery({ companyId, obraId });
  const previstoQ = trpc.apontamentoCampo.previstoHoje.useQuery({ companyId, obraId });
  const pavimentos: any[] = rondaQ.data?.pavimentos ?? [];
  const contornos: any[] = rondaQ.data?.contornos ?? [];
  const acumulado: any[] = rondaQ.data?.acumulado ?? [];
  const servicos: any[] = rondaQ.data?.servicos ?? [];
  const [abrindoPav, setAbrindoPav] = useState<number | null>(null);
  const [cronoAberto, setCronoAberto] = useState(false); // faixa do cronograma (fechada por padrão)

  const pctDe = (contornoId: number | null, servico: string, local?: string, pavimentoId?: number | null) => {
    const row = acumulado.find((a: any) =>
      contornoId ? Number(a.contornoId) === contornoId && a.servico === servico
        : !a.contornoId && Number(a.pavimentoId || 0) === Number(pavimentoId || 0)
          && (a.local || "").toUpperCase() === (local || "").toUpperCase() && a.servico === servico);
    return Math.min(100, Number(row?.pct || 0));
  };

  // progresso por pavimento (para os chips): ambientes 100% / total
  const progPav = useMemo(() => {
    const m: Record<number, { total: number; done: number }> = {};
    for (const p of pavimentos) m[p.id] = { total: 0, done: 0 };
    for (const c of contornos) {
      const pid = Number(c.pavimentoId);
      if (!m[pid]) m[pid] = { total: 0, done: 0 };
      m[pid].total++;
      if (pctDe(Number(c.id), c.servico || "") >= 99.99) m[pid].done++;
    }
    return m;
  }, [pavimentos, contornos, acumulado]);

  // Task 150 — tocar no pavimento abre o EDITOR de levantamento em modo Ronda
  // (mesmo editor do Medição): desenhar contorno grava no MESMO levantamento.
  const abrirEditor = async (pavimentoId: number) => {
    if (abrindoPav) return;
    setAbrindoPav(pavimentoId);
    try {
      const r = await utils.client.apontamentoCampo.resolverCampoDoPavimento.query({ companyId, obraId, pavimentoId });
      if (!r) {
        toast.info("Este pavimento ainda não tem planta no Levantamento de Campo. Suba a planta pelo módulo Medição (Levantamento) ou use o lançamento livre aqui embaixo.");
        return;
      }
      const q = new URLSearchParams();
      if (r.origem === "terceiro") q.set("origem", "terceiro");
      q.set("ronda", "1");
      q.set("obra", String(obraId));
      q.set("pav", String(pavimentoId));
      q.set("pdf", String(r.pdfId)); // planta do PAVIMENTO tocado (campo pode ter várias)
      // Rota PRÓPRIA do Apontamento (não passa pela rota do Medição): a Ronda é
      // a tela principal de levantamento; o Medição vira complementar.
      navigate(`/apontamento/planta/${r.contratoId}/${r.campoId}?${q.toString()}`);
    } catch (e: any) {
      toast.error(e?.message || "Não consegui abrir a planta deste pavimento.");
    } finally {
      setAbrindoPav(null);
    }
  };

  // ── dialog de apontamento (lançamento livre) ──
  const [novo, setNovo] = useState<NovoApontamento | null>(null);
  const jaPct = novo ? pctDe(novo.contornoId ?? null, novo.servico, novo.local, novo.pavimentoId) : 0;

  if (rondaQ.isLoading) return <div className="text-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div>;

  const previsto = previstoQ.data;
  const atvs: any[] = previsto?.atividades ?? [];
  const foras: any[] = previsto?.forasDoPrevisto ?? [];
  const feitas = atvs.filter((a) => a.realizadoHoje).length;
  // Exceções = o que pede AÇÃO: termina hoje ou já atrasou, e ainda sem apontamento.
  const excecoes = atvs.filter((a) => (a.terminaHoje || a.atrasada) && !a.realizadoHoje);

  return (
    <div className="space-y-3">
      {/* Cronograma = CONTEXTO, não checklist (decisão do user 08/08/2026):
          faixa-resumo fechada + alerta só de exceções. A planta é o centro. */}
      {previsto?.temPlanejamento && atvs.length > 0 && (
        <div className="space-y-1.5">
          <button type="button" onClick={() => setCronoAberto((v) => !v)}
            className="w-full flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left active:scale-[0.99]">
            <CalendarDays className="w-4 h-4 text-sky-600 shrink-0" />
            <span className="flex-1 text-[12px] text-gray-600">
              <b className="text-gray-800">{atvs.length}</b> atividade{atvs.length > 1 ? "s" : ""} no cronograma hoje · <b className={feitas > 0 ? "text-emerald-600" : "text-gray-800"}>{feitas}</b> apontada{feitas !== 1 ? "s" : ""}
            </span>
            {feitas === atvs.length
              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              : <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${cronoAberto ? "rotate-180" : ""}`} />}
          </button>

          {/* alerta curto: só exceções (máx. 3) — atrasada ou terminando hoje sem apontamento */}
          {excecoes.length > 0 && !cronoAberto && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              {excecoes.slice(0, 3).map((a) => (
                <div key={a.id} className="flex items-center gap-1.5 text-[11px] text-amber-800 py-0.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <span className="flex-1 min-w-0 break-words"><b>{a.nome}</b>{a.grupo ? ` — ${a.grupo}` : ""}</span>
                  <span className={`shrink-0 font-semibold ${a.atrasada ? "text-red-600" : ""}`}>{a.atrasada ? "atrasada" : "termina hoje"}</span>
                </div>
              ))}
              {excecoes.length > 3 && (
                <button type="button" onClick={() => setCronoAberto(true)} className="text-[11px] font-semibold text-amber-700 mt-0.5">
                  + {excecoes.length - 3} outra{excecoes.length - 3 > 1 ? "s" : ""} — ver todas
                </button>
              )}
            </div>
          )}

          {cronoAberto && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-3 space-y-1">
              {atvs.map((a) => (
                <div key={a.id} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 border ${a.realizadoHoje ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"}`}>
                  {a.realizadoHoje
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    : <span className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className={`text-[12px] font-semibold break-words ${a.realizadoHoje ? "text-emerald-800" : "text-gray-700"}`}>{a.nome}</div>
                    <div className="text-[10px] text-gray-400 flex flex-wrap gap-x-2">
                      {a.grupo && <span>{a.grupo}</span>}
                      {a.atrasada && !a.realizadoHoje && <span className="text-red-600 font-semibold">atrasada (fim {String(a.dataFim).split("-").reverse().join("/")})</span>}
                      {a.terminaHoje && !a.realizadoHoje && <span className="text-amber-600 font-semibold">termina hoje</span>}
                      {a.comecaHoje && <span className="text-sky-600">começa hoje</span>}
                      {a.realizadoHoje && a.pctHoje > 0 && <span className="text-emerald-600 font-semibold">{Number(a.pctHoje).toFixed(0)}% apontado hoje</span>}
                    </div>
                  </div>
                </div>
              ))}
              {foras.length > 0 && (
                <div className="text-[10px] text-gray-500 pt-1 px-1">
                  Fora do previsto de hoje (ok — segue valendo): {foras.map((f) => f.servico).join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pavimentos — a PLANTA é a navegação: 1 toque abre o editor de
          levantamento em modo Ronda (pintado por status, com as ferramentas
          de desenho do Medição). */}
      {pavimentos.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {pavimentos.map((p) => {
            const pr = progPav[p.id] || { total: 0, done: 0 };
            const abrindo = abrindoPav === p.id;
            return (
              <button key={p.id} type="button" onClick={() => abrirEditor(p.id)} disabled={!!abrindoPav}
                className="rounded-2xl border bg-white border-slate-200 text-gray-700 px-4 py-3 text-left transition-all active:scale-95 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-lime-600 shrink-0" />
                  <span className="text-[13px] font-bold flex-1 min-w-0 truncate">{p.nome}</span>
                  {abrindo ? <Loader2 className="w-4 h-4 animate-spin text-lime-600 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {pr.total ? `${pr.done}/${pr.total} ambientes concluídos` : "sem ambientes — desenhe na planta"}
                </div>
                <div className="h-1.5 rounded-full mt-1.5 overflow-hidden bg-slate-100">
                  <div className="h-full rounded-full bg-lime-500" style={{ width: `${pr.total ? (pr.done / pr.total) * 100 : 0}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400 text-xs">
          Nenhum pavimento com planta no Levantamento — suba as plantas pelo módulo Medição (Levantamento de Campo) ou use o lançamento livre.
        </div>
      )}

      <div className="flex items-center gap-3 text-[10px] text-gray-500 px-1">
        <span className="flex items-center gap-1"><MapIcon className="w-3 h-3 text-lime-600" /> Toque no pavimento pra abrir a planta: apontar produção (toque no ambiente) e desenhar levantamento (mesmas ferramentas do Medição).</span>
      </div>

      {/* Lançamento livre — pro que não está no levantamento */}
      <Button variant="outline" className="w-full h-12 gap-1.5 rounded-2xl text-lime-700 border-lime-300 border-dashed text-[13px] font-semibold"
        onClick={() => setNovo({ contornoId: null, pavimentoId: pavimentos[0]?.id ?? null, local: "", servico: servicos[0]?.servico ?? "", unidade: servicos[0]?.unidade ?? "m2", quantidadeTotal: null, percentual: 100, data: hoje() })}>
        <Plus className="w-4 h-4" /> Apontar local livre (sem levantamento)
      </Button>

      {/* Dialog do apontamento (compartilhado com o editor em modo Ronda) */}
      {novo && (
        <ApontamentoDialog companyId={companyId} obraId={obraId} novo={novo} setNovo={setNovo}
          servicos={servicos} jaPct={jaPct} />
      )}
    </div>
  );
}


// ───────────────────────────── PRODUÇÃO ─────────────────────────────
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pad2 = (n: number) => String(n).padStart(2, "0");
// semanas do mês (seg–dom, cortadas nas bordas do mês)
function semanasDoMes(ano: number, mes: number): { ini: string; fim: string }[] {
  const ultimo = new Date(ano, mes, 0).getDate();
  const out: { ini: string; fim: string }[] = [];
  let d = 1;
  while (d <= ultimo) {
    const dow = new Date(ano, mes - 1, d).getDay(); // 0=dom
    const ateDom = dow === 0 ? 0 : 7 - dow;         // dias até domingo
    const fim = Math.min(ultimo, d + ateDom);
    out.push({ ini: `${ano}-${pad2(mes)}-${pad2(d)}`, fim: `${ano}-${pad2(mes)}-${pad2(fim)}` });
    d = fim + 1;
  }
  return out;
}

function ProducaoTab({ companyId, obraId }: { companyId: number; obraId: number }) {
  const utils = trpc.useUtils();
  // Filtro cascata mês → semana → dia (pedido do user 08/08/2026): sempre abre
  // no DIA ATUAL; tocar no mês mostra as semanas, na semana mostra os dias.
  const hj = hoje(); // YYYY-MM-DD
  const [ano, setAno] = useState(() => Number(hj.slice(0, 4)));
  const [mes, setMes] = useState(() => Number(hj.slice(5, 7)));
  const [semIdx, setSemIdx] = useState<number | null>(() => {
    const s = semanasDoMes(Number(hj.slice(0, 4)), Number(hj.slice(5, 7)));
    return s.findIndex((w) => w.ini <= hj && hj <= w.fim);
  });
  const [dia, setDia] = useState<string | null>(hj);
  const semanas = useMemo(() => semanasDoMes(ano, mes), [ano, mes]);
  const semana = semIdx != null && semIdx >= 0 ? semanas[semIdx] : null;
  // range efetivo: dia > semana > mês
  const dataIni = dia ?? semana?.ini ?? `${ano}-${pad2(mes)}-01`;
  const dataFim = dia ?? semana?.fim ?? `${ano}-${pad2(mes)}-${pad2(new Date(ano, mes, 0).getDate())}`;
  const diasDaSemana = useMemo(() => {
    if (!semana) return [];
    const out: string[] = [];
    for (let d = Number(semana.ini.slice(8, 10)); d <= Number(semana.fim.slice(8, 10)); d++) out.push(`${ano}-${pad2(mes)}-${pad2(d)}`);
    return out;
  }, [semana, ano, mes]);
  const escolherMes = (m: number) => { setMes(m); setSemIdx(null); setDia(null); };
  const listQ = trpc.apontamentoCampo.listar.useQuery({ companyId, obraId, dataIni, dataFim });
  const rows: any[] = listQ.data ?? [];
  const excluirMut = trpc.apontamentoCampo.excluir.useMutation({
    onSuccess: () => { toast.success("Apontamento removido"); utils.apontamentoCampo.listar.invalidate(); utils.apontamentoCampo.getRonda.invalidate({ companyId, obraId }); utils.apontamentoCampo.previstoHoje.invalidate({ companyId, obraId }); utils.apontamentoCampo.resumoObras.invalidate({ companyId }); },
    onError: (e: any) => toast.error(e?.message || "Erro"),
  });

  const porDia = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const r of rows) { const k = String(r.data).slice(0, 10); const a = m.get(k) || []; a.push(r); m.set(k, a); }
    return [...m.entries()];
  }, [rows]);

  return (
    <div className="space-y-3">
      {/* filtro cascata: ano · meses → semanas → dias */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2.5 space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button type="button" className="p-1 text-gray-400 shrink-0" onClick={() => setAno((a) => a - 1)}><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-[12px] font-bold text-gray-700 shrink-0 w-10 text-center">{ano}</span>
          <button type="button" className="p-1 text-gray-400 shrink-0" onClick={() => setAno((a) => a + 1)}><ChevronRight className="w-4 h-4" /></button>
          <div className="w-px h-5 bg-slate-200 shrink-0 mx-0.5" />
          {MESES_ABREV.map((m, i) => (
            <button key={m} type="button" onClick={() => escolherMes(i + 1)}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold capitalize active:scale-95 ${mes === i + 1 ? "bg-lime-600 text-white" : "bg-slate-100 text-gray-600"}`}>
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button type="button" onClick={() => { setSemIdx(null); setDia(null); }}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold active:scale-95 ${semIdx == null ? "bg-lime-600 text-white" : "bg-slate-100 text-gray-600"}`}>
            Mês todo
          </button>
          {semanas.map((w, i) => (
            <button key={w.ini} type="button" onClick={() => { setSemIdx(i); setDia(null); }}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold active:scale-95 ${semIdx === i ? "bg-lime-600 text-white" : "bg-slate-100 text-gray-600"}`}>
              Sem {i + 1} <span className="font-normal opacity-70">({w.ini.slice(8, 10)}–{w.fim.slice(8, 10)})</span>
            </button>
          ))}
        </div>
        {semana && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button type="button" onClick={() => setDia(null)}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold active:scale-95 ${dia == null ? "bg-lime-600 text-white" : "bg-slate-100 text-gray-600"}`}>
              Semana toda
            </button>
            {diasDaSemana.map((d) => (
              <button key={d} type="button" onClick={() => setDia(d)}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold active:scale-95 ${dia === d ? "bg-lime-600 text-white" : d === hj ? "bg-lime-50 text-lime-700 border border-lime-300" : "bg-slate-100 text-gray-600"}`}>
                {d.slice(8, 10)}<span className="font-normal opacity-70">/{d.slice(5, 7)}</span>{d === hj ? " · hoje" : ""}
              </button>
            ))}
          </div>
        )}
        <div className="text-[10px] text-gray-400 px-1">
          Mostrando: {dia ? `dia ${dia.split("-").reverse().join("/")}` : semana ? `semana ${String(Number(semana.ini.slice(8, 10)))}–${String(Number(semana.fim.slice(8, 10)))} de ${MESES_ABREV[mes - 1]}.` : `${MESES_ABREV[mes - 1]}. de ${ano} inteiro`}
        </div>
      </div>
      {listQ.isLoading ? <div className="text-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        : !rows.length ? <div className="text-center py-10 text-gray-400 text-sm">Nenhum apontamento no período.</div>
        : porDia.map(([dia, itens]) => (
          <div key={dia}>
            <div className="text-xs font-bold text-gray-500 mb-1.5">{dia.split("-").reverse().join("/")} <span className="font-normal text-gray-400">— {itens.length} apontamento(s)</span></div>
            <div className="space-y-1.5">
              {itens.map((r: any) => (
                <div key={r.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
                  {r.fotoUrl && (
                    <a href={r.fotoUrl} target="_blank" rel="noreferrer" className="shrink-0">
                      <img src={`${r.fotoUrl}${String(r.fotoUrl).includes("?") ? "&" : "?"}w=128`} alt="Foto" loading="lazy" className="w-10 h-10 rounded-lg object-cover border border-slate-200" />
                    </a>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-gray-800 truncate" title={`${r.contornoRotulo || r.local || ""} — ${r.servico}`}>
                      {r.contornoRotulo || r.local || "—"} <span className="font-normal text-gray-400">·</span> {r.servico}
                    </div>
                    <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-2">
                      <span className="font-bold text-lime-700">{Number(r.percentual).toFixed(0)}%</span>
                      {r.quantidade && <span>{brQtd(r.quantidade)} {r.unidade}</span>}
                      {r.pavimentoNome && <span>{r.pavimentoNome}</span>}
                      {r.contratoNome ? <span className="text-gray-600">{r.contratoNome}</span> : <span className="text-amber-600">sem contrato</span>}
                      {r.criadoPor && <span className="text-gray-400">por {r.criadoPor}</span>}
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[9px] shrink-0 ${r.status === "validado" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : r.status === "glosado" ? "bg-red-50 text-red-600 border-red-200" : "bg-slate-50 text-gray-500 border-slate-200"}`}>{r.status}</Badge>
                  {r.status === "apontado" && (
                    <button type="button" className="text-red-300 hover:text-red-500 shrink-0 p-1" disabled={excluirMut.isPending}
                      onClick={() => { if (confirm("Remover este apontamento?")) excluirMut.mutate({ companyId, id: r.id }); }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

// ───────────────────────────── MAPA DE FRENTES ─────────────────────────────
function FrentesTab({ companyId, obraId }: { companyId: number; obraId: number }) {
  const utils = trpc.useUtils();
  const rondaQ = trpc.apontamentoCampo.getRonda.useQuery({ companyId, obraId });
  const frentesQ = trpc.apontamentoCampo.listarFrentes.useQuery({ companyId, obraId });
  const pavimentos: any[] = rondaQ.data?.pavimentos ?? [];
  const contratos: any[] = frentesQ.data?.contratos ?? [];
  const frentes: any[] = frentesQ.data?.frentes ?? [];
  const alternarMut = trpc.apontamentoCampo.alternarFrente.useMutation({
    onSuccess: () => { utils.apontamentoCampo.listarFrentes.invalidate({ companyId, obraId }); utils.apontamentoCampo.resolverContrato.invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Erro"),
  });
  const temFrente = (contratoId: number, pavimentoId: number) =>
    frentes.some((f: any) => f.contratoId === contratoId && f.pavimentoId === pavimentoId);

  if (rondaQ.isLoading || frentesQ.isLoading) return <div className="text-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
  if (!contratos.length) return <div className="text-center py-10 text-gray-400 text-sm">Nenhum contrato de terceiro ativo nesta obra.</div>;
  if (!pavimentos.length) return <div className="text-center py-10 text-gray-400 text-sm">Cadastre os pavimentos da obra no Levantamento de Campo primeiro.</div>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Toque para marcar qual equipe é responsável por cada pavimento — a ronda usa isso para vincular o contrato automaticamente quando várias equipes fazem o mesmo serviço.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate" style={{ borderSpacing: "0 4px" }}>
          <thead>
            <tr>
              <th className="text-left text-gray-400 font-medium px-2">Contrato</th>
              {pavimentos.map((p) => <th key={p.id} className="text-center text-gray-400 font-medium px-1 whitespace-nowrap">{p.nome}</th>)}
            </tr>
          </thead>
          <tbody>
            {contratos.map((c: any) => (
              <tr key={c.id}>
                <td className="bg-white border border-slate-200 rounded-l-lg px-2 py-2 font-semibold text-gray-700 whitespace-nowrap max-w-[180px] truncate" title={c.descricao || ""}>{c.numeroContrato || c.descricao || `#${c.id}`}</td>
                {pavimentos.map((p) => {
                  const on = temFrente(c.id, p.id);
                  return (
                    <td key={p.id} className="bg-white border-y border-slate-200 text-center px-1">
                      <button type="button" disabled={alternarMut.isPending}
                        className={`w-9 h-9 rounded-xl border text-[11px] font-bold active:scale-90 ${on ? "bg-lime-500 border-lime-600 text-white" : "bg-slate-50 border-slate-200 text-gray-300"}`}
                        onClick={() => alternarMut.mutate({ companyId, obraId, contratoId: c.id, pavimentoId: p.id })}>
                        {on ? "✓" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
