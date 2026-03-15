import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeftRight, Plus, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ComprasRealocacao() {
  const { company } = useCompany();
  const { user } = useAuth();
  const companyId = company?.id ?? 0;
  const [showNova, setShowNova] = useState(false);
  const [obraId, setObraId] = useState("");
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");

  const { data: obras } = trpc.obras.list.useQuery({ companyId }, { enabled: !!companyId });

  const { data, isLoading, refetch } = trpc.purchase.listarRealocacoes.useQuery(
    { companyId, obraId: obraId ? parseInt(obraId) : undefined },
    { enabled: !!companyId }
  );

  const criarMut = trpc.purchase.criarRealocacao.useMutation({
    onSuccess: () => {
      toast.success("Realocação registrada!");
      setShowNova(false); setOrigem(""); setDestino(""); setValor(""); setMotivo("");
      refetch();
    },
    onError: () => toast.error("Erro ao criar realocação"),
  });

  const realocacoes = data ?? [];
  const totalRealocado = realocacoes.reduce((s: number, r: any) => s + Number(r.valorRealocado), 0);
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <DashboardLayout module="compras">
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <ArrowLeftRight className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Realocação de Verba</h1>
            <p className="text-sm text-gray-500">Transfira orçamento entre itens da EAP dentro de uma obra</p>
          </div>
          <Button className="ml-auto bg-purple-600 hover:bg-purple-700" onClick={() => setShowNova(true)}>
            <Plus className="h-4 w-4 mr-2" />Nova Realocação
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-purple-200 bg-purple-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <ArrowLeftRight className="h-8 w-8 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold text-purple-700">{realocacoes.length}</p>
                  <p className="text-sm text-purple-600">Total de Realocações</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-xl font-bold text-blue-700">{fmt(totalRealocado)}</p>
                  <p className="text-sm text-blue-600">Volume Realocado</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Histórico de Realocações</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : realocacoes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <ArrowLeftRight className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>Nenhuma realocação registrada.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {realocacoes.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">#{r.id}</TableCell>
                      <TableCell>{r.obraId || "—"}</TableCell>
                      <TableCell>{r.origemEapItemNome || `Item #${r.origemEapItemId}` || "—"}</TableCell>
                      <TableCell>{r.destinoEapItemNome || `Item #${r.destinoEapItemId}` || "—"}</TableCell>
                      <TableCell className="font-medium text-purple-700">{fmt(Number(r.valorRealocado))}</TableCell>
                      <TableCell className="max-w-xs truncate">{r.motivo}</TableCell>
                      <TableCell>{r.usuarioNome || "—"}</TableCell>
                      <TableCell>{format(new Date(r.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={showNova} onOpenChange={setShowNova}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Realocação de Verba</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Obra</Label>
                <Select value={obraId} onValueChange={setObraId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                  <SelectContent>
                    {(obras ?? []).map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Item de Origem (EAP)</Label>
                  <Input placeholder="Nome do item de origem" value={origem} onChange={e => setOrigem(e.target.value)} />
                </div>
                <div>
                  <Label>Item de Destino (EAP)</Label>
                  <Input placeholder="Nome do item de destino" value={destino} onChange={e => setDestino(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Valor a Realocar (R$)</Label>
                <Input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} />
              </div>
              <div>
                <Label>Motivo da Realocação</Label>
                <Textarea placeholder="Justifique a necessidade da realocação..." value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowNova(false)}>Cancelar</Button>
                <Button className="bg-purple-600 hover:bg-purple-700"
                  disabled={!obraId || !valor || !motivo.trim() || criarMut.isPending}
                  onClick={() => criarMut.mutate({
                    companyId, obraId: parseInt(obraId),
                    origemEapItemNome: origem, destinoEapItemNome: destino,
                    valorRealocado: Number(valor), motivo,
                    usuarioId: user?.id ?? 0, usuarioNome: user?.nome,
                  })}>
                  {criarMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Confirmar Realocação
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
