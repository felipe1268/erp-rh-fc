import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useDefaultCompany } from "@/hooks/useDefaultCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Briefcase, Search } from "lucide-react";

export default function Funcoes() {
  const { defaultCompanyId } = useDefaultCompany();
  const companiesQuery = trpc.companies.list.useQuery();
  const companies = companiesQuery.data ?? [];

  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const companyId = selectedCompanyId ?? (defaultCompanyId ? Number(defaultCompanyId) : null) ?? companies[0]?.id ?? null;

  const functionsQuery = trpc.jobFunctions.list.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );
  const jobFunctions = functionsQuery.data ?? [];

  const createMutation = trpc.jobFunctions.create.useMutation({
    onSuccess: () => { functionsQuery.refetch(); toast.success("Função criada com sucesso!"); setDialogOpen(false); resetForm(); },
    onError: (err) => toast.error("Erro: " + err.message),
  });
  const updateMutation = trpc.jobFunctions.update.useMutation({
    onSuccess: () => { functionsQuery.refetch(); toast.success("Função atualizada!"); setDialogOpen(false); resetForm(); },
    onError: (err) => toast.error("Erro: " + err.message),
  });
  const deleteMutation = trpc.jobFunctions.delete.useMutation({
    onSuccess: () => { functionsQuery.refetch(); toast.success("Função excluída!"); },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cbo, setCbo] = useState("");
  const [search, setSearch] = useState("");

  const resetForm = () => { setEditingId(null); setNome(""); setDescricao(""); setCbo(""); };

  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (fn: any) => {
    setEditingId(fn.id);
    setNome(fn.nome);
    setDescricao(fn.descricao || "");
    setCbo(fn.cbo || "");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!companyId) return;
    if (!nome.trim()) { toast.error("Nome da função é obrigatório"); return; }
    if (editingId) {
      updateMutation.mutate({ id: editingId, companyId, nome: nome.trim(), descricao: descricao.trim() || undefined, cbo: cbo.trim() || undefined });
    } else {
      createMutation.mutate({ companyId, nome: nome.trim(), descricao: descricao.trim() || undefined, cbo: cbo.trim() || undefined });
    }
  };

  const handleDelete = (id: number) => {
    if (!companyId) return;
    if (confirm("Tem certeza que deseja excluir esta função?")) {
      deleteMutation.mutate({ id, companyId });
    }
  };

  const filtered = jobFunctions.filter((f: any) =>
    f.nome.toLowerCase().includes(search.toLowerCase()) ||
    (f.descricao || "").toLowerCase().includes(search.toLowerCase()) ||
    (f.cbo || "").includes(search)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Funções</h1>
          <p className="text-muted-foreground text-sm">Cadastro e gestão de funções/cargos por empresa</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={companyId?.toString() || ""} onValueChange={(v) => setSelectedCompanyId(Number(v))}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Selecione a empresa" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c: any) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.nomeFantasia || c.razaoSocial}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="bg-[#1B2A4A] hover:bg-[#243656]">
            <Plus className="h-4 w-4 mr-2" /> Nova Função
          </Button>
        </div>
      </div>

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar função..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Briefcase className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">Nenhuma função encontrada</p>
          <p className="text-sm">Cadastre a primeira função desta empresa.</p>
          <Button onClick={openCreate} variant="outline" className="mt-4">
            <Plus className="h-4 w-4 mr-2" /> Nova Função
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nome</th>
                <th className="text-left px-4 py-3 font-medium">CBO</th>
                <th className="text-left px-4 py-3 font-medium">Descrição</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((fn: any) => (
                <tr key={fn.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{fn.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{fn.cbo || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fn.descricao || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${fn.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {fn.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(fn)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(fn.id)} title="Excluir" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Função" : "Nova Função"}</DialogTitle>
            <DialogDescription className="sr-only">Formulário de cadastro de função</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium">Nome *</label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Pedreiro, Eletricista, Engenheiro..." />
            </div>
            <div>
              <label className="text-sm font-medium">CBO</label>
              <Input value={cbo} onChange={(e) => setCbo(e.target.value)} placeholder="Ex: 7152-10" />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição opcional" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="bg-[#1B2A4A] hover:bg-[#243656]">
                {createMutation.isPending || updateMutation.isPending ? "Salvando..." : editingId ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
