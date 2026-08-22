import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, RefreshCw, Repeat, Pause, Play, Trash2,
  ArrowUpRight, ArrowDownRight, Calendar, Zap, Edit2,
} from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const FREQ_LABELS: Record<string, string> = {
  mensal: "Mensal", quinzenal: "Quinzenal", semanal: "Semanal",
  trimestral: "Trimestral", anual: "Anual",
};

const INITIAL_FORM = {
  descricao: "", valor: "", tipo: "despesa" as string, natureza: "fixo",
  contaNome: "", obraNome: "", frequencia: "mensal",
  diaVencimento: "5", dataLimite: "", primeiroVencimento: "", formaPagamento: "", fornecedorNome: "", observacoes: "",
};

export default function FinanceiroRecorrentes() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...INITIAL_FORM });

  const { data: items, isLoading, refetch } = (trpc as any).financial.getRecurringEntries.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const createMut = (trpc as any).financial.createRecurringEntry.useMutation({
    onSuccess: () => { toast({ title: "Recorrência criada!" }); setShowForm(false); resetForm(); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateMut = (trpc as any).financial.updateRecurringEntry.useMutation({
    onSuccess: () => { toast({ title: "Recorrência atualizada!" }); setShowForm(false); resetForm(); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMut = (trpc as any).financial.deleteRecurringEntry.useMutation({
    onSuccess: () => { toast({ title: "Recorrência excluída!" }); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function handleDelete(item: any) {
    if (!confirm(`Excluir a recorrência "${item.descricao}"?\n\nIsso remove apenas o cadastro mestre — lançamentos já gerados em Contas a Pagar permanecem.`)) return;
    deleteMut.mutate({ id: item.id, companyId });
  }

  const generateMut = (trpc as any).financial.generateRecurringEntries.useMutation({
    onSuccess: (res: any) => {
      toast({ title: res.generated > 0 ? `${res.generated} lançamento(s) gerado(s)!` : "Nenhum lançamento pendente para gerar" });
      refetch();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setForm({ ...INITIAL_FORM });
    setEditId(null);
  }

  function openEdit(item: any) {
    setEditId(item.id);
    setForm({
      descricao: item.descricao ?? "",
      valor: String(item.valor ?? ""),
      tipo: item.tipo ?? "despesa",
      natureza: item.natureza ?? "fixo",
      contaNome: item.contaNome ?? "",
      obraNome: item.obraNome ?? "",
      frequencia: item.frequencia ?? "mensal",
      diaVencimento: String(item.diaVencimento ?? "5"),
      dataLimite: item.dataLimite ? String(item.dataLimite).slice(0, 10) : "",
      primeiroVencimento: "",
      formaPagamento: item.formaPagamento ?? "",
      fornecedorNome: item.fornecedorNome ?? "",
      observacoes: item.observacoes ?? "",
    });
    setShowForm(true);
  }

  function handleSave() {
    if (!form.descricao || !form.valor) {
      toast({ title: "Preencha descrição e valor", variant: "destructive" });
      return;
    }
    const payload = {
      companyId,
      descricao: form.descricao,
      valor: parseFloat(form.valor),
      tipo: form.tipo,
      natureza: form.natureza,
      contaNome: form.contaNome || undefined,
      obraNome: form.obraNome || undefined,
      frequencia: form.frequencia,
      diaVencimento: parseInt(form.diaVencimento) || 5,
      dataLimite: form.dataLimite || null,
      formaPagamento: form.formaPagamento || undefined,
      fornecedorNome: form.fornecedorNome || undefined,
      observacoes: form.observacoes || undefined,
    };
    if (editId) {
      updateMut.mutate({ ...payload, id: editId });
    } else {
      // Rev. 5150 — 1º vencimento explícito (sem ele o servidor decidia e podia pular o mês corrente)
      createMut.mutate({ ...payload, primeiroVencimento: form.primeiroVencimento || undefined });
    }
  }

  function toggleAtivo(item: any) {
    updateMut.mutate({
      id: item.id,
      companyId,
      ativo: item.ativo === 1 ? 0 : 1,
    });
  }

  const entries = items ?? [];
  const ativos = entries.filter((e: any) => e.ativo === 1);
  const inativos = entries.filter((e: any) => e.ativo !== 1);
  const totalMensal = ativos.reduce((s: number, e: any) => {
    const v = Number(e.valor ?? 0);
    if (e.frequencia === "mensal") return s + v;
    if (e.frequencia === "quinzenal") return s + v * 2;
    if (e.frequencia === "semanal") return s + v * 4;
    if (e.frequencia === "trimestral") return s + v / 3;
    if (e.frequencia === "anual") return s + v / 12;
    return s + v;
  }, 0);

  return (
    <DashboardLayout>
      <div className="max-w-[1200px] mx-auto p-4 md:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lançamentos Recorrentes</h1>
            <p className="text-sm text-gray-500 mt-0.5">Cadastro de despesas e receitas automáticas</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9"
              onClick={() => generateMut.mutate({ companyId })}
              disabled={generateMut.isPending}>
              <Zap className="w-3.5 h-3.5 mr-1.5" />Gerar Pendentes
            </Button>
            <Button size="sm" className="h-9" onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />Nova Recorrência
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 font-medium">Recorrências Ativas</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{ativos.length}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 font-medium">Custo Mensal Estimado</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatBRL(totalMensal)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 font-medium">Pausadas</p>
              <p className="text-2xl font-bold text-gray-400 mt-1">{inativos.length}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <Repeat className="w-4 h-4" /> Recorrências Cadastradas
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {isLoading ? (
              <p className="text-center text-gray-400 py-8">Carregando...</p>
            ) : entries.length === 0 ? (
              <div className="text-center py-10">
                <Repeat className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Nenhuma recorrência cadastrada</p>
                <p className="text-xs text-gray-400 mt-1">Clique em "Nova Recorrência" para começar</p>
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((item: any) => {
                  const isReceita = item.tipo === "receita";
                  const isAtivo = item.ativo === 1;
                  return (
                    <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border ${
                      !isAtivo ? "bg-gray-50 border-gray-200 opacity-60" : "bg-white border-gray-100"
                    }`}>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isReceita ? "bg-green-100" : "bg-red-100"
                      }`}>
                        {isReceita ? <ArrowUpRight className="w-4 h-4 text-green-600" /> : <ArrowDownRight className="w-4 h-4 text-red-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-800 truncate">{item.descricao}</p>
                          <Badge variant="outline" className="text-[10px] h-5">
                            {FREQ_LABELS[item.frequencia] ?? item.frequencia}
                          </Badge>
                          {!isAtivo && <Badge variant="secondary" className="text-[10px] h-5">Pausado</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                          {item.fornecedorNome && <span>{item.fornecedorNome}</span>}
                          {item.contaNome && <span>{item.contaNome}</span>}
                          <span>Dia {item.diaVencimento}</span>
                          {item.proximoVencimento && (
                            <span className="flex items-center gap-0.5">
                              <Calendar className="w-3 h-3" />
                              Próximo: {new Date(item.proximoVencimento).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-sm font-bold ${isReceita ? "text-green-600" : "text-red-600"}`}>
                        {formatBRL(Number(item.valor ?? 0))}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(item)}>
                          <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => toggleAtivo(item)}>
                          {isAtivo ? <Pause className="w-3.5 h-3.5 text-orange-400" /> : <Play className="w-3.5 h-3.5 text-green-500" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-red-50"
                          onClick={() => handleDelete(item)}
                          disabled={deleteMut.isPending}
                          title="Excluir recorrência"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); resetForm(); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Recorrência" : "Nova Recorrência"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>Descrição *</Label>
                <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex: Aluguel escritório" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor *</Label>
                  <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="despesa">Despesa</SelectItem>
                      <SelectItem value="receita">Receita</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Frequência</Label>
                  <Select value={form.frequencia} onValueChange={(v) => setForm({ ...form, frequencia: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="semanal">Semanal</SelectItem>
                      <SelectItem value="quinzenal">Quinzenal</SelectItem>
                      <SelectItem value="mensal">Mensal</SelectItem>
                      <SelectItem value="trimestral">Trimestral</SelectItem>
                      <SelectItem value="anual">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Dia Vencimento</Label>
                  <Input type="number" min={1} max={31} value={form.diaVencimento} onChange={(e) => setForm({ ...form, diaVencimento: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {!editId && (
                  <div>
                    <Label>1º vencimento (opcional)</Label>
                    <Input type="date" value={form.primeiroVencimento} onChange={(e) => setForm({ ...form, primeiroVencimento: e.target.value })} />
                    <p className="text-[11px] text-gray-400 mt-1">Data da primeira parcela. Em branco: dia de vencimento deste mês (ou do próximo, se já passou).</p>
                  </div>
                )}
                <div>
                  <Label>Data limite (opcional)</Label>
                  <Input type="date" value={form.dataLimite} onChange={(e) => setForm({ ...form, dataLimite: e.target.value })} />
                  <p className="text-[11px] text-gray-400 mt-1">Última data em que a recorrência gera parcela; depois dela é encerrada automaticamente.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fornecedor/Pagador</Label>
                  <Input value={form.fornecedorNome} onChange={(e) => setForm({ ...form, fornecedorNome: e.target.value })} placeholder="Nome" />
                </div>
                <div>
                  <Label>Forma Pagamento</Label>
                  <Select value={form.formaPagamento || "none"} onValueChange={(v) => setForm({ ...form, formaPagamento: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="debito_automatico">Débito Automático</SelectItem>
                      <SelectItem value="cartao">Cartão</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Conta Contábil</Label>
                  <Input value={form.contaNome} onChange={(e) => setForm({ ...form, contaNome: e.target.value })} placeholder="Categoria" />
                </div>
                <div>
                  <Label>Obra</Label>
                  <Input value={form.obraNome} onChange={(e) => setForm({ ...form, obraNome: e.target.value })} placeholder="Obra (opcional)" />
                </div>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</Button>
              <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
                {editId ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
