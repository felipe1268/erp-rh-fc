import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  ArrowDownCircle, ArrowUpCircle, Loader2, Search, Filter,
  ArrowRightLeft, Calendar, User, MapPin, X, CalendarRange,
  CheckSquare, Square, Undo2, AlertTriangle, Ban,
  Wrench, RotateCcw, Package, ArrowLeftRight, AlertOctagon,
  EyeOff, Eye,
} from "lucide-react";
// Rev. 2508 — filtro defensivo: esconde itens não-material (serviços,
// topografia, mão-de-obra, etc.) que vazaram pra timeline.
import { classificarNaturezaItemAlmox } from "@shared/naturezaItemAlmox";

// Rev. 2304 — helpers de data LOCAL (sem fuso, sem UTC) p/ filtros por período.
function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function startOfMonth(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth(), 1);
}
function brDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type PeriodoPreset = "todos" | "hoje" | "7d" | "30d" | "mes" | "custom";
type Fonte = "todos" | "movimentacao" | "emprestimo" | "insumo" | "transferencia";

// Rev. 2457 — Metadata visual por TIPO (cobre todas as 4 fontes).
const TIPO_LABELS: Record<string, { label: string; cor: string; icon: any; sinal?: "+" | "-" | "" }> = {
  entrada:       { label: "Entrada",       cor: "text-emerald-700 bg-emerald-50", icon: ArrowDownCircle, sinal: "+" },
  saida:         { label: "Saída",         cor: "text-red-700 bg-red-50",         icon: ArrowUpCircle,   sinal: "-" },
  ajuste:        { label: "Ajuste",        cor: "text-blue-700 bg-blue-50",       icon: ArrowRightLeft,  sinal: "" },
  emprestimo:    { label: "Empréstimo",    cor: "text-amber-700 bg-amber-50",     icon: Wrench,          sinal: "-" },
  devolucao:     { label: "Devolução",     cor: "text-teal-700 bg-teal-50",       icon: RotateCcw,       sinal: "+" },
  perdido:       { label: "Perdido",       cor: "text-rose-700 bg-rose-50",       icon: AlertOctagon,    sinal: "-" },
  insumo:        { label: "Insumo p/ Func.", cor: "text-violet-700 bg-violet-50", icon: Package,         sinal: "-" },
  transferencia: { label: "Transferência", cor: "text-sky-700 bg-sky-50",         icon: ArrowLeftRight,  sinal: "" },
};

const FONTE_LABEL: Record<Fonte, string> = {
  todos:         "Todas as fontes",
  movimentacao:  "Estoque (entrada/saída/ajuste)",
  emprestimo:    "Ferramentas (empréstimo/devolução)",
  insumo:        "Insumos p/ funcionário",
  transferencia: "Transferências entre almox",
};

function n(v: any) { return parseFloat(v ?? "0") || 0; }
function fmt(v: any) { return n(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 }); }

export default function AlmoxarifadoMovimentacoes() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "admin_master";

  const [busca, setBusca] = useState("");
  const [filtroFonte, setFiltroFonte] = useState<Fonte>("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroObra, setFiltroObra] = useState<{ id: number; nome: string } | null>(null);
  const [filtroPeriodo, setFiltroPeriodo] = useState<PeriodoPreset>("todos");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [modalEstorno, setModalEstorno] = useState(false);
  const [motivoEstorno, setMotivoEstorno] = useState("");
  // Rev. 2508 — admin pode revelar movimentações de itens não-material
  // (serviços/MDO/topografia) que o filtro padrão esconde.
  const [mostrarNaoMaterial, setMostrarNaoMaterial] = useState(false);

  // Resolve range pra usar como dateFrom/dateTo no server-side.
  const range = useMemo(() => {
    const hoje = new Date();
    if (filtroPeriodo === "todos") return null;
    if (filtroPeriodo === "hoje")  return { ini: toLocalIso(hoje), fim: toLocalIso(hoje) };
    if (filtroPeriodo === "7d")    return { ini: toLocalIso(addDays(hoje, -6)), fim: toLocalIso(hoje) };
    if (filtroPeriodo === "30d")   return { ini: toLocalIso(addDays(hoje, -29)), fim: toLocalIso(hoje) };
    if (filtroPeriodo === "mes")   return { ini: toLocalIso(startOfMonth(hoje)), fim: toLocalIso(hoje) };
    if (filtroPeriodo === "custom") {
      if (!dataInicio && !dataFim) return null;
      const ini = dataInicio || "0000-01-01";
      const fim = dataFim || "9999-12-31";
      return ini <= fim ? { ini, fim } : { ini: fim, fim: ini };
    }
    return null;
  }, [filtroPeriodo, dataInicio, dataFim]);

  // Rev. 2457 — Timeline unificada (4 fontes via UNION ALL no backend).
  const utils = trpc.useUtils();
  const { data: timeline = [], isLoading } = trpc.warehouse.listTimeline.useQuery(
    {
      companyId,
      limit: 1500,
      dateFrom: range?.ini,
      dateTo:   range?.fim,
    },
    { enabled: !!companyId }
  );

  const reverseMut = trpc.warehouse.reverseMovements.useMutation({
    onSuccess: (res) => {
      const { sucessos, erros, total } = res;
      if (sucessos.length === total) {
        toast.success(`${sucessos.length} movimentação(ões) estornada(s). Estoque atualizado.`);
      } else if (sucessos.length > 0) {
        toast.warning(
          `${sucessos.length} de ${total} estornadas. ${erros.length} bloqueadas: ${erros.slice(0, 3).map(e => e.motivo).join("; ")}${erros.length > 3 ? "..." : ""}`,
          { duration: 8000 }
        );
      } else {
        toast.error(
          `Nenhuma estornada. ${erros.slice(0, 3).map(e => e.motivo).join("; ")}${erros.length > 3 ? "..." : ""}`,
          { duration: 8000 }
        );
      }
      setSelecionadas(new Set());
      setModoSelecao(false);
      setModalEstorno(false);
      setMotivoEstorno("");
      utils.warehouse.listTimeline.invalidate();
      utils.warehouse.listMovements.invalidate();
      utils.warehouse.getDashboard.invalidate();
    },
    onError: (err) => toast.error(err.message || "Erro ao estornar movimentações"),
  });

  function toggleSel(id: number) {
    setSelecionadas(prev => {
      const n2 = new Set(prev);
      if (n2.has(id)) n2.delete(id); else n2.add(id);
      return n2;
    });
  }
  function sairModoSelecao() {
    setModoSelecao(false);
    setSelecionadas(new Set());
  }

  // Tipos disponíveis no select de TIPO dependem da fonte selecionada.
  const tiposDoFiltroFonte: { v: string; l: string }[] = useMemo(() => {
    if (filtroFonte === "movimentacao") return [
      { v: "todos", l: "Todos" }, { v: "entrada", l: "Entradas" },
      { v: "saida", l: "Saídas" }, { v: "ajuste", l: "Ajustes" },
    ];
    if (filtroFonte === "emprestimo") return [
      { v: "todos", l: "Todos" }, { v: "emprestimo", l: "Em aberto" },
      { v: "devolucao", l: "Devolvido" }, { v: "perdido", l: "Perdido" },
    ];
    return [{ v: "todos", l: "Todos" }];
  }, [filtroFonte]);

  // Rev. 2508 — anota cada linha com `_naturezaMaterial` + `_naturezaMotivo`
  // ANTES de aplicar os filtros visíveis ao usuário. Isso permite contar
  // quantas movimentações foram ocultas e expor o toggle "Mostrar itens
  // não-material" pro admin sem refazer o trabalho a cada render.
  const timelineAnotada = useMemo(() => {
    return (timeline as any[]).map(m => {
      const cls = classificarNaturezaItemAlmox(m.item_nome ?? "", m.unidade);
      return { ...m, _naturezaMaterial: cls.material, _naturezaMotivo: cls.motivo };
    });
  }, [timeline]);

  // Quantas linhas o filtro de natureza esconderia (independente de busca/obra/tipo).
  const ocultasNaoMaterialCount = useMemo(() => {
    return timelineAnotada.filter(m => !m._naturezaMaterial).length;
  }, [timelineAnotada]);

  // Rev. 2566 — base SEM o filtro por FONTE/TIPO. Os 5 cards de resumo
  // (filtros clicáveis) contam sobre esta base para permanecerem
  // comparativos: ao selecionar uma fonte, os outros cards continuam
  // mostrando suas contagens (no contexto de período/obra/busca/natureza),
  // permitindo alternar entre fontes. A `lista` exibida aplica fonte+tipo.
  const listaBase = useMemo(() => {
    let r: any[] = timelineAnotada;
    // Rev. 2508 — filtro de natureza vem PRIMEIRO. Por padrão esconde
    // serviços/MDO/topografia que vazaram pra timeline. Admin pode revelar.
    if (!mostrarNaoMaterial) r = r.filter(m => m._naturezaMaterial);
    if (filtroObra) r = r.filter(m => m.obra_id === filtroObra.id);
    if (busca) {
      const b = busca.toLowerCase();
      r = r.filter(m =>
        (m.item_nome?.toLowerCase()  ?? "").includes(b) ||
        (m.quem?.toLowerCase()       ?? "").includes(b) ||
        (m.obra_nome?.toLowerCase()  ?? "").includes(b) ||
        (m.motivo?.toLowerCase()     ?? "").includes(b) ||
        (m.contraparte?.toLowerCase()?? "").includes(b)
      );
    }
    return r;
  }, [timelineAnotada, mostrarNaoMaterial, busca, filtroObra]);

  const lista = useMemo(() => {
    let r: any[] = listaBase;
    if (filtroFonte !== "todos") r = r.filter(m => m.fonte === filtroFonte);
    if (filtroTipo !== "todos") r = r.filter(m => m.tipo === filtroTipo);
    return r;
  }, [listaBase, filtroFonte, filtroTipo]);

  const resumo = useMemo(() => {
    const porFonte: Record<string, number> = {};
    for (const m of listaBase) porFonte[m.fonte] = (porFonte[m.fonte] ?? 0) + 1;
    return {
      total:        listaBase.length,
      movimentacao: porFonte.movimentacao  ?? 0,
      emprestimo:   porFonte.emprestimo    ?? 0,
      insumo:       porFonte.insumo        ?? 0,
      transferencia:porFonte.transferencia ?? 0,
    };
  }, [listaBase]);

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-4xl mx-auto px-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Movimentações</h1>
          <p className="text-sm text-gray-500 mt-1">
            Histórico completo: estoque, ferramentas, insumos e transferências — quem fez, quando e o que.
          </p>
        </div>

        {isAdmin && (
          <div className="flex justify-end">
            {!modoSelecao ? (
              <button
                type="button"
                onClick={() => setModoSelecao(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:border-emerald-300 hover:text-emerald-700 rounded-full px-3 py-1.5 transition"
                title="Selecionar várias movimentações para estornar (só fonte ESTOQUE)"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                Selecionar p/ estornar
              </button>
            ) : (
              <button
                type="button"
                onClick={sairModoSelecao}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 hover:bg-gray-200 rounded-full px-3 py-1.5 transition"
              >
                <X className="w-3.5 h-3.5" />
                Cancelar seleção
              </button>
            )}
          </div>
        )}

        {/* Rev. 2566 — 5 cards de resumo CLICÁVEIS (filtram por fonte).
            Sincronizados com os chips "Fonte" abaixo via o mesmo estado
            filtroFonte: clicar no card destaca o card + o chip correspondente. */}
        <div className="grid grid-cols-5 gap-2">
          {([
            { fonte: "todos",         valor: resumo.total,        label: "Total",       cardBg: "bg-white",       border: "border",                    num: "text-gray-900",   txt: "text-gray-500",   ring: "ring-gray-900 border-gray-900" },
            { fonte: "movimentacao",  valor: resumo.movimentacao, label: "Estoque",     cardBg: "bg-emerald-50",  border: "border border-emerald-200", num: "text-emerald-700", txt: "text-emerald-700", ring: "ring-emerald-500 border-emerald-400" },
            { fonte: "emprestimo",    valor: resumo.emprestimo,   label: "Ferramentas", cardBg: "bg-amber-50",    border: "border border-amber-200",   num: "text-amber-700",  txt: "text-amber-700",  ring: "ring-amber-500 border-amber-400" },
            { fonte: "insumo",        valor: resumo.insumo,       label: "Insumos",     cardBg: "bg-violet-50",   border: "border border-violet-200",  num: "text-violet-700", txt: "text-violet-700", ring: "ring-violet-500 border-violet-400" },
            { fonte: "transferencia", valor: resumo.transferencia,label: "Transfer.",   cardBg: "bg-sky-50",      border: "border border-sky-200",     num: "text-sky-700",    txt: "text-sky-700",    ring: "ring-sky-500 border-sky-400" },
          ] as { fonte: Fonte; valor: number; label: string; cardBg: string; border: string; num: string; txt: string; ring: string }[]).map(c => {
            const ativo = filtroFonte === c.fonte;
            return (
              <button
                key={c.fonte}
                type="button"
                onClick={() => { setFiltroFonte(c.fonte); setFiltroTipo("todos"); }}
                aria-pressed={ativo}
                title={c.fonte === "todos" ? "Mostrar todas as fontes" : `Filtrar por ${c.label}`}
                className={`${c.cardBg} rounded-xl ${c.border} p-2.5 text-center transition hover:shadow-md focus:outline-none ${ativo ? `ring-2 ${c.ring} shadow-sm` : "hover:border-gray-400"}`}
              >
                <p className={`text-xl font-bold ${c.num}`}>{c.valor}</p>
                <p className={`text-[10px] ${c.txt} mt-0.5`}>{c.label}</p>
              </button>
            );
          })}
        </div>

        {/* Rev. 2457 — Filtro por FONTE (chips horizontais) */}
        <div className="bg-white border rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <Filter className="w-4 h-4 text-emerald-600" />
            Fonte
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(FONTE_LABEL) as Fonte[]).map(f => {
              const ativo = filtroFonte === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => { setFiltroFonte(f); setFiltroTipo("todos"); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    ativo
                      ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {FONTE_LABEL[f]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filtro por PERÍODO */}
        <div className="bg-white border rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <CalendarRange className="w-4 h-4 text-emerald-600" />
            Período
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              { v: "todos", l: "Todos" },
              { v: "hoje",  l: "Hoje" },
              { v: "7d",    l: "Últimos 7 dias" },
              { v: "30d",   l: "Últimos 30 dias" },
              { v: "mes",   l: "Este mês" },
              { v: "custom", l: "Personalizado" },
            ] as { v: PeriodoPreset; l: string }[]).map(p => {
              const ativo = filtroPeriodo === p.v;
              return (
                <button
                  key={p.v}
                  type="button"
                  onClick={() => setFiltroPeriodo(p.v)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    ativo
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-white text-gray-700 border-gray-200 hover:border-emerald-300 hover:text-emerald-700"
                  }`}
                >
                  {p.l}
                </button>
              );
            })}
          </div>
          {filtroPeriodo === "custom" && (
            <div className="flex flex-wrap gap-2 pt-1">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                De:
                <input
                  type="date"
                  value={dataInicio}
                  max={dataFim || undefined}
                  onChange={e => setDataInicio(e.target.value)}
                  className="px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                Até:
                <input
                  type="date"
                  value={dataFim}
                  min={dataInicio || undefined}
                  onChange={e => setDataFim(e.target.value)}
                  className="px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </label>
              {(dataInicio || dataFim) && (
                <button
                  type="button"
                  onClick={() => { setDataInicio(""); setDataFim(""); }}
                  className="text-xs text-gray-500 hover:text-gray-700 underline self-center"
                >
                  Limpar datas
                </button>
              )}
            </div>
          )}
          {range && (
            <p className="text-[11px] text-emerald-700 font-medium pt-0.5">
              Mostrando movimentações de {brDate(range.ini)}
              {range.ini !== range.fim ? ` até ${brDate(range.fim)}` : ""}.
            </p>
          )}
        </div>

        {filtroObra && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-sm">
            <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-emerald-800 font-medium truncate flex-1">
              Filtrando por obra: <span className="font-bold">{filtroObra.nome}</span>
            </span>
            <button
              type="button"
              onClick={() => setFiltroObra(null)}
              className="shrink-0 inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-md px-2 py-1 transition"
              title="Limpar filtro de obra"
            >
              <X className="w-3 h-3" />
              Limpar
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              className="w-full pl-9 pr-3 py-3 text-base border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="Buscar item, obra, usuário, funcionário..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          {tiposDoFiltroFonte.length > 1 && (
            <select
              className="px-3 py-3 border rounded-xl text-base bg-white min-w-[110px]"
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value)}
            >
              {tiposDoFiltroFonte.map(t => (
                <option key={t.v} value={t.v}>{t.l}</option>
              ))}
            </select>
          )}
        </div>

        {/* Rev. 2508 — Banner de natureza: alerta visual quando há linhas
            ocultas por serem itens não-material (serviço/MDO/topografia).
            Toggle só aparece pra admin pra evitar poluir visão do gestor. */}
        {ocultasNaoMaterialCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm">
            {mostrarNaoMaterial
              ? <Eye className="w-4 h-4 text-amber-700 shrink-0" />
              : <EyeOff className="w-4 h-4 text-amber-700 shrink-0" />}
            <span className="text-amber-900 flex-1">
              {mostrarNaoMaterial
                ? <><strong>{ocultasNaoMaterialCount}</strong> linha(s) de itens <strong>não-material</strong> (serviço/MDO/topografia) sendo exibida(s).</>
                : <><strong>{ocultasNaoMaterialCount}</strong> linha(s) ocultada(s) — itens classificados como <strong>não-material</strong> (serviço, mão-de-obra, topografia etc.) não pertencem ao almoxarifado.</>}
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setMostrarNaoMaterial(v => !v)}
                className="shrink-0 inline-flex items-center gap-1 text-xs text-amber-800 hover:text-amber-900 bg-white hover:bg-amber-100 border border-amber-300 rounded-md px-2 py-1 transition font-medium"
                title={mostrarNaoMaterial ? "Voltar a esconder não-material" : "Revelar não-material (admin)"}
              >
                {mostrarNaoMaterial ? "Esconder" : "Mostrar"}
              </button>
            )}
          </div>
        )}

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : lista.length === 0 ? (
          <div className="text-center py-16">
            <ArrowRightLeft className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nenhuma movimentação encontrada</p>
          </div>
        ) : (
          <div className={`space-y-2 ${modoSelecao && selecionadas.size > 0 ? "pb-24" : ""}`}>
            {lista.map(mov => {
              const meta = TIPO_LABELS[mov.tipo] || { label: mov.tipo, cor: "text-gray-700 bg-gray-100", icon: ArrowRightLeft, sinal: "" };
              const Icon = meta.icon;
              const estornada = !!mov.estornada_em;
              const isMovEstoque = mov.fonte === "movimentacao";
              const vinculadaOc = isMovEstoque && /\boc[\s-]/i.test(String(mov.motivo || ""));
              // Rev. 2457 — Estorno só rola na fonte 'movimentacao' (outras 3 não passam pela mutation reverseMovements).
              const key = `${mov.fonte}-${mov.id}`;
              const sel = isMovEstoque && selecionadas.has(mov.id);
              const podeSelecionar = modoSelecao && isMovEstoque && !estornada && !vinculadaOc;
              const onCardClick = podeSelecionar ? () => toggleSel(mov.id) : undefined;
              return (
                <div
                  key={key}
                  onClick={onCardClick}
                  className={`bg-white rounded-xl border p-4 flex gap-3 items-start transition ${
                    estornada ? "opacity-60 border-gray-200 bg-gray-50" : ""
                  } ${
                    podeSelecionar ? "cursor-pointer hover:border-emerald-300" : ""
                  } ${
                    sel ? "ring-2 ring-emerald-500 border-emerald-400 bg-emerald-50/40" : ""
                  }`}
                >
                  {modoSelecao && (
                    <div
                      className="flex-shrink-0 pt-1"
                      title={
                        !isMovEstoque
                          ? "Estorno disponível só para a fonte ESTOQUE"
                          : estornada
                          ? "Já estornada"
                          : vinculadaOc
                          ? "Vinculada a OC — estorne pela tela de Recebimentos"
                          : sel ? "Desmarcar" : "Selecionar para estornar"
                      }
                    >
                      {!isMovEstoque || estornada || vinculadaOc ? (
                        <Ban className="w-5 h-5 text-gray-300" />
                      ) : sel ? (
                        <CheckSquare className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-300" />
                      )}
                    </div>
                  )}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${meta.cor}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-semibold truncate ${estornada ? "text-gray-500 line-through" : "text-gray-900"}`}>
                        {mov.item_nome ?? "Item"}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.cor}`}>
                        {meta.label}
                      </span>
                      {estornada && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 tracking-wider"
                          title={mov.estorno_motivo ? `Motivo: ${mov.estorno_motivo}` : "Estornada"}
                        >
                          ESTORNADA
                        </span>
                      )}
                    </div>
                    <p className={`text-base font-bold mt-0.5 ${estornada ? "text-gray-400 line-through" : "text-gray-800"}`}>
                      {meta.sinal}{fmt(mov.quantidade)} {mov.unidade ?? "un"}
                    </p>
                    {mov.contraparte && (
                      <p className="text-xs text-gray-600 mt-0.5 truncate">
                        <User className="inline w-3 h-3 mr-1 -mt-0.5" />
                        {mov.fonte === "emprestimo" ? "Funcionário:" : "Para:"} <span className="font-medium">{mov.contraparte}</span>
                      </p>
                    )}
                    {mov.fonte === "transferencia" && mov.quem && mov.quem !== "—" && (
                      <p className="text-xs text-gray-600 mt-0.5 truncate">
                        <User className="inline w-3 h-3 mr-1 -mt-0.5" />
                        Enviado por: <span className="font-medium">{mov.quem}</span>
                      </p>
                    )}
                    {(mov.motivo || mov.obra_nome) && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {mov.obra_nome && mov.obra_id ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFiltroObra({ id: mov.obra_id, nome: mov.obra_nome }); }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 -mx-1 rounded-md hover:bg-emerald-50 hover:text-emerald-700 active:bg-emerald-100 transition font-medium"
                            title={`Filtrar pela obra ${mov.obra_nome}`}
                          >
                            <MapPin className="w-3 h-3" />
                            {mov.obra_nome}
                          </button>
                        ) : mov.obra_nome ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {mov.obra_nome}
                          </span>
                        ) : null}
                        {mov.motivo ? ` — ${mov.motivo}` : ""}
                      </p>
                    )}
                    <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                      {mov.quem && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {mov.quem}
                        </span>
                      )}
                      {mov.quando && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(mov.quando).toLocaleString("pt-BR", {
                            day: "2-digit", month: "2-digit", year: "2-digit",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      )}
                      {estornada && mov.estornada_por_nome && (
                        <span className="flex items-center gap-1 text-gray-500">
                          <Undo2 className="w-3 h-3" />
                          Estornada por {mov.estornada_por_nome}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modoSelecao && selecionadas.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t shadow-2xl px-3 py-3 flex items-center gap-2 sm:gap-3">
          <div className="flex-1 text-sm">
            <span className="font-bold text-emerald-700">{selecionadas.size}</span>
            <span className="text-gray-600"> selecionada(s)</span>
          </div>
          <button
            type="button"
            onClick={sairModoSelecao}
            className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => setModalEstorno(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm"
          >
            <Undo2 className="w-4 h-4" />
            Estornar
          </button>
        </div>
      )}

      {modalEstorno && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-2 sm:rounded-t-2xl">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <h2 className="font-bold text-amber-900">Estornar movimentações</h2>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto">
              <p className="text-sm text-gray-700">
                Você vai estornar <span className="font-bold text-red-700">{selecionadas.size}</span> movimentação(ões).
                Isso devolve a quantidade ao estoque — <span className="font-semibold">entradas</span> serão descontadas
                e <span className="font-semibold">saídas</span> serão somadas de volta. O registro fica no histórico marcado
                como ESTORNADA (auditoria).
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
                <p className="font-semibold mb-1">Não é possível estornar daqui:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Recebimentos vinculados a OC (faça pela tela de Recebimentos)</li>
                  <li>Entradas cujo material já foi consumido (estoque atual menor que a quantidade)</li>
                  <li>Empréstimos, insumos e transferências (cada um tem fluxo próprio de reversão)</li>
                </ul>
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-gray-700">Motivo do estorno (obrigatório)</span>
                <textarea
                  rows={3}
                  value={motivoEstorno}
                  onChange={e => setMotivoEstorno(e.target.value)}
                  placeholder="Ex: Material lançado em duplicidade na NF 1234..."
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </label>
            </div>
            <div className="border-t px-4 py-3 flex gap-2 sticky bottom-0 bg-white sm:rounded-b-2xl">
              <button
                type="button"
                onClick={() => { setModalEstorno(false); setMotivoEstorno(""); }}
                disabled={reverseMut.isPending}
                className="flex-1 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={reverseMut.isPending || motivoEstorno.trim().length < 3}
                onClick={() => reverseMut.mutate({
                  companyId,
                  movementIds: Array.from(selecionadas),
                  motivo: motivoEstorno.trim(),
                })}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
              >
                {reverseMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Undo2 className="w-4 h-4" />
                )}
                Confirmar estorno
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

