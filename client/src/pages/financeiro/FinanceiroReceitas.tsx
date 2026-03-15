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
import { Plus, Search, CheckCircle, Clock, XCircle, FileText } from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const STATUS_LABELS: Record<string, string> = {
  a_faturar: "A Faturar",
  faturado: "Faturado",
  a_receber: "A Receber",
  recebido_parcial: "Recebido Parcial",
  recebido_total: "Recebido Total",
  cancelado: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  a_faturar: "bg-yellow-100 text-yellow-800",
  faturado: "bg-blue-100 text-blue-800",
  a_receber: "bg-purple-100 text-purple-700",
  recebido_parcial: "bg-teal-100 text-teal-700",
  recebido_total: "bg-green-100 text-green-800",
  cancelado: "bg-red-100 text-red-700",
};

export default function FinanceiroReceitas() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showUpdate, setShowUpdate] = useState<any | null>(null);

  const [form, setForm] = useState({
    obraId: "",
    obraNome: "",
    clienteNome: "",
    clienteCnpj: "",
    valorContrato: "",
    valorMedicao: "",
    medicaoNumero: "",
    percentualMedicao: "",
    dataVencimento: "",
    retencaoISS: "0",
    retencaoINSS: "0",
    retencaoIR: "0",
    observacoes: "",
  });

  const [updateForm, setUpdateForm] = useState({
    status: "",
    nfNumero: "",
    nfEmitidaEm: "",
    dataRecebimento: "",
    valorRecebido: "",
    formaPagamento: "",
  });

  const { data: receitas, isLoading, refetch } = (trpc as any).financial.getRevenue.useQuery(
    { companyId, status: statusFilter !== "all" ? statusFilter : undefined, limit: 200 },
    { enabled: !!companyId }
  );

  const { data: obras } = (trpc as any).obras.getObras.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const createMut = (trpc as any).financial.createRevenue.useMutation({
    onSuccess: () => { toast({ title: "Receita registrada!" }); setShowNew(false); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateMut = (trpc as any).financial.updateRevenueStatus.useMutation({
    onSuccess: () => { toast({ title: "Status atualizado!" }); setShowUpdate(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const filtered = (receitas ?? []).filter((r: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.obraNome ?? "").toLowerCase().includes(q) || (r.clienteNome ?? "").toLowerCase().includes(q);
  });

  const totalPrevisto = filtered.filter((r: any) => r.status !== "cancelado").reduce((s: number, r: any) => s + Number(r.valorMedicao ?? 0), 0);
  const totalRecebido = filtered.filter((r: any) => r.status !== "cancelado").reduce((s: number, r: any) => s + Number(r.valorRecebido ?? 0), 0);

  function handleSave() {
    if (!form.valorMedicao) { toast({ title: "Informe o valor da medição", variant: "destructive" }); return; }
    createMut.mutate({
      companyId,
      obraId: parseInt(form.obraId) || 0,
      obraNome: form.obraNome || undefined,
      clienteNome: form.clienteNome || undefined,
      clienteCnpj: form.clienteCnpj || undefined,
      valorContrato: parseFloat(form.valorContrato) || undefined,
      valorMedicao: parseFloat(form.valorMedicao),
      medicaoNumero: parseInt(form.medicaoNumero) || undefined,
      percentualMedicao: parseFloat(form.percentualMedicao) || undefined,
      dataVencimento: form.dataVencimento || undefined,
      retencaoISS: parseFloat(form.retencaoISS) || 0,
      retencaoINSS: parseFloat(form.retencaoINSS) || 0,
      retencaoIR: parseFloat(form.retencaoIR) || 0,
      observacoes: form.observacoes || undefined,
    });
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Receitas de Obras</h1>
            <p className="text-sm text-gray-500 mt-1">Medições, faturamento e recebimentos</p>
          </div>
          <Button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" />Nova Receita
          </Button>
        </div>

        {/* Totais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Medições", value: totalPrevisto, color: "text-blue-600" },
            { label: "Total Recebido", value: totalRecebido, color: "text-green-600" },
            { label: "A Receber", value: totalPrevisto - totalRecebido, color: "text-orange-600" },
            { label: "Registros", value: filtered.length, isCurrency: false, color: "text-gray-700" },
          ].map(item => (
            <Card key={item.label} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                <p className={`text-lg font-bold ${item.color}`}>
                  {(item as any).isCurrency === false ? item.value : formatBRL(Number(item.value))}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex flex-wrap gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9" placeholder="Buscar obra ou cliente..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-gray-400">Nenhuma receita encontrada.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Obra / Cliente", "Medição", "Valor Medição", "NF", "Vencimento", "Recebido", "Status", "Ações"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((r: any) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{r.obraNome ?? "—"}</p>
                          <p className="text-xs text-gray-400">{r.clienteNome ?? ""}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">#{r.medicaoNumero ?? "—"}</td>
                        <td className="px-4 py-3 font-semibold text-green-700">{formatBRL(Number(r.valorMedicao ?? 0))}</td>
                        <td className="px-4 py-3 text-gray-600">{r.nfNumero ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-600">{r.dataVencimento ?? "—"}</td>
                        <td className="px-4 py-3 font-medium text-blue-700">{r.valorRecebido ? formatBRL(Number(r.valorRecebido)) : "—"}</td>
                        <td className="px-4 py-3">
                          <Badge className={`text-xs ${STATUS_COLORS[r.status] ?? ""}`}>{STATUS_LABELS[r.status] ?? r.status}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {r.status !== "cancelado" && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                              onClick={() => { setShowUpdate(r); setUpdateForm({ status: r.status, nfNumero: r.nfNumero ?? "", nfEmitidaEm: r.nfEmitidaEm ?? "", dataRecebimento: "", valorRecebido: "", formaPagamento: "" }); }}>
                              <FileText className="w-3 h-3 mr-1" />Atualizar
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

        {/* Modal novo */}
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nova Receita / Medição</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Obra</Label>
                  <Select value={form.obraId} onValueChange={v => {
                    const o = obras?.find((ob: any) => String(ob.id) === v);
                    setForm(f => ({ ...f, obraId: v, obraNome: o?.nome ?? "" }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {(obras ?? []).map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nº da Medição</Label>
                  <Input type="number" value={form.medicaoNumero} onChange={e => setForm(f => ({ ...f, medicaoNumero: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cliente</Label>
                  <Input value={form.clienteNome} onChange={e => setForm(f => ({ ...f, clienteNome: e.target.value }))} />
                </div>
                <div>
                  <Label>CNPJ do Cliente</Label>
                  <Input value={form.clienteCnpj} onChange={e => setForm(f => ({ ...f, clienteCnpj: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valor do Contrato (R$)</Label>
                  <Input type="number" step="0.01" value={form.valorContrato} onChange={e => setForm(f => ({ ...f, valorContrato: e.target.value }))} />
                </div>
                <div>
                  <Label>Valor da Medição (R$) *</Label>
                  <Input type="number" step="0.01" value={form.valorMedicao} onChange={e => setForm(f => ({ ...f, valorMedicao: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>% da Medição</Label>
                  <Input type="number" step="0.01" value={form.percentualMedicao} onChange={e => setForm(f => ({ ...f, percentualMedicao: e.target.value }))} />
                </div>
                <div>
                  <Label>Data de Vencimento</Label>
                  <Input type="date" value={form.dataVencimento} onChange={e => setForm(f => ({ ...f, dataVencimento: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Retenção ISS (R$)</Label>
                  <Input type="number" step="0.01" value={form.retencaoISS} onChange={e => setForm(f => ({ ...f, retencaoISS: e.target.value }))} />
                </div>
                <div>
                  <Label>Retenção INSS (R$)</Label>
                  <Input type="number" step="0.01" value={form.retencaoINSS} onChange={e => setForm(f => ({ ...f, retencaoINSS: e.target.value }))} />
                </div>
                <div>
                  <Label>Retenção IR (R$)</Label>
                  <Input type="number" step="0.01" value={form.retencaoIR} onChange={e => setForm(f => ({ ...f, retencaoIR: e.target.value }))} />
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

        {/* Modal atualizar status */}
        <Dialog open={!!showUpdate} onOpenChange={() => setShowUpdate(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Atualizar Status da Receita</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Novo Status</Label>
                <Select value={updateForm.status} onValueChange={v => setUpdateForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nº da NF</Label>
                  <Input value={updateForm.nfNumero} onChange={e => setUpdateForm(f => ({ ...f, nfNumero: e.target.value }))} />
                </div>
                <div>
                  <Label>Emissão NF</Label>
                  <Input type="date" value={updateForm.nfEmitidaEm} onChange={e => setUpdateForm(f => ({ ...f, nfEmitidaEm: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data de Recebimento</Label>
                  <Input type="date" value={updateForm.dataRecebimento} onChange={e => setUpdateForm(f => ({ ...f, dataRecebimento: e.target.value }))} />
                </div>
                <div>
                  <Label>Valor Recebido (R$)</Label>
                  <Input type="number" step="0.01" value={updateForm.valorRecebido} onChange={e => setUpdateForm(f => ({ ...f, valorRecebido: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Forma de Pagamento</Label>
                <Select value={updateForm.formaPagamento} onValueChange={v => setUpdateForm(f => ({ ...f, formaPagamento: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {["pix","ted","boleto","cheque","dinheiro"].map(v => <SelectItem key={v} value={v}>{v.toUpperCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUpdate(null)}>Cancelar</Button>
              <Button disabled={updateMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => updateMut.mutate({ id: showUpdate.id, companyId, status: updateForm.status, nfNumero: updateForm.nfNumero || undefined, nfEmitidaEm: updateForm.nfEmitidaEm || undefined, dataRecebimento: updateForm.dataRecebimento || undefined, valorRecebido: parseFloat(updateForm.valorRecebido) || undefined, formaPagamento: updateForm.formaPagamento || undefined })}>
                {updateMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
