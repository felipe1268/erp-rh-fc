import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, Plus, Search, Edit, Trash2, Upload, FileText, CheckCircle, XCircle, Clock, ShieldCheck, Building2, HardHat } from "lucide-react";

export default function FuncionariosTerceiros() {
  const { user } = useAuth();
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const [search, setSearch] = useState("");
  const [filterEmpresa, setFilterEmpresa] = useState<string>("all");
  const [filterAptidao, setFilterAptidao] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"dados" | "documentos">("dados");
  const [form, setForm] = useState<any>({});

  const { data: funcionarios = [], refetch } = trpc.terceiros.funcionarios.list.useQuery(
    { companyId: companyId ?? 0, empresaTerceiraId: filterEmpresa !== "all" ? parseInt(filterEmpresa) : undefined },
    { enabled: !!companyId }
  );
  const { data: empresas = [] } = trpc.terceiros.empresas.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  const { data: obras = [] } = trpc.obras.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  const createMut = trpc.terceiros.funcionarios.create.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("Funcionário cadastrado!"); } });
  const updateMut = trpc.terceiros.funcionarios.update.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("Funcionário atualizado!"); } });
  const deleteMut = trpc.terceiros.funcionarios.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Funcionário excluído!"); } });
  const uploadMut = trpc.terceiros.funcionarios.uploadDoc.useMutation({ onSuccess: () => { refetch(); toast.success("Documento enviado!"); } });

  const filtered = useMemo(() => {
    let list = funcionarios;
    if (filterAptidao !== "all") list = list.filter((f: any) => f.statusAptidaoTerceiro === filterAptidao);
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter((f: any) =>
      f.nome?.toLowerCase().includes(s) ||
      f.cpf?.includes(s) ||
      f.funcao?.toLowerCase().includes(s)
    );
  }, [funcionarios, search, filterAptidao]);

  const openNew = () => {
    setForm({ companyId: companyId ?? 0 });
    setEditingId(null);
    setActiveTab("dados");
    setShowForm(true);
  };

  const openEdit = (func: any) => {
    setForm({ ...func });
    setEditingId(func.id);
    setActiveTab("dados");
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.nome || !form.empresaTerceiraId) { toast.error("Nome e Empresa são obrigatórios"); return; }
    if (editingId) {
      updateMut.mutate({ id: editingId, ...form });
    } else {
      createMut.mutate(form);
    }
  };

  const handleUpload = (field: string, funcId: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMut.mutate({ funcTerceiroId: funcId, field, fileName: file.name, fileBase64: base64, contentType: file.type });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const aptidaoBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; icon: any; label: string }> = {
      apto: { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle, label: "Apto" },
      inapto: { bg: "bg-red-100", text: "text-red-700", icon: XCircle, label: "Inapto" },
      pendente: { bg: "bg-amber-100", text: "text-amber-700", icon: Clock, label: "Pendente" },
    };
    const s = map[status] || map.pendente;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        <s.icon className="h-3 w-3" />{s.label}
      </span>
    );
  };

  const getEmpresaNome = (empresaId: number) => {
    const emp = empresas.find((e: any) => e.id === empresaId);
    return emp ? (emp as any).nomeFantasia || (emp as any).razaoSocial : "—";
  };

  return (
    <DashboardLayout>
      <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Funcionários Terceiros</h1>
              <p className="text-sm text-muted-foreground">{funcionarios.length} funcionário(s)</p>
            </div>
          </div>
          <Button onClick={openNew} className="bg-orange-500 hover:bg-orange-600">
            <Plus className="h-4 w-4 mr-1" /> Novo Funcionário
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, CPF ou função..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Empresas</SelectItem>
              {empresas.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nomeFantasia || e.razaoSocial}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterAptidao} onValueChange={setFilterAptidao}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Aptidão" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="apto">Aptos</SelectItem>
              <SelectItem value="inapto">Inaptos</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 rounded-lg p-3 text-center">
            <span className="text-2xl font-bold text-emerald-600">{funcionarios.filter((f: any) => f.statusAptidaoTerceiro === "apto").length}</span>
            <p className="text-xs text-emerald-700">Aptos</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <span className="text-2xl font-bold text-red-600">{funcionarios.filter((f: any) => f.statusAptidaoTerceiro === "inapto").length}</span>
            <p className="text-xs text-red-700">Inaptos</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <span className="text-2xl font-bold text-amber-600">{funcionarios.filter((f: any) => f.statusAptidaoTerceiro === "pendente").length}</span>
            <p className="text-xs text-amber-700">Pendentes</p>
          </div>
        </div>

        {/* List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum funcionário terceiro encontrado</p>
            </div>
          ) : (
            filtered.map((func: any) => (
              <div key={func.id} className="bg-card rounded-xl border p-4 hover:shadow-sm transition-shadow">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{func.nome}</h3>
                      {aptidaoBadge(func.statusAptidaoTerceiro)}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      {func.cpf && <span>CPF: {func.cpf}</span>}
                      {func.funcao && <span>| {func.funcao}</span>}
                      <span className="flex items-center gap-0.5"><Building2 className="h-3 w-3" />{getEmpresaNome(func.empresaTerceiraId)}</span>
                      {func.obraNome && <span className="flex items-center gap-0.5"><HardHat className="h-3 w-3" />{func.obraNome}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(func)}>
                      <Edit className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => {
                      if (confirm("Excluir este funcionário?")) deleteMut.mutate({ id: func.id });
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Form Dialog */}
      {showForm && (
        <FullScreenDialog
          open={showForm}
          onClose={() => setShowForm(false)}
          title={editingId ? "Editar Funcionário Terceiro" : "Novo Funcionário Terceiro"}
          headerColor="bg-orange-500"
        >
          <div className="max-w-4xl mx-auto p-4 space-y-6">
            {/* Tabs */}
            <div className="flex gap-2 border-b pb-2">
              {(["dados", "documentos"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab ? "bg-orange-500 text-white" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {tab === "dados" ? "Dados Pessoais" : "Documentos"}
                </button>
              ))}
            </div>

            {activeTab === "dados" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Empresa Terceira *</Label>
                    <Select value={form.empresaTerceiraId ? String(form.empresaTerceiraId) : ""} onValueChange={(v) => setForm({ ...form, empresaTerceiraId: parseInt(v) })}>
                      <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                      <SelectContent>
                        {empresas.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nomeFantasia || e.razaoSocial}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Nome Completo *</Label><Input value={form.nome || ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
                  <div><Label>CPF</Label><Input value={form.cpf || ""} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></div>
                  <div><Label>RG</Label><Input value={form.rg || ""} onChange={(e) => setForm({ ...form, rg: e.target.value })} /></div>
                  <div><Label>Data de Nascimento</Label><Input type="date" value={form.dataNascimento?.split("T")[0] || ""} onChange={(e) => setForm({ ...form, dataNascimento: e.target.value })} /></div>
                  <div><Label>Função</Label><Input value={form.funcao || ""} onChange={(e) => setForm({ ...form, funcao: e.target.value })} /></div>
                  <div><Label>Telefone</Label><Input value={form.telefone || ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
                  <div><Label>E-mail</Label><Input value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div>
                    <Label>Obra Alocada</Label>
                    <Select value={form.obraId ? String(form.obraId) : "none"} onValueChange={(v) => {
                      if (v === "none") { setForm({ ...form, obraId: null, obraNome: null }); return; }
                      const obra = obras.find((o: any) => o.id === parseInt(v));
                      setForm({ ...form, obraId: parseInt(v), obraNome: obra ? (obra as any).nome : "" });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem alocação</SelectItem>
                        {obras.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {editingId && (
                    <>
                      <div>
                        <Label>Status</Label>
                        <Select value={form.status || form.statusFuncTerceiro || "ativo"} onValueChange={(v) => setForm({ ...form, status: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ativo">Ativo</SelectItem>
                            <SelectItem value="inativo">Inativo</SelectItem>
                            <SelectItem value="afastado">Afastado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Aptidão</Label>
                        <Select value={form.statusAptidao || form.statusAptidaoTerceiro || "pendente"} onValueChange={(v) => setForm({ ...form, statusAptidao: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="apto">Apto</SelectItem>
                            <SelectItem value="inapto">Inapto</SelectItem>
                            <SelectItem value="pendente">Pendente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {activeTab === "documentos" && editingId && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Documentos do funcionário terceiro para controle de aptidão.</p>
                {[
                  { label: "ASO (Atestado de Saúde Ocupacional)", urlField: "asoUrl", validadeField: "asoValidade" },
                  { label: "Treinamentos NR", urlField: "treinamentoNrUrl", validadeField: "treinamentoNrValidade" },
                  { label: "Certificados", urlField: "certificadosUrl", validadeField: null },
                  { label: "Foto 3x4", urlField: "fotoUrl", validadeField: null },
                ].map((doc) => (
                  <div key={doc.urlField} className="bg-muted/50 rounded-lg p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="font-medium text-sm">{doc.label}</h4>
                        {form[doc.urlField] ? (
                          <a href={form[doc.urlField]} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1">
                            <FileText className="h-3 w-3" /> Ver documento
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground mt-1">Nenhum documento</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.validadeField && (
                          <Input
                            type="date"
                            className="w-40 text-xs"
                            value={form[doc.validadeField]?.split("T")[0] || ""}
                            onChange={(e) => {
                              setForm({ ...form, [doc.validadeField!]: e.target.value });
                              if (editingId) updateMut.mutate({ id: editingId, [doc.validadeField!]: e.target.value });
                            }}
                          />
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleUpload(doc.urlField, editingId!)}>
                          <Upload className="h-3.5 w-3.5 mr-1" /> Upload
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activeTab === "documentos" && !editingId && (
              <p className="text-sm text-muted-foreground text-center py-8">Salve o funcionário primeiro para gerenciar documentos.</p>
            )}

            {/* Save Button */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleSave} className="bg-orange-500 hover:bg-orange-600" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      )}
    </DashboardLayout>
  );
}
