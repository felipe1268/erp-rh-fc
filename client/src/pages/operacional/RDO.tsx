import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  ClipboardList, Plus, Loader2, CheckCircle, ArrowLeft,
  Sun, CloudRain, CloudSun, Cloud, Trash2, Users, Wrench,
  FileText, Camera, Save, Send,
} from "lucide-react";

const CLIMAS = ["Ensolarado", "Parcialmente Nublado", "Nublado", "Chuvoso", "Tempestade", "Garoa"];

export default function RDO() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] || "");
  const obraIdParam = Number(params.get("obra")) || 0;
  const rdoIdParam = Number(params.get("id")) || 0;

  const [filtroStatusObra, setFiltroStatusObra] = useState<string>("Em_Andamento");
  const todasObras = trpc.obras.list.useQuery({ companyId }, { enabled: !!companyId });
  const obrasFiltradas = (todasObras.data as any[])?.filter((o: any) =>
    filtroStatusObra === "todas" ? true : o.status === filtroStatusObra
  ) || [];
  const [obraId, setObraId] = useState(obraIdParam);
  const selectedObraId = obraId || obrasFiltradas[0]?.id || 0;

  const rdos = trpc.operacional.listarRDOs.useQuery(
    { companyId, obraId: selectedObraId },
    { enabled: !!companyId && !!selectedObraId },
  );
  const rdoDetalhe = trpc.operacional.getRDO.useQuery(
    { id: rdoIdParam, companyId },
    { enabled: !!rdoIdParam && !!companyId },
  );

  const criarRDO = trpc.operacional.criarRDO.useMutation({
    onSuccess: (data) => {
      toast.success(data.jaExistia ? "RDO já existente" : "RDO criado com sucesso");
      setLocation(`/operacional/rdo?obra=${selectedObraId}&id=${data.id}`);
      rdos.refetch();
    },
  });
  const atualizarRDO = trpc.operacional.atualizarRDO.useMutation({
    onSuccess: () => { toast.success("RDO salvo"); rdoDetalhe.refetch(); },
  });
  const finalizarRDO = trpc.operacional.finalizarRDO.useMutation({
    onSuccess: () => { toast.success("RDO finalizado!"); rdoDetalhe.refetch(); rdos.refetch(); },
  });

  const addMaoObra = trpc.operacional.adicionarMaoObra.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const remMaoObra = trpc.operacional.removerMaoObra.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const addAtividade = trpc.operacional.adicionarAtividade.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const remAtividade = trpc.operacional.removerAtividade.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const addEquip = trpc.operacional.adicionarEquipamento.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const remEquip = trpc.operacional.removerEquipamento.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const addMaterial = trpc.operacional.adicionarMaterial.useMutation({ onSuccess: () => rdoDetalhe.refetch() });
  const remMaterial = trpc.operacional.removerMaterial.useMutation({ onSuccess: () => rdoDetalhe.refetch() });

  const [form, setForm] = useState<any>({});
  const [addDialog, setAddDialog] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<any>({});

  const rdo = rdoDetalhe.data;

  useEffect(() => {
    if (rdo) {
      setForm({
        climaManha: rdo.clima_manha || "",
        climaTarde: rdo.clima_tarde || "",
        temperaturaMin: rdo.temperatura_min || "",
        temperaturaMax: rdo.temperatura_max || "",
        choveu: rdo.choveu || false,
        horaInicio: rdo.hora_inicio || "07:00",
        horaFim: rdo.hora_fim || "17:00",
        observacoes: rdo.observacoes || "",
        visitantes: rdo.visitantes || "",
        ddsRealizado: rdo.dds_realizado || false,
        ddsTema: rdo.dds_tema || "",
      });
    }
  }, [rdo]);

  const hoje = new Date().toISOString().split("T")[0];

  if (rdoIdParam && rdo) {
    const isFinalizado = rdo.status === "finalizado";
    return (
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/operacional/rdo?obra=${selectedObraId}`)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-bold">RDO — {new Date(rdo.data + "T12:00:00").toLocaleDateString("pt-BR")}</h1>
          <Badge variant={isFinalizado ? "default" : "secondary"}>
            {isFinalizado ? "Finalizado" : "Rascunho"}
          </Badge>
          {rdo.responsavel_nome && <span className="text-sm text-gray-500">Responsável: {rdo.responsavel_nome}</span>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Condições Climáticas</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Manhã</Label>
                  <Select value={form.climaManha || ""} onValueChange={(v) => setForm({ ...form, climaManha: v })} disabled={isFinalizado}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{CLIMAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Tarde</Label>
                  <Select value={form.climaTarde || ""} onValueChange={(v) => setForm({ ...form, climaTarde: v })} disabled={isFinalizado}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{CLIMAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Temp. Mín. (°C)</Label>
                  <Input type="number" value={form.temperaturaMin || ""} onChange={(e) => setForm({ ...form, temperaturaMin: e.target.value })} disabled={isFinalizado} />
                </div>
                <div>
                  <Label className="text-xs">Temp. Máx. (°C)</Label>
                  <Input type="number" value={form.temperaturaMax || ""} onChange={(e) => setForm({ ...form, temperaturaMax: e.target.value })} disabled={isFinalizado} />
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.choveu || false} onChange={(e) => setForm({ ...form, choveu: e.target.checked })} disabled={isFinalizado} />
                <span className="text-sm">Choveu?</span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Horário de Trabalho</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Início</Label>
                  <Input type="time" value={form.horaInicio || ""} onChange={(e) => setForm({ ...form, horaInicio: e.target.value })} disabled={isFinalizado} />
                </div>
                <div>
                  <Label className="text-xs">Fim</Label>
                  <Input type="time" value={form.horaFim || ""} onChange={(e) => setForm({ ...form, horaFim: e.target.value })} disabled={isFinalizado} />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.ddsRealizado || false} onChange={(e) => setForm({ ...form, ddsRealizado: e.target.checked })} disabled={isFinalizado} />
                  <span className="text-sm font-medium">DDS Realizado</span>
                </label>
                {form.ddsRealizado && (
                  <Input className="mt-2" placeholder="Tema do DDS" value={form.ddsTema || ""} onChange={(e) => setForm({ ...form, ddsTema: e.target.value })} disabled={isFinalizado} />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Mão de Obra</CardTitle>
            {!isFinalizado && <Button size="sm" variant="outline" onClick={() => { setAddForm({ tipo: "proprio", funcao: "", quantidade: 1 }); setAddDialog("maoObra"); }}><Plus className="w-3 h-3 mr-1" /> Adicionar</Button>}
          </CardHeader>
          <CardContent>
            {(rdo.maoObra || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Nenhuma mão de obra registrada</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-gray-500"><th className="py-1 px-2">Tipo</th><th className="py-1 px-2">Função</th><th className="py-1 px-2">Qtd</th><th className="py-1 px-2">Presente</th>{!isFinalizado && <th className="py-1 px-2 w-10"></th>}</tr></thead>
                <tbody>
                  {(rdo.maoObra as any[]).map((m: any) => (
                    <tr key={m.id} className="border-b">
                      <td className="py-1 px-2"><Badge variant="outline">{m.tipo === "proprio" ? "Próprio" : "Terceiro"}</Badge></td>
                      <td className="py-1 px-2">{m.funcao}{m.empresa_nome ? ` (${m.empresa_nome})` : ""}</td>
                      <td className="py-1 px-2 font-medium">{m.quantidade}</td>
                      <td className="py-1 px-2">{m.presente ? <CheckCircle className="w-4 h-4 text-green-500" /> : "—"}</td>
                      {!isFinalizado && <td className="py-1 px-2"><Button variant="ghost" size="sm" onClick={() => remMaoObra.mutate({ id: m.id, companyId })}><Trash2 className="w-3 h-3 text-red-400" /></Button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Atividades</CardTitle>
            {!isFinalizado && <Button size="sm" variant="outline" onClick={() => { setAddForm({ descricao: "", local: "", percentualAvanco: 0 }); setAddDialog("atividade"); }}><Plus className="w-3 h-3 mr-1" /> Adicionar</Button>}
          </CardHeader>
          <CardContent>
            {(rdo.atividades || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Nenhuma atividade registrada</p>
            ) : (
              <div className="space-y-2">
                {(rdo.atividades as any[]).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between border rounded p-2">
                    <div>
                      <p className="text-sm font-medium">{a.descricao}</p>
                      {a.local && <p className="text-xs text-gray-500">{a.local}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{a.percentual_avanco || 0}%</Badge>
                      {!isFinalizado && <Button variant="ghost" size="sm" onClick={() => remAtividade.mutate({ id: a.id, companyId })}><Trash2 className="w-3 h-3 text-red-400" /></Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Wrench className="w-4 h-4" /> Equipamentos</CardTitle>
            {!isFinalizado && <Button size="sm" variant="outline" onClick={() => { setAddForm({ nome: "", tipo: "", situacao: "operando" }); setAddDialog("equipamento"); }}><Plus className="w-3 h-3 mr-1" /> Adicionar</Button>}
          </CardHeader>
          <CardContent>
            {(rdo.equipamentos || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Nenhum equipamento registrado</p>
            ) : (
              <div className="space-y-2">
                {(rdo.equipamentos as any[]).map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between border rounded p-2">
                    <div>
                      <p className="text-sm font-medium">{e.nome}</p>
                      {e.tipo && <p className="text-xs text-gray-500">{e.tipo}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={e.situacao === "operando" ? "default" : "secondary"}>{e.situacao}</Badge>
                      {!isFinalizado && <Button variant="ghost" size="sm" onClick={() => remEquip.mutate({ id: e.id, companyId })}><Trash2 className="w-3 h-3 text-red-400" /></Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Observações</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={4} value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} disabled={isFinalizado} placeholder="Observações do dia..." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Visitantes</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={2} value={form.visitantes || ""} onChange={(e) => setForm({ ...form, visitantes: e.target.value })} disabled={isFinalizado} placeholder="Visitantes do dia..." />
          </CardContent>
        </Card>

        {!isFinalizado && (
          <div className="flex gap-3 sticky bottom-4">
            <Button className="flex-1" onClick={() => {
              atualizarRDO.mutate({
                id: rdo.id, companyId,
                climaManha: form.climaManha || undefined,
                climaTarde: form.climaTarde || undefined,
                temperaturaMin: form.temperaturaMin ? Number(form.temperaturaMin) : undefined,
                temperaturaMax: form.temperaturaMax ? Number(form.temperaturaMax) : undefined,
                choveu: form.choveu,
                horaInicio: form.horaInicio || undefined,
                horaFim: form.horaFim || undefined,
                observacoes: form.observacoes || undefined,
                visitantes: form.visitantes || undefined,
                ddsRealizado: form.ddsRealizado,
                ddsTema: form.ddsTema || undefined,
              });
            }} disabled={atualizarRDO.isPending}>
              {atualizarRDO.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar Rascunho
            </Button>
            <Button variant="default" className="bg-green-600 hover:bg-green-700" onClick={() => {
              if (!form.climaManha) { toast.error("Preencha o clima da manhã"); return; }
              finalizarRDO.mutate({ id: rdo.id, companyId, responsavelNome: user?.nome || user?.email || "Responsável" });
            }} disabled={finalizarRDO.isPending}>
              {finalizarRDO.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Finalizar RDO
            </Button>
          </div>
        )}

        <Dialog open={!!addDialog} onOpenChange={() => setAddDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>
              {addDialog === "maoObra" ? "Adicionar Mão de Obra" :
                addDialog === "atividade" ? "Adicionar Atividade" :
                  addDialog === "equipamento" ? "Adicionar Equipamento" : "Adicionar Material"}
            </DialogTitle></DialogHeader>
            <div className="space-y-3">
              {addDialog === "maoObra" && <>
                <div>
                  <Label>Tipo</Label>
                  <Select value={addForm.tipo || "proprio"} onValueChange={(v) => setAddForm({ ...addForm, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="proprio">Próprio</SelectItem><SelectItem value="terceiro">Terceiro</SelectItem></SelectContent>
                  </Select>
                </div>
                {addForm.tipo === "terceiro" && <div><Label>Empresa</Label><Input value={addForm.empresaNome || ""} onChange={(e) => setAddForm({ ...addForm, empresaNome: e.target.value })} /></div>}
                <div><Label>Função</Label><Input value={addForm.funcao || ""} onChange={(e) => setAddForm({ ...addForm, funcao: e.target.value })} /></div>
                <div><Label>Quantidade</Label><Input type="number" value={addForm.quantidade || 1} onChange={(e) => setAddForm({ ...addForm, quantidade: parseInt(e.target.value) || 1 })} /></div>
                <Button className="w-full" onClick={() => { addMaoObra.mutate({ rdoId: rdo.id, companyId, ...addForm }); setAddDialog(null); }}>Adicionar</Button>
              </>}
              {addDialog === "atividade" && <>
                <div><Label>Descrição</Label><Input value={addForm.descricao || ""} onChange={(e) => setAddForm({ ...addForm, descricao: e.target.value })} /></div>
                <div><Label>Local</Label><Input value={addForm.local || ""} onChange={(e) => setAddForm({ ...addForm, local: e.target.value })} /></div>
                <div><Label>% Avanço</Label><Input type="number" value={addForm.percentualAvanco || 0} onChange={(e) => setAddForm({ ...addForm, percentualAvanco: parseInt(e.target.value) || 0 })} /></div>
                <Button className="w-full" onClick={() => { addAtividade.mutate({ rdoId: rdo.id, companyId, ...addForm }); setAddDialog(null); }}>Adicionar</Button>
              </>}
              {addDialog === "equipamento" && <>
                <div><Label>Nome</Label><Input value={addForm.nome || ""} onChange={(e) => setAddForm({ ...addForm, nome: e.target.value })} /></div>
                <div><Label>Tipo</Label><Input value={addForm.tipo || ""} onChange={(e) => setAddForm({ ...addForm, tipo: e.target.value })} /></div>
                <div><Label>Situação</Label>
                  <Select value={addForm.situacao || "operando"} onValueChange={(v) => setAddForm({ ...addForm, situacao: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="operando">Operando</SelectItem><SelectItem value="parado">Parado</SelectItem><SelectItem value="manutencao">Manutenção</SelectItem></SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={() => { addEquip.mutate({ rdoId: rdo.id, companyId, ...addForm }); setAddDialog(null); }}>Adicionar</Button>
              </>}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">RDO — Relatório Diário de Obra</h1>
          <p className="text-sm text-gray-500">Relatórios diários de obra</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={filtroStatusObra} onValueChange={(v) => { setFiltroStatusObra(v); setObraId(0); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Em_Andamento">Em andamento</SelectItem>
              <SelectItem value="Concluida">Concluídas</SelectItem>
              <SelectItem value="Paralisada">Paralisadas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(selectedObraId || "")} onValueChange={(v) => setObraId(Number(v))}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
            <SelectContent>
              {obrasFiltradas.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => criarRDO.mutate({ companyId, obraId: selectedObraId, data: hoje, responsavelNome: user?.nome || user?.email })} disabled={criarRDO.isPending || !selectedObraId}>
            {criarRDO.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Novo RDO (Hoje)
          </Button>
        </div>
      </div>

      {rdos.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
      ) : (rdos.data as any[])?.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <ClipboardList className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>Nenhum RDO registrado para esta obra</p>
          <Button className="mt-4" onClick={() => criarRDO.mutate({ companyId, obraId: selectedObraId, data: hoje, responsavelNome: user?.nome || user?.email })}>
            <Plus className="w-4 h-4 mr-2" /> Criar Primeiro RDO
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {(rdos.data as any[])?.map((r: any) => (
            <div key={r.id}
              className="border rounded-lg p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
              onClick={() => setLocation(`/operacional/rdo?obra=${selectedObraId}&id=${r.id}`)}>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-lg font-bold">{new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit" })}</p>
                  <p className="text-xs text-gray-500">{new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    {r.clima_manha && <span className="text-xs text-gray-500">{r.clima_manha}</span>}
                    {r.choveu && <CloudRain className="w-3 h-3 text-blue-400" />}
                  </div>
                  {r.responsavel_nome && <p className="text-xs text-gray-400">{r.responsavel_nome}</p>}
                </div>
              </div>
              <Badge variant={r.status === "finalizado" ? "default" : "secondary"}>
                {r.status === "finalizado" ? "Finalizado" : "Rascunho"}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
