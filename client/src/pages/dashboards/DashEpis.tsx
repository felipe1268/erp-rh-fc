import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  HardHat, Package, AlertTriangle, ShieldAlert, TrendingUp, Users,
  DollarSign, Calendar, Building2, ClipboardList, Loader2,
  Shirt, Footprints, Shield, Filter, X, SlidersHorizontal,
  ChevronRight, CheckCircle2, XCircle, FileText, User
} from "lucide-react";
import { Link } from "wouter";

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';

// ============================================================
// COMPONENTE: Dialog de Descontos Pendentes de EPI
// ============================================================
function DescontosDialog({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: number }) {
  const utils = trpc.useUtils();
  const { data: alertas, isLoading } = trpc.epis.listDiscountAlerts.useQuery(
    { companyId, status: 'pendente' },
    { enabled: open && companyId > 0 }
  );
  const [validandoId, setValidandoId] = useState<number | null>(null);
  const [acao, setAcao] = useState<'confirmado' | 'cancelado'>('confirmado');
  const [justificativa, setJustificativa] = useState('');

  const validateMut = trpc.epis.validateDiscount.useMutation({
    onSuccess: () => {
      toast.success(acao === 'confirmado' ? 'Desconto confirmado!' : 'Desconto cancelado!');
      utils.epis.listDiscountAlerts.invalidate();
      utils.dashboards.epis.invalidate();
      setValidandoId(null);
      setJustificativa('');
    },
    onError: (err) => toast.error(err.message),
  });

  const handleValidar = (id: number, action: 'confirmado' | 'cancelado') => {
    if (validandoId === id && acao === action) {
      // Confirmar
      validateMut.mutate({ id, acao: action, justificativa });
    } else {
      setValidandoId(id);
      setAcao(action);
      setJustificativa('');
    }
  };

  const totalPendente = (alertas || []).reduce((s, a) => s + parseFloat(String(a.valorTotal || '0')), 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-amber-600" />
            Alertas de Desconto de EPI Pendentes
          </DialogTitle>
          <DialogDescription>
            Estes descontos foram gerados automaticamente quando um EPI foi entregue por motivo de perda, dano ou mau uso.
            O DP deve validar ou cancelar cada desconto antes de fechar a folha do mês.
          </DialogDescription>
        </DialogHeader>

        {/* Explicação da lógica */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <p className="font-semibold mb-1 flex items-center gap-1"><FileText className="h-4 w-4" /> Como funciona:</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li>Quando um EPI é entregue com motivo <strong>"Perda"</strong>, <strong>"Dano"</strong> ou <strong>"Mau Uso"</strong>, o sistema gera automaticamente um alerta de desconto.</li>
            <li>O valor é calculado com base no preço unitário do EPI + BDI configurado nas configurações.</li>
            <li>O desconto fica <strong>pendente</strong> até que o DP <strong>confirme</strong> (será lançado na folha) ou <strong>cancele</strong> (não será descontado).</li>
            <li>Base legal: <strong>Art. 462, §1º da CLT</strong> — desconto por dano causado pelo empregado.</li>
          </ul>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !alertas?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-400" />
            <p>Nenhum desconto pendente!</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between bg-amber-50 rounded-lg p-3">
              <span className="text-sm font-medium text-amber-800">{alertas.length} desconto(s) pendente(s)</span>
              <span className="text-sm font-bold text-amber-900">{fmtBRL(totalPendente)}</span>
            </div>

            <div className="space-y-3">
              {alertas.map((a) => (
                <Card key={a.id} className={`border ${validandoId === a.id ? 'border-blue-300 bg-blue-50/30' : 'border-border'}`}>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{a.epiNome}</span>
                          {a.ca && <Badge variant="outline" className="text-xs">CA {a.ca}</Badge>}
                          <Badge className="bg-amber-100 text-amber-800 text-xs">{a.motivoCobranca}</Badge>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>{a.nomeFunc || 'Funcionário'}</span>
                          {a.funcaoFunc && <span className="text-muted-foreground">({a.funcaoFunc})</span>}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                          <div className="text-xs"><span className="text-muted-foreground">Qtd:</span> <strong>{a.quantidade}</strong></div>
                          <div className="text-xs"><span className="text-muted-foreground">Unitário:</span> <strong>{fmtBRL(parseFloat(String(a.valorUnitario || '0')))}</strong></div>
                          <div className="text-xs"><span className="text-muted-foreground">Total:</span> <strong className="text-red-600">{fmtBRL(parseFloat(String(a.valorTotal || '0')))}</strong></div>
                          <div className="text-xs"><span className="text-muted-foreground">Ref:</span> <strong>{a.mesReferencia}</strong></div>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">Criado em: {fmtDate(a.createdAt)}</div>
                      </div>
                      <div className="flex sm:flex-col gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => handleValidar(a.id, 'confirmado')}
                          disabled={validateMut.isPending}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1 border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => handleValidar(a.id, 'cancelado')}
                          disabled={validateMut.isPending}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Cancelar
                        </Button>
                      </div>
                    </div>
                    {validandoId === a.id && (
                      <div className="mt-3 pt-3 border-t space-y-2">
                        <p className="text-xs font-medium">
                          {acao === 'confirmado'
                            ? '✅ Confirmar desconto na folha de pagamento?'
                            : '❌ Cancelar este desconto (não será lançado na folha)?'}
                        </p>
                        <Textarea
                          placeholder="Justificativa (opcional)"
                          value={justificativa}
                          onChange={(e) => setJustificativa(e.target.value)}
                          className="text-xs h-16"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className={acao === 'confirmado' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                            onClick={() => validateMut.mutate({ id: a.id, acao, justificativa })}
                            disabled={validateMut.isPending}
                          >
                            {validateMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                            {acao === 'confirmado' ? 'Confirmar Desconto' : 'Cancelar Desconto'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setValidandoId(null)}>Voltar</Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Gera lista de meses dos últimos 24 meses para o filtro de período
function getMonthOptions() {
  const opts: { value: string; label: string }[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    opts.push({ value: key, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts;
}

export default function DashEpis() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const { data, isLoading } = trpc.dashboards.epis.useQuery({ companyId }, { enabled: companyId > 0 });

  // Filtros
  const [periodoInicio, setPeriodoInicio] = useState<string>("todos");
  const [periodoFim, setPeriodoFim] = useState<string>("todos");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todos");
  const [obraFiltro, setObraFiltro] = useState<string>("todos");
  const [showFilters, setShowFilters] = useState(false);
  const [showDescontosDialog, setShowDescontosDialog] = useState(false);

  const monthOptions = useMemo(() => getMonthOptions(), []);

  // Extrair categorias e obras disponíveis dos dados
  const categorias = useMemo(() => {
    if (!data?.porCategoria) return [];
    return Object.keys(data.porCategoria);
  }, [data?.porCategoria]);

  const obrasDisponiveis = useMemo(() => {
    if (!data?.custoPorObraList) return [];
    return data.custoPorObraList.map((o: any) => o.nome);
  }, [data?.custoPorObraList]);

  // Dados filtrados de consumo mensal
  const consumoFiltrado = useMemo(() => {
    if (!data?.consumoMensal) return [];
    let filtered = data.consumoMensal;
    if (periodoInicio !== "todos") {
      filtered = filtered.filter((c: any) => c.mesKey >= periodoInicio);
    }
    if (periodoFim !== "todos") {
      filtered = filtered.filter((c: any) => c.mesKey <= periodoFim);
    }
    return filtered;
  }, [data?.consumoMensal, periodoInicio, periodoFim]);

  // Custo por obra filtrado
  const obrasFiltradas = useMemo(() => {
    if (!data?.custoPorObraList) return [];
    if (obraFiltro === "todos") return data.custoPorObraList;
    return data.custoPorObraList.filter((o: any) => o.nome === obraFiltro);
  }, [data?.custoPorObraList, obraFiltro]);

  // Categoria filtrada
  const categoriasFiltradas = useMemo(() => {
    if (!data?.porCategoria) return {};
    if (categoriaFiltro === "todos") return data.porCategoria;
    const filtered: Record<string, any> = {};
    if (data.porCategoria[categoriaFiltro]) {
      filtered[categoriaFiltro] = data.porCategoria[categoriaFiltro];
    }
    return filtered;
  }, [data?.porCategoria, categoriaFiltro]);

  const hasActiveFilters = periodoInicio !== "todos" || periodoFim !== "todos" || categoriaFiltro !== "todos" || obraFiltro !== "todos";

  const clearFilters = () => {
    setPeriodoInicio("todos");
    setPeriodoFim("todos");
    setCategoriaFiltro("todos");
    setObraFiltro("todos");
  };

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboards" className="text-sm text-muted-foreground hover:text-foreground">Dashboards</Link>
              <span className="text-muted-foreground">/</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard de EPIs</h1>
            <p className="text-muted-foreground text-sm mt-1">Controle completo de equipamentos de proteção individual</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Filtros</span>
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full">
                  !
                </Badge>
              )}
            </Button>
            <PrintActions title="Dashboard EPIs" />
          </div>
        </div>

        {!data ? (
          <div className="text-center py-16 text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</div>
        ) : (
          <>
            {/* ============================================================ */}
            {/* FILTROS RESPONSIVOS */}
            {/* ============================================================ */}
            {showFilters && (
              <Card className="border-dashed">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Filter className="h-4 w-4 text-primary" />
                      Filtros
                    </div>
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs gap-1 h-7">
                        <X className="h-3 w-3" /> Limpar filtros
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Período Início */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Período — De</label>
                      <Select value={periodoInicio} onValueChange={setPeriodoInicio}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Todos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os meses</SelectItem>
                          {monthOptions.map(m => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Período Fim */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Período — Até</label>
                      <Select value={periodoFim} onValueChange={setPeriodoFim}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Todos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os meses</SelectItem>
                          {monthOptions.map(m => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Categoria */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Categoria</label>
                      <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Todas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todas as categorias</SelectItem>
                          {categorias.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Obra */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Obra</label>
                      <Select value={obraFiltro} onValueChange={setObraFiltro}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Todas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todas as obras</SelectItem>
                          {obrasDisponiveis.map((o: string) => (
                            <SelectItem key={o} value={o}>{o}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {hasActiveFilters && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Filtros ativos:</span>
                      {periodoInicio !== "todos" && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          De: {monthOptions.find(m => m.value === periodoInicio)?.label}
                          <X className="h-3 w-3 cursor-pointer" onClick={() => setPeriodoInicio("todos")} />
                        </Badge>
                      )}
                      {periodoFim !== "todos" && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          Até: {monthOptions.find(m => m.value === periodoFim)?.label}
                          <X className="h-3 w-3 cursor-pointer" onClick={() => setPeriodoFim("todos")} />
                        </Badge>
                      )}
                      {categoriaFiltro !== "todos" && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          {categoriaFiltro}
                          <X className="h-3 w-3 cursor-pointer" onClick={() => setCategoriaFiltro("todos")} />
                        </Badge>
                      )}
                      {obraFiltro !== "todos" && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          {obraFiltro}
                          <X className="h-3 w-3 cursor-pointer" onClick={() => setObraFiltro("todos")} />
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* KPIs PRINCIPAIS */}
            {/* ============================================================ */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              <DashKpi label="Itens Cadastrados" value={data.resumo.totalItens} icon={HardHat} color="blue" />
              <DashKpi label="Estoque Total" value={data.resumo.estoqueTotal} icon={Package} color="green" sub="unidades em estoque" />
              <DashKpi label="Valor Inventário" value={fmtBRL(data.resumo.valorTotalInventario || 0)} icon={DollarSign} color="teal" />
              <DashKpi label="Entregas (30d)" value={data.resumo.entregasMes || 0} icon={ClipboardList} color="purple" sub="últimos 30 dias" />
            </div>

            {/* KPIs ALERTAS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              <DashKpi label="Estoque Baixo" value={data.resumo.estoqueBaixo} icon={AlertTriangle} color="red" sub="≤ 5 unidades" />
              <DashKpi label="CA Vencido" value={data.resumo.caVencido} icon={ShieldAlert} color="orange" />
              <DashKpi label="CA Vencendo (90d)" value={data.resumo.casVencendoCount || 0} icon={Calendar} color="yellow" sub="próximos 90 dias" />
              <DashKpi label="Total Entregas" value={data.resumo.totalEntregas} icon={TrendingUp} color="indigo" />
              <DashKpi label="Func. Atendidos" value={data.resumo.funcUnicos || 0} icon={Users} color="slate" />
            </div>

            {/* Descontos pendentes - CLICÁVEL */}
            {(data.resumo.alertasPendentes || 0) > 0 && (
              <Card
                className="border-l-4 border-l-amber-500 bg-amber-50/50 cursor-pointer hover:bg-amber-50 transition-colors group"
                onClick={() => setShowDescontosDialog(true)}
              >
                <CardContent className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
                  <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-amber-800 text-sm sm:text-base">
                      {data.resumo.alertasPendentes} alerta(s) de desconto pendente(s)
                    </p>
                    <p className="text-xs sm:text-sm text-amber-700">
                      Valor total: {fmtBRL(data.resumo.valorDescontosPendentes || 0)}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-amber-400 group-hover:text-amber-600 transition-colors shrink-0" />
                </CardContent>
              </Card>
            )}

            {/* DIALOG DE DESCONTOS PENDENTES */}
            <DescontosDialog
              open={showDescontosDialog}
              onClose={() => setShowDescontosDialog(false)}
              companyId={companyId}
            />

            {/* ============================================================ */}
            {/* GRÁFICOS LINHA 1: Consumo Mensal + Distribuição por Categoria */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DashChart
                  title={`Consumo Mensal de EPIs${hasActiveFilters ? ' (filtrado)' : ' (últimos 12 meses)'}`}
                  type="bar"
                  labels={consumoFiltrado.map((r: any) => r.mes)}
                  datasets={[
                    { label: "Unidades", data: consumoFiltrado.map((r: any) => r.unidades), backgroundColor: "#3B82F6" },
                    { label: "Entregas", data: consumoFiltrado.map((r: any) => r.entregas), backgroundColor: "#93C5FD" },
                  ]}
                  height={280}
                />
              </div>
              <div>
                {Object.keys(categoriasFiltradas).length > 0 ? (
                  <DashChart
                    title="Distribuição por Categoria"
                    type="doughnut"
                    labels={Object.keys(categoriasFiltradas)}
                    datasets={[{
                      label: "Itens",
                      data: Object.values(categoriasFiltradas).map((c: any) => c.itens),
                      backgroundColor: ["#10B981", "#6366F1", "#F59E0B", "#EF4444"],
                    }]}
                    height={280}
                  />
                ) : (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição por Categoria</CardTitle></CardHeader>
                    <CardContent className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                      Nenhum dado disponível
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* ============================================================ */}
            {/* GRÁFICOS LINHA 2: Top EPIs + Top Funcionários */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.topEpis?.length > 0 && (
                <DashChart
                  title="Top 10 EPIs Mais Entregues"
                  type="horizontalBar"
                  labels={data.topEpis.map((e: any) => e.nome.length > 30 ? e.nome.slice(0, 30) + "..." : e.nome)}
                  datasets={[{ label: "Unidades", data: data.topEpis.map((e: any) => e.qtd), backgroundColor: "#10B981" }]}
                  height={Math.max(220, data.topEpis.length * 28)}
                />
              )}
              {data.topFuncionarios?.length > 0 && (
                <DashChart
                  title="Top 10 Funcionários (mais EPIs)"
                  type="horizontalBar"
                  labels={data.topFuncionarios.map((f: any) => f.nome.length > 25 ? f.nome.slice(0, 25) + "..." : f.nome)}
                  datasets={[{ label: "Unidades", data: data.topFuncionarios.map((f: any) => f.qtd), backgroundColor: "#8B5CF6" }]}
                  height={Math.max(220, data.topFuncionarios.length * 28)}
                />
              )}
            </div>

            {/* ============================================================ */}
            {/* GRÁFICOS LINHA 3: Custo por Obra + Motivo de Troca */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {obrasFiltradas.length > 0 && (
                <DashChart
                  title={`Entregas por Obra${obraFiltro !== 'todos' ? ` — ${obraFiltro}` : ''}`}
                  type="horizontalBar"
                  labels={obrasFiltradas.map((o: any) => o.nome.length > 30 ? o.nome.slice(0, 30) + "..." : o.nome)}
                  datasets={[{ label: "Unidades", data: obrasFiltradas.map((o: any) => o.unidades), backgroundColor: "#F59E0B" }]}
                  height={Math.max(200, obrasFiltradas.length * 30)}
                />
              )}
              {data.porMotivo && Object.keys(data.porMotivo).length > 0 && (
                <DashChart
                  title="Entregas por Motivo"
                  type="doughnut"
                  labels={Object.keys(data.porMotivo)}
                  datasets={[{
                    label: "Entregas",
                    data: Object.values(data.porMotivo) as number[],
                    backgroundColor: ["#3B82F6", "#EF4444", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899"],
                  }]}
                  height={260}
                />
              )}
            </div>

            {/* ============================================================ */}
            {/* TABELA: Distribuição por Categoria (detalhada) */}
            {/* ============================================================ */}
            {Object.keys(categoriasFiltradas).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-500" />
                    Resumo por Categoria
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Categoria</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Itens</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Estoque</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(categoriasFiltradas).map(([cat, vals]: [string, any]) => (
                          <tr key={cat} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium flex items-center gap-2">
                              {cat === 'EPI' && <Shield className="h-4 w-4 text-emerald-500" />}
                              {cat === 'Uniforme' && <Shirt className="h-4 w-4 text-indigo-500" />}
                              {cat === 'Calçado' && <Footprints className="h-4 w-4 text-amber-500" />}
                              {cat}
                            </td>
                            <td className="py-2 pr-3 text-right">{vals.itens}</td>
                            <td className="py-2 pr-3 text-right">{vals.estoque}</td>
                            <td className="py-2 text-right font-medium">{fmtBRL(vals.valor)}</td>
                          </tr>
                        ))}
                        {Object.keys(categoriasFiltradas).length > 1 && (
                          <tr className="border-t-2 font-bold">
                            <td className="py-2 pr-3">Total</td>
                            <td className="py-2 pr-3 text-right">{Object.values(categoriasFiltradas).reduce((s: number, v: any) => s + v.itens, 0)}</td>
                            <td className="py-2 pr-3 text-right">{Object.values(categoriasFiltradas).reduce((s: number, v: any) => s + v.estoque, 0)}</td>
                            <td className="py-2 text-right">{fmtBRL(Object.values(categoriasFiltradas).reduce((s: number, v: any) => s + v.valor, 0))}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* TABELA: CAs Vencendo nos próximos 90 dias */}
            {/* ============================================================ */}
            {data.casVencendo?.length > 0 && (
              <Card className="border-l-4 border-l-yellow-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-yellow-500" />
                    CAs Vencendo nos Próximos 90 Dias ({data.casVencendo.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Vencimento</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Estoque</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.casVencendo.map((e: any, i: number) => {
                          const dias = Math.ceil((new Date(e.validadeCa + "T00:00:00").getTime() - Date.now()) / 86400000);
                          return (
                            <tr key={i} className="border-b border-border/50">
                              <td className="py-2 pr-3 font-medium">{e.nome}</td>
                              <td className="py-2 pr-3"><Badge variant="outline">{e.ca}</Badge></td>
                              <td className="py-2 pr-3">
                                <span className={dias <= 30 ? "text-red-600 font-semibold" : dias <= 60 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                                  {new Date(e.validadeCa + "T00:00:00").toLocaleDateString("pt-BR")}
                                </span>
                                <span className="text-xs text-muted-foreground ml-2">({dias}d)</span>
                              </td>
                              <td className="py-2 text-right">{e.estoque}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* TABELA: Estoque Crítico */}
            {/* ============================================================ */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Estoque Crítico (menores estoques)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.estoqueCritico?.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhum item com estoque crítico</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Estoque</th>
                          <th className="py-2 font-medium text-muted-foreground">Validade CA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.estoqueCritico?.map((e: any, i: number) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium">{e.nome}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{e.ca || "-"}</td>
                            <td className={`py-2 pr-3 text-right font-bold ${e.estoque <= 5 ? "text-red-600" : "text-foreground"}`}>{e.estoque}</td>
                            <td className={`py-2 ${e.validadeCa && e.validadeCa < new Date().toISOString().split("T")[0] ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                              {e.validadeCa ? new Date(e.validadeCa + "T00:00:00").toLocaleDateString("pt-BR") : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ============================================================ */}
            {/* TABELA: CAs Vencidos */}
            {/* ============================================================ */}
            {data.caVencidos?.length > 0 && (
              <Card className="border-l-4 border-l-red-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-red-500" />
                    Certificados de Aprovação Vencidos ({data.caVencidos.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">EPI</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground">CA</th>
                          <th className="py-2 font-medium text-muted-foreground">Vencimento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.caVencidos.map((e: any, i: number) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium">{e.nome}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{e.ca || "-"}</td>
                            <td className="py-2 text-red-600 font-semibold">
                              {e.validadeCa ? new Date(e.validadeCa + "T00:00:00").toLocaleDateString("pt-BR") : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ============================================================ */}
            {/* TABELA: Entregas por Obra (detalhada) */}
            {/* ============================================================ */}
            {obrasFiltradas.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-500" />
                    Entregas por Obra (detalhado)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 pr-3 font-medium text-muted-foreground">Obra</th>
                          <th className="py-2 pr-3 font-medium text-muted-foreground text-right">Entregas</th>
                          <th className="py-2 font-medium text-muted-foreground text-right">Unidades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {obrasFiltradas.map((o: any, i: number) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 pr-3 font-medium">{o.nome}</td>
                            <td className="py-2 pr-3 text-right">{o.entregas}</td>
                            <td className="py-2 text-right font-bold">{o.unidades}</td>
                          </tr>
                        ))}
                        {obrasFiltradas.length > 1 && (
                          <tr className="border-t-2 font-bold">
                            <td className="py-2 pr-3">Total</td>
                            <td className="py-2 pr-3 text-right">{obrasFiltradas.reduce((s: number, o: any) => s + o.entregas, 0)}</td>
                            <td className="py-2 text-right">{obrasFiltradas.reduce((s: number, o: any) => s + o.unidades, 0)}</td>
                          </tr>
                        )}
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
