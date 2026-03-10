import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  DollarSign, User, Building2, Calendar, TrendingUp, BarChart3,
  ChevronDown, ChevronUp, Search, Download
} from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";

type ReportType = "funcionario" | "obra" | "mensal";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function EpiRelatorioCusto() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const [tipo, setTipo] = useState<ReportType>("funcionario");
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 6);
    return d.toISOString().split("T")[0];
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const relatorioQ = trpc.epiAvancado.relatorioCusto.useQuery(
    { companyId, tipo, dataInicio, dataFim },
    { enabled: !!companyId || companyIds?.length > 0 }
  );

  const dados = relatorioQ.data?.dados ?? [];
  const totalGeral = useMemo(() => dados.reduce((sum: number, d: any) => sum + (d.custo || 0), 0), [dados]);

  const filtered = useMemo(() => {
    if (!search) return dados;
    const s = search.toLowerCase();
    return dados.filter((d: any) => (d.nome || "").toLowerCase().includes(s) || (d.funcao || "").toLowerCase().includes(s));
  }, [dados, search]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-[#1B3A5C] flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> Relatório de Custo de EPI
        </h2>
        <p className="text-sm text-muted-foreground">Análise de gastos com EPI por funcionário, obra ou período</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button onClick={() => setTipo("funcionario")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${tipo === "funcionario" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            <User className="h-3.5 w-3.5 inline mr-1" /> Por Funcionário
          </button>
          <button onClick={() => setTipo("obra")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${tipo === "obra" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            <Building2 className="h-3.5 w-3.5 inline mr-1" /> Por Obra
          </button>
          <button onClick={() => setTipo("mensal")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${tipo === "mensal" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            <Calendar className="h-3.5 w-3.5 inline mr-1" /> Mensal
          </button>
        </div>
        <div className="flex gap-2 items-center">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="h-8 text-xs w-36" />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-8 text-xs w-36" />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="py-3 text-center">
            <DollarSign className="h-6 w-6 text-blue-600 mx-auto mb-1" />
            <p className="text-xl font-bold text-blue-700">{formatCurrency(totalGeral)}</p>
            <p className="text-xs text-blue-600">Custo Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <TrendingUp className="h-6 w-6 text-gray-600 mx-auto mb-1" />
            <p className="text-xl font-bold">{dados.length}</p>
            <p className="text-xs text-muted-foreground">{tipo === "funcionario" ? "Funcionários" : tipo === "obra" ? "Obras" : "Meses"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <DollarSign className="h-6 w-6 text-gray-600 mx-auto mb-1" />
            <p className="text-xl font-bold">{dados.length > 0 ? formatCurrency(totalGeral / dados.length) : "R$ 0"}</p>
            <p className="text-xs text-muted-foreground">Média por {tipo === "funcionario" ? "Func." : tipo === "obra" ? "Obra" : "Mês"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      {tipo !== "mensal" && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      )}

      {/* Data */}
      {relatorioQ.isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <DollarSign className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum dado encontrado para o período selecionado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((item: any, idx: number) => {
            const key = tipo === "funcionario" ? String(item.employeeId) : tipo === "obra" ? String(item.obraId) : item.mes;
            const isExpanded = expandedRow === key;
            return (
              <Card key={idx} className="overflow-hidden">
                <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedRow(isExpanded ? null : key)}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                      {tipo === "funcionario" ? <User className="h-5 w-5 text-blue-600" /> :
                        tipo === "obra" ? <Building2 className="h-5 w-5 text-blue-600" /> :
                          <Calendar className="h-5 w-5 text-blue-600" />}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">
                        {tipo === "mensal" ? (
                          new Date(item.mes + "-01T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
                        ) : item.nome}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {tipo === "funcionario" && item.funcao ? item.funcao + " | " : ""}
                        {item.qtd} itens entregues
                        {tipo === "mensal" && ` | ${item.entregas} entregas`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-blue-700">{formatCurrency(item.custo)}</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>
                {isExpanded && item.itens && (
                  <div className="border-t px-3 py-2 bg-gray-50/50">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left py-1">EPI</th>
                          <th className="text-center py-1">Qtd</th>
                          <th className="text-right py-1">Custo</th>
                          <th className="text-right py-1">Data</th>
                          {tipo === "obra" && <th className="text-right py-1">Funcionário</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {item.itens.map((sub: any, si: number) => (
                          <tr key={si} className="border-t border-gray-100">
                            <td className="py-1">{sub.nomeEpi}</td>
                            <td className="text-center py-1">{sub.quantidade}</td>
                            <td className="text-right py-1">{formatCurrency(sub.custo)}</td>
                            <td className="text-right py-1">{sub.data ? new Date(sub.data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</td>
                            {tipo === "obra" && <td className="text-right py-1">{sub.funcionario || "-"}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
