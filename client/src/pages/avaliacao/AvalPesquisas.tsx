import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Plus, Search, FileText, Trash2, Edit2, Eye, Copy, Link2, ToggleLeft, ToggleRight } from "lucide-react";

export default function AvalPesquisas() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const utils = trpc.useUtils();

  const [searchTerm, setSearchTerm] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState<any>(null);

  // Form
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [perguntas, setPerguntas] = useState<{ texto: string; tipo: string; obrigatoria: boolean }[]>([]);

  const surveys = trpc.avaliacao.pesquisas.list.useQuery({ companyId }, { enabled: companyId > 0 || companyIds.length > 0 });
  const createMut = trpc.avaliacao.pesquisas.create.useMutation({
    onSuccess: () => { toast.success("Pesquisa criada"); utils.avaliacao.pesquisas.list.invalidate(); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const toggleMut = trpc.avaliacao.pesquisas.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado"); utils.avaliacao.pesquisas.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.avaliacao.pesquisas.delete.useMutation({
    onSuccess: () => { toast.success("Pesquisa excluída"); utils.avaliacao.pesquisas.list.invalidate(); setDeleteConfirm(null); },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() { setShowCreate(false); setEditId(null); setTitulo(""); setDescricao(""); setPerguntas([]); }

  function addPergunta() { setPerguntas([...perguntas, { texto: "", tipo: "nota_1_5", obrigatoria: true }]); }
  function removePergunta(idx: number) { setPerguntas(perguntas.filter((_, i) => i !== idx)); }
  function updatePergunta(idx: number, field: string, value: any) {
    setPerguntas(perguntas.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }

  const filtered = useMemo(() => {
    if (!surveys.data) return [];
    if (!searchTerm) return surveys.data;
    const term = searchTerm.toLowerCase();
    return surveys.data.filter((s: any) => s.titulo?.toLowerCase().includes(term));
  }, [surveys.data, searchTerm]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#0F172A]">Pesquisas Customizadas</h2>
        <Button size="sm" onClick={() => { resetForm(); setShowCreate(true); }}><Plus className="w-4 h-4 mr-1" /> Nova Pesquisa</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
        <Input placeholder="Buscar pesquisas..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
      </div>

      {surveys.isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[#94A3B8]"><FileText className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhuma pesquisa criada.</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s: any) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] transition-colors">
              <FileText className="w-5 h-5 text-[#1e3a5f] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#0F172A] truncate">{s.titulo}</p>
                <div className="flex items-center gap-2 text-xs text-[#64748B]">
                  <span>{s.totalPerguntas || 0} perguntas</span>
                  <span>•</span>
                  <span>{s.totalRespostas || 0} respostas</span>
                </div>
              </div>
              <Badge variant="secondary" className={s.status === 'ativa' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                {s.status === 'ativa' ? "Ativa" : s.status === 'encerrada' ? "Encerrada" : "Rascunho"}
              </Badge>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => toggleMut.mutate({ id: s.id, status: s.status === 'ativa' ? 'encerrada' : 'ativa' })}>
                  {s.status === 'ativa' ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-[#94A3B8]" />}
                </Button>
                {s.publicUrl && (
                  <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(window.location.origin + "/pesquisa/" + s.publicUrl); toast.success("Link copiado!"); }}>
                    <Copy className="w-4 h-4 text-[#64748B]" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => setDeleteConfirm(s.id)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={() => resetForm()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Pesquisa</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Título *</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Pesquisa de Satisfação" /></div>
            <div><Label>Descrição</Label><Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição da pesquisa..." rows={2} /></div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Perguntas ({perguntas.length})</Label>
                <Button size="sm" variant="outline" onClick={addPergunta}><Plus className="w-3 h-3 mr-1" /> Pergunta</Button>
              </div>
              <div className="space-y-3">
                {perguntas.map((p, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-[#E2E8F0] space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#94A3B8] w-6">{idx + 1}.</span>
                      <Input value={p.texto} onChange={(e) => updatePergunta(idx, "texto", e.target.value)} placeholder="Texto da pergunta" className="flex-1" />
                      <Button size="icon" variant="ghost" onClick={() => removePergunta(idx)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                    </div>
                    <div className="flex items-center gap-3 pl-8">
                      <Select value={p.tipo} onValueChange={(v) => updatePergunta(idx, "tipo", v)}>
                        <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nota_1_5">Nota 1-5</SelectItem>
                          <SelectItem value="sim_nao">Sim/Não</SelectItem>
                          <SelectItem value="texto_livre">Texto Livre</SelectItem>
                          <SelectItem value="multipla_escolha">Múltipla Escolha</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <Switch checked={p.obrigatoria} onCheckedChange={(v) => updatePergunta(idx, "obrigatoria", v)} />
                        <span className="text-xs text-[#64748B]">Obrigatória</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={() => {
              if (!titulo.trim()) { toast.error("Título obrigatório"); return; }
              if (perguntas.length === 0) { toast.error("Adicione ao menos uma pergunta"); return; }
              createMut.mutate({ companyId, titulo, descricao, questions: perguntas.map((p, i) => ({ texto: p.texto, ordem: i + 1, tipo: p.tipo === 'nota_1_5' ? 'nota' as const : p.tipo === 'texto_livre' ? 'texto' as const : p.tipo === 'sim_nao' ? 'sim_nao' as const : 'nota' as const, obrigatoria: p.obrigatoria })) });
            }} disabled={createMut.isPending}>
              {createMut.isPending ? "Criando..." : "Criar Pesquisa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir Pesquisa?</AlertDialogTitle><AlertDialogDescription>Todas as respostas serão perdidas.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteConfirm && deleteMut.mutate({ id: deleteConfirm })}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
