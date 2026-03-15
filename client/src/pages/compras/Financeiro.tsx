import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DollarSign, Lock, CheckCircle2, AlertCircle, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  bloqueado: { label: "Bloqueado",   cls: "bg-gray-100 text-gray-600" },
  pendente:  { label: "Pendente",    cls: "bg-amber-100 text-amber-700" },
  pago:      { label: "Pago",        cls: "bg-green-100 text-green-700" },
  cancelado: { label: "Cancelado",   cls: "bg-red-100 text-red-600" },
};

export default function ComprasFinanceiro() {
  const { company } = useCompany();
  const companyId = company?.id ?? 0;
  const [pagandoId, setPagandoId] = useState<number | null>(null);
  const [dataPag, setDataPag] = useState(new Date().toISOString().split("T")[0]);
  const [valorPago, setValorPago] = useState("");

  const { data, isLoading, refetch } = trpc.purchase.listarContasPagar.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const marcarPagoMut = trpc.purchase.marcarPago.useMutation({
    onSuccess: () => {
      toast.success("Pagamento registrado!");
      setPagandoId(null); setValorPago(""); refetch();
    },
    onError: () => toast.error("Erro ao registrar pagamento"),
  });

  const ap = data ?? [];
  const totalPendente = ap.filter((a: any) => a.status === "pendente").reduce((s: number, a: any) => s + (Number(a.valorTotal) - Number(a.valorPago || 0)), 0);
  const totalBloqueado = ap.filter((a: any) => a.status === "bloqueado").reduce((s: number, a: any) => s + Number(a.valorTotal), 0);
  const totalPago = ap.filter((a: any) => a.status === "pago").reduce((s: number, a: any) => s + Number(a.valorPago || 0), 0);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <DashboardLayout module="compras">
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <DollarSign className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financeiro de Compras</h1>
            <p className="text-sm text-gray-500">Contas a pagar geradas pelas Ordens de Compra</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "A Pagar (Liberado)", value: totalPendente, icon: AlertCircle, cls: "border-amber-200 bg-amber-50 text-amber-700" },
            { label: "Bloqueado (Aguard. Receb.)", value: totalBloqueado, icon: Lock, cls: "border-gray-200 bg-gray-50 text-gray-600" },
            { label: "Total Pago (Mês)", value: totalPago, icon: CheckCircle2, cls: "border-green-200 bg-green-50 text-green-700" },
          ].map(({ label, value, icon: Icon, cls }) => (
            <Card key={label} className={`border ${cls.split(" ")[0]}`}>
              <CardContent className={`pt-6 ${cls.split(" ")[1]}`}>
                <div className="flex items-center gap-3">
                  <Icon className={`h-8 w-8 ${cls.split(" ")[2]}`} />
                  <div>
                    <p className={`text-xl font-bold ${cls.split(" ")[2]}`}>{fmt(value)}</p>
                    <p className={`text-xs ${cls.split(" ")[2]}`}>{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Contas a Pagar
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : ap.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <DollarSign className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>Nenhuma conta a pagar registrada.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor Total</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ap.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono">#{a.id}</TableCell>
                      <TableCell className="font-medium">{a.supplierNome || "—"}</TableCell>
                      <TableCell className="max-w-xs truncate">{a.descricao || "—"}</TableCell>
                      <TableCell>{fmt(Number(a.valorTotal))}</TableCell>
                      <TableCell>
                        {a.dataVencimento
                          ? format(new Date(a.dataVencimento), "dd/MM/yyyy", { locale: ptBR })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={(STATUS_CFG[a.status] || STATUS_CFG.bloqueado).cls}>
                          {(STATUS_CFG[a.status] || STATUS_CFG.bloqueado).label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {a.status === "pendente" && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700"
                            onClick={() => { setPagandoId(a.id); setValorPago(String(a.valorTotal)); }}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />Registrar Pagto
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={pagandoId !== null} onOpenChange={() => setPagandoId(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Data do Pagamento</Label>
                <Input type="date" value={dataPag} onChange={e => setDataPag(e.target.value)} />
              </div>
              <div>
                <Label>Valor Pago (R$)</Label>
                <Input type="number" step="0.01" value={valorPago} onChange={e => setValorPago(e.target.value)} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setPagandoId(null)}>Cancelar</Button>
                <Button className="bg-green-600 hover:bg-green-700"
                  disabled={!dataPag || marcarPagoMut.isPending}
                  onClick={() => pagandoId && marcarPagoMut.mutate({ id: pagandoId, dataPagamento: dataPag, valorPago: Number(valorPago) })}>
                  {marcarPagoMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Confirmar Pagamento
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
