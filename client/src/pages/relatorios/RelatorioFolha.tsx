import DashboardLayout from "@/components/DashboardLayout";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import PrintActions from "@/components/PrintActions";
import { trpc } from "@/lib/trpc";
import { formatBRL } from "@/lib/formatBRL";
import { useCompany } from "@/contexts/CompanyContext";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Search, Users, DollarSign, TrendingDown, TrendingUp } from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// formatBRL imported from @/lib/formatBRL

export default function RelatorioFolha() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const mesRef = `${ano}-${String(mes).padStart(2, "0")}`;

  const pagamentos = trpc.payrollEngine.listarPagamentos.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 }
  );
  const resumo = trpc.payrollEngine.resumoCompetencia.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 }
  );

  const data = (pagamentos.data || []) as any[];
  const r = resumo.data as any;

  const filtered = useMemo(() => {
    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter((p: any) => p.nomeCompleto?.toLowerCase().includes(s) || p.codigoInterno?.toLowerCase().includes(s));
  }, [data, search]);

  const totals = useMemo(() => {
    let bruto = 0, liquido = 0, descontos = 0, he = 0;
    for (const p of filtered) {
      bruto += parseFloat(p.salarioBrutoMes || "0");
      liquido += parseFloat(p.salarioLiquido || "0");
      descontos += parseFloat(p.totalDescontos || "0");
      he += parseFloat(p.horasExtrasValor || "0");
    }
    return { bruto, liquido, descontos, he };
  }, [filtered]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <PrintHeader title={`Relatório de Folha de Pagamento — ${MESES[mes - 1]}/${ano}`} />

        {/* Header */}
        <div className="flex items-center justify-between print-hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Relatório de Folha</h1>
              <p className="text-sm text-muted-foreground">Resumo da folha de pagamento por funcionário</p>
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
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar funcionário..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-blue-700 text-xs font-medium mb-1"><Users className="w-4 h-4" /> Funcionários</div>
            <div className="text-xl font-bold text-blue-700">{filtered.length}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-green-700 text-xs font-medium mb-1"><TrendingUp className="w-4 h-4" /> Total Bruto</div>
            <div className="text-xl font-bold text-green-700">{formatBRL(totals.bruto)}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-700 text-xs font-medium mb-1"><TrendingDown className="w-4 h-4" /> Total Descontos</div>
            <div className="text-xl font-bold text-red-700">{formatBRL(totals.descontos)}</div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-emerald-700 text-xs font-medium mb-1"><DollarSign className="w-4 h-4" /> Total Líquido</div>
            <div className="text-xl font-bold text-emerald-700">{formatBRL(totals.liquido)}</div>
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Código</th>
                <th className="text-left px-3 py-2 font-medium">Funcionário</th>
                <th className="text-left px-3 py-2 font-medium">Função</th>
                <th className="text-right px-3 py-2 font-medium">Salário Bruto</th>
                <th className="text-right px-3 py-2 font-medium">Horas Extras</th>
                <th className="text-right px-3 py-2 font-medium">Adiantamento</th>
                <th className="text-right px-3 py-2 font-medium">Desc. Faltas</th>
                <th className="text-right px-3 py-2 font-medium">Desc. VR</th>
                <th className="text-right px-3 py-2 font-medium">Desc. VT</th>
                <th className="text-right px-3 py-2 font-medium">Total Desc.</th>
                <th className="text-right px-3 py-2 font-medium font-bold">Líquido</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => (
                <tr key={p.id} className="border-t hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-mono text-xs">{p.codigoInterno}</td>
                  <td className="px-3 py-2 font-medium">{p.nomeCompleto}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.funcao}</td>
                  <td className="px-3 py-2 text-right">{formatBRL(p.salarioBrutoMes)}</td>
                  <td className="px-3 py-2 text-right text-blue-600">{formatBRL(p.horasExtrasValor)}</td>
                  <td className="px-3 py-2 text-right text-orange-600">-{formatBRL(p.descontoAdiantamento)}</td>
                  <td className="px-3 py-2 text-right text-red-600">-{formatBRL(p.descontoFaltas)}</td>
                  <td className="px-3 py-2 text-right text-red-600">-{formatBRL(p.descontoVrFalta)}</td>
                  <td className="px-3 py-2 text-right text-red-600">-{formatBRL(p.descontoVtFalta)}</td>
                  <td className="px-3 py-2 text-right text-red-700 font-medium">-{formatBRL(p.totalDescontos)}</td>
                  <td className="px-3 py-2 text-right font-bold text-blue-700">{formatBRL(p.salarioLiquido)}</td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td colSpan={3} className="px-3 py-2">TOTAL ({filtered.length} funcionários)</td>
                  <td className="px-3 py-2 text-right">{formatBRL(totals.bruto)}</td>
                  <td className="px-3 py-2 text-right text-blue-600">{formatBRL(totals.he)}</td>
                  <td colSpan={4}></td>
                  <td className="px-3 py-2 text-right text-red-700">-{formatBRL(totals.descontos)}</td>
                  <td className="px-3 py-2 text-right text-blue-700">{formatBRL(totals.liquido)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {pagamentos.isLoading && <div className="text-center py-12 text-muted-foreground">Carregando folha de pagamento...</div>}
        {!pagamentos.isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum pagamento encontrado para {MESES[mes - 1]}/{ano}.</p>
            <p className="text-sm mt-1">Execute a simulação de pagamento na Gestão de Competências primeiro.</p>
          </div>
        )}

        <PrintFooterLGPD />
      </div>
    </DashboardLayout>
  );
}
