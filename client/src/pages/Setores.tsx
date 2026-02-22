import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Pencil, Trash2, Layers, ArrowLeft } from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

type SetorForm = { nome: string; descricao: string };
const emptyForm: SetorForm = { nome: "", descricao: "" };

export default function Setores() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
const setoresQ = trpc.sectors.list.useQuery({ companyId }, { enabled: !!companyId });
  const setores = setoresQ.data ?? [];

  const createMut = trpc.sectors.create.useMutation({ onSuccess: () => { setoresQ.refetch(); setDialogOpen(false); toast.success("Setor criado com sucesso!"); } });
  const updateMut = trpc.sectors.update.useMutation({ onSuccess: () => { setoresQ.refetch(); setDialogOpen(false); toast.success("Setor atualizado!"); } });
  const deleteMut = trpc.sectors.delete.useMutation({ onSuccess: () => { setoresQ.refetch(); toast.success("Setor excluído!"); } });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SetorForm>(emptyForm);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return setores;
    const s = search.toLowerCase();
    return setores.filter((st: any) => st.nome?.toLowerCase().includes(s) || (st.descricao || "").toLowerCase().includes(s));
  }, [setores, search]);

  const openNew = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (setor: any) => {
    setEditingId(setor.id);
    setForm({ nome: setor.nome || "", descricao: setor.descricao || "" });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.nome.trim()) { toast.error("Nome do setor é obrigatório"); return; }
    if (editingId) {
      updateMut.mutate({ id: editingId, companyId, nome: form.nome, descricao: form.descricao });
    } else {
      createMut.mutate({ companyId, nome: form.nome, descricao: form.descricao });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir este setor?")) {
      deleteMut.mutate({ id, companyId });
    }
  };

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Setores</h1>
            <p className="text-muted-foreground text-sm">Cadastro e gestão de setores</p>
          </div>
          <div className="flex items-center gap-3">
            <PrintActions title="Setores" />
            <Button onClick={openNew} className="bg-[#1B2A4A] hover:bg-[#243660]">
              <Plus className="h-4 w-4 mr-2" /> Novo Setor
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou descrição..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Layers className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-lg">Nenhum setor encontrado</h3>
              <p className="text-muted-foreground text-sm mt-1">Cadastre o primeiro setor.</p>
              <Button onClick={openNew} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                <Plus className="h-4 w-4 mr-2" /> Novo Setor
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((setor: any) => (
              <Card key={setor.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-[#1B2A4A]/10 flex items-center justify-center shrink-0">
                        <Layers className="h-5 w-5 text-[#1B2A4A]" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base truncate">{setor.nome}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${setor.isActive !== false ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                          {setor.isActive !== false ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </div>
                  </div>
                  {setor.descricao && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{setor.descricao}</p>
                  )}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                    <Button variant="outline" size="sm" onClick={() => openEdit(setor)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(setor.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <FullScreenDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingId ? "Editar Setor" : "Novo Setor"} icon={<Layers className="h-5 w-5 text-white" />}>
        <div className="w-full max-w-2xl">
          <div className="space-y-4">
            <div>
              <Label>Nome do Setor *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Administrativo, Obra, Financeiro..." />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} placeholder="Descrição do setor (opcional)" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
              {createMut.isPending || updateMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>
    </DashboardLayout>
  );
}
