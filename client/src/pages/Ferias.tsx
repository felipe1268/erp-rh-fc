import DashboardLayout from "@/components/DashboardLayout";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import FullScreenDialog from "@/components/FullScreenDialog";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { PersonPhoto } from "@/components/PersonPhoto";
import { formatCPF, formatMoeda, fmtNum } from "@/lib/formatters";
import { removeAccents } from "@/lib/searchUtils";
import { dataLimiteInicioGozoFerias } from "@/lib/dateUtils";
import {
  Palmtree, Plus, Search, Calendar, DollarSign, AlertTriangle,
  Users, Eye, X, RefreshCw, ChevronLeft, ChevronRight,
  Clock, CheckCircle2, Ban, CalendarDays, TrendingUp,
  Zap, CheckCheck, PenLine, Info, Loader2, ArrowRight, Play, Square, Undo2,
  ChevronDown, Trash2,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: "A Vencer", color: "text-amber-700", bg: "bg-amber-100" },
  agendada: { label: "Agendada", color: "text-blue-700", bg: "bg-blue-100" },
  em_gozo: { label: "Em Gozo", color: "text-green-700", bg: "bg-green-100" },
  concluida: { label: "Concluída", color: "text-gray-700", bg: "bg-gray-100" },
  vencida: { label: "Vencida", color: "text-red-700", bg: "bg-red-100" },
  cancelada: { label: "Cancelada", color: "text-red-700", bg: "bg-red-50" },
};

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const TABELA_FALTAS_ART130 = [
  { faixa: "0 a 5", dias: 30 },
  { faixa: "6 a 14", dias: 24 },
  { faixa: "15 a 23", dias: 18 },
  { faixa: "24 a 32", dias: 12 },
  { faixa: "Mais de 32", dias: 0 },
];

function DefinirFeriasForm({ definirItem, definirForm, setDefinirForm, companyId, onSubmit, isPending, onCancel }: {
  definirItem: any; definirForm: any; setDefinirForm: (v: any) => void;
  companyId: number; onSubmit: () => void; isPending: boolean; onCancel: () => void;
}) {
  const faltasQuery = trpc.avisoPrevio.ferias.consultarFaltasPeriodoAquisitivo.useQuery({
    employeeId: definirItem.employeeId,
    companyId,
    periodoAquisitivoInicio: definirItem.periodoAquisitivoInicio,
    periodoAquisitivoFim: definirItem.periodoAquisitivoFim,
  }, { enabled: !!definirItem.employeeId });

  const faltas = faltasQuery.data;
  const diasDireito = faltas?.diasDireito ?? 30;
  const diasAbono = definirForm.abonoPecuniario === 1 ? Math.floor(diasDireito / 3) : 0;
  const diasMaxGozo = diasDireito - diasAbono;
  // Rev. 1695 — Dias de Gozo agora é editável (CLT permite fracionamento, Art. 134 §1°).
  // Quando o usuário não digitou nada ainda, usa o máximo legal como default.
  const diasGozo = (typeof definirForm.diasGozo === "number" && definirForm.diasGozo > 0)
    ? Math.min(definirForm.diasGozo, diasMaxGozo)
    : diasMaxGozo;

  useEffect(() => {
    if (faltas && !faltas.perdeuDireito) {
      const novoDiasGozo = definirForm.abonoPecuniario === 1 ? diasDireito - Math.floor(diasDireito / 3) : diasDireito;
      let fim = definirForm.dataFim || "";
      if (definirForm.dataInicio) {
        const d = new Date(definirForm.dataInicio + "T00:00:00");
        d.setDate(d.getDate() + novoDiasGozo - 1);
        fim = d.toISOString().slice(0, 10);
      }
      setDefinirForm({ ...definirForm, diasGozo: novoDiasGozo, dataFim: fim });
    }
  }, [faltas?.diasDireito, definirForm.abonoPecuniario]);

  return (
    <div className="space-y-4">
      <div className="bg-muted/30 rounded-lg p-3">
        <p className="font-semibold">{definirItem.employeeName || "Funcionário"}</p>
        <p className="text-xs text-muted-foreground">
          Período Aquisitivo: {formatDate(definirItem.periodoAquisitivoInicio)} a {formatDate(definirItem.periodoAquisitivoFim)}
        </p>
        <p className="text-xs text-muted-foreground" title="Data limite p/ iniciar o gozo (30 dias antes do próximo período aquisitivo, conforme CLT art. 134)">
          Concessivo até: {formatDate(dataLimiteInicioGozoFerias(definirItem.periodoConcessivoFim))}
        </p>
      </div>

      {faltasQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando faltas no período aquisitivo...
        </div>
      ) : faltasQuery.isError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2">
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Erro ao consultar faltas. Os dias de férias serão mantidos como 30 dias (padrão).
          </p>
        </div>
      ) : faltas && faltas.totalFaltasInjustificadas > 0 ? (
        <div className={`rounded-lg p-3 border ${faltas.perdeuDireito ? 'bg-red-50 border-red-300' : faltas.diasDireito < 30 ? 'bg-amber-50 border-amber-300' : 'bg-green-50 border-green-200'}`}>
          <p className={`text-xs font-semibold flex items-center gap-1 ${faltas.perdeuDireito ? 'text-red-700' : faltas.diasDireito < 30 ? 'text-amber-700' : 'text-green-700'}`}>
            <AlertTriangle className="h-3.5 w-3.5" />
            {faltas.perdeuDireito
              ? `Funcionário PERDEU o direito a férias (${faltas.totalFaltasInjustificadas} faltas)`
              : faltas.diasDireito < 30
                ? `Férias reduzidas: ${faltas.totalFaltasInjustificadas} faltas injustificadas → ${faltas.diasDireito} dias`
                : `${faltas.totalFaltasInjustificadas} faltas (dentro da tolerância) → 30 dias mantidos`
            }
          </p>
          <div className="mt-2 bg-white/70 rounded p-2">
            <p className="text-[10px] font-semibold text-gray-600 mb-1">Tabela Art. 130 CLT — Férias x Faltas Injustificadas:</p>
            <div className="grid grid-cols-5 gap-1">
              {TABELA_FALTAS_ART130.map(t => (
                <div key={t.faixa} className={`text-center p-1 rounded text-[9px] ${
                  (t.dias === faltas.diasDireito) ? 'bg-blue-100 border border-blue-400 font-bold text-blue-800' : 'bg-gray-50 text-gray-500'
                }`}>
                  <p>{t.faixa}</p>
                  <p className="font-semibold">{t.dias === 0 ? 'Perde' : `${t.dias}d`}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[9px] text-gray-500 mt-1 italic">
            Art. 130, CLT — "Após cada período de 12 meses de vigência do contrato de trabalho, o empregado terá direito a férias, na seguinte proporção: [...]"
          </p>
        </div>
      ) : faltas && faltas.totalFaltasInjustificadas === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-2">
          <p className="text-xs text-green-700 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Nenhuma falta injustificada no período — direito integral a 30 dias (Art. 130, CLT)
          </p>
        </div>
      ) : null}

      {faltas?.perdeuDireito ? (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-center">
          <p className="text-sm font-semibold text-red-700">Não é possível agendar férias</p>
          <p className="text-xs text-red-600 mt-1">
            Com {faltas.totalFaltasInjustificadas} faltas injustificadas, o funcionário perdeu o direito a férias neste período aquisitivo conforme Art. 130, §1° da CLT.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={onCancel}>Fechar</Button>
          </DialogFooter>
        </div>
      ) : (
        <>
          {definirItem.dataSugeridaInicio && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                <Info className="h-3.5 w-3.5" /> Data Sugerida pelo Sistema
              </p>
              <p className="text-sm font-medium text-blue-800 mt-1">
                {formatDate(definirItem.dataSugeridaInicio)} a {formatDate(definirItem.dataSugeridaFim)}
              </p>
            </div>
          )}

          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1 mb-2">
              <DollarSign className="h-3.5 w-3.5" /> Abono Pecuniário (Art. 143, CLT)
            </p>
            <div className="flex items-center gap-3">
              <Select value={String(definirForm.abonoPecuniario || 0)} onValueChange={v => {
                setDefinirForm({ ...definirForm, abonoPecuniario: parseInt(v) });
              }}>
                <SelectTrigger className="w-48 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Não converter</SelectItem>
                  <SelectItem value="1">Vender 1/3 das férias</SelectItem>
                </SelectContent>
              </Select>
              {definirForm.abonoPecuniario === 1 && (
                <p className="text-xs text-indigo-600">
                  {diasAbono} dias convertidos em abono | {diasGozo} dias de gozo
                </p>
              )}
            </div>
            <p className="text-[9px] text-gray-500 mt-1.5 italic">
              Art. 143, CLT — "É facultado ao empregado converter 1/3 do período de férias a que tiver direito em abono pecuniário, no valor da remuneração que lhe seria devida nos dias correspondentes."
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Data Início *</label>
              <Input type="date" value={definirForm.dataInicio || ""} onChange={e => {
                const inicio = e.target.value;
                const dias = diasGozo; // Rev. 1695 — usa o valor atual (editável) em vez do máximo
                let fim = "";
                if (inicio) {
                  const d = new Date(inicio + "T00:00:00");
                  d.setDate(d.getDate() + dias - 1);
                  fim = d.toISOString().slice(0, 10);
                }
                setDefinirForm({ ...definirForm, dataInicio: inicio, dataFim: fim });
              }} />
            </div>
            <div>
              <label className="text-sm font-medium">Dias de Gozo</label>
              {/* Rev. 1695 — campo editável: permite fracionamento (Art. 134 §1° CLT). Data Fim recalcula automaticamente. */}
              <Input
                type="number"
                min={1}
                max={diasMaxGozo}
                value={diasGozo}
                onChange={e => {
                  const raw = parseInt(e.target.value || "0", 10);
                  const dias = Math.max(1, Math.min(isNaN(raw) ? 1 : raw, diasMaxGozo));
                  let fim = "";
                  if (definirForm.dataInicio) {
                    const d = new Date(definirForm.dataInicio + "T00:00:00");
                    d.setDate(d.getDate() + dias - 1);
                    fim = d.toISOString().slice(0, 10);
                  }
                  setDefinirForm({ ...definirForm, diasGozo: dias, dataFim: fim });
                }}
              />
              {diasDireito < 30 && (
                <p className="text-[10px] text-amber-600 mt-0.5">Reduzido de 30 para {diasDireito} dias (Art. 130)</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5">Máx. permitido: {diasMaxGozo} dias{definirForm.abonoPecuniario === 1 ? ` (após abono de ${diasAbono})` : ""}. Mín. 5 dias por fração (Art. 134 §1°).</p>
            </div>
            <div>
              <label className="text-sm font-medium">Data Fim <span className="text-xs text-muted-foreground font-normal">(calculada)</span></label>
              <Input type="date" value={definirForm.dataFim || ""} disabled className="bg-muted/50" />
            </div>
            {definirForm.abonoPecuniario === 1 && (
              <div>
                <label className="text-sm font-medium">Dias de Abono</label>
                <Input type="number" value={diasAbono} disabled className="bg-indigo-50" />
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Observações</label>
            <Textarea value={definirForm.observacoes || ""} onChange={e => setDefinirForm({ ...definirForm, observacoes: e.target.value })} rows={2} placeholder="Motivo da alteração (opcional)" />
          </div>

          {definirItem.dataSugeridaInicio && definirForm.dataInicio && definirForm.dataInicio !== definirItem.dataSugeridaInicio && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-purple-700 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Data diferente da sugerida
              </p>
              <p className="text-[10px] text-purple-600 mt-1">
                Esta alteração será registrada e indicada visualmente no calendário com cor roxa e ícone de edição.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>Cancelar</Button>
            <Button onClick={onSubmit} disabled={isPending}>
              {isPending ? "Salvando..." : "Confirmar Data"}
            </Button>
          </DialogFooter>
        </>
      )}
    </div>
  );
}

// ============================================================
// DIALOG: Detalhes completos de férias do funcionário (Gantt click)
// ============================================================
function GanttEmployeeFeriasDialog({companyId, employeeId, onClose, onDefinirData, refetch: parentRefetch, companyIds, isMaster, onCancelarConclusao}: {companyId: number;
  employeeId: number;
  onClose: () => void;
  onDefinirData: (item: any) => void;
  refetch: () => void; companyIds?: number[]; isMaster?: boolean; onCancelarConclusao?: (periodo: any) => void}) {
  const { data, isLoading } = trpc.avisoPrevio.ferias.feriasDoFuncionario.useQuery(
    { companyId, employeeId },
    { enabled: (!!companyId || (companyIds?.length ?? 0) > 0) && !!employeeId }
  );
  const confirmarVencidasLote = trpc.avisoPrevio.ferias.confirmarVencidasLote.useMutation({
    onSuccess: (d: any) => { parentRefetch(); toast.success(`${d.confirmados} férias confirmada(s)!`); },
    onError: (e: any) => toast.error(e.message),
  });
  const gerarPeriodos = trpc.avisoPrevio.ferias.gerarPeriodos.useMutation({
    onSuccess: (d: any) => { parentRefetch(); toast.success(`${d.periodosGerados} período(s) gerado(s)!`); },
    onError: (e: any) => toast.error(e.message),
  });

  const STATUS_BADGE: Record<string, { label: string; variant: string; className: string }> = {
    pendente: { label: "A Vencer", variant: "outline", className: "border-amber-400 text-amber-700 bg-amber-50" },
    agendada: { label: "Agendada", variant: "outline", className: "border-blue-400 text-blue-700 bg-blue-50" },
    em_gozo: { label: "Em Gozo", variant: "outline", className: "border-green-400 text-green-700 bg-green-50" },
    concluida: { label: "Concluída", variant: "outline", className: "border-gray-400 text-gray-700 bg-gray-100" },
    vencida: { label: "Vencida", variant: "destructive", className: "" },
    cancelada: { label: "Cancelada", variant: "outline", className: "border-gray-300 text-gray-500" },
  };

  return (
    <FullScreenDialog open={true} onClose={onClose} title="Detalhes de Férias do Funcionário" icon={<Palmtree className="h-5 w-5 text-white" />}>
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Carregando dados de férias...</span>
          </div>
        ) : !data ? (
          <div className="text-center py-20 text-muted-foreground">Funcionário não encontrado</div>
        ) : (
          <>
            {/* Dados do funcionário */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="col-span-2 bg-muted/30 rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase">Colaborador</p>
                <p className="font-semibold text-lg">{data.funcionario.nome}</p>
                <p className="text-sm text-muted-foreground">{formatCPF(data.funcionario.cpf)} — {data.funcionario.cargo}</p>
                {data.funcionario.setor && <p className="text-xs text-muted-foreground mt-1">Setor: {data.funcionario.setor}</p>}
              </div>
              <div className="bg-muted/30 rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase">Admissão</p>
                <p className="font-semibold">{formatDate(data.funcionario.dataAdmissao)}</p>
                <p className="text-xs text-muted-foreground mt-1">Salário: {data.funcionario.salarioBase ? `R$ ${data.funcionario.salarioBase}` : '-'}</p>
              </div>
              <div className="bg-muted/30 rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase">Status</p>
                <p className="font-semibold">{data.funcionario.status}</p>
              </div>
            </div>

            {/* Resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                <p className="text-xs text-blue-600 font-semibold uppercase">Total Períodos</p>
                <p className="text-2xl font-bold text-blue-700">{fmtNum(data.resumo.totalPeriodos)}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                <p className="text-xs text-green-600 font-semibold uppercase">Concluídas</p>
                <p className="text-2xl font-bold text-green-700">{fmtNum(data.resumo.totalConcluidas || 0)}</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                <p className="text-xs text-amber-600 font-semibold uppercase">Pendentes</p>
                <p className="text-2xl font-bold text-amber-700">{fmtNum(data.resumo.totalRegistrados - (data.resumo.totalConcluidas || 0) - (data.resumo.totalEmGozo || 0))}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center border border-red-200">
                <p className="text-xs text-red-600 font-semibold uppercase">Vencidas</p>
                <p className="text-2xl font-bold text-red-700">{fmtNum(data.resumo.totalVencidas)}</p>
              </div>
              <div className="bg-cyan-50 rounded-lg p-3 text-center border border-cyan-200">
                <p className="text-xs text-cyan-600 font-semibold uppercase">Não Registrados</p>
                <p className="text-2xl font-bold text-cyan-700">{fmtNum(data.resumo.totalNaoRegistrados)}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200">
                <p className="text-xs text-purple-600 font-semibold uppercase">Valor Pendente</p>
                <p className="text-xl font-bold text-purple-700">{formatMoeda(parseFloat(data.resumo.valorTotalEstimado))}</p>
              </div>
            </div>

            {/* Ações */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-green-300 text-green-700 hover:bg-green-50"
                onClick={() => gerarPeriodos.mutate({ companyId, companyIds, employeeId })}
                disabled={gerarPeriodos.isPending}
              >
                <Zap className="h-4 w-4 mr-1" />
                {gerarPeriodos.isPending ? 'Gerando...' : 'Gerar Períodos Automáticos'}
              </Button>
              {data.resumo.totalVencidas > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => {
                    const vencidaIds = data.periodosRegistrados.filter((p: any) => p.vencida === 1 || p.status === 'vencida').map((p: any) => p.id);
                    if (vencidaIds.length > 0 && confirm(`Confirmar ${vencidaIds.length} férias vencidas como pagas?`)) {
                      confirmarVencidasLote.mutate({ ids: vencidaIds, observacao: 'Confirmado via detalhes do funcionário' });
                    }
                  }}
                  disabled={confirmarVencidasLote.isPending}
                >
                  <CheckCheck className="h-4 w-4 mr-1" />
                  {confirmarVencidasLote.isPending ? 'Confirmando...' : 'Confirmar Vencidas como Pagas'}
                </Button>
              )}
            </div>

            {/* Períodos Registrados */}
            {data.periodosRegistrados.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Períodos Registrados no Sistema ({data.periodosRegistrados.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="p-2 text-left">#</th>
                        <th className="p-2 text-left">Período Aquisitivo</th>
                        <th className="p-2 text-left">Concessivo Até</th>
                        <th className="p-2 text-left">Gozo</th>
                        <th className="p-2 text-left">Dias</th>
                        <th className="p-2 text-right">Valor</th>
                        <th className="p-2 text-center">Status</th>
                        <th className="p-2 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.periodosRegistrados.map((p: any, i: number) => {
                        const st = STATUS_BADGE[p.status] || STATUS_BADGE.pendente;
                        const isVencida = p.vencida === 1 || p.status === 'vencida';
                        return (
                          <tr key={p.id} className={`border-b last:border-0 hover:bg-muted/20 ${isVencida ? 'bg-red-50/50' : ''}`}>
                            <td className="p-2 text-muted-foreground">{p.numeroPeriodo || (i + 1)}º</td>
                            <td className="p-2">
                              <span className="font-medium">{formatDate(p.periodoAquisitivoInicio)}</span>
                              <span className="text-muted-foreground"> a </span>
                              <span className="font-medium">{formatDate(p.periodoAquisitivoFim)}</span>
                            </td>
                            <td className="p-2" title="Data limite p/ iniciar o gozo (30 dias antes do próximo período aquisitivo)">{formatDate(dataLimiteInicioGozoFerias(p.periodoConcessivoFim))}</td>
                            <td className="p-2">
                              {p.dataInicio ? (
                                <span>{formatDate(p.dataInicio)} a {formatDate(p.dataFim)}</span>
                              ) : p.dataSugeridaInicio ? (
                                <span className="text-muted-foreground italic">Sugerido: {formatDate(p.dataSugeridaInicio)}</span>
                              ) : (
                                <span className="text-muted-foreground">Não definido</span>
                              )}
                            </td>
                            <td className="p-2">{p.diasGozo || 30}</td>
                            <td className="p-2 text-right font-bold">{formatMoeda(parseFloat(p.valorTotal || '0'))}</td>
                            <td className="p-2 text-center">
                              <Badge className={`text-[10px] ${st.className}`}>{st.label}</Badge>
                              {p.pagamentoEmDobro === 1 && <Badge variant="destructive" className="ml-1 text-[9px]">2x</Badge>}
                              {p.dataAlteradaPeloRH === 1 && <Badge variant="outline" className="ml-1 text-[9px] border-purple-300 text-purple-600">RH</Badge>}
                            </td>
                            <td className="p-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {(p.status === 'pendente' || p.status === 'vencida') && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" title="Definir Data" onClick={() => onDefinirData(p)}>
                                    <PenLine className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {p.status === 'concluida' && isMaster && onCancelarConclusao && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-orange-600 hover:bg-orange-50 font-medium text-xs" title="Cancelar Conclusão (ADM Master)" onClick={() => onCancelarConclusao(p)}>
                                    <Undo2 className="h-3.5 w-3.5 mr-1" /> Cancelar
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Períodos Não Registrados */}
            {data.periodosNaoRegistrados.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Períodos Não Registrados ({data.periodosNaoRegistrados.length})
                </h3>
                <p className="text-xs text-muted-foreground mb-2">Estes períodos foram calculados com base na data de admissão, mas ainda não foram registrados no sistema. Clique em "Gerar Períodos Automáticos" para registrá-los.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-amber-50/50">
                        <th className="p-2 text-left">Período Aquisitivo</th>
                        <th className="p-2 text-left">Concessivo Até</th>
                        <th className="p-2 text-right">Valor Estimado</th>
                        <th className="p-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.periodosNaoRegistrados.map((p: any, i: number) => (
                        <tr key={i} className={`border-b last:border-0 ${p.vencida ? 'bg-red-50/50' : 'bg-amber-50/20'}`}>
                          <td className="p-2">
                            <span className="font-medium">{formatDate(p.periodoAquisitivoInicio)}</span>
                            <span className="text-muted-foreground"> a </span>
                            <span className="font-medium">{formatDate(p.periodoAquisitivoFim)}</span>
                          </td>
                          <td className="p-2" title="Data limite p/ iniciar o gozo (30 dias antes do próximo período aquisitivo)">{formatDate(dataLimiteInicioGozoFerias(p.periodoConcessivoFim))}</td>
                          <td className="p-2 text-right font-bold">{formatMoeda(parseFloat(p.valorEstimado || '0'))}</td>
                          <td className="p-2 text-center">
                            <Badge variant={p.vencida ? 'destructive' : 'outline'} className="text-[10px]">
                              {p.vencida ? 'Vencida' : 'A Vencer'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Observações */}
            {data.periodosRegistrados.some((p: any) => p.observacoes) && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Info className="h-4 w-4" /> Observações
                </h3>
                <div className="space-y-2">
                  {data.periodosRegistrados.filter((p: any) => p.observacoes).map((p: any) => (
                    <div key={p.id} className="bg-muted/20 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">{p.numeroPeriodo}º Período ({formatDate(p.periodoAquisitivoInicio)} a {formatDate(p.periodoAquisitivoFim)})</p>
                      <p className="text-sm mt-1">{p.observacoes}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </FullScreenDialog>
  );
}

function AlertCard({ icon: Icon, count, title, items, borderClass, numClass, nameClass, dateClass, onSelectEmployee }: {
  icon: any; count: number; title: string; items: any[];
  borderClass: string; numClass: string; nameClass: string; dateClass: string;
  onSelectEmployee: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className={`shadow-sm border-l-4 ${borderClass} cursor-pointer select-none`}>
      <CardContent className="px-4 py-3">
        <button
          className="w-full flex items-center justify-between gap-2 text-left"
          onClick={() => setOpen(o => !o)}
        >
          <span className={`text-xs font-semibold flex items-center gap-1.5 ${numClass}`}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="text-base font-bold">{count}</span>
            <span>{title}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${numClass} ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="mt-2 space-y-0.5 border-t pt-2">
            {items.map((v: any) => (
              <p key={v.id} className="text-xs">
                <span className={`font-medium cursor-pointer hover:underline ${nameClass}`} onClick={() => onSelectEmployee(v.employeeId)}>{v.employeeName}</span>
                <span className={`${dateClass}`} title="Data limite p/ iniciar o gozo"> — Concessivo até {formatDate(dataLimiteInicioGozoFerias(v.periodoConcessivoFim))}</span>
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Rev. 2666 — Filtro de status MULTI-SELEÇÃO + opções "Vencida 1º/2º período".
const STATUS_OPCOES: { value: string; label: string }[] = [
  { value: "pendente", label: "A Vencer" },
  { value: "agendada", label: "Agendada" },
  { value: "em_gozo", label: "Em Gozo" },
  { value: "concluida", label: "Concluída" },
  { value: "vencida", label: "Vencida (todas)" },
  { value: "vencida_1", label: "Vencida — 1º período" },
  { value: "vencida_2", label: "Vencida — 2º período ou +" },
];
const isFeriasVencida = (a: any) =>
  (a.status === "vencida" || a.vencida) && a.status !== "concluida" && a.status !== "cancelada";
const matchStatusFiltro = (a: any, sel: string) => {
  switch (sel) {
    case "vencida": return isFeriasVencida(a);
    case "vencida_1": return isFeriasVencida(a) && (a.numeroPeriodo || 1) === 1;
    case "vencida_2": return isFeriasVencida(a) && (a.numeroPeriodo || 1) >= 2;
    default: return a.status === sel;
  }
};

export default function Ferias() {
  const { user } = useAuth();
  const isMaster = user?.role === 'admin_master';
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [filtro2Periodo2026, setFiltro2Periodo2026] = useState(false);
  const [sortBy, setSortBy] = useState<
    | "alfa_asc" | "alfa_desc"
    | "venc_asc" | "venc_desc"
    | "inicio_asc" | "inicio_desc"
    | "fim_asc" | "fim_desc"
    | "pgto_asc" | "pgto_desc"
    | "valor_asc" | "valor_desc"
    | "dias_asc" | "dias_desc"
  >("venc_asc");
  // Rev. 2652 — filtros extras da Lista de Férias
  const [cargoFilter, setCargoFilter] = useState("todos");
  const [periodoFilter, setPeriodoFilter] = useState<"todos" | "1" | "2mais">("todos");
  const [inicioDe, setInicioDe] = useState("");
  const [inicioAte, setInicioAte] = useState("");
  const [tab, setTab] = useState("lista");
  const [anoCalendario, setAnoCalendario] = useState(new Date().getFullYear());
  const [showDialog, setShowDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [editingValues, setEditingValues] = useState(false);
  const [editValores, setEditValores] = useState<{ valorFerias: string; valorTerco: string; valorAbono: string; valorTotal: string; mediaHE: string; mediaDSRHE: string; }>({ valorFerias: "", valorTerco: "", valorAbono: "", valorTotal: "", mediaHE: "0,00", mediaDSRHE: "0,00" });
  const [inssAjuste, setInssAjuste] = useState<string>("0,00");
  const [arredondamentoProvento, setArredondamentoProvento] = useState<string>("0,00");
  const [bonusValor, setBonusValor] = useState<string>("0,00");
  const [bonusDesc, setBonusDesc] = useState<string>("");
  const [pensaoDesconto, setPensaoDesconto] = useState<string>("0,00");
  const [outrosDescontos, setOutrosDescontos] = useState<string>("0,00");
  const [outrosDescontosDesc, setOutrosDescontosDesc] = useState<string>("");
  const [reciboUploading, setReciboUploading] = useState(false);

  // Carrega ajuste salvo quando o item de férias é aberto no detalhe
  useEffect(() => {
    if (selectedItem) {
      setInssAjuste(selectedItem.ajusteInss || "0,00");
      setArredondamentoProvento(selectedItem.arredondamentoProvento || "0,00");
      setBonusValor(selectedItem.bonusValor || "0,00");
      setBonusDesc(selectedItem.bonusDesc || "");
      setPensaoDesconto(selectedItem.pensaoDesconto || "0,00");
      setOutrosDescontos(selectedItem.outrosDescontos || "0,00");
      setOutrosDescontosDesc(selectedItem.outrosDescontosDesc || "");
    }
  }, [selectedItem?.id]);

  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});

  // Dialog para detalhamento do mês no Fluxo de Caixa
  const [showFluxoMesDialog, setShowFluxoMesDialog] = useState(false);
  const [fluxoMesSelecionado, setFluxoMesSelecionado] = useState<any>(null);

  // Dialog para detalhes de férias do funcionário (Gantt click)
  const [ganttEmployeeId, setGanttEmployeeId] = useState<number | null>(null);

  // Dialog para definir data de férias (RH override)
  const [showDefinirDialog, setShowDefinirDialog] = useState(false);
  const [definirItem, setDefinirItem] = useState<any>(null);
  const [definirForm, setDefinirForm] = useState<any>({});

  // Dialog para cancelar conclusão de férias (ADM Master)
  const [showCancelarDialog, setShowCancelarDialog] = useState(false);
  const [cancelarItem, setCancelarItem] = useState<any>(null);
  const [cancelarMotivo, setCancelarMotivo] = useState("");

  // Dialog para reverter férias concluída → em gozo (todos)
  const [showReverterDialog, setShowReverterDialog] = useState(false);
  const [reverterItem, setReverterItem] = useState<any>(null);
  const [reverterMotivo, setReverterMotivo] = useState("");

  // Auto-prompt: confirmar início do gozo quando a data agendada chega.
  // Rev. 2098 — auto-prompt "Início de Férias" foi extraído pra componente
  // global `FeriasGozoPrompt`, montado em DashboardLayout para aparecer
  // instantaneamente em QUALQUER tela do módulo RH/DP (não só aqui).

  // Queries
  // Query SEPARADA para stats (sem filtro) — garante que os cards nunca mudem ao clicar filtros
  const { data: allFeriasList = [] } = trpc.avisoPrevio.ferias.list.useQuery(
    { companyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const { data: feriasList = [], refetch } = trpc.avisoPrevio.ferias.list.useQuery(
    { companyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const { data: alertas } = trpc.avisoPrevio.ferias.alertas.useQuery(
    { companyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );
  const { data: calendarioCompleto = [] } = trpc.avisoPrevio.ferias.calendarioCompleto.useQuery(
    { companyId, ano: anoCalendario, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: (isConstrutoras ? companyIds.length > 0 : companyId > 0) && tab === "calendario" }
  );
  const { data: fluxoCaixa = [] } = trpc.avisoPrevio.ferias.fluxoCaixa.useQuery(
    { companyId, ano: anoCalendario, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: (isConstrutoras ? companyIds.length > 0 : companyId > 0) && tab === "fluxo" }
  );
  const { data: vencidasAgrupadas = [], refetch: refetchVencidas } = trpc.avisoPrevio.ferias.listarVencidas.useQuery(
    { companyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: (isConstrutoras ? companyIds.length > 0 : companyId > 0) && tab === "vencidas" }
  );
  const { data: empList = [] } = trpc.employees.list.useQuery({ companyId, companyIds, excludeTerminated: true }, { enabled: !!companyId || companyIds?.length > 0 });
  const activeEmployees = useMemo(() => (empList as any[]).filter((e: any) => e.status === "Ativo" && !e.deletedAt), [empList]);

  // Rev. 2098 — bloco AUTO-PROMPT removido (movido pra FeriasGozoPrompt
  // global em DashboardLayout). O modal agora aparece em qualquer tela do
  // módulo RH, e não só nesta página.

  // Média de HE + DSR do período aquisitivo para cálculo de férias (Art. 142 CLT)
  const { data: mediaHEData, isLoading: mediaHELoading } = trpc.avisoPrevio.ferias.mediaHEFerias.useQuery(
    {
      employeeId: selectedItem?.employeeId ?? 0,
      companyId: selectedItem?.companyId ?? companyId,
      periodoAquisitivoInicio: selectedItem?.periodoAquisitivoInicio ?? "",
      periodoAquisitivoFim: selectedItem?.periodoAquisitivoFim ?? "",
    },
    { enabled: !!selectedItem?.employeeId && !!selectedItem?.periodoAquisitivoInicio }
  );

  // tRPC utils for invalidation
  const utils = trpc.useUtils();

  // Mutations
  const createFerias = trpc.avisoPrevio.ferias.create.useMutation({
    onSuccess: () => { refetch(); utils.obras.efetivoPorObra.invalidate(); toast.success("Férias registradas!"); setShowDialog(false); setForm({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateFerias = trpc.avisoPrevio.ferias.update.useMutation({
    onSuccess: () => { refetch(); utils.obras.efetivoPorObra.invalidate(); toast.success("Férias atualizadas!"); },
  });
  const removeReciboFerias = trpc.avisoPrevio.ferias.removeReciboFerias.useMutation({
    onSuccess: () => {
      setSelectedItem((prev: any) => prev ? { ...prev, reciboUrl: null, reciboNome: null } : prev);
      toast.success("Recibo removido.");
    },
    onError: () => toast.error("Erro ao remover recibo."),
  });
  const uploadReciboFerias = trpc.avisoPrevio.ferias.uploadReciboFerias.useMutation({
    onSuccess: (data: any) => {
      setSelectedItem((prev: any) => prev ? { ...prev, reciboUrl: data.url, reciboNome: data.nome } : prev);
      refetch();
      toast.success("Recibo anexado com sucesso!");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteFerias = trpc.avisoPrevio.ferias.delete.useMutation({
    onSuccess: () => { refetch(); utils.obras.efetivoPorObra.invalidate(); toast.success("Férias excluídas!"); },
  });
  const gerarPeriodos = trpc.avisoPrevio.ferias.gerarPeriodos.useMutation({
    onSuccess: (data: any) => { refetch(); toast.success(`${data.periodosGerados} período(s) gerado(s)!`); },
    onError: (e: any) => toast.error(e.message),
  });
  const gerarPeriodosTodos = trpc.avisoPrevio.ferias.gerarPeriodosTodos.useMutation({
    onSuccess: (data: any) => {
      refetch();
      refetchVencidas();
      toast.success(`${data.totalCriados} período(s) gerado(s) para ${data.funcionariosProcessados} funcionário(s)!`);
      if (data.funcionariosSemAdmissao > 0) {
        toast.warning(`${data.funcionariosSemAdmissao} funcionário(s) sem data de admissão foram ignorados.`);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });
  const confirmarVencidasLote = trpc.avisoPrevio.ferias.confirmarVencidasLote.useMutation({
    onSuccess: (data: any) => {
      refetch(); refetchVencidas();
      toast.success(`${data.confirmados} férias confirmada(s) como paga(s)!`);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const confirmarTodasVencidas = trpc.avisoPrevio.ferias.confirmarTodasVencidasFuncionario.useMutation({
    onSuccess: (data: any) => {
      refetch(); refetchVencidas();
      toast.success(`${data.confirmados} férias confirmada(s) como paga(s)!`);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const definirDataFerias = trpc.avisoPrevio.ferias.definirDataFerias.useMutation({
    onSuccess: async (data: any) => {
      await utils.avisoPrevio.ferias.invalidate();
      utils.obras.efetivoPorObra.invalidate();
      setShowDefinirDialog(false);
      setDefinirItem(null);
      setDefinirForm({});
      toast.success(data.foiAlterada ? "Data definida (alterada da sugerida)!" : "Data de férias definida!");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const cancelarConclusaoFerias = trpc.avisoPrevio.ferias.cancelarConclusaoFerias.useMutation({
    onSuccess: (data: any) => {
      refetch(); refetchVencidas();
      setShowCancelarDialog(false);
      setCancelarItem(null);
      setCancelarMotivo("");
      toast.success(`Conclusão cancelada! Status voltou para: ${data.novoStatus === 'vencida' ? 'Vencida' : 'Pendente'}`);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const reverterParaEmGozo = trpc.avisoPrevio.ferias.reverterParaEmGozo.useMutation({
    onSuccess: () => {
      refetch(); refetchVencidas();
      setShowReverterDialog(false);
      setReverterItem(null);
      setReverterMotivo("");
      toast.success("Férias revertidas para Em Gozo!");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const [showReverterEmGozoDialog, setShowReverterEmGozoDialog] = useState(false);
  const [reverterEmGozoItem, setReverterEmGozoItem] = useState<any>(null);
  const [reverterEmGozoMotivo, setReverterEmGozoMotivo] = useState("");
  const reverterEmGozo = trpc.avisoPrevio.ferias.reverterEmGozo.useMutation({
    onSuccess: (data: any) => {
      refetch(); refetchVencidas();
      utils.employees.list.invalidate();
      setShowReverterEmGozoDialog(false);
      setReverterEmGozoItem(null);
      setReverterEmGozoMotivo("");
      toast.success(`Férias revertidas! Status voltou para: ${data.novoStatus === 'agendada' ? 'Agendada' : 'Pendente'}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Employee search
  const [empSearch, setEmpSearch] = useState("");
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const selectedEmp = activeEmployees.find((e: any) => e.id === form.employeeId);
  const filteredEmps = useMemo(() => activeEmployees.filter((e: any) => {
    if (!empSearch) return true;
    const s = removeAccents(empSearch);
    const sDigits = s.replace(/\D/g, "");
    const codigo = (e.codigoInterno || "").toLowerCase();
    return removeAccents(e.nomeCompleto || "").includes(s) || (sDigits.length > 0 && (e.cpf || "").replace(/\D/g, "").includes(sDigits)) || codigo.includes(s);
  }), [activeEmployees, empSearch]);

  // Filtered list
  const filtered = useMemo(() => {
    const base = (feriasList as any[]).filter((a: any) => {
      if (search) {
        const s = removeAccents(search);
        if (!(a.employeeName || "").toLowerCase().includes(s) && !(a.employeeCpf || "").includes(s)) return false;
      }
      // Rev. 2666 — Filtro de status MULTI-SELEÇÃO (client-side). Vazio = todos.
      // Item passa se casar com QUALQUER status marcado (OR), incluindo as
      // opções compostas "Vencida 1º período" e "Vencida 2º período ou +".
      if (statusFilter.length > 0 && !statusFilter.some((sel) => matchStatusFiltro(a, sel))) return false;
      // Rev. 1614 — Filtro especial: 2º período cujo concessivo está/expira em 2026
      if (filtro2Periodo2026) {
        if ((a.numeroPeriodo || 1) < 2) return false;
        const ano = a.periodoConcessivoFim ? parseInt(String(a.periodoConcessivoFim).slice(0, 4), 10) : null;
        if (ano !== 2026) return false;
      }
      // Rev. 2652 — filtros extras
      if (cargoFilter !== "todos") {
        const c = a.employeeCargo || a.employeeFuncao || "";
        if (c !== cargoFilter) return false;
      }
      if (periodoFilter !== "todos") {
        const np = a.numeroPeriodo || 1;
        if (periodoFilter === "1" && np !== 1) return false;
        if (periodoFilter === "2mais" && np < 2) return false;
      }
      // Faixa de datas pelo Início do Gozo (datas ISO YYYY-MM-DD)
      if (inicioDe || inicioAte) {
        const di = a.dataInicio || "";
        if (!di) return false;
        if (inicioDe && di < inicioDe) return false;
        if (inicioAte && di > inicioAte) return false;
      }
      return true;
    });
    // Rev. 2652 — Ordenação configurável: nome, vencimento, início/fim do gozo,
    // pagamento, valor total e dias. Datas ISO (YYYY-MM-DD) → localeCompare; vazios por último.
    const arr = [...base];
    const cmpDate = (A: string, B: string, asc: boolean) => {
      if (!A && !B) return 0; if (!A) return 1; if (!B) return -1;
      return asc ? A.localeCompare(B) : B.localeCompare(A);
    };
    // cmpNum: valores ausentes (null/undefined/""/NaN) sempre por último (asc e desc).
    const cmpNum = (a: any, b: any, asc: boolean) => {
      const A = a === null || a === undefined || a === "" ? NaN : Number(a);
      const B = b === null || b === undefined || b === "" ? NaN : Number(b);
      const aNaN = Number.isNaN(A), bNaN = Number.isNaN(B);
      if (aNaN && bNaN) return 0; if (aNaN) return 1; if (bNaN) return -1;
      return asc ? A - B : B - A;
    };
    arr.sort((a, b) => {
      switch (sortBy) {
        case "alfa_asc":
          return removeAccents(a.employeeName || "").localeCompare(removeAccents(b.employeeName || ""));
        case "alfa_desc":
          return removeAccents(b.employeeName || "").localeCompare(removeAccents(a.employeeName || ""));
        case "venc_desc": return cmpDate(a.periodoConcessivoFim || "", b.periodoConcessivoFim || "", false);
        case "inicio_asc": return cmpDate(a.dataInicio || "", b.dataInicio || "", true);
        case "inicio_desc": return cmpDate(a.dataInicio || "", b.dataInicio || "", false);
        case "fim_asc": return cmpDate(a.dataFim || "", b.dataFim || "", true);
        case "fim_desc": return cmpDate(a.dataFim || "", b.dataFim || "", false);
        case "pgto_asc": return cmpDate(a.dataPagamento || "", b.dataPagamento || "", true);
        case "pgto_desc": return cmpDate(a.dataPagamento || "", b.dataPagamento || "", false);
        case "valor_asc": return cmpNum(a.valorTotal, b.valorTotal, true);
        case "valor_desc": return cmpNum(a.valorTotal, b.valorTotal, false);
        // diasGozo ausente → usa o mesmo fallback (30) que a tabela exibe (`f.diasGozo || 30`).
        case "dias_asc": return cmpNum(a.diasGozo || 30, b.diasGozo || 30, true);
        case "dias_desc": return cmpNum(a.diasGozo || 30, b.diasGozo || 30, false);
        case "venc_asc":
        default: return cmpDate(a.periodoConcessivoFim || "", b.periodoConcessivoFim || "", true);
      }
    });
    return arr;
  }, [feriasList, search, statusFilter, filtro2Periodo2026, sortBy, cargoFilter, periodoFilter, inicioDe, inicioAte]);

  // Rev. 2652 — lista de cargos distintos p/ o filtro (a partir da lista completa).
  const cargosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const a of allFeriasList as any[]) {
      const c = a.employeeCargo || a.employeeFuncao || "";
      if (c) set.add(c);
    }
    return Array.from(set).sort((x, y) => removeAccents(x).localeCompare(removeAccents(y)));
  }, [allFeriasList]);

  const filtrosAtivos = statusFilter.length > 0 || cargoFilter !== "todos" || periodoFilter !== "todos" || !!inicioDe || !!inicioAte || !!search;

  // Stats — calculados a partir da lista COMPLETA (sem filtro) para não mudar ao clicar nos cards
  const stats = useMemo(() => {
    const list = allFeriasList as any[];
    return {
      total: list.length,
      pendentes: list.filter(a => a.status === "pendente").length,
      agendadas: list.filter(a => a.status === "agendada").length,
      vencidas: list.filter(a => (a.status === "vencida" || a.vencida) && a.status !== "concluida" && a.status !== "cancelada").length,
      emGozo: list.filter(a => a.status === "em_gozo").length,
    };
  }, [allFeriasList]);

  // Calendar data grouped by employee
  const calendarioAgrupado = useMemo(() => {
    const map: Record<number, { employee: any; periodos: any[] }> = {};
    for (const row of calendarioCompleto as any[]) {
      if (!map[row.employeeId]) {
        map[row.employeeId] = {
          employee: { id: row.employeeId, nome: row.employeeName, cargo: row.employeeCargo, setor: row.employeeSetor },
          periodos: [],
        };
      }
      map[row.employeeId].periodos.push(row);
    }
    return Object.values(map);
  }, [calendarioCompleto]);

  const handleSubmit = () => {
    if (!form.employeeId || !form.periodoAquisitivoInicio || !form.periodoAquisitivoFim || !form.periodoConcessivoFim) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }
    createFerias.mutate({ companyId, companyIds, employeeId: form.employeeId,
      periodoAquisitivoInicio: form.periodoAquisitivoInicio,
      periodoAquisitivoFim: form.periodoAquisitivoFim,
      periodoConcessivoFim: form.periodoConcessivoFim,
      dataInicio: form.dataInicio || undefined,
      dataFim: form.dataFim || undefined,
      diasGozo: form.diasGozo || 30,
      fracionamento: form.fracionamento || 1,
      abonoPecuniario: form.abonoPecuniario || 0,
      observacoes: form.observacoes,
    });
  };

  const handleGerarPeriodos = (employeeId: number) => {
    gerarPeriodos.mutate({ companyId, companyIds, employeeId });
  };

  const handleDefinirData = (item: any) => {
    setDefinirItem(item);
    setDefinirForm({
      dataInicio: item.dataInicio || item.dataSugeridaInicio || "",
      dataFim: item.dataFim || item.dataSugeridaFim || "",
      diasGozo: item.diasGozo || 30,
      abonoPecuniario: item.abonoPecuniario || 0,
      observacoes: "",
    });
    setShowDefinirDialog(true);
  };

  const submitDefinirData = () => {
    if (!definirForm.dataInicio || !definirForm.dataFim) {
      toast.error("Preencha as datas");
      return;
    }
    definirDataFerias.mutate({
      id: definirItem.id,
      dataInicio: definirForm.dataInicio,
      dataFim: definirForm.dataFim,
      diasGozo: definirForm.diasGozo || 30,
      abonoPecuniario: definirForm.abonoPecuniario || 0,
      observacoes: definirForm.observacoes || undefined,
    });
  };

  // Helper: get color for calendar period
  const getCalendarColor = (periodo: any) => {
    const num = periodo.numeroPeriodo || 1;
    const isAlterado = periodo.dataAlteradaPeloRH;
    if (periodo.status === "concluida") return { bg: "bg-gray-300", text: "text-gray-700", label: "Concluída" };
    if (periodo.status === "em_gozo") return { bg: "bg-green-400", text: "text-green-800", label: "Em Gozo" };
    if (periodo.status === "vencida") return { bg: "bg-red-400", text: "text-red-800", label: "Vencida" };
    if (periodo.status === "cancelada") return { bg: "bg-gray-200", text: "text-gray-500", label: "Cancelada" };
    if (isAlterado) return { bg: "bg-purple-400", text: "text-purple-800", label: "Alterado RH" };
    // 1º período = azul, 2º+ = laranja
    if (num <= 1) return { bg: "bg-blue-400", text: "text-blue-800", label: "1º Período" };
    return { bg: "bg-orange-400", text: "text-orange-800", label: `${num}º Período` };
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Palmtree className="h-6 w-6 text-green-600" />
              Controle de Férias
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestão de férias conforme CLT Art. 129-145 — Períodos aquisitivos, concessivos e pagamentos
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => gerarPeriodosTodos.mutate({ companyId })}
              disabled={gerarPeriodosTodos.isPending}
              className="border-green-300 text-green-700 hover:bg-green-50"
            >
              {gerarPeriodosTodos.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Gerar Períodos de Todos
            </Button>
            <Button variant="outline" onClick={() => { setShowDialog(true); setForm({}); }}>
              <Plus className="h-4 w-4 mr-2" /> Registrar Férias
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {(() => {
          // Rev. 1614 — Cards de risco por período (1º e 2º) usam a lista
          // COMPLETA de pendentes, agrupada por numeroPeriodo. O recorte de 60
          // dias do prestesVencer dava 0 quase sempre (concessivos costumam
          // estar a 6-12 meses). O que importa para o RH é:
          //   • 1º Período pendente: férias a conceder dentro do prazo normal.
          //   • 2º Período pendente: funcionário JÁ acumulou 2 períodos não
          //     gozados — risco IMEDIATO de pagamento em dobro (CLT Art. 137).
          const pendentesList = (allFeriasList as any[]).filter(a => a.status === "pendente");
          const aVencer1 = pendentesList.filter(v => (v.numeroPeriodo || 1) === 1).length;
          const aVencer2 = pendentesList.filter(v => (v.numeroPeriodo || 1) >= 2).length;
          // Rev. 1614 — 2º Período cujo concessivo está dentro do ano de 2026
          // (qualquer status que ainda não foi concluído/cancelado).
          const segundoPeriodo2026 = (allFeriasList as any[]).filter(v => {
            if ((v.numeroPeriodo || 1) < 2) return false;
            if (v.status === "concluida" || v.status === "cancelada") return false;
            const ano = v.periodoConcessivoFim ? parseInt(String(v.periodoConcessivoFim).slice(0, 4), 10) : null;
            return ano === 2026;
          }).length;
          return (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <Card className={`cursor-pointer hover:shadow-md transition-shadow ${statusFilter.length === 0 && tab === "lista" && !filtro2Periodo2026 ? "ring-2 ring-primary shadow-md" : ""}`} onClick={() => { setStatusFilter([]); setFiltro2Periodo2026(false); setTab("lista"); }}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Total</p>
              <p className="text-2xl font-bold">{fmtNum(stats.total)}</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-amber-500 ${statusFilter.length === 1 && statusFilter[0] === "pendente" && tab === "lista" && !filtro2Periodo2026 ? "ring-2 ring-amber-400 shadow-md" : ""}`} onClick={() => { setStatusFilter(["pendente"]); setFiltro2Periodo2026(false); setTab("lista"); }}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Férias a Vencer</p>
              <p className="text-2xl font-bold text-amber-600">{fmtNum(stats.pendentes)}</p>
            </CardContent>
          </Card>
          {/* Rev. 1610 — Risco 1º período (próximos 60 dias do concessivo) */}
          <Card
            className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-amber-400 ${aVencer1 > 0 ? "bg-amber-50/60" : ""}`}
            onClick={() => { setTab("vencidas"); }}
            title="Funcionários cujo 1º período concessivo expira nos próximos 60 dias. Conceder antes do limite evita risco de pagamento em dobro (CLT Art. 137)."
          >
            <CardContent className="p-4">
              <p className="text-[10px] text-amber-700 font-semibold uppercase tracking-wide flex items-center gap-1">
                <Clock className="h-3 w-3" /> A Vencer · 1º Período
              </p>
              <p className="text-2xl font-bold text-amber-700">{fmtNum(aVencer1)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Pendentes a conceder</p>
            </CardContent>
          </Card>
          {/* Rev. 1610 — Risco 2º período (acumulado — risco de multa em dobro) */}
          <Card
            className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-orange-600 ${aVencer2 > 0 ? "bg-orange-50/70" : ""}`}
            onClick={() => { setTab("vencidas"); }}
            title="Funcionários com 2º período acumulado a vencer nos próximos 60 dias. Risco IMEDIATO de pagamento em dobro caso o concessivo expire (CLT Art. 137)."
          >
            <CardContent className="p-4">
              <p className="text-[10px] text-orange-800 font-semibold uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> A Vencer · 2º Período
              </p>
              <p className="text-2xl font-bold text-orange-700">{fmtNum(aVencer2)}</p>
              <p className="text-[10px] text-orange-600 mt-0.5 font-medium">Risco multa em dobro</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-blue-500 ${statusFilter.length === 1 && statusFilter[0] === "agendada" && tab === "lista" && !filtro2Periodo2026 ? "ring-2 ring-blue-400 shadow-md" : ""}`} onClick={() => { setStatusFilter(["agendada"]); setFiltro2Periodo2026(false); setTab("lista"); }}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Agendadas</p>
              <p className="text-2xl font-bold text-blue-600">{fmtNum(stats.agendadas)}</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-red-500 ${statusFilter.length === 1 && statusFilter[0] === "vencida" && tab === "lista" && !filtro2Periodo2026 ? "ring-2 ring-red-400 shadow-md" : ""}`} onClick={() => { setStatusFilter(["vencida"]); setFiltro2Periodo2026(false); setTab("lista"); }}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Vencidas</p>
              <p className="text-2xl font-bold text-red-600">{fmtNum(stats.vencidas)}</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-green-500 ${statusFilter.length === 1 && statusFilter[0] === "em_gozo" && tab === "lista" && !filtro2Periodo2026 ? "ring-2 ring-green-400 shadow-md" : ""}`} onClick={() => { setStatusFilter(["em_gozo"]); setFiltro2Periodo2026(false); setTab("lista"); }}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Em Gozo</p>
              <p className="text-2xl font-bold text-green-600">{fmtNum(stats.emGozo)}</p>
            </CardContent>
          </Card>
          {/* Rev. 1614 — Card especial: 2º Período com concessivo no ano 2026 */}
          <Card
            className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-rose-600 ${filtro2Periodo2026 ? "ring-2 ring-rose-400 shadow-md bg-rose-50/70" : (segundoPeriodo2026 > 0 ? "bg-rose-50/40" : "")}`}
            onClick={() => { setStatusFilter([]); setFiltro2Periodo2026(true); setTab("lista"); }}
            title="Funcionários no 2º período aquisitivo cujo prazo concessivo cai dentro do ano de 2026. Clique para filtrar a lista."
          >
            <CardContent className="p-4">
              <p className="text-[10px] text-rose-800 font-semibold uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> 2º Período · 2026
              </p>
              <p className="text-2xl font-bold text-rose-700">{fmtNum(segundoPeriodo2026)}</p>
              <p className="text-[10px] text-rose-600 mt-0.5 font-medium">Concessivo expira em 2026</p>
            </CardContent>
          </Card>
        </div>
          );
        })()}

        {/* Alerts */}
        {alertas && (() => {
          const vencidas1 = (alertas.vencidas || []).filter((v: any) => (v.numeroPeriodo || 1) === 1);
          const vencidas2 = (alertas.vencidas || []).filter((v: any) => (v.numeroPeriodo || 1) >= 2);
          const prestes2 = (alertas.prestesVencer || []).filter((v: any) => (v.numeroPeriodo || 1) >= 2);
          const prestes1 = (alertas.prestesVencer || []).filter((v: any) => (v.numeroPeriodo || 1) === 1);
          const hasAny = vencidas1.length > 0 || vencidas2.length > 0 || prestes2.length > 0 || prestes1.length > 0;
          if (!hasAny) return null;
          return (
            <div className="grid grid-cols-2 gap-2">
              {vencidas1.length > 0 && <AlertCard icon={AlertTriangle} count={vencidas1.length} title="Férias Vencidas — 1º Período Concessivo Expirado (Art. 134 CLT)" items={vencidas1} borderClass="border-l-red-500" numClass="text-red-700" nameClass="text-red-700" dateClass="text-red-500" onSelectEmployee={setGanttEmployeeId} />}
              {vencidas2.length > 0 && <AlertCard icon={AlertTriangle} count={vencidas2.length} title="Férias Vencidas — 2º Período Expirado — Risco de Pagamento em Dobro" items={vencidas2} borderClass="border-l-red-700" numClass="text-red-800" nameClass="text-red-800" dateClass="text-red-600" onSelectEmployee={setGanttEmployeeId} />}
              {prestes1.length > 0 && <AlertCard icon={Clock} count={prestes1.length} title="Prestes a Vencer — 1º Período (próximos 60 dias)" items={prestes1} borderClass="border-l-amber-400" numClass="text-amber-700" nameClass="text-amber-700" dateClass="text-amber-500" onSelectEmployee={setGanttEmployeeId} />}
              {prestes2.length > 0 && <AlertCard icon={Clock} count={prestes2.length} title="Prestes a Vencer — 2º Período (próximos 60 dias)" items={prestes2} borderClass="border-l-orange-500" numClass="text-orange-700" nameClass="text-orange-700" dateClass="text-orange-500" onSelectEmployee={setGanttEmployeeId} />}
            </div>
          );
        })()}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="lista"><Users className="h-4 w-4 mr-1" /> Lista de Férias</TabsTrigger>
            <TabsTrigger value="vencidas" className="relative">
              <AlertTriangle className="h-4 w-4 mr-1" /> Férias Vencidas
              {stats.vencidas > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 min-w-5 flex items-center justify-center px-1">{stats.vencidas}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="calendario"><CalendarDays className="h-4 w-4 mr-1" /> Calendário</TabsTrigger>
            <TabsTrigger value="fluxo"><TrendingUp className="h-4 w-4 mr-1" /> Fluxo de Caixa</TabsTrigger>
          </TabsList>

          {/* ===== ABA: LISTA ===== */}
          <TabsContent value="lista">
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
                </div>
                {/* Rev. 2666 — Filtro de status MULTI-SELEÇÃO (popover c/ checkboxes). */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-56 justify-between font-normal">
                      <span className="truncate">
                        {statusFilter.length === 0
                          ? "Todos os status"
                          : statusFilter.length === 1
                            ? (STATUS_OPCOES.find((o) => o.value === statusFilter[0])?.label || "1 selecionado")
                            : `${statusFilter.length} status selecionados`}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="start">
                    <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b">
                      <span className="text-xs font-medium text-muted-foreground">Filtrar por status</span>
                      {statusFilter.length > 0 && (
                        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setStatusFilter([])}>Limpar</button>
                      )}
                    </div>
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full px-1 py-1.5 rounded hover:bg-muted text-sm text-left"
                      onClick={() => setStatusFilter([])}
                    >
                      <Checkbox checked={statusFilter.length === 0} className="pointer-events-none" />
                      <span>Todos</span>
                    </button>
                    {STATUS_OPCOES.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        className="flex items-center gap-2 w-full px-1 py-1.5 rounded hover:bg-muted text-sm text-left"
                        onClick={() => setStatusFilter((prev) => prev.includes(o.value) ? prev.filter((v) => v !== o.value) : [...prev, o.value])}
                      >
                        <Checkbox checked={statusFilter.includes(o.value)} className="pointer-events-none" />
                        <span>{o.label}</span>
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
                {/* Rev. 2652 — Ordenação ampliada */}
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                  <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Ordenar por" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alfa_asc">Nome — A → Z</SelectItem>
                    <SelectItem value="alfa_desc">Nome — Z → A</SelectItem>
                    <SelectItem value="venc_asc">Vencimento — vence primeiro</SelectItem>
                    <SelectItem value="venc_desc">Vencimento — vence por último</SelectItem>
                    <SelectItem value="inicio_asc">Início Gozo — inicia primeiro</SelectItem>
                    <SelectItem value="inicio_desc">Início Gozo — inicia por último</SelectItem>
                    <SelectItem value="fim_asc">Fim Gozo — mais cedo</SelectItem>
                    <SelectItem value="fim_desc">Fim Gozo — mais tarde</SelectItem>
                    <SelectItem value="pgto_asc">Pagamento — mais cedo</SelectItem>
                    <SelectItem value="pgto_desc">Pagamento — mais tarde</SelectItem>
                    <SelectItem value="valor_asc">Valor Total — menor</SelectItem>
                    <SelectItem value="valor_desc">Valor Total — maior</SelectItem>
                    <SelectItem value="dias_asc">Dias — menos</SelectItem>
                    <SelectItem value="dias_desc">Dias — mais</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Rev. 2652 — Filtros extras: cargo, período aquisitivo e faixa de início do gozo */}
              <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground px-1">Cargo</label>
                  <Select value={cargoFilter} onValueChange={setCargoFilter}>
                    <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Cargo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os cargos</SelectItem>
                      {cargosDisponiveis.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground px-1">Período</label>
                  <Select value={periodoFilter} onValueChange={(v) => setPeriodoFilter(v as any)}>
                    <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Período" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os períodos</SelectItem>
                      <SelectItem value="1">1º período</SelectItem>
                      <SelectItem value="2mais">2º período ou +</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground px-1">Início Gozo — de</label>
                  <Input type="date" value={inicioDe} onChange={e => setInicioDe(e.target.value)} className="w-full sm:w-40" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground px-1">Início Gozo — até</label>
                  <Input type="date" value={inicioAte} onChange={e => setInicioAte(e.target.value)} className="w-full sm:w-40" />
                </div>
                {filtrosAtivos && (
                  <Button variant="ghost" className="text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter([]); setCargoFilter("todos"); setPeriodoFilter("todos"); setInicioDe(""); setInicioAte(""); }}>
                    <X className="h-4 w-4 mr-1" /> Limpar filtros
                  </Button>
                )}
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="p-3 text-left font-medium">Colaborador</th>
                        <th className="p-3 text-left font-medium">Período Aquisitivo</th>
                        <th className="p-3 text-left font-medium">Concessivo Até</th>
                        <th className="p-3 text-left font-medium">Início Gozo</th>
                        <th className="p-3 text-left font-medium">Fim Gozo</th>
                        <th className="p-3 text-center font-medium">Dias</th>
                        <th className="p-3 text-right font-medium">Valor Total</th>
                        <th className="p-3 text-right font-medium">Valor Líquido</th>
                        <th className="p-3 text-left font-medium">Pagamento</th>
                        <th className="p-3 text-center font-medium">Status</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={11} className="py-12 text-center text-muted-foreground">Nenhuma férias encontrada</td></tr>
                      ) : filtered.map((f: any) => {
                        const st = STATUS_LABELS[f.status] || STATUS_LABELS.pendente;
                        const estaVencidaOuExpirada = (f.vencida || f.status === "vencida") && f.status !== "concluida";
                        // Vermelho apenas no 2º período (ou superior) — 1º período não exige alerta vermelho
                        const isVencida = estaVencidaOuExpirada && (f.numeroPeriodo || 1) >= 2;
                        const isPrimeiroVencido = estaVencidaOuExpirada && (f.numeroPeriodo || 1) < 2;
                        // Rev. 1703 — flag "perdeu direito" (≥180 dias afastado, CLT Art. 133 IV)
                        // calculada uma vez por linha p/ reuso no badge e nos botões.
                        const _isAfast = f.employeeStatus === 'Afastado' || f.employeeStatus === 'Licenca' || f.employeeStatus === 'Licença';
                        let _diasAfast = 0;
                        if (_isAfast && f.employeeLicencaDataInicio) {
                          const _ini = new Date(f.employeeLicencaDataInicio + 'T00:00:00');
                          if (!isNaN(_ini.getTime())) _diasAfast = Math.max(0, Math.floor((Date.now() - _ini.getTime()) / 86400000));
                        }
                        const perdeuFerias = _isAfast && _diasAfast >= 180;
                        return (
                          <tr key={f.id} className={`border-b last:border-0 hover:bg-muted/20 ${isVencida ? "bg-red-50/50" : isPrimeiroVencido ? "bg-amber-50/40" : ""}`}>
                            <td className="p-3">
                              <div className="flex items-center gap-2.5">
                                <PersonPhoto src={f.employeeFotoUrl} alt={f.employeeName} size="sm" />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className="font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setGanttEmployeeId(f.employeeId)}>{f.employeeName}</div>
                                    {perdeuFerias && (
                                      <Badge
                                        className="bg-pink-100 text-pink-700 border border-pink-300 text-[10px] gap-1"
                                        title={`Afastado há ${_diasAfast} dias (desde ${formatDate(f.employeeLicencaDataInicio)}). Conforme Art. 133, IV da CLT, o empregado que recebe auxílio-doença/INSS por mais de 6 meses (mesmo descontínuos) dentro do período aquisitivo perde o direito às férias daquele período. Reinicia a contagem após o retorno.`}
                                      >
                                        <AlertTriangle className="h-3 w-3" /> Direito de férias perdido — afastado há {_diasAfast} dias (Art. 133, IV CLT)
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">{f.employeeCargo || f.employeeFuncao || "-"}</div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-xs">{formatDate(f.periodoAquisitivoInicio)} a {formatDate(f.periodoAquisitivoFim)}</td>
                            <td className="p-3">
                              <span className={isVencida ? "text-red-600 font-semibold" : isPrimeiroVencido ? "text-amber-600 font-semibold" : ""} title="Data limite p/ iniciar o gozo (30 dias antes do próximo período aquisitivo)">{formatDate(dataLimiteInicioGozoFerias(f.periodoConcessivoFim))}</span>
                              {isVencida && <Badge variant="destructive" className="ml-1 text-[10px]">VENCIDA</Badge>}
                              {isPrimeiroVencido && <Badge className="ml-1 text-[10px] bg-amber-100 text-amber-700 border border-amber-300">VENCIDA</Badge>}
                            </td>
                            <td className="p-3">{formatDate(f.dataInicio)}</td>
                            <td className="p-3">{formatDate(f.dataFim)}</td>
                            <td className="p-3 text-center font-semibold">{f.diasGozo || 30}</td>
                            <td className="p-3 text-right font-semibold">{formatMoeda(f.valorTotal)}</td>
                            <td className="p-3 text-right font-semibold text-green-700">
                              {f.valorLiquido ? formatMoeda(f.valorLiquido) : <span className="text-muted-foreground font-normal">-</span>}
                            </td>
                            <td className="p-3 text-xs">{formatDate(f.dataPagamento)}</td>
                            <td className="p-3 text-center">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                              {f.status === "agendada" && f.dataAgendamento && (
                                <div className="text-[10px] text-muted-foreground mt-1" title="Data em que as férias foram agendadas">
                                  Agendada em {formatDate(String(f.dataAgendamento).slice(0, 10))}
                                </div>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                {(f.status === "pendente" || f.status === "vencida" || f.status === "em_gozo" || f.status === "agendada") && !perdeuFerias && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" title="Editar período de férias" onClick={() => handleDefinirData(f)}>
                                    <PenLine className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {(f.status === "agendada" || f.status === "pendente" || f.status === "vencida") && !perdeuFerias && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-green-700 hover:bg-green-50 font-medium text-xs" title="Marcar como Em Gozo" onClick={() => {
                                    if (confirm(`Confirmar que ${f.employeeName} está em gozo de férias?`)) {
                                      updateFerias.mutate({ id: f.id, status: "em_gozo" });
                                    }
                                  }}>
                                    <Play className="h-3.5 w-3.5 mr-1" /> Iniciar Gozo
                                  </Button>
                                )}
                                {/* Rev. 1703 — Direito perdido (Art. 133 IV CLT): único botão é Concluir,
                                    sem passar por agendamento/em gozo. Encerra o período aquisitivo. */}
                                {perdeuFerias && f.status !== "concluida" && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-pink-700 hover:bg-pink-50 font-medium text-xs border border-pink-200" title="Concluir período (direito perdido por afastamento >180d — Art. 133 IV CLT)" onClick={() => {
                                    if (confirm(`${f.employeeName} está afastado há ${_diasAfast} dias. Pelo Art. 133, IV da CLT, o direito de gozo deste período aquisitivo foi PERDIDO. Confirmar conclusão (encerramento) deste período sem pagamento de gozo?`)) {
                                      updateFerias.mutate({ id: f.id, status: "concluida" });
                                    }
                                  }}>
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Concluir
                                  </Button>
                                )}
                                {f.status === "em_gozo" && !perdeuFerias && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-700 hover:bg-gray-100 font-medium text-xs" title="Concluir Férias" onClick={() => {
                                    if (confirm(`Confirmar conclusão das férias de ${f.employeeName}?`)) {
                                      updateFerias.mutate({ id: f.id, status: "concluida" });
                                    }
                                  }}>
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Concluir
                                  </Button>
                                )}
                                {f.status === "em_gozo" && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:bg-red-50 font-medium text-xs" title="Reverter Em Gozo (cancelar / erro)" onClick={() => {
                                    setReverterEmGozoItem(f);
                                    setReverterEmGozoMotivo("");
                                    setShowReverterEmGozoDialog(true);
                                  }}>
                                    <Undo2 className="h-3.5 w-3.5 mr-1" /> Reverter
                                  </Button>
                                )}
                                {f.status === "concluida" && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-600 hover:bg-blue-50 font-medium text-xs" title="Reverter para Em Gozo" onClick={() => {
                                    setReverterItem(f);
                                    setReverterMotivo("");
                                    setShowReverterDialog(true);
                                  }}>
                                    <Undo2 className="h-3.5 w-3.5 mr-1" /> Reverter
                                  </Button>
                                )}
                                {f.status === "concluida" && isMaster && (
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-orange-600 hover:bg-orange-50 font-medium text-xs" title="Cancelar Conclusão por completo (ADM Master)" onClick={() => {
                                    setCancelarItem(f);
                                    setCancelarMotivo("");
                                    setShowCancelarDialog(true);
                                  }}>
                                    <Undo2 className="h-3.5 w-3.5 mr-1" /> Cancelar
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Detalhes" onClick={() => { setSelectedItem(f); setShowDetailDialog(true); }}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== ABA: FÉRIAS VENCIDAS ===== */}
          <TabsContent value="vencidas">
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-red-800">Férias Vencidas — Confirmação de Pagamento</h3>
                    <p className="text-sm text-red-700 mt-1">
                      Funcionários antigos podem ter férias vencidas que já foram pagas antes do sistema.
                      Confirme com <strong>1 clique</strong> se o período já foi pago, ou confirme <strong>todos de uma vez</strong> por funcionário.
                    </p>
                  </div>
                </div>
              </div>

              {(() => {
                // Rev. 1704 — Aba Vencidas (confirmar pagamento) deve ESCONDER
                // colaboradores que perderam o direito por afastamento >180 dias
                // (CLT Art. 133, IV). Não há pagamento a confirmar nesses casos.
                // Encerramento desses períodos é feito pela aba principal via
                // botão rosa "Concluir" (Rev. 1703).
                const _vencidasFiltradas = (vencidasAgrupadas as any[]).filter(
                  (g: any) => !g?.employee?.perdeuFeriasPorAfastamento
                );
                return _vencidasFiltradas.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30 text-green-500" />
                  <p className="text-lg font-medium">Nenhuma férias vencida pendente!</p>
                  <p className="text-sm mt-1">Todos os períodos estão em dia ou já foram confirmados.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Botão confirmar TODAS de todos */}
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      className="border-green-300 text-green-700 hover:bg-green-50"
                      onClick={() => {
                        const allIds = _vencidasFiltradas.flatMap((g: any) => g.periodos.map((p: any) => p.id));
                        if (allIds.length === 0) return;
                        if (confirm(`Confirmar TODAS as ${allIds.length} férias vencidas como pagas?`)) {
                          confirmarVencidasLote.mutate({ ids: allIds, observacao: "Confirmação em lote geral" });
                        }
                      }}
                      disabled={confirmarVencidasLote.isPending}
                    >
                      {confirmarVencidasLote.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCheck className="h-4 w-4 mr-2" />}
                      Confirmar Todas como Pagas
                    </Button>
                  </div>

                  {_vencidasFiltradas.map((grupo: any) => (
                    <Card key={grupo.employee.id} className="border-l-4 border-l-red-400">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <PersonPhoto src={grupo.employee.fotoUrl} alt={grupo.employee.nome} size="md" />
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-blue-700 cursor-pointer hover:underline" onClick={() => setGanttEmployeeId(grupo.employee.id)}>
                                  {grupo.employee.nome}
                                </p>
                                {/* Rev. 1694 — Tag de perda do direito a férias por afastamento >180 dias (CLT Art. 133, IV) */}
                                {grupo.employee.perdeuFeriasPorAfastamento && (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border bg-rose-50 text-rose-700 border-rose-300"
                                    title={`Afastado há ${grupo.employee.diasAfastado} dias (desde ${formatDate(grupo.employee.licencaDataInicio)}). Conforme Art. 133, IV da CLT, o empregado que recebe auxílio-doença/INSS por mais de 6 meses (mesmo descontínuos) dentro do período aquisitivo perde o direito às férias daquele período. Reinicia a contagem após o retorno.`}
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    Direito de férias perdido — afastado há {grupo.employee.diasAfastado} dias (Art. 133, IV CLT)
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {grupo.employee.cargo} · CPF: {formatCPF(grupo.employee.cpf)} · Admissão: {formatDate(grupo.employee.dataAdmissao)}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-green-300 text-green-700 hover:bg-green-50"
                            onClick={() => {
                              if (confirm(`Confirmar TODOS os ${grupo.periodos.length} períodos de ${grupo.employee.nome} como pagos?`)) {
                                confirmarTodasVencidas.mutate({ companyId, companyIds, employeeId: grupo.employee.id });
                              }
                            }}
                            disabled={confirmarTodasVencidas.isPending}
                          >
                            <CheckCheck className="h-3.5 w-3.5 mr-1" />
                            Confirmar Todos ({grupo.periodos.length})
                          </Button>
                        </div>

                        <div className="grid gap-2">
                          {grupo.periodos.map((p: any) => (
                            <div key={p.id} className="flex items-center justify-between bg-red-50/50 rounded-lg px-3 py-2 border border-red-100">
                              <div className="flex items-center gap-3">
                                <div className="text-center bg-red-100 rounded-lg px-2 py-1 min-w-[60px]">
                                  <p className="text-[10px] text-red-600 font-medium">Período</p>
                                  <p className="text-sm font-bold text-red-700">{p.numeroPeriodo || "?"}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium">
                                    {formatDate(p.periodoAquisitivoInicio)} <ArrowRight className="inline h-3 w-3 mx-1" /> {formatDate(p.periodoAquisitivoFim)}
                                  </p>
                                  <p className="text-xs text-muted-foreground" title="Data limite p/ iniciar o gozo (30 dias antes do próximo período aquisitivo)">Concessivo até: {formatDate(dataLimiteInicioGozoFerias(p.periodoConcessivoFim))}</p>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => confirmarVencidasLote.mutate({ ids: [p.id] })}
                                disabled={confirmarVencidasLote.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Já foi pago ✓
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
              })()}
            </div>
          </TabsContent>

          {/* ===== ABA: CALENDÁRIO ===== */}
          <TabsContent value="calendario">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <CardTitle className="text-base">Calendário de Férias — {anoCalendario}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setAnoCalendario(a => a - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-semibold text-lg w-16 text-center">{anoCalendario}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setAnoCalendario(a => a + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {/* Legenda */}
                <div className="flex flex-wrap gap-3 mt-3">
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-6 rounded bg-blue-400" />
                    <span>1º Período</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-6 rounded bg-orange-400" />
                    <span>2º+ Período</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-6 rounded bg-purple-400" />
                    <span className="flex items-center gap-0.5">Alterado pelo RH <PenLine className="h-3 w-3" /></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-6 rounded bg-green-400" />
                    <span>Em Gozo</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-6 rounded bg-red-400" />
                    <span>Vencida</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-6 rounded bg-gray-300" />
                    <span>Concluída</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-3 rounded-full border-2 border-dashed border-blue-400" />
                    <span>Data Sugerida</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {calendarioAgrupado.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhuma férias encontrada para {anoCalendario}</p>
                    <p className="text-sm mt-2">Clique em <strong>"Gerar Períodos de Todos"</strong> para calcular automaticamente.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="p-2 text-left font-medium min-w-[180px]">Colaborador</th>
                          {MESES.map(m => <th key={m} className="p-1 text-center font-medium text-xs min-w-[60px]">{m}</th>)}
                          <th className="p-2 text-center font-medium text-xs min-w-[80px]">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calendarioAgrupado.map((grupo: any) => (
                          <tr key={grupo.employee.id} className="border-b last:border-0 hover:bg-muted/10">
                            <td className="p-2">
                              <div className="font-medium text-blue-700 cursor-pointer hover:underline text-xs" onClick={() => setGanttEmployeeId(grupo.employee.id)}>
                                {grupo.employee.nome}
                              </div>
                              <div className="text-[10px] text-muted-foreground">{grupo.employee.cargo}</div>
                            </td>
                            {MESES.map((_, mesIdx) => {
                              // Find periods that overlap this month
                              const periodosMes = grupo.periodos.filter((p: any) => {
                                const inicio = p.dataInicio || p.dataSugeridaInicio;
                                const fim = p.dataFim || p.dataSugeridaFim;
                                if (!inicio && !fim) {
                                  // Fallback: use concessivo fim
                                  const conc = p.periodoConcessivoFim ? new Date(p.periodoConcessivoFim + 'T00:00:00') : null;
                                  if (conc) {
                                    const concMonth = conc.getMonth();
                                    const concYear = conc.getFullYear();
                                    return concYear === anoCalendario && concMonth === mesIdx;
                                  }
                                  return false;
                                }
                                const dInicio = new Date(inicio + 'T00:00:00');
                                const dFim = new Date(fim + 'T00:00:00');
                                const mesStart = new Date(anoCalendario, mesIdx, 1);
                                const mesEnd = new Date(anoCalendario, mesIdx + 1, 0);
                                return dInicio <= mesEnd && dFim >= mesStart;
                              });

                              if (periodosMes.length === 0) return <td key={mesIdx} className="p-1" />;

                              return (
                                <td key={mesIdx} className="p-1">
                                  {periodosMes.map((p: any) => {
                                    const color = getCalendarColor(p);
                                    const isSugerida = !p.dataInicio && p.dataSugeridaInicio;
                                    return (
                                      <div
                                        key={p.id}
                                        className={`h-5 rounded text-[9px] font-medium flex items-center justify-center cursor-pointer mb-0.5 ${
                                          isSugerida
                                            ? `border-2 border-dashed ${color.bg.replace('bg-', 'border-')} bg-opacity-30 ${color.text}`
                                            : `${color.bg} text-white`
                                        }`}
                                        title={`${grupo.employee.nome}\n${color.label}\n${p.dataInicio ? 'Definido' : 'Sugerido'}: ${formatDate(p.dataInicio || p.dataSugeridaInicio)} - ${formatDate(p.dataFim || p.dataSugeridaFim)}${p.dataAlteradaPeloRH ? '\n⚠️ Data alterada pelo RH' : ''}`}
                                        onClick={() => handleDefinirData(p)}
                                      >
                                        {p.dataAlteradaPeloRH ? (
                                          <PenLine className="h-3 w-3" />
                                        ) : isSugerida ? (
                                          <span className="opacity-60">?</span>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </td>
                              );
                            })}
                            <td className="p-2 text-center">
                              {grupo.periodos.some((p: any) => p.status === 'pendente' || p.status === 'vencida') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px] text-blue-600"
                                  onClick={() => {
                                    const first = grupo.periodos.find((p: any) => p.status === 'pendente' || p.status === 'vencida');
                                    if (first) handleDefinirData(first);
                                  }}
                                >
                                  <PenLine className="h-3 w-3 mr-0.5" /> Definir
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== ABA: FLUXO DE CAIXA ===== */}
          <TabsContent value="fluxo">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    Fluxo de Caixa Prévio — {anoCalendario}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setAnoCalendario(a => a - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="font-semibold text-lg w-16 text-center">{anoCalendario}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setAnoCalendario(a => a + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {(fluxoCaixa as any[]).map((m: any) => (
                    <div
                      key={m.mes}
                      className={`rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] ${m.totalFuncionarios > 0 ? "bg-green-50 border-green-200 hover:border-green-400" : "bg-muted/20 hover:border-muted-foreground/30"}`}
                      onClick={() => { setFluxoMesSelecionado(m); setShowFluxoMesDialog(true); }}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{m.nomeMes}</p>
                        <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      </div>
                      <p className="text-2xl font-bold mt-1">{formatMoeda(m.valorTotal)}</p>
                      {m.totalFuncionarios > 0 && (
                        <>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            <p>Salário: {formatMoeda(m.totalSalarioBase)} | 1/3: {formatMoeda(m.totalTercoConstitucional)}</p>
                          </div>
                          {/* Rev. 1879: chip Pago / A Pagar — visível só quando há diferenciação */}
                          {(m.qtdPagos > 0 || parseFloat(m.totalPago || "0") > 0) && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                              <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0 font-semibold">
                                ✓ Pago: {formatMoeda(m.totalPago)} <span className="font-normal opacity-80 ml-1">({m.qtdPagos})</span>
                              </Badge>
                              {parseFloat(m.totalAPagar || "0") > 0 && (
                                <Badge className="bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0 font-semibold">
                                  A pagar: {formatMoeda(m.totalAPagar)} <span className="font-normal opacity-80 ml-1">({m.qtdAPagar})</span>
                                </Badge>
                              )}
                            </div>
                          )}
                          {/* Breakdown por período */}
                          {(parseFloat(m.totalPrimeiroPeriodo || "0") > 0 || parseFloat(m.totalSegundoPeriodoMais || "0") > 0) && (
                            <div className="mt-1.5 space-y-0.5">
                              {parseFloat(m.totalPrimeiroPeriodo || "0") > 0 && (
                                <div className="flex items-center justify-between text-[10px] bg-blue-50 rounded px-1.5 py-0.5 border border-blue-200">
                                  <span className="text-blue-700 font-medium">1º Período <span className="font-normal text-blue-500">({m.qtdFuncionarios1p} func.) ↔ pode prorrogar</span></span>
                                  <span className="font-bold text-blue-800">{formatMoeda(m.totalPrimeiroPeriodo)}</span>
                                </div>
                              )}
                              {parseFloat(m.totalSegundoPeriodoMais || "0") > 0 && (
                                <div className="flex items-center justify-between text-[10px] bg-red-50 rounded px-1.5 py-0.5 border border-red-200">
                                  <span className="text-red-700 font-medium">2º+ Período <span className="font-normal text-red-500">({m.qtdFuncionarios2p} func.) ✕ sem prorrogação</span></span>
                                  <span className="font-bold text-red-800">{formatMoeda(m.totalSegundoPeriodoMais)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{m.totalFuncionarios} funcionário(s)</p>
                      {m.funcionarios?.slice(0, 3).map((f: any) => (
                        <div key={f.id + "_" + f.numeroPeriodo} className={`mt-1.5 text-xs border-t pt-1 ${f.pago ? "opacity-70" : ""}`}>
                          <span className={`font-medium ${f.pago ? "line-through decoration-emerald-500/60" : ""}`}>{f.nome}</span>
                          <span className="text-muted-foreground ml-1">{formatMoeda(f.valorEstimado)}</span>
                          <span className="text-[9px] ml-1 text-slate-400">{f.numeroPeriodo}º per.</span>
                          {/* Rev. 1879: PAGO tem prioridade visual sobre VENCIDA */}
                          {f.pago ? (
                            <Badge className="ml-1 text-[9px] bg-emerald-600 text-white hover:bg-emerald-600">✓ PAGO</Badge>
                          ) : f.vencida ? (
                            <Badge variant="destructive" className="ml-1 text-[9px]">VENCIDA</Badge>
                          ) : null}
                        </div>
                      ))}
                      <p className="text-[10px] text-muted-foreground mt-2 text-center opacity-60">Clique para detalhes</p>
                    </div>
                  ))}
                </div>
                {(fluxoCaixa as any[]).length > 0 && (
                  <>
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-blue-700">Salário Base (antecipado):</span>
                      <span className="text-base font-semibold text-blue-700">
                        {formatMoeda((fluxoCaixa as any[]).reduce((sum: number, m: any) => sum + parseFloat(m.totalSalarioBase || "0"), 0))}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-orange-600">1/3 Constitucional (custo adicional):</span>
                      <span className="text-base font-semibold text-orange-600">
                        {formatMoeda((fluxoCaixa as any[]).reduce((sum: number, m: any) => sum + parseFloat(m.totalTercoConstitucional || "0"), 0))}
                      </span>
                    </div>
                    <div className="border-t border-blue-200 pt-2 flex justify-between items-center">
                      <span className="font-semibold text-blue-800">Total Geral Estimado Anual:</span>
                      <span className="text-xl font-bold text-blue-800">
                        {formatMoeda((fluxoCaixa as any[]).reduce((sum: number, m: any) => sum + parseFloat(m.valorTotal || "0"), 0))}
                      </span>
                    </div>
                  </div>

                  {(() => {
                    const dados = fluxoCaixa as any[];
                    const maxVal = Math.max(...dados.map((m: any) => parseFloat(m.valorTotal || "0")), 1);
                    // Rev. 1879: gráfico mensal agora é barra empilhada — verde (pago) + âmbar (a pagar).
                    return (
                      <div className="mt-6">
                        <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center justify-between">
                          <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Visualização Mensal — Pago vs A Pagar</span>
                          <span className="flex items-center gap-3 text-[10px] font-normal">
                            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-emerald-500" />Pago</span>
                            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-amber-400" />A pagar</span>
                          </span>
                        </h4>
                        <div className="flex items-end gap-2 h-48 border-b border-gray-200 pb-1">
                          {dados.map((m: any) => {
                            const val = parseFloat(m.valorTotal || "0");
                            const valPago = parseFloat(m.totalPago || "0");
                            const valAPagar = parseFloat(m.totalAPagar || "0");
                            const pctTotal = maxVal > 0 ? (val / maxVal) * 100 : 0;
                            const pctPago = val > 0 ? (valPago / val) * 100 : 0;
                            const pctAPagar = val > 0 ? (valAPagar / val) * 100 : 0;
                            const hasValue = val > 0;
                            return (
                              <div key={m.mes} className="flex-1 flex flex-col items-center gap-1 group relative cursor-pointer" onClick={() => { setFluxoMesSelecionado(m); setShowFluxoMesDialog(true); }}>
                                {hasValue && (
                                  <span className="text-[9px] font-semibold text-green-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                    {formatMoeda(val)}
                                  </span>
                                )}
                                <div
                                  className="w-full flex flex-col-reverse overflow-hidden rounded-t-md transition-all"
                                  style={{ height: `${Math.max(pctTotal, 3)}%`, minHeight: "4px" }}
                                  title={`${m.nomeMes}: ${formatMoeda(val)} — Pago: ${formatMoeda(valPago)} · A pagar: ${formatMoeda(valAPagar)}`}
                                >
                                  {hasValue ? (
                                    <>
                                      {valPago > 0 && (
                                        <div
                                          className="w-full bg-gradient-to-t from-emerald-600 to-emerald-500 group-hover:from-emerald-700 group-hover:to-emerald-600"
                                          style={{ height: `${pctPago}%` }}
                                        />
                                      )}
                                      {valAPagar > 0 && (
                                        <div
                                          className="w-full bg-gradient-to-t from-amber-500 to-amber-400 group-hover:from-amber-600 group-hover:to-amber-500"
                                          style={{ height: `${pctAPagar}%` }}
                                        />
                                      )}
                                    </>
                                  ) : (
                                    <div className="w-full h-full bg-gray-200" />
                                  )}
                                </div>
                                <span className="text-[9px] text-muted-foreground font-medium">
                                  {(m.nomeMes || "").substring(0, 3)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ===== GRÁFICO DE GANTT - TIMELINE DE FÉRIAS ===== */}
                  {(() => {
                    const dados = fluxoCaixa as any[];
                    // Collect all employees across all months (unique by id)
                    // Rev. 1879: rastreamos `pago` por entrada p/ o Gantt diferenciar.
                    const allFuncs: Record<number, { id: number; nome: string; cargo: string; meses: { mes: number; valor: number; vencida: boolean; status: string; pago: boolean }[] }> = {};
                    for (const m of dados) {
                      for (const f of (m.funcionarios || [])) {
                        if (!allFuncs[f.id]) {
                          allFuncs[f.id] = { id: f.id, nome: f.nome, cargo: f.cargo || "", meses: [] };
                        }
                        allFuncs[f.id].meses.push({ mes: m.mes, valor: parseFloat(f.valorEstimado || "0"), vencida: f.vencida, status: f.status || (f.vencida ? 'vencida' : 'prevista'), pago: !!f.pago });
                      }
                    }
                    const funcList = Object.values(allFuncs).sort((a, b) => a.nome.localeCompare(b.nome));
                    if (funcList.length === 0) return null;

                    // Status-based colors for the Gantt bars. Rev. 1879: 'pago' tem prioridade
                    // visual sobre status — verde escuro com ✓.
                    const STATUS_GANTT_COLORS: Record<string, string> = {
                      prevista: "bg-blue-400",
                      pendente: "bg-blue-400",
                      agendada: "bg-emerald-400",
                      em_gozo: "bg-green-500",
                      concluida: "bg-gray-400",
                      vencida: "bg-red-400",
                      cancelada: "bg-gray-300",
                    };

                    return (
                      <div className="mt-6">
                        <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                          <Calendar className="h-4 w-4" /> Gantt — Timeline de Férias {anoCalendario}
                        </h4>
                        <div className="overflow-x-auto">
                          <div className="min-w-[700px]">
                            {/* Header meses */}
                            <div className="grid grid-cols-[200px_repeat(12,1fr)] border-b border-gray-300 pb-1 mb-1">
                              <div className="text-xs font-semibold text-muted-foreground px-1">Funcionário</div>
                              {MESES.map((m, i) => (
                                <div key={i} className="text-[10px] font-semibold text-center text-muted-foreground">{m}</div>
                              ))}
                            </div>
                            {/* Rows */}
                            {funcList.map((func, idx) => (
                              <div key={func.id} className={`grid grid-cols-[200px_repeat(12,1fr)] items-center ${idx % 2 === 0 ? "bg-muted/20" : ""} py-0.5`}>
                                <div
                                  className="text-xs font-medium truncate px-1 cursor-pointer hover:text-blue-600 hover:underline"
                                  title={`${func.nome} - ${func.cargo} — Clique para ver detalhes de férias`}
                                  onClick={() => setGanttEmployeeId(func.id)}
                                >
                                  {func.nome.split(" ").slice(0, 2).join(" ")}
                                </div>
                                {Array.from({ length: 12 }, (_, mesIdx) => {
                                  const mesNum = mesIdx + 1;
                                  const entry = func.meses.find(m => m.mes === mesNum);
                                  // Rev. 1879: barra "pago" tem cor própria (emerald-600) e ✓.
                                  const baseColor = STATUS_GANTT_COLORS[entry?.status || 'prevista'] || 'bg-blue-400';
                                  const statusColor = entry?.pago ? 'bg-emerald-600' : baseColor;
                                  const statusLabel = entry?.pago ? 'PAGO'
                                    : entry?.status === 'vencida' ? 'VENCIDA'
                                    : entry?.status === 'agendada' ? 'Agendada'
                                    : entry?.status === 'em_gozo' ? 'Em Gozo'
                                    : entry?.status === 'concluida' ? 'Concluída' : 'Prevista';
                                  return (
                                    <div key={mesIdx} className="px-0.5 h-6 flex items-center">
                                      {entry ? (
                                        <div
                                          className={`w-full h-4 rounded-sm ${statusColor} opacity-80 hover:opacity-100 transition-opacity cursor-pointer relative group flex items-center justify-center`}
                                          title={`${func.nome} — ${dados[mesIdx]?.nomeMes}: ${formatMoeda(entry.valor)} (${statusLabel})`}
                                          onClick={() => setGanttEmployeeId(func.id)}
                                        >
                                          {entry.pago && (
                                            <span className="text-white text-[10px] font-bold leading-none">✓</span>
                                          )}
                                          <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white opacity-0 group-hover:opacity-100">
                                            {formatMoeda(entry.valor)}
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="w-full h-4" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                            {/* Legend */}
                            <div className="flex flex-wrap items-center gap-4 mt-3 pt-2 border-t border-gray-200">
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-emerald-600 flex items-center justify-center text-white text-[8px] font-bold">✓</div>
                                <span className="text-[10px] text-muted-foreground font-semibold">Pagas</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-blue-400" />
                                <span className="text-[10px] text-muted-foreground">Previstas</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-emerald-400" />
                                <span className="text-[10px] text-muted-foreground">Agendadas</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-green-500" />
                                <span className="text-[10px] text-muted-foreground">Em Gozo</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-gray-400" />
                                <span className="text-[10px] text-muted-foreground">Concluídas</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-sm bg-red-400" />
                                <span className="text-[10px] text-muted-foreground">Vencidas</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground ml-auto">Clique no nome ou barra para ver detalhes</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ===== DIALOG: DETALHAMENTO DO MÊS - FLUXO DE CAIXA ===== */}
        <Dialog open={showFluxoMesDialog} onOpenChange={(open) => { if (!open) { setShowFluxoMesDialog(false); setFluxoMesSelecionado(null); } }}>
          <DialogContent className="!fixed !inset-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-screen !rounded-none" style={{ top: 0, left: 0, transform: 'none', display: 'flex', flexDirection: 'column' }}>
            <DialogHeader className="border-b pb-4 shrink-0">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <DollarSign className="h-6 w-6 text-green-600" />
                Detalhamento — {fluxoMesSelecionado?.nomeMes} {anoCalendario}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto">
            {fluxoMesSelecionado && (
              <div className="space-y-4 p-1">
                {/* Resumo do mês — cards de topo */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                    <p className="text-xs text-green-600 font-semibold uppercase">Total do Mês</p>
                    <p className="text-xl font-bold text-green-700 mt-1">{formatMoeda(fluxoMesSelecionado.valorTotal)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-200">
                    <p className="text-xs text-slate-600 font-semibold uppercase">Funcionários</p>
                    <p className="text-xl font-bold text-slate-700 mt-1">{fluxoMesSelecionado.totalFuncionarios}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                    <p className="text-xs text-blue-600 font-semibold uppercase">1º Período</p>
                    <p className="text-base font-bold text-blue-700 mt-1">{formatMoeda(fluxoMesSelecionado.totalPrimeiroPeriodo || "0")}</p>
                    <p className="text-[10px] text-blue-500">{fluxoMesSelecionado.qtdFuncionarios1p || 0} func. · pode prorrogar</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center border border-red-200">
                    <p className="text-xs text-red-600 font-semibold uppercase">2º+ Período</p>
                    <p className="text-base font-bold text-red-700 mt-1">{formatMoeda(fluxoMesSelecionado.totalSegundoPeriodoMais || "0")}</p>
                    <p className="text-[10px] text-red-500">{fluxoMesSelecionado.qtdFuncionarios2p || 0} func. · sem prorrogação</p>
                  </div>
                </div>

                {/* Rev. 1879: cards Pago vs A Pagar — sempre visíveis quando há funcionários */}
                {fluxoMesSelecionado.totalFuncionarios > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-300 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-emerald-700 font-semibold uppercase flex items-center gap-1">✓ Já Pago</p>
                        <p className="text-2xl font-bold text-emerald-700 mt-0.5">{formatMoeda(fluxoMesSelecionado.totalPago || "0")}</p>
                      </div>
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">{fluxoMesSelecionado.qtdPagos || 0} func.</Badge>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-300 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-amber-700 font-semibold uppercase">A Pagar</p>
                        <p className="text-2xl font-bold text-amber-700 mt-0.5">{formatMoeda(fluxoMesSelecionado.totalAPagar || "0")}</p>
                      </div>
                      <Badge className="bg-amber-500 text-white hover:bg-amber-500">{fluxoMesSelecionado.qtdAPagar || 0} func.</Badge>
                    </div>
                  </div>
                )}

                {/* Tabela detalhada agrupada por período */}
                {fluxoMesSelecionado.funcionarios?.length > 0 ? (
                  <div className="overflow-x-auto">
                    {/* Grupo 1º Período */}
                    {(() => {
                      const func1p = (fluxoMesSelecionado.funcionarios as any[]).filter((f: any) => f.numeroPeriodo === 1);
                      const func2p = (fluxoMesSelecionado.funcionarios as any[]).filter((f: any) => f.numeroPeriodo > 1);
                      const renderGrupo = (funcs: any[], titulo: string, cor: 'blue' | 'red') => {
                        if (funcs.length === 0) return null;
                        const subtotal = funcs.reduce((s: number, f: any) => s + parseFloat(f.valorEstimado || "0"), 0);
                        const bgHead = cor === 'blue' ? 'bg-blue-100 border-blue-300' : 'bg-red-100 border-red-300';
                        const txtHead = cor === 'blue' ? 'text-blue-800' : 'text-red-800';
                        const bgTotal = cor === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700';
                        return (
                          <table className="w-full text-sm mb-4 border rounded-lg overflow-hidden">
                            <thead>
                              <tr className={`border-b text-left ${bgHead}`}>
                                <th colSpan={8} className={`py-2 px-3 font-semibold ${txtHead}`}>{titulo}</th>
                              </tr>
                              <tr className="border-b text-left bg-muted/20">
                                <th className="py-1.5 px-3 font-medium text-muted-foreground text-xs">#</th>
                                <th className="py-1.5 px-3 font-medium text-muted-foreground text-xs">Funcionário</th>
                                <th className="py-1.5 px-3 font-medium text-muted-foreground text-xs">Cargo</th>
                                <th className="py-1.5 px-3 font-medium text-muted-foreground text-xs text-right">Salário Base</th>
                                <th className="py-1.5 px-3 font-medium text-muted-foreground text-xs text-right">Férias (30d)</th>
                                <th className="py-1.5 px-3 font-medium text-muted-foreground text-xs text-right">1/3 Const.</th>
                                <th className="py-1.5 px-3 font-medium text-muted-foreground text-xs text-right">Total</th>
                                <th className="py-1.5 px-3 font-medium text-muted-foreground text-xs text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {funcs.map((f: any, i: number) => {
                                const salario = typeof f.salario === 'string' ? parseFloat(f.salario.replace(/[^\d.,]/g, '').replace(',', '.')) || 0 : (f.salario || 0);
                                const terco = salario / 3;
                                const total = parseFloat(f.valorEstimado || "0");
                                return (
                                  <tr key={f.id + "_" + f.numeroPeriodo} className={`border-b hover:bg-muted/10 ${f.pago ? "bg-emerald-50/40" : ""}`}>
                                    <td className="py-1.5 px-3 text-muted-foreground text-xs">{i + 1}</td>
                                    <td className={`py-1.5 px-3 font-medium text-xs ${f.pago ? "line-through decoration-emerald-500/60 opacity-80" : ""}`}>{f.nome}</td>
                                    <td className="py-1.5 px-3 text-muted-foreground text-xs">{f.cargo || "-"}</td>
                                    <td className="py-1.5 px-3 text-right text-xs">{formatMoeda(salario)}</td>
                                    <td className="py-1.5 px-3 text-right text-xs">{formatMoeda(salario)}</td>
                                    <td className="py-1.5 px-3 text-right text-xs">{formatMoeda(terco)}</td>
                                    <td className={`py-1.5 px-3 text-right font-bold text-xs ${f.pago ? "text-emerald-700" : ""}`}>{formatMoeda(total)}</td>
                                    <td className="py-1.5 px-3 text-center">
                                      {/* Rev. 1879: PAGO tem prioridade visual sobre VENCIDA */}
                                      {f.pago ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-[9px]">✓ PAGO</Badge>
                                          {f.dataPagamento && (
                                            <span className="text-[9px] text-emerald-600">{new Date(f.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                          )}
                                        </div>
                                      ) : f.vencida ? (
                                        <Badge variant="destructive" className="text-[9px]">VENCIDA</Badge>
                                      ) : (
                                        <Badge className="bg-green-100 text-green-700 text-[9px]">Prevista</Badge>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className={`border-t-2 ${bgTotal}`}>
                                <td colSpan={6} className="py-1.5 px-3 text-xs font-semibold">Subtotal {titulo}</td>
                                <td className="py-1.5 px-3 text-right font-bold text-sm">{formatMoeda(subtotal)}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        );
                      };
                      return (
                        <>
                          {renderGrupo(func1p, "1º Período — pode prorrogar o pagamento", 'blue')}
                          {renderGrupo(func2p, "2º+ Período — sem possibilidade de prorrogação", 'red')}
                          {/* Total geral */}
                          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 mt-1">
                            <span className="font-bold text-green-800">TOTAL GERAL DO MÊS</span>
                            <span className="font-bold text-green-800 text-xl">{formatMoeda(fluxoMesSelecionado.valorTotal)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>Nenhum funcionário com férias previstas neste mês.</p>
                  </div>
                )}

                {/* Observação sobre cálculo */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-700">
                    <strong>Nota:</strong> Os valores são estimativas baseadas no salário base atual. O valor final pode variar conforme fracionamento, abono pecuniário, médias de horas extras e outros adicionais.
                  </p>
                </div>
              </div>
            )}
            </div>
          </DialogContent>
        </Dialog>

        {/* ===== DIALOG: DEFINIR DATA DE FÉRIAS (RH Override) ===== */}
        <Dialog open={showDefinirDialog} onOpenChange={(open) => { if (!open) { setShowDefinirDialog(false); setDefinirItem(null); } }}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PenLine className="h-5 w-5 text-blue-600" />
                Definir Data de Férias
              </DialogTitle>
            </DialogHeader>
            {definirItem && (
              <DefinirFeriasForm
                definirItem={definirItem}
                definirForm={definirForm}
                setDefinirForm={setDefinirForm}
                companyId={companyId}
                onSubmit={submitDefinirData}
                isPending={definirDataFerias.isPending}
                onCancel={() => { setShowDefinirDialog(false); setDefinirItem(null); }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        {selectedItem && (
          <FullScreenDialog open={showDetailDialog} onClose={() => { setShowDetailDialog(false); setSelectedItem(null); setEditingValues(false); setInssAjuste("0,00"); }} title="Detalhes das Férias" icon={<Palmtree className="h-5 w-5 text-white" />}>
            <div className="w-full max-w-3xl mx-auto space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground uppercase">Colaborador</p>
                  <p className="font-semibold text-lg">{selectedItem.employeeName}</p>
                  <p className="text-sm text-muted-foreground">{formatCPF(selectedItem.employeeCpf)} — {selectedItem.employeeCargo}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground uppercase">Status</p>
                  <p className="font-semibold text-lg">{STATUS_LABELS[selectedItem.status]?.label}</p>
                  {selectedItem.pagamentoEmDobro === 1 ? <Badge variant="destructive">Pagamento em Dobro</Badge> : selectedItem.vencida ? <Badge variant="outline" className="border-red-300 text-red-600">Período Vencido</Badge> : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-xs text-blue-600 uppercase font-semibold">Período Aquisitivo</p>
                  <p className="font-medium">{formatDate(selectedItem.periodoAquisitivoInicio)} a {formatDate(selectedItem.periodoAquisitivoFim)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4" title="Data limite p/ iniciar o gozo (30 dias antes do próximo período aquisitivo, conforme CLT art. 134)">
                  <p className="text-xs text-amber-600 uppercase font-semibold">Concessivo Até</p>
                  <p className="font-medium">{formatDate(dataLimiteInicioGozoFerias(selectedItem.periodoConcessivoFim))}</p>
                </div>
              </div>
              {selectedItem.dataInicio && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-green-600 uppercase">Início Gozo</p>
                    <p className="font-bold text-lg">{formatDate(selectedItem.dataInicio)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-green-600 uppercase">Fim Gozo</p>
                    <p className="font-bold text-lg">{formatDate(selectedItem.dataFim)}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-green-600 uppercase">Dias</p>
                    <p className="font-bold text-lg">{selectedItem.diasGozo || 30}</p>
                  </div>
                </div>
              )}
              {(selectedItem.faltasInjustificadas != null && selectedItem.faltasInjustificadas > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {selectedItem.faltasInjustificadas} falta(s) injustificada(s) no período aquisitivo
                    {selectedItem.diasDireitoOriginal && selectedItem.diasDireitoOriginal < 30 && (
                      <span> — Férias reduzidas de 30 para {selectedItem.diasDireitoOriginal} dias</span>
                    )}
                  </p>
                  <p className="text-[9px] text-amber-600 mt-1 italic">Art. 130, CLT — Redução proporcional de férias por faltas injustificadas</p>
                </div>
              )}
              {selectedItem.abonoPecuniario === 1 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    Abono Pecuniário: {selectedItem.valorAbono ? `R$ ${fmtNum(selectedItem.valorAbono)}` : "Sim"} ({Math.floor((selectedItem.diasDireitoOriginal || 30) / 3)} dias convertidos)
                  </p>
                  <p className="text-[9px] text-indigo-600 mt-1 italic">Art. 143, CLT — "É facultado ao empregado converter 1/3 do período de férias a que tiver direito em abono pecuniário"</p>
                </div>
              )}
              {/* PAINEL: MEMÓRIA DE CÁLCULO HE — Art. 142 CLT */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-slate-700 uppercase">Média de HE — Art. 142 CLT</p>
                  {mediaHELoading && <span className="text-[10px] text-slate-400 animate-pulse">Calculando...</span>}
                </div>
                {mediaHEData ? (
                  <>
                    {mediaHEData.dadosParciais && !editingValues && (
                      <div className="mb-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        ⚠️ Dados parciais: {mediaHEData.mesesComDados} de {mediaHEData.mesesNoPeriodo} meses do período aquisitivo encontrados no sistema. A média foi calculada com os meses disponíveis. O RH pode ajustar manualmente ao editar os valores.
                      </div>
                    )}
                    {(() => {
                      const pvP = (s: string) => parseFloat((s || "0").replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
                      const mHE_auto  = mediaHEData.mediaHE    ?? 0;
                      const mDSR_auto = mediaHEData.mediaDSRHE ?? 0;
                      // Ao não editar, mostrar valor salvo no banco se existir (formato US: "37.62")
                      const mHE_fromDB  = parseFloat(selectedItem.mediaHE  || "0") || 0;
                      const mDSR_fromDB = parseFloat(selectedItem.mediaDSRHE || "0") || 0;
                      const mHE_disp  = editingValues ? pvP(editValores.mediaHE)   : (mHE_fromDB  > 0 ? mHE_fromDB  : mHE_auto);
                      const mDSR_disp = editingValues ? pvP(editValores.mediaDSRHE) : (mDSR_fromDB > 0 ? mDSR_fromDB : mDSR_auto);
                      const isManualHE  = Math.abs(mHE_disp  - mHE_auto)  > 0.001;
                      const isManualDSR = Math.abs(mDSR_disp - mDSR_auto) > 0.001;
                      return (
                        <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                          <div className="bg-white border rounded p-2 text-center">
                            <p className="text-slate-400 text-[10px]">Meses com HE</p>
                            <p className="font-bold text-slate-800">{mediaHEData.mesesComDados}/{mediaHEData.mesesNoPeriodo}</p>
                          </div>
                          <div className={`border rounded p-2 text-center transition-colors ${isManualHE ? "bg-amber-50 border-amber-300" : "bg-white"}`}>
                            <p className="text-slate-400 text-[10px]">Média HE/mês</p>
                            <p className={`font-bold ${isManualHE ? "text-amber-700" : "text-blue-700"}`}>{formatMoeda(mHE_disp)}</p>
                            {isManualHE && (
                              <p className="text-[9px] mt-0.5 text-amber-600">✏ editado manualmente</p>
                            )}
                          </div>
                          <div className={`border rounded p-2 text-center transition-colors ${isManualDSR ? "bg-amber-50 border-amber-300" : "bg-white"}`}>
                            <p className="text-slate-400 text-[10px]">Média DSR das HE</p>
                            <p className={`font-bold ${isManualDSR ? "text-amber-700" : "text-blue-700"}`}>{formatMoeda(mDSR_disp)}</p>
                            {isManualDSR && (
                              <p className="text-[9px] mt-0.5 text-amber-600">✏ editado manualmente</p>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    {editingValues && (
                      <div className="mb-2 text-[10px] bg-blue-50 border border-blue-200 rounded px-2 py-1 text-blue-700">
                        ℹ️ Os valores do painel acima acompanham o que está sendo editado no formulário abaixo em tempo real.
                        {(Math.abs((parseFloat((editValores.mediaHE || "0").replace(/[R$\s.]/g, "").replace(",", ".")) || 0) - (mediaHEData.mediaHE ?? 0)) > 0.001 ||
                          Math.abs((parseFloat((editValores.mediaDSRHE || "0").replace(/[R$\s.]/g, "").replace(",", ".")) || 0) - (mediaHEData.mediaDSRHE ?? 0)) > 0.001)
                          && <span className="ml-1 font-semibold text-amber-700">⚠ Valor(es) diferem do cálculo automático.</span>}
                      </div>
                    )}
                    {mediaHEData.detalhes.length > 0 && (
                      <details className="text-[10px] text-slate-500">
                        <summary className="cursor-pointer hover:text-slate-700 select-none">Ver detalhes mês a mês</summary>
                        <table className="w-full mt-1 border-collapse">
                          <thead>
                            <tr className="bg-slate-100">
                              <th className="text-left px-1 py-0.5">Mês</th>
                              <th className="text-right px-1 py-0.5">HE Total</th>
                              <th className="text-right px-1 py-0.5">HE Útil</th>
                              <th className="text-right px-1 py-0.5">Dom.</th>
                              <th className="text-right px-1 py-0.5">DSR HE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mediaHEData.detalhes.map((d: any) => (
                              <tr key={d.mes} className="border-t border-slate-100">
                                <td className="px-1 py-0.5">{d.mes}</td>
                                <td className="text-right px-1 py-0.5">{formatMoeda(d.valorHE)}</td>
                                <td className="text-right px-1 py-0.5">{formatMoeda(d.valorHEUtil)}</td>
                                <td className="text-right px-1 py-0.5">{d.domingos}</td>
                                <td className="text-right px-1 py-0.5">{formatMoeda(d.dsr)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    )}
                    {mediaHEData.mesesComDados === 0 && (
                      <p className="text-[10px] text-slate-400">Nenhum registro de horas extras encontrado no período aquisitivo. Média = R$ 0,00.</p>
                    )}
                  </>
                ) : !mediaHELoading && (
                  <p className="text-[10px] text-slate-400">Carregando dados de horas extras...</p>
                )}
              </div>

              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-green-600 uppercase font-semibold">Valores</p>
                  {isMaster && !editingValues && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                      const fmtBRL = (v: string | null | undefined) => {
                        if (!v) return "";
                        const n = parseFloat(v);
                        if (isNaN(n)) return v;
                        return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      };
                      const mHE_auto  = mediaHEData?.mediaHE    ?? 0;
                      const mDSR_auto = mediaHEData?.mediaDSRHE ?? 0;
                      // Usar valor salvo manualmente se existir, senão usar o calculado
                      // Valores do banco estão em formato US (ex: "37.62") — usar parseFloat direto
                      const mHE_saved  = parseFloat(selectedItem.mediaHE  || "0") || 0;
                      const mDSR_saved = parseFloat(selectedItem.mediaDSRHE || "0") || 0;
                      const mHE  = mHE_saved  > 0 ? mHE_saved  : mHE_auto;
                      const mDSR = mDSR_saved > 0 ? mDSR_saved : mDSR_auto;
                      const salario = parseFloat((selectedItem.employeeSalario || "0").replace(/\./g, "").replace(",", ".")) || 0;
                      const diasGozo = selectedItem.diasGozo || 30;
                      // Calcular ferias e terco: sempre recalcula da base quando há bonus ou HE não salvo
                      const bonusNum = parseFloat((bonusValor || "0").replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
                      const temValorSalvo = parseFloat(selectedItem.valorFerias || "0") > 0;
                      let vF: number, vT: number;
                      if (bonusNum > 0 && salario > 0) {
                        // Sempre recalcula da base quando há acréscimo para garantir consistência
                        const base = salario + mHE + mDSR + bonusNum;
                        vF = (base / 30) * diasGozo;
                        vT = vF / 3;
                      } else if (!temValorSalvo && (mHE > 0 || mDSR > 0) && salario > 0) {
                        const base = salario + mHE + mDSR;
                        vF = (base / 30) * diasGozo;
                        vT = vF / 3;
                      } else {
                        vF = parseFloat(selectedItem.valorFerias || "0") || 0;
                        vT = parseFloat(selectedItem.valorTercoConstitucional || "0") || 0;
                      }
                      const vA = parseFloat(selectedItem.valorAbono || "0") || 0;
                      const totalCalculado = vF + vT + vA;
                      setEditValores({
                        valorFerias: fmtBRL(vF.toFixed(2)),
                        valorTerco: fmtBRL(vT.toFixed(2)),
                        valorAbono: fmtBRL(selectedItem.valorAbono),
                        valorTotal: totalCalculado > 0 ? fmtBRL(totalCalculado.toFixed(2)) : fmtBRL(selectedItem.valorTotal),
                        mediaHE:    fmtBRL(mHE.toFixed(2)),
                        mediaDSRHE: fmtBRL(mDSR.toFixed(2)),
                      });
                      setEditingValues(true);
                    }}>
                      <PenLine className="h-3 w-3 mr-1" /> Editar Valores
                    </Button>
                  )}
                  {editingValues && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingValues(false)}>Cancelar</Button>
                      <Button size="sm" className="h-7 text-xs" disabled={updateFerias.isPending} onClick={() => {
                        const parseVal = (v: string) => {
                          const clean = v.replace(/[R$\s.]/g, "").replace(",", ".");
                          return parseFloat(clean) || 0;
                        };
                        const vF = parseVal(editValores.valorFerias);
                        const vT = parseVal(editValores.valorTerco);
                        const vA = parseVal(editValores.valorAbono);
                        const total = parseVal(editValores.valorTotal) || (vF + vT + vA);
                        const mHESave = parseVal(editValores.mediaHE).toFixed(2);
                        const mDSRSave = parseVal(editValores.mediaDSRHE).toFixed(2);
                        const bonusValorSave = parseFloat((bonusValor || "0").replace(/[R$\s.]/g, "").replace(",", ".")).toFixed(2);
                        const arredSave = parseFloat((arredondamentoProvento || "0").replace(/[R$\s.]/g, "").replace(",", ".")).toFixed(2);
                        updateFerias.mutate({
                          id: selectedItem.id,
                          valorFerias: vF.toFixed(2),
                          valorTercoConstitucional: vT.toFixed(2),
                          valorAbono: vA.toFixed(2),
                          valorTotal: total.toFixed(2),
                          mediaHE: mHESave,
                          mediaDSRHE: mDSRSave,
                          bonusValor: bonusValorSave,
                          arredondamentoProvento: arredSave,
                        }, {
                          onSuccess: () => {
                            setSelectedItem((prev: any) => ({ ...prev, valorFerias: vF.toFixed(2), valorTercoConstitucional: vT.toFixed(2), valorAbono: vA.toFixed(2), valorTotal: total.toFixed(2), mediaHE: mHESave, mediaDSRHE: mDSRSave, bonusValor: bonusValorSave, arredondamentoProvento: arredSave }));
                            setEditingValues(false);
                            refetch();
                          }
                        });
                      }}>
                        {updateFerias.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}Salvar
                      </Button>
                    </div>
                  )}
                </div>
                {editingValues ? (
                  <div className="space-y-2 text-sm">
                    {(() => {
                      const pv = (s: string) => parseFloat((s || "0").replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
                      const fmt = (n: number) => n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                      // Formata BRL ao sair do campo: parse → formata
                      const fmtBlur = (raw: string) => fmt(pv(raw));
                      const salario = parseFloat((selectedItem.employeeSalario || "0").replace(/\./g, "").replace(",", ".")) || 0;
                      const diasGozo = selectedItem.diasGozo || 30;

                      // Acréscimos (insalubridade, gratificação, etc.) compõem a base de cálculo:
                      // Férias = (base/30) × dias; 1/3 = Férias/3 — ambos já refletem o acréscimo.
                      // bonusOverride: usado quando o próprio campo de bonus muda (estado ainda não atualizado).
                      const recalcFromHE = (heStr: string, dsrStr: string, abonoStr: string, bonusOverride?: string) => {
                        const bonusVal = bonusOverride !== undefined ? bonusOverride : bonusValor;
                        const base = salario + pv(heStr) + pv(dsrStr) + pv(bonusVal);
                        const ferias = base > 0 ? (base / 30) * diasGozo : 0;
                        const terco  = ferias / 3;
                        const total  = ferias + terco + pv(abonoStr);
                        return { ferias: fmt(ferias), terco: fmt(terco), total: fmt(total) };
                      };

                      // Recalcula total quando ferias/terco/abono mudam diretamente
                      const recalcTotal = (f: string, t: string, a: string) => {
                        const sum = pv(f) + pv(t) + pv(a);
                        return sum > 0 ? fmt(sum) : "0,00";
                      };

                      return (
                        <>
                          {/* SEÇÃO: BASE DE CÁLCULO (Art. 142 CLT) */}
                          <div className="bg-blue-50 border border-blue-200 rounded p-2 space-y-2 mb-1">
                            <p className="text-[10px] font-semibold text-blue-700 uppercase">Base de Cálculo — Art. 142 CLT</p>
                            <div className="flex items-center justify-between gap-4">
                              <span className="whitespace-nowrap text-slate-600 text-xs w-40">Salário Base:</span>
                              <Input className="h-7 text-sm text-right bg-slate-100" value={salario > 0 ? fmt(salario) : "—"} readOnly />
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="whitespace-nowrap text-slate-600 text-xs w-40">Média de HE:</span>
                              <Input className="h-7 text-sm text-right" value={editValores.mediaHE} onChange={e => {
                                const v = e.target.value;
                                const { ferias, terco, total } = recalcFromHE(v, editValores.mediaDSRHE, editValores.valorAbono);
                                setEditValores(p => ({ ...p, mediaHE: v, valorFerias: ferias, valorTerco: terco, valorTotal: total }));
                              }} onBlur={e => {
                                const f = fmtBlur(e.target.value);
                                const { ferias, terco, total } = recalcFromHE(f, editValores.mediaDSRHE, editValores.valorAbono);
                                setEditValores(p => ({ ...p, mediaHE: f, valorFerias: ferias, valorTerco: terco, valorTotal: total }));
                              }} placeholder="0,00" />
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="whitespace-nowrap text-slate-600 text-xs w-40">Média DSR das HE:</span>
                              <Input className="h-7 text-sm text-right" value={editValores.mediaDSRHE} onChange={e => {
                                const v = e.target.value;
                                const { ferias, terco, total } = recalcFromHE(editValores.mediaHE, v, editValores.valorAbono);
                                setEditValores(p => ({ ...p, mediaDSRHE: v, valorFerias: ferias, valorTerco: terco, valorTotal: total }));
                              }} onBlur={e => {
                                const f = fmtBlur(e.target.value);
                                const { ferias, terco, total } = recalcFromHE(editValores.mediaHE, f, editValores.valorAbono);
                                setEditValores(p => ({ ...p, mediaDSRHE: f, valorFerias: ferias, valorTerco: terco, valorTotal: total }));
                              }} placeholder="0,00" />
                            </div>
                            {/* Acréscimos habituais — compõem a base (incidem em Férias, 1/3 e INSS) */}
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <span className="whitespace-nowrap text-slate-600 text-xs w-40">Acréscimos:</span>
                              <Input
                                className="h-7 text-sm text-right w-28"
                                value={bonusValor}
                                onChange={e => {
                                  const v = e.target.value;
                                  setBonusValor(v);
                                  const { ferias, terco, total } = recalcFromHE(editValores.mediaHE, editValores.mediaDSRHE, editValores.valorAbono, v);
                                  setEditValores(p => ({ ...p, valorFerias: ferias, valorTerco: terco, valorTotal: total }));
                                }}
                                onBlur={e => {
                                  const f = fmtBlur(e.target.value);
                                  setBonusValor(f);
                                  const { ferias, terco, total } = recalcFromHE(editValores.mediaHE, editValores.mediaDSRHE, editValores.valorAbono, f);
                                  setEditValores(p => ({ ...p, valorFerias: ferias, valorTerco: terco, valorTotal: total }));
                                }}
                                placeholder="0,00"
                              />
                              <Input
                                className="h-7 text-xs flex-1"
                                value={bonusDesc}
                                onChange={e => setBonusDesc(e.target.value)}
                                placeholder="Ex: insalubridade, gratificação..."
                              />
                            </div>
                            <div className="flex items-center justify-between gap-4 border-t border-blue-200 pt-1">
                              <span className="whitespace-nowrap text-blue-800 text-xs font-semibold w-40">Base das Férias:</span>
                              <Input className="h-7 text-sm text-right font-semibold bg-blue-100" value={fmt(salario + pv(editValores.mediaHE) + pv(editValores.mediaDSRHE) + pv(bonusValor))} readOnly />
                            </div>
                          </div>

                          {/* SEÇÃO: VALORES FINAIS */}
                          <div className="flex items-center justify-between gap-4">
                            <span className="whitespace-nowrap text-slate-600 w-40">Férias:</span>
                            <Input className="h-7 text-sm text-right" value={editValores.valorFerias} onChange={e => {
                              const v = e.target.value;
                              setEditValores(p => ({ ...p, valorFerias: v, valorTotal: recalcTotal(v, p.valorTerco, p.valorAbono) }));
                            }} onBlur={e => {
                              const f = fmtBlur(e.target.value);
                              setEditValores(p => ({ ...p, valorFerias: f, valorTotal: recalcTotal(f, p.valorTerco, p.valorAbono) }));
                            }} placeholder="0,00" />
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="whitespace-nowrap text-slate-600 w-40">1/3 Constitucional:</span>
                            <Input className="h-7 text-sm text-right" value={editValores.valorTerco} onChange={e => {
                              const v = e.target.value;
                              setEditValores(p => ({ ...p, valorTerco: v, valorTotal: recalcTotal(p.valorFerias, v, p.valorAbono) }));
                            }} onBlur={e => {
                              const f = fmtBlur(e.target.value);
                              setEditValores(p => ({ ...p, valorTerco: f, valorTotal: recalcTotal(p.valorFerias, f, p.valorAbono) }));
                            }} placeholder="0,00" />
                          </div>
                          {(selectedItem.abonoPecuniario === 1 || parseFloat(editValores.valorAbono) > 0) && (
                            <div className="flex items-center justify-between gap-4">
                              <span className="whitespace-nowrap text-slate-600 w-40">Abono Pecuniário:</span>
                              <Input className="h-7 text-sm text-right" value={editValores.valorAbono} onChange={e => {
                                const v = e.target.value;
                                setEditValores(p => ({ ...p, valorAbono: v, valorTotal: recalcTotal(p.valorFerias, p.valorTerco, v) }));
                              }} onBlur={e => {
                                const f = fmtBlur(e.target.value);
                                setEditValores(p => ({ ...p, valorAbono: f, valorTotal: recalcTotal(p.valorFerias, p.valorTerco, f) }));
                              }} placeholder="0,00" />
                            </div>
                          )}
                          <div className="border-t pt-2 flex items-center justify-between gap-4">
                            <span className="font-bold text-green-700 w-40">TOTAL BRUTO:</span>
                            <Input className="h-7 text-sm text-right font-bold bg-green-50" value={editValores.valorTotal} readOnly placeholder="Calculado automaticamente" />
                          </div>
                          <p className="text-[10px] text-slate-400">Altere Média de HE para recalcular automaticamente. Ou ajuste Férias e 1/3 diretamente.</p>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <>
                    {(() => {
                      const pv = (s: string) => parseFloat((s || "0").replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
                      const fmt = (n: number) => "R$ " + n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                      const bonusViewNum = pv(bonusValor);
                      let vFv = parseFloat(selectedItem.valorFerias || "0") || 0;
                      let vTv = parseFloat(selectedItem.valorTercoConstitucional || "0") || 0;
                      if (bonusViewNum > 0) {
                        const sal = parseFloat((selectedItem.employeeSalario || "0").replace(/\./g, "").replace(",", ".")) || 0;
                        const mhe = parseFloat(selectedItem.mediaHE || "0") || 0;
                        const mdsr = parseFloat(selectedItem.mediaDSRHE || "0") || 0;
                        const dias = selectedItem.diasGozo || 30;
                        if (sal > 0) {
                          const base = sal + mhe + mdsr + bonusViewNum;
                          vFv = (base / 30) * dias;
                          vTv = vFv / 3;
                        }
                      }
                      const vAv = parseFloat(selectedItem.valorAbono || "0") || 0;
                      const totalView = vFv + vTv + vAv;
                      return (
                        <>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex justify-between"><span>Férias:</span><span className="font-medium">{fmt(vFv)}</span></div>
                            <div className="flex justify-between"><span>1/3 Constitucional:</span><span className="font-medium">{fmt(vTv)}</span></div>
                            {vAv > 0 && (
                              <div className="flex justify-between col-span-2"><span>Abono Pecuniário:</span><span className="font-medium">{fmt(vAv)}</span></div>
                            )}
                          </div>
                          <div className="border-t mt-2 pt-2 flex justify-between text-lg font-bold text-green-700">
                            <span>TOTAL BRUTO:</span>
                            <span>{fmt(totalView)}</span>
                          </div>
                        </>
                      );
                    })()}
                    {selectedItem.dataPagamento && (
                      <p className="text-xs text-green-600 mt-2">Pagamento até: {formatDate(selectedItem.dataPagamento)} (2 dias antes do início)</p>
                    )}
                  </>
                )}
              </div>
              {/* INSS + Líquido — Memória de Cálculo */}
              {(() => {
                const parseMoeda = (v: string) => parseFloat((v || "0").replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
                const bonusNum = parseMoeda(bonusValor);
                const pensaoNum = parseMoeda(pensaoDesconto);
                const outrosDescNum = parseMoeda(outrosDescontos);
                const ajusteNum = parseFloat(inssAjuste.replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
                const arredondamentoNum = parseMoeda(arredondamentoProvento);
                // Lê o TOTAL BRUTO em tempo real durante edição (sem esperar Salvar)
                // Em view mode: se há bonusValor, recomputa bruto com o bonus incluído na base
                const bruto = editingValues
                  ? parseMoeda(editValores.valorTotal)
                  : (() => {
                      if (bonusNum > 0) {
                        const sal = parseFloat((selectedItem.employeeSalario || "0").replace(/\./g, "").replace(",", ".")) || 0;
                        const mhe = parseFloat(selectedItem.mediaHE || "0") || 0;
                        const mdsr = parseFloat(selectedItem.mediaDSRHE || "0") || 0;
                        const dias = selectedItem.diasGozo || 30;
                        if (sal > 0) {
                          const base = sal + mhe + mdsr + bonusNum;
                          const f = (base / 30) * dias;
                          const t = f / 3;
                          const a = parseFloat(selectedItem.valorAbono || "0") || 0;
                          return f + t + a;
                        }
                      }
                      return parseFloat(selectedItem.valorTotal || "0");
                    })();
                // Arredondamento de provento adiciona à base ANTES do INSS (igual ao recibo do contador)
                const inssBase = bruto + arredondamentoNum;
                if (!inssBase) return null;
                // Tabela INSS progressiva 2026 — Portaria Interministerial MPS/MF nº 13/2026 (DOU 09/01/2026)
                const FAIXAS = [
                  { de: 0,       ate: 1621.00, aliq: 0.075, deducao: 0,      label: "1ª faixa" },
                  { de: 1621.00, ate: 2902.84, aliq: 0.09,  deducao: 24.32,  label: "2ª faixa" },
                  { de: 2902.84, ate: 4354.27, aliq: 0.12,  deducao: 111.40, label: "3ª faixa" },
                  { de: 4354.27, ate: 8475.55, aliq: 0.14,  deducao: 198.49, label: "4ª faixa" },
                ];
                const TETO_BASE = 8475.55;
                // Calcula INSS faixa a faixa (progressivo) sobre inssBase (inclui acréscimos)
                let inssTotal = 0;
                const linhas: { label: string; de: number; ate: number; base: number; aliq: number; deducao: number; valor: number; ativa: boolean; inssSimplificado: number }[] = [];
                let prev = 0;
                let faixaAtiva = FAIXAS[FAIXAS.length - 1];
                for (const f of FAIXAS) { if (inssBase <= f.ate) { faixaAtiva = f; break; } }
                for (const f of FAIXAS) {
                  const slice = Math.max(0, Math.min(inssBase, f.ate) - prev);
                  const valor = slice * f.aliq;
                  const inssSimplificado = f === faixaAtiva ? Math.max(0, inssBase * f.aliq - f.deducao) : 0;
                  linhas.push({ label: f.label, de: f.de, ate: f.ate, base: slice, aliq: f.aliq, deducao: f.deducao, valor, ativa: slice > 0, inssSimplificado });
                  inssTotal += valor;
                  prev = f.ate;
                  if (inssBase <= f.ate) break;
                }
                const INSS_TETO = Math.max(0, TETO_BASE * 0.14 - 198.49); // R$ 988,09
                if (inssBase > TETO_BASE) inssTotal = INSS_TETO;
                const liquido = inssBase - inssTotal - pensaoNum - outrosDescNum + ajusteNum;
                return (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Desconto INSS — Memória de Cálculo (Tabela 2026)</p>

                    {/* Arredondamento de Provento (incide no INSS — igual ao recibo do contador) */}
                    <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded p-2">
                      <span className="text-xs text-blue-800 font-medium whitespace-nowrap">Arredondamento de provento:</span>
                      <Input
                        className="h-7 text-xs text-right w-28 border-blue-300 focus:border-blue-500"
                        value={arredondamentoProvento}
                        onChange={e => setArredondamentoProvento(e.target.value)}
                        placeholder="0,00"
                        title="Valor adicionado ao bruto ANTES do cálculo do INSS. Equivalente ao arredondamento de provento do recibo."
                      />
                      <span className="text-[10px] text-blue-600 leading-tight">Soma aos proventos antes do INSS.</span>
                    </div>

                    {/* Linha de base */}
                    <div className="flex flex-col border-b border-slate-200 pb-2 gap-0.5">
                      {arredondamentoNum !== 0 && (
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Total Bruto (férias)</span>
                          <span>{formatMoeda(bruto)}</span>
                        </div>
                      )}
                      {arredondamentoNum !== 0 && (
                        <div className="flex justify-between text-xs text-blue-700">
                          <span>+ Arredondamento de provento</span>
                          <span>+ {formatMoeda(arredondamentoNum)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 font-medium">Base de cálculo do INSS{bonusNum > 0 ? <span className="text-green-700 font-normal"> (incl. {bonusDesc || "acréscimos"})</span> : ""}</span>
                        <span className="font-semibold">{formatMoeda(inssBase)}</span>
                      </div>
                    </div>

                    {/* Tabela de faixas com parcela a deduzir */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-200">
                            <th className="text-left pb-1 font-medium">Faixa</th>
                            <th className="text-right pb-1 font-medium">Até</th>
                            <th className="text-right pb-1 font-medium">Alíq.</th>
                            <th className="text-right pb-1 font-medium">Base</th>
                            <th className="text-right pb-1 font-medium">Parcela ded.</th>
                            <th className="text-right pb-1 font-medium">INSS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {linhas.map((l, i) => (
                            <tr key={i} className={`border-b border-slate-100 ${l.ativa ? "text-slate-700" : "text-slate-300"}`}>
                              <td className="py-1">{l.label}</td>
                              <td className="text-right py-1">{formatMoeda(l.ate)}</td>
                              <td className="text-right py-1">{(l.aliq * 100).toFixed(1)}%</td>
                              <td className="text-right py-1">{l.ativa ? formatMoeda(l.base) : "—"}</td>
                              <td className="text-right py-1 text-slate-500">{l.ativa && l.deducao > 0 ? `− ${formatMoeda(l.deducao)}` : l.ativa ? "—" : "—"}</td>
                              <td className={`text-right py-1 font-medium ${l.ativa ? "text-red-600" : ""}`}>
                                {l.ativa ? formatMoeda(l.valor) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Fórmula simplificada */}
                    {linhas.find(l => l.ativa) && (() => {
                      const f = linhas.find(l => l.ativa && l === linhas[linhas.length - 1] || l.ativa);
                      const fAtiva = linhas.filter(l => l.ativa).pop();
                      if (!fAtiva || fAtiva.deducao === 0) return null;
                      return (
                        <div className="bg-white border border-slate-200 rounded p-2 text-xs text-slate-600">
                          <span className="font-medium">Fórmula simplificada:</span>{" "}
                          {formatMoeda(inssBase)} × {(fAtiva.aliq * 100).toFixed(1)}% − {formatMoeda(fAtiva.deducao)} = <span className="font-semibold text-red-600">{formatMoeda(Math.max(0, inssBase * fAtiva.aliq - fAtiva.deducao))}</span>
                        </div>
                      );
                    })()}

                    {/* Totais INSS */}
                    <div className="space-y-1 pt-1 border-t border-slate-200">
                      <div className="flex justify-between text-sm font-semibold text-red-700">
                        <span>Total INSS descontado</span>
                        <span>− {formatMoeda(inssTotal)}</span>
                      </div>
                    </div>

                    {/* Descontos adicionais */}
                    <div className="border border-red-200 bg-red-50 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-red-800 uppercase">Descontos</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 w-24 shrink-0">Pensão aliment.:</span>
                        <Input
                          className="h-7 text-xs text-right w-28 border-red-300 focus:border-red-500"
                          value={pensaoDesconto}
                          onChange={e => setPensaoDesconto(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 w-24 shrink-0">Outros desc.:</span>
                        <Input
                          className="h-7 text-xs text-right w-28 border-red-300 focus:border-red-500"
                          value={outrosDescontos}
                          onChange={e => setOutrosDescontos(e.target.value)}
                          placeholder="0,00"
                        />
                        <Input
                          className="h-7 text-xs flex-1 border-red-300 focus:border-red-500"
                          value={outrosDescontosDesc}
                          onChange={e => setOutrosDescontosDesc(e.target.value)}
                          placeholder="Descrição (ex: adiantamento, EPI...)"
                        />
                      </div>
                    </div>

                    {/* Ajuste de arredondamento */}
                    <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded p-2">
                      <span className="text-xs text-amber-800 font-medium whitespace-nowrap">Ajuste arredondamento:</span>
                      <Input
                        className="h-7 text-xs text-right w-28 border-amber-300 focus:border-amber-500"
                        value={inssAjuste}
                        onChange={e => setInssAjuste(e.target.value)}
                        placeholder="0,00"
                        title="Valor somado diretamente ao líquido. Positivo aumenta, negativo reduz."
                      />
                      <span className="text-[10px] text-amber-600 leading-tight">Positivo aumenta, negativo reduz.</span>
                    </div>

                    {/* Valor Líquido */}
                    <div className="border-t border-slate-200 pt-2 space-y-1">
                      {pensaoNum > 0 && <div className="flex justify-between text-xs text-red-600"><span>− Pensão alimentícia</span><span>− {formatMoeda(pensaoNum)}</span></div>}
                      {outrosDescNum > 0 && <div className="flex justify-between text-xs text-red-600"><span>− {outrosDescontosDesc || "Outros descontos"}</span><span>− {formatMoeda(outrosDescNum)}</span></div>}
                      {ajusteNum !== 0 && <div className="flex justify-between text-xs text-amber-700"><span>Ajuste arredondamento</span><span>{ajusteNum > 0 ? "+" : "−"} {formatMoeda(Math.abs(ajusteNum))}</span></div>}
                      <div className="flex justify-between items-center">
                        <span className="text-base font-bold text-slate-800">Valor Líquido</span>
                        <div className="flex items-center gap-3">
                          <span className="text-base font-bold text-green-700">{formatMoeda(liquido)}</span>
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white px-3"
                            disabled={updateFerias.isPending}
                            onClick={() => {
                              // Recomputa valorFerias/Terco/Total com bonus para salvar no banco
                              const salLiq = parseFloat((selectedItem.employeeSalario || "0").replace(/\./g, "").replace(",", ".")) || 0;
                              const mheLiq = parseFloat(selectedItem.mediaHE || "0") || 0;
                              const mdsrLiq = parseFloat(selectedItem.mediaDSRHE || "0") || 0;
                              const diasLiq = selectedItem.diasGozo || 30;
                              const abonoLiq = parseFloat(selectedItem.valorAbono || "0") || 0;
                              let vFeriasLiq: string | undefined;
                              let vTercoLiq: string | undefined;
                              let vTotalLiq: string | undefined;
                              if (bonusNum > 0 && salLiq > 0) {
                                const baseLiq = salLiq + mheLiq + mdsrLiq + bonusNum;
                                const fLiq = (baseLiq / 30) * diasLiq;
                                const tLiq = fLiq / 3;
                                vFeriasLiq = fLiq.toFixed(2);
                                vTercoLiq  = tLiq.toFixed(2);
                                vTotalLiq  = (fLiq + tLiq + abonoLiq).toFixed(2);
                              }
                              updateFerias.mutate(
                                {
                                  id: selectedItem.id,
                                  ajusteInss: inssAjuste || "0,00",
                                  arredondamentoProvento: arredondamentoProvento || "0,00",
                                  valorLiquido: formatMoeda(liquido),
                                  bonusValor: bonusValor || "0,00",
                                  bonusDesc: bonusDesc || "",
                                  pensaoDesconto: pensaoDesconto || "0,00",
                                  outrosDescontos: outrosDescontos || "0,00",
                                  outrosDescontosDesc: outrosDescontosDesc || "",
                                  ...(vFeriasLiq ? { valorFerias: vFeriasLiq, valorTercoConstitucional: vTercoLiq, valorTotal: vTotalLiq } : {}),
                                },
                                {
                                  onSuccess: () => {
                                    setSelectedItem((prev: any) => prev ? {
                                      ...prev,
                                      ajusteInss: inssAjuste,
                                      arredondamentoProvento,
                                      valorLiquido: formatMoeda(liquido),
                                      bonusValor,
                                      bonusDesc,
                                      pensaoDesconto,
                                      outrosDescontos,
                                      outrosDescontosDesc,
                                      ...(vFeriasLiq ? { valorFerias: vFeriasLiq, valorTercoConstitucional: vTercoLiq, valorTotal: vTotalLiq } : {}),
                                    } : prev);
                                    refetch();
                                  },
                                }
                              );
                            }}
                          >
                            {updateFerias.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                            Salvar Líquido
                          </Button>
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400">* INSS progressivo conforme Portaria Interministerial MPS/MF nº 13/2026 (DOU 09/01/2026). Teto 2026: R$ 8.475,55 → INSS máx. R$ 988,09. Não inclui IRRF.</p>

                    {/* Anexo — Recibo de Férias da Contabilidade */}
                    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-slate-700 uppercase">Recibo de Férias (Contabilidade)</p>
                      {selectedItem.reciboUrl ? (
                        <div className="flex items-center gap-2">
                          <a href={selectedItem.reciboUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-medium">
                            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline fill="none" stroke="white" strokeWidth="2" points="14 2 14 8 20 8"/></svg>
                            {selectedItem.reciboNome || "Recibo.pdf"}
                          </a>
                          <span className="text-[10px] text-slate-400">Clique para abrir</span>
                          <div className="ml-auto flex items-center gap-2">
                            <label className="cursor-pointer text-[10px] text-slate-500 hover:text-slate-700 underline">
                              Substituir
                              <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  setReciboUploading(true);
                                  const reader = new FileReader();
                                  reader.onload = async (ev) => {
                                    const base64 = (ev.target?.result as string).split(",")[1];
                                    await uploadReciboFerias.mutateAsync({ id: selectedItem.id, fileBase64: base64, mimeType: file.type as any, fileName: file.name });
                                    setReciboUploading(false);
                                  };
                                  reader.readAsDataURL(file);
                                }}
                              />
                            </label>
                            <button
                              onClick={() => {
                                if (confirm("Excluir o recibo anexado?")) {
                                  removeReciboFerias.mutate({ id: selectedItem.id });
                                }
                              }}
                              className="text-red-400 hover:text-red-600 transition-colors"
                              title="Excluir recibo"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label className={`flex items-center gap-2 cursor-pointer border-2 border-dashed border-slate-300 rounded p-3 hover:border-blue-400 transition-colors ${reciboUploading ? "opacity-50 pointer-events-none" : ""}`}>
                          {reciboUploading ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>}
                          <span className="text-xs text-slate-500">{reciboUploading ? "Enviando..." : "Clique para anexar o recibo de férias (PDF, imagem)"}</span>
                          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setReciboUploading(true);
                              const reader = new FileReader();
                              reader.onload = async (ev) => {
                                const base64 = (ev.target?.result as string).split(",")[1];
                                await uploadReciboFerias.mutateAsync({ id: selectedItem.id, fileBase64: base64, mimeType: file.type as any, fileName: file.name });
                                setReciboUploading(false);
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </FullScreenDialog>
        )}

        {/* Create Dialog */}
        <FullScreenDialog open={showDialog} onClose={() => { setShowDialog(false); setForm({}); }} title="Registrar Férias" icon={<Palmtree className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-3xl mx-auto">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Dica:</strong> Selecione um colaborador e clique em "Gerar Períodos Automáticos" para calcular automaticamente os períodos aquisitivos com base na data de admissão.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium">Colaborador *</label>
                <div className="relative" style={{ zIndex: 60 }}>
                  <div className="flex items-center border rounded-md px-3 py-2 bg-background cursor-pointer hover:bg-muted/30 relative" style={{ zIndex: 61 }} onClick={() => { if (!empDropdownOpen) setEmpDropdownOpen(true); }}>
                    <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
                    {empDropdownOpen ? (
                      <input autoFocus className="flex-1 bg-transparent outline-none text-sm" placeholder="Digite nome, CPF ou código (JFC)..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setEmpDropdownOpen(false); setEmpSearch(''); } }} onClick={e => e.stopPropagation()} />
                    ) : (
                      <span className={`flex-1 text-sm ${selectedEmp ? "text-foreground" : "text-muted-foreground"}`}>
                        {selectedEmp ? `${selectedEmp.nomeCompleto} - ${formatCPF(selectedEmp.cpf)}` : "Selecione..."}
                      </span>
                    )}
                    {form.employeeId && (
                      <button type="button" className="ml-2 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); setForm({ ...form, employeeId: undefined }); setEmpSearch(""); setEmpDropdownOpen(false); }}>
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {empDropdownOpen && (
                    <>
                      <div className="fixed inset-0" style={{ zIndex: 55 }} onClick={() => { setEmpDropdownOpen(false); setEmpSearch(""); }} />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-xl max-h-64 overflow-y-auto" style={{ zIndex: 62 }}>
                        {filteredEmps.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">Nenhum resultado para "{empSearch}"</div>
                        ) : filteredEmps.slice(0, empSearch ? 50 : 200).map((e: any) => (
                          <div key={e.id} className="px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm flex justify-between" onClick={() => { setForm({ ...form, employeeId: e.id }); setEmpDropdownOpen(false); setEmpSearch(""); }}>
                            <span className="font-medium">{e.nomeCompleto}</span>
                            <span className="text-muted-foreground">
                              {e.codigoInterno && <span className="text-blue-600 font-medium mr-2">{e.codigoInterno}</span>}
                              {formatCPF(e.cpf)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {form.employeeId && (
                <div className="col-span-2">
                  <Button variant="outline" size="sm" onClick={() => handleGerarPeriodos(form.employeeId)} disabled={gerarPeriodos.isPending}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${gerarPeriodos.isPending ? "animate-spin" : ""}`} /> Gerar Períodos Automáticos
                  </Button>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Período Aquisitivo Início *</label>
                <Input type="date" value={form.periodoAquisitivoInicio || ""} onChange={e => setForm({ ...form, periodoAquisitivoInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Período Aquisitivo Fim *</label>
                <Input type="date" value={form.periodoAquisitivoFim || ""} onChange={e => setForm({ ...form, periodoAquisitivoFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Concessivo Até *</label>
                <Input type="date" value={form.periodoConcessivoFim || ""} onChange={e => setForm({ ...form, periodoConcessivoFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Dias de Gozo</label>
                <Input type="number" value={form.diasGozo || 30} onChange={e => setForm({ ...form, diasGozo: parseInt(e.target.value) || 30 })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data Início Gozo</label>
                <Input type="date" value={form.dataInicio || ""} onChange={e => setForm({ ...form, dataInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Data Fim Gozo</label>
                <Input type="date" value={form.dataFim || ""} onChange={e => setForm({ ...form, dataFim: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Fracionamento</label>
                <Select value={String(form.fracionamento || 1)} onValueChange={v => setForm({ ...form, fracionamento: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 período (30 dias)</SelectItem>
                    <SelectItem value="2">2 períodos (14+16)</SelectItem>
                    <SelectItem value="3">3 períodos (14+10+6)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Abono Pecuniário</label>
                <Select value={String(form.abonoPecuniario || 0)} onValueChange={v => setForm({ ...form, abonoPecuniario: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Não</SelectItem>
                    <SelectItem value="1">Sim (vender 1/3)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Observações</label>
                <Textarea value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} rows={2} />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowDialog(false); setForm({}); }}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={createFerias.isPending}>
                {createFerias.isPending ? "Salvando..." : "Registrar Férias"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      </div>

      {/* ===== DIALOG: DETALHES DE FÉRIAS DO FUNCIONÁRIO (Gantt click) ===== */}
      {ganttEmployeeId && (
        <GanttEmployeeFeriasDialog
          companyId={companyId}
          companyIds={companyIds}
          employeeId={ganttEmployeeId}
          onClose={() => setGanttEmployeeId(null)}
          onDefinirData={(item: any) => { setGanttEmployeeId(null); handleDefinirData(item); }}
          refetch={refetch}
          isMaster={isMaster}
          onCancelarConclusao={(p: any) => { setCancelarItem(p); setCancelarMotivo(""); setShowCancelarDialog(true); }}
        />
      )}

      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />

      {/* ===== DIALOG: REVERTER FÉRIAS CONCLUÍDA → EM GOZO ===== */}
      <Dialog open={showReverterDialog} onOpenChange={(open) => { if (!open) { setShowReverterDialog(false); setReverterItem(null); setReverterMotivo(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <Undo2 className="h-5 w-5" /> Reverter Férias para Em Gozo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm font-medium text-blue-800">O período voltará para o status "Em Gozo" para revisão dos dados e valores.</p>
              <p className="text-xs text-blue-600 mt-1">Você poderá editar datas, conferir o cálculo de INSS e concluir novamente quando estiver correto.</p>
            </div>
            {reverterItem && (
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-sm font-medium">{reverterItem.employeeName}</p>
                <p className="text-xs text-muted-foreground">Período: {formatDate(reverterItem.periodoAquisitivoInicio)} a {formatDate(reverterItem.periodoAquisitivoFim)}</p>
                {reverterItem.valorTotal && <p className="text-sm text-muted-foreground mt-1">Valor: {formatMoeda(parseFloat(reverterItem.valorTotal || '0'))}</p>}
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Motivo da reversão <span className="text-red-500">*</span></label>
              <Textarea
                placeholder="Ex: Verificar valores e datas antes de concluir novamente..."
                value={reverterMotivo}
                onChange={(e) => setReverterMotivo(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowReverterDialog(false); setReverterItem(null); setReverterMotivo(""); }}>Cancelar</Button>
            <Button
              disabled={!reverterMotivo.trim() || reverterParaEmGozo.isPending}
              onClick={() => { if (reverterItem) reverterParaEmGozo.mutate({ id: reverterItem.id, motivo: reverterMotivo.trim() }); }}
            >
              {reverterParaEmGozo.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Undo2 className="h-4 w-4 mr-2" />}
              Reverter para Em Gozo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG: REVERTER FÉRIAS EM GOZO → AGENDADA/PENDENTE ===== */}
      <Dialog open={showReverterEmGozoDialog} onOpenChange={(open) => { if (!open) { setShowReverterEmGozoDialog(false); setReverterEmGozoItem(null); setReverterEmGozoMotivo(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Undo2 className="h-5 w-5" /> Reverter Férias Em Gozo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-800">As férias serão revertidas e o colaborador voltará ao status "Ativo".</p>
              <p className="text-xs text-red-600 mt-1">Use esta opção em caso de preenchimento errado ou cancelamento das férias.</p>
            </div>
            {reverterEmGozoItem && (
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-sm font-medium">{reverterEmGozoItem.employeeName}</p>
                <p className="text-xs text-muted-foreground">Período: {formatDate(reverterEmGozoItem.periodoAquisitivoInicio)} a {formatDate(reverterEmGozoItem.periodoAquisitivoFim)}</p>
                {reverterEmGozoItem.dataInicio && <p className="text-xs text-muted-foreground">Gozo: {formatDate(reverterEmGozoItem.dataInicio)} a {formatDate(reverterEmGozoItem.dataFim)}</p>}
                {reverterEmGozoItem.valorTotal && <p className="text-sm text-muted-foreground mt-1">Valor: {formatMoeda(parseFloat(reverterEmGozoItem.valorTotal || '0'))}</p>}
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Motivo da reversão <span className="text-red-500">*</span></label>
              <Textarea
                placeholder="Ex: Preenchimento errado, férias canceladas pelo colaborador..."
                value={reverterEmGozoMotivo}
                onChange={(e) => setReverterEmGozoMotivo(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowReverterEmGozoDialog(false); setReverterEmGozoItem(null); setReverterEmGozoMotivo(""); }}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!reverterEmGozoMotivo.trim() || reverterEmGozo.isPending}
              onClick={() => { if (reverterEmGozoItem) reverterEmGozo.mutate({ id: reverterEmGozoItem.id, motivo: reverterEmGozoMotivo.trim() }); }}
            >
              {reverterEmGozo.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Undo2 className="h-4 w-4 mr-2" />}
              Reverter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG: CANCELAR CONCLUSÃO DE FÉRIAS (ADM Master) ===== */}
      <Dialog open={showCancelarDialog} onOpenChange={(open) => { if (!open) { setShowCancelarDialog(false); setCancelarItem(null); setCancelarMotivo(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <Undo2 className="h-5 w-5" /> Cancelar Conclusão de Férias
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p className="text-sm font-medium text-orange-800">Atenção: Esta ação é restrita ao ADM Master</p>
              <p className="text-xs text-orange-600 mt-1">O período voltará para o status anterior (Pendente ou Vencida) e poderá ser reprocessado.</p>
            </div>
            {cancelarItem && (
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Período: {cancelarItem.numeroPeriodo || '-'}º</p>
                <p className="text-sm font-medium">
                  {cancelarItem.employeeName || cancelarItem.periodoAquisitivoInicio && `${formatDate(cancelarItem.periodoAquisitivoInicio)} a ${formatDate(cancelarItem.periodoAquisitivoFim)}`}
                </p>
                {cancelarItem.valorTotal && <p className="text-sm text-muted-foreground">Valor: {formatMoeda(parseFloat(cancelarItem.valorTotal || '0'))}</p>}
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Motivo do cancelamento <span className="text-red-500">*</span></label>
              <Textarea
                placeholder="Descreva o motivo do cancelamento da conclusão..."
                value={cancelarMotivo}
                onChange={(e) => setCancelarMotivo(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowCancelarDialog(false); setCancelarItem(null); setCancelarMotivo(""); }}>Voltar</Button>
            <Button
              variant="destructive"
              className="bg-orange-600 hover:bg-orange-700"
              disabled={!cancelarMotivo.trim() || cancelarConclusaoFerias.isPending}
              onClick={() => {
                if (cancelarItem) {
                  cancelarConclusaoFerias.mutate({ id: cancelarItem.id, motivo: cancelarMotivo.trim() });
                }
              }}
            >
              {cancelarConclusaoFerias.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Undo2 className="h-4 w-4 mr-2" />}
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rev. 2098 — modal "Início de Férias" extraído pra FeriasGozoPrompt
          global em DashboardLayout. Aparece em qualquer tela do módulo RH. */}

    <PrintFooterLGPD />
    </DashboardLayout>
  );
}
