import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, Plus, Search, Loader2, CheckCircle, XCircle, Clock, DollarSign, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const MESES_LABEL = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function PJMedicoes() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin_master';
  const now = new Date();
  const [mesRef, setMesRef] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [showDialog, setShowDialog] = useState(false);
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
    onSuccess: () => { toast.success("Medição criada"); setShowDialog(false); refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao criar"),
  });

  const aprovarMut = trpc.pjMedicoes.aprovar.useMutation({
    onSuccess: () => { toast.success("Medição aprovada"); refetch(); },
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
    // Get employeeId from selected contract
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
    if (!medicoes) return { total: 0, aprovado: 0, pendente: 0, count: 0 };
    return medicoes.reduce((acc, m) => ({
      total: acc.total + parseFloat(m.valorBruto || '0'),
      aprovado: acc.aprovado + (m.status === 'aprovada' ? parseFloat(m.valorBruto || '0') : 0),
      pendente: acc.pendente + (['rascunho','pendente_aprovacao'].includes(m.status) ? parseFloat(m.valorBruto || '0') : 0),
      count: acc.count + 1,
    }), { total: 0, aprovado: 0, pendente: 0, count: 0 });
  }, [medicoes]);

  const statusIcon = (s: string) => {
    if (s === 'aprovada') return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (s === 'rejeitada') return <XCircle className="w-4 h-4 text-red-600" />;
    return <Clock className="w-4 h-4 text-amber-600" />;
  };

  const statusLabel = (s: string) => {
    if (s === 'aprovada') return 'Aprovada';
    if (s === 'rejeitada') return 'Rejeitada';
    return 'Pendente';
  };

  // Parse mesRef for display
  const [anoRef, mesNumRef] = mesRef.split('-').map(Number);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 gap-1 text-muted-foreground hover:text-foreground" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Medições PJ
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Controle de medições mensais por horas trabalhadas dos prestadores PJ</p>
        </div>
        <div className="flex gap-2">
          <Input type="month" value={mesRef} onChange={e => setMesRef(e.target.value)} className="w-[160px]" />
          <Button size="sm" onClick={abrirNovo}>
            <Plus className="w-4 h-4 mr-1" /> Nova Medição
          </Button>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground">Total Medições ({MESES_LABEL[mesNumRef]} {anoRef})</div>
          <div className="text-2xl font-bold text-foreground mt-1">R$ {totalMes.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          <div className="text-xs text-muted-foreground mt-1">{totalMes.count} medição(ões)</div>
        </div>
        <div className="border border-green-200 rounded-lg p-4 bg-green-50/50">
          <div className="text-xs text-green-700">Aprovadas</div>
          <div className="text-2xl font-bold text-green-700 mt-1">R$ {totalMes.aprovado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="border border-amber-200 rounded-lg p-4 bg-amber-50/50">
          <div className="text-xs text-amber-700">Pendentes</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">R$ {totalMes.pendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : !medicoes?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma medição para {MESES_LABEL[mesNumRef]} {anoRef}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={abrirNovo}>Criar primeira medição</Button>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Prestador</th>
                <th className="text-center px-4 py-2 font-medium">Horas</th>
                <th className="text-right px-4 py-2 font-medium">Valor/Hora</th>
                <th className="text-right px-4 py-2 font-medium">Total</th>
                <th className="text-center px-4 py-2 font-medium">Status</th>
                <th className="text-center px-4 py-2 font-medium">Descrição</th>
                {isAdmin && <th className="text-center px-4 py-2 font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {medicoes.map((m: any) => (
                <tr key={m.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{m.funcionario?.nomeCompleto || m.contrato?.prestadorNome || `Contrato #${m.contractId}`}</td>
                  <td className="px-4 py-3 text-center">{m.horasTrabalhadas}h</td>
                  <td className="px-4 py-3 text-right">R$ {parseFloat(m.valorHora || '0').toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold">R$ {parseFloat(m.valorBruto || '0').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1">{statusIcon(m.status)} {statusLabel(m.status)}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground max-w-[200px] truncate">{m.observacoes || '-'}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-center">
                      {['rascunho','pendente_aprovacao'].includes(m.status) && (
                        <div className="flex gap-1 justify-center">
                          <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300" onClick={() => aprovarMut.mutate({ id: m.id })}>
                            <CheckCircle className="w-3 h-3 mr-1" /> Aprovar
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300" onClick={() => cancelarMut.mutate({ id: m.id, status: 'cancelada' })}>
                            <XCircle className="w-3 h-3 mr-1" /> Cancelar
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Dialog Nova Medição */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Medição PJ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Contrato PJ</Label>
              <Select value={form.contractId ? String(form.contractId) : "none"} onValueChange={v => {
                const id = Number(v);
                const c = contratos?.find((x: any) => x.id === id);
                setForm(p => ({ ...p, contractId: id }));
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione o contrato</SelectItem>
                  {contratos?.filter((c: any) => c.status === 'ativo').map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.prestadorNome || c.razaoSocial} - {c.descricaoServico || 'PJ'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Mês Referência</Label>
              <Input type="month" value={form.mesReferencia} onChange={e => setForm(p => ({ ...p, mesReferencia: e.target.value }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Horas Trabalhadas</Label>
                <Input value={form.horasTrabalhadas} onChange={e => setForm(p => ({ ...p, horasTrabalhadas: e.target.value }))} className="mt-1" placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">Valor/Hora (R$)</Label>
                <Input value={form.valorHora} onChange={e => setForm(p => ({ ...p, valorHora: e.target.value }))} className="mt-1" placeholder="0.00" />
              </div>
            </div>
            <div className="p-3 bg-primary/10 rounded-lg">
              <span className="text-xs text-muted-foreground">Total Calculado:</span>
              <span className="text-lg font-bold text-primary ml-2">R$ {calcTotal(form.horasTrabalhadas, form.valorHora)}</span>
            </div>
            <div>
              <Label className="text-xs">Descrição / Observações</Label>
              <textarea value={form.descricao || ''} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} rows={2} className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={criarMut.isPending}>
              {criarMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Criar Medição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
