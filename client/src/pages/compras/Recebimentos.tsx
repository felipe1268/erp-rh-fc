import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PackageCheck, Plus, Loader2, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  total:   { label: "Recebimento Total",   cls: "bg-green-100 text-green-700" },
  parcial: { label: "Recebimento Parcial", cls: "bg-amber-100 text-amber-700" },
  pendente:{ label: "Pendente",            cls: "bg-gray-100 text-gray-600"   },
};

export default function ComprasRecebimentos() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const companyId = selectedCompany?.id ?? 0;
  const [showNovo, setShowNovo] = useState(false);
  const [ordemId, setOrdemId] = useState("");
  const [notaFiscal, setNotaFiscal] = useState("");
  const [obs, setObs] = useState("");

  const { data, isLoading, refetch } = trpc.purchase.listarRecebimentos.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const criarMut = trpc.purchase.criarRecebimento.useMutation({
    onSuccess: () => {
      toast.success("Recebimento registrado!");
      setShowNovo(false); setOrdemId(""); setNotaFiscal(""); setObs("");
      refetch();
    },
    onError: () => toast.error("Erro ao registrar recebimento"),
  });

  const recebimentos = data ?? [];
  const totais = recebimentos.reduce((acc: any, r: any) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <PackageCheck className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Recebimentos de Materiais</h1>
            <p className="text-sm text-gray-500">Confirme o recebimento dos itens das Ordens de Compra</p>
          </div>
          <Button className="ml-auto bg-green-600 hover:bg-green-700" onClick={() => setShowNovo(true)}>
            <Plus className="h-4 w-4 mr-2" />Novo Recebimento
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { key: "total", label: "Recebimentos Totais", icon: CheckCircle2, color: "text-green-600 bg-green-50 border-green-200" },
            { key: "parcial", label: "Parciais", icon: Clock, color: "text-amber-600 bg-amber-50 border-amber-200" },
            { key: "pendente", label: "Pendentes", icon: AlertCircle, color: "text-gray-600 bg-gray-50 border-gray-200" },
          ].map(({ key, label, icon: Icon, color }) => (
            <Card key={key} className={`border ${color.split(" ")[2]}`}>
              <CardContent className={`pt-6 ${color.split(" ")[1]}`}>
                <div className="flex items-center gap-3">
                  <Icon className={`h-8 w-8 ${color.split(" ")[0]}`} />
                  <div>
                    <p className={`text-2xl font-bold ${color.split(" ")[0]}`}>{totais[key] || 0}</p>
                    <p className={`text-sm ${color.split(" ")[0]}`}>{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5" />
              Histórico de Recebimentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : recebimentos.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <PackageCheck className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>Nenhum recebimento registrado.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>OC #</TableHead>
                    <TableHead>Recebedor</TableHead>
                    <TableHead>Nota Fiscal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Valor Liberado</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recebimentos.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">#{r.id}</TableCell>
                      <TableCell className="font-mono">OC #{r.ordemId}</TableCell>
                      <TableCell>{r.recebedorNome || "—"}</TableCell>
                      <TableCell>{r.notaFiscalNumero || "—"}</TableCell>
                      <TableCell>
                        <Badge className={(STATUS_CFG[r.status] || STATUS_CFG.pendente).cls}>
                          {(STATUS_CFG[r.status] || STATUS_CFG.pendente).label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.valorLiberado
                          ? `R$ ${Number(r.valorLiberado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {r.recebidoEm
                          ? format(new Date(r.recebidoEm), "dd/MM/yyyy HH:mm", { locale: ptBR })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={showNovo} onOpenChange={setShowNovo}>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar Recebimento</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Número da OC</Label>
                <Input type="number" placeholder="ID da Ordem de Compra" value={ordemId} onChange={e => setOrdemId(e.target.value)} />
              </div>
              <div>
                <Label>Nota Fiscal</Label>
                <Input placeholder="Número da NF" value={notaFiscal} onChange={e => setNotaFiscal(e.target.value)} />
              </div>
              <div>
                <Label>Observações</Label>
                <Input placeholder="Observações sobre o recebimento" value={obs} onChange={e => setObs(e.target.value)} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowNovo(false)}>Cancelar</Button>
                <Button className="bg-green-600 hover:bg-green-700"
                  disabled={!ordemId || criarMut.isPending}
                  onClick={() => criarMut.mutate({
                    companyId, ordemId: parseInt(ordemId),
                    recebedorId: user?.id ?? 0, recebedorNome: user?.nome,
                    notaFiscalNumero: notaFiscal, observacoes: obs,
                    itens: [], userId: user?.id ?? 0, userName: user?.nome,
                  })}>
                  {criarMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Registrar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
