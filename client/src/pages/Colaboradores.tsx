import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Users, Plus, Search, Pencil, Trash2, Eye, Ban, GraduationCap, ShieldCheck, Scale, FileText, Building2, AlertTriangle, Upload, HardHat, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { EMPLOYEE_STATUS } from "../../../shared/modules";
import { useDefaultCompany } from "@/hooks/useDefaultCompany";

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
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s + "T12:00:00");
    return d.toLocaleDateString("pt-BR");
  }
  return s;
}

export default function Colaboradores() {
  const { getInitialCompany } = useDefaultCompany();
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [blacklistAlert, setBlacklistAlert] = useState<string | null>(null);
  const [cpfDuplicateAlert, setCpfDuplicateAlert] = useState<string | null>(null);

  // Seleção múltipla
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: companies } = trpc.companies.list.useQuery();
  const companyId = selectedCompany ? parseInt(selectedCompany) : undefined;
  const { data: obras } = trpc.obras.list.useQuery({ companyId: companyId ?? 0 }, { enabled: !!companyId });

  // Import Excel
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (companies && companies.length > 0 && !selectedCompany) {
      setSelectedCompany(getInitialCompany(companies));
    }
  }, [companies, selectedCompany, getInitialCompany]);

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
  const deleteManyMut = trpc.employees.deleteMany.useMutation({
    onSuccess: (data) => {
      utils.employees.list.invalidate();
      utils.employees.stats.invalidate();
      setSelectedIds(new Set());
      setDeleteConfirmOpen(false);
      toast.success(`${data.deleted} colaborador(es) excluído(s)!`);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  // Verificação de lista negra
  const checkBlacklistMut = trpc.blacklist.check.useQuery(
    { cpf: form.cpf ?? "" },
    { enabled: !!(form.cpf && form.cpf.replace(/\D/g, "").length >= 11 && !editingId) }
  );

  // Verificação de CPF duplicado
  const cpfClean = useMemo(() => (form.cpf ?? "").replace(/\D/g, ""), [form.cpf]);
  const checkDuplicateCpf = trpc.employees.checkDuplicateCpf.useQuery(
    { cpf: cpfClean, excludeEmployeeId: editingId ?? undefined },
    { enabled: cpfClean.length >= 11 }
  );

  useEffect(() => {
    const d = checkBlacklistMut.data as any;
    if (d && d.status === "ListaNegra") {
      setBlacklistAlert(`⛔ ATENÇÃO: CPF encontrado na LISTA NEGRA! Funcionário "${d.nomeCompleto}" está proibido de ser contratado. Motivo: ${d.motivoListaNegra ?? "Não informado"}`);
    } else {
      setBlacklistAlert(null);
    }
  }, [checkBlacklistMut.data]);

  useEffect(() => {
    const duplicates = checkDuplicateCpf.data as any[];
    if (duplicates && duplicates.length > 0) {
      const msgs = duplicates.map((d: any) => `"${d.nomeCompleto}" na empresa ${d.empresa} (Status: ${statusLabels[d.status] ?? d.status})`);
      setCpfDuplicateAlert(`CPF já cadastrado no grupo: ${msgs.join("; ")}`);
    } else {
      setCpfDuplicateAlert(null);
    }
  }, [checkDuplicateCpf.data]);

  // Limpar seleção quando mudar empresa ou filtro
  useEffect(() => { setSelectedIds(new Set()); }, [selectedCompany, statusFilter, search]);

  const openNew = () => {
    setEditingId(null);
    setForm({ status: "Ativo", companyId: selectedCompany });
    setBlacklistAlert(null);
    setCpfDuplicateAlert(null);
    setDialogOpen(true);
  };

  const openEdit = (emp: any) => {
    setEditingId(emp.id);
    const f: Record<string, string> = {};
    const skipFields = ["createdAt", "updatedAt"];
    Object.entries(emp).forEach(([k, v]) => {
      if (v !== null && v !== undefined && !skipFields.includes(k)) {
        if (v instanceof Date) {
          f[k] = v.toISOString().split("T")[0];
        } else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
          f[k] = v.split("T")[0];
        } else if (typeof v !== "object") {
          f[k] = String(v);
        }
      }
    });
    if (!f.companyId && companyId) f.companyId = String(companyId);
    // Decompor jornadaTrabalho em campos separados (Entrada - Intervalo - Saída)
    if (f.jornadaTrabalho) {
      // Formato novo: "08:00 - 12:00 - 17:00" ou antigo "08:00 às 17:00" ou "44h semanais"
      const dashParts = f.jornadaTrabalho.split(" - ");
      const asParts = f.jornadaTrabalho.split(" às ");
      if (dashParts.length === 3) {
        f.jornadaEntrada = dashParts[0];
        f.jornadaIntervalo = dashParts[1];
        f.jornadaSaida = dashParts[2];
      } else if (asParts.length === 2 && asParts[0].includes(":")) {
        f.jornadaEntrada = asParts[0];
        f.jornadaSaida = asParts[1];
      }
      // Se não é formato reconhecido (ex: "44h semanais"), limpa
      if (!f.jornadaEntrada) {
        delete f.jornadaTrabalho;
      }
    }
    // Normalizar sexo antigo ("masculino"/"feminino" minúsculo) para "M"/"F"
    if (f.sexo) {
      const sexoMap: Record<string, string> = { masculino: "M", feminino: "F", m: "M", f: "F" };
      f.sexo = sexoMap[f.sexo.toLowerCase()] || f.sexo;
    }
    setForm(f);
    setCpfDuplicateAlert(null);
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
    // Bloquear se CPF duplicado (exceto edição do mesmo)
    if (cpfDuplicateAlert && !editingId) {
      toast.error("Não é possível cadastrar: " + cpfDuplicateAlert);
      return;
    }
    const targetCompanyId = form.companyId ? parseInt(form.companyId) : companyId!;
    // Compor jornadaTrabalho a partir dos campos separados
    const jornadaParts = [form.jornadaEntrada, form.jornadaIntervalo, form.jornadaSaida].filter(Boolean);
    const jornadaStr = jornadaParts.length >= 2 ? jornadaParts.join(" - ") : "";
    if (editingId) {
      const { companyId: _cid, id: _id, createdAt: _ca, updatedAt: _ua, empresa: _emp, jornadaEntrada: _je, jornadaIntervalo: _ji, jornadaSaida: _js, ...data } = form;
      // Tratar obraAtualId "none" como null
      if (data.obraAtualId === "none") data.obraAtualId = "" as any;
      // Limpar valores "none" dos selects
      Object.keys(data).forEach(k => { if ((data as any)[k] === "none") (data as any)[k] = ""; });
      (data as any).jornadaTrabalho = jornadaStr;
      updateMut.mutate({ id: editingId, companyId: targetCompanyId, data });
    } else {
      const { empresa: _emp, jornadaEntrada: _je, jornadaIntervalo: _ji, jornadaSaida: _js, ...createData } = form;
      if (createData.obraAtualId === "none") delete (createData as any).obraAtualId;
      Object.keys(createData).forEach(k => { if ((createData as any)[k] === "none") (createData as any)[k] = ""; });
      (createData as any).jornadaTrabalho = jornadaStr;
      createMut.mutate({ ...createData, companyId: targetCompanyId } as any);
    }
  };

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const getCompanyName = (cId: number) => {
    const c = companies?.find(c => c.id === cId);
    return c ? (c.nomeFantasia || c.razaoSocial) : "-";
  };

  // Seleção múltipla helpers
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (!employees) return;
    if (selectedIds.size === employees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(employees.map(e => e.id)));
    }
  };
  const isAllSelected = employees && employees.length > 0 && selectedIds.size === employees.length;
  const hasSelection = selectedIds.size > 0;

  const handleBulkDelete = () => {
    if (!companyId || selectedIds.size === 0) return;
    deleteManyMut.mutate({ ids: Array.from(selectedIds), companyId });
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
            <Button variant="outline" onClick={() => setImportDialogOpen(true)} disabled={!companyId} className="gap-2">
              <Upload className="h-4 w-4" /> Importar Excel
            </Button>
            <Button onClick={openNew} disabled={!companyId} className="gap-2">
              <Plus className="h-4 w-4" /> Novo
            </Button>
          </div>
        </div>

        {/* Barra de ações em massa */}
        {hasSelection ? (
          <div className="flex items-center gap-4 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
            <span className="text-sm font-medium text-destructive">
              {selectedIds.size} colaborador(es) selecionado(s)
            </span>
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Excluir Selecionados
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Limpar Seleção
            </Button>
          </div>
        ) : null}

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CPF, RG ou função..."
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
                  <th className="text-left px-3 py-3 w-10">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Selecionar todos"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">CPF</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Função</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Setor</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id} className={`border-t border-border hover:bg-secondary/30 transition-colors ${selectedIds.has(emp.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-3">
                      <Checkbox
                        checked={selectedIds.has(emp.id)}
                        onCheckedChange={() => toggleSelect(emp.id)}
                        aria-label={`Selecionar ${emp.nomeCompleto}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">{emp.nomeCompleto}</td>
                    <td className="px-4 py-3 text-muted-foreground">{emp.cpf ? emp.cpf.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{emp.funcao ?? "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{emp.setor ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded ${statusColors[emp.status] ?? ""}`}>
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
      {/* CONFIRMAÇÃO DE EXCLUSÃO EM MASSA */}
      {/* ============================================================ */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão em Massa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{selectedIds.size}</strong> colaborador(es)?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteManyMut.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============================================================ */}
      {/* FORM DIALOG - CADASTRO / EDIÇÃO */}
      {/* ============================================================ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="!max-w-7xl w-[95vw] max-h-[95vh] overflow-y-auto bg-card p-4 sm:p-6 lg:p-8">
          <DialogHeader>
            <DialogTitle className="text-xl">{editingId ? "Editar Colaborador" : "Novo Colaborador"}</DialogTitle>
            <DialogDescription className="sr-only">Formulário de cadastro e edição de colaborador</DialogDescription>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
                  <Label className="text-xs font-medium text-muted-foreground">Nome Completo *</Label>
                  <Input value={form.nomeCompleto ?? ""} onChange={e => set("nomeCompleto", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">CPF *</Label>
                  <Input
                    value={form.cpf ?? ""}
                    onChange={e => set("cpf", e.target.value)}
                    placeholder="000.000.000-00"
                    className={`bg-input mt-1 ${blacklistAlert || cpfDuplicateAlert ? "border-red-600 ring-1 ring-red-600" : ""}`}
                  />
                </div>
                {blacklistAlert ? (
                  <div className="sm:col-span-2 lg:col-span-3 bg-red-600/10 border border-red-600/30 rounded-lg p-3 flex items-center gap-2">
                    <Ban className="h-5 w-5 text-red-600 shrink-0" />
                    <p className="text-sm font-medium text-red-600">{blacklistAlert}</p>
                  </div>
                ) : null}
                {cpfDuplicateAlert && !editingId ? (
                  <div className="sm:col-span-2 lg:col-span-3 bg-red-600/10 border border-red-600/30 rounded-lg p-3 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                    <p className="text-sm font-medium text-red-600">⛔ {cpfDuplicateAlert}. Cadastro bloqueado.</p>
                  </div>
                ) : null}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Data de Nascimento</Label>
                  <Input type="date" value={form.dataNascimento ?? ""} onChange={e => set("dataNascimento", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Sexo</Label>
                  <Select value={form.sexo || "none"} onValueChange={v => set("sexo", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione</SelectItem>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Feminino</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Estado Civil</Label>
                  <Select value={form.estadoCivil || "none"} onValueChange={v => set("estadoCivil", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione</SelectItem>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                <div className="sm:col-span-2">
                  <Label className="text-xs font-medium text-muted-foreground">CEP</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={form.cep ?? ""}
                      onChange={e => {
                        const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
                        const formatted = raw.length > 5 ? raw.slice(0, 5) + "-" + raw.slice(5) : raw;
                        set("cep", formatted);
                        if (raw.length === 8) {
                          fetch(`https://viacep.com.br/ws/${raw}/json/`)
                            .then(r => r.json())
                            .then(d => {
                              if (!d.erro) {
                                set("logradouro", d.logradouro || "");
                                set("bairro", d.bairro || "");
                                set("cidade", d.localidade || "");
                                set("estado", d.uf || "");
                                toast.success("Endereço encontrado!");
                              } else {
                                toast.error("CEP não encontrado");
                              }
                            })
                            .catch(() => toast.error("Erro ao buscar CEP"));
                        }
                      }}
                      placeholder="00000-000"
                      className="bg-input"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
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
              </div>
            </TabsContent>

            {/* ===== ABA PROFISSIONAL ===== */}
            <TabsContent value="profissional" className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
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
                  <Label className="text-xs font-medium text-muted-foreground">Função</Label>
                  <Input value={form.funcao ?? ""} onChange={e => set("funcao", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Setor</Label>
                  <Input value={form.setor ?? ""} onChange={e => set("setor", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><HardHat className="h-3.5 w-3.5" /> Obra Atual</Label>
                  <Select value={form.obraAtualId || "none"} onValueChange={v => set("obraAtualId", v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem obra vinculada</SelectItem>
                      {(obras ?? []).map((o: any) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.nome} {o.codigo ? `(${o.codigo})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Select value={form.tipoContrato || "none"} onValueChange={v => set("tipoContrato", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione</SelectItem>
                      <SelectItem value="CLT">CLT</SelectItem>
                      <SelectItem value="PJ">PJ</SelectItem>
                      <SelectItem value="Temporario">Temporário</SelectItem>
                      <SelectItem value="Estagio">Estágio</SelectItem>
                      <SelectItem value="Aprendiz">Aprendiz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Entrada</Label>
                  <Select value={form.jornadaEntrada || "none"} onValueChange={v => set("jornadaEntrada", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Horário</SelectItem>
                      {["05:00","06:00","07:00","07:30","08:00","08:30","09:00","10:00","11:00","12:00","13:00","14:00"].map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Intervalo</Label>
                  <Select value={form.jornadaIntervalo || "none"} onValueChange={v => set("jornadaIntervalo", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Horário</SelectItem>
                      {["11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00"].map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Saída</Label>
                  <Select value={form.jornadaSaida || "none"} onValueChange={v => set("jornadaSaida", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Horário</SelectItem>
                      {["12:00","13:00","14:00","15:00","16:00","17:00","17:30","18:00","19:00","20:00","21:00","22:00","23:00"].map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* ===== ABA BANCÁRIO ===== */}
            <TabsContent value="bancario" className="pt-4">
              <div className="space-y-5">
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3">Conta para Recebimento (Folha/Vale)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Banco</Label>
                      <Select value={form.banco || "none"} onValueChange={v => set("banco", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione o banco</SelectItem>
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
                      <Select value={form.tipoConta || "none"} onValueChange={v => set("tipoConta", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          <SelectItem value="Corrente">Corrente</SelectItem>
                          <SelectItem value="Poupanca">Poupança</SelectItem>
                          <SelectItem value="Salario">Conta Salário</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3">Dados PIX</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Tipo de Chave PIX</Label>
                      <Select value={form.tipoChavePix || "none"} onValueChange={v => set("tipoChavePix", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
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
            <Button
              onClick={handleSubmit}
              disabled={createMut.isPending || updateMut.isPending || (!editingId && !!cpfDuplicateAlert)}
            >
              {createMut.isPending || updateMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* VIEW DIALOG - FICHA DO COLABORADOR */}
      {/* ============================================================ */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="!max-w-6xl w-[95vw] max-h-[92vh] overflow-y-auto bg-card p-4 sm:p-6 lg:p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Ficha do Colaborador</DialogTitle>
            <DialogDescription className="sr-only">Visualização completa dos dados do colaborador</DialogDescription>
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
                    {safeDisplay(viewingEmployee.funcao)} · {safeDisplay(viewingEmployee.setor)}
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
                  ["CPF", viewingEmployee.cpf ? viewingEmployee.cpf.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "-"],
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
                  ["Função", safeDisplay(viewingEmployee.funcao)],
                  ["Setor", safeDisplay(viewingEmployee.setor)],
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
      {/* ============================================================ */}
      {/* IMPORT EXCEL DIALOG */}
      {/* ============================================================ */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) { setImportFile(null); setImportResult(null); } }}>
        <DialogContent className="!max-w-2xl w-[90vw] bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2"><Upload className="h-5 w-5" /> Importar Colaboradores via Excel</DialogTitle>
            <DialogDescription className="sr-only">Importar colaboradores a partir de planilha Excel</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-300 mb-2">
                <strong>Como funciona:</strong> Baixe a planilha modelo, preencha os dados dos colaboradores e faça o upload.
              </p>
              <Button variant="outline" size="sm" className="gap-2" onClick={async () => {
                try {
                  const res = await fetch(`/api/trpc/import.downloadTemplate?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`);
                  const json = await res.json();
                  const b64 = json?.result?.data?.json?.base64;
                  if (!b64) { toast.error("Erro ao gerar planilha"); return; }
                  const bin = atob(b64);
                  const arr = new Uint8Array(bin.length);
                  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                  const blob = new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = "modelo_colaboradores.xlsx"; a.click();
                  URL.revokeObjectURL(url);
                } catch { toast.error("Erro ao baixar planilha"); }
              }}>
                <Download className="h-4 w-4" /> Baixar Planilha Modelo
              </Button>
            </div>

            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                id="excel-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setImportFile(file);
                }}
              />
              <label htmlFor="excel-upload" className="cursor-pointer">
                <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">{importFile ? importFile.name : "Clique para selecionar o arquivo Excel"}</p>
                <p className="text-xs text-muted-foreground mt-1">Formatos aceitos: .xlsx, .xls</p>
              </label>
            </div>

            {importResult && (
              <div className={`rounded-lg p-4 ${importResult.errors?.length > 0 ? 'bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800' : 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'}`}>
                <p className="text-sm font-semibold mb-2">
                  Importados: {importResult.imported ?? 0} | Erros: {importResult.errors?.length ?? 0}
                </p>
                {importResult.errors?.length > 0 && (
                  <div className="max-h-40 overflow-y-auto">
                    {importResult.errors.map((err: any, i: number) => (
                      <p key={i} className="text-xs text-red-600 dark:text-red-400">Linha {err.row}: {err.error}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Fechar</Button>
            <Button
              disabled={!importFile || importing}
              onClick={async () => {
                if (!importFile || !companyId) return;
                setImporting(true);
                try {
                  const reader = new FileReader();
                  reader.onload = async (e) => {
                    try {
                      const base64 = (e.target?.result as string).split(',')[1];
                      const res = await fetch('/api/trpc/import.uploadExcel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ json: { companyId, fileBase64: base64, fileName: importFile.name } }),
                      });
                      const json = await res.json();
                      const result = json?.result?.data?.json ?? json?.result?.data ?? json;
                      setImportResult(result);
                      if (result.imported > 0) {
                        toast.success(`${result.imported} colaborador(es) importado(s)!`);
                        utils.employees.list.invalidate();
                        utils.employees.stats.invalidate();
                      }
                    } catch (err: any) {
                      toast.error('Erro ao importar: ' + err.message);
                    } finally {
                      setImporting(false);
                    }
                  };
                  reader.readAsDataURL(importFile);
                } catch (err: any) {
                  toast.error('Erro ao ler arquivo: ' + err.message);
                  setImporting(false);
                }
              }}
            >
              {importing ? "Importando..." : "Importar"}
            </Button>
          </DialogFooter>
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
