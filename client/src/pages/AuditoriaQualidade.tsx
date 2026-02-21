import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ClipboardCheck, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";

export default function AuditoriaQualidade() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const [activeTab, setActiveTab] = useState("auditorias");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Auditoria e Qualidade</h1>
          <p className="text-muted-foreground mt-1">Auditorias, desvios, planos de ação 5W2H e DDS</p>
        </div>
        {companyId === 0 ? (
          <Card className="p-8 text-center">
            <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Selecione uma empresa no Dashboard para acessar o módulo.</p>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 w-full max-w-lg">
              <TabsTrigger value="auditorias">Auditorias</TabsTrigger>
              <TabsTrigger value="desvios">Desvios</TabsTrigger>
              <TabsTrigger value="acoes">5W2H</TabsTrigger>
              <TabsTrigger value="dds">DDS</TabsTrigger>
            </TabsList>
            <TabsContent value="auditorias"><AuditoriasTab companyId={companyId} /></TabsContent>
            <TabsContent value="desvios"><DesviosTab companyId={companyId} /></TabsContent>
            <TabsContent value="acoes"><AcoesTab companyId={companyId} /></TabsContent>
            <TabsContent value="dds"><DDSTab companyId={companyId} /></TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

function AuditoriasTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: audits = [], isLoading } = trpc.quality.audits.list.useQuery({ companyId });
  const createMut = trpc.quality.audits.create.useMutation({ onSuccess: () => { utils.quality.audits.list.invalidate(); setShowForm(false); toast.success("Auditoria registrada!"); } });
  const deleteMut = trpc.quality.audits.delete.useMutation({ onSuccess: () => { utils.quality.audits.list.invalidate(); toast.success("Auditoria excluída!"); } });
  const [form, setForm] = useState<any>({ titulo: "", tipo: "Interna", dataAuditoria: "", auditor: "", setor: "", resultado: "Pendente", descricao: "" });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">Registro de Auditorias</h3>
        <Button onClick={() => { setForm({ titulo: "", tipo: "Interna", dataAuditoria: "", auditor: "", setor: "", resultado: "Pendente", descricao: "" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova Auditoria
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Tipo</th>
              <th className="text-left p-3 font-medium">Data</th>
              <th className="text-left p-3 font-medium">Auditor</th>
              <th className="text-left p-3 font-medium">Setor</th>
              <th className="text-left p-3 font-medium">Resultado</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              : audits.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhuma auditoria registrada</td></tr>
              : audits.map((a: any) => (
                <tr key={a.id} className="border-b hover:bg-muted/30">
                  <td className="p-3">{a.tipo}</td>
                  <td className="p-3">{a.dataAuditoria ? new Date(a.dataAuditoria).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3 font-medium">{a.auditor ?? "-"}</td>
                  <td className="p-3">{a.setor ?? "-"}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${a.resultado === "Conforme" ? "bg-green-100 text-green-700" : a.resultado === "Nao_Conforme" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{a.resultado?.replace("_", " ") ?? "-"}</span></td>
                  <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: a.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-5xl w-[92vw] max-h-[92vh] overflow-y-auto bg-card p-6">
          <DialogHeader><DialogTitle>Nova Auditoria</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="col-span-2"><Label>Título *</Label><Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Título da auditoria" /></div>
            <div><Label>Tipo</Label>
              <Select value={form.tipo || "none"} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Interna">Interna</SelectItem><SelectItem value="Externa">Externa</SelectItem><SelectItem value="Cliente">Cliente</SelectItem><SelectItem value="Certificadora">Certificadora</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Data</Label><Input type="date" value={form.dataAuditoria} onChange={e => setForm({ ...form, dataAuditoria: e.target.value })} /></div>
            <div><Label>Auditor</Label><Input value={form.auditor} onChange={e => setForm({ ...form, auditor: e.target.value })} /></div>
            <div><Label>Setor</Label><Input value={form.setor} onChange={e => setForm({ ...form, setor: e.target.value })} /></div>
            <div><Label>Resultado</Label>
              <Select value={form.resultado || "none"} onValueChange={v => setForm({ ...form, resultado: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Pendente">Pendente</SelectItem><SelectItem value="Conforme">Conforme</SelectItem><SelectItem value="Nao_Conforme">Não Conforme</SelectItem><SelectItem value="Observacao">Observação</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Descrição</Label><Input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ ...form, companyId })} disabled={createMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DesviosTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: deviations = [], isLoading } = trpc.quality.deviations.list.useQuery({ companyId });
  const createMut = trpc.quality.deviations.create.useMutation({ onSuccess: () => { utils.quality.deviations.list.invalidate(); setShowForm(false); toast.success("Desvio registrado!"); } });
  const deleteMut = trpc.quality.deviations.delete.useMutation({ onSuccess: () => { utils.quality.deviations.list.invalidate(); toast.success("Desvio excluído!"); } });
  const [form, setForm] = useState<any>({ titulo: "", descricao: "", tipo: "NC_Menor", setor: "", responsavel: "", prazo: "", status: "Aberto" });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">Desvios e Não Conformidades</h3>
        <Button onClick={() => { setForm({ titulo: "", descricao: "", tipo: "NC_Menor", setor: "", responsavel: "", prazo: "", status: "Aberto" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Desvio
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Descrição</th>
              <th className="text-left p-3 font-medium">Tipo</th>
              <th className="text-left p-3 font-medium">Gravidade</th>
              <th className="text-left p-3 font-medium">Setor</th>
              <th className="text-left p-3 font-medium">Data</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              : deviations.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum desvio registrado</td></tr>
              : deviations.map((d: any) => (
                <tr key={d.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium max-w-xs truncate">{d.descricao}</td>
                  <td className="p-3">{d.tipo}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${d.gravidade === "Baixa" ? "bg-green-100 text-green-700" : d.gravidade === "Media" ? "bg-yellow-100 text-yellow-700" : d.gravidade === "Alta" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>{d.gravidade}</span></td>
                  <td className="p-3">{d.setor ?? "-"}</td>
                  <td className="p-3">{d.dataOcorrencia ? new Date(d.dataOcorrencia).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${d.status === "Aberto" ? "bg-red-100 text-red-700" : d.status === "Em_Andamento" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>{d.status?.replace("_", " ")}</span></td>
                  <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: d.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-5xl w-[92vw] max-h-[92vh] overflow-y-auto bg-card p-6">
          <DialogHeader><DialogTitle>Novo Desvio</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="col-span-2"><Label>Título *</Label><Input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Título do desvio" /></div>
            <div className="col-span-2"><Label>Descrição</Label><Input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
            <div><Label>Tipo</Label>
              <Select value={form.tipo || "none"} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="NC_Maior">NC Maior</SelectItem><SelectItem value="NC_Menor">NC Menor</SelectItem><SelectItem value="Observacao">Observação</SelectItem><SelectItem value="Oportunidade_Melhoria">Oportunidade de Melhoria</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Status</Label>
              <Select value={form.status || "none"} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Aberto">Aberto</SelectItem><SelectItem value="Em_Andamento">Em Andamento</SelectItem><SelectItem value="Fechado">Fechado</SelectItem><SelectItem value="Cancelado">Cancelado</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Setor</Label><Input value={form.setor} onChange={e => setForm({ ...form, setor: e.target.value })} /></div>
            <div><Label>Responsável</Label><Input value={form.responsavel} onChange={e => setForm({ ...form, responsavel: e.target.value })} /></div>
            <div><Label>Prazo</Label><Input type="date" value={form.prazo} onChange={e => setForm({ ...form, prazo: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ ...form, companyId })} disabled={createMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AcoesTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: actions = [], isLoading } = trpc.quality.actions.list.useQuery({ companyId });
  const createMut = trpc.quality.actions.create.useMutation({ onSuccess: () => { utils.quality.actions.list.invalidate(); setShowForm(false); toast.success("Plano de ação criado!"); } });
  const deleteMut = trpc.quality.actions.delete.useMutation({ onSuccess: () => { utils.quality.actions.list.invalidate(); toast.success("Plano excluído!"); } });
  const [form, setForm] = useState<any>({ oQue: "", porQue: "", onde: "", quando: "", quem: "", como: "", quantoCusta: "", status: "Pendente" });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">Planos de Ação 5W2H</h3>
        <Button onClick={() => { setForm({ oQue: "", porQue: "", onde: "", quando: "", quem: "", como: "", quantoCusta: "", status: "Pendente" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Plano
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">O Quê?</th>
              <th className="text-left p-3 font-medium">Quem?</th>
              <th className="text-left p-3 font-medium">Quando?</th>
              <th className="text-left p-3 font-medium">Onde?</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              : actions.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum plano de ação</td></tr>
              : actions.map((a: any) => (
                <tr key={a.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium max-w-xs truncate">{a.oQue}</td>
                  <td className="p-3">{a.quem ?? "-"}</td>
                  <td className="p-3">{a.quando ?? "-"}</td>
                  <td className="p-3">{a.onde ?? "-"}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${a.status === "Pendente" ? "bg-red-100 text-red-700" : a.status === "Em_Andamento" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>{a.status?.replace("_", " ")}</span></td>
                  <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: a.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-5xl w-[92vw] max-h-[92vh] overflow-y-auto bg-card p-6">
          <DialogHeader><DialogTitle>Novo Plano 5W2H</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="col-span-2"><Label>O Quê? (What) *</Label><Input value={form.oQue} onChange={e => setForm({ ...form, oQue: e.target.value })} /></div>
            <div className="col-span-2"><Label>Por Quê? (Why)</Label><Input value={form.porQue} onChange={e => setForm({ ...form, porQue: e.target.value })} /></div>
            <div><Label>Onde? (Where)</Label><Input value={form.onde} onChange={e => setForm({ ...form, onde: e.target.value })} /></div>
            <div><Label>Quando? (When)</Label><Input value={form.quando} onChange={e => setForm({ ...form, quando: e.target.value })} /></div>
            <div><Label>Quem? (Who)</Label><Input value={form.quem} onChange={e => setForm({ ...form, quem: e.target.value })} /></div>
            <div><Label>Como? (How)</Label><Input value={form.como} onChange={e => setForm({ ...form, como: e.target.value })} /></div>
            <div><Label>Quanto Custa? (How Much)</Label><Input value={form.quantoCusta} onChange={e => setForm({ ...form, quantoCusta: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={form.status || "none"} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Pendente">Pendente</SelectItem><SelectItem value="Em_Andamento">Em Andamento</SelectItem><SelectItem value="Concluido">Concluído</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ ...form, companyId })} disabled={createMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DDSTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: ddsList = [], isLoading } = trpc.quality.dds.list.useQuery({ companyId });
  const createMut = trpc.quality.dds.create.useMutation({ onSuccess: () => { utils.quality.dds.list.invalidate(); setShowForm(false); toast.success("DDS registrado!"); } });
  const deleteMut = trpc.quality.dds.delete.useMutation({ onSuccess: () => { utils.quality.dds.list.invalidate(); toast.success("DDS excluído!"); } });
  const [form, setForm] = useState<any>({ tema: "", dataRealizacao: "", responsavel: "", participantes: "", descricao: "" });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">Diálogo Diário de Segurança (DDS)</h3>
        <Button onClick={() => { setForm({ tema: "", dataRealizacao: "", responsavel: "", participantes: "", descricao: "" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo DDS
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Tema</th>
              <th className="text-left p-3 font-medium">Data</th>
              <th className="text-left p-3 font-medium">Responsável</th>
              <th className="text-left p-3 font-medium">Participantes</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              : ddsList.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum DDS registrado</td></tr>
              : ddsList.map((d: any) => (
                <tr key={d.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{d.tema}</td>
                  <td className="p-3">{d.dataRealizacao ? new Date(d.dataRealizacao).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3">{d.responsavel ?? "-"}</td>
                  <td className="p-3">{d.participantes ?? "-"}</td>
                  <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: d.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-5xl w-[92vw] max-h-[92vh] overflow-y-auto bg-card p-6">
          <DialogHeader><DialogTitle>Novo DDS</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="col-span-2"><Label>Tema</Label><Input value={form.tema} onChange={e => setForm({ ...form, tema: e.target.value })} /></div>
            <div><Label>Data</Label><Input type="date" value={form.dataRealizacao} onChange={e => setForm({ ...form, dataRealizacao: e.target.value })} /></div>
            <div><Label>Responsável</Label><Input value={form.responsavel} onChange={e => setForm({ ...form, responsavel: e.target.value })} /></div>
            <div className="col-span-2"><Label>Participantes</Label><Input value={form.participantes} onChange={e => setForm({ ...form, participantes: e.target.value })} placeholder="Nomes separados por vírgula" /></div>
            <div className="col-span-2"><Label>Descrição</Label><Input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ ...form, companyId })} disabled={createMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
