import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  RefreshCw, TrendingUp, TrendingDown, Minus, AlertCircle
} from "lucide-react";

// ─── Formatadores ─────────────────────────────────────────────────────────────

const MESES_ABR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function BRL(v: number): string {
  if (v === 0) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function PCT(v: number): string {
  if (v === 0) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(1).replace(".", ",") + "%";
}

// ─── Layout ───────────────────────────────────────────────────────────────────

const LABEL_W = 210;  // px — coluna de rótulo
const COL_W   = 130;  // px — coluna de mês (precisa caber R$ 1.730.000,00)
const TOT_W   = 140;  // px — coluna Total

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function FinanceiroFluxoCaixa() {
  const { companyId } = useCompany();
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;

  const [ano, setAno]         = useState(hoje.getFullYear());
  const [exReceit, setExReceit] = useState(true);
  const [exDesp, setExDesp]   = useState(true);
  const [exFixas, setExFixas] = useState(false);
  const [exVar, setExVar]     = useState(false);

  const { data, isLoading, refetch, isFetching } =
    (trpc as any).financial.getCashFlowMatrix.useQuery(
      { companyId, ano }, { enabled: !!companyId }
    );

  const meses: any[] = data?.meses ?? [];

  // Totais anuais
  const totalRec   = meses.reduce((s: number, m: any) => s + m.totalReceitas, 0);
  const totalDesp  = meses.reduce((s: number, m: any) => s + m.totalDespesas, 0);
  const totalRes   = totalRec - totalDesp;
  const lucrAnual  = totalRec > 0 ? (totalRes / totalRec) * 100 : 0;

  // Fixas = folha + recorrente
  const totalFixas = meses.reduce((s: number, m: any) =>
    s + (m.detalhe.folha.realizado + m.detalhe.folha.previsto)
      + (m.detalhe.recorrente.realizado + m.detalhe.recorrente.previsto), 0);
  // Variáveis = compras + frota + obras + terceiros + outros
  const totalVar = meses.reduce((s: number, m: any) =>
    s + (m.detalhe.compras.realizado + m.detalhe.compras.previsto)
      + (m.detalhe.frota.realizado + m.detalhe.frota.previsto)
      + (m.detalhe.obras.realizado + m.detalhe.obras.previsto)
      + (m.detalhe.terceiros.realizado + m.detalhe.terceiros.previsto)
      + (m.detalhe.outros.realizado + m.detalhe.outros.previsto), 0);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function isAtual(colIdx: number) {
    return colIdx + 1 === mesAtual && ano === hoje.getFullYear();
  }

  // ── Renderização de células ────────────────────────────────────────────────

  type CellVariant = "receita" | "despesa" | "resultado" | "acumulado" | "pct" | "sub" | "subtotal";

  function cellStyle(v: number, variant: CellVariant, atualCol: boolean): string {
    const base = "text-right tabular-nums text-xs px-3 py-0 border-l border-gray-200 whitespace-nowrap";
    const bg   = atualCol ? "bg-blue-50/60" : "";

    if (variant === "receita") {
      const clr = v !== 0 ? "text-blue-800 font-semibold" : "text-gray-300";
      return `${base} ${bg} ${clr}`;
    }
    if (variant === "despesa") {
      const clr = v !== 0 ? "text-red-700 font-semibold" : "text-gray-300";
      return `${base} ${bg} ${clr}`;
    }
    if (variant === "resultado") {
      const clr = v > 0 ? "bg-green-50 text-green-800 font-bold" : v < 0 ? "bg-red-50 text-red-800 font-bold" : "text-gray-300";
      return `${base} ${clr} ${atualCol ? "ring-2 ring-inset ring-blue-400" : ""}`;
    }
    if (variant === "acumulado") {
      const clr = v > 0 ? "text-green-700 font-semibold" : v < 0 ? "text-red-600 font-semibold" : "text-gray-300";
      return `${base} ${bg} ${clr}`;
    }
    if (variant === "pct") {
      const clr = v > 0 ? "text-green-700 font-semibold" : v < 0 ? "text-red-600 font-semibold" : "text-gray-300";
      return `${base} ${bg} ${clr}`;
    }
    if (variant === "subtotal") {
      const clr = v !== 0 ? "text-slate-700 font-bold" : "text-gray-200";
      return `${base} ${bg} ${clr}`;
    }
    // sub
    const clr = v !== 0 ? "text-gray-700" : "text-gray-200";
    return `${base} ${bg} ${clr}`;
  }

  // ── Componentes de linha ───────────────────────────────────────────────────

  function HeaderRow() {
    return (
      <tr className="h-10 bg-[#1e2d40]">
        <th style={{ width: LABEL_W, minWidth: LABEL_W }}
          className="sticky left-0 z-20 bg-[#1e2d40] px-4 text-left text-xs font-bold text-gray-300 border-r border-slate-600">
          Categoria
        </th>
        {MESES_ABR.map((m, i) => (
          <th key={m} style={{ width: COL_W, minWidth: COL_W }}
            className={`text-center text-xs font-bold border-l border-slate-600 whitespace-nowrap
              ${isAtual(i) ? "bg-blue-600 text-white" : "text-gray-300"}`}>
            <div>{m}</div>
            {isAtual(i) && <div className="text-[9px] font-normal text-blue-200">atual</div>}
          </th>
        ))}
        <th style={{ width: TOT_W, minWidth: TOT_W }}
          className="text-center text-xs font-bold text-white border-l-2 border-slate-500 bg-[#151d28]">
          Total Anual
        </th>
      </tr>
    );
  }

  // Linha de grupo (RECEITAS / DESPESAS)
  function GroupRow({
    label, vals, total, variant, open, onToggle
  }: {
    label: string; vals: number[]; total: number;
    variant: "receita" | "despesa";
    open: boolean; onToggle: () => void;
  }) {
    const bg  = variant === "receita" ? "bg-[#1a6b4a] text-white" : "bg-[#7a1c2a] text-white";
    const totBg = variant === "receita" ? "bg-[#155c3f] text-white font-bold" : "bg-[#661524] text-white font-bold";
    return (
      <tr className={`h-10 border-b border-opacity-30 ${variant === "receita" ? "border-green-800" : "border-red-900"}`}>
        <td style={{ width: LABEL_W, minWidth: LABEL_W }}
          className={`sticky left-0 z-10 px-4 text-xs font-bold border-r border-opacity-30 whitespace-nowrap ${bg}`}>
          <button onClick={onToggle} className="flex items-center gap-2 w-full">
            {open ? <ChevronUp className="w-3.5 h-3.5 opacity-70" /> : <ChevronDown className="w-3.5 h-3.5 opacity-70" />}
            {label}
          </button>
        </td>
        {vals.map((v, i) => (
          <td key={i} style={{ width: COL_W, minWidth: COL_W }}
            className={`text-right tabular-nums text-xs px-3 py-0 border-l border-opacity-20 font-bold whitespace-nowrap
              ${variant === "receita" ? "bg-[#1a6b4a] text-green-100 border-green-700" : "bg-[#7a1c2a] text-red-100 border-red-900"}
              ${isAtual(i) ? "ring-2 ring-inset ring-blue-400" : ""}`}>
            {BRL(v)}
          </td>
        ))}
        <td style={{ width: TOT_W, minWidth: TOT_W }}
          className={`text-right tabular-nums text-xs px-3 font-bold border-l-2 border-opacity-30 whitespace-nowrap ${totBg}`}>
          {BRL(total)}
        </td>
      </tr>
    );
  }

  // Linha de subgrupo (Despesas Fixas / Variáveis)
  function SubGroupRow({
    label, vals, total, open, onToggle
  }: {
    label: string; vals: number[]; total: number;
    open: boolean; onToggle: () => void;
  }) {
    return (
      <tr className="h-9 bg-slate-700 border-b border-slate-600">
        <td style={{ width: LABEL_W, minWidth: LABEL_W }}
          className="sticky left-0 z-10 px-4 text-xs font-bold text-slate-200 border-r border-slate-500 whitespace-nowrap bg-slate-700 pl-6">
          <button onClick={onToggle} className="flex items-center gap-2 w-full">
            {open ? <ChevronUp className="w-3 h-3 opacity-60" /> : <ChevronDown className="w-3 h-3 opacity-60" />}
            {label}
          </button>
        </td>
        {vals.map((v, i) => (
          <td key={i} style={{ width: COL_W, minWidth: COL_W }}
            className={`text-right tabular-nums text-xs px-3 font-bold text-slate-100 border-l border-slate-600 whitespace-nowrap bg-slate-700
              ${isAtual(i) ? "ring-2 ring-inset ring-blue-400" : ""}`}>
            {BRL(v)}
          </td>
        ))}
        <td style={{ width: TOT_W, minWidth: TOT_W }}
          className="text-right tabular-nums text-xs px-3 font-bold text-slate-100 border-l-2 border-slate-500 whitespace-nowrap bg-slate-800">
          {BRL(total)}
        </td>
      </tr>
    );
  }

  // Linha de detalhe (sub-item)
  function DetailRow({
    label, vals, total, variant = "sub"
  }: {
    label: string; vals: number[]; total: number; variant?: CellVariant;
  }) {
    return (
      <tr className="h-9 bg-white border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
        <td style={{ width: LABEL_W, minWidth: LABEL_W }}
          className="sticky left-0 z-10 px-4 pl-8 text-xs text-gray-600 border-r border-gray-200 whitespace-nowrap bg-white hover:bg-gray-50/50">
          {label}
        </td>
        {vals.map((v, i) => (
          <td key={i} style={{ width: COL_W, minWidth: COL_W }}
            className={cellStyle(v, variant, isAtual(i))}>
            {BRL(v)}
          </td>
        ))}
        <td style={{ width: TOT_W, minWidth: TOT_W }}
          className={`text-right tabular-nums text-xs px-3 border-l-2 border-gray-300 whitespace-nowrap bg-gray-50
            ${total !== 0 ? "text-gray-700 font-semibold" : "text-gray-200"}`}>
          {BRL(total)}
        </td>
      </tr>
    );
  }

  // Linha de resultado / acumulado / margem
  function ResultRow({
    label, vals, total, variant
  }: {
    label: string; vals: number[]; total: number; variant: CellVariant;
  }) {
    const isPct = variant === "pct";
    const lblBg = "bg-[#1e2d40] text-gray-200";
    return (
      <tr className="h-10 border-b border-gray-300">
        <td style={{ width: LABEL_W, minWidth: LABEL_W }}
          className={`sticky left-0 z-10 px-4 text-xs font-bold border-r border-gray-400 whitespace-nowrap ${lblBg}`}>
          {label}
        </td>
        {vals.map((v, i) => (
          <td key={i} style={{ width: COL_W, minWidth: COL_W }}
            className={cellStyle(v, variant, isAtual(i))}>
            {isPct ? PCT(v) : BRL(v)}
          </td>
        ))}
        <td style={{ width: TOT_W, minWidth: TOT_W }}
          className={`text-right tabular-nums text-xs px-3 font-bold border-l-2 border-gray-400 whitespace-nowrap
            ${variant === "resultado"
              ? total >= 0 ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"
              : variant === "pct"
              ? total >= 0 ? "bg-gray-100 text-green-700" : "bg-gray-100 text-red-600"
              : "bg-gray-100 text-gray-500"}`}>
          {isPct ? PCT(total) : BRL(total)}
        </td>
      </tr>
    );
  }

  function Separator() {
    return <tr className="h-1.5"><td colSpan={15} className="bg-slate-200 p-0" /></tr>;
  }

  // ── Cálculo de valores por linha ───────────────────────────────────────────

  const recVals    = meses.map((m: any) => m.totalReceitas);
  const despVals   = meses.map((m: any) => m.totalDespesas);
  const resVals    = meses.map((m: any) => m.resultado);
  const acumVals   = meses.map((m: any) => m.saldoAcumulado);
  const lucrVals   = meses.map((m: any) => m.lucratividade);

  // Sublinhas receita
  const fatVals    = meses.map((m: any) => m.detalhe.faturamento.realizado + m.detalhe.faturamento.previsto);
  const medVals    = meses.map((m: any) =>
    m.detalhe.medicao_prevista.realizado + m.detalhe.medicao_prevista.previsto +
    m.detalhe.cronograma_receita.realizado + m.detalhe.cronograma_receita.previsto);
  const outRecVals = meses.map((m: any) => m.detalhe.receita_outros.realizado + m.detalhe.receita_outros.previsto);

  // Sublinhas despesas fixas
  const folhaVals  = meses.map((m: any) => m.detalhe.folha.realizado + m.detalhe.folha.previsto);
  const recorrVals = meses.map((m: any) => m.detalhe.recorrente.realizado + m.detalhe.recorrente.previsto);
  const fixasVals  = meses.map((_: any, i: number) => folhaVals[i] + recorrVals[i]);

  // Sublinhas despesas variáveis
  const comprasVals    = meses.map((m: any) => m.detalhe.compras.realizado + m.detalhe.compras.previsto);
  const frotaVals      = meses.map((m: any) => m.detalhe.frota.realizado + m.detalhe.frota.previsto);
  const obrasVals      = meses.map((m: any) => m.detalhe.obras.realizado + m.detalhe.obras.previsto);
  const terceirosVals  = meses.map((m: any) => m.detalhe.terceiros.realizado + m.detalhe.terceiros.previsto);
  const outrosVals     = meses.map((m: any) => m.detalhe.outros.realizado + m.detalhe.outros.previsto);
  const varVals        = meses.map((_: any, i: number) =>
    comprasVals[i] + frotaVals[i] + obrasVals[i] + terceirosVals[i] + outrosVals[i]);

  function sum(arr: number[]) { return arr.reduce((a, b) => a + b, 0); }

  // ── Render ─────────────────────────────────────────────────────────────────

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

  const semDados = totalRec === 0 && totalDesp === 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-5 max-w-[1800px] mx-auto">

        {/* ── Cabeçalho ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Fluxo de Caixa</h1>
            <p className="text-xs text-gray-400 mt-0.5">Realizado + Previsto · {ano}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
              <button onClick={() => setAno(a => a - 1)} className="text-gray-400 hover:text-gray-700 p-0.5">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold text-gray-800 w-10 text-center">{ano}</span>
              <button onClick={() => setAno(a => a + 1)} className="text-gray-400 hover:text-gray-700 p-0.5">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-8 text-xs">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: "Receitas", v: totalRec,
              color: "text-blue-800", bg: "bg-blue-50 border-blue-200",
              icon: <TrendingUp className="w-4 h-4 text-blue-500" />
            },
            {
              label: "Despesas", v: totalDesp,
              color: "text-red-700", bg: "bg-red-50 border-red-200",
              icon: <TrendingDown className="w-4 h-4 text-red-500" />
            },
            {
              label: "Resultado",
              v: totalRes,
              color: totalRes >= 0 ? "text-green-800" : "text-red-700",
              bg: totalRes >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200",
              icon: totalRes >= 0
                ? <TrendingUp className="w-4 h-4 text-green-500" />
                : <TrendingDown className="w-4 h-4 text-red-500" />
            },
            {
              label: "Margem Líquida", v: null, pct: lucrAnual,
              color: lucrAnual >= 0 ? "text-green-700" : "text-red-600",
              bg: "bg-gray-50 border-gray-200",
              icon: <Minus className="w-4 h-4 text-gray-400" />
            },
          ].map(({ label, v, pct, color, bg, icon }) => (
            <div key={label} className={`rounded-xl border p-4 ${bg}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 font-medium">{label}</span>
                {icon}
              </div>
              <p className={`text-lg font-bold ${color}`}>
                {pct !== undefined ? PCT(pct ?? 0) : BRL(v ?? 0)}
              </p>
              {label === "Despesas" && (
                <div className="flex gap-3 mt-1.5">
                  <span className="text-[10px] text-slate-500">Fixas: <span className="font-semibold">{BRL(totalFixas)}</span></span>
                  <span className="text-[10px] text-slate-500">Variáveis: <span className="font-semibold">{BRL(totalVar)}</span></span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Aviso sem dados ── */}
        {semDados && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <span>
              Nenhum lançamento encontrado para {ano}. Acesse <strong>Configurações → Financeiro</strong> e clique em
              &ldquo;Importar dados&rdquo; para sincronizar os módulos.
            </span>
          </div>
        )}

        {/* ── Legenda ── */}
        <div className="flex items-center gap-5 text-[11px] text-gray-400 select-none">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300" />
            mês atual destacado
          </span>
          <span>Realizados = status Pago / Recebido</span>
          <span>Previstos = A Pagar / A Receber / A Faturar</span>
        </div>

        {/* ── Matriz ── */}
        <div className="overflow-x-auto rounded-xl border border-gray-300 shadow-sm">
          <table className="border-collapse text-xs"
            style={{ minWidth: LABEL_W + COL_W * 12 + TOT_W }}>

            <thead>
              <HeaderRow />
            </thead>

            <tbody>

              {/* ══ ENTRADAS (RECEITAS) ══ */}
              <GroupRow
                label="↑  ENTRADAS (RECEITAS)"
                vals={recVals} total={totalRec}
                variant="receita" open={exReceit}
                onToggle={() => setExReceit(v => !v)}
              />

              {exReceit && (
                <>
                  <DetailRow label="Faturamento de Obras"
                    vals={fatVals} total={sum(fatVals)} variant="receita" />
                  <DetailRow label="Medições / Cronograma Financeiro"
                    vals={medVals} total={sum(medVals)} variant="receita" />
                  <DetailRow label="Outros Créditos"
                    vals={outRecVals} total={sum(outRecVals)} variant="receita" />
                </>
              )}

              <Separator />

              {/* ══ SAÍDAS (DESPESAS) ══ */}
              <GroupRow
                label="↓  SAÍDAS (DESPESAS)"
                vals={despVals} total={totalDesp}
                variant="despesa" open={exDesp}
                onToggle={() => setExDesp(v => !v)}
              />

              {exDesp && (
                <>
                  {/* Fixas */}
                  <SubGroupRow
                    label="Despesas Fixas"
                    vals={fixasVals} total={sum(fixasVals)}
                    open={exFixas} onToggle={() => setExFixas(v => !v)}
                  />
                  {exFixas && (
                    <>
                      <DetailRow label="Folha de Pagamento (CLT + RPA)"
                        vals={folhaVals} total={sum(folhaVals)} variant="despesa" />
                      <DetailRow label="Serviços Recorrentes"
                        vals={recorrVals} total={sum(recorrVals)} variant="despesa" />
                    </>
                  )}

                  {/* Variáveis */}
                  <SubGroupRow
                    label="Despesas Variáveis"
                    vals={varVals} total={sum(varVals)}
                    open={exVar} onToggle={() => setExVar(v => !v)}
                  />
                  {exVar && (
                    <>
                      <DetailRow label="Compras / Materiais"
                        vals={comprasVals} total={sum(comprasVals)} variant="despesa" />
                      <DetailRow label="Frota (Veículos + Manutenção)"
                        vals={frotaVals} total={sum(frotaVals)} variant="despesa" />
                      <DetailRow label="Obras / Subcontratados"
                        vals={obrasVals} total={sum(obrasVals)} variant="despesa" />
                      <DetailRow label="Terceiros / Parceiros"
                        vals={terceirosVals} total={sum(terceirosVals)} variant="despesa" />
                      <DetailRow label="Outros"
                        vals={outrosVals} total={sum(outrosVals)} variant="despesa" />
                    </>
                  )}
                </>
              )}

              <Separator />

              {/* ══ RESULTADO ══ */}
              <ResultRow label="Resultado do Período"
                vals={resVals} total={totalRes} variant="resultado" />

              {/* ══ SALDO ACUMULADO ══ */}
              <ResultRow label="Saldo Acumulado"
                vals={acumVals} total={acumVals[11] ?? 0} variant="acumulado" />

              {/* ══ MARGEM ══ */}
              <ResultRow label="Margem Líquida %"
                vals={lucrVals} total={lucrAnual} variant="pct" />

            </tbody>
          </table>
        </div>

      </div>
    </DashboardLayout>
  );
}
