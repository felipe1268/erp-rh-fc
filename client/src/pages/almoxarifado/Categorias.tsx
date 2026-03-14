import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tag, Loader2, Check, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Categoria = { id: number; nome: string; ordem: number | null; criadoEm: string };

export default function AlmoxarifadoCategorias() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const { data: categorias = [], refetch, isLoading } = trpc.compras.listarCategorias.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  const criarMut   = trpc.compras.criarCategoria.useMutation({ onSuccess: () => { toast.success("Categoria criada!"); refetch(); setShowNova(false); setNome(""); }, onError: (e) => toast.error(e.message) });
  const atualizarMut = trpc.compras.atualizarCategoria.useMutation({ onSuccess: () => { toast.success("Categoria atualizada!"); refetch(); setEditando(null); }, onError: (e) => toast.error(e.message) });
  const excluirMut = trpc.compras.excluirCategoria.useMutation({ onSuccess: () => { toast.success("Categoria excluída!"); refetch(); setExcluindo(null); }, onError: (e) => toast.error(e.message) });

  const [showNova, setShowNova]   = useState(false);
  const [nome, setNome]           = useState("");
  const [editando, setEditando]   = useState<Categoria | null>(null);
  const [nomeEdit, setNomeEdit]   = useState("");
  const [excluindo, setExcluindo] = useState<Categoria | null>(null);

  function abrirEditar(cat: Categoria) {
    setEditando(cat);
    setNomeEdit(cat.nome);
  }

  function salvarNova() {
    if (!nome.trim()) return;
    criarMut.mutate({ companyId, nome: nome.trim(), ordem: categorias.length });
  }

  function salvarEdicao() {
    if (!editando || !nomeEdit.trim()) return;
    atualizarMut.mutate({ id: editando.id, companyId, nome: nomeEdit.trim() });
  }

  return (
    <DashboardLayout moduleId="almoxarifado" activeItem="/almoxarifado/categorias">
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Tag className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Categorias do Almoxarifado</h1>
              <p className="text-sm text-gray-500">{categorias.length} categorias cadastradas</p>
            </div>
          </div>
          <Button onClick={() => { setShowNova(true); setNome(""); }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="w-4 h-4 mr-1" /> Nova Categoria
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          </div>
        ) : categorias.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma categoria cadastrada</p>
            <p className="text-sm mt-1">Clique em "Nova Categoria" para começar</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {categorias.map((cat, idx) => (
              <div key={cat.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group transition-colors">
                <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {idx + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-gray-800">{cat.nome}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                    onClick={() => abrirEditar(cat)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setExcluindo(cat)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal Nova Categoria */}
        <Dialog open={showNova} onOpenChange={setShowNova}>
          <DialogContent style={{ background: '#ffffff', color: '#111827' }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-600" /> Nova Categoria
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Categoria *</label>
                <Input
                  placeholder="Ex: Aglomerantes, EPIs, Ferramentas..."
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && salvarNova()}
                  autoFocus
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowNova(false)}>Cancelar</Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={salvarNova} disabled={!nome.trim() || criarMut.isPending}>
                  {criarMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                  Criar Categoria
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal Editar Categoria */}
        <Dialog open={!!editando} onOpenChange={v => !v && setEditando(null)}>
          <DialogContent style={{ background: '#ffffff', color: '#111827' }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-blue-600" /> Editar Categoria
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Categoria *</label>
                <Input
                  value={nomeEdit}
                  onChange={e => setNomeEdit(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && salvarEdicao()}
                  autoFocus
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditando(null)}>Cancelar</Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={salvarEdicao} disabled={!nomeEdit.trim() || atualizarMut.isPending}>
                  {atualizarMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                  Salvar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Alert Excluir */}
        <AlertDialog open={!!excluindo} onOpenChange={v => !v && setExcluindo(null)}>
          <AlertDialogContent style={{ background: '#ffffff', color: '#111827' }}>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Categoria</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir a categoria <strong>"{excluindo?.nome}"</strong>?
                Os itens que usam esta categoria não serão afetados, mas a categoria não estará mais disponível para seleção.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700"
                onClick={() => excluindo && excluirMut.mutate({ id: excluindo.id, companyId })}>
                {excluirMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
