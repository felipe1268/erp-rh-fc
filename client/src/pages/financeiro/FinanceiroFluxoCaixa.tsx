import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import {
  TrendingUp, TrendingDown, DollarSign, RefreshCw,
  ChevronDown, ChevronRight, Calendar, CheckCircle2, Clock
} from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getDefaultDates() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 5, 0);
  return {
    inicio: inicio.toISOString().split("T")[0],
    fim: fim.toISOString().split("T")[0],
  };
}

const STATUS_REALIZADO = ["pago", "recebido"];
const STATUS_PREVISTO = ["a_pagar", "a_receber", "previsto", "a_faturar", "recebido_parcial"];

function DiaItem({ dia, modo }: { dia: any; modo: "realizado" | "previsto" }) {
  const [open, setOpen] = useState(false);
  const saldoColor = dia.saldoAcumulado >= 0 ? "text-green-700" : "text-red-600";
  const isPrev = modo === "previsto";
  return (
    <div className={`border-b border-gray-100 last:border-0 ${isPrev ? "bg-blue-50/30" : ""}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        <span className="text-sm font-medium text-gray-700 w-28 flex items-center gap-1">
          {isPrev && <Clock className="w-3 h-3 text-blue-400" />}
          {dia.data}
        </span>
        <div className="flex-1 flex items-center gap-6">
          <span className="text-sm text-green-600">+{formatBRL(dia.entradas)}</span>
          <span className="text-sm text-red-500">-{formatBRL(dia.saidas)}</span>
          <span className={`text-sm font-semibold ${dia.saldoLiquido >= 0 ? "text-blue-600" : "text-red-600"}`}>
            {dia.saldoLiquido >= 0 ? "+" : ""}{formatBRL(dia.saldoLiquido)}
          </span>
        </div>
        <span className={`text-sm font-bold ${saldoColor} ml-auto`}>{formatBRL(dia.saldoAcumulado)}</span>
      </button>
      {open && dia.items?.length > 0 && (
        <div className="bg-gray-50 px-12 pb-2">
          {dia.items.map((item: any, i: number) => (
            <div key={i} className="flex items-center justify-between py-1 text-xs text-gray-600">
              <span className="truncate flex-1">{item.descricao ?? item.contaNome ?? "—"}</span>
              <span className="text-gray-400 ml-2 text-[10px]">{item.status}</span>
              <span className={item.tipo === "receita" ? "text-green-600 ml-4" : "text-red-500 ml-4"}>
                {item.tipo === "receita" ? "+" : "-"}{formatBRL(Number(item.valor ?? 0))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FinanceiroFluxoCaixa() {
  const { companyId } = useCompany();
  const defaults = getDefaultDates();
  const [dataInicio, setDataInicio] = useState(defaults.inicio);
  const [dataFim, setDataFim] = useState(defaults.fim);
  const [aba, setAba] = useState<"realizado" | "previsto" | "consolidado">("consolidado");

  const { data, isLoading, refetch } = (trpc as any).financial.getCashFlow.useQuery(
    { companyId, dataInicio, dataFim },
    { enabled: !!companyId }
  );

  // Separa dias realizados vs previstos
  const diasRealizados: any[] = [];
  const diasPrevistos: any[] = [];

  if (data?.dias) {
    let acumR = 0, acumP = 0;
    const byDateR: Record<string, any> = {};
    const byDateP: Record<string, any> = {};

    for (const dia of data.dias) {
      for (const item of dia.items ?? []) {
        const isR = STATUS_REALIZADO.includes(item.status);
        const valor = Number(item.valor ?? 0);
        const key = dia.data;

        if (isR) {
          if (!byDateR[key]) byDateR[key] = { data: key, entradas: 0, saidas: 0, items: [] };
          if (item.tipo === "receita") byDateR[key].entradas += valor;
          else byDateR[key].saidas += valor;
          byDateR[key].items.push(item);
        } else {
          if (!byDateP[key]) byDateP[key] = { data: key, entradas: 0, saidas: 0, items: [] };
          if (item.tipo === "receita") byDateP[key].entradas += valor;
          else byDateP[key].saidas += valor;
          byDateP[key].items.push(item);
        }
      }
    }

    for (const d of Object.keys(byDateR).sort()) {
      acumR += byDateR[d].entradas - byDateR[d].saidas;
      diasRealizados.push({ ...byDateR[d], saldoLiquido: byDateR[d].entradas - byDateR[d].saidas, saldoAcumulado: acumR });
    }
    for (const d of Object.keys(byDateP).sort()) {
      acumP += byDateP[d].entradas - byDateP[d].saidas;
      diasPrevistos.push({ ...byDateP[d], saldoLiquido: byDateP[d].entradas - byDateP[d].saidas, saldoAcumulado: acumP });
    }
  }

  const totR = { ent: diasRealizados.reduce((s, d) => s + d.entradas, 0), sai: diasRealizados.reduce((s, d) => s + d.saidas, 0) };
  const totP = { ent: diasPrevistos.reduce((s, d) => s + d.entradas, 0), sai: diasPrevistos.reduce((s, d) => s + d.saidas, 0) };

  const diasAtivos = aba === "realizado" ? diasRealizados : aba === "previsto" ? diasPrevistos : data?.dias ?? [];

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-blue-600" />Fluxo de Caixa
            </h1>
            <p className="text-sm text-gray-500 mt-1">Realizado e projetado conforme cronograma</p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="w-36" />
            <span className="text-gray-400 text-sm">até</span>
            <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-36" />
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 gap-4">
          {/* Realizado */}
          <Card className="border-0 shadow-sm bg-green-50/50">
            <CardHeader className="pb-1 pt-4 px-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <CardTitle className="text-sm font-semibold text-green-700">Realizado</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex items-center justify-between mt-1">
                <div>
                  <p className="text-[10px] text-gray-500">Entradas</p>
                  <p className="text-base font-bold text-green-600">{formatBRL(totR.ent)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500">Saídas</p>
                  <p className="text-base font-bold text-red-500">{formatBRL(totR.sai)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500">Saldo</p>
                  <p className={`text-base font-bold ${totR.ent - totR.sai >= 0 ? "text-blue-600" : "text-red-600"}`}>
                    {formatBRL(totR.ent - totR.sai)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Projetado */}
          <Card className="border-0 shadow-sm bg-blue-50/50">
            <CardHeader className="pb-1 pt-4 px-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <CardTitle className="text-sm font-semibold text-blue-700">Projetado (Cronograma)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex items-center justify-between mt-1">
                <div>
                  <p className="text-[10px] text-gray-500">Receitas Prev.</p>
                  <p className="text-base font-bold text-green-600">{formatBRL(totP.ent)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500">Despesas Prev.</p>
                  <p className="text-base font-bold text-red-500">{formatBRL(totP.sai)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500">Resultado</p>
                  <p className={`text-base font-bold ${totP.ent - totP.sai >= 0 ? "text-blue-600" : "text-red-600"}`}>
                    {formatBRL(totP.ent - totP.sai)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Abas */}
        <div className="flex gap-1 border-b border-gray-200">
          {(["consolidado", "realizado", "previsto"] as const).map(a => (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                aba === a
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {a === "consolidado" ? "Consolidado" : a === "realizado" ? "✓ Realizado" : "⏱ Projetado"}
            </button>
          ))}
        </div>

        {/* Tabela */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-0 border-b border-gray-100">
            <div className="flex items-center text-xs text-gray-500 px-2 pb-2 pt-0 font-semibold">
              <span className="w-4 mr-3" />
              <span className="w-28">Data</span>
              <div className="flex-1 flex items-center gap-6">
                <span className="text-green-600">Entradas</span>
                <span className="text-red-500">Saídas</span>
                <span className="text-blue-600">Saldo Dia</span>
              </div>
              <span className="ml-auto">Saldo Acumulado</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-10 text-center text-gray-500">Carregando fluxo de caixa...</div>
            ) : diasAtivos.length === 0 ? (
              <div className="p-10 text-center">
                <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">
                  {aba === "realizado"
                    ? "Nenhum lançamento realizado no período."
                    : aba === "previsto"
                    ? "Nenhuma previsão no período. O cronograma de obras será importado automaticamente."
                    : "Nenhum lançamento no período."}
                </p>
              </div>
            ) : (
              <div>
                {diasAtivos.map((dia: any, idx: number) => (
                  <DiaItem key={idx} dia={dia} modo={aba === "previsto" ? "previsto" : "realizado"} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
