import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Users, Plus, Search, Pencil, Trash2, Eye, Ban, GraduationCap, ShieldCheck, Scale, FileText, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { EMPLOYEE_STATUS } from "../../../shared/modules";

const statusColors: Record<string, string> = {
  Ativo: "bg-green-400/10 text-green-400",
  Ferias: "bg-blue-400/10 text-blue-400",
  Afastado: "bg-yellow-400/10 text-yellow-400",
  Licenca: "bg-purple-400/10 text-purple-400",
  Desligado: "bg-red-400/10 text-red-400",
  Recluso: "bg-gray-400/10 text-gray-400",
  ListaNegra: "bg-red-600/20 text-red-600",
};

const statusLabels: Record<string, string> = {
  Ativo: "Ativo", Ferias: "Férias", Afastado: "Afastado",
  Licenca: "Licença", Desligado: "Desligado", Recluso: "Recluso",
  ListaNegra: "Lista Negra",
};

// Helper: formatar qualquer valor para exibição segura (evita React error #31 com Date)
function safeDisplay(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (value instanceof Date) return value.toLocaleDateString("pt-BR");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDate(val: unknown): string {
  if (!val) return "-";
  if (val instanceof Date) return val.toLocaleDateString("pt-BR");
  const s = String(val);
  // formato ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s + "T12:00:00");
    return d.toLocaleDateString("pt-BR");
  }
  return s;
}

export default function Colaboradores() {
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [blacklistAlert, setBlacklistAlert] = useState<string | null>(null);

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

  const checkBlacklistMut = trpc.blacklist.check.useQuery(
    { cpf: form.cpf ?? "" },
    { enabled: !!(form.cpf && form.cpf.replace(/\D/g, "").length >= 11 && !editingId) }
  );

  useEffect(() => {
    const d = checkBlacklistMut.data as any;
    if (d && d.status === "ListaNegra") {
      setBlacklistAlert(`⛔ ATENÇÃO: CPF encontrado na LISTA NEGRA! Funcionário "${d.nomeCompleto}" está proibido de ser contratado. Motivo: ${d.motivoListaNegra ?? "Não informado"}`);
    } else {
      setBlacklistAlert(null);
    }
  }, [checkBlacklistMut.data]);

  const openNew = () => {
    setEditingId(null);
    setForm({ status: "Ativo", companyId: selectedCompany });
    setBlacklistAlert(null);
    setDialogOpen(true);
  };

  const openEdit = (emp: any) => {
    setEditingId(emp.id);
    const f: Record<string, string> = {};
    Object.entries(emp).forEach(([k, v]) => {
      if (v !== null && v !== undefined) {
        if (v instanceof Date) f[k] = v.toISOString().split("T")[0];
        else if (typeof v !== "object") f[k] = String(v);
      }
    });
    // Garantir que companyId está no form
    if (!f.companyId && companyId) f.companyId = String(companyId);
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
    const targetCompanyId = form.companyId ? parseInt(form.companyId) : companyId!;
    if (editingId) {
      const { companyId: _cid, ...data } = form;
      updateMut.mutate({ id: editingId, companyId: targetCompanyId, data });
    } else {
      createMut.mutate({ ...form, companyId: targetCompanyId } as any);
    }
  };

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  // Nome da empresa para exibição
  const getCompanyName = (cId: number) => {
    const c = companies?.find(c => c.id === cId);
    return c ? (c.nomeFantasia || c.razaoSocial) : "-";
  };

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
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openView(emp)} title="Ver ficha"><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(emp)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Excluir" onClick={() => {
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
              {!search ? <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Novo Colaborador</Button> : null}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ============================================================ */}
      {/* FORM DIALOG - CADASTRO / EDIÇÃO */}
      {/* ============================================================ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl">{editingId ? "Editar Colaborador" : "Novo Colaborador"}</DialogTitle>
          </DialogHeader>

          {/* EMPRESA */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-2">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-5 w-5 text-primary" />
              <Label className="text-base font-semibold text-primary">Empresa</Label>
            </div>
            <Select value={form.companyId || selectedCompany} onValueChange={v => set("companyId", v)}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies?.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nomeFantasia || c.razaoSocial}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="pessoal" className="w-full">
            <TabsList className="w-full flex bg-secondary/80 rounded-lg p-1 gap-1">
              <TabsTrigger value="pessoal" className="flex-1 text-xs sm:text-sm">Pessoal</TabsTrigger>
              <TabsTrigger value="documentos" className="flex-1 text-xs sm:text-sm">Documentos</TabsTrigger>
              <TabsTrigger value="endereco" className="flex-1 text-xs sm:text-sm">Endereço</TabsTrigger>
              <TabsTrigger value="profissional" className="flex-1 text-xs sm:text-sm">Profissional</TabsTrigger>
              <TabsTrigger value="bancario" className="flex-1 text-xs sm:text-sm">Bancário</TabsTrigger>
            </TabsList>

            {/* ===== ABA PESSOAL ===== */}
            <TabsContent value="pessoal" className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs font-medium text-muted-foreground">Nome Completo *</Label>
                  <Input value={form.nomeCompleto ?? ""} onChange={e => set("nomeCompleto", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">CPF *</Label>
                  <Input value={form.cpf ?? ""} onChange={e => set("cpf", e.target.value)} placeholder="000.000.000-00" className={`bg-input mt-1 ${blacklistAlert ? "border-red-600 ring-1 ring-red-600" : ""}`} />
                </div>
                {blacklistAlert ? (
                  <div className="sm:col-span-2 lg:col-span-3 bg-red-600/10 border border-red-600/30 rounded-lg p-3 flex items-center gap-2">
                    <Ban className="h-5 w-5 text-red-600 shrink-0" />
                    <p className="text-sm font-medium text-red-600">{blacklistAlert}</p>
                  </div>
                ) : null}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Data de Nascimento</Label>
                  <Input type="date" value={form.dataNascimento ?? ""} onChange={e => set("dataNascimento", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Sexo</Label>
                  <Select value={form.sexo || undefined} onValueChange={v => set("sexo", v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Feminino</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Estado Civil</Label>
                  <Select value={form.estadoCivil || undefined} onValueChange={v => set("estadoCivil", v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
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
                  <Label className="text-xs font-medium text-muted-foreground">Nacionalidade</Label>
                  <Input value={form.nacionalidade ?? ""} onChange={e => set("nacionalidade", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Naturalidade</Label>
                  <Input value={form.naturalidade ?? ""} onChange={e => set("naturalidade", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Nome da Mãe</Label>
                  <Input value={form.nomeMae ?? ""} onChange={e => set("nomeMae", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Nome do Pai</Label>
                  <Input value={form.nomePai ?? ""} onChange={e => set("nomePai", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Celular</Label>
                  <Input value={form.celular ?? ""} onChange={e => set("celular", e.target.value)} placeholder="(00) 00000-0000" className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">E-mail</Label>
                  <Input value={form.email ?? ""} onChange={e => set("email", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Contato de Emergência</Label>
                  <Input value={form.contatoEmergencia ?? ""} onChange={e => set("contatoEmergencia", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Tel. Emergência</Label>
                  <Input value={form.telefoneEmergencia ?? ""} onChange={e => set("telefoneEmergencia", e.target.value)} className="bg-input mt-1" />
                </div>
              </div>
            </TabsContent>

            {/* ===== ABA DOCUMENTOS ===== */}
            <TabsContent value="documentos" className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">RG</Label>
                  <Input value={form.rg ?? ""} onChange={e => set("rg", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Órgão Emissor</Label>
                  <Input value={form.orgaoEmissor ?? ""} onChange={e => set("orgaoEmissor", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">CTPS</Label>
                  <Input value={form.ctps ?? ""} onChange={e => set("ctps", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Série CTPS</Label>
                  <Input value={form.serieCTPS ?? ""} onChange={e => set("serieCTPS", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">PIS</Label>
                  <Input value={form.pis ?? ""} onChange={e => set("pis", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Título de Eleitor</Label>
                  <Input value={form.tituloEleitor ?? ""} onChange={e => set("tituloEleitor", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Certificado de Reservista</Label>
                  <Input value={form.certificadoReservista ?? ""} onChange={e => set("certificadoReservista", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">CNH</Label>
                  <Input value={form.cnh ?? ""} onChange={e => set("cnh", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Categoria CNH</Label>
                  <Input value={form.categoriaCNH ?? ""} onChange={e => set("categoriaCNH", e.target.value)} placeholder="A, B, AB..." className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Validade CNH</Label>
                  <Input type="date" value={form.validadeCNH ?? ""} onChange={e => set("validadeCNH", e.target.value)} className="bg-input mt-1" />
                </div>
              </div>
            </TabsContent>

            {/* ===== ABA ENDEREÇO ===== */}
            <TabsContent value="endereco" className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs font-medium text-muted-foreground">Logradouro</Label>
                  <Input value={form.logradouro ?? ""} onChange={e => set("logradouro", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Número</Label>
                  <Input value={form.numero ?? ""} onChange={e => set("numero", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Complemento</Label>
                  <Input value={form.complemento ?? ""} onChange={e => set("complemento", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Bairro</Label>
                  <Input value={form.bairro ?? ""} onChange={e => set("bairro", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Cidade</Label>
                  <Input value={form.cidade ?? ""} onChange={e => set("cidade", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">UF</Label>
                  <Input value={form.estado ?? ""} onChange={e => set("estado", e.target.value)} maxLength={2} placeholder="PE" className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">CEP</Label>
                  <Input value={form.cep ?? ""} onChange={e => set("cep", e.target.value)} placeholder="00000-000" className="bg-input mt-1" />
                </div>
              </div>
            </TabsContent>

            {/* ===== ABA PROFISSIONAL ===== */}
            <TabsContent value="profissional" className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Matrícula</Label>
                  <Input value={form.matricula ?? ""} onChange={e => set("matricula", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Status</Label>
                  <Select value={form.status ?? "Ativo"} onValueChange={v => set("status", v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYEE_STATUS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Cargo</Label>
                  <Input value={form.cargo ?? ""} onChange={e => set("cargo", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Função</Label>
                  <Input value={form.funcao ?? ""} onChange={e => set("funcao", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Setor / Obra</Label>
                  <Input value={form.setor ?? ""} onChange={e => set("setor", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Data de Admissão</Label>
                  <Input type="date" value={form.dataAdmissao ?? ""} onChange={e => set("dataAdmissao", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Salário Base (R$)</Label>
                  <Input value={form.salarioBase ?? ""} onChange={e => {
                    const salario = e.target.value;
                    set("salarioBase", salario);
                    const salarioNum = parseFloat(salario.replace(/\./g, "").replace(",", "."));
                    const horasNum = parseFloat(String(form.horasMensais || "220").replace(",", "."));
                    if (!isNaN(salarioNum) && salarioNum > 0 && !isNaN(horasNum) && horasNum > 0) {
                      set("valorHora", (salarioNum / horasNum).toFixed(2));
                    }
                  }} placeholder="2.500,00" className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Valor da Hora (R$)</Label>
                  <Input value={form.valorHora ?? ""} readOnly className="bg-input mt-1 opacity-70 cursor-not-allowed" title="Calculado automaticamente: Salário Base ÷ Horas Mensais" />
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">Calculado: Salário ÷ Horas</span>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Horas Mensais</Label>
                  <Input value={form.horasMensais ?? ""} onChange={e => {
                    const horas = e.target.value;
                    set("horasMensais", horas);
                    const salarioNum = parseFloat(String(form.salarioBase || "0").replace(/\./g, "").replace(",", "."));
                    const horasNum = parseFloat(horas.replace(",", "."));
                    if (!isNaN(salarioNum) && salarioNum > 0 && !isNaN(horasNum) && horasNum > 0) {
                      set("valorHora", (salarioNum / horasNum).toFixed(2));
                    }
                  }} placeholder="220" className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Tipo de Contrato</Label>
                  <Select value={form.tipoContrato || undefined} onValueChange={v => set("tipoContrato", v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
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
                  <Label className="text-xs font-medium text-muted-foreground">Jornada de Trabalho</Label>
                  <Input value={form.jornadaTrabalho ?? ""} onChange={e => set("jornadaTrabalho", e.target.value)} placeholder="08:00 às 17:00" className="bg-input mt-1" />
                </div>
              </div>
            </TabsContent>

            {/* ===== ABA BANCÁRIO ===== */}
            <TabsContent value="bancario" className="pt-4">
              <div className="space-y-5">
                {/* Conta para recebimento */}
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3">Conta para Recebimento (Folha/Vale)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Banco</Label>
                      <Select value={form.banco || undefined} onValueChange={v => set("banco", v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Caixa">Caixa Econômica Federal</SelectItem>
                          <SelectItem value="Santander">Santander</SelectItem>
                          <SelectItem value="Bradesco">Bradesco</SelectItem>
                          <SelectItem value="Itau">Itaú</SelectItem>
                          <SelectItem value="BB">Banco do Brasil</SelectItem>
                          <SelectItem value="Nubank">Nubank</SelectItem>
                          <SelectItem value="Inter">Inter</SelectItem>
                          <SelectItem value="C6">C6 Bank</SelectItem>
                          <SelectItem value="Outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.banco === "Outro" ? (
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground">Nome do Banco</Label>
                        <Input value={form.bancoNome ?? ""} onChange={e => set("bancoNome", e.target.value)} className="bg-input mt-1" />
                      </div>
                    ) : null}
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Agência</Label>
                      <Input value={form.agencia ?? ""} onChange={e => set("agencia", e.target.value)} className="bg-input mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Conta</Label>
                      <Input value={form.conta ?? ""} onChange={e => set("conta", e.target.value)} className="bg-input mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Tipo de Conta</Label>
                      <Select value={form.tipoConta || undefined} onValueChange={v => set("tipoConta", v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Corrente">Corrente</SelectItem>
                          <SelectItem value="Poupanca">Poupança</SelectItem>
                          <SelectItem value="Salario">Conta Salário</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Dados PIX */}
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3">Dados PIX</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Tipo de Chave PIX</Label>
                      <Select value={form.tipoChavePix || undefined} onValueChange={v => set("tipoChavePix", v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CPF">CPF</SelectItem>
                          <SelectItem value="Celular">Celular</SelectItem>
                          <SelectItem value="Email">E-mail</SelectItem>
                          <SelectItem value="Aleatoria">Chave Aleatória</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Chave PIX</Label>
                      <Input value={form.chavePix ?? ""} onChange={e => set("chavePix", e.target.value)} placeholder="Informe a chave PIX" className="bg-input mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Banco do PIX (se diferente)</Label>
                      <Input value={form.bancoPix ?? ""} onChange={e => set("bancoPix", e.target.value)} placeholder="Ex: Nubank, Inter..." className="bg-input mt-1" />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Observações */}
          <div className="pt-2">
            <Label className="text-xs font-medium text-muted-foreground">Observações</Label>
            <textarea
              value={form.observacoes ?? ""}
              onChange={e => set("observacoes", e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring mt-1"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
              {createMut.isPending || updateMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* VIEW DIALOG - FICHA DO COLABORADOR */}
      {/* ============================================================ */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] overflow-y-auto bg-card p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Ficha do Colaborador</DialogTitle>
          </DialogHeader>
          {viewingEmployee ? (
            <div className="space-y-8">
              {/* Header */}
              <div className="flex items-center gap-6 pb-6 border-b-2 border-primary/20">
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-3xl font-bold text-primary">
                    {viewingEmployee.nomeCompleto?.charAt(0)}
                  </span>
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold">{safeDisplay(viewingEmployee.nomeCompleto)}</h2>
                  <p className="text-base text-muted-foreground mt-1">
                    {safeDisplay(viewingEmployee.cargo)} · {safeDisplay(viewingEmployee.setor)}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-sm font-medium px-3 py-1 rounded ${statusColors[viewingEmployee.status] ?? ""}`}>
                      {statusLabels[viewingEmployee.status] ?? viewingEmployee.status}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Empresa: {getCompanyName(viewingEmployee.companyId)}
                    </span>
                  </div>
                </div>
              </div>

              {/* ALERTA LISTA NEGRA */}
              {viewingEmployee.status === "ListaNegra" ? (
                <div className="bg-red-600/10 border border-red-600/30 rounded-lg p-4 flex items-center gap-3">
                  <Ban className="h-6 w-6 text-red-600 shrink-0" />
                  <div>
                    <p className="font-bold text-red-600">FUNCIONÁRIO NA LISTA NEGRA</p>
                    <p className="text-sm text-red-500">Este funcionário está proibido de ser contratado novamente.</p>
                    {viewingEmployee.motivoListaNegra ? <p className="text-sm text-red-500 mt-1"><strong>Motivo:</strong> {safeDisplay(viewingEmployee.motivoListaNegra)}</p> : null}
                  </div>
                </div>
              ) : null}

              {/* Seções de dados */}
              {[
                { title: "Dados Pessoais", fields: [
                  ["CPF", safeDisplay(viewingEmployee.cpf)],
                  ["RG", safeDisplay(viewingEmployee.rg)],
                  ["Nascimento", formatDate(viewingEmployee.dataNascimento)],
                  ["Sexo", viewingEmployee.sexo === "M" ? "Masculino" : viewingEmployee.sexo === "F" ? "Feminino" : safeDisplay(viewingEmployee.sexo)],
                  ["Estado Civil", safeDisplay(viewingEmployee.estadoCivil)],
                  ["Nacionalidade", safeDisplay(viewingEmployee.nacionalidade)],
                  ["Naturalidade", safeDisplay(viewingEmployee.naturalidade)],
                  ["Celular", safeDisplay(viewingEmployee.celular)],
                  ["E-mail", safeDisplay(viewingEmployee.email)],
                  ["Nome da Mãe", safeDisplay(viewingEmployee.nomeMae)],
                  ["Nome do Pai", safeDisplay(viewingEmployee.nomePai)],
                  ["Contato Emergência", safeDisplay(viewingEmployee.contatoEmergencia)],
                  ["Tel. Emergência", safeDisplay(viewingEmployee.telefoneEmergencia)],
                ]},
                { title: "Profissional", fields: [
                  ["Matrícula", safeDisplay(viewingEmployee.matricula)],
                  ["Admissão", formatDate(viewingEmployee.dataAdmissao)],
                  ["Contrato", safeDisplay(viewingEmployee.tipoContrato)],
                  ["Jornada", safeDisplay(viewingEmployee.jornadaTrabalho)],
                  ["Salário Base", viewingEmployee.salarioBase ? `R$ ${viewingEmployee.salarioBase}` : "-"],
                  ["Valor da Hora", viewingEmployee.valorHora ? `R$ ${viewingEmployee.valorHora}` : "-"],
                  ["Horas/Mês", safeDisplay(viewingEmployee.horasMensais)],
                ]},
                { title: "Documentos", fields: [
                  ["CTPS", safeDisplay(viewingEmployee.ctps)],
                  ["Série CTPS", safeDisplay(viewingEmployee.serieCTPS)],
                  ["PIS", safeDisplay(viewingEmployee.pis)],
                  ["Título Eleitor", safeDisplay(viewingEmployee.tituloEleitor)],
                  ["Reservista", safeDisplay(viewingEmployee.certificadoReservista)],
                  ["CNH", safeDisplay(viewingEmployee.cnh)],
                  ["Cat. CNH", safeDisplay(viewingEmployee.categoriaCNH)],
                  ["Val. CNH", formatDate(viewingEmployee.validadeCNH)],
                ]},
                { title: "Endereço", fields: [
                  ["Logradouro", safeDisplay(viewingEmployee.logradouro)],
                  ["Nº", safeDisplay(viewingEmployee.numero)],
                  ["Complemento", safeDisplay(viewingEmployee.complemento)],
                  ["Bairro", safeDisplay(viewingEmployee.bairro)],
                  ["Cidade/UF", `${viewingEmployee.cidade ?? ""}${viewingEmployee.estado ? " - " + viewingEmployee.estado : ""}` || "-"],
                  ["CEP", safeDisplay(viewingEmployee.cep)],
                ]},
                { title: "Dados Bancários", fields: [
                  ["Banco", safeDisplay(viewingEmployee.banco)],
                  ["Agência", safeDisplay(viewingEmployee.agencia)],
                  ["Conta", safeDisplay(viewingEmployee.conta)],
                  ["Tipo Conta", safeDisplay(viewingEmployee.tipoConta)],
                  ["Tipo Chave PIX", safeDisplay(viewingEmployee.tipoChavePix)],
                  ["Chave PIX", safeDisplay(viewingEmployee.chavePix)],
                  ["Banco PIX", safeDisplay(viewingEmployee.bancoPix)],
                ]},
              ].map(section => (
                <div key={section.title}>
                  <h3 className="text-base font-semibold text-primary mb-4 pb-2 border-b-2 border-primary/20">{section.title}</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-4">
                    {section.fields.filter(([, v]) => v && v !== "-").map(([label, value]) => (
                      <div key={label as string} className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
                        <span className="text-sm font-semibold">{value as string}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {viewingEmployee.observacoes ? (
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-2">Observações</h3>
                  <p className="text-sm text-muted-foreground bg-secondary/30 rounded-lg p-3">{safeDisplay(viewingEmployee.observacoes)}</p>
                </div>
              ) : null}

              {/* HISTÓRICOS */}
              <EmployeeTrainingsSection employeeId={viewingEmployee.id} />
              <EmployeeASOsSection employeeId={viewingEmployee.id} companyId={companyId!} />
              <EmployeeWarningsSection employeeId={viewingEmployee.id} companyId={companyId!} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

// ============================================================
// COMPONENTES DE HISTÓRICO NA FICHA DO COLABORADOR
// ============================================================
function EmployeeTrainingsSection({ employeeId }: { employeeId: number }) {
  const { data: docs = [] } = trpc.trainingDocs.byEmployee.useQuery({ employeeId });
  return (
    <div>
      <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2 pb-1 border-b border-primary/20">
        <GraduationCap className="h-4 w-4" /> Treinamentos e Certificados
      </h3>
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum treinamento registrado</p>
      ) : (
        <div className="space-y-1">
          {docs.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between text-sm py-1 border-b border-border/50">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-blue-600" />
                <span>{safeDisplay(d.fileName)}</span>
              </div>
              <span className="text-muted-foreground text-xs">{formatDate(d.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeASOsSection({ employeeId, companyId }: { employeeId: number; companyId: number }) {
  const { data: asos = [] } = trpc.sst.asos.list.useQuery({ companyId });
  const empAsos = asos.filter((a: any) => a.employeeId === employeeId);
  return (
    <div>
      <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2 pb-1 border-b border-primary/20">
        <ShieldCheck className="h-4 w-4" /> ASOs
      </h3>
      {empAsos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum ASO registrado</p>
      ) : (
        <div className="space-y-1">
          {empAsos.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between text-sm py-1 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{safeDisplay(a.tipo)}</Badge>
                <span>{safeDisplay(a.clinica)}</span>
              </div>
              <div className="text-right flex items-center gap-2">
                <span className="text-muted-foreground text-xs">{formatDate(a.dataExame)}</span>
                {a.dataValidade && new Date(String(a.dataValidade)) < new Date() ? (
                  <Badge variant="destructive" className="text-xs">Vencido</Badge>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeWarningsSection({ employeeId, companyId }: { employeeId: number; companyId: number }) {
  const { data: warnings = [] } = trpc.sst.warnings.list.useQuery({ companyId });
  const empWarnings = warnings.filter((w: any) => w.employeeId === employeeId);
  return (
    <div>
      <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2 pb-1 border-b border-primary/20">
        <Scale className="h-4 w-4" /> Advertências
      </h3>
      {empWarnings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma advertência registrada</p>
      ) : (
        <div className="space-y-1">
          {empWarnings.map((w: any) => (
            <div key={w.id} className="flex items-center justify-between text-sm py-1 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${w.tipo === 'Suspensao' ? 'border-red-500 text-red-500' : w.tipo === 'Demissao' ? 'border-red-700 text-red-700' : ''}`}>
                  {safeDisplay(w.tipo)}
                </Badge>
                <span className="truncate max-w-[200px]">{safeDisplay(w.motivo)}</span>
              </div>
              <span className="text-muted-foreground text-xs">{formatDate(w.data)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
