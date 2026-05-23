import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import {
  ArrowDownCircle, ArrowUpCircle, Loader2, Search, Filter,
  ArrowRightLeft, Calendar, User, MapPin, X, CalendarRange,
} from "lucide-react";

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

const TIPO_LABELS: Record<string, { label: string; cor: string; icon: any }> = {
  entrada: { label: "Entrada", cor: "text-emerald-700 bg-emerald-50", icon: ArrowDownCircle },
  saida:   { label: "Saída",   cor: "text-red-700 bg-red-50",         icon: ArrowUpCircle },
  ajuste:  { label: "Ajuste",  cor: "text-blue-700 bg-blue-50",       icon: ArrowRightLeft },
};

function n(v: any) { return parseFloat(v ?? "0") || 0; }
function fmt(v: any) { return n(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 }); }

export default function AlmoxarifadoMovimentacoes() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  // Rev. 2303 — clicar na obra dentro de um card filtra a lista por obraId.
  const [filtroObra, setFiltroObra] = useState<{ id: number; nome: string } | null>(null);
  // Rev. 2304 — filtro por período de recebimento.
  const [filtroPeriodo, setFiltroPeriodo] = useState<PeriodoPreset>("todos");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");

  // Limit subiu de 300 → 1500 p/ não cortar histórico em filtros longos (Este mês etc).
  const { data: movs = [], isLoading } = trpc.warehouse.listMovements.useQuery(
    { companyId, limit: 1500 },
    { enabled: !!companyId }
  );

  // Resolve o range [dataInicio, dataFim] (YYYY-MM-DD) a partir do preset.
  const range = useMemo(() => {
    const hoje = new Date();
    if (filtroPeriodo === "todos") return null;
    if (filtroPeriodo === "hoje") {
      const iso = toLocalIso(hoje);
      return { ini: iso, fim: iso };
    }
    if (filtroPeriodo === "7d") return { ini: toLocalIso(addDays(hoje, -6)), fim: toLocalIso(hoje) };
    if (filtroPeriodo === "30d") return { ini: toLocalIso(addDays(hoje, -29)), fim: toLocalIso(hoje) };
    if (filtroPeriodo === "mes") return { ini: toLocalIso(startOfMonth(hoje)), fim: toLocalIso(hoje) };
    if (filtroPeriodo === "custom") {
      if (!dataInicio && !dataFim) return null;
      const ini = dataInicio || "0000-01-01";
      const fim = dataFim || "9999-12-31";
      return ini <= fim ? { ini, fim } : { ini: fim, fim: ini };
    }
    return null;
  }, [filtroPeriodo, dataInicio, dataFim]);

  const lista = useMemo(() => {
    let r = movs;
    if (filtroObra) r = r.filter(m => m.obraId === filtroObra.id);
    if (range) {
      r = r.filter(m => {
        if (!m.criadoEm) return false;
        // m.criadoEm é ISO; recorta YYYY-MM-DD em UTC. Pra comparar com data
        // local do usuário (presets calculados em fuso BR), converte via Date.
        const d = new Date(m.criadoEm);
        const iso = toLocalIso(d);
        return iso >= range.ini && iso <= range.fim;
      });
    }
    if (busca) {
      const b = busca.toLowerCase();
      r = r.filter(m =>
        (m.itemNome?.toLowerCase() ?? "").includes(b) ||
        (m.usuarioNome?.toLowerCase() ?? "").includes(b) ||
        (m.obraNome?.toLowerCase() ?? "").includes(b) ||
        (m.motivo?.toLowerCase() ?? "").includes(b)
      );
    }
    if (filtroTipo !== "todos") r = r.filter(m => m.tipo === filtroTipo);
    return r;
  }, [movs, busca, filtroTipo, filtroObra, range]);

  // Rev. 2304 — resumo reflete a lista FILTRADA (período + obra + busca + tipo),
  // assim os 3 cards no topo respondem aos filtros, inclusive ao recorte temporal.
  const resumo = useMemo(() => {
    const entradas = lista.filter(m => m.tipo === "entrada").length;
    const saidas   = lista.filter(m => m.tipo === "saida").length;
    return { entradas, saidas, total: lista.length };
  }, [lista]);

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-4xl mx-auto px-2">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Movimentações</h1>
          <p className="text-sm text-gray-500 mt-1">Histórico completo de entradas e saídas</p>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{resumo.total}</p>
            <p className="text-xs text-gray-500 mt-1">Total registros</p>
          </div>
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{resumo.entradas}</p>
            <p className="text-xs text-emerald-600 mt-1">Entradas</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-3 text-center">
            <p className="text-2xl font-bold text-red-700">{resumo.saidas}</p>
            <p className="text-xs text-red-600 mt-1">Saídas</p>
          </div>
        </div>

        {/* Rev. 2304 — Filtro por PERÍODO de recebimento (pills + range custom) */}
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
              Mostrando recebimentos de {brDate(range.ini)}
              {range.ini !== range.fim ? ` até ${brDate(range.fim)}` : ""}.
            </p>
          )}
        </div>

        {/* Filtros */}
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
              placeholder="Buscar item, obra, usuário..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-3 border rounded-xl text-base bg-white min-w-[110px]"
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="entrada">Entradas</option>
            <option value="saida">Saídas</option>
            <option value="ajuste">Ajustes</option>
          </select>
        </div>

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
          <div className="space-y-2">
            {lista.map(mov => {
              const meta = TIPO_LABELS[mov.tipo] || TIPO_LABELS["ajuste"];
              const Icon = meta.icon;
              return (
                <div
                  key={mov.id}
                  className="bg-white rounded-xl border p-4 flex gap-3 items-start"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${meta.cor}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate">{mov.itemNome ?? "Item"}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.cor}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-base font-bold text-gray-800 mt-0.5">
                      {mov.tipo === "entrada" ? "+" : "-"}{fmt(mov.quantidade)} {mov.unidade ?? "un"}
                    </p>
                    {(mov.motivo || mov.obraNome) && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {mov.obraNome && mov.obraId ? (
                          <button
                            type="button"
                            onClick={() => setFiltroObra({ id: mov.obraId!, nome: mov.obraNome! })}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 -mx-1 rounded-md hover:bg-emerald-50 hover:text-emerald-700 active:bg-emerald-100 transition font-medium"
                            title={`Filtrar pela obra ${mov.obraNome}`}
                          >
                            <MapPin className="w-3 h-3" />
                            {mov.obraNome}
                          </button>
                        ) : mov.obraNome ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {mov.obraNome}
                          </span>
                        ) : null}
                        {mov.motivo ? ` — ${mov.motivo}` : ""}
                      </p>
                    )}
                    <div className="flex gap-3 mt-1 text-xs text-gray-400">
                      {mov.usuarioNome && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {mov.usuarioNome}
                        </span>
                      )}
                      {mov.criadoEm && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(mov.criadoEm).toLocaleString("pt-BR", {
                            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                          })}
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
    </DashboardLayout>
  );
}
