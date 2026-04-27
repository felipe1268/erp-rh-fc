import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import {
  TrendingUp, TrendingDown, RefreshCw, Calendar,
  ChevronDown, ChevronRight, ArrowUpCircle, ArrowDownCircle,
  Wallet, Activity
} from "lucide-react";

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function toISO(date: Date) {
  return date.toISOString().split("T")[0];
}

// ─── Período Presets ────────────────────────────────────────────────────────

type Agrupamento = "dia" | "semana" | "mes" | "ano";
type PresetKey = "semana" | "mes" | "trimestre" | "semestre" | "ano" | "personalizado";

const PRESETS: { key: PresetKey; label: string; agrupamento: Agrupamento }[] = [
  { key: "semana",       label: "Esta Semana",     agrupamento: "dia" },
  { key: "mes",          label: "Este Mês",        agrupamento: "dia" },
  { key: "trimestre",    label: "Trimestre",       agrupamento: "mes" },
  { key: "semestre",     label: "Semestre",        agrupamento: "mes" },
  { key: "ano",          label: "Este Ano",        agrupamento: "mes" },
  { key: "personalizado",label: "Personalizado",   agrupamento: "dia" },
];

function calcPreset(key: PresetKey): { inicio: string; fim: string } {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();

  if (key === "semana") {
    const diaSemana = hoje.getDay() === 0 ? 6 : hoje.getDay() - 1;
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - diaSemana);
    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 6);
    return { inicio: toISO(inicio), fim: toISO(fim) };
  }
  if (key === "mes") {
    return {
      inicio: toISO(new Date(ano, mes, 1)),
      fim: toISO(new Date(ano, mes + 1, 0)),
    };
  }
  if (key === "trimestre") {
    const trimestre = Math.floor(mes / 3);
    return {
      inicio: toISO(new Date(ano, trimestre * 3, 1)),
      fim: toISO(new Date(ano, trimestre * 3 + 3, 0)),
    };
  }
  if (key === "semestre") {
    const semestre = mes < 6 ? 0 : 1;
    return {
      inicio: toISO(new Date(ano, semestre * 6, 1)),
      fim: toISO(new Date(ano, semestre * 6 + 6, 0)),
    };
  }
  if (key === "ano") {
    return {
      inicio: toISO(new Date(ano, 0, 1)),
      fim: toISO(new Date(ano, 11, 31)),
    };
  }
  return {
    inicio: toISO(new Date(ano, mes, 1)),
    fim: toISO(new Date(ano, mes + 1, 0)),
  };
}

// ─── Agrupamento Labels ─────────────────────────────────────────────────────

const AGRUPAMENTOS: { key: Agrupamento; label: string }[] = [
  { key: "dia",    label: "Por Dia" },
  { key: "semana", label: "Por Semana" },
  { key: "mes",    label: "Por Mês" },
  { key: "ano",    label: "Por Ano" },
];

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color, icon, border
}: {
  label: string;
  value: number;
  sub?: string;
  color: "green" | "red" | "blue" | "orange";
  icon: React.ReactNode;
  border?: string;
}) {
  const colorMap = {
    green:  { bg: "bg-green-50",  text: "text-green-700",  icon: "text-green-500" },
    red:    { bg: "bg-red-50",    text: "text-red-700",    icon: "text-red-500" },
    blue:   { bg: "bg-blue-50",   text: "text-blue-700",   icon: "text-blue-500" },
    orange: { bg: "bg-orange-50", text: "text-orange-700", icon: "text-orange-500" },
  };
  const c = colorMap[color];
  return (
    <div className={`rounded-xl p-4 ${c.bg} ${border ?? ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className={`text-xl font-bold mt-1 ${c.text}`}>{formatBRL(value)}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`${c.icon} opacity-70`}>{icon}</div>
      </div>
    </div>
  );
}

// ─── Linha da Tabela ────────────────────────────────────────────────────────

function PeriodoRow({ p, idx }: { p: any; idx: number }) {
  const [open, setOpen] = useState(false);
  const temRealizado = p.entradasRealizadas > 0 || p.saidasRealizadas > 0;
  const temPrevisto  = p.entradasPrevistas > 0 || p.saidasPrevistas > 0;
  const saldoPeriodo = (p.entradasRealizadas + p.entradasPrevistas) - (p.saidasRealizadas + p.saidasPrevistas);
  const saldoColor   = p.saldoAcumuladoTotal >= 0 ? "text-green-700" : "text-red-600";

  return (
    <>
      <tr
        className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${idx % 2 === 0 ? "" : "bg-gray-50/40"}`}
        onClick={() => setOpen(!open)}
      >
        {/* Expand */}
        <td className="w-8 pl-3 py-3 text-gray-400">
          {open
            ? <ChevronDown className="w-4 h-4" />
            : <ChevronRight className="w-4 h-4" />}
        </td>

        {/* Período */}
        <td className="py-3 pr-4">
          <span className="text-sm font-semibold text-gray-800">{p.periodoLabel}</span>
        </td>

        {/* Entradas Realizadas */}
        <td className="py-3 pr-4 text-right">
          {p.entradasRealizadas > 0
            ? <span className="text-sm font-medium text-green-700">{formatBRL(p.entradasRealizadas)}</span>
            : <span className="text-sm text-gray-300">—</span>}
        </td>

        {/* Saídas Realizadas */}
        <td className="py-3 pr-4 text-right">
          {p.saidasRealizadas > 0
            ? <span className="text-sm font-medium text-red-600">{formatBRL(p.saidasRealizadas)}</span>
            : <span className="text-sm text-gray-300">—</span>}
        </td>

        {/* Entradas Previstas */}
        <td className="py-3 pr-4 text-right">
          {p.entradasPrevistas > 0
            ? <span className="text-sm text-green-500">{formatBRL(p.entradasPrevistas)}</span>
            : <span className="text-sm text-gray-300">—</span>}
        </td>

        {/* Saídas Previstas */}
        <td className="py-3 pr-4 text-right">
          {p.saidasPrevistas > 0
            ? <span className="text-sm text-red-400">{formatBRL(p.saidasPrevistas)}</span>
            : <span className="text-sm text-gray-300">—</span>}
        </td>

        {/* Saldo Período */}
        <td className="py-3 pr-4 text-right">
          <span className={`text-sm font-semibold ${saldoPeriodo >= 0 ? "text-blue-700" : "text-red-600"}`}>
            {saldoPeriodo >= 0 ? "+" : ""}{formatBRL(saldoPeriodo)}
          </span>
        </td>

        {/* Saldo Acumulado */}
        <td className="py-3 pr-4 text-right">
          <span className={`text-sm font-bold ${saldoColor}`}>
            {formatBRL(p.saldoAcumuladoTotal)}
          </span>
        </td>
      </tr>

      {/* Detalhe expandido */}
      {open && (
        <tr className="bg-blue-50/30 border-b border-blue-100">
          <td colSpan={8} className="px-8 py-3">
            <div className="grid grid-cols-2 gap-6 text-xs">
              {temRealizado && (
                <div>
                  <p className="font-semibold text-gray-700 mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    Realizado no período
                  </p>
                  <div className="flex gap-8">
                    <div>
                      <p className="text-gray-400">Entradas</p>
                      <p className="font-semibold text-green-700">{formatBRL(p.entradasRealizadas)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Saídas</p>
                      <p className="font-semibold text-red-600">{formatBRL(p.saidasRealizadas)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Resultado</p>
                      <p className={`font-semibold ${p.saldoLiquidoRealizado >= 0 ? "text-blue-700" : "text-red-600"}`}>
                        {formatBRL(p.saldoLiquidoRealizado)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {temPrevisto && (
                <div>
                  <p className="font-semibold text-gray-700 mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                    Previsto no período
                  </p>
                  <div className="flex gap-8">
                    <div>
                      <p className="text-gray-400">Entradas</p>
                      <p className="font-semibold text-green-500">{formatBRL(p.entradasPrevistas)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Saídas</p>
                      <p className="font-semibold text-red-400">{formatBRL(p.saidasPrevistas)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Resultado</p>
                      <p className={`font-semibold ${p.saldoLiquidoPrevisto >= 0 ? "text-blue-600" : "text-red-500"}`}>
                        {formatBRL(p.saldoLiquidoPrevisto)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Componente Principal ───────────────────────────────────────────────────

export default function FinanceiroFluxoCaixa() {
  const { companyId } = useCompany();

  const [preset, setPreset]         = useState<PresetKey>("mes");
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("dia");
  const [customInicio, setCustomInicio] = useState(toISO(new Date()));
  const [customFim, setCustomFim]       = useState(toISO(new Date()));

  const datas = useMemo(() => {
    if (preset === "personalizado") return { inicio: customInicio, fim: customFim };
    return calcPreset(preset);
  }, [preset, customInicio, customFim]);

  const { data, isLoading, refetch, isFetching } = (trpc as any).financial.getCashFlow.useQuery(
    { companyId, dataInicio: datas.inicio, dataFim: datas.fim, agrupamento },
    { enabled: !!companyId }
  );

  const periodos: any[] = data?.periodos ?? [];
  const totais = data?.totais ?? { entradasRealizadas: 0, saidasRealizadas: 0, entradasPrevistas: 0, saidasPrevistas: 0 };

  const saldoRealizado  = totais.entradasRealizadas - totais.saidasRealizadas;
  const saldoPrevisto   = totais.entradasPrevistas  - totais.saidasPrevistas;
  const saldoTotal      = saldoRealizado + saldoPrevisto;

  function handlePreset(key: PresetKey) {
    setPreset(key);
    const p = PRESETS.find(x => x.key === key);
    if (p && key !== "personalizado") setAgrupamento(p.agrupamento);
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-5">

        {/* ── Cabeçalho ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Activity className="w-6 h-6 text-blue-600" />
              Fluxo de Caixa
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">Realizado e projetado conforme lançamentos e cronograma</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="self-start"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* ── Filtros de Período ── */}
        <Card className="border border-gray-200 shadow-none">
          <CardContent className="p-4 space-y-3">
            {/* Presets */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-gray-500 flex items-center gap-1 mr-1">
                <Calendar className="w-3.5 h-3.5" /> Período:
              </span>
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => handlePreset(p.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                    preset === p.key
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Datas Personalizadas */}
            {preset === "personalizado" && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">De:</span>
                <Input
                  type="date"
                  value={customInicio}
                  onChange={e => setCustomInicio(e.target.value)}
                  className="h-8 text-sm w-36"
                />
                <span className="text-xs text-gray-500">até:</span>
                <Input
                  type="date"
                  value={customFim}
                  onChange={e => setCustomFim(e.target.value)}
                  className="h-8 text-sm w-36"
                />
              </div>
            )}

            {/* Agrupamento */}
            <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-100">
              <span className="text-xs text-gray-500">Visualizar:</span>
              {AGRUPAMENTOS.map(a => (
                <button
                  key={a.key}
                  onClick={() => setAgrupamento(a.key)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    agrupamento === a.key
                      ? "bg-gray-800 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Entradas Realizadas"
            value={totais.entradasRealizadas}
            sub="Confirmadas no período"
            color="green"
            icon={<ArrowUpCircle className="w-7 h-7" />}
          />
          <KpiCard
            label="Saídas Realizadas"
            value={totais.saidasRealizadas}
            sub="Confirmadas no período"
            color="red"
            icon={<ArrowDownCircle className="w-7 h-7" />}
          />
          <KpiCard
            label="Entradas Previstas"
            value={totais.entradasPrevistas}
            sub="Projetadas a receber"
            color="blue"
            icon={<TrendingUp className="w-7 h-7" />}
          />
          <KpiCard
            label="Saídas Previstas"
            value={totais.saidasPrevistas}
            sub="Projetadas a pagar"
            color="orange"
            icon={<TrendingDown className="w-7 h-7" />}
          />
        </div>

        {/* ── Resumo do Saldo ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className={`rounded-xl p-4 border-2 ${saldoRealizado >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Resultado Realizado</p>
            <p className={`text-2xl font-bold mt-1 ${saldoRealizado >= 0 ? "text-green-700" : "text-red-700"}`}>
              {saldoRealizado >= 0 ? "+" : ""}{formatBRL(saldoRealizado)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Entradas − Saídas realizadas</p>
          </div>
          <div className={`rounded-xl p-4 border-2 ${saldoPrevisto >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}`}>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Resultado Previsto</p>
            <p className={`text-2xl font-bold mt-1 ${saldoPrevisto >= 0 ? "text-blue-700" : "text-orange-700"}`}>
              {saldoPrevisto >= 0 ? "+" : ""}{formatBRL(saldoPrevisto)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Entradas − Saídas previstas</p>
          </div>
          <div className={`rounded-xl p-4 border-2 ${saldoTotal >= 0 ? "bg-gray-50 border-gray-300" : "bg-red-50 border-red-300"}`}>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Saldo Total do Período</p>
            <p className={`text-2xl font-bold mt-1 ${saldoTotal >= 0 ? "text-gray-800" : "text-red-700"}`}>
              {saldoTotal >= 0 ? "+" : ""}{formatBRL(saldoTotal)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Realizado + Previsto</p>
          </div>
        </div>

        {/* ── Tabela ── */}
        <Card className="border border-gray-200 shadow-none overflow-hidden">
          {/* Legenda das colunas */}
          <div className="px-4 pt-4 pb-2 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">
                Detalhamento {agrupamento === "dia" ? "Diário" : agrupamento === "semana" ? "Semanal" : agrupamento === "mes" ? "Mensal" : "Anual"}
              </p>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  Realizado
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                  Previsto
                </span>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-8 h-8 text-gray-300 mx-auto mb-3 animate-spin" />
              <p className="text-gray-400 text-sm">Carregando fluxo de caixa...</p>
            </div>
          ) : periodos.length === 0 ? (
            <div className="p-12 text-center">
              <Wallet className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm font-medium">Nenhum lançamento encontrado neste período</p>
              <p className="text-gray-300 text-xs mt-1">Tente ajustar o período ou verifique se há lançamentos cadastrados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="w-8 pl-3" />
                    <th className="py-2.5 pr-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Período
                    </th>
                    <th className="py-2.5 pr-4 text-right text-xs font-semibold text-green-600 uppercase tracking-wide">
                      ↑ Entradas
                    </th>
                    <th className="py-2.5 pr-4 text-right text-xs font-semibold text-red-500 uppercase tracking-wide">
                      ↓ Saídas
                    </th>
                    <th className="py-2.5 pr-4 text-right text-xs font-semibold text-green-400 uppercase tracking-wide">
                      ↑ Prev. Entrada
                    </th>
                    <th className="py-2.5 pr-4 text-right text-xs font-semibold text-red-300 uppercase tracking-wide">
                      ↓ Prev. Saída
                    </th>
                    <th className="py-2.5 pr-4 text-right text-xs font-semibold text-blue-600 uppercase tracking-wide">
                      Saldo Período
                    </th>
                    <th className="py-2.5 pr-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Saldo Acumulado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {periodos.map((p: any, idx: number) => (
                    <PeriodoRow key={`${p.periodoKey}-${idx}`} p={p} idx={idx} />
                  ))}
                </tbody>
                {/* Rodapé de totais */}
                <tfoot>
                  <tr className="bg-gray-100 border-t-2 border-gray-300">
                    <td />
                    <td className="py-3 pr-4 text-xs font-bold text-gray-700 uppercase tracking-wide">
                      Total do Período
                    </td>
                    <td className="py-3 pr-4 text-right text-sm font-bold text-green-700">
                      {formatBRL(totais.entradasRealizadas)}
                    </td>
                    <td className="py-3 pr-4 text-right text-sm font-bold text-red-600">
                      {formatBRL(totais.saidasRealizadas)}
                    </td>
                    <td className="py-3 pr-4 text-right text-sm font-bold text-green-500">
                      {formatBRL(totais.entradasPrevistas)}
                    </td>
                    <td className="py-3 pr-4 text-right text-sm font-bold text-red-400">
                      {formatBRL(totais.saidasPrevistas)}
                    </td>
                    <td className="py-3 pr-4 text-right text-sm font-bold text-blue-700">
                      {saldoTotal >= 0 ? "+" : ""}{formatBRL(saldoTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        {/* ── Nota de rodapé ── */}
        <p className="text-xs text-gray-400 text-center">
          Valores realizados referem-se a lançamentos com status <strong>Pago / Recebido</strong>.
          Valores previstos incluem lançamentos <strong>A Pagar / A Receber / Previsto</strong> conforme cronograma.
        </p>
      </div>
    </DashboardLayout>
  );
}
