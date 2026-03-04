import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  ClipboardList, Plus, CheckCircle2, Circle, User, Search,
  QrCode, ChevronDown, ChevronUp, AlertTriangle, Package, PenTool,
  FileText, Printer, Calendar, Trash2
} from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import EpiAssinatura from "./EpiAssinatura";

export default function EpiChecklist() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const [tab, setTab] = useState<"pendentes" | "concluidos" | "novo">("pendentes");
  const [search, setSearch] = useState("");
  const [expandedChecklist, setExpandedChecklist] = useState<number | null>(null);
  const [showAssinatura, setShowAssinatura] = useState<{ employeeId: number; employeeName: string; deliveryId?: number; tipo: "entrega" | "devolucao" } | null>(null);

  // New checklist form
  const [newForm, setNewForm] = useState({ employeeId: "", tipo: "contratacao" as "contratacao" | "devolucao" });

  // Queries
  const checklistsQ = trpc.epiAvancado.checklistList.useQuery(
    { companyId, status: tab === "pendentes" ? undefined : tab === "concluidos" ? "concluido" : undefined },
    { enabled: !!companyId }
  );
  const employeesQ = trpc.employees.list.useQuery({ companyId, status: "Ativo" }, { enabled: !!companyId });

  // Mutations
  const generateMut = trpc.epiAvancado.checklistGenerate.useMutation({
    onSuccess: (data) => {
      checklistsQ.refetch();
      toast.success(`Checklist gerado! Kit: ${data.kitUsado || "Padrão"} — ${data.totalItens} itens`);
      setTab("pendentes");
      setNewForm({ employeeId: "", tipo: "contratacao" });
    },
    onError: (err) => toast.error(err.message),
  });
  const updateItemMut = trpc.epiAvancado.checklistUpdateItem.useMutation({
    onSuccess: () => { checklistsQ.refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.epiAvancado.checklistDelete.useMutation({
    onSuccess: () => { checklistsQ.refetch(); toast.success("Checklist excluído!"); setExpandedChecklist(null); },
    onError: (err) => toast.error(err.message),
  });

  const checklists = checklistsQ.data ?? [];
  const employeesList = useMemo(() => (employeesQ.data ?? []).sort((a: any, b: any) => a.nomeCompleto.localeCompare(b.nomeCompleto)), [employeesQ.data]);

  const filteredChecklists = useMemo(() => {
    let list = checklists;
    if (tab === "pendentes") list = list.filter((c: any) => c.status !== "concluido" && c.status !== "cancelado");
    if (tab === "concluidos") list = list.filter((c: any) => c.status === "concluido");
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((c: any) => (c.nomeFunc || "").toLowerCase().includes(s));
    }
    return list;
  }, [checklists, tab, search]);

  const statusColor: Record<string, string> = {
    pendente: "bg-gray-100 text-gray-700",
    parcial: "bg-amber-100 text-amber-700",
    concluido: "bg-green-100 text-green-700",
    cancelado: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1B3A5C] flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> Checklists de EPI
          </h2>
          <p className="text-sm text-muted-foreground">Controle de entrega e devolução com assinatura digital</p>
        </div>
        <Button size="sm" onClick={() => setTab("novo")}>
          <Plus className="h-4 w-4 mr-1" /> Gerar Checklist
        </Button>
      </div>

      {/* Assinatura overlay */}
      {showAssinatura && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-lg w-full">
            <EpiAssinatura
              employeeId={showAssinatura.employeeId}
              employeeName={showAssinatura.employeeName}
              deliveryId={showAssinatura.deliveryId}
              tipo={showAssinatura.tipo}
              onComplete={() => { setShowAssinatura(null); checklistsQ.refetch(); toast.success("Assinatura registrada!"); }}
              onCancel={() => setShowAssinatura(null)}
            />
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      {tab !== "novo" && (
        <>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-max">
            <button onClick={() => setTab("pendentes")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${tab === "pendentes" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
              <Circle className="h-3.5 w-3.5 inline mr-1" /> Pendentes
            </button>
            <button onClick={() => setTab("concluidos")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${tab === "concluidos" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
              <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" /> Concluídos
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por funcionário..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </>
      )}

      {/* Novo Checklist */}
      {tab === "novo" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Gerar Novo Checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Funcionário *</Label>
              <Select value={newForm.employeeId} onValueChange={v => setNewForm(f => ({ ...f, employeeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o funcionário..." /></SelectTrigger>
                <SelectContent>
                  {employeesList.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.nomeCompleto} {e.funcao ? `(${e.funcao})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={newForm.tipo} onValueChange={(v: any) => setNewForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contratacao">Contratação (Entrega)</SelectItem>
                  <SelectItem value="devolucao">Demissão (Devolução)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800">
              <p className="font-semibold mb-1">Como funciona?</p>
              {newForm.tipo === "contratacao" ? (
                <p>O sistema buscará o kit de EPI correspondente à função do funcionário e gerará automaticamente a lista de itens a serem entregues. Caso não exista kit configurado, será usado o Kit Básico de Obra.</p>
              ) : (
                <p>O sistema listará todos os EPIs entregues ao funcionário que ainda não foram devolvidos, gerando o checklist de devolução para a rescisão.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setTab("pendentes")}>Cancelar</Button>
              <Button className="bg-[#1B2A4A] hover:bg-[#243660]" disabled={generateMut.isPending}
                onClick={() => {
                  if (!newForm.employeeId) return toast.error("Selecione um funcionário");
                  generateMut.mutate({ companyId, employeeId: parseInt(newForm.employeeId), tipo: newForm.tipo });
                }}>
                {generateMut.isPending ? "Gerando..." : "Gerar Checklist"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {tab !== "novo" && (
        filteredChecklists.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ClipboardList className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                {tab === "pendentes" ? "Nenhum checklist pendente." : "Nenhum checklist concluído."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredChecklists.map((cl: any) => {
              const isExpanded = expandedChecklist === cl.id;
              const progress = cl.totalItens > 0
                ? Math.round(((cl.tipo === "contratacao" ? cl.itensEntregues : cl.itensDevolvidos) / cl.totalItens) * 100)
                : 0;
              return (
                <Card key={cl.id} className="overflow-hidden">
                  <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedChecklist(isExpanded ? null : cl.id)}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cl.tipo === "contratacao" ? "bg-green-50" : "bg-amber-50"}`}>
                        {cl.tipo === "contratacao" ? <Package className="h-5 w-5 text-green-600" /> : <FileText className="h-5 w-5 text-amber-600" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm">{cl.nomeFunc}</h4>
                          <Badge className={`text-[10px] ${statusColor[cl.status]}`}>{cl.status}</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{cl.tipo === "contratacao" ? "Contratação" : "Devolução"}</span>
                          <span>|</span>
                          <span>{cl.funcaoFunc || "Sem função"}</span>
                          <span>|</span>
                          <span>{new Date(cl.createdAt).toLocaleDateString("pt-BR")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Progress bar */}
                      <div className="hidden sm:block w-24">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${progress === 100 ? "bg-green-500" : "bg-blue-500"}`}
                            style={{ width: `${progress}%` }} />
                        </div>
                        <p className="text-[10px] text-center text-muted-foreground mt-0.5">
                          {cl.tipo === "contratacao" ? cl.itensEntregues : cl.itensDevolvidos}/{cl.totalItens}
                        </p>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t px-3 py-3 bg-gray-50/50 space-y-2">
                      {cl.items?.map((item: any) => {
                        const isDone = cl.tipo === "contratacao" ? !!Number(item.entregue) : !!Number(item.devolvido);
                        return (
                          <div key={item.id} className={`flex items-center justify-between p-2 rounded-lg ${isDone ? "bg-green-50" : "bg-white border"}`}>
                            <div className="flex items-center gap-2">
                              {isDone ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Circle className="h-4 w-4 text-gray-300" />}
                              <span className={`text-sm ${isDone ? "line-through text-muted-foreground" : ""}`}>{item.nomeEpi}</span>
                              <Badge variant="outline" className="text-[10px]">{item.categoria}</Badge>
                              <span className="text-xs text-muted-foreground">x{item.quantidade}</span>
                            </div>
                            {!isDone && cl.status !== "concluido" && (
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                disabled={updateItemMut.isPending}
                                onClick={() => {
                                  const today = new Date().toISOString().split("T")[0];
                                  updateItemMut.mutate({
                                    itemId: item.id,
                                    checklistId: cl.id,
                                    ...(cl.tipo === "contratacao" ? { entregue: true, dataEntrega: today } : { devolvido: true, dataDevolucao: today }),
                                  });
                                }}>
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                {cl.tipo === "contratacao" ? "Entregue" : "Devolvido"}
                              </Button>
                            )}
                          </div>
                        );
                      })}

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        {cl.status !== "cancelado" && (
                          <Button size="sm" variant="outline" className="text-xs"
                            onClick={() => setShowAssinatura({
                              employeeId: cl.employeeId,
                              employeeName: cl.nomeFunc,
                              tipo: cl.tipo === "contratacao" ? "entrega" : "devolucao",
                            })}>
                            <PenTool className="h-3.5 w-3.5 mr-1" /> Coletar Assinatura
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                          disabled={deleteMut.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Tem certeza que deseja excluir o checklist de ${cl.nomeFunc}?`)) {
                              deleteMut.mutate({ checklistId: cl.id, companyId });
                            }
                          }}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> {deleteMut.isPending ? "Excluindo..." : "Excluir Checklist"}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
