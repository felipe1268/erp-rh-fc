import { SEMANTIC_COLORS, CHART_PALETTE, CHART_FILL } from "@/lib/chartColors";
import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import PrintHeader from "@/components/PrintHeader";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileText, ShieldCheck, AlertTriangle, Clock, Users, Search,
  Stethoscope, GraduationCap, Car, FolderOpen, Filter, X,
  ArrowLeft, Loader2, ShieldAlert, CheckCircle2, XCircle,
  TrendingUp, BarChart3, CalendarClock, UserX, Eye,
} from "lucide-react";
import { Link } from "wouter";
import { matchSearch } from "@/lib/searchUtils";

const fmtDate = (d: string | null | undefined) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const STATUS_COLORS = {
  vencido: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'Vencido' },
  critico: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', label: 'Crítico (30d)' },
  alerta: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', label: 'Alerta (60d)' },
  atencao: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', label: 'Atenção (90d)' },
};

const CATEGORIA_ICONS: Record<string, any> = {
  'ASO': Stethoscope,
  'Treinamento': GraduationCap,
  'Doc. Pessoal': FolderOpen,
  'CNH': Car,
};

type TabType = 'alertas' | 'incompletos';

export default function DashControleDocumentos() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const { data, isLoading } = trpc.dashboards.controleDocumentos.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) }, { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );

  const [activeTab, setActiveTab] = useState<TabType>('alertas');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todos');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [busca, setBusca] = useState('');
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);

  // Filtered alertas
  const alertasFiltrados = useMemo(() => {
    if (!data?.alertas) return [];
    return data.alertas.filter((a: any) => {
      if (filtroCategoria !== 'todos' && a.categoria !== filtroCategoria) return false;
      if (filtroStatus !== 'todos' && a.status !== filtroStatus) return false;
      if (busca && !matchSearch(a.funcionarioNome, busca) && !matchSearch(a.cpf, busca) && !matchSearch(a.tipo, busca)) return false;
      return true;
    });
  }, [data?.alertas, filtroCategoria, filtroStatus, busca]);

  // Filtered incompletos
  const incompletosFiltrados = useMemo(() => {
    if (!data?.funcIncompletos) return [];
    return data.funcIncompletos.filter((f: any) => {
      if (busca && !matchSearch(f.funcionarioNome, busca) && !matchSearch(f.cpf, busca)) return false;
      return true;
    });
  }, [data?.funcIncompletos, busca]);

  if (isLoading || !data) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-3 text-gray-500">Carregando dados de documentos...</span>
        </div>
      </DashboardLayout>
    );
  }

  const hasFilters = filtroCategoria !== 'todos' || filtroStatus !== 'todos' || busca !== '';

  return (
    <DashboardLayout>
      <div className="space-y-6 print-area">
        <PrintHeader title="Dashboard — Controle de Documentos" />

        {/* ─── HEADER ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <Link href="/dashboards">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-blue-600" />
                Controle de Documentos
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                ASOs, Treinamentos, CNH e Documentos Pessoais — Compliance em tempo real
              </p>
            </div>
          </div>
          <PrintActions title="Controle de Documentos" />
        </div>

        {/* ─── KPIs PRINCIPAIS ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <DashKpi label="Total Documentos" value={data.totalDocumentos} color="blue" icon={FileText} />
          <DashKpi label="Em Dia" value={data.totalEmDia} color="green" icon={CheckCircle2} />
          <DashKpi label="Vencidos" value={data.totalVencidos} color="red" icon={XCircle} />
          <DashKpi label="A Vencer (30d)" value={data.totalAVencer30} color="orange" icon={AlertTriangle} />
          <DashKpi label="A Vencer (90d)" value={data.totalAVencer90} color="yellow" icon={Clock} />
          <DashKpi
            label="Compliance"
            value={fmtPct(data.compliance)}
            color={data.compliance >= 90 ? 'green' : data.compliance >= 70 ? 'yellow' : 'red'}
            icon={ShieldCheck}
          />
        </div>

        {/* ─── KPIs POR CATEGORIA ─── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Stethoscope className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold text-gray-700">ASOs</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center text-xs">
                <div><p className="text-lg font-bold text-green-600">{data.asoEmDia}</p><p className="text-gray-500">Em dia</p></div>
                <div><p className="text-lg font-bold text-red-600">{data.asoVencidos}</p><p className="text-gray-500">Vencidos</p></div>
                <div><p className="text-lg font-bold text-orange-600">{data.asoAVencer30}</p><p className="text-gray-500">30 dias</p></div>
              </div>
              <div className="mt-2 pt-2 border-t text-xs text-center">
                <span className="text-red-600 font-medium">{data.funcSemAso} funcionários sem ASO válido</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <GraduationCap className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold text-gray-700">Treinamentos</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center text-xs">
                <div><p className="text-lg font-bold text-green-600">{data.treinEmDia}</p><p className="text-gray-500">Em dia</p></div>
                <div><p className="text-lg font-bold text-red-600">{data.treinVencidos}</p><p className="text-gray-500">Vencidos</p></div>
                <div><p className="text-lg font-bold text-orange-600">{data.treinAVencer30}</p><p className="text-gray-500">30 dias</p></div>
              </div>
              <div className="mt-2 pt-2 border-t text-xs text-center">
                <span className="text-gray-500">{data.treinTotal} registros totais</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <FolderOpen className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-semibold text-gray-700">Docs Pessoais</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center text-xs">
                <div><p className="text-lg font-bold text-green-600">{data.docTotal - data.docVencidos}</p><p className="text-gray-500">Em dia</p></div>
                <div><p className="text-lg font-bold text-red-600">{data.docVencidos}</p><p className="text-gray-500">Vencidos</p></div>
                <div><p className="text-lg font-bold text-orange-600">{data.docAVencer30}</p><p className="text-gray-500">30 dias</p></div>
              </div>
              <div className="mt-2 pt-2 border-t text-xs text-center">
                <span className="text-gray-500">{data.docTotal} documentos cadastrados</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Car className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold text-gray-700">CNH</span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center text-xs">
                <div><p className="text-lg font-bold text-green-600">{data.cnhTotal - data.cnhVencidas}</p><p className="text-gray-500">Em dia</p></div>
                <div><p className="text-lg font-bold text-red-600">{data.cnhVencidas}</p><p className="text-gray-500">Vencidas</p></div>
                <div><p className="text-lg font-bold text-orange-600">{data.cnhAVencer30}</p><p className="text-gray-500">30 dias</p></div>
              </div>
              <div className="mt-2 pt-2 border-t text-xs text-center">
                <span className="text-gray-500">{data.cnhTotal} funcionários com CNH</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── GRÁFICOS ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status por Categoria (empilhado) */}
          <DashChart
            title="Status por Categoria"
            type="bar"
            labels={data.statusPorCategoria.map((c: any) => c.categoria)}
            datasets={[
              { label: 'Vencidos', data: data.statusPorCategoria.map((c: any) => c.vencidos), backgroundColor: '#EF5350' },
              { label: 'Crítico (30d)', data: data.statusPorCategoria.map((c: any) => c.aVencer30), backgroundColor: '#F5A962' },
              { label: 'Alerta (60d)', data: data.statusPorCategoria.map((c: any) => c.aVencer60), backgroundColor: '#FDD835' },
              { label: 'Atenção (90d)', data: data.statusPorCategoria.map((c: any) => c.aVencer90), backgroundColor: '#5B8DEF' },
              { label: 'Em Dia', data: data.statusPorCategoria.map((c: any) => c.emDia), backgroundColor: '#67C587' },
            ]}
            height={280}
          />

          {/* Timeline de Vencimentos */}
          <DashChart
            title="Timeline de Vencimentos — Próximas 13 Semanas"
            type="bar"
            labels={data.timeline.map((t: any) => t.semana)}
            datasets={[
              { label: 'ASOs', data: data.timeline.map((t: any) => t.asos), backgroundColor: '#5B8DEF' },
              { label: 'Treinamentos', data: data.timeline.map((t: any) => t.treinamentos), backgroundColor: '#67C587' },
              { label: 'Docs', data: data.timeline.map((t: any) => t.docs), backgroundColor: '#A78BDB' },
              { label: 'CNH', data: data.timeline.map((t: any) => t.cnhs), backgroundColor: '#F5A962' },
            ]}
            height={280}
          />
        </div>

        {/* Treinamentos por Norma + Docs por Tipo */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {data.treinPorNorma.length > 0 && (
            <DashChart
              title="Treinamentos por Norma (Top 10)"
              type="horizontalBar"
              labels={data.treinPorNorma.map((t: any) => t.norma)}
              datasets={[
                { label: 'Total', data: data.treinPorNorma.map((t: any) => t.total), backgroundColor: CHART_PALETTE[0] },
                { label: 'Vencidos', data: data.treinPorNorma.map((t: any) => t.vencidos), backgroundColor: '#EF5350' },
              ]}
              height={280}
            />
          )}

          {data.docPorTipo.length > 0 && (
            <DashChart
              title="Documentos Pessoais por Tipo"
              type="doughnut"
              labels={data.docPorTipo.map((d: any) => d.tipo.toUpperCase())}
              datasets={[{
                label: 'Documentos',
                data: data.docPorTipo.map((d: any) => d.count),
                backgroundColor: CHART_PALETTE.slice(0, data.docPorTipo.length),
              }]}
              height={280}
            />
          )}
        </div>

        {/* ─── TABS: ALERTAS / INCOMPLETOS ─── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex gap-2">
                <Button
                  variant={activeTab === 'alertas' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab('alertas')}
                  className="gap-1.5"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Alertas de Vencimento ({data.alertas.length})
                </Button>
                <Button
                  variant={activeTab === 'incompletos' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab('incompletos')}
                  className="gap-1.5"
                >
                  <UserX className="h-3.5 w-3.5" />
                  Documentação Incompleta ({data.funcIncompletos.length})
                </Button>
              </div>

              {/* Filtros */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    placeholder="Buscar nome ou CPF..."
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    className="pl-8 h-9 w-48 text-sm"
                  />
                </div>
                {activeTab === 'alertas' && (
                  <>
                    <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
                      <SelectTrigger className="h-9 w-36 text-sm">
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas</SelectItem>
                        <SelectItem value="ASO">ASO</SelectItem>
                        <SelectItem value="Treinamento">Treinamento</SelectItem>
                        <SelectItem value="Doc. Pessoal">Doc. Pessoal</SelectItem>
                        <SelectItem value="CNH">CNH</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                      <SelectTrigger className="h-9 w-36 text-sm">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="vencido">Vencidos</SelectItem>
                        <SelectItem value="critico">Crítico (30d)</SelectItem>
                        <SelectItem value="alerta">Alerta (60d)</SelectItem>
                        <SelectItem value="atencao">Atenção (90d)</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={() => { setFiltroCategoria('todos'); setFiltroStatus('todos'); setBusca(''); }}>
                    <X className="h-3.5 w-3.5 mr-1" /> Limpar
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === 'alertas' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50/50">
                      <th className="text-left p-2 font-medium text-gray-600">Status</th>
                      <th className="text-left p-2 font-medium text-gray-600">Funcionário</th>
                      <th className="text-left p-2 font-medium text-gray-600 hidden md:table-cell">Função</th>
                      <th className="text-left p-2 font-medium text-gray-600 hidden lg:table-cell">Obra</th>
                      <th className="text-left p-2 font-medium text-gray-600">Categoria</th>
                      <th className="text-left p-2 font-medium text-gray-600">Tipo</th>
                      <th className="text-left p-2 font-medium text-gray-600">Validade</th>
                      <th className="text-right p-2 font-medium text-gray-600">Dias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertasFiltrados.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-8 text-gray-400">Nenhum alerta encontrado</td></tr>
                    ) : alertasFiltrados.slice(0, 100).map((a: any, i: number) => {
                      const st = STATUS_COLORS[a.status as keyof typeof STATUS_COLORS];
                      const Icon = CATEGORIA_ICONS[a.categoria] || FileText;
                      return (
                        <tr key={`${a.categoria}-${a.id}-${i}`} className="border-b hover:bg-gray-50/50 transition-colors">
                          <td className="p-2">
                            <Badge variant="outline" className={`${st.bg} ${st.text} ${st.border} text-[10px]`}>
                              {st.label}
                            </Badge>
                          </td>
                          <td className="p-2">
                            <button
                              onClick={() => setRaioXEmployeeId(a.employeeId)}
                              className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left"
                            >
                              {a.funcionarioNome}
                            </button>
                            <p className="text-[10px] text-gray-400">{a.cpf}</p>
                          </td>
                          <td className="p-2 hidden md:table-cell text-gray-600 text-xs">{a.funcao || '—'}</td>
                          <td className="p-2 hidden lg:table-cell text-gray-600 text-xs">{a.obraNome}</td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              <Icon className="h-3.5 w-3.5 text-gray-500" />
                              <span className="text-xs">{a.categoria}</span>
                            </div>
                          </td>
                          <td className="p-2 text-xs text-gray-700">{a.tipo}</td>
                          <td className="p-2 text-xs">{fmtDate(a.dataValidade)}</td>
                          <td className="p-2 text-right">
                            <span className={`text-xs font-bold ${a.diasParaVencer < 0 ? 'text-red-600' : a.diasParaVencer <= 30 ? 'text-orange-600' : 'text-yellow-600'}`}>
                              {a.diasParaVencer < 0 ? `${Math.abs(a.diasParaVencer)}d atrás` : `${a.diasParaVencer}d`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {alertasFiltrados.length > 100 && (
                  <p className="text-xs text-gray-400 text-center mt-2">Mostrando 100 de {alertasFiltrados.length} alertas</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50/50">
                      <th className="text-left p-2 font-medium text-gray-600">Funcionário</th>
                      <th className="text-left p-2 font-medium text-gray-600 hidden md:table-cell">Função</th>
                      <th className="text-left p-2 font-medium text-gray-600 hidden lg:table-cell">Obra</th>
                      <th className="text-center p-2 font-medium text-gray-600">Sem ASO</th>
                      <th className="text-center p-2 font-medium text-gray-600">ASO Venc.</th>
                      <th className="text-center p-2 font-medium text-gray-600">Trein. Venc.</th>
                      <th className="text-center p-2 font-medium text-gray-600">Docs Venc.</th>
                      <th className="text-center p-2 font-medium text-gray-600">CNH Venc.</th>
                      <th className="text-center p-2 font-medium text-gray-600">Pendências</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incompletosFiltrados.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-8 text-gray-400">Nenhum funcionário com documentação incompleta</td></tr>
                    ) : incompletosFiltrados.slice(0, 100).map((f: any) => (
                      <tr key={f.employeeId} className="border-b hover:bg-gray-50/50 transition-colors">
                        <td className="p-2">
                          <button
                            onClick={() => setRaioXEmployeeId(f.employeeId)}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left"
                          >
                            {f.funcionarioNome}
                          </button>
                          <p className="text-[10px] text-gray-400">{f.cpf}</p>
                        </td>
                        <td className="p-2 hidden md:table-cell text-gray-600 text-xs">{f.funcao || '—'}</td>
                        <td className="p-2 hidden lg:table-cell text-gray-600 text-xs">{f.obraNome}</td>
                        <td className="p-2 text-center">
                          {f.semAso ? <XCircle className="h-4 w-4 text-red-500 mx-auto" /> : <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />}
                        </td>
                        <td className="p-2 text-center">
                          {f.asoVencido ? <XCircle className="h-4 w-4 text-red-500 mx-auto" /> : <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />}
                        </td>
                        <td className="p-2 text-center">
                          {f.treinVencidos > 0 ? (
                            <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 text-[10px]">{f.treinVencidos}</Badge>
                          ) : <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />}
                        </td>
                        <td className="p-2 text-center">
                          {f.docsVencidos > 0 ? (
                            <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 text-[10px]">{f.docsVencidos}</Badge>
                          ) : <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />}
                        </td>
                        <td className="p-2 text-center">
                          {f.cnhVencida ? <XCircle className="h-4 w-4 text-red-500 mx-auto" /> : <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />}
                        </td>
                        <td className="p-2 text-center">
                          <Badge variant="outline" className={`text-[10px] font-bold ${f.totalPendencias >= 3 ? 'bg-red-100 text-red-700 border-red-300' : f.totalPendencias >= 2 ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-yellow-100 text-yellow-700 border-yellow-300'}`}>
                            {f.totalPendencias}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {incompletosFiltrados.length > 100 && (
                  <p className="text-xs text-gray-400 text-center mt-2">Mostrando 100 de {incompletosFiltrados.length} funcionários</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── LEGENDA ─── */}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 print:hidden">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> Vencido</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500 inline-block" /> Crítico (até 30 dias)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500 inline-block" /> Alerta (até 60 dias)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Atenção (até 90 dias)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Em Dia</span>
        </div>

        <PrintFooterLGPD />
      </div>

      {/* Raio-X Dialog */}
      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
    </DashboardLayout>
  );
}
