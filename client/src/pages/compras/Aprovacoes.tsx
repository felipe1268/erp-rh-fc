import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckSquare, Clock, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ComprasAprovacoes() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const companyId = selectedCompany?.id ?? 0;
  const [recusaId, setRecusaId] = useState<number | null>(null);
  const [justificativa, setJustificativa] = useState("");

  const { data: pendentes, isLoading, refetch } = trpc.purchase.pendentesAprovacao.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const aprovarMut = trpc.purchase.aprovarSolicitacao.useMutation({
    onSuccess: () => { toast.success("Solicitação aprovada!"); refetch(); },
    onError: () => toast.error("Erro ao aprovar"),
  });
  const recusarMut = trpc.purchase.recusarSolicitacao.useMutation({
    onSuccess: () => { toast.success("Solicitação recusada."); setRecusaId(null); setJustificativa(""); refetch(); },
    onError: () => toast.error("Erro ao recusar"),
  });

  const lista = pendentes ?? [];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <CheckSquare className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Aprovações de Compras</h1>
            <p className="text-sm text-gray-500">Solicitações aguardando sua aprovação</p>
          </div>
          <Badge className="ml-auto bg-amber-100 text-amber-700 text-base px-4 py-1">
            {lista.length} pendente{lista.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Pendentes de Aprovação
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : lista.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-400" />
                <p className="font-medium">Nada pendente!</p>
                <p className="text-sm">Todas as solicitações foram processadas.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SC #</TableHead>
                    <TableHead>Solicitante</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor Est.</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((sc: any) => (
                    <TableRow key={sc.id} className={sc.emergencial ? "bg-red-50" : ""}>
                      <TableCell className="font-mono font-medium">#{sc.id}</TableCell>
                      <TableCell>{sc.solicitanteNome || "—"}</TableCell>
                      <TableCell>{sc.obraNome || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{sc.tipo}</Badge>
                      </TableCell>
                      <TableCell>
                        {sc.valorEstimadoTotal
                          ? `R$ ${Number(sc.valorEstimadoTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {sc.prazoNecessidade
                          ? format(new Date(sc.prazoNecessidade), "dd/MM/yyyy", { locale: ptBR })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {sc.emergencial ? (
                          <Badge className="bg-red-100 text-red-700 flex items-center gap-1 w-fit">
                            <AlertTriangle className="h-3 w-3" />Emergencial
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500">Normal</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" className="bg-green-600 hover:bg-green-700"
                            disabled={aprovarMut.isPending}
                            onClick={() => aprovarMut.mutate({ id: sc.id, aprovadorId: user?.id ?? 0, aprovadorNome: user?.nome })}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />Aprovar
                          </Button>
                          <Button size="sm" variant="destructive"
                            onClick={() => { setRecusaId(sc.id); setJustificativa(""); }}>
                            <XCircle className="h-3 w-3 mr-1" />Recusar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={recusaId !== null} onOpenChange={() => setRecusaId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Recusar Solicitação #{recusaId}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Informe o motivo da recusa para o solicitante:</p>
              <Textarea placeholder="Ex: Valor acima do orçamento previsto..." value={justificativa}
                onChange={e => setJustificativa(e.target.value)} rows={4} />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setRecusaId(null)}>Cancelar</Button>
                <Button variant="destructive" disabled={!justificativa.trim() || recusarMut.isPending}
                  onClick={() => recusaId && recusarMut.mutate({ id: recusaId, justificativa })}>
                  {recusarMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Confirmar Recusa
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
