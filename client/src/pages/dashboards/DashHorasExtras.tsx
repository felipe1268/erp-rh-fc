import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock, DollarSign, Users, TrendingUp, Percent, Building2, Briefcase,
  BarChart3, Filter, X, Search, ChevronDown, User, Calendar, Loader2
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo } from "react";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function DashHorasExtras() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;

  // Filtros
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [periodoTipo, setPeriodoTipo] = useState<string>("ano");
  const [periodoValor, setPeriodoValor] = useState<string>("");
  const [obraId, setObraId] = useState<number | undefined>(undefined);
  const [employeeId, setEmployeeId] = useState<number | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(true);
  const [searchColaborador, setSearchColaborador] = useState("");

  const queryInput = useMemo(() => ({
    companyId,
    year,
    periodoTipo: periodoTipo !== "ano" ? periodoTipo as any : undefined,
    periodoValor: periodoTipo !== "ano" ? periodoValor : undefined,
    obraId,
    employeeId,
  }), [companyId, year, periodoTipo, periodoValor, obraId, employeeId]);

  const { data, isLoading } = trpc.dashboards.horasExtras.useQuery(queryInput, { enabled: companyId > 0 });

  // Filtrar colaboradores pela busca
  const colaboradoresFiltrados = useMemo(() => {
    if (!data?.filtros?.colaboradores) return [];
    if (!searchColaborador) return data.filtros.colaboradores;
    const term = searchColaborador.toLowerCase();
    return data.filtros.colaboradores.filter(c =>
      c.nome.toLowerCase().includes(term) || c.funcao.toLowerCase().includes(term)
    );
  }, [data?.filtros?.colaboradores, searchColaborador]);

  // Período label
  const periodoLabel = useMemo(() => {
    if (periodoTipo === "ano") return `Ano ${year}`;
    if (periodoTipo === "mes" && periodoValor) return `${MESES_FULL[parseInt(periodoValor) - 1]} ${year}`;
    if (periodoTipo === "trimestre" && periodoValor) return `${periodoValor}º Trimestre ${year}`;
    if (periodoTipo === "semestre" && periodoValor) return `${periodoValor}º Semestre ${year}`;
    if (periodoTipo === "semana" && periodoValor) return `Semana ${periodoValor} de ${year}`;
    if (periodoTipo === "dia" && periodoValor) return `Dia ${periodoValor}`;
    return `${year}`;
  }, [periodoTipo, periodoValor, year]);

  const limparFiltros = () => {
    setPeriodoTipo("ano");
    setPeriodoValor("");
    setObraId(undefined);
    setEmployeeId(undefined);
    setSearchColaborador("");
  };

  const temFiltroAtivo = periodoTipo !== "ano" || obraId || employeeId;

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
              <Link href="/dashboards" className="text-sm text-muted-foreground hover:text-foreground">Dashboards</Link>
              <span className="text-muted-foreground">/</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard Horas Extras</h1>
            <p className="text-muted-foreground text-sm mt-1">Análise detalhada de horas extras — {periodoLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={showFilters ? "default" : "outline"} size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-1.5">
              <Filter className="h-4 w-4" /> Filtros
              {temFiltroAtivo && <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">Ativo</Badge>}
            </Button>
            <PrintActions title="Dashboard Horas Extras" />
          </div>
        </div>

        {/* PAINEL DE FILTROS */}
        {showFilters && (
          <Card className="border-blue-200 bg-gradient-to-r from-blue-50/50 to-indigo-50/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-blue-800 flex items-center gap-1.5"><Filter className="h-4 w-4" /> Filtros Avançados</h3>
                {temFiltroAtivo && (
                  <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-xs text-red-600 hover:text-red-700 gap-1 h-7">
                    <X className="h-3 w-3" /> Limpar Filtros
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* ANO */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">Ano</Label>
                  <Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="h-9" min={2020} max={2030} />
                </div>

                {/* PERÍODO */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">Período</Label>
                  <Select value={periodoTipo} onValueChange={(v) => { setPeriodoTipo(v); setPeriodoValor(""); }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ano">Ano Completo</SelectItem>
                      <SelectItem value="semestre">Semestre</SelectItem>
                      <SelectItem value="trimestre">Trimestre</SelectItem>
                      <SelectItem value="mes">Mês</SelectItem>
                      <SelectItem value="semana">Semana</SelectItem>
                      <SelectItem value="dia">Dia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* VALOR DO PERÍODO */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">
                    {periodoTipo === "mes" ? "Mês" : periodoTipo === "trimestre" ? "Trimestre" : periodoTipo === "semestre" ? "Semestre" : periodoTipo === "semana" ? "Semana (nº)" : periodoTipo === "dia" ? "Data" : "—"}
                  </Label>
                  {periodoTipo === "ano" ? (
                    <Input disabled placeholder="—" className="h-9" />
                  ) : periodoTipo === "mes" ? (
                    <Select value={periodoValor} onValueChange={setPeriodoValor}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {MESES_FULL.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : periodoTipo === "trimestre" ? (
                    <Select value={periodoValor} onValueChange={setPeriodoValor}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1º Trim (Jan-Mar)</SelectItem>
                        <SelectItem value="2">2º Trim (Abr-Jun)</SelectItem>
                        <SelectItem value="3">3º Trim (Jul-Set)</SelectItem>
                        <SelectItem value="4">4º Trim (Out-Dez)</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : periodoTipo === "semestre" ? (
                    <Select value={periodoValor} onValueChange={setPeriodoValor}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1º Sem (Jan-Jun)</SelectItem>
                        <SelectItem value="2">2º Sem (Jul-Dez)</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : periodoTipo === "semana" ? (
                    <Input type="number" min={1} max={53} value={periodoValor} onChange={e => setPeriodoValor(e.target.value)} placeholder="1-53" className="h-9" />
                  ) : periodoTipo === "dia" ? (
                    <Input type="date" value={periodoValor} onChange={e => setPeriodoValor(e.target.value)} className="h-9" />
                  ) : null}
                </div>

                {/* OBRA */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">Obra</Label>
                  <Select value={obraId ? String(obraId) : "all"} onValueChange={(v) => setObraId(v === "all" ? undefined : Number(v))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as Obras</SelectItem>
                      {(data?.filtros?.obras || []).map(o => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* COLABORADOR */}
                <div className="col-span-2 md:col-span-2">
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">Colaborador</Label>
                  <div className="flex gap-2">
                    <Select value={employeeId ? String(employeeId) : "all"} onValueChange={(v) => setEmployeeId(v === "all" ? undefined : Number(v))}>
                      <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <div className="p-2 border-b">
                          <div className="flex items-center gap-1.5 px-1">
                            <Search className="h-3.5 w-3.5 text-muted-foreground" />
                            <input
                              type="text"
                              placeholder="Buscar colaborador..."
                              value={searchColaborador}
                              onChange={e => setSearchColaborador(e.target.value)}
                              className="w-full text-sm outline-none bg-transparent"
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        <SelectItem value="all">Todos os Colaboradores</SelectItem>
                        {colaboradoresFiltrados.map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.nome} <span className="text-muted-foreground text-xs">({c.funcao})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Filtros ativos */}
              {temFiltroAtivo && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-blue-200">
                  <span className="text-xs text-gray-500 flex items-center gap-1"><Filter className="h-3 w-3" /> Filtros ativos:</span>
                  {periodoTipo !== "ano" && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Calendar className="h-3 w-3" /> {periodoLabel}
                      <button onClick={() => { setPeriodoTipo("ano"); setPeriodoValor(""); }} className="ml-1 hover:text-red-600"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {obraId && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Building2 className="h-3 w-3" /> {data?.filtros?.obras?.find(o => o.id === obraId)?.nome || `Obra #${obraId}`}
                      <button onClick={() => setObraId(undefined)} className="ml-1 hover:text-red-600"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {employeeId && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <User className="h-3 w-3" /> {data?.filtros?.colaboradores?.find(c => c.id === employeeId)?.nome || `#${employeeId}`}
                      <button onClick={() => setEmployeeId(undefined)} className="ml-1 hover:text-red-600"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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

            <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
              <DashKpi label="% HE sobre Folha Bruta" value={`${data.resumo.percentualHEsobreFolha}%`} icon={Percent} color="purple" sub={`Folha: ${fmtBRL(data.resumo.totalFolhaBruto)}`} />
              <DashKpi label="Custo HE / Pessoa" value={fmtBRL(data.resumo.mediaValorPorPessoa)} icon={DollarSign} color="teal" sub={`Média de ${data.resumo.mediaHorasPorPessoa}h por pessoa`} />
            </div>

            {/* Evolução Mensal */}
            <DashChart
              title={`Evolução Mensal de Horas Extras — ${periodoLabel}`}
              type="bar"
              labels={data.evolucaoMensal.map(r => { const [, m] = r.mes.split("-"); return MESES[parseInt(m) - 1]; })}
              datasets={[
                { label: "Horas", data: data.evolucaoMensal.map(r => r.horas), backgroundColor: "#F59E0B" },
              ]}
              height={280}
            />

            <DashChart
              title={`Custo Mensal de Horas Extras — ${periodoLabel}`}
              type="line"
              labels={data.evolucaoMensal.map(r => { const [, m] = r.mes.split("-"); return MESES[parseInt(m) - 1]; })}
              datasets={[
                { label: "Custo (R$)", data: data.evolucaoMensal.map(r => r.valor), borderColor: "#EF4444", backgroundColor: "rgba(239,68,68,0.1)", fill: true, tension: 0.3 },
              ]}
              height={280}
            />

            {/* Rankings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.rankingObra.length > 0 && (
                <DashChart
                  title="Horas Extras por Obra"
                  type="horizontalBar"
                  labels={data.rankingObra.map(r => r.obra.length > 25 ? r.obra.slice(0, 25) + "..." : r.obra)}
                  datasets={[{ label: "Horas", data: data.rankingObra.map(r => r.horas), backgroundColor: "#3B82F6" }]}
                  height={Math.max(200, data.rankingObra.length * 35)}
                />
              )}
              {data.rankingSetor.length > 0 && (
                <DashChart
                  title="Horas Extras por Setor"
                  type="horizontalBar"
                  labels={data.rankingSetor.map(r => r.setor)}
                  datasets={[{ label: "Horas", data: data.rankingSetor.map(r => r.horas), backgroundColor: "#10B981" }]}
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
                datasets={[{ data: data.percentuais.map(p => p.count), backgroundColor: ["#F59E0B", "#EF4444", "#3B82F6", "#10B981", "#8B5CF6"] }]}
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
                        {data.rankingPessoa.map((r, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 pr-3">
                              <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${i < 3 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                            </td>
                            <td className="py-2 pr-3 font-medium truncate max-w-[180px]">{r.nome}</td>
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
                        {data.rankingObra.map((r, i) => (
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
                        {data.detalhes.map((d, i) => (
                          <tr key={d.id || i} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 px-3 font-mono text-xs">{d.mesReferencia}</td>
                            <td className="py-2 px-3 font-medium truncate max-w-[160px]">{d.nome}</td>
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
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
