import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle, Package, Bell, Plus, Trash2, Settings2,
  Building2, Search, ShieldAlert, CheckCircle2, Warehouse
} from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

export default function EpiEstoqueMinimo() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const [tab, setTab] = useState<"alertas" | "config">("alertas");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ epiId: "", obraId: "", quantidadeMinima: "20" });

  // Queries
  const alertasQ = trpc.epiAvancado.alertasEstoque.useQuery({ companyId }, { enabled: !!companyId });
  const minimoListQ = trpc.epiAvancado.estoqueMinList.useQuery({ companyId }, { enabled: !!companyId });
  const episQ = trpc.epis.list.useQuery({ companyId }, { enabled: !!companyId });
  const obrasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: !!companyId });

  // Mutations
  const upsertMut = trpc.epiAvancado.estoqueMinUpsert.useMutation({
    onSuccess: () => { minimoListQ.refetch(); alertasQ.refetch(); setShowAddForm(false); setAddForm({ epiId: "", obraId: "", quantidadeMinima: "20" }); toast.success("Mínimo configurado!"); },
    onError: (err) => toast.error(err.message),
  });

  const alertas = alertasQ.data ?? [];
  const minimos = minimoListQ.data ?? [];
  const episList = episQ.data ?? [];
  const obrasList = obrasQ.data ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1B3A5C] flex items-center gap-2">
            <Bell className="h-5 w-5" /> Estoque Mínimo e Alertas de Reposição
          </h2>
          <p className="text-sm text-muted-foreground">Configure limites mínimos e receba alertas automáticos</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-max">
        <button onClick={() => setTab("alertas")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium ${tab === "alertas" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
          <AlertTriangle className="h-3.5 w-3.5 inline mr-1" /> Alertas ({alertas.length})
        </button>
        <button onClick={() => setTab("config")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium ${tab === "config" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
          <Settings2 className="h-3.5 w-3.5 inline mr-1" /> Configurar ({minimos.length})
        </button>
      </div>

      {/* ============================================================ */}
      {/* ALERTAS */}
      {/* ============================================================ */}
      {tab === "alertas" && (
        <div className="space-y-3">
          {alertas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
                <p className="font-semibold text-green-700">Estoque OK!</p>
                <p className="text-sm text-muted-foreground mt-1">Todos os itens estão acima do mínimo configurado.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Card className="border-red-200 bg-red-50/50">
                  <CardContent className="py-3 text-center">
                    <ShieldAlert className="h-6 w-6 text-red-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-red-700">{alertas.length}</p>
                    <p className="text-xs text-red-600">Itens abaixo do mínimo</p>
                  </CardContent>
                </Card>
                <Card className="border-amber-200 bg-amber-50/50">
                  <CardContent className="py-3 text-center">
                    <Package className="h-6 w-6 text-amber-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-amber-700">{alertas.reduce((s: number, a: any) => s + a.deficit, 0)}</p>
                    <p className="text-xs text-amber-600">Unidades faltantes</p>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                {alertas.map((alerta: any, idx: number) => (
                  <Card key={idx} className="border-red-200 bg-red-50/20">
                    <div className="p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm">{alerta.nomeEpi}</h4>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1">
                              {alerta.tipo === "obra" ? <Building2 className="h-3 w-3" /> : <Warehouse className="h-3 w-3" />}
                              {alerta.nomeObra}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Atual:</span>
                          <Badge variant="destructive" className="text-xs">{alerta.quantidadeAtual}</Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">Mínimo:</span>
                          <Badge variant="outline" className="text-xs">{alerta.quantidadeMinima}</Badge>
                        </div>
                        <p className="text-xs text-red-600 font-semibold mt-1">Faltam {alerta.deficit} un.</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Suggestion box */}
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="py-3">
                  <div className="flex gap-2 items-start">
                    <Bell className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-800">
                      <p className="font-semibold mb-1">Sugestão de Reposição</p>
                      {alertas.map((a: any, idx: number) => (
                        <p key={idx}>
                          Estoque de <strong>{a.nomeEpi}</strong> na <strong>{a.nomeObra}</strong> está com{" "}
                          <strong>{a.quantidadeAtual}</strong> unidades — mínimo configurado: <strong>{a.quantidadeMinima}</strong>.
                          Sugestão: solicitar compra ou transferência de <strong>{a.deficit}</strong> unidades.
                        </p>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* CONFIGURAÇÃO */}
      {/* ============================================================ */}
      {tab === "config" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Configurar Mínimo
            </Button>
          </div>

          {minimos.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Settings2 className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum estoque mínimo configurado.</p>
                <p className="text-xs text-muted-foreground mt-1">Configure para receber alertas automáticos de reposição.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {minimos.map((min: any) => (
                <Card key={min.id}>
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Package className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">{min.nomeEpi || "EPI"}</h4>
                        <p className="text-xs text-muted-foreground">
                          {min.nomeObra ? `Obra: ${min.nomeObra}` : "Estoque Central"}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      Mínimo: {min.quantidadeMinima} un.
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Add Form Dialog */}
          {showAddForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
                <h3 className="text-lg font-bold text-[#1B3A5C] mb-4">Configurar Estoque Mínimo</h3>
                <div className="space-y-4">
                  <div>
                    <Label>EPI *</Label>
                    <Select value={addForm.epiId} onValueChange={v => setAddForm(f => ({ ...f, epiId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione o EPI..." /></SelectTrigger>
                      <SelectContent>
                        {episList.map((e: any) => (
                          <SelectItem key={e.id} value={String(e.id)}>{e.nome} {e.ca ? `(CA ${e.ca})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Local</Label>
                    <Select value={addForm.obraId || "central"} onValueChange={v => setAddForm(f => ({ ...f, obraId: v === "central" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="Estoque Central" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="central">Estoque Central</SelectItem>
                        {obrasList.map((o: any) => (
                          <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Quantidade Mínima *</Label>
                    <Input type="number" min={1} value={addForm.quantidadeMinima}
                      onChange={e => setAddForm(f => ({ ...f, quantidadeMinima: e.target.value }))} />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setShowAddForm(false)}>Cancelar</Button>
                    <Button className="flex-1 bg-[#1B2A4A] hover:bg-[#243660]" disabled={upsertMut.isPending}
                      onClick={() => {
                        if (!addForm.epiId) return toast.error("Selecione um EPI");
                        upsertMut.mutate({
                          companyId,
                          epiId: parseInt(addForm.epiId),
                          obraId: addForm.obraId ? parseInt(addForm.obraId) : undefined,
                          quantidadeMinima: parseInt(addForm.quantidadeMinima) || 20,
                        });
                      }}>
                      {upsertMut.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
