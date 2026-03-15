import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Plus, Layers, Building2 } from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const TIPO_COLORS: Record<string, string> = {
  obra: "bg-blue-100 text-blue-800",
  administrativo: "bg-gray-100 text-gray-700",
  comercial: "bg-green-100 text-green-800",
  financeiro: "bg-purple-100 text-purple-800",
};

export default function FinanceiroCentrosCusto() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    codigo: "", nome: "", tipo: "obra",
    obraId: "", responsavelNome: "", orcamentoMensal: "",
  });

  const { data: centros, isLoading, refetch } = (trpc as any).financial.getCostCenters.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const { data: obras } = (trpc as any).obras.getObras.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const createMut = (trpc as any).financial.createCostCenter.useMutation({
    onSuccess: () => { toast({ title: "Centro de custo criado!" }); setShowNew(false); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const byTipo = (centros ?? []).reduce((acc: any, c: any) => {
    if (!acc[c.tipo]) acc[c.tipo] = [];
    acc[c.tipo].push(c);
    return acc;
  }, {});

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Layers className="w-6 h-6 text-blue-600" />Centros de Custo
            </h1>
            <p className="text-sm text-gray-500 mt-1">{(centros ?? []).length} centro(s) cadastrado(s)</p>
          </div>
          <Button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" />Novo Centro de Custo
          </Button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : (centros ?? []).length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <Layers className="w-14 h-14 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 font-medium">Nenhum centro de custo cadastrado.</p>
              <p className="text-sm text-gray-400 mt-1">Crie centros de custo para organizar suas despesas por projeto ou setor.</p>
              <Button onClick={() => setShowNew(true)} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4 mr-2" />Criar Primeiro Centro
              </Button>
            </CardContent>
          </Card>
        ) : (
          Object.entries(byTipo).map(([tipo, items]: [string, any]) => (
            <Card key={tipo} className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm capitalize flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-500" />
                  {tipo.charAt(0).toUpperCase() + tipo.slice(1)} ({items.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100">
                  {items.map((c: any) => (
                    <div key={c.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-gray-400 w-16">{c.codigo}</span>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{c.nome}</p>
                          {c.responsavelNome && <p className="text-xs text-gray-400">Resp.: {c.responsavelNome}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {c.orcamentoMensal && (
                          <span className="text-sm text-gray-600">{formatBRL(Number(c.orcamentoMensal))}/mês</span>
                        )}
                        <Badge className={`text-xs ${TIPO_COLORS[c.tipo] ?? "bg-gray-100"}`}>{c.tipo}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {/* Modal */}
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Novo Centro de Custo</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Código *</Label>
                  <Input value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="Ex: CC-001" />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="obra">Obra</SelectItem>
                      <SelectItem value="administrativo">Administrativo</SelectItem>
                      <SelectItem value="comercial">Comercial</SelectItem>
                      <SelectItem value="financeiro">Financeiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do centro de custo" />
              </div>
              {form.tipo === "obra" && (
                <div>
                  <Label>Obra Vinculada</Label>
                  <Select value={form.obraId} onValueChange={v => setForm(f => ({ ...f, obraId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {(obras ?? []).map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Responsável</Label>
                  <Input value={form.responsavelNome} onChange={e => setForm(f => ({ ...f, responsavelNome: e.target.value }))} />
                </div>
                <div>
                  <Label>Orçamento Mensal (R$)</Label>
                  <Input type="number" step="0.01" value={form.orcamentoMensal} onChange={e => setForm(f => ({ ...f, orcamentoMensal: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button onClick={() => createMut.mutate({ companyId, codigo: form.codigo, nome: form.nome, tipo: form.tipo, obraId: parseInt(form.obraId) || undefined, responsavelNome: form.responsavelNome || undefined, orcamentoMensal: parseFloat(form.orcamentoMensal) || undefined })} disabled={createMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {createMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
