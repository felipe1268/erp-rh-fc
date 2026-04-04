import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Shield, Plus, Pencil, Trash2, Brain, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function fmt(v: any) {
  return parseFloat(v || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Seguros() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [analysisText, setAnalysisText] = useState("");
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  const vehicles = trpc.frotas.listVehicles.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const ins = trpc.frotas.listInsurance.useQuery(
    { companyId: cId, vehicleId: filterVehicle !== "all" ? parseInt(filterVehicle) : undefined },
    { enabled: cId > 0 },
  );
  const createMut = trpc.frotas.createInsurance.useMutation({
    onSuccess: () => { ins.refetch(); setDialogOpen(false); toast.success("Seguro registrado"); },
  });
  const updateMut = trpc.frotas.updateInsurance.useMutation({
    onSuccess: () => { ins.refetch(); setDialogOpen(false); toast.success("Seguro atualizado"); },
  });
  const deleteMut = trpc.frotas.deleteInsurance.useMutation({
    onSuccess: () => { ins.refetch(); toast.success("Seguro excluído"); },
  });
  const analyzeMut = trpc.frotas.analyzeInsurancePolicy.useMutation({
    onSuccess: (data) => { setAnalysisResult(data); toast.success("Análise concluída"); },
    onError: (err) => toast.error(err.message),
  });

  function openNew() {
    setEditing(null);
    setForm({ status: "ativa" });
    setDialogOpen(true);
  }

  function openEdit(r: any) {
    setEditing(r);
    setForm({
      vehicleId: r.vehicle_id, seguradora: r.seguradora, numeroApolice: r.numero_apolice,
      tipoCobertura: r.tipo_cobertura, valorPremio: r.valor_premio,
      franquia: r.franquia, dataInicio: r.data_inicio, dataFim: r.data_fim,
      status: r.status, corretor: r.corretor, observacoes: r.observacoes,
    });
    setDialogOpen(true);
  }

  function save() {
    if (!form.vehicleId || !form.seguradora || (!editing && (!form.dataInicio || !form.dataFim))) {
      toast.error("Preencha veículo, seguradora e período de vigência");
      return;
    }
    const payload = { ...form, companyId: cId, criadoPor: user?.name };
    if (editing) updateMut.mutate({ id: editing.id, ...payload });
    else createMut.mutate(payload);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-emerald-600" /> Seguros
          </h1>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Seguro</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={filterVehicle} onValueChange={setFilterVehicle}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Veículo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(vehicles.data || []).map((v: any) => (
                <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {ins.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        ) : (ins.data || []).length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum seguro registrado</CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Veículo</th>
                  <th className="text-left p-3">Seguradora</th>
                  <th className="text-left p-3">Apólice</th>
                  <th className="text-left p-3">Cobertura</th>
                  <th className="text-right p-3">Prêmio</th>
                  <th className="text-right p-3">Franquia</th>
                  <th className="text-left p-3">Vigência</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Corretor</th>
                  <th className="text-right p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(ins.data || []).map((r: any) => {
                  const vencido = r.data_fim && r.data_fim < today && r.status === "ativa";
                  return (
                    <tr key={r.id} className={`border-t hover:bg-muted/30 ${vencido ? "bg-red-50/50" : ""}`}>
                      <td className="p-3 font-mono">{r.placa || "—"}</td>
                      <td className="p-3">{r.seguradora}</td>
                      <td className="p-3">{r.numero_apolice || "—"}</td>
                      <td className="p-3 max-w-[150px] truncate">{r.tipo_cobertura || "—"}</td>
                      <td className="p-3 text-right">{fmt(r.valor_premio)}</td>
                      <td className="p-3 text-right">{fmt(r.franquia)}</td>
                      <td className="p-3 text-xs">{r.data_inicio || "—"} a {r.data_fim || "—"}</td>
                      <td className="p-3">
                        <Badge variant={r.status === "ativa" ? (vencido ? "destructive" : "default") : "secondary"}>
                          {vencido ? "Vencida" : r.status}
                        </Badge>
                      </td>
                      <td className="p-3">{r.corretor || "—"}</td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm("Excluir?")) deleteMut.mutate({ id: r.id, companyId: cId }); }}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-600" /> Análise de Apólice com IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Cole o texto da apólice de seguro abaixo para uma análise automática de coberturas, exclusões, riscos e recomendações.
            </p>
            <Textarea
              placeholder="Cole aqui o texto completo ou trecho relevante da apólice de seguro..."
              className="min-h-[120px]"
              value={analysisText}
              onChange={e => setAnalysisText(e.target.value)}
            />
            <Button
              onClick={() => analyzeMut.mutate({ policyText: analysisText, companyId: cId })}
              disabled={analyzeMut.isPending || !analysisText.trim()}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {analyzeMut.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analisando...</> : <><Brain className="h-4 w-4 mr-1" /> Analisar Apólice</>}
            </Button>

            {analysisResult && (
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 space-y-2 mt-3">
                <h4 className="font-semibold text-sm">Resultado da Análise</h4>
                <div className="text-sm whitespace-pre-wrap">{typeof analysisResult === "string" ? analysisResult : analysisResult.analysis || JSON.stringify(analysisResult, null, 2)}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar Seguro" : "Novo Seguro"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Veículo *</Label>
                <Select value={form.vehicleId ? String(form.vehicleId) : ""} onValueChange={v => setForm({ ...form, vehicleId: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(vehicles.data || []).map((v: any) => (
                      <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Seguradora *</Label><Input value={form.seguradora || ""} onChange={e => setForm({ ...form, seguradora: e.target.value })} /></div>
              <div><Label>Nº Apólice</Label><Input value={form.numeroApolice || ""} onChange={e => setForm({ ...form, numeroApolice: e.target.value })} /></div>
              <div><Label>Tipo de Cobertura</Label><Input value={form.tipoCobertura || ""} onChange={e => setForm({ ...form, tipoCobertura: e.target.value })} placeholder="Ex: Compreensivo, Terceiros..." /></div>
              <div><Label>Valor do Prêmio (R$)</Label><Input type="number" step="0.01" value={form.valorPremio || ""} onChange={e => setForm({ ...form, valorPremio: e.target.value })} /></div>
              <div><Label>Valor da Franquia (R$)</Label><Input type="number" step="0.01" value={form.franquia || ""} onChange={e => setForm({ ...form, franquia: e.target.value })} /></div>
              <div><Label>Data Início</Label><Input type="date" value={form.dataInicio || ""} onChange={e => setForm({ ...form, dataInicio: e.target.value })} /></div>
              <div><Label>Data Fim</Label><Input type="date" value={form.dataFim || ""} onChange={e => setForm({ ...form, dataFim: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status || "ativa"} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativa">Ativa</SelectItem>
                    <SelectItem value="vencida">Vencida</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2"><Label>Corretor</Label><Input value={form.corretor || ""} onChange={e => setForm({ ...form, corretor: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Observações</Label><Textarea value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
