import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, AlertCircle, RefreshCw, ArrowUpCircle, ArrowDownCircle } from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getDefaultDates() {
  const d = new Date();
  const inicio = new Date(d.getFullYear(), d.getMonth(), 1);
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    inicio: inicio.toISOString().split("T")[0],
    fim: fim.toISOString().split("T")[0],
  };
}

export default function FinanceiroConciliacao() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const defaults = getDefaultDates();
  const [dataInicio, setDataInicio] = useState(defaults.inicio);
  const [dataFim, setDataFim] = useState(defaults.fim);
  const [contaBancariaId, setContaBancariaId] = useState<string>("");
  const [conciliadoFilter, setConciliadoFilter] = useState("all");
  const [selectedStatement, setSelectedStatement] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<number | null>(null);

  const { data: bankAccounts } = (trpc as any).financial.getBankAccounts.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const { data: statements, isLoading: stLoading, refetch: refetchSt } = (trpc as any).financial.getBankStatements.useQuery(
    {
      companyId,
      contaBancariaId: parseInt(contaBancariaId) || 0,
      dataInicio,
      dataFim,
      conciliado: conciliadoFilter !== "all" ? conciliadoFilter === "conciliado" : undefined,
    },
    { enabled: !!companyId && !!contaBancariaId }
  );

  const { data: entries } = (trpc as any).financial.getEntries.useQuery(
    { companyId, dataInicio, dataFim, limit: 100 },
    { enabled: !!companyId }
  );

  const conciliarMut = (trpc as any).financial.conciliarLancamento.useMutation({
    onSuccess: () => { toast({ title: "Conciliação registrada!" }); refetchSt(); setSelectedStatement(null); setSelectedEntry(null); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const pendentes = (statements ?? []).filter((s: any) => !s.conciliado);
  const conciliados = (statements ?? []).filter((s: any) => s.conciliado);
  const totalEntradas = pendentes.filter((s: any) => s.tipo === "credito").reduce((a: number, s: any) => a + Number(s.valor), 0);
  const totalSaidas = pendentes.filter((s: any) => s.tipo === "debito").reduce((a: number, s: any) => a + Number(s.valor), 0);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <RefreshCw className="w-6 h-6 text-blue-600" />Conciliação Bancária
          </h1>
          <p className="text-sm text-gray-500 mt-1">Relacione os lançamentos do sistema com o extrato bancário</p>
        </div>

        {/* Filtros */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[180px]">
                <p className="text-xs text-gray-500 mb-1">Conta Bancária</p>
                <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a conta..." /></SelectTrigger>
                  <SelectContent>
                    {(bankAccounts ?? []).map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.banco} - {b.agencia}/{b.conta} ({b.descricao ?? b.tipo})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Data Início</p>
                <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="w-36" />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Data Fim</p>
                <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-36" />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Status</p>
                <Select value={conciliadoFilter} onValueChange={setConciliadoFilter}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pendente">Pendentes</SelectItem>
                    <SelectItem value="conciliado">Conciliados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {!contaBancariaId ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <RefreshCw className="w-14 h-14 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 font-medium">Selecione uma conta bancária para iniciar a conciliação.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Resumo */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowUpCircle className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-gray-500">Entradas Pendentes</span>
                  </div>
                  <p className="text-xl font-bold text-green-600">{formatBRL(totalEntradas)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowDownCircle className="w-4 h-4 text-red-500" />
                    <span className="text-xs text-gray-500">Saídas Pendentes</span>
                  </div>
                  <p className="text-xl font-bold text-red-500">{formatBRL(totalSaidas)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                    <span className="text-xs text-gray-500">Itens Conciliados</span>
                  </div>
                  <p className="text-xl font-bold text-blue-600">{conciliados.length}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Extrato bancário */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Extrato Bancário ({pendentes.length} pendentes)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {stLoading ? (
                    <div className="p-6 text-center text-gray-500">Carregando...</div>
                  ) : pendentes.length === 0 ? (
                    <div className="p-6 text-center text-gray-400">Nenhum item pendente.</div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                      {pendentes.map((s: any) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedStatement(selectedStatement === s.id ? null : s.id)}
                          className={`w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors ${selectedStatement === s.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                        >
                          <div>
                            <p className="text-xs text-gray-500">{s.data}</p>
                            <p className="text-sm text-gray-700 truncate max-w-[180px]">{s.descricao}</p>
                          </div>
                          <p className={`text-sm font-bold ${s.tipo === "credito" ? "text-green-600" : "text-red-500"}`}>
                            {s.tipo === "credito" ? "+" : "-"}{formatBRL(Number(s.valor))}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Lançamentos do sistema */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Lançamentos do Sistema</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {!selectedStatement ? (
                    <div className="p-6 text-center text-gray-400 text-sm">Selecione um item do extrato para relacionar.</div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                      {(entries?.data ?? []).filter((e: any) => !e.conciliado && e.status !== "cancelado").map((e: any) => (
                        <button
                          key={e.id}
                          onClick={() => setSelectedEntry(selectedEntry === e.id ? null : e.id)}
                          className={`w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors ${selectedEntry === e.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                        >
                          <div>
                            <p className="text-xs text-gray-500">{e.dataCompetencia}</p>
                            <p className="text-sm text-gray-700 truncate max-w-[180px]">{e.descricao ?? e.contaNome ?? "—"}</p>
                            <p className="text-xs text-gray-400">{e.obraNome ?? ""}</p>
                          </div>
                          <p className={`text-sm font-bold ${e.tipo === "receita" ? "text-green-600" : "text-red-500"}`}>
                            {e.tipo === "receita" ? "+" : "-"}{formatBRL(Number(e.valorPrevisto))}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Botão conciliar */}
            {selectedStatement && selectedEntry && (
              <div className="flex justify-center">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8"
                  disabled={conciliarMut.isPending}
                  onClick={() => conciliarMut.mutate({ companyId, statementLineId: selectedStatement, entryId: selectedEntry })}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {conciliarMut.isPending ? "Conciliando..." : "Conciliar Selecionados"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
