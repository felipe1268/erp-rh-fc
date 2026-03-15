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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingDown, Calculator, CheckCircle2, Clock, Loader2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  em_aberto:       { label: "Em Aberto",       cls: "bg-gray-100 text-gray-600" },
  aprovada_diretor:{ label: "Aprovada",         cls: "bg-green-100 text-green-700" },
  paga:            { label: "Paga",             cls: "bg-blue-100 text-blue-700" },
};

export default function ComprasComissoes() {
  const { company } = useCompany();
  const { user } = useAuth();
  const companyId = company?.id ?? 0;
  const [showCalc, setShowCalc] = useState(false);
  const [obraId, setObraId] = useState("");
  const [compradorId, setCompradorId] = useState("");
  const [percentual, setPercentual] = useState("5");

  const { data: obras } = trpc.obras.list.useQuery({ companyId }, { enabled: !!companyId });
  const { data, isLoading, refetch } = trpc.purchase.listarComissoes.useQuery({ companyId }, { enabled: !!companyId });

  const calcularMut = trpc.purchase.calcularComissoes.useMutation({
    onSuccess: () => {
      toast.success("Comissão calculada!");
      setShowCalc(false); refetch();
    },
    onError: () => toast.error("Erro ao calcular comissão"),
  });

  const aprovarMut = trpc.purchase.aprovarComissao.useMutation({
    onSuccess: () => { toast.success("Comissão aprovada e lançamento financeiro gerado!"); refetch(); },
    onError: () => toast.error("Erro ao aprovar comissão"),
  });

  const comissoes = data ?? [];
  const totalEconomia = comissoes.reduce((s: number, c: any) => s + Number(c.economiaTotal || 0), 0);
  const totalComissao = comissoes.reduce((s: number, c: any) => s + Number(c.valorComissao || 0), 0);
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const obraMap = Object.fromEntries((obras ?? []).map((o: any) => [String(o.id), o.nome]));

  return (
    <DashboardLayout module="compras">
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-100 rounded-lg">
            <TrendingDown className="h-6 w-6 text-yellow-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Comissões de Compradores</h1>
            <p className="text-sm text-gray-500">Incentivo por economia vs. metas de orçamento</p>
          </div>
          <Button className="ml-auto bg-yellow-600 hover:bg-yellow-700" onClick={() => setShowCalc(true)}>
            <Calculator className="h-4 w-4 mr-2" />Calcular Comissão
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <TrendingDown className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-xl font-bold text-green-700">{fmt(totalEconomia)}</p>
                  <p className="text-sm text-green-600">Total de Economia Gerada</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-yellow-600" />
                <div>
                  <p className="text-xl font-bold text-yellow-700">{fmt(totalComissao)}</p>
                  <p className="text-sm text-yellow-600">Total de Comissões</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-blue-700">{comissoes.filter((c: any) => c.status === "em_aberto").length}</p>
                  <p className="text-sm text-blue-600">Aguardando Aprovação</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Comissões Calculadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : comissoes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calculator className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>Nenhuma comissão calculada ainda.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Comprador</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead>Meta</TableHead>
                    <TableHead>Comprado</TableHead>
                    <TableHead>Economia</TableHead>
                    <TableHead>%</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comissoes.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.compradorNome || "—"}</TableCell>
                      <TableCell>{c.obraNome || obraMap[String(c.obraId)] || "—"}</TableCell>
                      <TableCell>{fmt(Number(c.valorMetaTotal || 0))}</TableCell>
                      <TableCell>{fmt(Number(c.valorCompradoTotal || 0))}</TableCell>
                      <TableCell className="font-medium text-green-700">{fmt(Number(c.economiaTotal || 0))}</TableCell>
                      <TableCell>{Number(c.percentualParticipacao || 0).toFixed(0)}%</TableCell>
                      <TableCell className="font-bold text-yellow-700">{fmt(Number(c.valorComissao || 0))}</TableCell>
                      <TableCell>
                        <Badge className={(STATUS_CFG[c.status] || STATUS_CFG.em_aberto).cls}>
                          {(STATUS_CFG[c.status] || STATUS_CFG.em_aberto).label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.status === "em_aberto" && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700"
                            disabled={aprovarMut.isPending}
                            onClick={() => aprovarMut.mutate({ id: c.id, userId: user?.id ?? 0, userName: user?.nome })}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />Aprovar
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

        <Dialog open={showCalc} onOpenChange={setShowCalc}>
          <DialogContent>
            <DialogHeader><DialogTitle>Calcular Comissão</DialogTitle></DialogHeader>
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
              <div>
                <Label>ID do Comprador</Label>
                <Input type="number" placeholder="ID do usuário comprador" value={compradorId} onChange={e => setCompradorId(e.target.value)} />
              </div>
              <div>
                <Label>Percentual de Participação (%)</Label>
                <Input type="number" step="0.5" min="0" max="100" value={percentual} onChange={e => setPercentual(e.target.value)} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowCalc(false)}>Cancelar</Button>
                <Button className="bg-yellow-600 hover:bg-yellow-700"
                  disabled={!obraId || !compradorId || calcularMut.isPending}
                  onClick={() => calcularMut.mutate({
                    companyId, obraId: parseInt(obraId),
                    compradorId: parseInt(compradorId), compradorNome: "Comprador",
                    obraNome: obraMap[obraId] || "",
                    percentualParticipacao: Number(percentual),
                  })}>
                  {calcularMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Calcular
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
