import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Plus, Search, UserCheck, Trash2, Edit2, Shield, Users } from "lucide-react";

export default function AvalAvaliadores() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const utils = trpc.useUtils();

  const [searchTerm, setSearchTerm] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Form state
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState("");
  const [obraId, setObraId] = useState<string>("");
  const [ativo, setAtivo] = useState(true);
  const [userId, setUserId] = useState<string>("");

  const avaliadores = trpc.avaliacao.avaliadores.list.useQuery({ companyId }, { enabled: !!companyId });
  const obras = trpc.avaliacao.obras.listActive.useQuery({ companyId }, { enabled: !!companyId });

  const createMut = trpc.avaliacao.avaliadores.create.useMutation({
    onSuccess: () => { toast.success("Avaliador criado"); utils.avaliacao.avaliadores.list.invalidate(); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.avaliacao.avaliadores.update.useMutation({
    onSuccess: () => { toast.success("Avaliador atualizado"); utils.avaliacao.avaliadores.list.invalidate(); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.avaliacao.avaliadores.delete.useMutation({
    onSuccess: () => { toast.success("Avaliador excluído"); utils.avaliacao.avaliadores.list.invalidate(); setDeleteConfirm(null); },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setShowCreate(false); setEditId(null); setNome(""); setEmail(""); setCargo(""); setObraId(""); setAtivo(true); setUserId("");
  }

  function openEdit(av: any) {
    setEditId(av.id); setNome(av.nome); setEmail(av.email || ""); setCargo(av.cargo || ""); setObraId(av.obraId?.toString() || ""); setAtivo(av.ativo); setUserId(av.userId?.toString() || ""); setShowCreate(true);
  }

  function handleSubmit() {
    if (!nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (editId) {
      updateMut.mutate({ id: editId, nome: nome.trim(), email: email.trim(), obraId: obraId && obraId !== "all" ? parseInt(obraId) : undefined, userId: userId ? parseInt(userId) : undefined });
    } else {
      createMut.mutate({ companyId, nome: nome.trim(), email: email.trim(), obraId: obraId && obraId !== "all" ? parseInt(obraId) : undefined, userId: userId ? parseInt(userId) : undefined });
    }
  }

  const filtered = useMemo(() => {
    if (!avaliadores.data) return [];
    if (!searchTerm) return avaliadores.data;
    const term = searchTerm.toLowerCase();
    return avaliadores.data.filter((a: any) => a.nome?.toLowerCase().includes(term) || a.email?.toLowerCase().includes(term) || a.cargo?.toLowerCase().includes(term));
  }, [avaliadores.data, searchTerm]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#0F172A]">Avaliadores</h2>
        <Button size="sm" onClick={() => { resetForm(); setShowCreate(true); }}><Plus className="w-4 h-4 mr-1" /> Novo Avaliador</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
        <Input placeholder="Buscar por nome, email ou cargo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
      </div>

      {avaliadores.isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[#94A3B8]"><Users className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhum avaliador cadastrado.</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((av: any) => (
            <div key={av.id} className="flex items-center gap-3 p-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] transition-colors">
              <div className="w-10 h-10 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white font-bold text-sm shrink-0">
                {av.nome?.charAt(0)?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#0F172A] truncate">{av.nome}</p>
                <div className="flex items-center gap-2 text-xs text-[#64748B]">
                  {av.email && <span>{av.email}</span>}
                  {av.cargo && <><span>•</span><span>{av.cargo}</span></>}
                  {av.obraNome && <><span>•</span><span>{av.obraNome}</span></>}
                </div>
              </div>
              <Badge variant="secondary" className={av.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                {av.ativo ? "Ativo" : "Inativo"}
              </Badge>
              <span className="text-xs text-[#94A3B8]">{av.totalAvaliacoes || 0} aval.</span>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(av)}><Edit2 className="w-4 h-4 text-[#64748B]" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setDeleteConfirm(av.id)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate} onOpenChange={() => resetForm()}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Editar Avaliador" : "Novo Avaliador"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" /></div>
            <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@empresa.com" type="email" /></div>
            <div><Label>Cargo</Label><Input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex: Encarregado" /></div>
            <div>
              <Label>Obra (opcional)</Label>
              <Select value={obraId} onValueChange={setObraId}>
                <SelectTrigger><SelectValue placeholder="Todas as obras" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as obras</SelectItem>
                  {obras.data?.map((o: any) => <SelectItem key={o.id} value={o.id.toString()}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={ativo} onCheckedChange={setAtivo} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
              {(createMut.isPending || updateMut.isPending) ? "Salvando..." : editId ? "Atualizar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Avaliador?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteConfirm && deleteMut.mutate({ id: deleteConfirm })}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
