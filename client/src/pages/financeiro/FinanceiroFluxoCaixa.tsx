import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { TrendingUp, TrendingDown, DollarSign, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { useState as useToggle } from "react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getDefaultDates() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0);
  return {
    inicio: inicio.toISOString().split("T")[0],
    fim: fim.toISOString().split("T")[0],
  };
}

function DiaItem({ dia }: { dia: any }) {
  const [open, setOpen] = useState(false);
  const saldoColor = dia.saldoAcumulado >= 0 ? "text-green-700" : "text-red-600";
  return (
    <div className={`border-b border-gray-100 last:border-0`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        <span className="text-sm font-medium text-gray-700 w-28">{dia.data}</span>
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

  const { data, isLoading, refetch } = (trpc as any).financial.getCashFlow.useQuery(
    { companyId, dataInicio, dataFim },
    { enabled: !!companyId }
  );

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-blue-600" />Fluxo de Caixa
            </h1>
            <p className="text-sm text-gray-500 mt-1">Entradas e saídas por dia — saldo acumulado</p>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="w-36" />
            <span className="text-gray-400 text-sm">até</span>
            <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-36" />
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Totais */}
        {data && (
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-xs text-gray-500">Total Entradas</span>
                </div>
                <p className="text-xl font-bold text-green-600">{formatBRL(data.totalEntradas)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-gray-500">Total Saídas</span>
                </div>
                <p className="text-xl font-bold text-red-500">{formatBRL(data.totalSaidas)}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                  <span className="text-xs text-gray-500">Saldo Final</span>
                </div>
                <p className={`text-xl font-bold ${data.saldoFinal >= 0 ? "text-blue-600" : "text-red-600"}`}>
                  {formatBRL(data.saldoFinal)}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

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
              <div className="p-10 text-center text-gray-500">Carregando fluxo...</div>
            ) : !data || data.dias.length === 0 ? (
              <div className="p-10 text-center text-gray-400">Nenhum lançamento encontrado no período.</div>
            ) : (
              <div>
                {data.dias.map((dia: any, idx: number) => (
                  <DiaItem key={idx} dia={dia} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
