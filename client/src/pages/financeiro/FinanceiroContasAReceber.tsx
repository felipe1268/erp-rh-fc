import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, AlertTriangle, Search, TrendingUp } from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default function FinanceiroContasAReceber() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showReceive, setShowReceive] = useState<any | null>(null);
  const [dataRecebimento, setDataRecebimento] = useState(new Date().toISOString().split("T")[0]);
  const [valorRecebido, setValorRecebido] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("pix");

  const { data: contas, isLoading, refetch } = (trpc as any).financial.getContasAReceber.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const receiveMut = (trpc as any).financial.updateEntryStatus.useMutation({
    onSuccess: () => { toast({ title: "Recebimento registrado!" }); setShowReceive(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const filtered = (contas ?? []).filter((c: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.descricao ?? "").toLowerCase().includes(q) || (c.obraNome ?? "").toLowerCase().includes(q);
  });

  const hoje = new Date().toISOString().split("T")[0];
  const vencidas = filtered.filter((c: any) => c.dataVencimento && c.dataVencimento < hoje);
  const aVencer = filtered.filter((c: any) => !c.dataVencimento || c.dataVencimento >= hoje);
  const totalPendente = filtered.reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);
  const totalVencido = vencidas.reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);

  function handleReceive() {
    receiveMut.mutate({
      id: showReceive.id,
      companyId,
      status: "recebido",
      dataPagamento: dataRecebimento,
      valorRealizado: parseFloat(valorRecebido) || Number(showReceive.valorPrevisto),
      formaPagamento,
    });
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contas a Receber</h1>
          <p className="text-sm text-gray-500 mt-1">Receitas pendentes de recebimento</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">Total a Receber</p>
              <p className="text-xl font-bold text-blue-600">{formatBRL(totalPendente)}</p>
              <p className="text-xs text-gray-400">{filtered.length} conta(s)</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" />Vencidas</p>
              <p className="text-xl font-bold text-red-600">{formatBRL(totalVencido)}</p>
              <p className="text-xs text-gray-400">{vencidas.length} conta(s)</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3 text-green-500" />A Vencer</p>
              <p className="text-xl font-bold text-green-600">{formatBRL(totalPendente - totalVencido)}</p>
              <p className="text-xs text-gray-400">{aVencer.length} conta(s)</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {vencidas.length > 0 && (
          <Card className="border-0 shadow-sm border-l-4 border-l-red-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />Vencidas ({vencidas.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-red-50">
                {vencidas.map((c: any) => (
                  <div key={c.id} className="px-5 py-3 flex items-center justify-between bg-red-50/40 hover:bg-red-50">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{c.descricao ?? c.obraNome ?? "—"}</p>
                      <p className="text-xs text-gray-500">Venc.: {c.dataVencimento} • Atraso: <span className="text-red-600 font-medium">{c.diasAtraso} dias</span></p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-bold text-red-700">{formatBRL(Number(c.valorPrevisto))}</p>
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-7 px-2 text-xs"
                        onClick={() => { setShowReceive(c); setValorRecebido(String(c.valorPrevisto)); }}>
                        <CheckCircle className="w-3 h-3 mr-1" />Receber
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">A Vencer ({aVencer.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Carregando...</div>
            ) : aVencer.length === 0 ? (
              <div className="p-8 text-center text-gray-400">Nenhuma conta a vencer.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {aVencer.map((c: any) => (
                  <div key={c.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{c.descricao ?? c.obraNome ?? "—"}</p>
                      <p className="text-xs text-gray-500">Venc.: {c.dataVencimento ?? "Sem data"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-bold text-blue-700">{formatBRL(Number(c.valorPrevisto))}</p>
                      <Button size="sm" variant="outline" className="text-blue-600 border-blue-300 h-7 px-2 text-xs"
                        onClick={() => { setShowReceive(c); setValorRecebido(String(c.valorPrevisto)); }}>
                        <CheckCircle className="w-3 h-3 mr-1" />Receber
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!showReceive} onOpenChange={() => setShowReceive(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Registrar Recebimento</DialogTitle></DialogHeader>
            {showReceive && (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-medium">{showReceive.descricao ?? showReceive.obraNome ?? "—"}</p>
                  <p className="text-lg font-bold text-blue-700">{formatBRL(Number(showReceive.valorPrevisto))}</p>
                </div>
                <div>
                  <Label>Data do Recebimento</Label>
                  <Input type="date" value={dataRecebimento} onChange={e => setDataRecebimento(e.target.value)} />
                </div>
                <div>
                  <Label>Valor Recebido (R$)</Label>
                  <Input type="number" step="0.01" value={valorRecebido} onChange={e => setValorRecebido(e.target.value)} />
                </div>
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["pix","ted","boleto","cheque","dinheiro"].map(v => <SelectItem key={v} value={v}>{v.toUpperCase()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReceive(null)}>Cancelar</Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" disabled={receiveMut.isPending} onClick={handleReceive}>
                {receiveMut.isPending ? "Registrando..." : "Confirmar Recebimento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
