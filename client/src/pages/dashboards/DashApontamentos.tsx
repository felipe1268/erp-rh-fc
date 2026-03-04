import DashboardLayout from "@/components/DashboardLayout";
import DashChart, { DashKpi } from "@/components/DashChart";
import PrintActions from "@/components/PrintActions";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ClipboardList, AlertTriangle, CheckCircle, Clock, BarChart3,
  Building2, TrendingUp, Users, Shield, Loader2
} from "lucide-react";
import { useState, useMemo } from "react";

const TIPO_LABELS: Record<string, string> = {
  falta: "Falta",
  atraso: "Atraso",
  saida_antecipada: "Saída Antecipada",
  abandono_posto: "Abandono de Posto",
  insubordinacao: "Insubordinação",
  acidente: "Acidente",
  atestado_medico: "Atestado Médico",
  desvio_conduta: "Desvio de Conduta",
  elogio: "Elogio",
  outro: "Outro",
};

const TIPO_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
  "#8b5cf6", "#ec4899", "#06b6d4", "#14b8a6", "#6b7280"
];

const MESES_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

export default function DashApontamentos() {
  const { selectedCompanyId } = useCompany();
  const [ano, setAno] = useState(new Date().getFullYear());
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const companyId = Number(selectedCompanyId || 0);

  // Queries
  const { data: taxa, isLoading: loadTaxa } = trpc.fieldNotes.taxaResolucao.useQuery(
    { companyId, dataInicio: dataInicio || undefined, dataFim: dataFim || undefined },
    { enabled: companyId > 0 }
  );

  const { data: porTipo, isLoading: loadTipo } = trpc.fieldNotes.statsPorTipo.useQuery(
    { companyId, dataInicio: dataInicio || undefined, dataFim: dataFim || undefined },
    { enabled: companyId > 0 }
  );

  const { data: porObra, isLoading: loadObra } = trpc.fieldNotes.statsPorObra.useQuery(
    { companyId, dataInicio: dataInicio || undefined, dataFim: dataFim || undefined },
    { enabled: companyId > 0 }
  );

  const { data: porMes, isLoading: loadMes } = trpc.fieldNotes.statsPorMes.useQuery(
    { companyId, ano },
    { enabled: companyId > 0 }
  );

  const isLoading = loadTaxa || loadTipo || loadObra || loadMes;

  // Chart data
  const tipoLabels = useMemo(() => (porTipo || []).map((r: any) => TIPO_LABELS[r.tipoOcorrencia] || r.tipoOcorrencia), [porTipo]);
  const tipoValues = useMemo(() => (porTipo || []).map((r: any) => Number(r.total)), [porTipo]);

  const obraLabels = useMemo(() => (porObra || []).map((r: any) => r.obraNome || "Sem obra"), [porObra]);
  const obraTotal = useMemo(() => (porObra || []).map((r: any) => Number(r.total)), [porObra]);
  const obraPendentes = useMemo(() => (porObra || []).map((r: any) => Number(r.pendentes)), [porObra]);
  const obraResolvidos = useMemo(() => (porObra || []).map((r: any) => Number(r.resolvidos)), [porObra]);

  const mesLabels = useMemo(() => (porMes || []).map((r: any) => {
    const m = r.mes.split("-")[1];
    return MESES_LABELS[m] || m;
  }), [porMes]);
  const mesTotal = useMemo(() => (porMes || []).map((r: any) => Number(r.total)), [porMes]);
  const mesResolvidos = useMemo(() => (porMes || []).map((r: any) => Number(r.resolvidos)), [porMes]);
  const mesPendentes = useMemo(() => (porMes || []).map((r: any) => Number(r.pendentes)), [porMes]);

  if (!companyId) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Selecione uma empresa para visualizar o dashboard.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-amber-600" />
              Dashboard de Apontamentos de Campo
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Análise de ocorrências registradas pelo gestor de campo
            </p>
          </div>
          <PrintActions title="Dashboard Apontamentos de Campo" />
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <Label className="text-xs text-muted-foreground">Ano</Label>
                <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map(a => (
                      <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Data Início</Label>
                <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="w-[160px]" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Data Fim</Label>
                <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-[160px]" />
              </div>
              {(dataInicio || dataFim) && (
                <button onClick={() => { setDataInicio(""); setDataFim(""); }} className="text-xs text-blue-600 underline pb-2">
                  Limpar filtros
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <DashKpi label="Total" value={taxa?.total || 0} icon={ClipboardList} color="blue" />
              <DashKpi label="Pendentes" value={taxa?.pendentes || 0} icon={Clock} color="amber" />
              <DashKpi label="Em Análise" value={taxa?.emAnalise || 0} icon={AlertTriangle} color="orange" />
              <DashKpi label="Resolvidos" value={taxa?.resolvidos || 0} icon={CheckCircle} color="green" />
              <DashKpi label="Taxa Resolução" value={`${taxa?.taxaResolucao || 0}%`} icon={TrendingUp} color="emerald" />
              <DashKpi label="Tempo Médio" value={`${taxa?.tempoMedioResolucaoHoras || 0}h`} icon={Clock} color="purple" sub="para resolver" />
            </div>

            {/* Prioridade */}
            {(taxa?.urgentes || 0) > 0 || (taxa?.altas || 0) > 0 ? (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <span className="font-semibold text-red-800">Atenção:</span>
                    {(taxa?.urgentes || 0) > 0 && (
                      <span className="text-red-700">{taxa?.urgentes} urgente(s)</span>
                    )}
                    {(taxa?.altas || 0) > 0 && (
                      <span className="text-orange-700">{taxa?.altas} alta(s) prioridade</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Gráficos Linha 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Por Tipo */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Ocorrências por Tipo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {tipoLabels.length > 0 ? (
                    <DashChart
                      title=""
                      type="doughnut"
                      labels={tipoLabels}
                      datasets={[{
                        data: tipoValues,
                        backgroundColor: TIPO_COLORS.slice(0, tipoLabels.length),
                      }]}
                      height={280}
                    />
                  ) : (
                    <p className="text-muted-foreground text-sm text-center py-10">Nenhum dado no período</p>
                  )}
                </CardContent>
              </Card>

              {/* Por Obra */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Ocorrências por Obra
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {obraLabels.length > 0 ? (
                    <DashChart
                      title=""
                      type="bar"
                      labels={obraLabels}
                      datasets={[
                        { label: "Pendentes", data: obraPendentes, backgroundColor: "#f59e0b" },
                        { label: "Resolvidos", data: obraResolvidos, backgroundColor: "#22c55e" },
                      ]}
                      height={280}
                    />
                  ) : (
                    <p className="text-muted-foreground text-sm text-center py-10">Nenhum dado no período</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Gráfico Evolução Mensal */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Evolução Mensal — {ano}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {mesLabels.length > 0 ? (
                  <DashChart
                    title=""
                    type="line"
                    labels={mesLabels}
                    datasets={[
                      { label: "Total", data: mesTotal, borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.1)" },
                      { label: "Resolvidos", data: mesResolvidos, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.1)" },
                      { label: "Pendentes", data: mesPendentes, borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.1)" },
                    ]}
                    height={300}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm text-center py-10">Nenhum dado para {ano}</p>
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
