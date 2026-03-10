import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Plus, Search, TrendingUp, Trash2, Eye, ToggleLeft, ToggleRight, BarChart3, Building, Users, Shield } from "lucide-react";

const CLIMA_CATEGORIAS: Record<string, { label: string; icon: any; cor: string }> = {
  empresa: { label: "Empresa", icon: Building, cor: "text-blue-600" },
  gestao: { label: "Gestão", icon: Users, cor: "text-purple-600" },
  ambiente: { label: "Ambiente", icon: Shield, cor: "text-green-600" },
  seguranca: { label: "Segurança", icon: Shield, cor: "text-orange-600" },
  crescimento: { label: "Crescimento", icon: TrendingUp, cor: "text-emerald-600" },
};

export default function AvalClima() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const utils = trpc.useUtils();

  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [showResults, setShowResults] = useState<number | null>(null);

  // Form
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [perguntas, setPerguntas] = useState<{ texto: string; categoria: string }[]>([]);

  const surveys = trpc.avaliacao.clima.listSurveys.useQuery({ companyId }, { enabled: companyId > 0 || companyIds.length > 0 });
  const results = trpc.avaliacao.clima.getResults.useQuery({ surveyId: showResults || 0 }, { enabled: !!showResults });

  const createMut = trpc.avaliacao.clima.createSurvey.useMutation({
    onSuccess: () => { toast.success("Pesquisa de clima criada"); utils.avaliacao.clima.listSurveys.invalidate(); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const toggleMut = trpc.avaliacao.clima.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado"); utils.avaliacao.clima.listSurveys.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.avaliacao.clima.deleteSurvey.useMutation({
    onSuccess: () => { toast.success("Pesquisa excluída"); utils.avaliacao.clima.listSurveys.invalidate(); setDeleteConfirm(null); },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() { setShowCreate(false); setTitulo(""); setDescricao(""); setPerguntas([]); }
  function addPergunta() { setPerguntas([...perguntas, { texto: "", categoria: "empresa" }]); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#0F172A]">Clima Organizacional</h2>
        <Button size="sm" onClick={() => { resetForm(); setShowCreate(true); }}><Plus className="w-4 h-4 mr-1" /> Nova Pesquisa</Button>
      </div>

      {surveys.isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]" /></div>
      ) : surveys.data?.length === 0 ? (
        <div className="text-center py-12 text-[#94A3B8]"><TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhuma pesquisa de clima criada.</p></div>
      ) : (
        <div className="space-y-2">
          {surveys.data?.map((s: any) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] transition-colors">
              <BarChart3 className="w-5 h-5 text-[#1e3a5f] shrink-0" />
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
                <Button size="icon" variant="ghost" onClick={() => setShowResults(s.id)}><Eye className="w-4 h-4 text-[#64748B]" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setDeleteConfirm(s.id)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={() => resetForm()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Pesquisa de Clima</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Título *</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Pesquisa de Clima 2026" /></div>
            <div><Label>Descrição</Label><Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} /></div>
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
                      <Input value={p.texto} onChange={(e) => setPerguntas(perguntas.map((q, i) => i === idx ? { ...q, texto: e.target.value } : q))} placeholder="Texto da pergunta" className="flex-1" />
                      <Button size="icon" variant="ghost" onClick={() => setPerguntas(perguntas.filter((_, i) => i !== idx))}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                    </div>
                    <div className="pl-8">
                      <Select value={p.categoria} onValueChange={(v) => setPerguntas(perguntas.map((q, i) => i === idx ? { ...q, categoria: v } : q))}>
                        <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(CLIMA_CATEGORIAS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
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
              createMut.mutate({ companyId, titulo, descricao, questions: perguntas.map((p, i) => ({ texto: p.texto, categoria: p.categoria as any, ordem: i + 1 })) });
            }} disabled={createMut.isPending}>
              {createMut.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results Dialog */}
      <Dialog open={!!showResults} onOpenChange={() => setShowResults(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Resultados da Pesquisa</DialogTitle></DialogHeader>
          {results.isLoading ? (
            <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]" /></div>
          ) : !results.data ? (
            <p className="text-sm text-[#94A3B8] text-center py-6">Nenhum resultado disponível.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-[#1e3a5f]">{results.data.totalRespondentes}</p><p className="text-xs text-[#64748B]">Respostas</p></CardContent></Card>
                <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-green-600">{"—"}</p><p className="text-xs text-[#64748B]">Média Geral</p></CardContent></Card>
                <Card className="border-0 shadow-sm"><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-amber-600">{Object.values(results.data.byCategory).flat().length}</p><p className="text-xs text-[#64748B]">Perguntas</p></CardContent></Card>
              </div>
              {results.data.byCategory && Object.entries(results.data.byCategory).map(([cat, data]: [string, any]) => {
                const cfg = CLIMA_CATEGORIAS[cat] || { label: cat, cor: "text-gray-600" };
                return (
                  <Card key={cat} className="border-0 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className={`text-sm ${cfg.cor}`}>{cfg.label}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {data.perguntas?.map((p: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-3">
                            <span className="text-xs text-[#475569] flex-1">{p.texto}</span>
                            <div className="w-24 h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-[#1e3a5f]" style={{ width: `${(p.media / 5) * 100}%` }} />
                            </div>
                            <span className="text-xs font-bold text-[#1e3a5f] w-8 text-right">{p.media?.toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir Pesquisa de Clima?</AlertDialogTitle><AlertDialogDescription>Todas as respostas serão perdidas.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteConfirm && deleteMut.mutate({ id: deleteConfirm })}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
