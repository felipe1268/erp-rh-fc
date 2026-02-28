import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  FileText, Plus, Loader2, CheckCircle, XCircle, Clock, DollarSign,
  ArrowLeft, TrendingUp, Users, Receipt, CalendarDays, BarChart3,
  ChevronRight, Eye
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const MESES_LABEL = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function PJMedicoes() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin_master' || user?.role === 'admin';
  const now = new Date();
  const [mesRef, setMesRef] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedMedicao, setSelectedMedicao] = useState<any>(null);
  const [form, setForm] = useState({ contractId: 0, mesReferencia: mesRef, horasTrabalhadas: "", valorHora: "", valorBruto: "", valorLiquido: "", descricao: "" });

  const { data: medicoes, isLoading, refetch } = trpc.pjMedicoes.listar.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 }
  );

  const { data: contratos } = trpc.pj.contratos.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const criarMut = trpc.pjMedicoes.criar.useMutation({
    onSuccess: () => { toast.success("Medição criada com sucesso!"); setShowDialog(false); refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao criar"),
  });

  const aprovarMut = trpc.pjMedicoes.aprovar.useMutation({
    onSuccess: () => { toast.success("Medição aprovada!"); refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao aprovar"),
  });

  const cancelarMut = trpc.pjMedicoes.atualizar.useMutation({
    onSuccess: () => { toast.success("Medição cancelada"); refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao cancelar"),
  });

  const abrirNovo = () => {
    setForm({ contractId: 0, mesReferencia: mesRef, horasTrabalhadas: "", valorHora: "", valorBruto: "", valorLiquido: "", descricao: "" });
    setShowDialog(true);
  };

  const calcTotal = (horas: string, valor: string) => {
    const h = parseFloat(horas) || 0;
    const v = parseFloat(valor) || 0;
    return (h * v).toFixed(2);
  };

  const salvar = () => {
    if (!form.contractId) return toast.error("Selecione o contrato PJ");
    const selectedContract = contratos?.find((c: any) => c.id === form.contractId);
    if (!selectedContract?.employeeId) return toast.error("Contrato sem funcionário vinculado");
    const total = calcTotal(form.horasTrabalhadas, form.valorHora);
    criarMut.mutate({
      companyId,
      contractId: form.contractId,
      employeeId: selectedContract.employeeId,
      mesReferencia: form.mesReferencia,
      horasTrabalhadas: form.horasTrabalhadas,
      valorHora: form.valorHora,
      valorBruto: total,
      valorLiquido: total,
      observacoes: form.descricao || undefined,
    });
  };

  const totalMes = useMemo(() => {
    if (!medicoes) return { total: 0, aprovado: 0, pendente: 0, rejeitado: 0, count: 0, countAprovado: 0, countPendente: 0 };
    return medicoes.reduce((acc, m) => ({
      total: acc.total + parseFloat(m.valorBruto || '0'),
      aprovado: acc.aprovado + (m.status === 'aprovada' ? parseFloat(m.valorBruto || '0') : 0),
      pendente: acc.pendente + (['rascunho','pendente_aprovacao'].includes(m.status) ? parseFloat(m.valorBruto || '0') : 0),
      rejeitado: acc.rejeitado + (m.status === 'cancelada' ? parseFloat(m.valorBruto || '0') : 0),
      count: acc.count + 1,
      countAprovado: acc.countAprovado + (m.status === 'aprovada' ? 1 : 0),
      countPendente: acc.countPendente + (['rascunho','pendente_aprovacao'].includes(m.status) ? 1 : 0),
    }), { total: 0, aprovado: 0, pendente: 0, rejeitado: 0, count: 0, countAprovado: 0, countPendente: 0 });
  }, [medicoes]);

  const statusConfig: Record<string, { icon: any; label: string; color: string; bg: string; badge: string }> = {
    aprovada: { icon: CheckCircle, label: 'Aprovada', color: 'text-emerald-700', bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },

    rascunho: { icon: Clock, label: 'Pendente', color: 'text-amber-700', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
    pendente_aprovacao: { icon: Clock, label: 'Pendente', color: 'text-amber-700', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
    cancelada: { icon: XCircle, label: 'Cancelada', color: 'text-gray-500', bg: 'bg-gray-50', badge: 'bg-gray-100 text-gray-500 border-gray-200' },
  };

  const getStatusConfig = (s: string) => statusConfig[s] || statusConfig.rascunho;

  const [anoRef, mesNumRef] = mesRef.split('-').map(Number);
  const mesLabel = `${MESES_LABEL[mesNumRef]} ${anoRef}`;

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground hover:text-foreground w-fit" onClick={() => window.history.back()}>
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Receipt className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Medições PJ</h2>
                <p className="text-sm text-muted-foreground">Controle de medições mensais dos prestadores de serviço</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 border border-border">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <Input type="month" value={mesRef} onChange={e => setMesRef(e.target.value)} className="w-[150px] border-0 bg-transparent p-0 h-auto text-sm font-medium focus-visible:ring-0" />
            </div>
            <Button onClick={abrirNovo} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20">
              <Plus className="w-4 h-4 mr-1.5" /> Nova Medição
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-50 to-white">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total do Mês</p>
                <p className="text-2xl font-bold text-foreground mt-2">R$ {fmtBRL(totalMes.total)}</p>
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {totalMes.count} medição{totalMes.count !== 1 ? 'ões' : ''}
                </p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50/50 to-white">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Aprovadas</p>
                <p className="text-2xl font-bold text-emerald-700 mt-2">R$ {fmtBRL(totalMes.aprovado)}</p>
                <p className="text-xs text-emerald-600/70 mt-1.5 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  {totalMes.countAprovado} aprovada{totalMes.countAprovado !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-100 to-green-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50/50 to-white">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">Pendentes</p>
                <p className="text-2xl font-bold text-amber-700 mt-2">R$ {fmtBRL(totalMes.pendente)}</p>
                <p className="text-xs text-amber-600/70 mt-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {totalMes.countPendente} pendente{totalMes.countPendente !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-100 to-yellow-100 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-violet-50/50 to-white">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-violet-600 uppercase tracking-wider">Prestadores</p>
                <p className="text-2xl font-bold text-violet-700 mt-2">{contratos?.filter((c: any) => c.status === 'ativo').length || 0}</p>
                <p className="text-xs text-violet-600/70 mt-1.5 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  contratos ativos
                </p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referência do mês */}
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Medições de {mesLabel}</h3>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm text-muted-foreground">Carregando medições...</p>
        </div>
      ) : !medicoes?.length ? (
        <Card className="border-dashed border-2 border-muted-foreground/20">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
              <Receipt className="w-8 h-8 text-blue-500" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">Nenhuma medição registrada</p>
              <p className="text-sm text-muted-foreground mt-1">Não há medições para {mesLabel}. Crie a primeira medição para começar.</p>
            </div>
            <Button onClick={abrirNovo} className="mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
              <Plus className="w-4 h-4 mr-1.5" /> Criar primeira medição
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {medicoes.map((m: any) => {
            const sc = getStatusConfig(m.status);
            const StatusIcon = sc.icon;
            const prestadorNome = m.funcionario?.nomeCompleto || m.contrato?.prestadorNome || `Contrato #${m.contractId}`;
            const valorBruto = parseFloat(m.valorBruto || '0');
            return (
              <Card key={m.id} className="border shadow-sm hover:shadow-md transition-all duration-200 group cursor-pointer" onClick={() => setSelectedMedicao(m)}>
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4">
                    {/* Prestador info */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`h-10 w-10 rounded-xl ${sc.bg} flex items-center justify-center shrink-0`}>
                        <StatusIcon className={`w-5 h-5 ${sc.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{prestadorNome}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{m.horasTrabalhadas}h trabalhadas</span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">R$ {parseFloat(m.valorHora || '0').toFixed(2)}/h</span>
                        </div>
                      </div>
                    </div>

                    {/* Status badge */}
                    <Badge variant="outline" className={`${sc.badge} text-[11px] font-medium px-2.5 py-0.5 shrink-0`}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {sc.label}
                    </Badge>

                    {/* Valor */}
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold text-foreground">R$ {fmtBRL(valorBruto)}</p>
                      {m.observacoes && <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[150px] truncate">{m.observacoes}</p>}
                    </div>

                    {/* Ações */}
                    {isAdmin && ['rascunho','pendente_aprovacao'].includes(m.status) && (
                      <div className="flex gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" onClick={() => aprovarMut.mutate({ id: m.id })}>
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Aprovar
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => cancelarMut.mutate({ id: m.id, status: 'cancelada' })}>
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Cancelar
                        </Button>
                      </div>
                    )}

                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0 hidden sm:block" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog Detalhes da Medição */}
      <Dialog open={!!selectedMedicao} onOpenChange={(open) => !open && setSelectedMedicao(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-600" />
              Detalhes da Medição
            </DialogTitle>
          </DialogHeader>
          {selectedMedicao && (() => {
            const sc = getStatusConfig(selectedMedicao.status);
            const StatusIcon = sc.icon;
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-bold text-foreground">
                      {selectedMedicao.funcionario?.nomeCompleto || selectedMedicao.contrato?.prestadorNome || `Contrato #${selectedMedicao.contractId}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{mesLabel}</p>
                  </div>
                  <Badge variant="outline" className={`${sc.badge} text-xs font-medium px-3 py-1`}>
                    <StatusIcon className="w-3.5 h-3.5 mr-1" />
                    {sc.label}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Horas Trabalhadas</p>
                    <p className="text-lg font-bold text-foreground mt-1">{selectedMedicao.horasTrabalhadas}h</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground uppercase font-medium">Valor/Hora</p>
                    <p className="text-lg font-bold text-foreground mt-1">R$ {parseFloat(selectedMedicao.valorHora || '0').toFixed(2)}</p>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Valor Total</span>
                    <span className="text-xl font-extrabold text-blue-700">R$ {fmtBRL(parseFloat(selectedMedicao.valorBruto || '0'))}</span>
                  </div>
                </div>

                {selectedMedicao.observacoes && (
                  <div className="bg-muted/20 rounded-lg p-3 border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase font-medium mb-1">Observações</p>
                    <p className="text-sm text-foreground">{selectedMedicao.observacoes}</p>
                  </div>
                )}

                {isAdmin && ['rascunho','pendente_aprovacao'].includes(selectedMedicao.status) && (
                  <div className="flex gap-2 pt-2">
                    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { aprovarMut.mutate({ id: selectedMedicao.id }); setSelectedMedicao(null); }}>
                      <CheckCircle className="w-4 h-4 mr-1.5" /> Aprovar Medição
                    </Button>
                    <Button variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { cancelarMut.mutate({ id: selectedMedicao.id, status: 'cancelada' }); setSelectedMedicao(null); }}>
                      <XCircle className="w-4 h-4 mr-1.5" /> Cancelar
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog Nova Medição */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              Nova Medição PJ
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium">Contrato PJ</Label>
              <Select value={form.contractId ? String(form.contractId) : "none"} onValueChange={v => {
                const id = Number(v);
                setForm(p => ({ ...p, contractId: id }));
              }}>
                <SelectTrigger className="mt-1.5 h-11"><SelectValue placeholder="Selecione o contrato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione o contrato</SelectItem>
                  {contratos?.filter((c: any) => c.status === 'ativo').map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.prestadorNome || c.razaoSocial} - {c.descricaoServico || 'PJ'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">Mês Referência</Label>
              <Input type="month" value={form.mesReferencia} onChange={e => setForm(p => ({ ...p, mesReferencia: e.target.value }))} className="mt-1.5 h-11" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Horas Trabalhadas</Label>
                <Input value={form.horasTrabalhadas} onChange={e => setForm(p => ({ ...p, horasTrabalhadas: e.target.value }))} className="mt-1.5 h-11" placeholder="0" />
              </div>
              <div>
                <Label className="text-xs font-medium">Valor/Hora (R$)</Label>
                <Input value={form.valorHora} onChange={e => setForm(p => ({ ...p, valorHora: e.target.value }))} className="mt-1.5 h-11" placeholder="0,00" />
              </div>
            </div>
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-medium text-blue-700">Total Calculado</span>
                </div>
                <span className="text-xl font-bold text-blue-700">R$ {calcTotal(form.horasTrabalhadas, form.valorHora)}</span>
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium">Descrição / Observações</Label>
              <textarea value={form.descricao || ''} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} rows={3} className="w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring mt-1.5" placeholder="Descreva os serviços prestados..." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={criarMut.isPending} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
              {criarMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              Criar Medição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
