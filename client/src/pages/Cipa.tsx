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
import { Vote, Plus, Trash2, AlertTriangle, Calendar, Users } from "lucide-react";

export default function Cipa() {
  const [companyId] = useState(() => {
    const saved = localStorage.getItem("selectedCompanyId");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [activeTab, setActiveTab] = useState("membros");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CIPA</h1>
          <p className="text-muted-foreground mt-1">Comissão Interna de Prevenção de Acidentes — Membros e Cronograma Eleitoral</p>
        </div>
        {companyId === 0 ? (
          <Card className="p-8 text-center">
            <Vote className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Selecione uma empresa no Dashboard para acessar o módulo.</p>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-2 w-full max-w-md">
              <TabsTrigger value="membros">Membros CIPA</TabsTrigger>
              <TabsTrigger value="eleicoes">Eleições</TabsTrigger>
            </TabsList>
            <TabsContent value="membros"><MembrosTab companyId={companyId} /></TabsContent>
            <TabsContent value="eleicoes"><EleicoesTab companyId={companyId} /></TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

function MembrosTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: members = [], isLoading } = trpc.cipa.members.list.useQuery({ companyId });
  const { data: employees = [] } = trpc.employees.list.useQuery({ companyId });
  const createMut = trpc.cipa.members.create.useMutation({ onSuccess: () => { utils.cipa.members.list.invalidate(); setShowForm(false); toast.success("Membro CIPA cadastrado!"); } });
  const deleteMut = trpc.cipa.members.delete.useMutation({ onSuccess: () => { utils.cipa.members.list.invalidate(); toast.success("Membro removido!"); } });
  const { data: elections = [] } = trpc.cipa.elections.list.useQuery({ companyId });
  const [form, setForm] = useState<any>({ employeeId: "", electionId: "", cargo: "Membro_Titular", representacao: "Empregados", inicioEstabilidade: "", fimEstabilidade: "", status: "Ativo" });
  const getEmpName = (id: number) => employees.find((e: any) => e.id === id)?.nomeCompleto ?? "-";
  const isExpired = (d: string) => d && new Date(d) < new Date();

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Users className="h-5 w-5" /> Membros da CIPA</h3>
        <Button onClick={() => { setForm({ employeeId: "", electionId: "", cargo: "Membro_Titular", representacao: "Empregados", inicioEstabilidade: "", fimEstabilidade: "", status: "Ativo" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Membro
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Colaborador</th>
              <th className="text-left p-3 font-medium">Cargo</th>
              <th className="text-left p-3 font-medium">Representação</th>
              <th className="text-left p-3 font-medium">Início Estab.</th>
              <th className="text-left p-3 font-medium">Fim Estab.</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              : members.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum membro cadastrado</td></tr>
              : members.map((m: any) => (
                <tr key={m.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{getEmpName(m.employeeId)}</td>
                  <td className="p-3">{m.cargo?.replace("_", " ")}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${m.representacao === "Empregados" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>{m.representacao}</span></td>
                  <td className="p-3">{m.inicioEstabilidade ? new Date(m.inicioEstabilidade).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3">
                    <span className={isExpired(m.fimEstabilidade) ? "" : "text-green-600 font-semibold"}>
                      {m.fimEstabilidade ? new Date(m.fimEstabilidade).toLocaleDateString("pt-BR") : "-"}
                    </span>
                    {!isExpired(m.fimEstabilidade) && m.fimEstabilidade && <AlertTriangle className="inline h-3 w-3 ml-1 text-yellow-600" />}
                  </td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${m.status === "Ativo" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{m.status}</span></td>
                  <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: m.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Membro CIPA</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Colaborador *</Label>
              <Select value={String(form.employeeId)} onValueChange={v => setForm({ ...form, employeeId: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Eleição</Label>
              <Select value={String(form.electionId)} onValueChange={v => setForm({ ...form, electionId: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{elections.map((el: any) => <SelectItem key={el.id} value={String(el.id)}>Gestão {el.mandatoInicio ? new Date(el.mandatoInicio).getFullYear() : ""}/{el.mandatoFim ? new Date(el.mandatoFim).getFullYear() : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Cargo</Label>
              <Select value={form.cargo} onValueChange={v => setForm({ ...form, cargo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Presidente">Presidente</SelectItem>
                  <SelectItem value="Vice_Presidente">Vice-Presidente</SelectItem>
                  <SelectItem value="Secretario">Secretário</SelectItem>
                  <SelectItem value="Membro_Titular">Membro Titular</SelectItem>
                  <SelectItem value="Membro_Suplente">Membro Suplente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Representação</Label>
              <Select value={form.representacao} onValueChange={v => setForm({ ...form, representacao: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Empregador">Empregador</SelectItem><SelectItem value="Empregados">Empregados</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Ativo">Ativo</SelectItem><SelectItem value="Desligado">Desligado</SelectItem><SelectItem value="Substituido">Substituído</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Início Estabilidade</Label><Input type="date" value={form.inicioEstabilidade} onChange={e => setForm({ ...form, inicioEstabilidade: e.target.value })} /></div>
            <div><Label>Fim Estabilidade</Label><Input type="date" value={form.fimEstabilidade} onChange={e => setForm({ ...form, fimEstabilidade: e.target.value })} /></div>
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

function EleicoesTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: elections = [], isLoading } = trpc.cipa.elections.list.useQuery({ companyId });
  const createMut = trpc.cipa.elections.create.useMutation({ onSuccess: () => { utils.cipa.elections.list.invalidate(); setShowForm(false); toast.success("Eleição registrada!"); } });
  const deleteMut = trpc.cipa.elections.delete.useMutation({ onSuccess: () => { utils.cipa.elections.list.invalidate(); toast.success("Eleição excluída!"); } });
  const [form, setForm] = useState<any>({ mandatoInicio: "", mandatoFim: "", dataEdital: "", dataInscricaoInicio: "", dataInscricaoFim: "", dataEleicao: "", dataPosse: "", statusEleicao: "Planejamento", observacoes: "" });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Calendar className="h-5 w-5" /> Cronograma Eleitoral</h3>
        <Button onClick={() => { setForm({ mandatoInicio: "", mandatoFim: "", dataEdital: "", dataInscricaoInicio: "", dataInscricaoFim: "", dataEleicao: "", dataPosse: "", statusEleicao: "Planejamento", observacoes: "" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova Eleição
        </Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Mandato Início</th>
              <th className="text-left p-3 font-medium">Mandato Fim</th>
              <th className="text-left p-3 font-medium">Eleição</th>
              <th className="text-left p-3 font-medium">Posse</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              : elections.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhuma eleição registrada</td></tr>
              : elections.map((e: any) => (
                <tr key={e.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{e.mandatoInicio ? new Date(e.mandatoInicio).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3">{e.mandatoFim ? new Date(e.mandatoFim).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3">{e.dataEleicao ? new Date(e.dataEleicao).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3">{e.dataPosse ? new Date(e.dataPosse).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${e.statusEleicao === "Planejamento" ? "bg-blue-100 text-blue-700" : e.statusEleicao === "Concluida" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{e.statusEleicao}</span></td>
                  <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: e.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova Eleição CIPA</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Início Mandato *</Label><Input type="date" value={form.mandatoInicio} onChange={e => setForm({ ...form, mandatoInicio: e.target.value })} /></div>
            <div><Label>Fim Mandato *</Label><Input type="date" value={form.mandatoFim} onChange={e => setForm({ ...form, mandatoFim: e.target.value })} /></div>
            <div><Label>Data Edital</Label><Input type="date" value={form.dataEdital} onChange={e => setForm({ ...form, dataEdital: e.target.value })} /></div>
            <div><Label>Início Inscrição</Label><Input type="date" value={form.dataInscricaoInicio} onChange={e => setForm({ ...form, dataInscricaoInicio: e.target.value })} /></div>
            <div><Label>Fim Inscrição</Label><Input type="date" value={form.dataInscricaoFim} onChange={e => setForm({ ...form, dataInscricaoFim: e.target.value })} /></div>
            <div><Label>Data Eleição</Label><Input type="date" value={form.dataEleicao} onChange={e => setForm({ ...form, dataEleicao: e.target.value })} /></div>
            <div><Label>Data Posse</Label><Input type="date" value={form.dataPosse} onChange={e => setForm({ ...form, dataPosse: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={form.statusEleicao} onValueChange={v => setForm({ ...form, statusEleicao: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Planejamento">Planejamento</SelectItem><SelectItem value="Inscricao">Inscrição</SelectItem><SelectItem value="Campanha">Campanha</SelectItem><SelectItem value="Votacao">Votação</SelectItem><SelectItem value="Apuracao">Apuração</SelectItem><SelectItem value="Concluida">Concluída</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Observações</Label><Input value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
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
