import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Pencil, Trash2, Briefcase } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { useDefaultCompany } from "@/hooks/useDefaultCompany";

type FuncaoForm = { nome: string; descricao: string; cbo: string };
const emptyForm: FuncaoForm = { nome: "", descricao: "", cbo: "" };

export default function Funcoes() {
  const companiesQ = trpc.companies.list.useQuery();
  const companies = companiesQ.data ?? [];
  const { defaultCompanyId } = useDefaultCompany();
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedCompanyId && companies.length > 0) {
      const defId = defaultCompanyId ? Number(defaultCompanyId) : null;
      const match = companies.find((c: any) => c.id === defId);
      setSelectedCompanyId(match ? defId : companies[0].id);
    }
  }, [companies, defaultCompanyId, selectedCompanyId]);

  const companyId = selectedCompanyId ?? companies[0]?.id ?? 0;

  const funcoesQ = trpc.jobFunctions.list.useQuery({ companyId }, { enabled: !!companyId });
  const funcoes = funcoesQ.data ?? [];

  const createMut = trpc.jobFunctions.create.useMutation({ onSuccess: () => { funcoesQ.refetch(); setDialogOpen(false); toast.success("Função criada com sucesso!"); } });
  const updateMut = trpc.jobFunctions.update.useMutation({ onSuccess: () => { funcoesQ.refetch(); setDialogOpen(false); toast.success("Função atualizada!"); } });
  const deleteMut = trpc.jobFunctions.delete.useMutation({ onSuccess: () => { funcoesQ.refetch(); toast.success("Função excluída!"); } });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FuncaoForm>(emptyForm);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return funcoes;
    const s = search.toLowerCase();
    return funcoes.filter((f: any) => f.nome?.toLowerCase().includes(s) || (f.descricao || "").toLowerCase().includes(s) || (f.cbo || "").includes(s));
  }, [funcoes, search]);

  const openNew = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (fn: any) => {
    setEditingId(fn.id);
    setForm({ nome: fn.nome || "", descricao: fn.descricao || "", cbo: fn.cbo || "" });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.nome.trim()) { toast.error("Nome da função é obrigatório"); return; }
    if (editingId) {
      updateMut.mutate({ id: editingId, companyId, nome: form.nome, descricao: form.descricao || undefined, cbo: form.cbo || undefined });
    } else {
      createMut.mutate({ companyId, nome: form.nome, descricao: form.descricao || undefined, cbo: form.cbo || undefined });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir esta função?")) {
      deleteMut.mutate({ id, companyId });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Funções</h1>
            <p className="text-muted-foreground text-sm">Cadastro e gestão de funções/cargos</p>
          </div>
          <div className="flex items-center gap-3">
            {companies.length > 1 && (
              <Select value={String(companyId)} onValueChange={v => setSelectedCompanyId(Number(v))}>
                <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {companies.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nomeFantasia || c.razaoSocial}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button onClick={openNew} className="bg-[#1B2A4A] hover:bg-[#243660]">
              <Plus className="h-4 w-4 mr-2" /> Nova Função
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, CBO ou descrição..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-lg">Nenhuma função encontrada</h3>
              <p className="text-muted-foreground text-sm mt-1">Cadastre a primeira função.</p>
              <Button onClick={openNew} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                <Plus className="h-4 w-4 mr-2" /> Nova Função
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((fn: any) => (
              <Card key={fn.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-[#1B2A4A]/10 flex items-center justify-center shrink-0">
                        <Briefcase className="h-5 w-5 text-[#1B2A4A]" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base truncate">{fn.nome}</h3>
                        <div className="flex items-center gap-2">
                          {fn.cbo && <span className="text-xs text-muted-foreground font-mono">CBO: {fn.cbo}</span>}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${fn.isActive !== false ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                            {fn.isActive !== false ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {fn.descricao && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{fn.descricao}</p>
                  )}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                    <Button variant="outline" size="sm" onClick={() => openEdit(fn)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(fn.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Função" : "Nova Função"}</DialogTitle>
            <DialogDescription className="sr-only">Formulário de cadastro de função</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Função *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Pedreiro, Eletricista, Engenheiro..." />
            </div>
            <div>
              <Label>CBO</Label>
              <Input value={form.cbo} onChange={e => setForm(f => ({ ...f, cbo: e.target.value }))} placeholder="Ex: 7152-10" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} placeholder="Descrição da função (opcional)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
              {createMut.isPending || updateMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
