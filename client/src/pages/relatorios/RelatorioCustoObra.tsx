import DashboardLayout from "@/components/DashboardLayout";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import PrintActions from "@/components/PrintActions";
import { trpc } from "@/lib/trpc";
import { formatBRL } from "@/lib/formatBRL";
import { useCompany } from "@/contexts/CompanyContext";
import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Construction, Users, DollarSign, TrendingUp, XCircle, Building2, ChevronDown, ChevronRight, User } from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function RelatorioCustoObra() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const mesRef = `${ano}-${String(mes).padStart(2, "0")}`;
  const [expandedObras, setExpandedObras] = useState<Set<string>>(new Set());

  const custoObra = trpc.payrollEngine.custoPorObra.useQuery(
    { companyId, companyIds: isConstrutoras ? companyIds : undefined, mesReferencia: mesRef },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const data = custoObra.data as any;
  const porObra = (data?.porObra || []) as any[];
  const timecardPorObra = (data?.timecardPorObra || []) as any[];
  const detalhePorFuncionario = (data?.detalhePorFuncionario || []) as any[];

  const totals = useMemo(() => {
    let bruto = 0, liquido = 0, he = 0, funcs = 0;
    for (const o of porObra) {
      bruto += parseFloat(o.totalBruto || "0");
      liquido += parseFloat(o.totalLiquido || "0");
      he += parseFloat(o.totalHE || "0");
      funcs += Number(o.totalFuncionarios || 0);
    }
    return { bruto, liquido, he, funcs };
  }, [porObra]);

  // Merge timecard data with payment data
  const merged = useMemo(() => {
    const map = new Map<string, any>();
    for (const o of porObra) {
      const key = String(o.obraId || "sem-obra");
      map.set(key, { ...o, totalDias: 0, totalFaltas: 0 });
    }
    for (const t of timecardPorObra) {
      const key = String(t.obraId || "sem-obra");
      if (map.has(key)) {
        map.get(key)!.totalDias = Number(t.totalDias || 0);
        map.get(key)!.totalFaltas = Number(t.totalFaltas || 0);
      } else {
        map.set(key, { ...t, totalBruto: "0", totalLiquido: "0", totalHE: "0" });
      }
    }
    return Array.from(map.values()).sort((a, b) => parseFloat(b.totalBruto || "0") - parseFloat(a.totalBruto || "0"));
  }, [porObra, timecardPorObra]);

  // Group employee details by obraId
  const detalhesPorObra = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const d of detalhePorFuncionario) {
      const key = String(d.obraId || "sem-obra");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return map;
  }, [detalhePorFuncionario]);

  const toggleObra = (obraId: string) => {
    setExpandedObras(prev => {
      const next = new Set(prev);
      if (next.has(obraId)) next.delete(obraId);
      else next.add(obraId);
      return next;
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <PrintHeader title={`Custo por Obra — ${MESES[mes - 1]}/${ano}`} />

        {/* Header */}
        <div className="flex items-center justify-between print-hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Construction className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Custo por Obra</h1>
              <p className="text-sm text-muted-foreground">Rateio de custos de pessoal por obra/centro de custo</p>
            </div>
          </div>
          <PrintActions />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 print-hidden">
          <Select value={String(mes)} onValueChange={(v) => setMes(parseInt(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={(v) => setAno(parseInt(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-purple-700 text-xs font-medium mb-1"><Building2 className="w-4 h-4" /> Obras</div>
            <div className="text-xl font-bold text-purple-700">{merged.length}</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-blue-700 text-xs font-medium mb-1"><Users className="w-4 h-4" /> Funcionários</div>
            <div className="text-xl font-bold text-blue-700">{totals.funcs}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-green-700 text-xs font-medium mb-1"><TrendingUp className="w-4 h-4" /> Total Bruto</div>
            <div className="text-xl font-bold text-green-700">{formatBRL(totals.bruto)}</div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-emerald-700 text-xs font-medium mb-1"><DollarSign className="w-4 h-4" /> Total Líquido</div>
            <div className="text-xl font-bold text-emerald-700">{formatBRL(totals.liquido)}</div>
          </div>
        </div>

        {/* Obra Cards */}
        <div className="space-y-4">
          {merged.map((obra: any, idx: number) => {
            const obraKey = String(obra.obraId || "sem-obra");
            const bruto = parseFloat(obra.totalBruto || "0");
            const liquido = parseFloat(obra.totalLiquido || "0");
            const he = parseFloat(obra.totalHE || "0");
            const pctTotal = totals.bruto > 0 ? ((bruto / totals.bruto) * 100).toFixed(1) : "0";
            const isExpanded = expandedObras.has(obraKey);
            const funcionarios = detalhesPorObra.get(obraKey) || [];

            return (
              <div key={obra.obraId || idx} className="border rounded-lg overflow-hidden page-break-before">
                {/* Obra Header - Clickable */}
                <div
                  className="bg-gradient-to-r from-gray-50 to-white px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleObra(obraKey)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-purple-100 flex items-center justify-center">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-purple-600" /> : <ChevronRight className="w-4 h-4 text-purple-600" />}
                    </div>
                    <div>
                      <div className="font-bold">{obra.obraNome || "Sem Obra"}</div>
                      <div className="text-xs text-muted-foreground">{Number(obra.totalFuncionarios || 0)} funcionário(s) — clique para expandir</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-sm font-bold">{pctTotal}% do custo total</Badge>
                </div>

                {/* Summary Row */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Salário Bruto</div>
                    <div className="text-lg font-bold text-green-700">{formatBRL(bruto)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Horas Extras</div>
                    <div className="text-lg font-bold text-blue-700">{formatBRL(he)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Salário Líquido</div>
                    <div className="text-lg font-bold text-emerald-700">{formatBRL(liquido)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Total Dias</div>
                    <div className="text-lg font-bold">{Number(obra.totalDias || 0)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Faltas</div>
                    <div className="text-lg font-bold text-red-600">{Number(obra.totalFaltas || 0)}</div>
                  </div>
                </div>

                {/* Cost bar */}
                <div className="px-4 pb-3">
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-purple-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(parseFloat(pctTotal), 100)}%` }}
                    />
                  </div>
                </div>

                {/* Expanded Employee Details */}
                {isExpanded && funcionarios.length > 0 && (
                  <div className="border-t bg-gray-50/50">
                    <div className="px-4 py-2 bg-gray-100 border-b">
                      <div className="grid grid-cols-14 gap-2 text-xs font-semibold text-muted-foreground uppercase" style={{ gridTemplateColumns: '3fr 2fr 2fr 1.5fr 2fr 1fr 1fr' }}>
                        <div>Funcionário</div>
                        <div>Função</div>
                        <div className="text-right">Sal. Bruto</div>
                        <div className="text-right">H. Extras</div>
                        <div className="text-right">Sal. Líquido</div>
                        <div className="text-right">Dias</div>
                        <div className="text-right">Faltas</div>
                      </div>
                    </div>
                    <div className="divide-y">
                      {funcionarios.map((func: any, fIdx: number) => (
                        <div key={fIdx} className="px-4 py-2 hover:bg-gray-50 transition-colors">
                          <div className="grid gap-2 items-center text-sm" style={{ gridTemplateColumns: '3fr 2fr 2fr 1.5fr 2fr 1fr 1fr' }}>
                            <div className="flex items-center gap-2">
                              <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium truncate">{func.nomeCompleto}</span>
                            </div>
                            <div className="text-muted-foreground truncate text-xs">{func.funcao || func.cargo || "—"}</div>
                            <div className="text-right font-medium text-green-700">{formatBRL(parseFloat(func.salarioBruto || "0"))}</div>
                            <div className="text-right font-medium text-blue-700">{formatBRL(parseFloat(func.horasExtrasValor || "0"))}</div>
                            <div className="text-right font-medium text-emerald-700">{formatBRL(parseFloat(func.salarioLiquido || "0"))}</div>
                            <div className="text-right">{func.diasTrabalhados ?? "—"}</div>
                            <div className="text-right text-red-600">{func.faltas || 0}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Employee totals */}
                    <div className="px-4 py-2 bg-gray-100 border-t">
                      <div className="grid gap-2 items-center text-sm font-bold" style={{ gridTemplateColumns: '3fr 2fr 2fr 1.5fr 2fr 1fr 1fr' }}>
                        <div>Total ({funcionarios.length} funcionários)</div>
                        <div></div>
                        <div className="text-right text-green-700">
                          {formatBRL(funcionarios.reduce((s: number, f: any) => s + parseFloat(f.salarioBruto || "0"), 0))}
                        </div>
                        <div className="text-right text-blue-700">
                          {formatBRL(funcionarios.reduce((s: number, f: any) => s + parseFloat(f.horasExtrasValor || "0"), 0))}
                        </div>
                        <div className="text-right text-emerald-700">
                          {formatBRL(funcionarios.reduce((s: number, f: any) => s + parseFloat(f.salarioLiquido || "0"), 0))}
                        </div>
                        <div className="text-right">
                          {funcionarios.reduce((s: number, f: any) => s + (Number(f.diasTrabalhados) || 0), 0)}
                        </div>
                        <div className="text-right text-red-600">
                          {funcionarios.reduce((s: number, f: any) => s + (Number(f.faltas) || 0), 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {isExpanded && funcionarios.length === 0 && (
                  <div className="border-t bg-gray-50/50 px-4 py-4 text-center text-sm text-muted-foreground">
                    Nenhum detalhe por funcionário disponível para esta obra.
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {custoObra.isLoading && <div className="text-center py-12 text-muted-foreground">Carregando custos por obra...</div>}
        {!custoObra.isLoading && merged.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Construction className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum dado de custo por obra encontrado para {MESES[mes - 1]}/{ano}.</p>
            <p className="text-sm mt-1">Execute a simulação de pagamento na Gestão de Competências primeiro.</p>
          </div>
        )}

        <PrintFooterLGPD />
      </div>
    </DashboardLayout>
  );
}
