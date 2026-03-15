import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Zap, Clock, CheckCircle2, XCircle, BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ComprasEmergencial() {
  const { company } = useCompany();
  const { user } = useAuth();
  const companyId = company?.id ?? 0;

  const { data, isLoading, refetch } = trpc.purchase.metricsEmergencial.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const aprovarMut = trpc.purchase.aprovarSolicitacao.useMutation({
    onSuccess: () => { toast.success("SC aprovada!"); refetch(); },
    onError: () => toast.error("Erro ao aprovar"),
  });
  const recusarMut = trpc.purchase.recusarSolicitacao.useMutation({
    onSuccess: () => { toast.success("SC recusada."); refetch(); },
    onError: () => toast.error("Erro ao recusar"),
  });

  const emergenciais = data?.emergenciais ?? [];
  const total = emergenciais.length;
  const pendentes = emergenciais.filter((s: any) => s.status === "pendente").length;

  return (
    <DashboardLayout module="compras">
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Compras Emergenciais</h1>
            <p className="text-sm text-gray-500">Solicitações com prioridade máxima — SLA 4 horas</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Zap className="h-8 w-8 text-red-600" />
                <div>
                  <p className="text-2xl font-bold text-red-700">{total}</p>
                  <p className="text-sm text-red-600">Total Emergenciais</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-amber-600" />
                <div>
                  <p className="text-2xl font-bold text-amber-700">{pendentes}</p>
                  <p className="text-sm text-amber-600">Aguardando Aprovação</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-blue-700">
                    {total > 0 ? ((pendentes / total) * 100).toFixed(0) : 0}%
                  </p>
                  <p className="text-sm text-blue-600">Taxa de Pendência</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Solicitações Emergenciais
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : emergenciais.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-400" />
                <p>Nenhuma compra emergencial no momento.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SC #</TableHead>
                    <TableHead>Solicitante</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead>Justificativa</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emergenciais.map((sc: any) => (
                    <TableRow key={sc.id} className="bg-red-50/50">
                      <TableCell className="font-mono font-medium text-red-700">#{sc.id}</TableCell>
                      <TableCell>{sc.solicitanteNome || "—"}</TableCell>
                      <TableCell>{sc.obraNome || "—"}</TableCell>
                      <TableCell className="max-w-xs truncate">{sc.justificativaEmergencial || "—"}</TableCell>
                      <TableCell>
                        {sc.prazoNecessidade
                          ? format(new Date(sc.prazoNecessidade), "dd/MM/yyyy", { locale: ptBR })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          sc.status === "pendente" ? "bg-amber-100 text-amber-700" :
                          sc.status === "aprovada" ? "bg-green-100 text-green-700" :
                          sc.status === "recusada" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-600"
                        }>
                          {sc.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {sc.status === "pendente" && (
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700"
                              disabled={aprovarMut.isPending}
                              onClick={() => aprovarMut.mutate({ id: sc.id, aprovadorId: user?.id ?? 0, aprovadorNome: user?.nome })}>
                              <CheckCircle2 className="h-3 w-3 mr-1" />Aprovar
                            </Button>
                            <Button size="sm" variant="destructive"
                              disabled={recusarMut.isPending}
                              onClick={() => recusarMut.mutate({ id: sc.id, justificativa: "Recusado pelo aprovador" })}>
                              <XCircle className="h-3 w-3 mr-1" />Recusar
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
