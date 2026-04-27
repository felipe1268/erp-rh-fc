import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  RefreshCw, TrendingUp, TrendingDown, Minus
} from "lucide-react";

// ─── Formatadores ─────────────────────────────────────────────────────────────

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

/** Formato curto para células: 18,3M · 332,5K · 957 · 0  */
function K(v: number): string {
  if (v === 0) return "—";
  const abs = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${s}R$\u00A0${(abs / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000)     return `${s}R$\u00A0${(abs / 1_000).toFixed(1).replace(".", ",")}K`;
  return `${s}R$\u00A0${abs.toFixed(0)}`;
}

/** Formato completo para KPIs */
function BRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function PCT(v: number): string {
  if (v === 0) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(1).replace(".", ",") + "%";
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface MesData {
  mes: number;
  receitaRealizada: number; receitaPrevista: number; totalReceitas: number;
  despesaRealizada: number; despesaPrevista: number; totalDespesas: number;
  resultado: number; saldoAcumulado: number; lucratividade: number;
  detalhe: {
    faturamento: { realizado: number; previsto: number };
    medicao_prevista: { realizado: number; previsto: number };
    cronograma_receita: { realizado: number; previsto: number };
    receita_outros: { realizado: number; previsto: number };
    folha: { realizado: number; previsto: number };
    compras: { realizado: number; previsto: number };
    frota: { realizado: number; previsto: number };
    obras: { realizado: number; previsto: number };
    terceiros: { realizado: number; previsto: number };
    recorrente: { realizado: number; previsto: number };
    outros: { realizado: number; previsto: number };
  };
}

// ─── Constantes de estilo ────────────────────────────────────────────────────

const COL_W = 78; // px — largura fixa de cada coluna de mês
const ROW_LABEL_W = 190; // px — largura da coluna de rótulo

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function FinanceiroFluxoCaixa() {
  const { companyId } = useCompany();
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;

  const [ano, setAno] = useState(hoje.getFullYear());
  const [exReceit, setExReceit] = useState(false);
  const [exDesp, setExDesp]     = useState(false);

  const { data, isLoading, refetch, isFetching } =
    (trpc as any).financial.getCashFlowMatrix.useQuery(
      { companyId, ano }, { enabled: !!companyId }
    );

  const meses: MesData[] = data?.meses ?? [];
  const totalRec  = meses.reduce((s, m) => s + m.totalReceitas, 0);
  const totalDesp = meses.reduce((s, m) => s + m.totalDespesas, 0);
  const totalRes  = totalRec - totalDesp;
  const lucrAnual = totalRec > 0 ? (totalRes / totalRec) * 100 : 0;

  // ── helpers de renderização ────────────────────────────────────────────────

  /** Célula de valor numérico */
  function Cel({
    v, bold = false, color, isAtual = false, italic = false, isTot = false
  }: {
    v: number; bold?: boolean;
    color?: "pos" | "neg" | "auto" | "receita" | "despesa" | "pct";
    isAtual?: boolean; italic?: boolean; isTot?: boolean;
  }) {
    let tc = "text-gray-600";
    if (color === "auto")     tc = v > 0 ? "text-emerald-700" : v < 0 ? "text-red-600"     : "text-gray-300";
    if (color === "receita")  tc = v !== 0 ? "text-emerald-700" : "text-gray-300";
    if (color === "despesa")  tc = v !== 0 ? "text-red-600"     : "text-gray-300";
    if (color === "pos")      tc = "text-emerald-700";
    if (color === "neg")      tc = "text-red-600";
    if (color === "pct")      tc = v > 0 ? "text-emerald-700" : v < 0 ? "text-rose-600" : "text-gray-300";

    const display = color === "pct" ? PCT(v) : K(v);

    return (
      <td style={{ width: COL_W, minWidth: COL_W }}
        className={[
          "text-right text-xs px-2 py-0 border-l border-gray-200 tabular-nums",
          isAtual ? "bg-blue-50" : isTot ? "bg-gray-100" : "",
        ].join(" ")}>
        <span className={[tc, bold ? "font-bold" : "", italic ? "opacity-70 italic" : ""].join(" ")}>
          {display}
        </span>
      </td>
    );
  }

  /** Rótulo da primeira coluna */
  function Label({
    text, depth = 0, toggle, open, accent
  }: {
    text: string; depth?: number;
    toggle?: () => void; open?: boolean;
    accent?: "receita" | "despesa" | "neutral";
  }) {
    const bg =
      accent === "receita" ? "bg-emerald-700 text-white"
      : accent === "despesa" ? "bg-rose-800 text-white"
      : depth === 0 ? "bg-[#1e2d40] text-white"
      : "bg-gray-50 text-gray-600";
    return (
      <td style={{ width: ROW_LABEL_W, minWidth: ROW_LABEL_W }}
        className={`sticky left-0 z-10 px-3 py-0 text-xs font-semibold border-r border-gray-300 whitespace-nowrap ${bg}`}>
        <div className={`flex items-center gap-1.5 ${depth > 0 ? "pl-4" : ""}`}>
          {toggle && (
            <button onClick={toggle} className="opacity-70 hover:opacity-100 flex-shrink-0">
              {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          {text}
        </div>
      </td>
    );
  }

  /** Linha completa */
  function Row({
    label, vals, totVal, depth = 0, toggle, open, accent,
    color, bold = false, italic = false, rowBg = "", pct = false,
  }: {
    label: string;
    vals: number[];
    totVal: number;
    depth?: number;
    toggle?: () => void;
    open?: boolean;
    accent?: "receita" | "despesa" | "neutral";
    color?: "receita" | "despesa" | "auto" | "pct";
    bold?: boolean;
    italic?: boolean;
    rowBg?: string;
    pct?: boolean;
  }) {
    return (
      <tr className={`border-b border-gray-200 h-9 ${rowBg}`}>
        <Label text={label} depth={depth} toggle={toggle} open={open} accent={accent} />
        {vals.map((v, i) => (
          <Cel key={i} v={v} color={pct ? "pct" : color} bold={bold} italic={italic}
            isAtual={i + 1 === mesAtual && ano === hoje.getFullYear()} />
        ))}
        {/* coluna Total */}
        <Cel v={pct ? totVal / (vals.filter(x => x !== 0).length || 1) : totVal}
          color={pct ? "pct" : color} bold isTot />
      </tr>
    );
  }

  // ── Separator ─────────────────────────────────────────────────────────────
  function Sep() {
    return (
      <tr className="h-1">
        <td colSpan={14} className="bg-gray-200 p-0" />
      </tr>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 gap-3">
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="text-gray-500 text-sm">Carregando fluxo de caixa...</span>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-5">

        {/* ── Cabeçalho ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Fluxo de Caixa</h1>
            <p className="text-xs text-gray-400 mt-0.5">Realizado + Previsto · {ano}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
              <button onClick={() => setAno(a => a - 1)} className="text-gray-400 hover:text-gray-700">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold text-gray-800 w-10 text-center">{ano}</span>
              <button onClick={() => setAno(a => a + 1)} className="text-gray-400 hover:text-gray-700">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}
              className="h-8 text-xs">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Receitas",      v: totalRec,  color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: <TrendingUp className="w-4 h-4 text-emerald-500" /> },
            { label: "Despesas",      v: totalDesp, color: "text-rose-700",    bg: "bg-rose-50 border-rose-200",       icon: <TrendingDown className="w-4 h-4 text-rose-500" /> },
            { label: "Resultado",     v: totalRes,  color: totalRes >= 0 ? "text-blue-700" : "text-orange-700", bg: totalRes >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200", icon: totalRes >= 0 ? <TrendingUp className="w-4 h-4 text-blue-400" /> : <TrendingDown className="w-4 h-4 text-orange-400" /> },
            { label: "Lucratividade", v: null, pctV: lucrAnual, color: lucrAnual >= 0 ? "text-emerald-700" : "text-rose-700", bg: "bg-gray-50 border-gray-200", icon: <Minus className="w-4 h-4 text-gray-400" /> },
          ].map(({ label, v, pctV, color, bg, icon }) => (
            <div key={label} className={`rounded-xl border p-4 ${bg}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 font-medium">{label}</span>
                {icon}
              </div>
              <p className={`text-lg font-bold ${color}`}>
                {pctV !== undefined ? PCT(pctV) : BRL(v ?? 0)}
              </p>
            </div>
          ))}
        </div>

        {/* ── Legenda ── */}
        <div className="flex items-center gap-5 text-[11px] text-gray-400 select-none">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300" />mês atual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="italic text-gray-400">itálico</span>= previsto
          </span>
          <span>Valores em R$K · R$M</span>
          <span>Clique em ↕ para expandir categorias</span>
        </div>

        {/* ── Matriz ── */}
        <div className="overflow-x-auto rounded-xl border border-gray-300 shadow-sm">
          <table className="border-collapse text-xs" style={{ minWidth: ROW_LABEL_W + COL_W * 13 }}>

            {/* ── THEAD ── */}
            <thead>
              <tr className="h-9 bg-[#1e2d40]">
                <th style={{ width: ROW_LABEL_W, minWidth: ROW_LABEL_W }}
                  className="sticky left-0 z-20 bg-[#1e2d40] px-3 text-left text-xs font-bold text-gray-300 border-r border-blue-900">
                  Categoria
                </th>
                {MESES.map((m, i) => {
                  const isAtual = i + 1 === mesAtual && ano === hoje.getFullYear();
                  return (
                    <th key={m} style={{ width: COL_W, minWidth: COL_W }}
                      className={`text-center text-xs font-bold border-l border-blue-900 whitespace-nowrap
                        ${isAtual ? "bg-blue-600 text-white" : "text-gray-300"}`}>
                      <div>{m}</div>
                      {isAtual && <div className="text-[9px] font-normal text-blue-200">atual</div>}
                    </th>
                  );
                })}
                <th style={{ width: COL_W + 4, minWidth: COL_W + 4 }}
                  className="text-center text-xs font-bold text-white border-l-2 border-blue-700 bg-[#151d28]">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>

              {/* ══ RECEITAS ══ */}
              <Row
                label="↑  RECEITAS"
                vals={meses.map(m => m.totalReceitas)}
                totVal={totalRec}
                accent="receita"
                color="receita"
                bold
                toggle={() => setExReceit(v => !v)}
                open={exReceit}
              />

              {exReceit && (
                <>
                  <Row label="Faturamento" depth={1}
                    vals={meses.map(m => m.detalhe.faturamento.realizado + m.detalhe.faturamento.previsto)}
                    totVal={meses.reduce((s, m) => s + m.detalhe.faturamento.realizado + m.detalhe.faturamento.previsto, 0)}
                    color="receita" />
                  <Row label="Previsão / Cronograma" depth={1} italic
                    vals={meses.map(m =>
                      m.detalhe.cronograma_receita.realizado + m.detalhe.cronograma_receita.previsto +
                      m.detalhe.medicao_prevista.realizado + m.detalhe.medicao_prevista.previsto
                    )}
                    totVal={meses.reduce((s, m) =>
                      s + m.detalhe.cronograma_receita.realizado + m.detalhe.cronograma_receita.previsto +
                      m.detalhe.medicao_prevista.realizado + m.detalhe.medicao_prevista.previsto, 0
                    )}
                    color="receita" />
                  <Row label="Outros Créditos" depth={1}
                    vals={meses.map(m => m.detalhe.receita_outros.realizado + m.detalhe.receita_outros.previsto)}
                    totVal={meses.reduce((s, m) => s + m.detalhe.receita_outros.realizado + m.detalhe.receita_outros.previsto, 0)}
                    color="receita" />
                </>
              )}

              <Sep />

              {/* ══ DESPESAS ══ */}
              <Row
                label="↓  DESPESAS"
                vals={meses.map(m => m.totalDespesas)}
                totVal={totalDesp}
                accent="despesa"
                color="despesa"
                bold
                toggle={() => setExDesp(v => !v)}
                open={exDesp}
              />

              {exDesp && (
                <>
                  {[
                    { label: "Folha de Pagamento", key: "folha" },
                    { label: "Compras / Materiais", key: "compras" },
                    { label: "Frota",                key: "frota" },
                    { label: "Obras / Cronograma",   key: "obras" },
                    { label: "Terceiros",             key: "terceiros" },
                    { label: "Recorrentes",           key: "recorrente" },
                    { label: "Outros",                key: "outros" },
                  ].map(({ label, key }) => (
                    <Row key={key} label={label} depth={1}
                      vals={meses.map((m: any) => m.detalhe[key].realizado + m.detalhe[key].previsto)}
                      totVal={meses.reduce((s: number, m: any) => s + m.detalhe[key].realizado + m.detalhe[key].previsto, 0)}
                      color="despesa" />
                  ))}
                </>
              )}

              <Sep />

              {/* ══ RESULTADO ══ */}
              <tr className="border-b border-gray-300 h-9 bg-white">
                <td style={{ width: ROW_LABEL_W, minWidth: ROW_LABEL_W }}
                  className="sticky left-0 z-10 px-3 text-xs font-bold border-r border-gray-300 bg-[#1e2d40] text-white whitespace-nowrap">
                  Resultado
                </td>
                {meses.map((m, i) => {
                  const v = m.resultado;
                  const isAtual = i + 1 === mesAtual && ano === hoje.getFullYear();
                  return (
                    <td key={i} style={{ width: COL_W, minWidth: COL_W }}
                      className={`text-right text-xs font-bold px-2 border-l border-gray-200 tabular-nums
                        ${v > 0 ? "bg-emerald-50 text-emerald-800" : v < 0 ? "bg-rose-50 text-rose-700" : "text-gray-300"}
                        ${isAtual ? "ring-2 ring-inset ring-blue-400" : ""}`}>
                      {K(v)}
                    </td>
                  );
                })}
                <td style={{ width: COL_W + 4 }}
                  className={`text-right text-xs font-bold px-2 border-l-2 border-gray-400 tabular-nums
                    ${totalRes >= 0 ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-800"}`}>
                  {K(totalRes)}
                </td>
              </tr>

              {/* ══ ACUMULADO ══ */}
              <tr className="border-b border-gray-200 h-9">
                <td style={{ width: ROW_LABEL_W, minWidth: ROW_LABEL_W }}
                  className="sticky left-0 z-10 px-3 text-xs font-semibold border-r border-gray-300 bg-[#1e2d40] text-gray-300 whitespace-nowrap">
                  Saldo Acumulado
                </td>
                {meses.map((m, i) => {
                  const v = m.saldoAcumulado;
                  const isAtual = i + 1 === mesAtual && ano === hoje.getFullYear();
                  return (
                    <td key={i} style={{ width: COL_W, minWidth: COL_W }}
                      className={`text-right text-xs font-semibold px-2 border-l border-gray-200 tabular-nums
                        ${v > 0 ? "text-emerald-700" : v < 0 ? "text-rose-600" : "text-gray-300"}
                        ${isAtual ? "bg-blue-50" : "bg-white"}`}>
                      {K(v)}
                    </td>
                  );
                })}
                <td style={{ width: COL_W + 4 }}
                  className="text-right text-xs px-2 border-l-2 border-gray-400 bg-gray-100 text-gray-400 font-medium">
                  —
                </td>
              </tr>

              {/* ══ LUCRATIVIDADE ══ */}
              <tr className="h-9">
                <td style={{ width: ROW_LABEL_W, minWidth: ROW_LABEL_W }}
                  className="sticky left-0 z-10 px-3 text-xs font-semibold border-r border-gray-300 bg-[#1e2d40] text-gray-300 whitespace-nowrap rounded-bl-xl">
                  Lucratividade
                </td>
                {meses.map((m, i) => {
                  const v = m.lucratividade;
                  const isAtual = i + 1 === mesAtual && ano === hoje.getFullYear();
                  return (
                    <td key={i} style={{ width: COL_W, minWidth: COL_W }}
                      className={`text-right text-xs font-semibold px-2 border-l border-gray-200 tabular-nums bg-gray-50
                        ${v > 0 ? "text-emerald-700" : v < 0 ? "text-rose-600" : "text-gray-300"}
                        ${isAtual ? "ring-2 ring-inset ring-blue-300" : ""}`}>
                      {PCT(v)}
                    </td>
                  );
                })}
                <td style={{ width: COL_W + 4 }}
                  className={`text-right text-xs font-semibold px-2 border-l-2 border-gray-400 bg-gray-100 tabular-nums rounded-br-xl
                    ${lucrAnual >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  {PCT(lucrAnual)}
                </td>
              </tr>

            </tbody>
          </table>
        </div>

        {/* ── Nota ── */}
        <p className="text-[11px] text-gray-400">
          Realizados = status Pago / Recebido · Previstos = A Pagar / A Receber / A Faturar
        </p>

      </div>
    </DashboardLayout>
  );
}
