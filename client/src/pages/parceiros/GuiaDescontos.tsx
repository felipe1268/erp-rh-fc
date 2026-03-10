import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Users, Store, FileText, CheckCircle } from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function GuiaDescontos() {
  const { user } = useAuth();
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const competencia = `${ano}-${String(mes).padStart(2, "0")}`;

  const { data: lancamentos = [] } = trpc.parceiros.lancamentos.list.useQuery(
    { companyId: companyId ?? 0, competencia },
    { enabled: !!companyId }
  );
  const { data: parceiros = [] } = trpc.parceiros.cadastro.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  const { data: colaboradores = [] } = trpc.employees.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const aprovados = useMemo(() => lancamentos.filter((l: any) => l.statusLancamento === "aprovado"), [lancamentos]);

  // Group by employee
  const porColaborador = useMemo(() => {
    const map = new Map<number, { nome: string; total: number; itens: any[] }>();
    aprovados.forEach((l: any) => {
      const emp = map.get(l.employeeId) || { nome: "", total: 0, itens: [] };
      const colab = colaboradores.find((c: any) => c.id === l.employeeId);
      emp.nome = colab ? (colab as any).nome : `Colaborador #${l.employeeId}`;
      emp.total += parseFloat(l.valor || "0");
      emp.itens.push(l);
      map.set(l.employeeId, emp);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].nome.localeCompare(b[1].nome));
  }, [aprovados, colaboradores]);

  // Group by parceiro
  const porParceiro = useMemo(() => {
    const map = new Map<number, { nome: string; total: number; count: number }>();
    aprovados.forEach((l: any) => {
      const p = map.get(l.parceiroConveniadoId) || { nome: "", total: 0, count: 0 };
      const parc = parceiros.find((pr: any) => pr.id === l.parceiroConveniadoId);
      p.nome = parc ? (parc as any).nomeFantasia || (parc as any).razaoSocial : `Parceiro #${l.parceiroConveniadoId}`;
      p.total += parseFloat(l.valor || "0");
      p.count++;
      map.set(l.parceiroConveniadoId, p);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [aprovados, parceiros]);

  const totalGeral = useMemo(() => aprovados.reduce((acc: number, l: any) => acc + parseFloat(l.valor || "0"), 0), [aprovados]);

  const getParceiroNome = (id: number) => {
    const p = parceiros.find((p: any) => p.id === id);
    return p ? (p as any).nomeFantasia || (p as any).razaoSocial : "—";
  };

  return (
    <DashboardLayout>
      <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Guia de Descontos</h1>
              <p className="text-sm text-muted-foreground">Descontos aprovados para folha de pagamento — {MESES[mes - 1]}/{ano}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={String(mes)} onValueChange={(v) => setMes(parseInt(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={(v) => setAno(parseInt(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024, 2025, 2026, 2027].map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5 text-center">
            <DollarSign className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <span className="text-2xl font-bold text-emerald-600">R$ {totalGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            <p className="text-sm text-emerald-700 mt-1">Total de Descontos</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-5 text-center">
            <Users className="h-8 w-8 text-blue-500 mx-auto mb-2" />
            <span className="text-2xl font-bold text-blue-600">{porColaborador.length}</span>
            <p className="text-sm text-blue-700 mt-1">Colaboradores com Desconto</p>
          </div>
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-5 text-center">
            <Store className="h-8 w-8 text-purple-500 mx-auto mb-2" />
            <span className="text-2xl font-bold text-purple-600">{porParceiro.length}</span>
            <p className="text-sm text-purple-700 mt-1">Parceiros com Lançamentos</p>
          </div>
        </div>

        {/* By Employee */}
        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-500" />
            Descontos por Colaborador
          </h3>
          {porColaborador.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum desconto aprovado para este mês</p>
          ) : (
            <div className="space-y-3">
              {porColaborador.map(([empId, data]) => (
                <details key={empId} className="group">
                  <summary className="flex items-center justify-between cursor-pointer p-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      <span className="font-medium text-sm">{data.nome}</span>
                      <span className="text-xs text-muted-foreground">({data.itens.length} lançamento{data.itens.length > 1 ? "s" : ""})</span>
                    </div>
                    <span className="font-bold text-emerald-600">R$ {data.total.toFixed(2)}</span>
                  </summary>
                  <div className="ml-8 mt-1 space-y-1">
                    {data.itens.map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between text-xs text-muted-foreground py-1 border-b border-dashed last:border-0">
                        <div className="flex items-center gap-2">
                          <Store className="h-3 w-3" />
                          <span>{getParceiroNome(item.parceiroConveniadoId)}</span>
                          <span>— {item.dataCompra ? new Date(item.dataCompra).toLocaleDateString("pt-BR") : "—"}</span>
                        </div>
                        <span className="font-medium text-foreground">R$ {parseFloat(item.valor || "0").toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
              <div className="flex items-center justify-between pt-3 border-t font-bold">
                <span>Total Geral</span>
                <span className="text-emerald-600">R$ {totalGeral.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* By Parceiro */}
        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Store className="h-4 w-4 text-purple-500" />
            Resumo por Parceiro (para pagamento)
          </h3>
          {porParceiro.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum parceiro com lançamentos aprovados</p>
          ) : (
            <div className="space-y-2">
              {porParceiro.map(([parcId, data]) => (
                <div key={parcId} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div>
                    <span className="font-medium text-sm">{data.nome}</span>
                    <span className="text-xs text-muted-foreground ml-2">({data.count} lançamentos)</span>
                  </div>
                  <span className="font-bold text-purple-600">R$ {data.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
