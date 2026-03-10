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
import { Construction, Users, DollarSign, TrendingUp, XCircle, Building2 } from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// formatBRL imported from @/lib/formatBRL

export default function RelatorioCustoObra() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const mesRef = `${ano}-${String(mes).padStart(2, "0")}`;

  const custoObra = trpc.payrollEngine.custoPorObra.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const data = custoObra.data as any;
  const porObra = (data?.porObra || []) as any[];
  const timecardPorObra = (data?.timecardPorObra || []) as any[];

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
            const bruto = parseFloat(obra.totalBruto || "0");
            const liquido = parseFloat(obra.totalLiquido || "0");
            const he = parseFloat(obra.totalHE || "0");
            const pctTotal = totals.bruto > 0 ? ((bruto / totals.bruto) * 100).toFixed(1) : "0";
            return (
              <div key={obra.obraId || idx} className="border rounded-lg overflow-hidden page-break-before">
                <div className="bg-gradient-to-r from-gray-50 to-white px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-purple-100 flex items-center justify-center">
                      <Construction className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <div className="font-bold">{obra.obraNome || "Sem Obra"}</div>
                      <div className="text-xs text-muted-foreground">{Number(obra.totalFuncionarios || 0)} funcionário(s)</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-sm font-bold">{pctTotal}% do custo total</Badge>
                </div>
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
                {/* Cost per employee bar */}
                <div className="px-4 pb-3">
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-purple-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(parseFloat(pctTotal), 100)}%` }}
                    />
                  </div>
                </div>
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
