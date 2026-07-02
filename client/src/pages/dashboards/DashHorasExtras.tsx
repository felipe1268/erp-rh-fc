import { SEMANTIC_COLORS, CHART_PALETTE } from "@/lib/chartColors";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";
import { EmpNameWithStatus } from "@/components/EmpStatusBadge";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Clock, DollarSign, Users, TrendingUp, Percent, Building2,
  BarChart3, Loader2, ExternalLink, ArrowLeft, Timer, UserPlus } from "lucide-react";
import TabelaComparativaAnual, { type LinhaInd } from "@/components/TabelaComparativaAnual";

const HE_INDICADORES: LinhaInd[] = [
  { chave: "totalHoras", label: "Total de Horas Extras", icone: Clock, cor: "orange", lowerIsBetter: true,
    pegar: r => Number(r.totalHoras) || 0, format: v => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`,
    alertaPct: 25, hint: "Variação > 25% vs mês anterior pede investigação (cronograma, atraso, surto de demanda).",
    acoes: ["Confirmar se houve evento extraordinário (entrega, virada de mês de faturamento).", "Comparar com Diário de Obra: dias trabalhados em fim de semana.", "Cruzar com Apontamentos de Campo: paralisações que geraram recuperação.", "Avaliar dimensionamento da equipe da obra com mais HE."] },
  { chave: "totalValor", label: "Custo Total HE (R$)", icone: DollarSign, cor: "red", lowerIsBetter: true,
    pegar: r => Number(r.totalValor) || 0, format: v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    alertaPct: 25, hint: "Acompanha o volume de horas; alta sustentada pressiona orçamento e CMV.",
    acoes: ["Mapear obras com maior custo de HE (ranking).", "Avaliar se o orçamento da obra previa esse volume.", "Negociar banco de horas (CCT permite até 6 meses de compensação).", "Considerar contratação CLT vs HE quando custo de HE > 30% do salário base."] },
  { chave: "pessoasComHE", label: "Pessoas com HE", icone: Users, cor: "blue", lowerIsBetter: false,
    pegar: r => Number(r.pessoasComHE) || 0, format: v => `${v}`,
    alertaPct: 30, hint: "Concentração em poucas pessoas → risco de burnout (NR-17 / fadiga).",
    acoes: ["Identificar Top 10 com mais HE/mês.", "Avaliar revezamento entre equipes da mesma obra.", "Monitorar atestados das pessoas com >40h HE/mês."] },
  { chave: "media", label: "Média h/Pessoa", icone: TrendingUp, cor: "yellow", lowerIsBetter: true,
    pegar: r => Number(r.mediaHorasPorPessoa) || 0, format: v => `${v.toFixed(1)}h`,
    alertaAbsoluto: v => v > 20,
    hint: "Acima de 20h/mês por pessoa indica jornada extenuante (CLT Art. 59 limita 2h/dia).",
    acoes: ["CLT permite até ~44h/mês de HE (2h/dia × 22 dias).", "Acima de 30h/mês: revisar com SST por risco de fadiga.", "Negociar banco de horas no lugar de pagamento de HE."] },
  { chave: "percHEFolha", label: "% HE / Folha Bruta", icone: Percent, cor: "orange", lowerIsBetter: true,
    pegar: r => Number(r.percentualHEsobreFolha) || 0, format: v => `${v.toFixed(1)}%`,
    alertaAbsoluto: v => v > 5,
    hint: "Benchmark setor construção: 3-5%. Acima de 5% por 3 meses = déficit estrutural.",
    acoes: ["Se > 5% por 3 meses: déficit estrutural — abrir vagas.", "Comparar com benchmark setor (CBIC: ~4% no setor construção).", "Validar se previsão orçamentária prevê esse % ou se é estouro de meta."] },
  { chave: "custoPP", label: "Custo HE / Pessoa", icone: UserPlus, cor: "purple", lowerIsBetter: true,
    pegar: r => { const t = Number(r.totalValor) || 0; const p = Number(r.pessoasComHE) || 0; return p > 0 ? t / p : 0; },
    format: v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    alertaPct: 25, hint: "Custo médio de HE por colaborador no mês.",
    acoes: ["Correlacionar com função (encarregados costumam ter mais HE).", "Comparar entre obras: dispersão alta sugere má distribuição."] },
];
import { Link } from "wouter";
import { useState, useMemo } from "react";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function DashHorasExtras() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;

  const _now = new Date();
  const [ano, setAno] = useState(_now.getFullYear());
  const [mes, setMes] = useState(_now.getMonth() + 1);
  const mesRef = useMemo(() => `${ano}-${String(mes).padStart(2, "0")}`, [ano, mes]);

  const queryInput = useMemo(() => ({
    companyId: queryCompanyId,
    year: ano,
    periodoTipo: "mes" as const,
    periodoValor: String(mes),
    ...(isConstrutoras ? { companyIds } : {}),
  }), [queryCompanyId, ano, mes, isConstrutoras, companyIds]);

  const { data, isLoading } = trpc.dashboards.horasExtras.useQuery(queryInput, { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 });
  const { data: comparativo, isLoading: loadingComp } = trpc.dashboards.horasExtrasComparativo.useQuery(
    { companyId: queryCompanyId, ano, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );

  const periodoLabel = `${MESES_FULL[mes - 1]} ${ano}`;

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* HEADER */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboards" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /> Voltar aos Dashboards</Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard Horas Extras</h1>
            <p className="text-muted-foreground text-sm mt-1">Análise detalhada de horas extras — {MESES_FULL[mes - 1].slice(0, 3)}/{ano}</p>
          </div>
          <PrintActions title="Dashboard Horas Extras" />
        </div>

        {/* Seletor de período — padrão ERP */}
        <PeriodSelectorCard ano={ano} mes={mes} onAno={setAno} onMes={setMes} />

        {!data ? (
          <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <DashKpi label="Total de Horas" value={data.resumo.totalHoras.toLocaleString("pt-BR")} icon={Clock} color="orange" sub={`${data.resumo.totalRegistros} registros`} />
              <DashKpi label="Custo Total HE" value={fmtBRL(data.resumo.totalValor)} icon={DollarSign} color="red" />
              <DashKpi label="Pessoas com HE" value={data.resumo.pessoasComHE} icon={Users} color="blue" />
              <DashKpi label="Média por Pessoa" value={`${data.resumo.mediaHorasPorPessoa}h`} icon={TrendingUp} color="green" sub={fmtBRL(data.resumo.mediaValorPorPessoa)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DashKpi label="% HE sobre Folha Bruta" value={`${data.resumo.percentualHEsobreFolha}%`} icon={Percent} color="purple" sub={`Folha: ${fmtBRL(data.resumo.totalFolhaBruto)}`} />
              <DashKpi label="Custo HE / Pessoa" value={fmtBRL(data.resumo.mediaValorPorPessoa)} icon={DollarSign} color="teal" sub={`Média de ${data.resumo.mediaHorasPorPessoa}h por pessoa`} />
            </div>

            {/* Gráficos lado a lado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.rankingObra.length > 0 && (
                <DashChart
                  title="Horas Extras por Obra"
                  type="horizontalBar"
                  labels={data.rankingObra.map(r => r.obra.length > 25 ? r.obra.slice(0, 25) + "..." : r.obra)}
                  datasets={[{ label: "Horas", data: data.rankingObra.map(r => r.horas), backgroundColor: CHART_PALETTE[0] }]}
                  height={Math.max(200, data.rankingObra.length * 35)}
                />
              )}
              {data.rankingSetor.length > 0 && (
                <DashChart
                  title="Horas Extras por Setor"
                  type="horizontalBar"
                  labels={data.rankingSetor.map(r => r.setor)}
                  datasets={[{ label: "Horas", data: data.rankingSetor.map(r => r.horas), backgroundColor: CHART_PALETTE[1] }]}
                  height={Math.max(200, data.rankingSetor.length * 35)}
                />
              )}
            </div>

            {/* Percentuais */}
            {data.percentuais.length > 0 && (
              <DashChart
                title="Distribuição por Percentual de Acréscimo"
                type="doughnut"
                labels={data.percentuais.map(p => p.percentual)}
                datasets={[{ data: data.percentuais.map(p => p.count), backgroundColor: [CHART_PALETTE[2], CHART_PALETTE[3], CHART_PALETTE[0], CHART_PALETTE[1], CHART_PALETTE[4]] }]}
                height={240}
              />
            )}

            {/* Ranking de Pessoas */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  Ranking de Horas Extras por Funcionário (Top 15)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.rankingPessoa.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma hora extra registrada no período</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">#</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Nome</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Função</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Setor</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Horas</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Valor</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Registros</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rankingPessoa.map((r: any, i: number) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 pr-3">
                              <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${i < 3 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                            </td>
                            <td className="py-2 pr-3 font-medium">
                              {r.employeeId ? (
                                <Link href={`/colaboradores?edit=${r.employeeId}`} className="text-blue-600 hover:underline flex items-center gap-1">
                                  <EmpNameWithStatus nome={r.nome} isDesligado={r.isDesligado} maxWidth="max-w-[180px]" />
                                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                </Link>
                              ) : (
                                <EmpNameWithStatus nome={r.nome} isDesligado={r.isDesligado} maxWidth="max-w-[180px]" />
                              )}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground text-xs">{r.funcao}</td>
                            <td className="py-2 pr-3 text-muted-foreground text-xs">{r.setor}</td>
                            <td className="py-2 pr-3 text-right font-bold text-orange-600">{r.horas.toLocaleString("pt-BR")}h</td>
                            <td className="py-2 pr-3 text-right font-semibold text-red-600">{fmtBRL(r.valor)}</td>
                            <td className="py-2 text-right text-muted-foreground">{r.registros}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Custo por Obra */}
            {data.rankingObra.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-500" />
                    Custo de Horas Extras por Obra
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Obra</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Horas</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Custo</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Pessoas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rankingObra.map((r: any, i: number) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 pr-3 font-medium">{r.obra}</td>
                            <td className="py-2 pr-3 text-right font-semibold text-orange-600">{r.horas.toLocaleString("pt-BR")}h</td>
                            <td className="py-2 pr-3 text-right font-semibold text-red-600">{fmtBRL(r.valor)}</td>
                            <td className="py-2 text-right text-muted-foreground">{r.pessoas}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabela Detalhada */}
            {data.detalhes && data.detalhes.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-indigo-500" />
                    Detalhamento por Registro ({data.detalhes.length} registros)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left bg-muted/30">
                          <th className="py-2 px-3 font-medium text-muted-foreground">Competência</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground">Colaborador</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground">Função</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground">Setor</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground">Obra</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-right">Horas</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-right">%</th>
                          <th className="py-2 px-3 font-medium text-muted-foreground text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.detalhes.map((d: any, i: number) => (
                          <tr key={d.id || i} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 px-3 font-mono text-xs">{d.mesReferencia}</td>
                            <td className="py-2 px-3 font-medium">
                              {d.employeeId ? (
                                <Link href={`/colaboradores?edit=${d.employeeId}`} className="text-blue-600 hover:underline block">
                                  <EmpNameWithStatus nome={d.nome} isDesligado={d.isDesligado} maxWidth="max-w-[160px]" />
                                </Link>
                              ) : (
                                <EmpNameWithStatus nome={d.nome} isDesligado={d.isDesligado} maxWidth="max-w-[160px]" />
                              )}
                            </td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">{d.funcao}</td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">{d.setor}</td>
                            <td className="py-2 px-3 text-xs text-muted-foreground truncate max-w-[120px]">{d.obra}</td>
                            <td className="py-2 px-3 text-right font-bold text-orange-600">{d.horas.toLocaleString("pt-BR")}h</td>
                            <td className="py-2 px-3 text-right text-xs">{d.percentual}%</td>
                            <td className="py-2 px-3 text-right font-semibold text-red-600">{fmtBRL(d.valorTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
            <TabelaComparativaAnual
              meses={comparativo?.meses || []}
              indicadores={HE_INDICADORES}
              isLoading={loadingComp}
              titulo={`Tendência mês-a-mês — ${ano}`}
              subtitulo="Janeiro até o mês de referência · clique em qualquer linha para análise aprofundada"
            />
          </>
        )}
      </div>
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
