import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import MonthSelector from "@/components/MonthSelector";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown, Users, Wallet, Building2, Briefcase, Landmark, ExternalLink, ArrowLeft } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState, useMemo } from "react";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DashFolhaPagamento() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const [mesRef] = useState(() => new Date().toISOString().slice(0, 7));
  const [mes, setMes] = useState(mesRef);
  const { data, isLoading } = trpc.dashboards.folhaPagamento.useQuery({ companyId: queryCompanyId, mesReferencia: mes, ...(isConstrutoras ? { companyIds } : {}) }, { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 });
  const [, navigate] = useLocation();

  const mesLabel = useMemo(() => {
    const [y, m] = mes.split("-");
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${meses[parseInt(m) - 1]}/${y}`;
  }, [mes]);

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboards" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /> Voltar aos Dashboards</Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard Folha de Pagamento</h1>
            <p className="text-muted-foreground text-sm mt-1">Análise de custos e encargos — {mesLabel}</p>
          </div>
          <div className="flex items-center gap-3">
            <MonthSelector value={mes} onChange={setMes} />
            <PrintActions title="Dashboard Folha de Pagamento" />
          </div>
        </div>

        {!data ? (
          <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate("/folha-pagamento")}>
                <DashKpi label="Custo Total" value={fmtBRL(data.resumo.custoTotalMes)} icon={DollarSign} color="red" sub={`${data.resumo.totalFuncionarios} funcionários`} />
              </div>
              <div className="cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate("/folha-pagamento")}>
                <DashKpi label="Total Proventos" value={fmtBRL(data.resumo.totalProventosMes)} icon={TrendingUp} color="green" />
              </div>
              <div className="cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate("/folha-pagamento")}>
                <DashKpi label="Total Descontos" value={fmtBRL(data.resumo.totalDescontosMes)} icon={TrendingDown} color="orange" />
              </div>
              <div className="cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate("/folha-pagamento")}>
                <DashKpi label="Líquido Total" value={fmtBRL(data.resumo.totalLiquidoMes)} icon={Wallet} color="blue" />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <DashKpi label="FGTS" value={fmtBRL(data.resumo.totalFgtsMes)} icon={Landmark} color="teal" />
              <DashKpi label="INSS" value={fmtBRL(data.resumo.totalInssMes)} icon={Building2} color="purple" />
              <DashKpi label="IRRF" value={fmtBRL(data.resumo.totalIrrfMes)} icon={DollarSign} color="slate" />
            </div>

            {/* Evolução mensal */}
            {data.evolucaoMensal.length > 0 && (
              <DashChart
                title="Evolução Mensal da Folha (últimos 12 meses)"
                type="line"
                labels={data.evolucaoMensal.map((r: any) => { const [y, m] = r.mes.split("-"); return `${m}/${y.slice(2)}`; })}
                datasets={[
                  { label: "Proventos", data: data.evolucaoMensal.map((r: any) => r.proventos), borderColor: SEMANTIC_COLORS.proventos, backgroundColor: CHART_FILL.verde, fill: false, tension: 0.3 },
                  { label: "Descontos", data: data.evolucaoMensal.map((r: any) => r.descontos), borderColor: SEMANTIC_COLORS.descontos, backgroundColor: CHART_FILL.vermelho, fill: false, tension: 0.3 },
                  { label: "Líquido", data: data.evolucaoMensal.map((r: any) => r.liquido), borderColor: SEMANTIC_COLORS.liquido, backgroundColor: CHART_FILL.azul, fill: true, tension: 0.3 },
                ]}
                height={300}
              />
            )}

            {/* Encargos mensais */}
            {data.evolucaoMensal.length > 0 && (
              <DashChart
                title="Encargos Mensais (FGTS + INSS)"
                type="bar"
                labels={data.evolucaoMensal.map((r: any) => { const [y, m] = r.mes.split("-"); return `${m}/${y.slice(2)}`; })}
                datasets={[
                  { label: "FGTS", data: data.evolucaoMensal.map((r: any) => r.fgts), backgroundColor: SEMANTIC_COLORS.fgts },
                  { label: "INSS", data: data.evolucaoMensal.map((r: any) => r.inss), backgroundColor: SEMANTIC_COLORS.inss },
                ]}
                height={280}
              />
            )}

            {/* Custo por Função + Banco */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DashChart
                title="Custo por Função (Top 10)"
                type="horizontalBar"
                labels={data.porFuncao.map((f: any) => f.funcao)}
                datasets={[{ label: "Custo Total", data: data.porFuncao.map((f: any) => f.custo), backgroundColor: CHART_PALETTE[0] }]}
                height={280}
              />
              <DashChart
                title="Pagamentos por Banco"
                type="doughnut"
                labels={data.porBanco.map((b: any) => b.banco)}
                datasets={[{ data: data.porBanco.map((b: any) => b.valor) }]}
                height={280}
              />
            </div>

            {/* Top Salários */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-500" />
                  Top 10 Maiores Salários Brutos — {mesLabel}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topSalarios.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhum dado de folha para o período</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-4 font-medium text-muted-foreground">#</th>
                          <th className="py-2 pr-4 font-medium text-muted-foreground">Nome</th>
                          <th className="py-2 pr-4 font-medium text-muted-foreground">Função</th>
                          <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Bruto</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Líquido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topSalarios.map((s: any, i: number) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/50 cursor-pointer" onClick={() => navigate("/folha-pagamento")}>
                            <td className="py-2 pr-4 font-bold text-muted-foreground">{i + 1}</td>
                            <td className="py-2 pr-4 font-medium truncate max-w-[200px]">{s.nome}</td>
                            <td className="py-2 pr-4 text-muted-foreground">{s.funcao}</td>
                            <td className="py-2 pr-4 text-right font-semibold text-green-600">{fmtBRL(s.bruto)}</td>
                            <td className="py-2 text-right font-semibold text-blue-600">{fmtBRL(s.liquido)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
