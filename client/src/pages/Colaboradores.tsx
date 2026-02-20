import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Users, Plus, Search, Pencil, Trash2, Eye } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { EMPLOYEE_STATUS } from "../../../shared/modules";

const statusColors: Record<string, string> = {
  Ativo: "bg-green-400/10 text-green-400",
  Ferias: "bg-blue-400/10 text-blue-400",
  Afastado: "bg-yellow-400/10 text-yellow-400",
  Licenca: "bg-purple-400/10 text-purple-400",
  Desligado: "bg-red-400/10 text-red-400",
  Recluso: "bg-gray-400/10 text-gray-400",
};

const statusLabels: Record<string, string> = {
  Ativo: "Ativo", Ferias: "Férias", Afastado: "Afastado",
  Licenca: "Licença", Desligado: "Desligado", Recluso: "Recluso",
};

export default function Colaboradores() {
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: companies } = trpc.companies.list.useQuery();
  const companyId = selectedCompany ? parseInt(selectedCompany) : undefined;

  useEffect(() => {
    if (companies && companies.length > 0 && !selectedCompany) {
      setSelectedCompany(String(companies[0].id));
    }
  }, [companies, selectedCompany]);

  const utils = trpc.useUtils();
  const { data: employees, isLoading } = trpc.employees.list.useQuery(
    { companyId: companyId!, search: search || undefined, status: statusFilter !== "Todos" ? statusFilter : undefined },
    { enabled: !!companyId }
  );

  const createMut = trpc.employees.create.useMutation({
    onSuccess: () => { utils.employees.list.invalidate(); utils.employees.stats.invalidate(); setDialogOpen(false); toast.success("Colaborador cadastrado!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const updateMut = trpc.employees.update.useMutation({
    onSuccess: () => { utils.employees.list.invalidate(); utils.employees.stats.invalidate(); setDialogOpen(false); toast.success("Colaborador atualizado!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const deleteMut = trpc.employees.delete.useMutation({
    onSuccess: () => { utils.employees.list.invalidate(); utils.employees.stats.invalidate(); toast.success("Colaborador excluído!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const openNew = () => {
    setEditingId(null);
    setForm({ status: "Ativo" });
    setDialogOpen(true);
  };

  const openEdit = (emp: any) => {
    setEditingId(emp.id);
    const f: Record<string, string> = {};
    Object.entries(emp).forEach(([k, v]) => {
      if (v !== null && v !== undefined && typeof v !== "object") f[k] = String(v);
      else if (v instanceof Date) f[k] = v.toISOString().split("T")[0];
    });
    setForm(f);
    setDialogOpen(true);
  };

  const openView = (emp: any) => {
    setViewingEmployee(emp);
    setViewDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.nomeCompleto || !form.cpf) {
      toast.error("Nome e CPF são obrigatórios.");
      return;
    }
    if (editingId) {
      updateMut.mutate({ id: editingId, companyId: companyId!, data: form });
    } else {
      createMut.mutate({ ...form, companyId: companyId! } as any);
    }
  };

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Colaboradores</h1>
            <p className="text-muted-foreground text-sm mt-1">Cadastro e gestão de colaboradores</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedCompany} onValueChange={setSelectedCompany}>
              <SelectTrigger className="w-56 bg-card border-border">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies?.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nomeFantasia || c.razaoSocial}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={openNew} disabled={!companyId} className="gap-2">
              <Plus className="h-4 w-4" /> Novo
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CPF, RG ou cargo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 bg-card border-border"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos</SelectItem>
              {EMPLOYEE_STATUS.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {!companyId ? (
          <Card className="bg-card border-border">
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground">Selecione uma empresa para visualizar os colaboradores.</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <Card className="bg-card border-border animate-pulse"><CardContent className="h-64" /></Card>
        ) : employees && employees.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">CPF</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Cargo</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Setor</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id} className="border-t border-border hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{emp.nomeCompleto}</td>
                    <td className="px-4 py-3 text-muted-foreground">{emp.cpf}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{emp.cargo ?? "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{emp.setor ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColors[emp.status] ?? ""}`}>
                        {statusLabels[emp.status] ?? emp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openView(emp)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(emp)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                          if (confirm("Excluir este colaborador?")) deleteMut.mutate({ id: emp.id, companyId: companyId! });
                        }}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum colaborador encontrado</h3>
              <p className="text-muted-foreground text-sm mb-4">
                {search ? "Tente outra busca." : "Cadastre o primeiro colaborador."}
              </p>
              {!search && <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Novo Colaborador</Button>}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Colaborador" : "Novo Colaborador"}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="pessoal" className="w-full">
            <TabsList className="grid w-full grid-cols-5 bg-secondary">
              <TabsTrigger value="pessoal">Pessoal</TabsTrigger>
              <TabsTrigger value="documentos">Documentos</TabsTrigger>
              <TabsTrigger value="endereco">Endereço</TabsTrigger>
              <TabsTrigger value="profissional">Profissional</TabsTrigger>
              <TabsTrigger value="bancario">Bancário</TabsTrigger>
            </TabsList>

            <TabsContent value="pessoal" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label>Nome Completo *</Label>
                  <Input value={form.nomeCompleto ?? ""} onChange={e => set("nomeCompleto", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>CPF *</Label>
                  <Input value={form.cpf ?? ""} onChange={e => set("cpf", e.target.value)} placeholder="000.000.000-00" className="bg-input" />
                </div>
                <div>
                  <Label>Data de Nascimento</Label>
                  <Input type="date" value={form.dataNascimento ?? ""} onChange={e => set("dataNascimento", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Sexo</Label>
                  <Select value={form.sexo ?? ""} onValueChange={v => set("sexo", v)}>
                    <SelectTrigger className="bg-input"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Feminino</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Estado Civil</Label>
                  <Select value={form.estadoCivil ?? ""} onValueChange={v => set("estadoCivil", v)}>
                    <SelectTrigger className="bg-input"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Solteiro">Solteiro(a)</SelectItem>
                      <SelectItem value="Casado">Casado(a)</SelectItem>
                      <SelectItem value="Divorciado">Divorciado(a)</SelectItem>
                      <SelectItem value="Viuvo">Viúvo(a)</SelectItem>
                      <SelectItem value="Uniao_Estavel">União Estável</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nacionalidade</Label>
                  <Input value={form.nacionalidade ?? ""} onChange={e => set("nacionalidade", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Naturalidade</Label>
                  <Input value={form.naturalidade ?? ""} onChange={e => set("naturalidade", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Nome da Mãe</Label>
                  <Input value={form.nomeMae ?? ""} onChange={e => set("nomeMae", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Nome do Pai</Label>
                  <Input value={form.nomePai ?? ""} onChange={e => set("nomePai", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Celular</Label>
                  <Input value={form.celular ?? ""} onChange={e => set("celular", e.target.value)} placeholder="(00) 00000-0000" className="bg-input" />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input value={form.email ?? ""} onChange={e => set("email", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Contato de Emergência</Label>
                  <Input value={form.contatoEmergencia ?? ""} onChange={e => set("contatoEmergencia", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Tel. Emergência</Label>
                  <Input value={form.telefoneEmergencia ?? ""} onChange={e => set("telefoneEmergencia", e.target.value)} className="bg-input" />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="documentos" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>RG</Label>
                  <Input value={form.rg ?? ""} onChange={e => set("rg", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Órgão Emissor</Label>
                  <Input value={form.orgaoEmissor ?? ""} onChange={e => set("orgaoEmissor", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>CTPS</Label>
                  <Input value={form.ctps ?? ""} onChange={e => set("ctps", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Série CTPS</Label>
                  <Input value={form.serieCTPS ?? ""} onChange={e => set("serieCTPS", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>PIS</Label>
                  <Input value={form.pis ?? ""} onChange={e => set("pis", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Título de Eleitor</Label>
                  <Input value={form.tituloEleitor ?? ""} onChange={e => set("tituloEleitor", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Certificado de Reservista</Label>
                  <Input value={form.certificadoReservista ?? ""} onChange={e => set("certificadoReservista", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>CNH</Label>
                  <Input value={form.cnh ?? ""} onChange={e => set("cnh", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Categoria CNH</Label>
                  <Input value={form.categoriaCNH ?? ""} onChange={e => set("categoriaCNH", e.target.value)} placeholder="A, B, AB..." className="bg-input" />
                </div>
                <div>
                  <Label>Validade CNH</Label>
                  <Input type="date" value={form.validadeCNH ?? ""} onChange={e => set("validadeCNH", e.target.value)} className="bg-input" />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="endereco" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label>Logradouro</Label>
                  <Input value={form.logradouro ?? ""} onChange={e => set("logradouro", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input value={form.numero ?? ""} onChange={e => set("numero", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Complemento</Label>
                  <Input value={form.complemento ?? ""} onChange={e => set("complemento", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input value={form.bairro ?? ""} onChange={e => set("bairro", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={form.cidade ?? ""} onChange={e => set("cidade", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>UF</Label>
                  <Input value={form.estado ?? ""} onChange={e => set("estado", e.target.value)} maxLength={2} className="bg-input" />
                </div>
                <div>
                  <Label>CEP</Label>
                  <Input value={form.cep ?? ""} onChange={e => set("cep", e.target.value)} placeholder="00000-000" className="bg-input" />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="profissional" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Matrícula</Label>
                  <Input value={form.matricula ?? ""} onChange={e => set("matricula", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status ?? "Ativo"} onValueChange={v => set("status", v)}>
                    <SelectTrigger className="bg-input"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYEE_STATUS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cargo</Label>
                  <Input value={form.cargo ?? ""} onChange={e => set("cargo", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Função</Label>
                  <Input value={form.funcao ?? ""} onChange={e => set("funcao", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Setor</Label>
                  <Input value={form.setor ?? ""} onChange={e => set("setor", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Data de Admissão</Label>
                  <Input type="date" value={form.dataAdmissao ?? ""} onChange={e => set("dataAdmissao", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Salário Base</Label>
                  <Input value={form.salarioBase ?? ""} onChange={e => set("salarioBase", e.target.value)} placeholder="R$ 0,00" className="bg-input" />
                </div>
                <div>
                  <Label>Horas Mensais</Label>
                  <Input value={form.horasMensais ?? ""} onChange={e => set("horasMensais", e.target.value)} placeholder="220" className="bg-input" />
                </div>
                <div>
                  <Label>Tipo de Contrato</Label>
                  <Select value={form.tipoContrato ?? ""} onValueChange={v => set("tipoContrato", v)}>
                    <SelectTrigger className="bg-input"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLT">CLT</SelectItem>
                      <SelectItem value="PJ">PJ</SelectItem>
                      <SelectItem value="Temporario">Temporário</SelectItem>
                      <SelectItem value="Estagio">Estágio</SelectItem>
                      <SelectItem value="Aprendiz">Aprendiz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Jornada de Trabalho</Label>
                  <Input value={form.jornadaTrabalho ?? ""} onChange={e => set("jornadaTrabalho", e.target.value)} placeholder="08:00 às 17:00" className="bg-input" />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="bancario" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Banco</Label>
                  <Input value={form.banco ?? ""} onChange={e => set("banco", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Agência</Label>
                  <Input value={form.agencia ?? ""} onChange={e => set("agencia", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Conta</Label>
                  <Input value={form.conta ?? ""} onChange={e => set("conta", e.target.value)} className="bg-input" />
                </div>
                <div>
                  <Label>Tipo de Conta</Label>
                  <Select value={form.tipoConta ?? ""} onValueChange={v => set("tipoConta", v)}>
                    <SelectTrigger className="bg-input"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Corrente">Corrente</SelectItem>
                      <SelectItem value="Poupanca">Poupança</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Chave PIX</Label>
                  <Input value={form.chavePix ?? ""} onChange={e => set("chavePix", e.target.value)} className="bg-input" />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="sm:col-span-2 pt-2">
            <Label>Observações</Label>
            <textarea
              value={form.observacoes ?? ""}
              onChange={e => set("observacoes", e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
              {createMut.isPending || updateMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card">
          <DialogHeader>
            <DialogTitle>Ficha do Colaborador</DialogTitle>
          </DialogHeader>
          {viewingEmployee && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">
                    {viewingEmployee.nomeCompleto?.charAt(0)}
                  </span>
                </div>
                <div>
                  <h2 className="text-lg font-bold">{viewingEmployee.nomeCompleto}</h2>
                  <p className="text-sm text-muted-foreground">{viewingEmployee.cargo ?? "Sem cargo"} &middot; {viewingEmployee.setor ?? "Sem setor"}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColors[viewingEmployee.status] ?? ""}`}>
                    {statusLabels[viewingEmployee.status] ?? viewingEmployee.status}
                  </span>
                </div>
              </div>

              {[
                { title: "Dados Pessoais", fields: [
                  ["CPF", viewingEmployee.cpf], ["RG", viewingEmployee.rg],
                  ["Nascimento", viewingEmployee.dataNascimento], ["Sexo", viewingEmployee.sexo === "M" ? "Masculino" : viewingEmployee.sexo === "F" ? "Feminino" : viewingEmployee.sexo],
                  ["Estado Civil", viewingEmployee.estadoCivil], ["Celular", viewingEmployee.celular],
                  ["E-mail", viewingEmployee.email],
                ]},
                { title: "Profissional", fields: [
                  ["Matrícula", viewingEmployee.matricula], ["Admissão", viewingEmployee.dataAdmissao],
                  ["Contrato", viewingEmployee.tipoContrato], ["Jornada", viewingEmployee.jornadaTrabalho],
                  ["Salário", viewingEmployee.salarioBase], ["Horas/Mês", viewingEmployee.horasMensais],
                ]},
                { title: "Endereço", fields: [
                  ["Logradouro", viewingEmployee.logradouro], ["Nº", viewingEmployee.numero],
                  ["Bairro", viewingEmployee.bairro], ["Cidade", `${viewingEmployee.cidade ?? ""}${viewingEmployee.estado ? " - " + viewingEmployee.estado : ""}`],
                  ["CEP", viewingEmployee.cep],
                ]},
                { title: "Bancário", fields: [
                  ["Banco", viewingEmployee.banco], ["Agência", viewingEmployee.agencia],
                  ["Conta", viewingEmployee.conta], ["Tipo", viewingEmployee.tipoConta],
                  ["PIX", viewingEmployee.chavePix],
                ]},
              ].map(section => (
                <div key={section.title}>
                  <h3 className="text-sm font-semibold text-primary mb-2">{section.title}</h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    {section.fields.filter(([, v]) => v).map(([label, value]) => (
                      <div key={label as string} className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">{value as string}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
