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
import { Plus, Search, X, CheckCircle, AlertTriangle, TrendingUp, TrendingDown, Filter } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const STATUS_COLORS: Record<string, string> = {
  previsto: "bg-gray-100 text-gray-700",
  a_pagar: "bg-orange-100 text-orange-700",
  a_receber: "bg-blue-100 text-blue-700",
  pago: "bg-green-100 text-green-700",
  recebido: "bg-green-100 text-green-700",
  cancelado: "bg-red-100 text-red-700",
  provisionado: "bg-purple-100 text-purple-700",
};

const STATUS_LABELS: Record<string, string> = {
  previsto: "Previsto",
  a_pagar: "A Pagar",
  a_receber: "A Receber",
  pago: "Pago",
  recebido: "Recebido",
  cancelado: "Cancelado",
  provisionado: "Provisionado",
};

export default function FinanceiroLancamentos() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [mes, setMes] = useState(getMesAtual());
  const [tipo, setTipo] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showCancel, setShowCancel] = useState<{ id: number } | null>(null);
  const [motivo, setMotivo] = useState("");

  const [form, setForm] = useState({
    tipo: "despesa" as any,
    natureza: "fixo" as any,
    valorPrevisto: "",
    dataCompetencia: new Date().toISOString().split("T")[0],
    dataVencimento: "",
    descricao: "",
    contaNome: "",
    obraNome: "",
    formaPagamento: "",
    observacoes: "",
    status: "a_pagar",
  });

  const { data, isLoading, refetch } = (trpc as any).financial.getEntries.useQuery(
    {
      companyId,
      mesCompetencia: mes,
      tipo: tipo !== "all" ? tipo : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      limit: 200,
      offset: 0,
    },
    { enabled: !!companyId }
  );

  const createMut = (trpc as any).financial.createEntry.useMutation({
    onSuccess: () => { toast({ title: "Lançamento criado!" }); setShowNew(false); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const cancelMut = (trpc as any).financial.cancelEntry.useMutation({
    onSuccess: () => { toast({ title: "Lançamento cancelado" }); setShowCancel(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const paidMut = (trpc as any).financial.updateEntryStatus.useMutation({
    onSuccess: () => { toast({ title: "Status atualizado!" }); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const lancamentos = (data?.data ?? []).filter((l: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (l.descricao ?? "").toLowerCase().includes(q) || (l.obraNome ?? "").toLowerCase().includes(q) || (l.contaNome ?? "").toLowerCase().includes(q);
  });

  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const totalReceitas = lancamentos.filter((l: any) => l.tipo === "receita" && l.status !== "cancelado").reduce((s: number, l: any) => s + Number(l.valorPrevisto ?? 0), 0);
  const totalDespesas = lancamentos.filter((l: any) => l.tipo === "despesa" && l.status !== "cancelado").reduce((s: number, l: any) => s + Number(l.valorPrevisto ?? 0), 0);

  function handleSave() {
    if (!form.valorPrevisto || !form.dataCompetencia) {
      toast({ title: "Preencha valor e data de competência", variant: "destructive" });
      return;
    }
    createMut.mutate({
      companyId,
      tipo: form.tipo,
      natureza: form.natureza,
      valorPrevisto: parseFloat(form.valorPrevisto),
      dataCompetencia: form.dataCompetencia,
      dataVencimento: form.dataVencimento || undefined,
      descricao: form.descricao || undefined,
      contaNome: form.contaNome || undefined,
      obraNome: form.obraNome || undefined,
      formaPagamento: form.formaPagamento || undefined,
      observacoes: form.observacoes || undefined,
      status: form.tipo === "receita" ? "a_receber" : form.status,
    });
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lançamentos Financeiros</h1>
            <p className="text-sm text-gray-500 mt-1">Receitas e despesas da empresa</p>
          </div>
          <Button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" />Novo Lançamento
          </Button>
        </div>

        {/* Totalizadores */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-xs text-gray-500">Total Receitas</span>
              </div>
              <p className="text-xl font-bold text-green-600">{formatBRL(totalReceitas)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <span className="text-xs text-gray-500">Total Despesas</span>
              </div>
              <p className="text-xl font-bold text-red-500">{formatBRL(totalDespesas)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-blue-600" />
                <span className="text-xs text-gray-500">Resultado</span>
              </div>
              <p className={`text-xl font-bold ${totalReceitas - totalDespesas >= 0 ? "text-blue-600" : "text-red-600"}`}>
                {formatBRL(totalReceitas - totalDespesas)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              <Select value={mes} onValueChange={setMes}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {meses.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Tipos</SelectItem>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="imposto">Imposto</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input className="pl-9" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="w-4 h-4" />
              {lancamentos.length} lançamento(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Carregando...</div>
            ) : lancamentos.length === 0 ? (
              <div className="p-8 text-center text-gray-400">Nenhum lançamento encontrado.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {lancamentos.map((l: any) => (
                  <div key={l.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800 truncate">{l.descricao ?? l.contaNome ?? "—"}</span>
                        {l.obraNome && <span className="text-xs text-gray-400 hidden sm:inline">• {l.obraNome}</span>}
                        <Badge className={`text-xs ${STATUS_COLORS[l.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {STATUS_LABELS[l.status] ?? l.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Comp.: {l.dataCompetencia}
                        {l.dataVencimento && ` • Venc.: ${l.dataVencimento}`}
                        {l.origemModulo && ` • Origem: ${l.origemModulo}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <p className={`text-sm font-bold ${l.tipo === "receita" ? "text-green-600" : "text-red-500"}`}>
                        {l.tipo === "receita" ? "+" : "-"}{formatBRL(Number(l.valorPrevisto))}
                      </p>
                      {l.status === "a_pagar" && (
                        <Button size="sm" variant="outline" className="text-green-600 border-green-300 h-7 px-2 text-xs"
                          onClick={() => paidMut.mutate({ id: l.id, companyId, status: "pago", dataPagamento: new Date().toISOString().split("T")[0] })}>
                          <CheckCircle className="w-3 h-3 mr-1" />Pagar
                        </Button>
                      )}
                      {l.status === "a_receber" && (
                        <Button size="sm" variant="outline" className="text-blue-600 border-blue-300 h-7 px-2 text-xs"
                          onClick={() => paidMut.mutate({ id: l.id, companyId, status: "recebido", dataPagamento: new Date().toISOString().split("T")[0] })}>
                          <CheckCircle className="w-3 h-3 mr-1" />Receber
                        </Button>
                      )}
                      {l.status !== "cancelado" && (
                        <Button size="sm" variant="ghost" className="text-red-500 h-7 w-7 p-0"
                          onClick={() => setShowCancel({ id: l.id })}>
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal novo lançamento */}
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Lançamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receita">Receita</SelectItem>
                      <SelectItem value="despesa">Despesa</SelectItem>
                      <SelectItem value="imposto">Imposto</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Natureza</Label>
                  <Select value={form.natureza} onValueChange={v => setForm(f => ({ ...f, natureza: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixo">Fixo</SelectItem>
                      <SelectItem value="variavel">Variável</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descrição do lançamento" />
              </div>
              <div>
                <Label>Conta / Categoria</Label>
                <Input value={form.contaNome} onChange={e => setForm(f => ({ ...f, contaNome: e.target.value }))} placeholder="Ex: Salários, Material de Obra..." />
              </div>
              <div>
                <Label>Obra (opcional)</Label>
                <Input value={form.obraNome} onChange={e => setForm(f => ({ ...f, obraNome: e.target.value }))} placeholder="Nome da obra" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valor (R$)</Label>
                  <Input type="number" step="0.01" value={form.valorPrevisto} onChange={e => setForm(f => ({ ...f, valorPrevisto: e.target.value }))} placeholder="0,00" />
                </div>
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select value={form.formaPagamento} onValueChange={v => setForm(f => ({ ...f, formaPagamento: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="ted">TED</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                      <SelectItem value="debito_automatico">Débito Automático</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data de Competência</Label>
                  <Input type="date" value={form.dataCompetencia} onChange={e => setForm(f => ({ ...f, dataCompetencia: e.target.value }))} />
                </div>
                <div>
                  <Label>Data de Vencimento</Label>
                  <Input type="date" value={form.dataVencimento} onChange={e => setForm(f => ({ ...f, dataVencimento: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={createMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {createMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal cancelar */}
        <Dialog open={!!showCancel} onOpenChange={() => setShowCancel(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Cancelar Lançamento</DialogTitle>
            </DialogHeader>
            <div>
              <Label>Motivo do cancelamento (obrigatório)</Label>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} placeholder="Informe o motivo..." className="mt-1" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCancel(null)}>Voltar</Button>
              <Button variant="destructive" disabled={motivo.length < 5 || cancelMut.isPending}
                onClick={() => cancelMut.mutate({ id: showCancel!.id, companyId, motivoCancelamento: motivo })}>
                {cancelMut.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
