import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import {
  BarChart3, Loader2, CheckCircle2, AlertTriangle, Package,
  ChevronRight, ChevronDown, Building2, HardHat, ClipboardList,
  Boxes, ArrowDown, ArrowUp, Minus, Calendar, User,
} from "lucide-react";

function n(v: any) { return parseFloat(v ?? "0") || 0; }
function fmt(v: any) { return n(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 }); }

// "2026-W23" → "Semana 23 · 2026"
function semanaLabel(ref: string | null | undefined) {
  if (!ref) return "—";
  const m = /^(\d{4})-W(\d{1,2})$/.exec(ref);
  if (!m) return ref;
  return `Semana ${Number(m[2])} · ${m[1]}`;
}

function fmtData(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDataHora(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  concluido:     { label: "Concluído",    cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  em_andamento:  { label: "Em andamento", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  pendente:      { label: "Pendente",     cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

// ── Detalhe dos itens de uma sessão (lazy: só carrega quando expandido) ──
function SessionItemsDetail({ sessionId }: { sessionId: number }) {
  const { data: itens = [], isLoading } = trpc.warehouse.getInventorySessionItems.useQuery(
    { sessionId },
    { enabled: !!sessionId },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
      </div>
    );
  }
  if (itens.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">Nenhum item nesta sessão.</p>;
  }

  const divergentes = itens.filter((i: any) => i.status === "divergente");
  const conferidos = itens.filter((i: any) => i.status === "conferido");
  const pendentes = itens.filter((i: any) => i.status === "pendente");

  const Row = ({ i }: { i: any }) => {
    const div = n(i.diferenca);
    const corDif = div > 0 ? "text-blue-600" : div < 0 ? "text-red-600" : "text-gray-500";
    return (
      <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{i.itemNome}</p>
          <p className="text-xs text-gray-400">
            Sistema {fmt(i.quantidadeSistema)}
            {i.status !== "pendente" && <> → Físico {fmt(i.quantidadeFisica)}</>}
            {" "}{(i as any).itemUnidade ?? ""}
          </p>
        </div>
        {i.status === "divergente" ? (
          <span className={`text-sm font-bold ${corDif} shrink-0`}>
            {div >= 0 ? "+" : ""}{fmt(i.diferenca)}
          </span>
        ) : i.status === "conferido" ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        ) : (
          <span className="text-xs text-gray-400 shrink-0">pendente</span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3 pt-1">
      {divergentes.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <p className="text-xs font-bold text-orange-700 mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Divergências ({divergentes.length})
          </p>
          {divergentes.map((i: any) => <Row key={i.id} i={i} />)}
        </div>
      )}
      {conferidos.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Conferidos sem divergência ({conferidos.length})</p>
          {conferidos.map((i: any) => <Row key={i.id} i={i} />)}
        </div>
      )}
      {pendentes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 mb-1">Não conferidos ({pendentes.length})</p>
          {pendentes.map((i: any) => <Row key={i.id} i={i} />)}
        </div>
      )}
    </div>
  );
}

// ── Aba: Inventário Semanal (histórico de sessões) ──
function SemanalTab({ companyId, obraId }: { companyId: number; obraId: number | null }) {
  const [expandido, setExpandido] = useState<number | null>(null);
  const { data: sessoes = [], isLoading } = trpc.warehouse.historicoInventarioSemanal.useQuery(
    { companyId, obraId },
    { enabled: !!companyId },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (sessoes.length === 0) {
    return (
      <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-10 text-center">
        <ClipboardList className="w-14 h-14 text-gray-300 mx-auto mb-3" />
        <p className="text-base font-semibold text-gray-600">Nenhum inventário registrado</p>
        <p className="text-sm text-gray-400 mt-1">
          As contagens semanais aparecerão aqui assim que forem realizadas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessoes.map((s: any) => {
        const aberto = expandido === s.id;
        const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.pendente;
        return (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              className="w-full text-left p-4 flex items-center gap-3 hover:bg-gray-50 transition"
              onClick={() => setExpandido(aberto ? null : s.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-900">{semanaLabel(s.semanaRef)}</p>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate flex items-center gap-1">
                  <Building2 className="w-3 h-3 shrink-0" /> {s.obraNome}
                </p>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1.5 flex-wrap">
                  <span>{s.itensConferidos}/{s.totalItens} itens</span>
                  {s.itensDivergentes > 0 && (
                    <span className="text-orange-600 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {s.itensDivergentes} divergência{s.itensDivergentes > 1 ? "s" : ""}
                    </span>
                  )}
                  {s.almoxarifeNome && (
                    <span className="flex items-center gap-1"><User className="w-3 h-3" /> {s.almoxarifeNome}</span>
                  )}
                  {s.concluidoEm && (
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {fmtData(s.concluidoEm)}</span>
                  )}
                </div>
              </div>
              {aberto
                ? <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                : <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />}
            </button>
            {aberto && (
              <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50/40">
                <SessionItemsDetail sessionId={s.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Aba: Divergências (ledger permanente — Rev. 4547) ──
// Base para medir o erro de processo do almoxarifado ao longo do tempo:
// toda divergência aplicada ao estoque no "Concluir Inventário" fica
// registrada aqui em definitivo (quantidade e R$).
function DivergenciasTab({ companyId, obraId }: { companyId: number; obraId: number | null }) {
  const { data: ajustes = [], isLoading } = trpc.warehouse.listarDivergenciasInventario.useQuery(
    { companyId, obraId },
    { enabled: !!companyId },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (ajustes.length === 0) {
    return (
      <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-10 text-center">
        <AlertTriangle className="w-14 h-14 text-gray-300 mx-auto mb-3" />
        <p className="text-base font-semibold text-gray-600">Nenhuma divergência registrada</p>
        <p className="text-sm text-gray-400 mt-1">
          Divergências aplicadas ao estoque no "Concluir Inventário" ficam registradas aqui em definitivo.
        </p>
      </div>
    );
  }

  const totalFaltas = ajustes.filter((a: any) => n(a.diferenca) < 0).length;
  const totalSobras = ajustes.filter((a: any) => n(a.diferenca) > 0).length;
  const valorPerdas = ajustes.reduce((acc: number, a: any) => {
    const v = a.valorDiferenca != null ? n(a.valorDiferenca) : 0;
    return v < 0 ? acc + Math.abs(v) : acc;
  }, 0);

  const fmtMoeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-red-700">{totalFaltas}</p>
          <p className="text-xs text-red-600">Faltas</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-blue-700">{totalSobras}</p>
          <p className="text-xs text-blue-600">Sobras</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-orange-700 break-words">{fmtMoeda(valorPerdas)}</p>
          <p className="text-xs text-orange-600">Perda estimada</p>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {ajustes.map((a: any) => {
          const dif = n(a.diferenca);
          const corDif = dif > 0 ? "text-blue-600" : "text-red-600";
          const vd = a.valorDiferenca != null ? n(a.valorDiferenca) : null;
          return (
            <div key={a.id} className="p-3 flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${dif > 0 ? "bg-blue-50" : "bg-red-50"}`}>
                {dif > 0
                  ? <ArrowUp className="w-4 h-4 text-blue-500" />
                  : <ArrowDown className="w-4 h-4 text-red-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate" title={a.itemNome ?? ""}>{a.itemNome}</p>
                <p className="text-xs text-gray-500">
                  Sistema {fmt(a.quantidadeSistema)} → Físico {fmt(a.quantidadeFisica)} {a.unidade ?? ""}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{semanaLabel(a.semanaRef)}</span>
                  <span>· {a.obraNome}</span>
                  <span>· {fmtData(a.criadoEm)}</span>
                  {a.registradoPorNome && <span>· {a.registradoPorNome}</span>}
                </p>
                {a.observacoes && <p className="text-xs text-gray-500 mt-0.5 italic">"{a.observacoes}"</p>}
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-bold ${corDif}`}>{dif >= 0 ? "+" : ""}{fmt(a.diferenca)}</p>
                {vd != null && (
                  <p className={`text-xs font-semibold ${vd < 0 ? "text-red-500" : "text-blue-500"}`}>
                    {vd < 0 ? "−" : "+"}{fmtMoeda(Math.abs(vd)).replace("R$", "R$ ").trim()}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Detalhe das leituras de uma baia (lazy) ──
function BaiaLeiturasDetail({ companyId, baiaId, unidade }: { companyId: number; baiaId: number; unidade: string }) {
  const { data: leituras = [], isLoading } = trpc.warehouse.baiaLeiturasListar.useQuery(
    { companyId, baiaId },
    { enabled: !!companyId && !!baiaId },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
      </div>
    );
  }
  if (leituras.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">Nenhuma leitura registrada.</p>;
  }

  // leituras vêm desc (mais recente primeiro). Consumo = leitura anterior (mais
  // antiga, índice seguinte) menos a atual, quando ambas têm volume estimado.
  return (
    <div className="pt-1">
      {leituras.map((l: any, idx: number) => {
        const anterior = leituras[idx + 1];
        const volAtual = l.volumeEstimado != null ? n(l.volumeEstimado) : null;
        const volAnt = anterior?.volumeEstimado != null ? n(anterior.volumeEstimado) : null;
        const delta = (volAtual != null && volAnt != null) ? volAtual - volAnt : null;
        return (
          <div key={l.id} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
            <div className="flex flex-col items-center shrink-0 w-10">
              {delta == null ? <Minus className="w-4 h-4 text-gray-300" />
                : delta < 0 ? <ArrowDown className="w-4 h-4 text-orange-500" />
                : delta > 0 ? <ArrowUp className="w-4 h-4 text-emerald-500" />
                : <Minus className="w-4 h-4 text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">
                {volAtual != null ? `${fmt(volAtual)} ${unidade}` : `${l.percentual}%`}
                {delta != null && delta !== 0 && (
                  <span className={`ml-2 text-xs font-semibold ${delta < 0 ? "text-orange-600" : "text-emerald-600"}`}>
                    ({delta < 0 ? "" : "+"}{fmt(delta)} {unidade})
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-400 flex items-center gap-2 flex-wrap">
                <span>{fmtDataHora(l.lidaEm)}</span>
                {l.lidaPorNome && <span>· {l.lidaPorNome}</span>}
              </p>
              {l.observacoes && <p className="text-xs text-gray-500 mt-0.5 italic">"{l.observacoes}"</p>}
            </div>
            {l.fotoUrl && (
              <img src={l.fotoUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200 shrink-0" loading="lazy" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Aba: Baias / Insumos a granel (histórico de leituras) ──
function BaiasTab({ companyId, obraId }: { companyId: number; obraId: number | null }) {
  const [expandido, setExpandido] = useState<number | null>(null);

  if (obraId === null) {
    return (
      <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-10 text-center">
        <Boxes className="w-14 h-14 text-gray-300 mx-auto mb-3" />
        <p className="text-base font-semibold text-gray-600">Selecione uma obra</p>
        <p className="text-sm text-gray-400 mt-1">
          As baias de granel (areia, brita, lajota…) são cadastradas por obra.
        </p>
      </div>
    );
  }

  return <BaiasTabInner companyId={companyId} obraId={obraId} expandido={expandido} setExpandido={setExpandido} />;
}

function BaiasTabInner({
  companyId, obraId, expandido, setExpandido,
}: {
  companyId: number;
  obraId: number;
  expandido: number | null;
  setExpandido: (v: number | null) => void;
}) {
  const { data: baias = [], isLoading } = trpc.warehouse.baiaListar.useQuery(
    { companyId, obraId },
    { enabled: !!companyId },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (baias.length === 0) {
    return (
      <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-10 text-center">
        <Boxes className="w-14 h-14 text-gray-300 mx-auto mb-3" />
        <p className="text-base font-semibold text-gray-600">Nenhuma baia nesta obra</p>
        <p className="text-sm text-gray-400 mt-1">Cadastre baias no Inventário Visual para acompanhar o consumo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {baias.map((b: any) => {
        const aberto = expandido === b.id;
        const ult = b.ultimaLeitura;
        const ant = b.leituraAnterior;
        const volUlt = ult?.volumeEstimado != null ? n(ult.volumeEstimado) : null;
        const volAnt = ant?.volumeEstimado != null ? n(ant.volumeEstimado) : null;
        const tendencia = (volUlt != null && volAnt != null) ? volUlt - volAnt : null;
        return (
          <div key={b.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              className="w-full text-left p-4 flex items-center gap-3 hover:bg-gray-50 transition"
              onClick={() => setExpandido(aberto ? null : b.id)}
            >
              {b.fotoUrl ? (
                <img src={b.fotoUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-200 shrink-0" loading="lazy" />
              ) : (
                <div className="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
                  <Boxes className="w-6 h-6 text-amber-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{b.nome}</p>
                <p className="text-xs text-gray-500 capitalize">{b.material}</p>
                <div className="flex items-center gap-2 text-xs mt-1">
                  {ult ? (
                    <span className="text-gray-700 font-medium">
                      {volUlt != null ? `${fmt(volUlt)} ${b.unidade}` : `${ult.percentual}%`}
                    </span>
                  ) : (
                    <span className="text-gray-400">sem leitura</span>
                  )}
                  {tendencia != null && tendencia !== 0 && (
                    <span className={`font-semibold flex items-center gap-0.5 ${tendencia < 0 ? "text-orange-600" : "text-emerald-600"}`}>
                      {tendencia < 0 ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                      {fmt(Math.abs(tendencia))} {b.unidade}
                    </span>
                  )}
                  {ult?.lidaEm && <span className="text-gray-400">· {fmtData(ult.lidaEm)}</span>}
                </div>
              </div>
              {aberto
                ? <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                : <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />}
            </button>
            {aberto && (
              <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50/40">
                <BaiaLeiturasDetail companyId={companyId} baiaId={b.id} unidade={b.unidade} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AlmoxarifadoHistoricoInventario() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const [obraContexto, setObraContexto] = useState<number | null>(null);
  const [aba, setAba] = useState<"semanal" | "divergencias" | "baias">("semanal");

  const { data: obrasAtivas = [] } = trpc.obras.listActive.useQuery(
    { companyId, companyIds: [companyId] }, { enabled: !!companyId },
  );

  const nomeContexto = useMemo(() => (
    obraContexto === null
      ? "Almoxarifado Central"
      : obrasAtivas.find((o: any) => o.id === obraContexto)?.nome ?? "Obra"
  ), [obraContexto, obrasAtivas]);

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

      <div className="space-y-4 max-w-2xl mx-auto px-2 pt-4 pb-10">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3 px-1">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Histórico de Inventário</h1>
            <p className="text-sm text-gray-500">{nomeContexto} · análise read-only</p>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition ${
              aba === "semanal" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setAba("semanal")}
          >
            <ClipboardList className="w-4 h-4" /> Inventário Semanal
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition ${
              aba === "divergencias" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setAba("divergencias")}
          >
            <AlertTriangle className="w-4 h-4" /> Divergências
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition ${
              aba === "baias" ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setAba("baias")}
          >
            <Boxes className="w-4 h-4" /> Baias / Granel
          </button>
        </div>

        {aba === "semanal"
          ? <SemanalTab companyId={companyId} obraId={obraContexto} />
          : aba === "divergencias"
          ? <DivergenciasTab companyId={companyId} obraId={obraContexto} />
          : <BaiasTab companyId={companyId} obraId={obraContexto} />}
      </div>
    </DashboardLayout>
  );
}
