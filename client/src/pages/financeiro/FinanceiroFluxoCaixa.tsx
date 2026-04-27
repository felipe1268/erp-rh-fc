import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronR,
  RefreshCw, TrendingUp, TrendingDown
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmt(v: number, compact = false): string {
  if (compact && Math.abs(v) >= 1000) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency", currency: "BRL",
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function pct(v: number): string {
  return v.toFixed(1).replace(".", ",") + "%";
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface MesData {
  mes: number;
  receitaRealizada: number;
  receitaPrevista: number;
  totalReceitas: number;
  despesaRealizada: number;
  despesaPrevista: number;
  totalDespesas: number;
  resultado: number;
  saldoAcumulado: number;
  lucratividade: number;
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

// ─── Célula de valor ─────────────────────────────────────────────────────────

function ValorCell({
  value, colorMode = "neutral", mesAtual = false, italic = false, small = false,
}: {
  value: number;
  colorMode?: "neutral" | "resultado" | "acumulado" | "receita" | "despesa" | "pct";
  mesAtual?: boolean;
  italic?: boolean;
  small?: boolean;
}) {
  let textColor = "text-gray-700";
  let bgColor = "";

  if (colorMode === "resultado") {
    bgColor = value > 0 ? "bg-green-100" : value < 0 ? "bg-red-100" : "bg-gray-100";
    textColor = value > 0 ? "text-green-800 font-bold" : value < 0 ? "text-red-700 font-bold" : "text-gray-500 font-bold";
  } else if (colorMode === "acumulado") {
    bgColor = value > 0 ? "bg-green-100" : value < 0 ? "bg-red-50" : "bg-gray-100";
    textColor = value > 0 ? "text-green-800 font-bold" : value < 0 ? "text-red-700 font-bold" : "text-gray-500 font-bold";
  } else if (colorMode === "receita") {
    textColor = value > 0 ? "text-green-700 font-semibold" : "text-gray-400";
  } else if (colorMode === "despesa") {
    textColor = value > 0 ? "text-red-600 font-semibold" : "text-gray-400";
  } else if (colorMode === "pct") {
    textColor = value > 0 ? "text-green-700" : value < 0 ? "text-red-600" : "text-gray-400";
  }

  const displayValue = colorMode === "pct" ? pct(value) : fmt(value, true);

  return (
    <td
      className={`px-2 py-2 text-right text-xs whitespace-nowrap border-l border-gray-200
        ${bgColor}
        ${mesAtual ? "ring-2 ring-inset ring-blue-300" : ""}
      `}
    >
      <span className={`${textColor} ${italic ? "italic" : ""} ${small ? "text-[10px]" : ""}`}>
        {displayValue}
      </span>
    </td>
  );
}

// ─── Linha separadora / seção ────────────────────────────────────────────────

function SectionRow({ label, meses, mesSel, getVal, colorMode, expandable, expanded, onToggle, indent = false, italic = false }: {
  label: string;
  meses: MesData[];
  mesSel: number;
  getVal: (m: MesData) => number;
  colorMode?: any;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  indent?: boolean;
  italic?: boolean;
}) {
  const total = meses.reduce((s, m) => s + getVal(m), 0);
  return (
    <tr className="border-b border-gray-200 hover:bg-gray-50/50">
      <td
        className={`px-3 py-2 text-xs font-semibold whitespace-nowrap sticky left-0 z-10 border-r border-gray-300
          ${indent ? "bg-gray-50 text-gray-600 pl-7" : "bg-[#1a3a5c] text-white"}
        `}
        style={{ minWidth: 180 }}
      >
        <div className="flex items-center gap-1">
          {expandable && (
            <button onClick={onToggle} className={`${indent ? "text-gray-500 hover:text-gray-700" : "text-blue-200 hover:text-white"}`}>
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronR className="w-3 h-3" />}
            </button>
          )}
          {label}
        </div>
      </td>
      {meses.map(m => (
        <ValorCell
          key={m.mes}
          value={getVal(m)}
          colorMode={colorMode ?? "neutral"}
          mesAtual={m.mes === mesSel}
          italic={indent || italic}
          small={indent}
        />
      ))}
      {/* Total */}
      <td className={`px-2 py-2 text-right text-xs font-bold whitespace-nowrap border-l-2 border-gray-400
        ${indent ? "bg-gray-100 text-gray-600" : "bg-[#0f2a45] text-white"}`}>
        {colorMode === "pct" ? pct(total / meses.length) : fmt(total, true)}
      </td>
    </tr>
  );
}

// ─── Linha de cabeçalho de grupo ─────────────────────────────────────────────

function GroupHeaderRow({ label, meses, mesSel, getTotal, icon, bgClass, textClass }: {
  label: string;
  meses: MesData[];
  mesSel: number;
  getTotal: (m: MesData) => number;
  icon?: React.ReactNode;
  bgClass: string;
  textClass: string;
}) {
  const total = meses.reduce((s, m) => s + getTotal(m), 0);
  return (
    <tr className="border-b border-gray-300">
      <td className={`px-3 py-2.5 text-xs font-bold sticky left-0 z-10 border-r border-gray-300 ${bgClass} ${textClass}`}
        style={{ minWidth: 180 }}>
        <div className="flex items-center gap-1.5">{icon}{label}</div>
      </td>
      {meses.map(m => (
        <td key={m.mes}
          className={`px-2 py-2.5 text-right text-xs font-bold whitespace-nowrap border-l border-gray-200 ${bgClass} ${textClass}
            ${m.mes === mesSel ? "ring-2 ring-inset ring-blue-300" : ""}`}>
          {fmt(getTotal(m), true)}
        </td>
      ))}
      <td className={`px-2 py-2.5 text-right text-xs font-bold whitespace-nowrap border-l-2 border-gray-400 ${bgClass} ${textClass}`}>
        {fmt(total, true)}
      </td>
    </tr>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function FinanceiroFluxoCaixa() {
  const { companyId } = useCompany();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mesSel] = useState(hoje.getMonth() + 1);
  const [expandReceitas, setExpandReceitas] = useState(false);
  const [expandDespesas, setExpandDespesas] = useState(false);

  const { data, isLoading, refetch, isFetching } = (trpc as any).financial.getCashFlowMatrix.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
  );

  const meses: MesData[] = data?.meses ?? [];

  // Totais anuais
  const totalReceitas  = meses.reduce((s, m) => s + m.totalReceitas, 0);
  const totalDespesas  = meses.reduce((s, m) => s + m.totalDespesas, 0);
  const totalResultado = totalReceitas - totalDespesas;
  const lucrAnual      = totalReceitas > 0 ? (totalResultado / totalReceitas) * 100 : 0;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mr-3" />
          <span className="text-gray-500">Carregando fluxo de caixa...</span>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-5">

        {/* ── Cabeçalho ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fluxo de Caixa</h1>
            <p className="text-sm text-gray-400 mt-0.5">Resultado consolidado mensal — realizados e previstos</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Seletor de Ano */}
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
              <button onClick={() => setAno(a => a - 1)} className="text-gray-400 hover:text-gray-700 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-base font-bold text-gray-800 min-w-[3rem] text-center">{ano}</span>
              <button onClick={() => setAno(a => a + 1)} className="text-gray-400 hover:text-gray-700 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* ── KPIs resumo do ano ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Receitas {ano}</p>
            <p className="text-xl font-bold text-green-700 mt-1">{fmt(totalReceitas)}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Despesas {ano}</p>
            <p className="text-xl font-bold text-red-700 mt-1">{fmt(totalDespesas)}</p>
          </div>
          <div className={`border rounded-xl p-4 ${totalResultado >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}`}>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Resultado {ano}</p>
            <p className={`text-xl font-bold mt-1 ${totalResultado >= 0 ? "text-blue-700" : "text-orange-700"}`}>
              {totalResultado >= 0 ? "+" : ""}{fmt(totalResultado)}
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Lucratividade {ano}</p>
            <p className={`text-xl font-bold mt-1 flex items-center gap-1 ${lucrAnual >= 0 ? "text-green-700" : "text-red-600"}`}>
              {lucrAnual >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {pct(lucrAnual)}
            </p>
          </div>
        </div>

        {/* ── Legenda ── */}
        <div className="flex items-center gap-6 text-xs text-gray-500 px-1">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300 inline-block" />
            Resultado positivo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300 inline-block" />
            Resultado negativo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm ring-2 ring-blue-300 inline-block" />
            Mês atual
          </span>
          <span className="flex items-center gap-1 italic text-[10px]">
            <span className="text-gray-400">valores em itálico = previsto</span>
          </span>
        </div>

        {/* ── Matriz ── */}
        <div className="overflow-x-auto rounded-xl border border-gray-300 shadow-sm">
          <table className="border-collapse" style={{ minWidth: 900 }}>
            <thead>
              <tr className="bg-[#1a3a5c]">
                <th
                  className="px-3 py-3 text-left text-xs font-bold text-white sticky left-0 z-20 bg-[#1a3a5c] border-r border-blue-700"
                  style={{ minWidth: 180 }}
                >
                  Fluxo de Caixa
                </th>
                {MESES_ABREV.map((m, i) => {
                  const num = i + 1;
                  const isAtual = num === mesSel && ano === hoje.getFullYear();
                  return (
                    <th
                      key={m}
                      className={`px-2 py-3 text-center text-xs font-bold text-white border-l border-blue-700 whitespace-nowrap
                        ${isAtual ? "bg-blue-600" : ""}`}
                      style={{ minWidth: 90 }}
                    >
                      {m}
                      {isAtual && <span className="block text-[9px] text-blue-200 font-normal">atual</span>}
                    </th>
                  );
                })}
                <th className="px-2 py-3 text-center text-xs font-bold text-white border-l-2 border-blue-500 whitespace-nowrap bg-[#0f2a45]"
                  style={{ minWidth: 95 }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>

              {/* ══ RECEITAS ══ */}
              <GroupHeaderRow
                label="↑ RECEITAS"
                meses={meses}
                mesSel={mesSel}
                getTotal={m => m.totalReceitas}
                icon={<TrendingUp className="w-3 h-3" />}
                bgClass="bg-[#1e5c2e]"
                textClass="text-white"
              />

              {expandReceitas && (
                <>
                  <SectionRow label="Faturamento de Obras" meses={meses} mesSel={mesSel}
                    getVal={m => m.detalhe.faturamento.realizado + m.detalhe.faturamento.previsto}
                    colorMode="receita" indent />
                  <SectionRow label="Previsão Cronograma" meses={meses} mesSel={mesSel}
                    getVal={m => m.detalhe.cronograma_receita.realizado + m.detalhe.cronograma_receita.previsto + m.detalhe.medicao_prevista.realizado + m.detalhe.medicao_prevista.previsto}
                    colorMode="receita" indent italic />
                  <SectionRow label="Outros Créditos" meses={meses} mesSel={mesSel}
                    getVal={m => m.detalhe.receita_outros.realizado + m.detalhe.receita_outros.previsto}
                    colorMode="receita" indent />
                </>
              )}

              <SectionRow
                label="Receitas Realizadas"
                meses={meses}
                mesSel={mesSel}
                getVal={m => m.receitaRealizada}
                colorMode="receita"
                expandable
                expanded={expandReceitas}
                onToggle={() => setExpandReceitas(v => !v)}
              />
              <SectionRow
                label="Receitas Previstas"
                meses={meses}
                mesSel={mesSel}
                getVal={m => m.receitaPrevista}
                colorMode="receita"
                italic
              />

              {/* ══ DESPESAS ══ */}
              <GroupHeaderRow
                label="↓ DESPESAS"
                meses={meses}
                mesSel={mesSel}
                getTotal={m => m.totalDespesas}
                icon={<TrendingDown className="w-3 h-3" />}
                bgClass="bg-[#7a1a1a]"
                textClass="text-white"
              />

              {expandDespesas && (
                <>
                  <SectionRow label="Folha de Pagamento" meses={meses} mesSel={mesSel}
                    getVal={m => m.detalhe.folha.realizado + m.detalhe.folha.previsto}
                    colorMode="despesa" indent />
                  <SectionRow label="Compras / Materiais" meses={meses} mesSel={mesSel}
                    getVal={m => m.detalhe.compras.realizado + m.detalhe.compras.previsto}
                    colorMode="despesa" indent />
                  <SectionRow label="Frota" meses={meses} mesSel={mesSel}
                    getVal={m => m.detalhe.frota.realizado + m.detalhe.frota.previsto}
                    colorMode="despesa" indent />
                  <SectionRow label="Obras / Cronograma" meses={meses} mesSel={mesSel}
                    getVal={m => m.detalhe.obras.realizado + m.detalhe.obras.previsto}
                    colorMode="despesa" indent />
                  <SectionRow label="Terceiros / Subcontrat." meses={meses} mesSel={mesSel}
                    getVal={m => m.detalhe.terceiros.realizado + m.detalhe.terceiros.previsto}
                    colorMode="despesa" indent />
                  <SectionRow label="Recorrentes" meses={meses} mesSel={mesSel}
                    getVal={m => m.detalhe.recorrente.realizado + m.detalhe.recorrente.previsto}
                    colorMode="despesa" indent />
                  <SectionRow label="Outros" meses={meses} mesSel={mesSel}
                    getVal={m => m.detalhe.outros.realizado + m.detalhe.outros.previsto}
                    colorMode="despesa" indent />
                </>
              )}

              <SectionRow
                label="Despesas Realizadas"
                meses={meses}
                mesSel={mesSel}
                getVal={m => m.despesaRealizada}
                colorMode="despesa"
                expandable
                expanded={expandDespesas}
                onToggle={() => setExpandDespesas(v => !v)}
              />
              <SectionRow
                label="Despesas Previstas"
                meses={meses}
                mesSel={mesSel}
                getVal={m => m.despesaPrevista}
                colorMode="despesa"
                italic
              />

              {/* ══ RESULTADO ══ */}
              <tr className="border-b border-gray-300">
                <td className="px-3 py-3 text-xs font-bold sticky left-0 z-10 bg-[#1a3a5c] text-white border-r border-gray-300 whitespace-nowrap"
                  style={{ minWidth: 180 }}>
                  Lucro / Prejuízo
                </td>
                {meses.map(m => (
                  <td key={m.mes}
                    className={`px-2 py-3 text-right text-xs font-bold whitespace-nowrap border-l border-gray-200
                      ${m.resultado > 0 ? "bg-green-100 text-green-800" : m.resultado < 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}
                      ${m.mes === mesSel ? "ring-2 ring-inset ring-blue-300" : ""}`}>
                    {m.resultado >= 0 ? "+" : ""}{fmt(m.resultado, true)}
                  </td>
                ))}
                <td className={`px-2 py-3 text-right text-xs font-bold whitespace-nowrap border-l-2 border-gray-400
                  ${totalResultado >= 0 ? "bg-green-200 text-green-900" : "bg-red-200 text-red-900"}`}>
                  {totalResultado >= 0 ? "+" : ""}{fmt(totalResultado, true)}
                </td>
              </tr>

              {/* ══ ACUMULADO ══ */}
              <tr className="border-b border-gray-300">
                <td className="px-3 py-3 text-xs font-bold sticky left-0 z-10 bg-[#1a3a5c] text-white border-r border-gray-300 whitespace-nowrap"
                  style={{ minWidth: 180 }}>
                  Acumulado
                </td>
                {meses.map(m => (
                  <td key={m.mes}
                    className={`px-2 py-3 text-right text-xs font-bold whitespace-nowrap border-l border-gray-200
                      ${m.saldoAcumulado >= 0 ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}
                      ${m.mes === mesSel ? "ring-2 ring-inset ring-blue-300" : ""}`}>
                    {fmt(m.saldoAcumulado, true)}
                  </td>
                ))}
                <td className="px-2 py-3 text-right text-xs font-bold whitespace-nowrap border-l-2 border-gray-400 bg-[#0f2a45] text-white">
                  —
                </td>
              </tr>

              {/* ══ LUCRATIVIDADE ══ */}
              <tr>
                <td className="px-3 py-3 text-xs font-bold sticky left-0 z-10 bg-[#1a3a5c] text-white border-r border-gray-300 whitespace-nowrap rounded-bl-xl"
                  style={{ minWidth: 180 }}>
                  Lucratividade
                </td>
                {meses.map(m => (
                  <td key={m.mes}
                    className={`px-2 py-3 text-right text-xs font-semibold whitespace-nowrap border-l border-gray-200 bg-gray-50
                      ${m.lucratividade > 0 ? "text-green-700" : m.lucratividade < 0 ? "text-red-600" : "text-gray-400"}
                      ${m.mes === mesSel ? "ring-2 ring-inset ring-blue-300" : ""}`}>
                    {pct(m.lucratividade)}
                  </td>
                ))}
                <td className="px-2 py-3 text-right text-xs font-semibold whitespace-nowrap border-l-2 border-gray-400 bg-[#0f2a45] text-white rounded-br-xl">
                  {pct(lucrAnual)}
                </td>
              </tr>

            </tbody>
          </table>
        </div>

        {/* ── Nota de rodapé ── */}
        <div className="text-xs text-gray-400 flex flex-wrap gap-4 px-1">
          <span>• <strong>Realizados</strong>: status Pago / Recebido</span>
          <span>• <em>Previstos</em>: status A Pagar / A Receber / Previsto / A Faturar</span>
          <span>• Clique em <strong>↑ RECEITAS</strong> ou <strong>↓ DESPESAS</strong> para ver o detalhamento por categoria</span>
        </div>

      </div>
    </DashboardLayout>
  );
}
