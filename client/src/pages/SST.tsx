import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ShieldCheck, Plus, Search, AlertTriangle, GraduationCap, HardHat,
  Siren, Scale, MapPin, Pencil, Trash2, Eye,
} from "lucide-react";

export default function SST() {
  const [companyId] = useState(() => {
    const saved = localStorage.getItem("selectedCompanyId");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [activeTab, setActiveTab] = useState("asos");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SST - Saúde e Segurança do Trabalho</h1>
          <p className="text-muted-foreground mt-1">Gerencie ASOs, treinamentos, EPIs, acidentes, advertências e riscos</p>
        </div>

        {companyId === 0 ? (
          <Card className="p-8 text-center">
            <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Selecione uma empresa no Dashboard para acessar o módulo SST.</p>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="asos" className="text-xs">ASOs</TabsTrigger>
              <TabsTrigger value="treinamentos" className="text-xs">Treinamentos</TabsTrigger>
              <TabsTrigger value="epis" className="text-xs">EPIs</TabsTrigger>
              <TabsTrigger value="acidentes" className="text-xs">Acidentes</TabsTrigger>
              <TabsTrigger value="advertencias" className="text-xs">Advertências</TabsTrigger>
              <TabsTrigger value="riscos" className="text-xs">Riscos</TabsTrigger>
            </TabsList>

            <TabsContent value="asos"><ASOTab companyId={companyId} /></TabsContent>
            <TabsContent value="treinamentos"><TrainingTab companyId={companyId} /></TabsContent>
            <TabsContent value="epis"><EPITab companyId={companyId} /></TabsContent>
            <TabsContent value="acidentes"><AccidentTab companyId={companyId} /></TabsContent>
            <TabsContent value="advertencias"><WarningTab companyId={companyId} /></TabsContent>
            <TabsContent value="riscos"><RiskTab companyId={companyId} /></TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

// ============================================================
// ASO TAB
// ============================================================
function ASOTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();
  const { data: asos = [], isLoading } = trpc.sst.asos.list.useQuery({ companyId });
  const { data: employees = [] } = trpc.employees.list.useQuery({ companyId });
  const createMut = trpc.sst.asos.create.useMutation({ onSuccess: () => { utils.sst.asos.list.invalidate(); setShowForm(false); toast.success("ASO registrado!"); } });
  const deleteMut = trpc.sst.asos.delete.useMutation({ onSuccess: () => { utils.sst.asos.list.invalidate(); toast.success("ASO excluído!"); } });

  const [form, setForm] = useState<any>({ employeeId: "", tipo: "Periodico", dataExame: "", dataValidade: "", resultado: "Apto", medico: "", crm: "", clinica: "", observacoes: "" });

  const filtered = useMemo(() => {
    if (!search) return asos;
    const s = search.toLowerCase();
    return asos.filter((a: any) => {
      const emp = employees.find((e: any) => e.id === a.employeeId);
      return emp?.nomeCompleto?.toLowerCase().includes(s) || a.tipo?.toLowerCase().includes(s);
    });
  }, [asos, search, employees]);

  const getEmpName = (id: number) => employees.find((e: any) => e.id === id)?.nomeCompleto ?? "-";
  const isExpired = (d: string) => d && new Date(d) < new Date();

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar ASO..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { setForm({ employeeId: "", tipo: "Periodico", dataExame: "", dataValidade: "", resultado: "Apto", medico: "", crm: "", clinica: "", observacoes: "" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo ASO
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Colaborador</th>
                <th className="text-left p-3 font-medium">Tipo</th>
                <th className="text-left p-3 font-medium">Data Exame</th>
                <th className="text-left p-3 font-medium">Validade</th>
                <th className="text-left p-3 font-medium">Resultado</th>
                <th className="text-left p-3 font-medium">Médico</th>
                <th className="text-right p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum ASO encontrado</td></tr>
              ) : filtered.map((aso: any) => (
                <tr key={aso.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{getEmpName(aso.employeeId)}</td>
                  <td className="p-3">{aso.tipo?.replace("_", " ")}</td>
                  <td className="p-3">{aso.dataExame ? new Date(aso.dataExame).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3">
                    <span className={isExpired(aso.dataValidade) ? "text-red-600 font-semibold" : ""}>
                      {aso.dataValidade ? new Date(aso.dataValidade).toLocaleDateString("pt-BR") : "-"}
                    </span>
                    {isExpired(aso.dataValidade) && <AlertTriangle className="inline h-3 w-3 ml-1 text-red-600" />}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${aso.resultado === "Apto" ? "bg-green-100 text-green-700" : aso.resultado === "Inapto" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {aso.resultado?.replace("_", " ")}
                    </span>
                  </td>
                  <td className="p-3">{aso.medico ?? "-"}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: aso.id })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo ASO</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Colaborador</Label>
              <Select value={String(form.employeeId)} onValueChange={v => setForm({ ...form, employeeId: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Admissional">Admissional</SelectItem>
                  <SelectItem value="Periodico">Periódico</SelectItem>
                  <SelectItem value="Retorno">Retorno</SelectItem>
                  <SelectItem value="Mudanca_Funcao">Mudança de Função</SelectItem>
                  <SelectItem value="Demissional">Demissional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Resultado</Label>
              <Select value={form.resultado} onValueChange={v => setForm({ ...form, resultado: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Apto">Apto</SelectItem>
                  <SelectItem value="Inapto">Inapto</SelectItem>
                  <SelectItem value="Apto_Restricao">Apto com Restrição</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Data Exame</Label><Input type="date" value={form.dataExame} onChange={e => setForm({ ...form, dataExame: e.target.value })} /></div>
            <div><Label>Validade</Label><Input type="date" value={form.dataValidade} onChange={e => setForm({ ...form, dataValidade: e.target.value })} /></div>
            <div><Label>Médico</Label><Input value={form.medico} onChange={e => setForm({ ...form, medico: e.target.value })} /></div>
            <div><Label>CRM</Label><Input value={form.crm} onChange={e => setForm({ ...form, crm: e.target.value })} /></div>
            <div className="col-span-2"><Label>Clínica</Label><Input value={form.clinica} onChange={e => setForm({ ...form, clinica: e.target.value })} /></div>
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

// ============================================================
// TRAINING TAB
// ============================================================
function TrainingTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();
  const { data: trainings = [], isLoading } = trpc.sst.trainings.list.useQuery({ companyId });
  const { data: employees = [] } = trpc.employees.list.useQuery({ companyId });
  const createMut = trpc.sst.trainings.create.useMutation({ onSuccess: () => { utils.sst.trainings.list.invalidate(); setShowForm(false); toast.success("Treinamento registrado!"); } });
  const deleteMut = trpc.sst.trainings.delete.useMutation({ onSuccess: () => { utils.sst.trainings.list.invalidate(); toast.success("Treinamento excluído!"); } });

  const [form, setForm] = useState<any>({ employeeId: "", nome: "", norma: "", cargaHoraria: "", dataRealizacao: "", dataValidade: "", instrutor: "", entidade: "" });

  const getEmpName = (id: number) => employees.find((e: any) => e.id === id)?.nomeCompleto ?? "-";
  const isExpired = (d: string) => d && new Date(d) < new Date();

  const filtered = useMemo(() => {
    if (!search) return trainings;
    const s = search.toLowerCase();
    return trainings.filter((t: any) => {
      const emp = employees.find((e: any) => e.id === t.employeeId);
      return emp?.nomeCompleto?.toLowerCase().includes(s) || t.nome?.toLowerCase().includes(s) || t.norma?.toLowerCase().includes(s);
    });
  }, [trainings, search, employees]);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar treinamento..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { setForm({ employeeId: "", nome: "", norma: "", cargaHoraria: "", dataRealizacao: "", dataValidade: "", instrutor: "", entidade: "" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Treinamento
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Colaborador</th>
                <th className="text-left p-3 font-medium">Treinamento</th>
                <th className="text-left p-3 font-medium">Norma</th>
                <th className="text-left p-3 font-medium">Realização</th>
                <th className="text-left p-3 font-medium">Validade</th>
                <th className="text-left p-3 font-medium">Instrutor</th>
                <th className="text-right p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum treinamento encontrado</td></tr>
              ) : filtered.map((t: any) => (
                <tr key={t.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{getEmpName(t.employeeId)}</td>
                  <td className="p-3">{t.nome}</td>
                  <td className="p-3">{t.norma ?? "-"}</td>
                  <td className="p-3">{t.dataRealizacao ? new Date(t.dataRealizacao).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3">
                    <span className={isExpired(t.dataValidade) ? "text-red-600 font-semibold" : ""}>
                      {t.dataValidade ? new Date(t.dataValidade).toLocaleDateString("pt-BR") : "-"}
                    </span>
                    {isExpired(t.dataValidade) && <AlertTriangle className="inline h-3 w-3 ml-1 text-red-600" />}
                  </td>
                  <td className="p-3">{t.instrutor ?? "-"}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: t.id })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Treinamento</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Colaborador</Label>
              <Select value={String(form.employeeId)} onValueChange={v => setForm({ ...form, employeeId: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Nome do Treinamento</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Norma (NR)</Label><Input value={form.norma} onChange={e => setForm({ ...form, norma: e.target.value })} placeholder="Ex: NR-35" /></div>
            <div><Label>Carga Horária</Label><Input value={form.cargaHoraria} onChange={e => setForm({ ...form, cargaHoraria: e.target.value })} placeholder="Ex: 8h" /></div>
            <div><Label>Data Realização</Label><Input type="date" value={form.dataRealizacao} onChange={e => setForm({ ...form, dataRealizacao: e.target.value })} /></div>
            <div><Label>Validade</Label><Input type="date" value={form.dataValidade} onChange={e => setForm({ ...form, dataValidade: e.target.value })} /></div>
            <div><Label>Instrutor</Label><Input value={form.instrutor} onChange={e => setForm({ ...form, instrutor: e.target.value })} /></div>
            <div className="col-span-2"><Label>Entidade</Label><Input value={form.entidade} onChange={e => setForm({ ...form, entidade: e.target.value })} /></div>
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

// ============================================================
// EPI TAB
// ============================================================
function EPITab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: episList = [], isLoading } = trpc.sst.epis.list.useQuery({ companyId });
  const createMut = trpc.sst.epis.create.useMutation({ onSuccess: () => { utils.sst.epis.list.invalidate(); setShowForm(false); toast.success("EPI cadastrado!"); } });
  const deleteMut = trpc.sst.epis.delete.useMutation({ onSuccess: () => { utils.sst.epis.list.invalidate(); toast.success("EPI excluído!"); } });

  const [form, setForm] = useState<any>({ nome: "", ca: "", validadeCA: "", fabricante: "", quantidadeEstoque: 0 });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">Cadastro de EPIs</h3>
        <Button onClick={() => { setForm({ nome: "", ca: "", validadeCA: "", fabricante: "", quantidadeEstoque: 0 }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo EPI
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Nome</th>
                <th className="text-left p-3 font-medium">CA</th>
                <th className="text-left p-3 font-medium">Validade CA</th>
                <th className="text-left p-3 font-medium">Fabricante</th>
                <th className="text-left p-3 font-medium">Estoque</th>
                <th className="text-right p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : episList.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum EPI cadastrado</td></tr>
              ) : episList.map((epi: any) => (
                <tr key={epi.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{epi.nome}</td>
                  <td className="p-3">{epi.ca ?? "-"}</td>
                  <td className="p-3">{epi.validadeCA ? new Date(epi.validadeCA).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3">{epi.fabricante ?? "-"}</td>
                  <td className="p-3">{epi.quantidadeEstoque ?? 0}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: epi.id })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo EPI</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>CA</Label><Input value={form.ca} onChange={e => setForm({ ...form, ca: e.target.value })} /></div>
            <div><Label>Validade CA</Label><Input type="date" value={form.validadeCA} onChange={e => setForm({ ...form, validadeCA: e.target.value })} /></div>
            <div><Label>Fabricante</Label><Input value={form.fabricante} onChange={e => setForm({ ...form, fabricante: e.target.value })} /></div>
            <div><Label>Qtd. Estoque</Label><Input type="number" value={form.quantidadeEstoque} onChange={e => setForm({ ...form, quantidadeEstoque: parseInt(e.target.value) || 0 })} /></div>
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

// ============================================================
// ACCIDENT TAB
// ============================================================
function AccidentTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: accidentsList = [], isLoading } = trpc.sst.accidents.list.useQuery({ companyId });
  const { data: employees = [] } = trpc.employees.list.useQuery({ companyId });
  const createMut = trpc.sst.accidents.create.useMutation({ onSuccess: () => { utils.sst.accidents.list.invalidate(); setShowForm(false); toast.success("Acidente registrado!"); } });
  const deleteMut = trpc.sst.accidents.delete.useMutation({ onSuccess: () => { utils.sst.accidents.list.invalidate(); toast.success("Registro excluído!"); } });

  const [form, setForm] = useState<any>({ employeeId: "", dataAcidente: "", tipo: "Tipico", gravidade: "Leve", localAcidente: "", descricao: "", catNumero: "" });
  const getEmpName = (id: number) => employees.find((e: any) => e.id === id)?.nomeCompleto ?? "-";

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">Registro de Acidentes</h3>
        <Button onClick={() => { setForm({ employeeId: "", dataAcidente: "", tipo: "Tipico", gravidade: "Leve", localAcidente: "", descricao: "", catNumero: "" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Registrar Acidente
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Colaborador</th>
                <th className="text-left p-3 font-medium">Data</th>
                <th className="text-left p-3 font-medium">Tipo</th>
                <th className="text-left p-3 font-medium">Gravidade</th>
                <th className="text-left p-3 font-medium">Local</th>
                <th className="text-left p-3 font-medium">CAT</th>
                <th className="text-right p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : accidentsList.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum acidente registrado</td></tr>
              ) : accidentsList.map((a: any) => (
                <tr key={a.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{getEmpName(a.employeeId)}</td>
                  <td className="p-3">{a.dataAcidente ? new Date(a.dataAcidente).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3">{a.tipo?.replace("_", " ")}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.gravidade === "Leve" ? "bg-green-100 text-green-700" : a.gravidade === "Moderado" ? "bg-yellow-100 text-yellow-700" : a.gravidade === "Grave" ? "bg-red-100 text-red-700" : "bg-red-200 text-red-900"}`}>
                      {a.gravidade}
                    </span>
                  </td>
                  <td className="p-3">{a.localAcidente ?? "-"}</td>
                  <td className="p-3">{a.catNumero ?? "-"}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: a.id })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Registrar Acidente</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Colaborador</Label>
              <Select value={String(form.employeeId)} onValueChange={v => setForm({ ...form, employeeId: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Data</Label><Input type="date" value={form.dataAcidente} onChange={e => setForm({ ...form, dataAcidente: e.target.value })} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tipico">Típico</SelectItem>
                  <SelectItem value="Trajeto">Trajeto</SelectItem>
                  <SelectItem value="Doenca_Ocupacional">Doença Ocupacional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gravidade</Label>
              <Select value={form.gravidade} onValueChange={v => setForm({ ...form, gravidade: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Leve">Leve</SelectItem>
                  <SelectItem value="Moderado">Moderado</SelectItem>
                  <SelectItem value="Grave">Grave</SelectItem>
                  <SelectItem value="Fatal">Fatal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Local</Label><Input value={form.localAcidente} onChange={e => setForm({ ...form, localAcidente: e.target.value })} /></div>
            <div><Label>Nº CAT</Label><Input value={form.catNumero} onChange={e => setForm({ ...form, catNumero: e.target.value })} /></div>
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

// ============================================================
// WARNING TAB
// ============================================================
function WarningTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: warningsList = [], isLoading } = trpc.sst.warnings.list.useQuery({ companyId });
  const { data: employees = [] } = trpc.employees.list.useQuery({ companyId });
  const createMut = trpc.sst.warnings.create.useMutation({ onSuccess: () => { utils.sst.warnings.list.invalidate(); setShowForm(false); toast.success("Advertência registrada!"); } });
  const deleteMut = trpc.sst.warnings.delete.useMutation({ onSuccess: () => { utils.sst.warnings.list.invalidate(); toast.success("Registro excluído!"); } });

  const [form, setForm] = useState<any>({ employeeId: "", tipo: "Verbal", dataOcorrencia: "", motivo: "", descricao: "" });
  const getEmpName = (id: number) => employees.find((e: any) => e.id === id)?.nomeCompleto ?? "-";

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">Advertências e OSS</h3>
        <Button onClick={() => { setForm({ employeeId: "", tipo: "Verbal", dataOcorrencia: "", motivo: "", descricao: "" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova Advertência
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Colaborador</th>
                <th className="text-left p-3 font-medium">Tipo</th>
                <th className="text-left p-3 font-medium">Data</th>
                <th className="text-left p-3 font-medium">Motivo</th>
                <th className="text-right p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : warningsList.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhuma advertência registrada</td></tr>
              ) : warningsList.map((w: any) => (
                <tr key={w.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{getEmpName(w.employeeId)}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${w.tipo === "Verbal" ? "bg-blue-100 text-blue-700" : w.tipo === "Escrita" ? "bg-yellow-100 text-yellow-700" : w.tipo === "Suspensao" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                      {w.tipo}
                    </span>
                  </td>
                  <td className="p-3">{w.dataOcorrencia ? new Date(w.dataOcorrencia).toLocaleDateString("pt-BR") : "-"}</td>
                  <td className="p-3 max-w-xs truncate">{w.motivo ?? "-"}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: w.id })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Advertência</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Colaborador</Label>
              <Select value={String(form.employeeId)} onValueChange={v => setForm({ ...form, employeeId: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Verbal">Verbal</SelectItem>
                  <SelectItem value="Escrita">Escrita</SelectItem>
                  <SelectItem value="Suspensao">Suspensão</SelectItem>
                  <SelectItem value="OSS">OSS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Data</Label><Input type="date" value={form.dataOcorrencia} onChange={e => setForm({ ...form, dataOcorrencia: e.target.value })} /></div>
            <div className="col-span-2"><Label>Motivo</Label><Input value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} /></div>
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

// ============================================================
// RISK TAB
// ============================================================
function RiskTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: risksList = [], isLoading } = trpc.sst.risks.list.useQuery({ companyId });
  const createMut = trpc.sst.risks.create.useMutation({ onSuccess: () => { utils.sst.risks.list.invalidate(); setShowForm(false); toast.success("Risco registrado!"); } });
  const deleteMut = trpc.sst.risks.delete.useMutation({ onSuccess: () => { utils.sst.risks.list.invalidate(); toast.success("Risco excluído!"); } });

  const [form, setForm] = useState<any>({ setor: "", agenteRisco: "", tipoRisco: "Fisico", fonteGeradora: "", grauRisco: "Baixo", medidasControle: "" });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">Mapeamento de Riscos</h3>
        <Button onClick={() => { setForm({ setor: "", agenteRisco: "", tipoRisco: "Fisico", fonteGeradora: "", grauRisco: "Baixo", medidasControle: "" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Risco
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Setor</th>
                <th className="text-left p-3 font-medium">Agente</th>
                <th className="text-left p-3 font-medium">Tipo</th>
                <th className="text-left p-3 font-medium">Grau</th>
                <th className="text-left p-3 font-medium">Fonte Geradora</th>
                <th className="text-right p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : risksList.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum risco mapeado</td></tr>
              ) : risksList.map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{r.setor}</td>
                  <td className="p-3">{r.agenteRisco}</td>
                  <td className="p-3">{r.tipoRisco}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.grauRisco === "Baixo" ? "bg-green-100 text-green-700" : r.grauRisco === "Medio" ? "bg-yellow-100 text-yellow-700" : r.grauRisco === "Alto" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>
                      {r.grauRisco}
                    </span>
                  </td>
                  <td className="p-3">{r.fonteGeradora ?? "-"}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: r.id })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo Risco</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Setor</Label><Input value={form.setor} onChange={e => setForm({ ...form, setor: e.target.value })} /></div>
            <div><Label>Agente de Risco</Label><Input value={form.agenteRisco} onChange={e => setForm({ ...form, agenteRisco: e.target.value })} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipoRisco} onValueChange={v => setForm({ ...form, tipoRisco: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Fisico">Físico</SelectItem>
                  <SelectItem value="Quimico">Químico</SelectItem>
                  <SelectItem value="Biologico">Biológico</SelectItem>
                  <SelectItem value="Ergonomico">Ergonômico</SelectItem>
                  <SelectItem value="Acidente">Acidente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Grau</Label>
              <Select value={form.grauRisco} onValueChange={v => setForm({ ...form, grauRisco: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Baixo">Baixo</SelectItem>
                  <SelectItem value="Medio">Médio</SelectItem>
                  <SelectItem value="Alto">Alto</SelectItem>
                  <SelectItem value="Critico">Crítico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Fonte Geradora</Label><Input value={form.fonteGeradora} onChange={e => setForm({ ...form, fonteGeradora: e.target.value })} /></div>
            <div className="col-span-2"><Label>Medidas de Controle</Label><Input value={form.medidasControle} onChange={e => setForm({ ...form, medidasControle: e.target.value })} /></div>
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
